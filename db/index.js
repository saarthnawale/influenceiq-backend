const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on("error", (err) => {
  console.error("Unexpected database error:", err);
});

pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("Database connection failed:", err.message);
  } else {
    console.log("Database connected at", res.rows[0].now);
  }
});

module.exports = pool;