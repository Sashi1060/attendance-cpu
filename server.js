require("dotenv").config();

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const mongoose = require("mongoose");

const studentRoutes = require("./routes/students");
const adminRoutes = require("./routes/admin");

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const MONGO_URI = process.env.MONGO_URI;

// Railway/other PaaS run behind a reverse proxy; needed for correct client IPs in rate limiting.
app.set("trust proxy", 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

const devOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];

const allowedOrigins =
  NODE_ENV === "production"
    ? (process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    : devOrigins;

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin requests (frontend served by this app) and non-browser
      // tools with no Origin header are always allowed.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    }
  })
);

app.use(express.json({ limit: "20kb" }));
app.use(mongoSanitize());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});
app.use("/api", apiLimiter);

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/students", studentRoutes);
app.use("/api/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Not found." });
});

// Centralized error handler — must be the last middleware.
app.use((err, req, res, next) => {
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ message: "Origin not allowed." });
  }

  console.error(`[error] ${req.method} ${req.originalUrl}:`, err.name, err.message);

  res.status(err.status || 500).json({
    message: NODE_ENV === "production" ? "Something went wrong. Please try again later." : err.message
  });
});

if (!MONGO_URI) {
  console.error("MONGO_URI is not set. Configure it in your environment variables before starting the server.");
  process.exit(1);
}

if (!process.env.ADMIN_KEY) {
  console.warn("ADMIN_KEY is not set. Admin routes (roster, delete, clear-all) will return 500 until it is configured.");
}

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err.message);
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected.");
});

async function start() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB.");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} in ${NODE_ENV} mode.`);
    });
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  }
}

start();

async function shutdown(signal) {
  console.log(`${signal} received. Closing server gracefully.`);
  await mongoose.connection.close();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
