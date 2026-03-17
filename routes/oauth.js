// routes/oauth.js  –  Social platform OAuth 2.0 flows
// ─────────────────────────────────────────────────────────────
// HOW OAUTH WORKS (simple version):
//   1. Brand clicks "Connect" in the dashboard
//   2. We redirect them to the social platform's login page
//   3. They approve access
//   4. The platform redirects back to our /callback URL with a "code"
//   5. We exchange that code for an access_token
//   6. We store the access_token in the DB for that influencer
//   7. We use the token to pull their stats on a schedule
// ─────────────────────────────────────────────────────────────
const express = require("express");
const axios   = require("axios");
const db      = require("../db");
const auth    = require("../middleware/auth");

const router = express.Router();

// ════════════════════════════════════════════════
//  INSTAGRAM GRAPH API
//  Docs: https://developers.facebook.com/docs/instagram-api
// ════════════════════════════════════════════════

// Step 1 – Redirect brand to Instagram login
router.get("/instagram/connect", auth, (req, res) => {
  const params = new URLSearchParams({
    client_id:     process.env.INSTAGRAM_APP_ID,
    redirect_uri:  process.env.INSTAGRAM_REDIRECT_URI,
    scope:         "instagram_basic,instagram_manage_insights",
    response_type: "code",
    state:         req.brand.id,   // pass brand ID to link account on callback
  });
  res.redirect(`https://api.instagram.com/oauth/authorize?${params}`);
});

// Step 2 – Instagram redirects back here with ?code=...
router.get("/instagram/callback", async (req, res) => {
  const { code, state: brandId } = req.query;
  if (!code) return res.status(400).send("No code from Instagram.");

  try {
    // Exchange code for short-lived token
    const tokenRes = await axios.post("https://api.instagram.com/oauth/access_token", {
      client_id:     process.env.INSTAGRAM_APP_ID,
      client_secret: process.env.INSTAGRAM_APP_SECRET,
      grant_type:    "authorization_code",
      redirect_uri:  process.env.INSTAGRAM_REDIRECT_URI,
      code,
    }, { headers: { "Content-Type": "application/x-www-form-urlencoded" } });

    const { access_token, user_id } = tokenRes.data;

    // Exchange for long-lived token (valid 60 days)
    const longLived = await axios.get(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${process.env.INSTAGRAM_APP_SECRET}&access_token=${access_token}`
    );

    // Pull basic profile info
    const profile = await axios.get(
      `https://graph.instagram.com/me?fields=id,username,followers_count&access_token=${longLived.data.access_token}`
    );

    // Save token to DB (upsert by api_user_id)
    await db.query(
      `UPDATE influencers
          SET access_token     = $1,
              token_expires_at = NOW() + INTERVAL '60 days',
              api_user_id      = $2,
              followers        = $3,
              updated_at       = NOW()
        WHERE brand_id = $4 AND LOWER(handle) = LOWER($5)`,
      [longLived.data.access_token, user_id, profile.data.followers_count || 0, brandId, "@" + profile.data.username]
    );

    // Sync their latest metrics right away
    await syncInstagramMetrics(longLived.data.access_token, user_id, brandId);

    res.redirect(`${process.env.FRONTEND_URL}?connected=instagram`);
  } catch (err) {
    console.error("Instagram OAuth error:", err.response?.data || err.message);
    res.redirect(`${process.env.FRONTEND_URL}?error=instagram`);
  }
});

// ════════════════════════════════════════════════
//  TIKTOK FOR BUSINESS API
//  Docs: https://ads.tiktok.com/marketing_api/docs
// ════════════════════════════════════════════════

router.get("/tiktok/connect", auth, (req, res) => {
  const params = new URLSearchParams({
    client_key:    process.env.TIKTOK_APP_ID,
    redirect_uri:  process.env.TIKTOK_REDIRECT_URI,
    scope:         "user.info.basic,video.list",
    response_type: "code",
    state:         req.brand.id,
  });
  res.redirect(`https://www.tiktok.com/auth/authorize/?${params}`);
});

router.get("/tiktok/callback", async (req, res) => {
  const { code, state: brandId } = req.query;
  if (!code) return res.status(400).send("No code from TikTok.");

  try {
    const tokenRes = await axios.post("https://open-api.tiktok.com/oauth/access_token/", {
      client_key:    process.env.TIKTOK_APP_ID,
      client_secret: process.env.TIKTOK_APP_SECRET,
      code,
      grant_type:    "authorization_code",
    });

    const { access_token, open_id } = tokenRes.data.data;

    // Pull basic user info
    const userRes = await axios.post("https://open.tiktokapis.com/v2/user/info/", {
      fields: ["display_name","follower_count","profile_deep_link"]
    }, { headers: { Authorization: `Bearer ${access_token}` } });

    const user = userRes.data.data.user;

    await db.query(
      `UPDATE influencers
          SET access_token = $1, api_user_id = $2, followers = $3, updated_at = NOW()
        WHERE brand_id = $4 AND platform = 'TikTok'`,
      [access_token, open_id, user.follower_count || 0, brandId]
    );

    res.redirect(`${process.env.FRONTEND_URL}?connected=tiktok`);
  } catch (err) {
    console.error("TikTok OAuth error:", err.response?.data || err.message);
    res.redirect(`${process.env.FRONTEND_URL}?error=tiktok`);
  }
});

