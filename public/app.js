/* ==========================================================================
   PHS Security Hub — app.js v3
   Sections: auth · api helpers · theme · nav/routing · dashboard widgets ·
   reports (IR-01/DA-02) · key checkout (KC-03) · pass-down (PD-04) ·
   gates · post orders
   ========================================================================== */

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const CHUNK_BYTES = 3 * 1024 * 1024; // files above this upload in chunks

/* ---------------------------------------------------------------
   AUTH — individual officer logins (Auth0). If the server reports
   auth is not configured, the hub runs open with a warning banner.
   --------------------------------------------------------------- */

const auth = {
  enabled: false,
  client: null,
  officer: null, // { name, email }
  ready: false
};

async function initAuth() {
  try {
    const response = await fetch("/api/auth-config");
    const config = await response.json();

    if (!config.authEnabled) {
      auth.enabled = false;
      auth.ready = true;
      document.getElementById("authWarning").hidden = false;
      return;
    }

    auth.enabled = true;
    auth.client = await auth0.createAuth0Client({
      domain: config.domain,
      clientId: config.clientId,
      authorizationParams: {
        redirect_uri: window.location.origin,
        audience: config.audience
      },
      cacheLocation: "localstorage",
      useRefreshTokens: true
    });

    // Handle the redirect back from Auth0.
    if (window.location.search.includes("code=") && window.location.search.includes("state=")) {
      await auth.client.handleRedirectCallback();
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }

    if (await auth.client.isAuthenticated()) {
      const user = await auth.client.getUser();
      auth.officer = { name: user.name || user.nickname || user.email, email: user.email || "" };
      showSignedIn();
    } else {
      showLoginGate();
    }

    auth.ready = true;
  } catch (err) {
    console.error("Auth init failed:", err);
    const note = document.getElementById("loginNote");
    note.hidden = false;
    note.textContent = "Sign-in is unavailable: " + err.message;
    showLoginGate();
  }
}

function showLoginGate() {
  document.getElementById("loginGate").hidden = false;
}

function showSignedIn() {
  document.getElementById("loginGate").hidden = true;
  const chip = document.getElementById("userChip");
  chip.hidden = false;
  document.getElementById("userName").textContent = auth.officer?.name || "Officer";

  // Auto-fill and lock identity fields.
  const submittedBy = document.getElementById("submittedBy");
  const issuingOfficer = document.getElementById("issuingOfficer");
  if (auth.officer?.name) {
    submittedBy.value = auth.officer.name;
    submittedBy.readOnly = true;
    document.getElementById("submittedByHelper").hidden = false;
    issuingOfficer.value = auth.officer.name;
    issuingOfficer.readOnly = true;
    document.getElementById("issuingOfficerHelper").hidden = false;
  }
}

async function getAuthHeaders() {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (auth.enabled && auth.client) {
    try {
      const token = await auth.client.getTokenSilently();
      headers.Authorization = `Bearer ${token}`;
    } catch (err) {
      showLoginGate();
      throw new Error("Sign in to continue.");
    }
  }
  return headers;
}

document.getElementById("loginButton").addEventListener("click", async () => {
  if (auth.client) await auth.client.loginWithRedirect();
});

document.getElementById("logoutButton").addEventListener("click", () => {
  if (auth.client) auth.client.logout({ logoutParams: { returnTo: window.location.origin } });
});

/* ---------------------------------------------------------------
   API HELPERS
   --------------------------------------------------------------- */

