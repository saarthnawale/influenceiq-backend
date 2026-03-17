// routes/tracking.js  –  Promo codes + UTM links
const express = require("express");
const db      = require("../db");
const auth    = require("../middleware/auth");

const router = express.Router();
router.use(auth);

// ════════════════════════════════════════════════
//  PROMO CODES
// ════════════════════════════════════════════════

// GET /tracking/promo-codes
router.get("/promo-codes", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT pc.*, i.name AS influencer_name, i.handle, i.platform
         FROM promo_codes pc
         LEFT JOIN influencers i ON i.id = pc.influencer_id
        WHERE pc.brand_id = $1
        ORDER BY pc.created_at DESC`,
      [req.brand.id]
    );
    res.json({ promo_codes: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch promo codes." });
  }
});

// POST /tracking/promo-codes
router.post("/promo-codes", async (req, res) => {
  const { influencer_id, code, discount_type, discount_value, max_uses, expires_at } = req.body;
  if (!code || !discount_type || !discount_value)
    return res.status(400).json({ error: "code, discount_type and discount_value are required." });

  try {
    const result = await db.query(
      `INSERT INTO promo_codes (brand_id, influencer_id, code, discount_type, discount_value, max_uses, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.brand.id, influencer_id || null, code.toUpperCase(), discount_type, parseFloat(discount_value), max_uses || null, expires_at || null]
    );
    res.status(201).json({ promo_code: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Promo code already exists." });
    res.status(500).json({ error: "Failed to create promo code." });
  }
});

// PATCH /tracking/promo-codes/:id
router.patch("/promo-codes/:id", async (req, res) => {
  const { is_active, max_uses, expires_at } = req.body;
  try {
    const result = await db.query(
      `UPDATE promo_codes
          SET is_active = COALESCE($1, is_active),
              max_uses  = COALESCE($2, max_uses),
              expires_at = COALESCE($3, expires_at)
        WHERE id = $4 AND brand_id = $5
        RETURNING *`,
      [is_active, max_uses, expires_at, req.params.id, req.brand.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Promo code not found." });
    res.json({ promo_code: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to update promo code." });
  }
});

// DELETE /tracking/promo-codes/:id
router.delete("/promo-codes/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM promo_codes WHERE id = $1 AND brand_id = $2", [req.params.id, req.brand.id]);
    res.json({ message: "Promo code deleted." });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete promo code." });
  }
});

// ════════════════════════════════════════════════
//  UTM LINKS
// ════════════════════════════════════════════════

// GET /tracking/utm-links
router.get("/utm-links", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.*, i.name AS influencer_name, i.platform
         FROM utm_links u
         LEFT JOIN influencers i ON i.id = u.influencer_id
        WHERE u.brand_id = $1
        ORDER BY u.created_at DESC`,
      [req.brand.id]
    );
    res.json({ utm_links: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch UTM links." });
  }
});

// POST /tracking/utm-links  –  Save a generated UTM link
router.post("/utm-links", async (req, res) => {
  const { influencer_id, base_url, utm_source, utm_medium, utm_campaign, utm_content, utm_term } = req.body;
  if (!base_url) return res.status(400).json({ error: "base_url is required." });

  // Build the full URL server-side
  const url = new URL(base_url);
  if (utm_source)   url.searchParams.set("utm_source",   utm_source);
  if (utm_medium)   url.searchParams.set("utm_medium",   utm_medium);
  if (utm_campaign) url.searchParams.set("utm_campaign", utm_campaign);
  if (utm_content)  url.searchParams.set("utm_content",  utm_content);
  if (utm_term)     url.searchParams.set("utm_term",     utm_term);

  try {
    const result = await db.query(
      `INSERT INTO utm_links (brand_id, influencer_id, base_url, utm_source, utm_medium, utm_campaign, utm_content, utm_term, full_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.brand.id, influencer_id || null, base_url, utm_source, utm_medium, utm_campaign, utm_content, utm_term, url.toString()]
    );
    res.status(201).json({ utm_link: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to save UTM link." });
  }
});

// POST /tracking/utm-links/:id/click  –  Record a click (called from frontend redirect)
router.post("/utm-links/:id/click", async (req, res) => {
  try {
    const result = await db.query(
      "UPDATE utm_links SET clicks = clicks + 1 WHERE id = $1 RETURNING clicks",
      [req.params.id]
    );
    res.json({ clicks: result.rows[0]?.clicks });
  } catch (err) {
    res.status(500).json({ error: "Failed to record click." });
  }
});

module.exports = router;
