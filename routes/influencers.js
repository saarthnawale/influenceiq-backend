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

module.exports = router;