async function apiGet(path) {
  const response = await fetch(path, { headers: await getAuthHeaders() });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function apiPost(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

const hubAction = (action, payload = {}) => apiPost("/api/hub-data", { action, ...payload });

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function localDateTimeParts(date = new Date()) {
  const pad = (v) => String(v).padStart(2, "0");
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`
  };
}

function friendlyTime(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function setStatus(kind, message) {
  const dotClass = kind === "good" ? "good" : kind === "bad" ? "bad" : "pending";
  document.getElementById("backendStatus").innerHTML =
    `<span class="status-dot ${dotClass}"></span><span>${escapeHtml(message)}</span>`;
}

/* ---------------------------------------------------------------
   THEME — night mode. Auto after dark (19:00–06:30), manual
   override via the ◐ button, remembered per device.
   --------------------------------------------------------------- */

function applyTheme() {
  const stored = localStorage.getItem("phs-theme"); // "dark" | "light" | null (auto)
  let dark;
  if (stored === "dark") dark = true;
  else if (stored === "light") dark = false;
  else {
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    dark = hour >= 19 || hour < 6.5;
  }
  document.body.classList.toggle("theme-dark", dark);
}

document.getElementById("themeToggle").addEventListener("click", () => {
  const nowDark = !document.body.classList.contains("theme-dark");
  localStorage.setItem("phs-theme", nowDark ? "dark" : "light");
  document.body.classList.toggle("theme-dark", nowDark);
});

applyTheme();
setInterval(applyTheme, 15 * 60 * 1000); // re-check the auto switch

/* ---------------------------------------------------------------
   NAV & VIEW ROUTING
   --------------------------------------------------------------- */

const VIEWS = {
  dashboard: { el: "view-dashboard", title: "Dashboard", sub: "Today at a glance: calendar, gates, keys, and advisories." },
  incident: { el: "view-reports", title: "Incident Report", sub: "Formal documentation for security, safety, conduct, and property incidents." },
  daily: { el: "view-reports", title: "Daily Activity Log", sub: "Quick officer entries for patrols, checks, assists, and events." },
  keys: { el: "view-keys", title: "Key Checkout", sub: "Vendor key and keycard checkouts, issue to return." },
  passdown: { el: "view-passdown", title: "Shift Pass-Down", sub: "What the next shift needs to know." },
  gates: { el: "view-gates", title: "Gate Access", sub: "Schedules and scheduled open/closed status for every gate." },
  postorders: { el: "view-postorders", title: "Post Orders", sub: "Standing orders, event orders, and general expectations." }
};

let currentView = "dashboard";

function route() {
  const hash = (window.location.hash || "#dashboard").slice(1);
  const view = VIEWS[hash] ? hash : "dashboard";
  currentView = view;

  Object.values(VIEWS).forEach(({ el: id }) => { document.getElementById(id).hidden = true; });
  document.getElementById(VIEWS[view].el).hidden = false;

  document.getElementById("heroTitle").textContent = VIEWS[view].title;
  document.getElementById("heroSub").textContent = VIEWS[view].sub;

  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.classList.toggle("active", link.dataset.nav === view);
  });

  document.getElementById("navLinks").classList.remove("open");
  document.getElementById("navToggle").setAttribute("aria-expanded", "false");

  if (view === "incident" || view === "daily") setMode(view === "daily" ? "daily" : "incident");
  if (view === "dashboard") loadDashboard();
  if (view === "keys") { setKeyDefaultTime(); loadOpenKeys("openKeysList"); }
  if (view === "passdown") loadPassdown("passdownList", 48);
  if (view === "gates") renderGates();
  if (view === "postorders") renderPostOrders();
}

window.addEventListener("hashchange", route);

document.getElementById("navToggle").addEventListener("click", () => {
  const links = document.getElementById("navLinks");
  const open = links.classList.toggle("open");
  document.getElementById("navToggle").setAttribute("aria-expanded", String(open));
});

/* ---------------------------------------------------------------
   STATIC DATA (locations, fallbacks) — unchanged from v2
   --------------------------------------------------------------- */

const fallbackDailyActivityTypes = [
  "Patrol Check", "Door / Gate Check", "Student Assist", "Staff Assist", "Visitor Assist",
  "Traffic / Driveline", "Event Coverage", "Alarm Check", "Unlock / Lockup", "Maintenance Notified", "Other"
];

const locationGroups = {
  "Ward Parkway / Upper Campus": {
    "Main Areas": [
      "The Bellis Athletic Center", "Grant Gym", "Beals Gym", "Hicks Field", "BAC Parking Lot",
      "Ref Parking Lot", "Centennial Loading Dock", "Centennial Hall", "Jordan Hall", "Upper School",
      "Upper School Commons", "Jordan Faculty Lot", "Boocock Middle", "Kemper Library", "Phillips Gym",
      "The Lawn", "Kroh Complex", "Hall Student Center", "Patterson Hall", "Boocock Parking Lot",
      "Senior Parking Lot", "Middle School Driveline", "Ward SOC", "Other"
    ],
    "Ward Gates": [
      "Boocock Gate", "Jordan Gate", "Art Gate", "Referee Gate", "Vehicle Gate", "Hicks Gate", "Bellis Gate"
    ]
  },
  "Wornall / Lower Campus": {
    "Main Areas": [
      "Early Childhood", "Founders Hall", "Dining Hall", "DeRamus Gym", "Intermediate Building",
      "Primary Building", "Primary Parking Lot", "Early Childhood Parking Lot", "Curry Theater",
      "Carriage House", "The Quad", "The Turf Field", "Secret Playground", "Gaga Playground",
      "Mellon Building", "Loose Park", "Early Childhood / Intermediate Driveline", "Wornall Security Kiosk"
    ],
    "Wornall Gates": [
      "Turf Field Gate", "EC Main Gate", "Wornall Main Gate", "DeRamus Gate", "Dock Gate",
      "Intermediate Gate", "Archives Gate", "51st Street Gate", "EC Side Gate"
    ]
  }
};

let reportTypes = {};
let metadata = { keyList: [], boloTypes: [], shifts: [] };
let currentMode = "incident";

/* ---------------------------------------------------------------
   ELEMENTS
   --------------------------------------------------------------- */

const el = (id) => document.getElementById(id);

const elements = {
  body: document.body,
  modeBadge: el("modeBadge"), sideTitle: el("sideTitle"), sideText: el("sideText"),
  guidanceList: el("guidanceList"), formTitle: el("formTitle"), formIntro: el("formIntro"),
  formMode: el("formMode"), reportType: el("reportType"), reportTypeDescription: el("reportTypeDescription"),
  activityType: el("activityType"), submittedBy: el("submittedBy"), priority: el("priority"),
  dateOfIncident: el("dateOfIncident"), timeOfIncident: el("timeOfIncident"),
  dateLabel: el("dateLabel"), timeLabel: el("timeLabel"),
  campus: el("campus"), locationSection: el("locationSection"), location: el("location"),
  building: el("building"), otherLocationWrap: el("otherLocationWrap"), otherLocation: el("otherLocation"),
  peopleChoices: Array.from(document.querySelectorAll("input[name='peopleInvolvedChoice']")),
  peopleEntriesWrap: el("peopleEntriesWrap"), peopleEntries: el("peopleEntries"),
  addPersonButton: el("addPersonButton"), personTemplate: el("personTemplate"),
  summary: el("summary"), summaryLabel: el("summaryLabel"), summaryHelper: el("summaryHelper"),
  actionTaken: el("actionTaken"),
  typeFeatureIcon: el("typeFeatureIcon"), typeFeatureTitle: el("typeFeatureTitle"),
  typeFeatureDescription: el("typeFeatureDescription"),
  form: el("reportForm"), result: el("resultBox"), submitButton: el("submitButton"),
  attachments: el("attachments"), fileList: el("fileList"), uploadZone: el("uploadZone"),
  attachmentStatus: el("attachmentStatus"),
  confirmCard: el("confirmCard"), confirmNumber: el("confirmNumber"), confirmMeta: el("confirmMeta")
};

/* ---------------------------------------------------------------
   METADATA
   --------------------------------------------------------------- */

function classificationCode(label) {
  return String(label || "")
    .split(/[\s/]+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 3) || "IR";
}

function populateReportTypes(types) {
  reportTypes = types || {};
  elements.reportType.innerHTML = `<option value="">Select report type</option>`;
  Object.entries(reportTypes)
    .filter(([, item]) => (item.category || "major") === "major")
    .forEach(([key, item]) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = item.label || key;
      elements.reportType.appendChild(option);
    });
}

function populateDailyActivityTypes(types) {
  const list = Array.isArray(types) && types.length ? types : fallbackDailyActivityTypes;
  elements.activityType.innerHTML = `<option value="">Select activity type</option>`;
  list.forEach((item) => {
    const option = document.createElement("option");
    option.value = item;
    option.textContent = item;
    elements.activityType.appendChild(option);
  });
}

function populateSelect(select, items, placeholder) {
  select.innerHTML = `<option value="">${placeholder}</option>`;
  (items || []).forEach((item) => {
    const option = document.createElement("option");
    option.value = item;
    option.textContent = item;
    select.appendChild(option);
  });
}

async function loadMetadata() {
  try {
    const data = await apiGet("/api/metadata");
    metadata = data;
    populateReportTypes(data.reportTypes);
    populateDailyActivityTypes(data.dailyActivityTypes);
    populateSelect(el("keyName"), data.keyList, "Select key / keycard");
    populateSelect(el("boloType"), data.boloTypes, "Select type");
    populateSelect(el("passdownShift"), data.shifts, "Select shift");
    setStatus("good", "Connected");
  } catch (err) {
    setStatus("bad", "Offline");
    populateDailyActivityTypes(fallbackDailyActivityTypes);
    console.warn("Metadata unavailable:", err.message);
  }
}

/* ---------------------------------------------------------------
   REPORT FORM (IR-01 / DA-02)
   --------------------------------------------------------------- */

function setDefaultDateTime() {
  const now = localDateTimeParts();
  if (!elements.dateOfIncident.value) elements.dateOfIncident.value = now.date;
  if (!elements.timeOfIncident.value) elements.timeOfIncident.value = now.time;
}

function setFeature(icon, title, description) {
  elements.typeFeatureIcon.textContent = icon;
  elements.typeFeatureTitle.textContent = title;
  elements.typeFeatureDescription.textContent = description;
}

function setGuidance(items) {
  elements.guidanceList.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    elements.guidanceList.appendChild(li);
  });
}

function updateSelectedReportFeature() {
  const key = elements.reportType.value;
  const item = reportTypes[key];
  if (!item) {
    setFeature("IR", "No type selected", "Pick a report type to show a short description.");
    elements.reportTypeDescription.textContent = "Select a report type to see a short description.";
    return;
  }
  setFeature(classificationCode(item.label), item.label, item.description || "");
  elements.reportTypeDescription.textContent = item.description || "";
}

function setMode(mode) {
  currentMode = mode;
  elements.formMode.value = mode;
  elements.body.classList.toggle("mode-incident", mode === "incident");
  elements.body.classList.toggle("mode-daily", mode === "daily");

  document.querySelectorAll(".incident-only").forEach((node) => { node.hidden = mode !== "incident"; });
  document.querySelectorAll(".daily-only").forEach((node) => { node.hidden = mode !== "daily"; });

  elements.reportType.required = mode === "incident";
  elements.activityType.required = mode === "daily";
  elements.priority.required = mode === "incident";
  elements.actionTaken.required = mode === "incident";

  hideConfirm();

  if (mode === "incident") {
    elements.modeBadge.textContent = "Incident Report";
    elements.sideTitle.textContent = "Choose an incident report type";
    elements.sideText.textContent = "Select the best category. The guidance panel will update with the purpose, required fields, and evidence reminders.";
    elements.formTitle.textContent = "Submit an incident report";
    elements.formIntro.textContent = "Use this for security, safety, conduct, property, or significant campus incidents.";
    elements.dateLabel.textContent = "Date of incident";
    elements.timeLabel.textContent = "Time of incident";
    elements.summaryLabel.textContent = "Narrative";
    elements.summary.placeholder = "What happened? Include who, what, when, where, and how security became involved.";
    elements.summaryHelper.textContent = "Spelling errors are highlighted by the browser while typing.";
    elements.submitButton.textContent = "Submit Incident Report";
    setGuidance(["Report type", "Priority", "Date and time of incident", "Location", "People involved yes/no", "Narrative", "Response / action taken"]);
    updateSelectedReportFeature();
  } else {
    elements.modeBadge.textContent = "Daily Activity Log";
    elements.sideTitle.textContent = "Quick officer activity entry";
    elements.sideText.textContent = "Use this for patrol checks, door or gate checks, assists, traffic posts, events, and routine activity.";
    elements.formTitle.textContent = "Submit a daily activity log";
    elements.formIntro.textContent = "Fast entry for routine officer activity.";
    elements.dateLabel.textContent = "Date of activity";
    elements.timeLabel.textContent = "Time of activity";
    elements.summaryLabel.textContent = "Quick activity entry";
    elements.summary.placeholder = "Briefly document the patrol, check, assist, traffic post, event coverage, or other activity.";
    elements.summaryHelper.textContent = "Files as DAR-#### with your name and time attached.";
    elements.submitButton.textContent = "Submit Daily Log";
    setGuidance(["Activity type", "Date and time", "Location", "Quick entry"]);
    setFeature("DA", "Daily Activity Log", "Quick officer entry for routine security work.");
  }
}

function populateLocationSections() {
  const groups = locationGroups[elements.campus.value];
  elements.locationSection.innerHTML = "";
  elements.location.innerHTML = "";
  elements.location.disabled = true;
  elements.otherLocationWrap.hidden = true;
  elements.otherLocation.required = false;
  elements.building.value = "";

  if (!groups) {
    elements.locationSection.disabled = true;
    elements.locationSection.innerHTML = `<option value="">Select campus first</option>`;
    elements.location.innerHTML = `<option value="">Select area group first</option>`;
    return;
  }

  elements.locationSection.disabled = false;
  elements.locationSection.innerHTML = `<option value="">Select area group</option>`;
  Object.keys(groups).forEach((group) => {
    const option = document.createElement("option");
    option.value = group;
    option.textContent = group;
    elements.locationSection.appendChild(option);
  });
}

function populateLocations() {
  const locations = locationGroups[elements.campus.value]?.[elements.locationSection.value] || [];
  elements.location.innerHTML = "";
  elements.otherLocationWrap.hidden = true;
  elements.otherLocation.required = false;
  elements.building.value = elements.locationSection.value;

  if (!locations.length) {
    elements.location.disabled = true;
    elements.location.innerHTML = `<option value="">Select area group first</option>`;
    return;
  }

  elements.location.disabled = false;
  elements.location.innerHTML = `<option value="">Select location</option>`;
  locations.forEach((location) => {
    const option = document.createElement("option");
    option.value = location;
    option.textContent = location;
    elements.location.appendChild(option);
  });
}

function handleLocationChange() {
  const isOther = elements.location.value === "Other";
  elements.otherLocationWrap.hidden = !isOther;
  elements.otherLocation.required = isOther;
}

function selectedPeopleChoice() {
  return elements.peopleChoices.find((input) => input.checked)?.value || "";
}

function addPersonEntry(data = {}) {
  const clone = elements.personTemplate.content.firstElementChild.cloneNode(true);
  clone.querySelector("[data-person-field='name']").value = data.name || "";
  clone.querySelector("[data-person-field='dob']").value = data.dob || "";
  clone.querySelector("[data-person-field='phone']").value = data.phone || "";
  clone.querySelector("[data-person-field='student']").value = data.student || "";
  clone.querySelector("[data-person-field='role']").value = data.role || "";
  clone.querySelector(".remove-person").addEventListener("click", () => {
    clone.remove();
    renumberPeople();
  });
  elements.peopleEntries.appendChild(clone);
  renumberPeople();
}

function renumberPeople() {
  Array.from(elements.peopleEntries.querySelectorAll(".person-entry")).forEach((entry, index) => {
    entry.querySelector(".person-number").textContent = `Person ${index + 1}`;
    entry.querySelector(".remove-person").hidden = index === 0;
  });
}

function handlePeopleChoiceChange() {
  const value = selectedPeopleChoice();
  elements.peopleEntriesWrap.hidden = value !== "Yes";
  if (value === "Yes" && !elements.peopleEntries.children.length) addPersonEntry();
}

function collectPeople() {
  return Array.from(elements.peopleEntries.querySelectorAll(".person-entry")).map((entry) => ({
    name: entry.querySelector("[data-person-field='name']").value.trim(),
    dob: entry.querySelector("[data-person-field='dob']").value.trim(),
    phone: entry.querySelector("[data-person-field='phone']").value.trim(),
    student: entry.querySelector("[data-person-field='student']").value.trim(),
    role: entry.querySelector("[data-person-field='role']").value.trim()
  }));
}

function formatPeopleForSheet(people) {
  if (!people.length) return "";
  return people.map((person, index) => [
    `Person ${index + 1}:`,
    `Name: ${person.name || ""}`,
    `DOB: ${person.dob || ""}`,
    `Phone: ${person.phone || ""}`,
    `Student: ${person.student || ""}`,
    `Role: ${person.role || ""}`
  ].join("\n")).join("\n\n");
}

function validatePeople() {
  if (currentMode !== "incident") return "";
  const choice = selectedPeopleChoice();
  if (!choice) return "Please select whether people were involved before submitting this report.";
  if (choice === "No") return "";
  const people = collectPeople();
  if (!people.length) return "Please enter at least one person involved or change People Involved to No.";
  for (let i = 0; i < people.length; i++) {
    const person = people[i];
    if (!person.name || !person.student || !person.role) {
      return `Please complete Name, Student, and Role for Person ${i + 1}.`;
    }
  }
  return "";
}

function getFormPayload() {
  const formData = new FormData(elements.form);
  const payload = {};
  for (const [key, value] of formData.entries()) {
    if (key !== "attachments") payload[key] = value;
  }

  payload.building = elements.locationSection.value || "";
  if (elements.location.value === "Other" && elements.otherLocation.value.trim()) {
    payload.location = `Other: ${elements.otherLocation.value.trim()}`;
  }

  if (currentMode === "incident") {
    payload.reportType = elements.reportType.value;
    payload.peopleInvolvedChoice = selectedPeopleChoice();
    payload.peopleInvolvedJson = JSON.stringify(collectPeople());
    payload.peopleInvolved = payload.peopleInvolvedChoice === "Yes" ? formatPeopleForSheet(collectPeople()) : "No people involved";
  } else {
    payload.reportType = "daily_activity";
    payload.priority = "";
    payload.actionTaken = "";
    payload.peopleInvolvedChoice = "";
    payload.peopleInvolved = "";
    payload.peopleInvolvedJson = "[]";
  }

  return payload;
}

function showResult(kind, message) {
  elements.result.hidden = false;
  elements.result.className = `result ${kind}`;
  elements.result.innerHTML = message;
}

function resetResult() {
  elements.result.hidden = true;
  elements.result.className = "result";
  elements.result.innerHTML = "";
}

function validateFiles() {
  const files = Array.from(elements.attachments.files || []);
  const tooLarge = files.find((file) => file.size > MAX_FILE_BYTES);
  if (tooLarge) return `${tooLarge.name} is too large. Maximum file size is ${formatBytes(MAX_FILE_BYTES)}.`;
  return "";
}

function renderFileList() {
  const files = Array.from(elements.attachments.files || []);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  elements.fileList.innerHTML = "";
  files.forEach((file) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${escapeHtml(file.name)}</strong><span>${escapeHtml(formatBytes(file.size))}</span>`;
    elements.fileList.appendChild(li);
  });
  elements.attachmentStatus.textContent = files.length
    ? `${files.length} file${files.length === 1 ? "" : "s"} selected • ${formatBytes(total)}`
    : "No files selected";
  const error = validateFiles();
  if (error) showResult("bad", escapeHtml(error));
}

