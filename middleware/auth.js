// middleware/auth.js  –  Protect routes with JWT
const jwt = require("jsonwebtoken");

module.exports = function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided. Please log in." });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.brand = decoded; // { id, email, name }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
};
