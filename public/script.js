const API_BASE = "/api/students";
const ADMIN_VERIFY_URL = "/api/admin/verify";
const ADMIN_KEY_STORAGE = "attendanceAdminKey";

const registrationForm = document.querySelector("#registrationForm");
const signInForm = document.querySelector("#signInForm");
const signOutForm = document.querySelector("#signOutForm");
const searchInput = document.querySelector("#searchInput");
const attendanceTableBody = document.querySelector("#attendanceTableBody");
const registrationMessage = document.querySelector("#registrationMessage");
const signInMessage = document.querySelector("#signInMessage");
const signOutMessage = document.querySelector("#signOutMessage");
const dashboardMessage = document.querySelector("#dashboardMessage");
const dashboardActions = document.querySelector("#dashboardActions");
const exportCsvButton = document.querySelector("#exportCsvButton");
const clearDataButton = document.querySelector("#clearDataButton");
const adminLockButton = document.querySelector("#adminLockButton");
const adminGate = document.querySelector("#adminGate");
const adminGateMessage = document.querySelector("#adminGateMessage");
const adminKeyInput = document.querySelector("#adminKeyInput");
const adminUnlockButton = document.querySelector("#adminUnlockButton");
const adminPanel = document.querySelector("#adminPanel");
const qrResult = document.querySelector("#qrResult");
const qrImage = document.querySelector("#qrImage");

const totalRegistered = document.querySelector("#totalRegistered");
const signedInCount = document.querySelector("#signedInCount");
const signedOutCount = document.querySelector("#signedOutCount");

let students = [];
let adminKey = sessionStorage.getItem(ADMIN_KEY_STORAGE) || "";

function normalizeKid(kid) {
  return kid.trim().toUpperCase();
}

function formatDisplayDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatCsvDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toISOString().replace("T", " ").slice(0, 19);
}

function showMessage(element, text, type) {
  element.textContent = text;
  element.className = `message ${type}`;
}

function clearMessage(element) {
  element.textContent = "";
  element.className = "message";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidMobileNumber(mobileNumber) {
  return /^\+?[0-9\s-]{7,15}$/.test(mobileNumber);
}

async function withDisabled(buttons, fn) {
  const targets = buttons.filter(Boolean);
  targets.forEach((button) => {
    button.disabled = true;
  });

  try {
    await fn();
  } finally {
    targets.forEach((button) => {
      button.disabled = false;
    });
  }
}

async function apiRequest(url, options = {}) {
  let response;

  try {
    response = await fetch(url, options);
  } catch {
    throw new Error("Unable to reach the server. Please check your connection and try again.");
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error((data && data.message) || "Something went wrong. Please try again.");
  }

  return data;
}

function adminHeaders() {
  return { Authorization: `Bearer ${adminKey}` };
}

// --- Registration ---------------------------------------------------------

function getRegistrationData() {
  const formData = new FormData(registrationForm);

  return {
    studentName: formData.get("studentName").trim(),
    kid: normalizeKid(formData.get("kid")),
    email: formData.get("email").trim().toLowerCase(),
    mobileNumber: formData.get("mobileNumber").trim()
  };
}

async function registerStudent(event) {
  event.preventDefault();
  clearMessage(registrationMessage);
  qrResult.hidden = true;

  const student = getRegistrationData();
  const submitButton = registrationForm.querySelector("button[type=submit]");

  if (!student.studentName || !student.kid || !student.email || !student.mobileNumber) {
    showMessage(registrationMessage, "Please fill in every required field.", "error");
    return;
  }

  if (!isValidEmail(student.email)) {
    showMessage(registrationMessage, "Please enter a valid student email address.", "error");
    return;
  }

  if (!isValidMobileNumber(student.mobileNumber)) {
    showMessage(registrationMessage, "Please enter a valid mobile number.", "error");
    return;
  }

  await withDisabled([submitButton], async () => {
    try {
      await apiRequest(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(student)
      });

      registrationForm.reset();
      showMessage(
        registrationMessage,
        `${student.studentName} registered successfully. You won't need to register again — use Sign In next time.`,
        "success"
      );
      qrImage.src = `${API_BASE}/${encodeURIComponent(student.kid)}/qrcode?t=${Date.now()}`;
      qrResult.hidden = false;
      await refreshDashboardIfUnlocked();
    } catch (error) {
      showMessage(registrationMessage, error.message, "error");
    }
  });
}

