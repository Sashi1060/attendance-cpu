const crypto = require("crypto");

function timingSafeEqualStrings(a, b) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  if (bufferA.length !== bufferB.length) {
    // Compare against itself so the timing doesn't leak the length mismatch.
    crypto.timingSafeEqual(bufferA, bufferA);
    return false;
  }

  return crypto.timingSafeEqual(bufferA, bufferB);
}

function requireAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_KEY;

  if (!adminKey) {
    return res.status(500).json({ message: "Admin access is not configured." });
  }

  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token || !timingSafeEqualStrings(token, adminKey)) {
    return res.status(401).json({ message: "Admin authentication required." });
  }

  next();
}

module.exports = { requireAdmin, timingSafeEqualStrings };
