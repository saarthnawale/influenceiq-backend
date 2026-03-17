// routes/auth.js  –  Brand register & login
const express  = require("express");
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");
const db       = require("../db");

const router = express.Router();

// ─── POST /auth/register ─────────────────────────────────────
// Create a new brand account
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: "name, email and password are required." });

  try {
    // Check if email already exists
    const exists = await db.query("SELECT id FROM brands WHERE email = $1", [email]);
    if (exists.rows.length)
      return res.status(409).json({ error: "An account with this email already exists." });

    const hashed = await bcrypt.hash(password, 10);
    const result = await db.query(
      "INSERT INTO brands (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email, plan, created_at",
      [name, email, hashed]
    );

    const brand = result.rows[0];
    const token = jwt.sign({ id: brand.id, email: brand.email, name: brand.name }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({ message: "Account created!", token, brand });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error during registration." });
  }
});

// ─── POST /auth/login ────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "email and password are required." });

  try {
    const result = await db.query("SELECT * FROM brands WHERE email = $1", [email]);
    const brand  = result.rows[0];

    if (!brand || !(await bcrypt.compare(password, brand.password)))
      return res.status(401).json({ error: "Invalid email or password." });

    const token = jwt.sign({ id: brand.id, email: brand.email, name: brand.name }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({ message: "Logged in!", token, brand: { id: brand.id, name: brand.name, email: brand.email, plan: brand.plan } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error during login." });
  }
});

module.exports = router;
