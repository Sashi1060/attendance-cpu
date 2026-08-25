const API_BASE = "/api/students";

const registrationForm = document.querySelector("#registrationForm");
const checkInForm = document.querySelector("#checkInForm");
const searchInput = document.querySelector("#searchInput");
const attendanceTableBody = document.querySelector("#attendanceTableBody");
const registrationMessage = document.querySelector("#registrationMessage");
const checkInMessage = document.querySelector("#checkInMessage");
const dashboardMessage = document.querySelector("#dashboardMessage");
const exportCsvButton = document.querySelector("#exportCsvButton");
const clearDataButton = document.querySelector("#clearDataButton");

const totalRegistered = document.querySelector("#totalRegistered");
const checkedInCount = document.querySelector("#checkedInCount");
const notCheckedInCount = document.querySelector("#notCheckedInCount");

let students = [];

function normalizeKid(kid) {
  return kid.trim().toUpperCase();
}

function formatDisplayDateTime(value) {
  if (!value) {
    return "Not Checked In";
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
    return "Not Checked In";
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

async function apiRequest(url, options) {
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

async function loadStudents() {
  try {
    students = await apiRequest(API_BASE, { method: "GET" });
  } catch (error) {
    students = [];
    showMessage(dashboardMessage, error.message, "error");
  }

  renderDashboard();
}

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
      showMessage(registrationMessage, `${student.studentName} registered successfully.`, "success");
      await loadStudents();
    } catch (error) {
      showMessage(registrationMessage, error.message, "error");
    }
  });
}

async function checkStudentIn(event) {
  event.preventDefault();
  clearMessage(checkInMessage);

  const kidInput = document.querySelector("#checkInKid");
  const kid = kidInput.value.trim();
  const submitButton = checkInForm.querySelector("button[type=submit]");

  if (!kid) {
    showMessage(checkInMessage, "Please enter your KID.", "error");
    return;
  }

  await withDisabled([submitButton], async () => {
    try {
      const result = await apiRequest(`${API_BASE}/${encodeURIComponent(normalizeKid(kid))}/check-in`, {
        method: "POST"
      });

      checkInForm.reset();
      showMessage(checkInMessage, result.message, result.alreadyCheckedIn ? "info" : "success");
      await loadStudents();
    } catch (error) {
      showMessage(checkInMessage, error.message, "error");
    }
  });
}

function updateStatistics(list) {
  const checkedIn = list.filter((student) => student.checkIn).length;

  totalRegistered.textContent = list.length;
  checkedInCount.textContent = checkedIn;
  notCheckedInCount.textContent = list.length - checkedIn;
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
        <td colspan="7" class="empty-state">
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
      <td class="${student.checkIn ? "" : "not-checked"}">${escapeHtml(formatDisplayDateTime(student.checkIn))}</td>
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

  const headers = ["Student Name", "KID", "Student Email", "Mobile Number", "Registration Time", "Check-In Time"];

  const rows = students.map((student) => [
    student.studentName,
    student.kid,
    student.email,
    student.mobileNumber,
    formatCsvDateTime(student.registeredAt),
    formatCsvDateTime(student.checkIn)
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
      await apiRequest(API_BASE, { method: "DELETE" });
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
      await apiRequest(`${API_BASE}/${encodeURIComponent(normalizeKid(kid))}`, { method: "DELETE" });
      showMessage(dashboardMessage, `${student ? student.studentName : "Student"}'s record was deleted.`, "success");
      await loadStudents();
    } catch (error) {
      showMessage(dashboardMessage, error.message, "error");
    }
  });
}

registrationForm.addEventListener("submit", registerStudent);
checkInForm.addEventListener("submit", checkStudentIn);
searchInput.addEventListener("input", renderDashboard);
exportCsvButton.addEventListener("click", exportCsv);
clearDataButton.addEventListener("click", clearAllData);
attendanceTableBody.addEventListener("click", (event) => {
  const deleteButton = event.target.closest(".delete-button");

  if (deleteButton) {
    deleteStudent(deleteButton.dataset.kid, deleteButton);
  }
});

loadStudents();
