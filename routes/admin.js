const express = require("express");
const rateLimit = require("express-rate-limit");
const { timingSafeEqualStrings } = require("../middleware/requireAdmin");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again later." }
});

// Lets an admin panel verify a key before storing it, without exposing the
// key comparison logic to the browser.
router.post("/verify", loginLimiter, (req, res) => {
  const adminKey = process.env.ADMIN_KEY;

  if (!adminKey) {
    return res.status(500).json({ message: "Admin access is not configured." });
  }

  const { key } = req.body || {};

  if (typeof key !== "string" || !key) {
    return res.status(400).json({ message: "Admin key is required." });
  }

  if (!timingSafeEqualStrings(key, adminKey)) {
    return res.status(401).json({ message: "Invalid admin key." });
  }

  res.status(200).json({ valid: true });
});

module.exports = router;