function readSlice(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(blob);
  });
}

// Small files travel inline with the report; big files upload chunk-by-chunk
// first, then the report references them. This is what makes 50 MB video work.
async function prepareAttachments(onProgress) {
  const error = validateFiles();
  if (error) throw new Error(error);

  const files = Array.from(elements.attachments.files || []);
  const prepared = [];

  for (let f = 0; f < files.length; f++) {
    const file = files[f];

    if (file.size <= CHUNK_BYTES) {
      prepared.push({
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        data: await readSlice(file)
      });
      continue;
    }

    const uploadId = crypto.randomUUID();
    const total = Math.ceil(file.size / CHUNK_BYTES);

    for (let index = 0; index < total; index++) {
      onProgress?.(`Uploading ${file.name} — part ${index + 1} of ${total}…`);
      const slice = file.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
      const data = await readSlice(slice);
      await apiPost("/api/upload-chunk", { uploadId, index, total, data });
    }

    prepared.push({
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      uploadId,
      parts: total
    });
  }

  return prepared;
}

function validateBeforeSubmit() {
  if (currentMode === "incident") {
    if (!elements.reportType.value) return { message: "Choose a report type before submitting.", focus: elements.reportType };
    if (!elements.priority.value) return { message: "Please select a priority before submitting this report.", focus: elements.priority };
    const peopleError = validatePeople();
    if (peopleError) return { message: peopleError, focus: elements.peopleChoices[0] };
    if (!elements.actionTaken.value.trim()) return { message: "Please enter the response or action taken.", focus: elements.actionTaken };
  } else {
    if (!elements.activityType.value) return { message: "Choose a daily activity type before submitting.", focus: elements.activityType };
  }

  if (!elements.dateOfIncident.value) return { message: "Please select the date.", focus: elements.dateOfIncident };
  if (!elements.timeOfIncident.value) return { message: "Please select the time.", focus: elements.timeOfIncident };
  if (!elements.campus.value) return { message: "Please select a campus.", focus: elements.campus };
  if (!elements.locationSection.value) return { message: "Please select an area group.", focus: elements.locationSection };
  if (!elements.location.value) return { message: "Please select a location.", focus: elements.location };
  if (elements.location.value === "Other" && !elements.otherLocation.value.trim()) {
    return { message: "Please enter the other location details.", focus: elements.otherLocation };
  }
  if (!elements.summary.value.trim()) return { message: currentMode === "daily" ? "Please enter a quick activity entry." : "Please enter the narrative.", focus: elements.summary };

  return null;
}

