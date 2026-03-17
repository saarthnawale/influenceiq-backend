// server.js  –  InfluenceIQ Pro Backend
// ─────────────────────────────────────────────────────────────
require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const rateLimit  = require("express-rate-limit");

// ── Route imports ────────────────────────────────────────────
const authRoutes        = require("./routes/auth");
const influencerRoutes  = require("./routes/influencers");
const eventRoutes       = require("./routes/events");
const trackingRoutes    = require("./routes/tracking");
const oauthRoutes       = require("./routes/oauth");

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiter – 200 requests per 15 minutes per IP
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Too many requests, please slow down." },
}));

// ── Health check ──────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString(), version: "1.0.0" });
});

// ── Routes ────────────────────────────────────────────────────
app.use("/auth",        authRoutes);       // POST /auth/register, /auth/login
app.use("/influencers", influencerRoutes); // GET/POST/PATCH/DELETE /influencers
app.use("/events",      eventRoutes);      // GET/POST /events, /events/leaderboard, /events/export/csv
app.use("/tracking",    trackingRoutes);   // /tracking/promo-codes, /tracking/utm-links
app.use("/oauth",       oauthRoutes);      // /oauth/instagram/connect, /oauth/tiktok/connect, etc.
// UTM Click redirect
app.get("/go/:id", async (req, res) => {
  const db = require("./db");
  try {
    const result = await db.query(
      "UPDATE utm_links SET clicks = clicks + 1 WHERE id = $1 RETURNING full_url",
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).send("Link not found");
    res.redirect(result.rows[0].full_url);
  } catch (err) {
    res.status(500).send("Error");
  }
});

// ── 404 handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ⚡ InfluenceIQ Backend running!
  ────────────────────────────────
  Local:   http://localhost:${PORT}
  Health:  http://localhost:${PORT}/health
  ────────────────────────────────
  Endpoints:
    POST   /auth/register
    POST   /auth/login
    GET    /influencers
    POST   /influencers
    GET    /events?from=2026-01-01&to=2026-03-16
    POST   /events
    GET    /events/leaderboard
    GET    /events/export/csv
    POST   /events/webhook
    GET    /tracking/promo-codes
    POST   /tracking/promo-codes
    GET    /tracking/utm-links
    POST   /tracking/utm-links
    GET    /oauth/instagram/connect
    GET    /oauth/tiktok/connect
    GET    /oauth/youtube/connect
  `);
});

module.exports = app;
