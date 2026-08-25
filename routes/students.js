const express = require("express");
const rateLimit = require("express-rate-limit");
const { body, param, validationResult } = require("express-validator");
const Student = require("../models/Student");

const router = express.Router();

const MOBILE_REGEX = /^\+?[0-9\s-]{7,15}$/;

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

router.get("/", async (req, res, next) => {
  try {
    const students = await Student.find().sort({ registeredAt: 1 });
    res.json(students);
  } catch (err) {
    next(err);
  }
});

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

router.post(
  "/:kid/check-in",
  writeLimiter,
  [param("kid").trim().notEmpty().isLength({ max: 40 })],
  handleValidation,
  async (req, res, next) => {
    try {
      const kid = req.params.kid.toUpperCase();
      const student = await Student.findOne({ kid });

      if (!student) {
        return res.status(404).json({ message: "Student not registered. Please register first." });
      }

      if (student.checkIn) {
        return res.status(200).json({
          message: `${student.studentName} has already checked in at ${student.checkIn.toISOString()}.`,
          alreadyCheckedIn: true,
          student
        });
      }

      student.checkIn = new Date();
      await student.save();

      return res.status(200).json({
        message: `Check-in successful for ${student.studentName}.`,
        alreadyCheckedIn: false,
        student
      });
    } catch (err) {
      next(err);
    }
  }
);

router.delete("/:kid", async (req, res, next) => {
  try {
    const kid = req.params.kid.trim().toUpperCase();
    const deleted = await Student.findOneAndDelete({ kid });

    if (!deleted) {
      return res.status(404).json({ message: "Student not found." });
    }

    res.status(200).json({ message: "Student record deleted." });
  } catch (err) {
    next(err);
  }
});

router.delete("/", async (req, res, next) => {
  try {
    await Student.deleteMany({});
    res.status(200).json({ message: "All attendance data has been cleared." });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