function showConfirm(reportId, metaText) {
  elements.form.hidden = true;
  elements.confirmCard.hidden = false;
  elements.confirmNumber.textContent = reportId;
  elements.confirmMeta.textContent = metaText;
  elements.confirmCard.scrollIntoView({ behavior: "smooth", block: "center" });
}

function hideConfirm() {
  elements.confirmCard.hidden = true;
  elements.form.hidden = false;
}

el("copyNumberButton").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(elements.confirmNumber.textContent);
    el("copyNumberButton").textContent = "Copied ✓";
    setTimeout(() => { el("copyNumberButton").textContent = "Copy number"; }, 2000);
  } catch {
    el("copyNumberButton").textContent = elements.confirmNumber.textContent;
  }
});

el("startAnotherButton").addEventListener("click", () => {
  hideConfirm();
  elements.form.reset();
  setDefaultDateTime();
  setMode(currentMode);
});

elements.reportType.addEventListener("change", updateSelectedReportFeature);
elements.campus.addEventListener("change", populateLocationSections);
elements.locationSection.addEventListener("change", populateLocations);
elements.location.addEventListener("change", handleLocationChange);
elements.peopleChoices.forEach((input) => input.addEventListener("change", handlePeopleChoiceChange));
elements.addPersonButton.addEventListener("click", () => addPersonEntry());

