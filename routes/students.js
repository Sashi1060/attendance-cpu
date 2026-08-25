const express = require("express");
const rateLimit = require("express-rate-limit");
const QRCode = require("qrcode");
const { body, param, validationResult } = require("express-validator");
const Student = require("../models/Student");
const { requireAdmin } = require("../middleware/requireAdmin");

const router = express.Router();

const MOBILE_REGEX = /^\+?[0-9\s-]{7,15}$/;
const KID_PARAM_VALIDATION = [param("kid").trim().notEmpty().isLength({ max: 40 })];

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down and try again shortly." }
});

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
  }
  next();
}

function buildQrPayload(kid) {
  const appUrl = (process.env.PUBLIC_APP_URL || "").replace(/\/+$/, "");
  return appUrl ? `${appUrl}/?kid=${encodeURIComponent(kid)}` : kid;
}

// Admin dashboard: full roster, requires the admin key.
router.get("/", requireAdmin, async (req, res, next) => {
  try {
    const students = await Student.find().sort({ registeredAt: 1 });
    res.json(students);
  } catch (err) {
    next(err);
  }
});

// Public: register a new student. One-time — returning students use sign-in.
router.post(
  "/",
  writeLimiter,
  [
    body("studentName")
      .trim()
      .notEmpty()
      .withMessage("Student name is required.")
      .isLength({ max: 100 })
      .withMessage("Student name is too long."),
    body("kid")
      .trim()
      .notEmpty()
      .withMessage("KID is required.")
      .isLength({ max: 40 })
      .withMessage("KID is too long."),
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required.")
      .isEmail()
      .withMessage("Please enter a valid student email address.")
      .isLength({ max: 254 })
      .withMessage("Email is too long."),
    body("mobileNumber")
      .trim()
      .notEmpty()
      .withMessage("Mobile number is required.")
      .matches(MOBILE_REGEX)
      .withMessage("Please enter a valid mobile number.")
      .isLength({ max: 20 })
      .withMessage("Mobile number is too long.")
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { studentName, kid, email, mobileNumber } = req.body;
      const student = await Student.create({
        studentName,
        kid: kid.toUpperCase(),
        email: email.toLowerCase(),
        mobileNumber
      });
      res.status(201).json(student);
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ message: "A student with this KID is already registered." });
      }
      next(err);
    }
  }
);

// Public: look up a single student by KID — used to greet a student after a
// QR scan or a manual KID entry, before they confirm sign-in/sign-out.
router.get("/:kid", KID_PARAM_VALIDATION, handleValidation, async (req, res, next) => {
  try {
    const kid = req.params.kid.toUpperCase();
    const student = await Student.findOne({ kid });

    if (!student) {
      return res.status(404).json({ message: "Student not registered. Please register first." });
    }

    res.json(student);
  } catch (err) {
    next(err);
  }
});

// Public: PNG QR code encoding a deep link (or bare KID) for this student.
router.get("/:kid/qrcode", KID_PARAM_VALIDATION, handleValidation, async (req, res, next) => {
  try {
    const kid = req.params.kid.toUpperCase();
    const student = await Student.findOne({ kid });

    if (!student) {
      return res.status(404).json({ message: "Student not registered. Please register first." });
    }

    const buffer = await QRCode.toBuffer(buildQrPayload(kid), { type: "png", width: 320, margin: 1 });
    res.set("Content-Type", "image/png");
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

router.post(
  "/:kid/sign-in",
  writeLimiter,
  KID_PARAM_VALIDATION,
  handleValidation,
  async (req, res, next) => {
    try {
      const kid = req.params.kid.toUpperCase();
      const student = await Student.findOne({ kid });

      if (!student) {
        return res.status(404).json({ message: "Student not registered. Please register first." });
      }

      if (student.signInAt) {
        return res.status(200).json({
          message: `${student.studentName} has already signed in at ${student.signInAt.toISOString()}.`,
          alreadySignedIn: true,
          student
        });
      }

      student.signInAt = new Date();
      await student.save();

      return res.status(200).json({
        message: `Sign-in successful for ${student.studentName}.`,
        alreadySignedIn: false,
        student
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/:kid/sign-out",
  writeLimiter,
  KID_PARAM_VALIDATION,
  handleValidation,
  async (req, res, next) => {
    try {
      const kid = req.params.kid.toUpperCase();
      const student = await Student.findOne({ kid });

      if (!student) {
        return res.status(404).json({ message: "Student not registered. Please register first." });
      }

      if (!student.signInAt) {
        return res.status(400).json({ message: `${student.studentName} must sign in before signing out.` });
      }

      if (student.signOutAt) {
        return res.status(200).json({
          message: `${student.studentName} has already signed out at ${student.signOutAt.toISOString()}.`,
          alreadySignedOut: true,
          student
        });
      }

      student.signOutAt = new Date();
      await student.save();

      return res.status(200).json({
        message: `Sign-out successful for ${student.studentName}.`,
        alreadySignedOut: false,
        student
      });
    } catch (err) {
      next(err);
    }
  }
);

router.delete("/:kid", requireAdmin, KID_PARAM_VALIDATION, handleValidation, async (req, res, next) => {
  try {
    const kid = req.params.kid.toUpperCase();
    const deleted = await Student.findOneAndDelete({ kid });

    if (!deleted) {
      return res.status(404).json({ message: "Student not found." });
    }

    res.status(200).json({ message: "Student record deleted." });
  } catch (err) {
    next(err);
  }
});

router.delete("/", requireAdmin, async (req, res, next) => {
  try {
    await Student.deleteMany({});
    res.status(200).json({ message: "All attendance data has been cleared." });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