// --- Sign in / sign out -----------------------------------------------------

async function signStudentIn(event) {
  event.preventDefault();
  clearMessage(signInMessage);

  const kidInput = document.querySelector("#signInKid");
  const kid = kidInput.value.trim();
  const submitButton = signInForm.querySelector("button[type=submit]");

  if (!kid) {
    showMessage(signInMessage, "Please enter your KID.", "error");
    return;
  }

  await withDisabled([submitButton], async () => {
    try {
      const result = await apiRequest(`${API_BASE}/${encodeURIComponent(normalizeKid(kid))}/sign-in`, {
        method: "POST"
      });

      signInForm.reset();
      showMessage(signInMessage, result.message, result.alreadySignedIn ? "info" : "success");
      await refreshDashboardIfUnlocked();
    } catch (error) {
      showMessage(signInMessage, error.message, "error");
    }
  });
}

async function signStudentOut(event) {
  event.preventDefault();
  clearMessage(signOutMessage);

  const kidInput = document.querySelector("#signOutKid");
  const kid = kidInput.value.trim();
  const submitButton = signOutForm.querySelector("button[type=submit]");

  if (!kid) {
    showMessage(signOutMessage, "Please enter your KID.", "error");
    return;
  }

  await withDisabled([submitButton], async () => {
    try {
      const result = await apiRequest(`${API_BASE}/${encodeURIComponent(normalizeKid(kid))}/sign-out`, {
        method: "POST"
      });

      signOutForm.reset();
      showMessage(signOutMessage, result.message, result.alreadySignedOut ? "info" : "success");
      await refreshDashboardIfUnlocked();
    } catch (error) {
      showMessage(signOutMessage, error.message, "error");
    }
  });
}

// --- Admin gate --------------------------------------------------------------

function lockAdminPanel() {
  adminKey = "";
  sessionStorage.removeItem(ADMIN_KEY_STORAGE);
  students = [];
  adminGate.hidden = false;
  adminPanel.hidden = true;
  dashboardActions.hidden = true;
  adminKeyInput.value = "";
}

function unlockAdminPanel() {
  adminGate.hidden = true;
  adminPanel.hidden = false;
  dashboardActions.hidden = false;
}

async function verifyAndUnlock(key) {
  await apiRequest(ADMIN_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key })
  });

  adminKey = key;
  sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
  unlockAdminPanel();
  await loadStudents();
}

async function handleAdminUnlock() {
  clearMessage(adminGateMessage);
  const key = adminKeyInput.value.trim();

  if (!key) {
    showMessage(adminGateMessage, "Please enter the admin key.", "error");
    return;
  }

  await withDisabled([adminUnlockButton], async () => {
    try {
      await verifyAndUnlock(key);
    } catch (error) {
      showMessage(adminGateMessage, error.message, "error");
    }
  });
}

async function refreshDashboardIfUnlocked() {
  if (adminKey) {
    await loadStudents();
  }
}

// --- Dashboard -----------------------------------------------------------

async function loadStudents() {
  try {
    students = await apiRequest(API_BASE, { method: "GET", headers: adminHeaders() });
  } catch (error) {
    if (error.message.includes("Admin authentication")) {
      lockAdminPanel();
      showMessage(adminGateMessage, "Your admin session expired. Please enter the key again.", "error");
      return;
    }
    students = [];
    showMessage(dashboardMessage, error.message, "error");
  }

  renderDashboard();
}

function updateStatistics(list) {
  const signedIn = list.filter((student) => student.signInAt).length;
  const signedOut = list.filter((student) => student.signOutAt).length;

  totalRegistered.textContent = list.length;
  signedInCount.textContent = signedIn;
  signedOutCount.textContent = signedOut;
}

function getFilteredStudents(list) {
  const query = searchInput.value.trim().toLowerCase();

  if (!query) {
    return list;
  }

  return list.filter((student) => {
    return [student.studentName, student.kid, student.email, student.mobileNumber].some((value) =>
      String(value).toLowerCase().includes(query)
    );
  });
}