elements.attachments.addEventListener("change", () => { resetResult(); renderFileList(); });

["dragenter", "dragover"].forEach((name) => {
  elements.uploadZone.addEventListener(name, () => elements.uploadZone.classList.add("dragover"));
});
["dragleave", "drop"].forEach((name) => {
  elements.uploadZone.addEventListener(name, () => elements.uploadZone.classList.remove("dragover"));
});

elements.form.addEventListener("reset", () => {
  resetResult();
  setTimeout(() => {
    elements.reportType.value = "";
    elements.activityType.value = "";
    elements.fileList.innerHTML = "";
    elements.attachmentStatus.textContent = "No files selected";
    elements.peopleEntries.innerHTML = "";
    elements.peopleEntriesWrap.hidden = true;
    elements.locationSection.innerHTML = `<option value="">Select campus first</option>`;
    elements.locationSection.disabled = true;
    elements.location.innerHTML = `<option value="">Select area group first</option>`;
    elements.location.disabled = true;
    elements.otherLocationWrap.hidden = true;
    if (auth.officer?.name) elements.submittedBy.value = auth.officer.name;
    setDefaultDateTime();
    if (currentMode === "incident") updateSelectedReportFeature();
  }, 0);
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  resetResult();

  const validationError = validateBeforeSubmit();
  if (validationError) {
    showResult("bad", escapeHtml(validationError.message));
    validationError.focus?.focus?.();
    return;
  }

  const payload = getFormPayload();
  elements.submitButton.disabled = true;
  elements.submitButton.textContent = "Preparing files…";

  try {
    payload.attachments = await prepareAttachments((msg) => { elements.submitButton.textContent = msg; });
    elements.submitButton.textContent = "Submitting…";

    const result = await apiPost("/api/submit-report", payload);

    const reportLabel = result.reportType || reportTypes[payload.reportType]?.label || payload.activityType || payload.reportType;
    const fileLine = result.attachmentsSaved ? ` · ${result.attachmentCount} file${result.attachmentCount === 1 ? "" : "s"} attached` : "";

    showConfirm(result.reportId, `${reportLabel} · ${payload.dateOfIncident} ${friendlyTime(payload.timeOfIncident)}${fileLine}`);

    elements.form.reset();
    setStatus("good", "Connected");
  } catch (err) {
    showResult("bad", `<strong>Report not saved.</strong><br>${escapeHtml(err.message)}`);
    setStatus("bad", "Error");
  } finally {
    elements.submitButton.disabled = false;
    elements.submitButton.textContent = currentMode === "daily" ? "Submit Daily Log" : "Submit Incident Report";
  }
});

/* ---------------------------------------------------------------
   DASHBOARD
   --------------------------------------------------------------- */

let dashboardLoadedAt = 0;

async function loadDashboard() {
  if (Date.now() - dashboardLoadedAt < 60 * 1000) return;
  dashboardLoadedAt = Date.now();

  loadWeather();
  renderGatesWidget();
  loadKeysWidget();
  loadCalendar();
  loadBolos();
  loadPassdown("passdownRecent", 24, 4);
  renderContacts();
}

async function loadWeather() {
  const target = el("weatherWidget");
  try {
    const data = await apiGet("/api/weather");
    target.innerHTML = `
      <div class="widget-big">${escapeHtml(String(data.current.temp))}°</div>
      <div class="widget-detail">${escapeHtml(data.current.conditions)} · feels ${escapeHtml(String(data.current.feelsLike))}° · wind ${escapeHtml(String(data.current.wind))} mph</div>
      <div class="widget-detail">Today: ${escapeHtml(String(data.today.high))}° / ${escapeHtml(String(data.today.low))}° · ${escapeHtml(String(data.today.precipChance))}% precip</div>`;
  } catch (err) {
    target.innerHTML = `<span class="widget-loading">Weather unavailable — ${escapeHtml(err.message)}</span>`;
  }
}

async function loadKeysWidget() {
  const target = el("keysWidget");
  try {
    const data = await hubAction("listOpenKeys");
    if (!data.count) {
      target.innerHTML = `<div class="widget-big">0</div><div class="widget-detail">All keys accounted for.</div>`;
      return;
    }
    const names = data.open.slice(0, 4).map((item) =>
      `<li><span class="key-id">${escapeHtml(item.checkoutId)}</span> ${escapeHtml(item.keyName)} — ${escapeHtml(item.vendorEmployee)}</li>`
    ).join("");
    const more = data.count > 4 ? `<li>… and ${data.count - 4} more</li>` : "";
    target.innerHTML = `<div class="widget-big">${data.count}</div><ul class="keys-out-names">${names}${more}</ul>`;
  } catch (err) {
    target.innerHTML = `<span class="widget-loading">Unavailable — ${escapeHtml(err.message)}</span>`;
  }
}