// ════════════════════════════════════════════════
//  YOUTUBE ANALYTICS API
//  Docs: https://developers.google.com/youtube/analytics
// ════════════════════════════════════════════════

router.get("/youtube/connect", auth, (req, res) => {
  const params = new URLSearchParams({
    client_id:     process.env.YOUTUBE_CLIENT_ID,
    redirect_uri:  process.env.YOUTUBE_REDIRECT_URI,
    response_type: "code",
    scope:         "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly",
    access_type:   "offline",   // gets a refresh_token so we can re-auth later
    state:         req.brand.id,
    prompt:        "consent",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get("/youtube/callback", async (req, res) => {
  const { code, state: brandId } = req.query;
  if (!code) return res.status(400).send("No code from YouTube.");

  try {
    const tokenRes = await axios.post("https://oauth2.googleapis.com/token", {
      client_id:     process.env.YOUTUBE_CLIENT_ID,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET,
      redirect_uri:  process.env.YOUTUBE_REDIRECT_URI,
      grant_type:    "authorization_code",
      code,
    });

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    // Pull channel info
    const channelRes = await axios.get("https://www.googleapis.com/youtube/v3/channels", {
      params: { part: "statistics,snippet", mine: true },
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const channel = channelRes.data.items?.[0];

    await db.query(
      `UPDATE influencers
          SET access_token     = $1,
              refresh_token    = $2,
              token_expires_at = NOW() + ($3 || ' seconds')::INTERVAL,
              api_user_id      = $4,
              followers        = $5,
              updated_at       = NOW()
        WHERE brand_id = $6 AND platform = 'YouTube'`,
      [access_token, refresh_token, expires_in, channel?.id, parseInt(channel?.statistics?.subscriberCount) || 0, brandId]
    );

    res.redirect(`${process.env.FRONTEND_URL}?connected=youtube`);
  } catch (err) {
    console.error("YouTube OAuth error:", err.response?.data || err.message);
    res.redirect(`${process.env.FRONTEND_URL}?error=youtube`);
  }
});

// ════════════════════════════════════════════════
//  MANUAL SYNC ENDPOINT (trigger on demand)
// ════════════════════════════════════════════════

router.post("/sync/:platform", auth, async (req, res) => {
  const { platform } = req.params;
  try {
    const influencers = await db.query(
      "SELECT * FROM influencers WHERE brand_id = $1 AND platform = $2 AND access_token IS NOT NULL",
      [req.brand.id, platform]
    );

    if (!influencers.rows.length)
      return res.status(404).json({ error: `No connected ${platform} influencers found.` });

    const results = [];
    for (const inf of influencers.rows) {
      if (platform === "Instagram") {
        await syncInstagramMetrics(inf.access_token, inf.api_user_id, req.brand.id);
        results.push({ influencer: inf.name, status: "synced" });
      }
      // TikTok and YouTube sync would be similar
    }

    res.json({ message: `${platform} sync complete.`, results });
  } catch (err) {
    console.error("Sync error:", err);
    res.status(500).json({ error: "Sync failed." });
  }
});

// ════════════════════════════════════════════════
//  HELPER: Sync Instagram metrics to DB
// ════════════════════════════════════════════════
async function syncInstagramMetrics(access_token, api_user_id, brandId) {
  try {
    // Get media insights
    const mediaRes = await axios.get(
      `https://graph.instagram.com/me/media?fields=like_count,comments_count,impressions,reach&access_token=${access_token}`
    );
    const media = mediaRes.data.data || [];

    const totalLikes    = media.reduce((s, m) => s + (m.like_count    || 0), 0);
    const totalComments = media.reduce((s, m) => s + (m.comments_count || 0), 0);
    const totalImpress  = media.reduce((s, m) => s + (m.impressions   || 0), 0);
    const totalReach    = media.reduce((s, m) => s + (m.reach         || 0), 0);
    const engRate       = media.length ? ((totalLikes + totalComments) / totalImpress * 100).toFixed(2) : 0;

    // Find influencer by api_user_id
    const inf = await db.query(
      "SELECT id FROM influencers WHERE api_user_id = $1 AND brand_id = $2",
      [api_user_id, brandId]
    );
    if (!inf.rows.length) return;

    await db.query(
      `INSERT INTO social_metrics
         (influencer_id, platform, total_likes, total_comments, total_impressions, total_reach, avg_engagement_rate, period_start, period_end)
       VALUES ($1, 'Instagram', $2, $3, $4, $5, $6, NOW()-INTERVAL '30 days', NOW())`,
      [inf.rows[0].id, totalLikes, totalComments, totalImpress, totalReach, engRate]
    );
  } catch (err) {
    console.error("Instagram metric sync error:", err.message);
  }
}

module.exports = router;
