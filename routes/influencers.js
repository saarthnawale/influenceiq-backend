// routes/influencers.js  –  Add, list, update, delete influencers
const express = require("express");
const db      = require("../db");
const auth    = require("../middleware/auth");

const router = express.Router();
// All routes require login
router.use(auth);

// ─── GET /influencers ────────────────────────────────────────
// List all influencers for the logged-in brand
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT i.*,
         COALESCE(SUM(CASE WHEN e.event_type = 'purchase' THEN 1 ELSE 0 END), 0)        AS total_customers,
         COALESCE(SUM(CASE WHEN e.event_type = 'purchase' THEN e.amount ELSE 0 END), 0) AS total_revenue,
         COUNT(e.id)                                                                      AS total_events
       FROM influencers i
       LEFT JOIN conversion_events e ON e.influencer_id = i.id
       WHERE i.brand_id = $1 AND i.is_active = TRUE
       GROUP BY i.id
       ORDER BY total_customers DESC`,
      [req.brand.id]
    );
    res.json({ influencers: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch influencers." });
  }
});

// ─── POST /influencers ───────────────────────────────────────
// Add a new influencer
router.post("/", async (req, res) => {
  const { name, handle, platform, category, tier, followers, profile_url } = req.body;
  if (!name || !handle || !platform)
    return res.status(400).json({ error: "name, handle and platform are required." });

  try {
    const result = await db.query(
      `INSERT INTO influencers (brand_id, name, handle, platform, category, tier, followers, profile_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [req.brand.id, name, handle, platform, category, tier, followers || 0, profile_url]
    );
    res.status(201).json({ influencer: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add influencer." });
  }
});

// ─── GET /influencers/:id ────────────────────────────────────
// Single influencer with full stats
router.get("/:id", async (req, res) => {
  try {
    const inf = await db.query(
      "SELECT * FROM influencers WHERE id = $1 AND brand_id = $2",
      [req.params.id, req.brand.id]
    );
    if (!inf.rows.length)
      return res.status(404).json({ error: "Influencer not found." });

    // Pull their conversion events summary
    const stats = await db.query(
      `SELECT
         COUNT(*)                                          AS total_events,
         SUM(CASE WHEN event_type='purchase' THEN 1 ELSE 0 END)        AS purchases,
         SUM(CASE WHEN event_type='purchase' THEN amount  ELSE 0 END)  AS revenue,
         SUM(CASE WHEN event_type='refund'   THEN amount  ELSE 0 END)  AS refunds,
         SUM(CASE WHEN event_type='signup'   THEN 1 ELSE 0 END)        AS signups,
         ROUND(AVG(amount) FILTER (WHERE event_type='purchase'), 2)    AS avg_order_value
       FROM conversion_events
       WHERE influencer_id = $1`,
      [req.params.id]
    );

    // Latest social metrics
    const metrics = await db.query(
      "SELECT * FROM social_metrics WHERE influencer_id = $1 ORDER BY synced_at DESC LIMIT 1",
      [req.params.id]
    );

    res.json({
      influencer: inf.rows[0],
      stats:      stats.rows[0],
      metrics:    metrics.rows[0] || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch influencer." });
  }
});

// ─── PATCH /influencers/:id ──────────────────────────────────
// Update influencer details
router.patch("/:id", async (req, res) => {
  const fields  = ["name","handle","platform","category","tier","followers","profile_url","is_active"];
  const updates = [];
  const values  = [];
  let i = 1;

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = $${i++}`);
      values.push(req.body[field]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: "Nothing to update." });

  updates.push(`updated_at = NOW()`);
  values.push(req.params.id, req.brand.id);

  try {
    const result = await db.query(
      `UPDATE influencers SET ${updates.join(", ")}
       WHERE id = $${i++} AND brand_id = $${i}
       RETURNING *`,
      values
    );
    if (!result.rows.length)
      return res.status(404).json({ error: "Influencer not found." });
    res.json({ influencer: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update influencer." });
  }
});

// ─── DELETE /influencers/:id ─────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    await db.query(
      "UPDATE influencers SET is_active = FALSE WHERE id = $1 AND brand_id = $2",
      [req.params.id, req.brand.id]
    );
    res.json({ message: "Influencer removed." });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove influencer." });
  }
});
// ─── GET /influencers/check-fake/:handle ─────────────────────
router.get("/check-fake/:handle", async (req, res) => {
  const handle = req.params.handle.replace("@", "");
  const token = process.env.APIFY_TOKEN;
  try {
    // Start Apify run
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directUrls: [`https://www.instagram.com/${handle}/`],
          resultsType: "details",
          resultsLimit: 1,
        }),
      }
    );
    const runData = await runRes.json();
    const runId = runData.data?.id;
    if (!runId) return res.status(500).json({ error: "Failed to start scraper." });

    // Poll for result (max 30 seconds)
    let profile = null;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const dataRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${token}`
      );
      const items = await dataRes.json();
      if (items.length > 0) { profile = items[0]; break; }
    }

    if (!profile) return res.status(404).json({ error: "Profile not found or scraper timed out." });

    const followers = profile.followersCount || 0;
    const following = profile.followingCount || 0;
    const posts = profile.postsCount || 0;
    const avgLikes = profile.latestPosts?.reduce((a, p) => a + (p.likesCount || 0), 0) / (profile.latestPosts?.length || 1);
    const avgComments = profile.latestPosts?.reduce((a, p) => a + (p.commentsCount || 0), 0) / (profile.latestPosts?.length || 1);
    const engRate = followers > 0 ? ((avgLikes + avgComments) / followers) * 100 : 0;

    let score = 100;
    let flags = [];
    if (engRate < 0.5) { score -= 40; flags.push("⚠️ Engagement rate below 0.5% — very suspicious"); }
    else if (engRate < 1) { score -= 20; flags.push("⚠️ Engagement rate below 1% — low"); }
    else flags

module.exports = router;
