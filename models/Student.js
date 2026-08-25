const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    studentName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    kid: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 40,
      unique: true
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254
    },
    mobileNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20
    },
    registeredAt: {
      type: Date,
      default: Date.now
    },
    signInAt: {
      type: Date,
      default: null
    },
    signOutAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Student", studentSchema);
