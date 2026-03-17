// routes/events.js  –  Log & query conversion events
const express = require("express");
const db      = require("../db");
const auth    = require("../middleware/auth");

const router = express.Router();
router.use(auth);

// ─── GET /events ─────────────────────────────────────────────
// List events with optional filters + date range
router.get("/", async (req, res) => {
  const {
    from, to,
    influencer_id,
    event_type,
    attribution_source,
    country,
    page  = 1,
    limit = 50,
  } = req.query;

  const conditions = ["e.brand_id = $1"];
  const values     = [req.brand.id];
  let   idx        = 2;

  if (from)                { conditions.push(`e.event_date >= $${idx++}`); values.push(from); }
  if (to)                  { conditions.push(`e.event_date <= $${idx++}`); values.push(to); }
  if (influencer_id)       { conditions.push(`e.influencer_id = $${idx++}`); values.push(influencer_id); }
  if (event_type)          { conditions.push(`e.event_type = $${idx++}`); values.push(event_type); }
  if (attribution_source)  { conditions.push(`e.attribution_source = $${idx++}`); values.push(attribution_source); }
  if (country)             { conditions.push(`e.country = $${idx++}`); values.push(country); }

  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    // Total count for pagination
    const countRes = await db.query(
      `SELECT COUNT(*) FROM conversion_events e WHERE ${conditions.join(" AND ")}`,
      values
    );

    // Actual rows
    const rows = await db.query(
      `SELECT e.*,
              i.name  AS influencer_name,
              i.handle AS influencer_handle,
              i.platform
         FROM conversion_events e
         LEFT JOIN influencers i ON i.id = e.influencer_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY e.event_date DESC, e.created_at DESC
        LIMIT $${idx++} OFFSET $${idx}`,
      [...values, parseInt(limit), offset]
    );

    // Summary stats for the filtered window
    const summary = await db.query(
      `SELECT
         COUNT(*)                                                      AS total_events,
         SUM(CASE WHEN event_type='purchase' THEN 1    ELSE 0 END)    AS purchases,
         SUM(CASE WHEN event_type='purchase' THEN amount ELSE 0 END)  AS gross_revenue,
         SUM(CASE WHEN event_type='refund'   THEN amount ELSE 0 END)  AS refunds,
         SUM(CASE WHEN event_type='signup'   THEN 1    ELSE 0 END)    AS signups,
         SUM(amount)                                                   AS net_revenue,
         COUNT(DISTINCT influencer_id)                                 AS unique_influencers
       FROM conversion_events e
       WHERE ${conditions.join(" AND ")}`,
      values
    );

    res.json({
      events:     rows.rows,
      summary:    summary.rows[0],
      pagination: {
        total: parseInt(countRes.rows[0].count),
        page:  parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(parseInt(countRes.rows[0].count) / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch events." });
  }
});

// ─── POST /events ────────────────────────────────────────────
// Manually log a conversion event
router.post("/", async (req, res) => {
  const {
    influencer_id, event_type, amount = 0, currency = "USD",
    attribution_source, promo_code_used, customer_id,
    country, device, event_date, raw_payload,
  } = req.body;

  if (!event_type)
    return res.status(400).json({ error: "event_type is required." });

  try {
    // If a promo code is given, find it and increment uses
    let promo_code_id = null;
    if (promo_code_used) {
      const pc = await db.query(
        "SELECT id FROM promo_codes WHERE code = $1 AND brand_id = $2",
        [promo_code_used.toUpperCase(), req.brand.id]
      );
      if (pc.rows.length) {
        promo_code_id = pc.rows[0].id;
        await db.query("UPDATE promo_codes SET uses = uses + 1 WHERE id = $1", [promo_code_id]);
      }
    }

    const result = await db.query(
      `INSERT INTO conversion_events
         (brand_id, influencer_id, event_type, amount, currency,
          attribution_source, promo_code_id, promo_code_used,
          customer_id, country, device, event_date, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        req.brand.id, influencer_id || null, event_type, parseFloat(amount), currency,
        attribution_source || "manual", promo_code_id, promo_code_used?.toUpperCase() || null,
        customer_id || null, country || null, device || null,
        event_date || new Date().toISOString().slice(0, 10),
        raw_payload ? JSON.stringify(raw_payload) : null,
      ]
    );

    res.status(201).json({ event: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to log event." });
  }
});

// ─── POST /events/webhook ────────────────────────────────────
// Receive automatic events from your store (e.g. Shopify webhook)
// This endpoint does NOT require auth – use a shared webhook secret instead
router.post("/webhook", async (req, res) => {
  const webhookSecret = req.headers["x-webhook-secret"];
  if (webhookSecret !== process.env.WEBHOOK_SECRET)
    return res.status(401).json({ error: "Invalid webhook secret." });

  const { brand_id, influencer_id, event_type, amount, promo_code_used, customer_id, country } = req.body;

  try {
    let promo_code_id = null;
    if (promo_code_used) {
      const pc = await db.query(
        "SELECT id FROM promo_codes WHERE code = $1 AND brand_id = $2",
        [promo_code_used.toUpperCase(), brand_id]
      );
      if (pc.rows.length) {
        promo_code_id = pc.rows[0].id;
        await db.query("UPDATE promo_codes SET uses = uses + 1 WHERE id = $1", [promo_code_id]);
      }
    }

    await db.query(
      `INSERT INTO conversion_events
         (brand_id, influencer_id, event_type, amount, attribution_source,
          promo_code_id, promo_code_used, customer_id, country, raw_payload)
       VALUES ($1,$2,$3,$4,'webhook',$5,$6,$7,$8,$9)`,
      [brand_id, influencer_id || null, event_type, parseFloat(amount) || 0,
       promo_code_id, promo_code_used?.toUpperCase() || null, customer_id || null,
       country || null, JSON.stringify(req.body)]
    );

    res.json({ received: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Webhook processing failed." });
  }
});

// ─── GET /events/export/csv ──────────────────────────────────
// Export events as CSV
router.get("/export/csv", async (req, res) => {
  const { from, to, influencer_id } = req.query;
  const conditions = ["e.brand_id = $1"];
  const values     = [req.brand.id];
  let idx = 2;
  if (from) { conditions.push(`e.event_date >= $${idx++}`); values.push(from); }
  if (to)   { conditions.push(`e.event_date <= $${idx++}`); values.push(to); }
  if (influencer_id) { conditions.push(`e.influencer_id = $${idx++}`); values.push(influencer_id); }

  try {
    const rows = await db.query(
      `SELECT e.event_date, i.name AS influencer, i.platform,
              e.event_type, e.amount, e.currency,
              e.attribution_source, e.promo_code_used, e.country, e.device
         FROM conversion_events e
         LEFT JOIN influencers i ON i.id = e.influencer_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY e.event_date DESC`,
      values
    );

    const headers = ["Date","Influencer","Platform","Type","Amount","Currency","Source","PromoCode","Country","Device"];
    const csv = [
      headers.join(","),
      ...rows.rows.map(r =>
        [r.event_date, r.influencer, r.platform, r.event_type,
         r.amount, r.currency, r.attribution_source, r.promo_code_used || "",
         r.country || "", r.device || ""].map(v => `"${String(v ?? "").replace(/"/g,'""')}"`).join(",")
      ),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="events-${from||"all"}-${to||"all"}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: "CSV export failed." });
  }
});

// ─── GET /events/leaderboard ─────────────────────────────────
// Ranked influencers by customers/revenue within a date range
router.get("/leaderboard", async (req, res) => {
  const { from, to } = req.query;
  const conditions = ["e.brand_id = $1", "e.event_type = 'purchase'"];
  const values = [req.brand.id];
  let idx = 2;
  if (from) { conditions.push(`e.event_date >= $${idx++}`); values.push(from); }
  if (to)   { conditions.push(`e.event_date <= $${idx++}`); values.push(to); }

  try {
    const result = await db.query(
      `SELECT i.id, i.name, i.handle, i.platform, i.tier, i.followers,
              COUNT(e.id)   AS customers,
              SUM(e.amount) AS revenue,
              ROUND(AVG(e.amount), 2) AS avg_order_value
         FROM conversion_events e
         JOIN influencers i ON i.id = e.influencer_id
        WHERE ${conditions.join(" AND ")}
        GROUP BY i.id
        ORDER BY customers DESC`,
      values
    );
    res.json({ leaderboard: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Leaderboard query failed." });
  }
});

module.exports = router;