function renderTable(list) {
  const filteredStudents = getFilteredStudents(list);

  if (filteredStudents.length === 0) {
    attendanceTableBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">
          ${list.length === 0 ? "No students registered yet." : "No matching students found."}
        </td>
      </tr>
    `;
    return;
  }

  attendanceTableBody.innerHTML = filteredStudents
    .map(
      (student) => `
    <tr>
      <td>${escapeHtml(student.studentName)}</td>
      <td>${escapeHtml(student.kid)}</td>
      <td>${escapeHtml(student.email)}</td>
      <td>${escapeHtml(student.mobileNumber)}</td>
      <td>${escapeHtml(formatDisplayDateTime(student.registeredAt))}</td>
      <td class="${student.signInAt ? "" : "not-checked"}">${escapeHtml(formatDisplayDateTime(student.signInAt))}</td>
      <td class="${student.signOutAt ? "" : "not-checked"}">${escapeHtml(formatDisplayDateTime(student.signOutAt))}</td>
      <td>
        <button class="delete-button" type="button" data-kid="${escapeHtml(student.kid)}">Delete</button>
      </td>
    </tr>
  `
    )
    .join("");
}

function renderDashboard() {
  updateStatistics(students);
  renderTable(students);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  const escaped = text.replaceAll('"', '""');

  if (/[",\n\r]/.test(escaped)) {
    return `"${escaped}"`;
  }

  return escaped;
}

function exportCsv() {
  if (students.length === 0) {
    showMessage(dashboardMessage, "There are no attendance records to export.", "error");
    return;
  }

  const headers = [
    "Student Name",
    "KID",
    "Student Email",
    "Mobile Number",
    "Registration Time",
    "Sign-In Time",
    "Sign-Out Time"
  ];

  const rows = students.map((student) => [
    student.studentName,
    student.kid,
    student.email,
    student.mobileNumber,
    formatCsvDateTime(student.registeredAt),
    formatCsvDateTime(student.signInAt),
    formatCsvDateTime(student.signOutAt)
  ]);

  const csv = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `attendance-${date}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showMessage(dashboardMessage, "Attendance CSV export started.", "success");
}

async function clearAllData() {
  const confirmed = confirm("This will permanently delete all attendance data from the database. Continue?");

  if (!confirmed) {
    return;
  }

  await withDisabled([clearDataButton], async () => {
    try {
      await apiRequest(API_BASE, { method: "DELETE", headers: adminHeaders() });
      searchInput.value = "";
      showMessage(dashboardMessage, "All attendance data has been cleared.", "success");
      await loadStudents();
    } catch (error) {
      showMessage(dashboardMessage, error.message, "error");
    }
  });
}

async function deleteStudent(kid, button) {
  const student = students.find((item) => normalizeKid(item.kid) === normalizeKid(kid));
  const confirmed = confirm(`Delete ${student ? student.studentName : "this student"}'s attendance record?`);

  if (!confirmed) {
    return;
  }

  await withDisabled([button], async () => {
    try {
      await apiRequest(`${API_BASE}/${encodeURIComponent(normalizeKid(kid))}`, {
        method: "DELETE",
        headers: adminHeaders()
      });
      showMessage(dashboardMessage, `${student ? student.studentName : "Student"}'s record was deleted.`, "success");
      await loadStudents();
    } catch (error) {
      showMessage(dashboardMessage, error.message, "error");
    }
  });
}

registrationForm.addEventListener("submit", registerStudent);
signInForm.addEventListener("submit", signStudentIn);
signOutForm.addEventListener("submit", signStudentOut);
searchInput.addEventListener("input", renderDashboard);
exportCsvButton.addEventListener("click", exportCsv);
clearDataButton.addEventListener("click", clearAllData);
adminUnlockButton.addEventListener("click", handleAdminUnlock);
adminLockButton.addEventListener("click", lockAdminPanel);
adminKeyInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    handleAdminUnlock();
  }
});
attendanceTableBody.addEventListener("click", (event) => {
  const deleteButton = event.target.closest(".delete-button");

  if (deleteButton) {
    deleteStudent(deleteButton.dataset.kid, deleteButton);
  }
});

if (adminKey) {
  verifyAndUnlock(adminKey).catch(() => {
    lockAdminPanel();
  });
}
