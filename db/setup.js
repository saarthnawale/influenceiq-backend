// db/setup.js  –  Run once: node db/setup.js
const fs   = require("fs");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();

async function setup() {
  const pool = new Pool({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log("📦 Setting up InfluenceIQ database...");
    const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    await pool.query(sql);
    console.log("✅ Database schema created successfully!");
    console.log("👉 You can now run: npm run dev");
  } catch (err) {
    console.error("❌ Setup failed:", err.message);
  } finally {
    await pool.end();
  }
}

setup();