/* --- calendar --- */

function dayLabel(dateStr, todayStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const monthDay = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (dateStr === todayStr) return { code: monthDay, name: `${weekday} — Today` };
  return { code: monthDay, name: weekday };
}

async function loadCalendar() {
  const target = el("calendarList");
  try {
    const data = await apiGet("/api/calendar-feed");

    let html = "";

    (data.errors || []).forEach((item) => {
      html += `<div class="cal-error"><strong>${item.source === "athletics" ? "Athletics" : "Faculty"} calendar unavailable:</strong> ${escapeHtml(item.error)}</div>`;
    });

    const byDate = {};
    (data.events || []).forEach((event) => {
      (byDate[event.date] ||= []).push(event);
    });

    data.dates.forEach((dateStr) => {
      const events = byDate[dateStr] || [];
      const isToday = dateStr === data.today;
      const label = dayLabel(dateStr, data.today);

      const eventsHtml = events.length
        ? `<ul class="cal-events">${events.map((event) => `
            <li class="cal-event">
              <span class="cal-time">${event.allDay ? "All day" : escapeHtml(friendlyTime(event.time))}</span>
              <span><span class="cal-title">${escapeHtml(event.title)}</span><span class="cal-source ${event.source}">${event.source === "athletics" ? "ATH" : "FAC"}</span>
              ${event.location ? `<span class="cal-loc">${escapeHtml(event.location)}</span>` : ""}</span>
            </li>`).join("")}</ul>`
        : `<p class="cal-empty">No scheduled events.</p>`;

      html += `
        <details ${isToday ? "open" : ""}>
          <summary>
            <span class="day-date">${escapeHtml(label.code)}</span>
            <span>${escapeHtml(label.name)}</span>
            ${isToday ? `<span class="today-pill">TODAY</span>` : ""}
            <span class="day-count">${events.length ? `${events.length} event${events.length === 1 ? "" : "s"}` : "—"}</span>
          </summary>
          ${eventsHtml}
        </details>`;
    });

    target.innerHTML = html || `<p class="widget-loading">No calendar data.</p>`;
  } catch (err) {
    target.innerHTML = `<div class="cal-error">Calendar unavailable — ${escapeHtml(err.message)}</div>`;
  }
}

/* --- advisories (BOLO) --- */

const boloForm = el("boloForm");

el("boloToggle").addEventListener("click", () => {
  boloForm.hidden = !boloForm.hidden;
  if (!boloForm.hidden && !el("boloExpires").value) {
    const week = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    el("boloExpires").value = localDateTimeParts(week).date;
  }
});

el("boloCancel").addEventListener("click", () => { boloForm.hidden = true; });

boloForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = boloForm.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    await hubAction("boloSubmit", {
      boloType: el("boloType").value,
      subject: el("boloSubject").value.trim(),
      details: el("boloDetails").value.trim(),
      expires: el("boloExpires").value,
      postedBy: auth.officer?.name || "Officer"
    });
    boloForm.reset();
    boloForm.hidden = true;
    loadBolos();
  } catch (err) {
    alert("Advisory not posted: " + err.message);
  } finally {
    button.disabled = false;
  }
});

async function loadBolos() {
  const target = el("boloList");
  try {
    const data = await hubAction("listBolos");
    if (!data.count) {
      target.innerHTML = `<p class="widget-loading">No active advisories.</p>`;
      return;
    }
    target.innerHTML = data.active.map((item) => `
      <div class="bolo-item">
        <span class="bolo-type">${escapeHtml(item.type)}</span>
        <h4>${escapeHtml(item.subject)}</h4>
        <p>${escapeHtml(item.details)}</p>
        <div class="bolo-meta">
          <span>Posted by ${escapeHtml(item.postedBy)}</span>
          <span>Expires ${escapeHtml(item.expires)}</span>
          <button class="bolo-resolve" data-advisory="${escapeHtml(item.advisoryId)}" type="button">Resolve</button>
        </div>
      </div>`).join("");

    target.querySelectorAll(".bolo-resolve").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!confirm("Mark this advisory resolved?")) return;
        button.disabled = true;
        try {
          await hubAction("boloResolve", { advisoryId: button.dataset.advisory, resolvedBy: auth.officer?.name || "Officer" });
          loadBolos();
        } catch (err) {
          alert("Could not resolve: " + err.message);
          button.disabled = false;
        }
      });
    });
  } catch (err) {
    target.innerHTML = `<p class="widget-loading">Unavailable — ${escapeHtml(err.message)}</p>`;
  }
}

/* --- report lookup --- */

el("lookupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const target = el("lookupResult");
  target.hidden = false;
  target.innerHTML = `<span class="widget-loading">Searching…</span>`;
  try {
    const data = await hubAction("lookupReport", { reportId: el("lookupInput").value.trim() });
    if (!data.found) {
      target.innerHTML = `No report found for <span class="lr-id">${escapeHtml(data.reportId)}</span>.`;
      return;
    }
    const r = data.report;
    target.innerHTML = `
      <span class="lr-id">${escapeHtml(r.reportId)}</span> — ${escapeHtml(r.reportType)}
      <dl>
        <dt>Filed by</dt><dd>${escapeHtml(r.submittedBy)}</dd>
        <dt>Campus</dt><dd>${escapeHtml(r.campus)}</dd>
        <dt>Location</dt><dd>${escapeHtml(r.location)}</dd>
        ${r.priority ? `<dt>Priority</dt><dd>${escapeHtml(r.priority)}</dd>` : ""}
        <dt>Status</dt><dd>${escapeHtml(r.status)}</dd>
        <dt>Narrative</dt><dd>${escapeHtml(String(r.narrative).slice(0, 280))}${String(r.narrative).length > 280 ? "…" : ""}</dd>
      </dl>`;
  } catch (err) {
    target.innerHTML = `Lookup failed — ${escapeHtml(err.message)}`;
  }
});

/* --- contacts --- */

