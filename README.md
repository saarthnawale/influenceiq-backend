# ⚡ InfluenceIQ Pro – Backend API

A complete Node.js + Express + PostgreSQL backend for influencer attribution tracking.

---

## 🗂 File Structure

```
influenceiq-backend/
├── server.js              ← Main entry point (start here)
├── package.json           ← Dependencies list
├── .env.example           ← Copy this to .env and fill in your values
├── db/
│   ├── index.js           ← Database connection pool
│   ├── schema.sql         ← All tables (run once to set up DB)
│   └── setup.js           ← Auto-runs schema.sql for you
├── middleware/
│   └── auth.js            ← JWT login protection
└── routes/
    ├── auth.js            ← /auth/register, /auth/login
    ├── influencers.js     ← CRUD for influencers + their stats
    ├── events.js          ← Log conversions, leaderboard, CSV export
    ├── tracking.js        ← Promo codes + UTM links
    └── oauth.js           ← Instagram, TikTok, YouTube OAuth flows
```

---

## 🚀 Setup in 5 Steps

### Step 1 – Install Node.js
Download from: https://nodejs.org (choose the LTS version)

### Step 2 – Get a Free PostgreSQL Database
Go to **https://neon.tech** → Sign up free → Create a project called `influenceiq`
Copy the **connection string** — it looks like:
```
postgresql://username:password@host.neon.tech/influenceiq?sslmode=require
```

### Step 3 – Configure your environment
```bash
# In the influenceiq-backend folder, copy the example file
cp .env.example .env

# Open .env and fill in:
# DB_HOST, DB_USER, DB_PASSWORD, DB_NAME  (from Neon or your local Postgres)
# JWT_SECRET  (any long random string)
# Leave the social API keys blank for now
```

### Step 4 – Install & set up database
```bash
# Open a terminal in the influenceiq-backend folder
npm install          # installs all packages (takes ~1 minute)
npm run db:setup     # creates all database tables
```

### Step 5 – Start the server
```bash
npm run dev          # starts with auto-reload on file changes
# OR
npm start            # starts normally
```

✅ Server running at http://localhost:4000
✅ Test it: http://localhost:4000/health

---

## 📡 API Reference

### Authentication
```
POST /auth/register     { name, email, password }  → { token, brand }
POST /auth/login        { email, password }         → { token, brand }
```
All other routes need: `Authorization: Bearer <token>` header

### Influencers
```
GET    /influencers                 → list all with stats
POST   /influencers                 → add influencer { name, handle, platform, ... }
GET    /influencers/:id             → single influencer + stats + metrics
PATCH  /influencers/:id             → update fields
DELETE /influencers/:id             → soft delete
```

### Conversion Events
```
GET  /events?from=2026-01-01&to=2026-03-16   → filtered events + summary
POST /events                                   → log an event manually
GET  /events/leaderboard?from=&to=            → ranked influencers
GET  /events/export/csv?from=&to=             → download CSV file
POST /events/webhook                           → receive events from your store
```

### Promo Codes
```
GET    /tracking/promo-codes        → all codes
POST   /tracking/promo-codes        → create { code, discount_type, discount_value, influencer_id }
PATCH  /tracking/promo-codes/:id    → toggle active, update limits
DELETE /tracking/promo-codes/:id    → delete
```

### UTM Links
```
GET  /tracking/utm-links              → all saved UTM links
POST /tracking/utm-links              → save a new link { base_url, utm_source, ... }
POST /tracking/utm-links/:id/click    → record a click
```

### Social API OAuth
```
GET /oauth/instagram/connect    → redirects to Instagram login
GET /oauth/instagram/callback   → Instagram sends user back here
GET /oauth/tiktok/connect       → redirects to TikTok login
GET /oauth/tiktok/callback      → TikTok sends user back here
GET /oauth/youtube/connect      → redirects to Google/YouTube login
GET /oauth/youtube/callback     → YouTube sends user back here
POST /oauth/sync/:platform      → manually trigger a data sync
```

---

## 🔌 Connecting Real Social APIs (one-time setup)

### Instagram Graph API
1. Go to https://developers.facebook.com/apps/
2. Create a new app → choose "Business" type
3. Add the "Instagram Graph API" product
4. Copy **App ID** and **App Secret** into `.env`
5. Add `http://localhost:4000/oauth/instagram/callback` as a redirect URI
6. Submit for review to get `instagram_manage_insights` permission (takes ~1 week)

### TikTok for Business API
1. Go to https://ads.tiktok.com/marketing_api/
2. Apply for developer access (takes 1-3 days)
3. Create an app, copy **App ID** and **App Secret**
4. Add redirect URI to your app settings

### YouTube Analytics API
1. Go to https://console.cloud.google.com/
2. Create a project → Enable "YouTube Data API v3" and "YouTube Analytics API"
3. Create OAuth 2.0 credentials
4. Copy **Client ID** and **Client Secret**
5. Add `http://localhost:4000/oauth/youtube/callback` to authorized redirect URIs

---

## 🛒 Shopify Webhook Integration (auto-track purchases)

Add this in Shopify Admin → Settings → Notifications → Webhooks:
- Event: **Order payment**
- URL: `https://your-backend.com/events/webhook`
- Format: JSON

Add to your `.env`:
```
WEBHOOK_SECRET=any_random_string_you_choose
```

Then in Shopify, set the same string as a custom header `x-webhook-secret`.

---

## 🚢 Deploy to Production (free options)

| Service | Free tier | How |
|---------|-----------|-----|
| **Railway** | $5/mo credit | Connect GitHub repo, auto-deploy |
| **Render** | 750 hrs/mo free | render.com → New Web Service |
| **Fly.io** | 3 shared VMs free | fly launch |

Database: Use **Neon** (free PostgreSQL) or **Supabase** (free PostgreSQL + dashboard)

---

## 🔒 Security Checklist

- [x] Passwords hashed with bcrypt
- [x] JWT tokens for authentication
- [x] Rate limiting (200 req/15min)
- [x] CORS restricted to your frontend URL
- [x] Social tokens stored in DB (encrypt with `crypto` in production)
- [ ] Add HTTPS (automatic on Railway/Render/Fly.io)
- [ ] Rotate JWT_SECRET every 90 days
- [ ] Set `NODE_ENV=production` on deployment

---

Built for InfluenceIQ Pro · Node.js 18+ · PostgreSQL 14+