async function renderContacts() {
  const target = el("contactsList");
  if (target.dataset.loaded) return;
  try {
    const response = await fetch("data/contacts.json");
    const data = await response.json();
    target.innerHTML = (data.contacts || []).map((contact) => {
      const telHref = contact.value.replace(/[^\d+]/g, "");
      const isPhone = /\d{7}/.test(telHref);
      return `<li><span>${escapeHtml(contact.label)}</span>${isPhone
        ? `<a href="tel:${escapeHtml(telHref)}">${escapeHtml(contact.value)}</a>`
        : `<span>${escapeHtml(contact.value)}</span>`}</li>`;
    }).join("");
    target.dataset.loaded = "1";
  } catch {
    target.innerHTML = `<li>Contacts unavailable.</li>`;
  }
}

/* ---------------------------------------------------------------
   KEY CHECKOUT (KC-03)
   --------------------------------------------------------------- */

const keyForm = el("keyForm");

function setKeyDefaultTime() {
  const input = el("timeOfIssue");
  if (!input.value) {
    const now = localDateTimeParts();
    input.value = `${now.date}T${now.time}`;
  }
}

el("keyStartAnotherButton").addEventListener("click", () => {
  el("keyConfirmCard").hidden = true;
  keyForm.hidden = false;
  keyForm.reset();
  if (auth.officer?.name) el("issuingOfficer").value = auth.officer.name;
  setKeyDefaultTime();
});

keyForm.addEventListener("reset", () => {
  setTimeout(() => {
    if (auth.officer?.name) el("issuingOfficer").value = auth.officer.name;
    setKeyDefaultTime();
  }, 0);
});

keyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const resultBox = el("keyResultBox");
  resultBox.hidden = true;

  const button = el("keySubmitButton");
  button.disabled = true;
  button.textContent = "Recording…";

  try {
    const data = await hubAction("keyCheckout", {
      vendorEmployee: el("vendorEmployee").value.trim(),
      vendorCompany: el("vendorCompany").value.trim(),
      badgeIssued: el("badgeIssued").value.trim(),
      keyName: el("keyName").value,
      timeOfIssue: el("timeOfIssue").value.replace("T", " "),
      issuingOfficer: el("issuingOfficer").value.trim(),
      remarks: el("keyRemarks").value.trim()
    });

    el("keyConfirmNumber").textContent = data.checkoutId;
    el("keyConfirmMeta").textContent = `${el("keyName").value} → ${el("vendorEmployee").value.trim()} (${el("vendorCompany").value.trim()})`;
    keyForm.hidden = true;
    el("keyConfirmCard").hidden = false;
    loadOpenKeys("openKeysList");
    dashboardLoadedAt = 0;
  } catch (err) {
    resultBox.hidden = false;
    resultBox.className = "result bad";
    resultBox.innerHTML = `<strong>Checkout not recorded.</strong><br>${escapeHtml(err.message)}`;
  } finally {
    button.disabled = false;
    button.textContent = "Record checkout";
  }
});

async function loadOpenKeys(targetId) {
  const target = el(targetId);
  try {
    const data = await hubAction("listOpenKeys");
    if (!data.count) {
      target.innerHTML = `<p class="widget-loading">No keys out. All accounted for.</p>`;
      return;
    }
    target.innerHTML = data.open.map((item) => `
      <div class="open-key-item">
        <span class="ok-id">${escapeHtml(item.checkoutId)}</span>
        <h4>${escapeHtml(item.keyName)}</h4>
        <div class="ok-meta">
          ${escapeHtml(item.vendorEmployee)} — ${escapeHtml(item.vendorCompany)} · badge ${escapeHtml(item.badgeIssued)}<br>
          Issued ${escapeHtml(item.timeOfIssue)} by ${escapeHtml(item.issuingOfficer)}
          ${item.remarks ? `<br>${escapeHtml(item.remarks)}` : ""}
        </div>
        <button class="return-button" data-checkout="${escapeHtml(item.checkoutId)}" type="button">Mark returned</button>
      </div>`).join("");

    target.querySelectorAll(".return-button").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!confirm(`Mark ${button.dataset.checkout} returned?`)) return;
        button.disabled = true;
        button.textContent = "Recording…";
        try {
          await hubAction("keyReturn", {
            checkoutId: button.dataset.checkout,
            returningOfficer: auth.officer?.name || "Officer"
          });
          loadOpenKeys(targetId);
          dashboardLoadedAt = 0;
        } catch (err) {
          alert("Return not recorded: " + err.message);
          button.disabled = false;
          button.textContent = "Mark returned";
        }
      });
    });
  } catch (err) {
    target.innerHTML = `<p class="widget-loading">Unavailable — ${escapeHtml(err.message)}</p>`;
  }
}

/* ---------------------------------------------------------------
   PASS-DOWN (PD-04)
   --------------------------------------------------------------- */

el("passdownForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const resultBox = el("passdownResultBox");
  resultBox.hidden = true;

  const button = el("passdownSubmitButton");
  button.disabled = true;
  button.textContent = "Saving…";

  try {
    await hubAction("passdownSubmit", {
      shift: el("passdownShift").value,
      notes: el("passdownNotes").value.trim(),
      flagged: el("passdownFlagged").checked ? "Yes" : "",
      relatedReport: el("passdownRelated").value.trim(),
      officer: auth.officer?.name || "Officer"
    });

    resultBox.hidden = false;
    resultBox.className = "result good";
    resultBox.innerHTML = `<strong>Pass-down saved.</strong> The next shift will see it on the dashboard.`;
    el("passdownForm").reset();
    loadPassdown("passdownList", 48);
    dashboardLoadedAt = 0;
  } catch (err) {
    resultBox.hidden = false;
    resultBox.className = "result bad";
    resultBox.innerHTML = `<strong>Not saved.</strong><br>${escapeHtml(err.message)}`;
  } finally {
    button.disabled = false;
    button.textContent = "Save pass-down";
  }
});

async function loadPassdown(targetId, hours, limit) {
  const target = el(targetId);
  try {
    const data = await hubAction("listPassdown", { hours });
    let entries = data.entries || [];
    if (limit) entries = entries.slice(0, limit);
    if (!entries.length) {
      target.innerHTML = `<p class="widget-loading">No entries in the last ${hours} hours.</p>`;
      return;
    }
    target.innerHTML = entries.map((entry) => {
      const when = new Date(entry.timestamp).toLocaleString("en-US", {
        weekday: "short", hour: "numeric", minute: "2-digit"
      });
      return `
      <div class="passdown-item ${entry.flagged ? "flagged" : ""}">
        <div class="pd-meta">
          ${entry.flagged ? `<span class="pd-flag">⚑ Flagged</span>` : ""}
          <span>${escapeHtml(when)}</span>
          <span>${escapeHtml(entry.shift)}</span>
          <span>${escapeHtml(entry.officer)}</span>
          ${entry.relatedReport ? `<span class="pd-report">${escapeHtml(entry.relatedReport)}</span>` : ""}
        </div>
        ${escapeHtml(entry.notes)}
      </div>`;
    }).join("");
  } catch (err) {
    target.innerHTML = `<p class="widget-loading">Unavailable — ${escapeHtml(err.message)}</p>`;
  }
}

/* ---------------------------------------------------------------
   GATES — schedule tables + "right now" computation.
   Status reflects the SCHEDULE, not a sensor.
   --------------------------------------------------------------- */

let gatesData = null;

async function loadGatesData() {
  if (gatesData) return gatesData;
  const response = await fetch("data/gates-schedule.json");
  gatesData = await response.json();
  return gatesData;
}

function gateStateNow(gate, now = new Date()) {
  const day = now.getDay() === 0 ? 7 : now.getDay(); // 1=Mon..7=Sun
  const minutes = now.getHours() * 60 + now.getMinutes();
  const toMinutes = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };

  for (const window of gate.windows || []) {
    if (!window.days.includes(day)) continue;
    const open = toMinutes(window.open);
    const close = toMinutes(window.close);
    if (minutes >= open && minutes < close) {
      return { open: true, label: window.label || "", until: window.close };
    }
  }

  // Next opening today?
  let next = null;
  for (const window of gate.windows || []) {
    if (!window.days.includes(day)) continue;
    const open = toMinutes(window.open);
    if (open > minutes && (next === null || open < next.openMin)) {
      next = { openMin: open, at: window.open, label: window.label || "" };
    }
  }

  return { open: false, next };
}

async function renderGatesWidget() {
  const target = el("gatesWidget");
  try {
    const data = await loadGatesData();
    const lines = data.campuses.map((campus) => {
      let open = 0;
      let soonestClose = null;
      campus.gates.forEach((gate) => {
        const state = gateStateNow(gate);
        if (state.open) {
          open++;
          if (!soonestClose || state.until < soonestClose) soonestClose = state.until;
        }
      });
      const shortName = campus.name.split("/")[0].trim();
      const detail = open
        ? `<span class="count-open">${open} open</span>${soonestClose ? ` · next close ${friendlyTime(soonestClose)}` : ""}`
        : `<span class="count-closed">All closed</span>`;
      return `<div class="widget-campus-line"><span>${escapeHtml(shortName)}</span><span>${detail}</span></div>`;
    }).join("");
    const sampleNote = data.sample ? `<div class="widget-detail">Sample schedule — see Gates page.</div>` : "";
    target.innerHTML = lines + sampleNote;
  } catch (err) {
    target.innerHTML = `<span class="widget-loading">Unavailable — ${escapeHtml(err.message)}</span>`;
  }
}

async function renderGates() {
  const target = el("gatesContent");
  try {
    const data = await loadGatesData();
    el("gatesSampleBanner").hidden = !data.sample;

    target.innerHTML = data.campuses.map((campus) => `
      <div class="gates-campus">
        <h3>${escapeHtml(campus.name)}</h3>
        <table class="gates-table">
          <thead><tr><th>Gate</th><th>Status now</th><th>Schedule</th></tr></thead>
          <tbody>
            ${campus.gates.map((gate) => {
              const state = gateStateNow(gate);
              const status = state.open
                ? `<span class="gate-status open">OPEN${state.until ? ` · closes ${friendlyTime(state.until)}` : ""}</span>`
                : `<span class="gate-status closed">CLOSED${state.next ? ` · opens ${friendlyTime(state.next.at)}` : ""}</span>`;
              const schedule = (gate.windows || []).length
                ? gate.windows.map((window) => `<span class="gate-window">${friendlyTime(window.open)}–${friendlyTime(window.close)} <span class="gw-label">${escapeHtml(window.label || "")} (${window.days.map((d) => "MTWTFSS"[d - 1]).join("")})</span></span>`).join("")
                : `<span class="gate-none">Locked — opened on request only</span>`;
              return `<tr><td><strong>${escapeHtml(gate.name)}</strong></td><td>${status}</td><td>${schedule}</td></tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`).join("");
  } catch (err) {
    target.innerHTML = `<p class="widget-loading">Gate schedule unavailable — ${escapeHtml(err.message)}</p>`;
  }
}

// Keep "right now" honest as time passes.
setInterval(() => {
  if (currentView === "dashboard") renderGatesWidget();
  if (currentView === "gates") renderGates();
}, 60 * 1000);

/* ---------------------------------------------------------------
   POST ORDERS
   --------------------------------------------------------------- */

async function renderPostOrders() {
  const target = el("postOrdersContent");
  if (target.dataset.loaded) return;
  try {
    const response = await fetch("data/post-orders.json");
    const data = await response.json();

    target.innerHTML = (data.sections || []).map((section) => `
      <div class="po-section">
        <div class="po-section-head">
          <span class="po-code">${escapeHtml(section.code)}</span>
          <h3>${escapeHtml(section.title)}</h3>
        </div>
        <p class="po-desc">${escapeHtml(section.description)}</p>
        ${(section.groups || []).map((group) => `
          <p class="po-campus">${escapeHtml(group.campus)}</p>
          <div class="po-cards">
            ${(group.posts || []).map((post) => post.file
              ? `<div class="po-card"><strong>${escapeHtml(post.name)}</strong><a href="docs/post-orders/${encodeURIComponent(post.file)}" target="_blank" rel="noopener">Open PDF →</a></div>`
              : `<div class="po-card pending"><strong>${escapeHtml(post.name)}</strong><span class="po-pending">Document pending</span></div>`
            ).join("")}
          </div>`).join("")}
      </div>`).join("");

    target.dataset.loaded = "1";
  } catch (err) {
    target.innerHTML = `<p class="widget-loading">Post orders unavailable — ${escapeHtml(err.message)}</p>`;
  }
}

/* ---------------------------------------------------------------
   PWA
   --------------------------------------------------------------- */

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

/* ---------------------------------------------------------------
   BOOT
   --------------------------------------------------------------- */

(async function boot() {
  await initAuth();
  setDefaultDateTime();
  setKeyDefaultTime();
  route();
  loadMetadata();
})();
