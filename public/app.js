/* ==========================================================================
   PHS Security Hub — app.js v4
   auth · helpers · theme · nav/routing · dashboard · reports (IR/DA + rapid,
   stepper, camera, chunked uploads) · follow-ups · lookup/print · checkouts
   (keys + equipment) · pass-down · B.O.L.O.s · gates · post orders ·
   contacts · shift command · stats
   ========================================================================== */

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const CHUNK_BYTES = 3 * 1024 * 1024;

const el = (id) => document.getElementById(id);

/* ---------------- AUTH ---------------- */

const auth = { enabled: false, client: null, officer: null, supervisor: false };

async function initAuth() {
  try {
    const config = await (await fetch("/api/auth-config")).json();

    if (!config.authEnabled) {
      auth.enabled = false;
      auth.supervisor = true; // open mode: no tiers to enforce client-side
      el("authWarning").hidden = false;
      return;
    }

    auth.enabled = true;
    auth.client = await auth0.createAuth0Client({
      domain: config.domain,
      clientId: config.clientId,
      authorizationParams: { redirect_uri: window.location.origin, audience: config.audience },
      cacheLocation: "localstorage",
      useRefreshTokens: true
    });

    if (window.location.search.includes("code=") && window.location.search.includes("state=")) {
      await auth.client.handleRedirectCallback();
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }

    if (await auth.client.isAuthenticated()) {
      const user = await auth.client.getUser();
      auth.officer = { name: user.name || user.nickname || user.email, email: user.email || "" };
      showSignedIn();
      try {
        const who = await apiGet("/api/whoami");
        auth.supervisor = Boolean(who.supervisor);
      } catch { auth.supervisor = false; }
      el("supBadge").hidden = !auth.supervisor;
    } else {
      el("loginGate").hidden = false;
    }
  } catch (err) {
    console.error("Auth init failed:", err);
    const note = el("loginNote");
    note.hidden = false;
    note.textContent = "Sign-in is unavailable: " + err.message;
    el("loginGate").hidden = false;
  }
}

function showSignedIn() {
  el("loginGate").hidden = true;
  el("userChip").hidden = false;
  el("userName").textContent = auth.officer?.name || "Officer";
  if (auth.officer?.name) {
    const submittedBy = el("submittedBy");
    submittedBy.value = auth.officer.name;
    submittedBy.readOnly = true;
    el("submittedByHelper").hidden = false;
    const issuing = el("issuingOfficer");
    issuing.value = auth.officer.name;
    issuing.readOnly = true;
    el("issuingOfficerHelper").hidden = false;
  }
}

async function getAuthHeaders() {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (auth.enabled && auth.client) {
    try {
      headers.Authorization = `Bearer ${await auth.client.getTokenSilently()}`;
    } catch {
      el("loginGate").hidden = false;
      throw new Error("Sign in to continue.");
    }
  }
  return headers;
}

el("loginButton").addEventListener("click", async () => { if (auth.client) await auth.client.loginWithRedirect(); });
el("logoutButton").addEventListener("click", () => { if (auth.client) auth.client.logout({ logoutParams: { returnTo: window.location.origin } }); });

/* ---------------- API HELPERS ---------------- */

async function apiGet(path) {
  const response = await fetch(path, { headers: await getAuthHeaders() });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function apiPost(path, body) {
  const response = await fetch(path, { method: "POST", headers: await getAuthHeaders(), body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

const hubAction = (action, payload = {}) => apiPost("/api/hub-data", { action, ...payload });

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
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
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function hoursSince(text) {
  const date = new Date(String(text).replace(" ", "T"));
  if (isNaN(date.getTime())) return 0;
  return (Date.now() - date.getTime()) / 3600000;
}

function setStatus(kind, message) {
  const dot = kind === "good" ? "good" : kind === "bad" ? "bad" : "pending";
  el("backendStatus").innerHTML = `<span class="status-dot ${dot}"></span><span>${escapeHtml(message)}</span>`;
}

/* ---------------- THEME ---------------- */

function applyTheme() {
  const stored = localStorage.getItem("phs-theme");
  let dark;
  if (stored === "dark") dark = true;
  else if (stored === "light") dark = false;
  else { const hour = new Date().getHours() + new Date().getMinutes() / 60; dark = hour >= 19 || hour < 6.5; }
  document.body.classList.toggle("theme-dark", dark);
}

el("themeToggle").addEventListener("click", () => {
  const nowDark = !document.body.classList.contains("theme-dark");
  localStorage.setItem("phs-theme", nowDark ? "dark" : "light");
  document.body.classList.toggle("theme-dark", nowDark);
});

applyTheme();
setInterval(applyTheme, 15 * 60 * 1000);

/* ---------------- NAV MODEL & ROUTING ---------------- */

const NAV_GROUPS = [
  { id: "home", label: "Dashboard", icon: "i-home", pages: ["dashboard"] },
  { id: "reports", label: "Reports", icon: "i-file", pages: ["incident", "daily", "followups", "lookup"] },
  { id: "ops", label: "Operations", icon: "i-key", pages: ["keys", "equipment", "passdown", "bolos"] },
  { id: "ref", label: "Reference", icon: "i-book", pages: ["gates", "postorders", "contacts"] },
  { id: "cmd", label: "Command", icon: "i-star", pages: ["command", "stats"], supervisor: true }
];

const VIEWS = {
  dashboard: { elId: "view-dashboard", nav: "Dashboard", title: "Dashboard", sub: "Today at a glance: announcements, calendar, keys, and watch items." },
  incident: { elId: "view-reports", nav: "IR-01 Incident", title: "Incident Report", sub: "Formal documentation for security, safety, conduct, and property incidents." },
  daily: { elId: "view-reports", nav: "DA-02 Daily Log", title: "Daily Activity Log", sub: "Quick officer entries — use the rapid log for one-liners." },
  followups: { elId: "view-followups", nav: "Follow-ups", title: "Follow-Ups", sub: "Open reports awaiting closure." },
  lookup: { elId: "view-lookup", nav: "Lookup / Print", title: "Report Lookup", sub: "Find any report by number and print a formatted copy." },
  keys: { elId: "view-keys", nav: "KC-03 Keys", title: "Key Checkout", sub: "Vendor key and keycard checkouts, issue to return." },
  equipment: { elId: "view-keys", nav: "EQ-05 Equipment", title: "Equipment Checkout", sub: "Radios, medical bags, and event equipment — issue to return." },
  passdown: { elId: "view-passdown", nav: "PD-04 Pass-Down", title: "Shift Pass-Down", sub: "What the next shift needs to know." },
  bolos: { elId: "view-bolos", nav: "B.O.L.O.s", title: "B.O.L.O.s", sub: "Be-on-the-lookout items for all officers." },
  gates: { elId: "view-gates", nav: "Gates", title: "Gate Access", sub: "Schedules and scheduled open/closed status for every gate." },
  postorders: { elId: "view-postorders", nav: "Post Orders", title: "Post Orders", sub: "Standing orders, event orders, and general expectations." },
  contacts: { elId: "view-contacts", nav: "Contacts", title: "Quick Contacts", sub: "Key numbers, one tap away." },
  command: { elId: "view-command", nav: "Shift Command", title: "Shift Command", sub: "The whole morning picture on one screen.", supervisor: true },
  stats: { elId: "view-stats", nav: "Weekly Stats", title: "Weekly Stats", sub: "Activity summary for leadership.", supervisor: true }
};

let currentView = "dashboard";
let checkoutKind = "key";

function buildNav() {
  const top = el("groupNav");
  top.innerHTML = NAV_GROUPS.map((group) => {
    const locked = group.supervisor && !auth.supervisor;
    if (group.pages.length === 1) {
      return `<a class="gn-item" data-group="${group.id}" href="#${group.pages[0]}"><svg class="ic"><use href="#${group.icon}"/></svg> ${group.label}</a>`;
    }
    const links = group.pages.map((page) =>
      `<a href="#${page}" data-page="${page}">${escapeHtml(VIEWS[page].nav)}</a>`).join("");
    return `<div class="gn-drop ${locked ? "locked" : ""}" data-group="${group.id}">
      <button class="gn-item" type="button" ${locked ? "disabled" : ""}>
        <svg class="ic"><use href="#${group.icon}"/></svg> ${group.label}${locked ? ' <span class="lock">🔒</span>' : ""}
      </button>
      <div class="gn-menu">${links}</div>
    </div>`;
  }).join("");

  const bar = el("bottomBar");
  bar.innerHTML = NAV_GROUPS.map((group) => {
    const locked = group.supervisor && !auth.supervisor;
    if (locked) return "";
    return `<button type="button" data-group="${group.id}"><svg class="ic"><use href="#${group.icon}"/></svg><span>${group.label}</span></button>`;
  }).join("");

  bar.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const group = NAV_GROUPS.find((item) => item.id === button.dataset.group);
      if (group.pages.length === 1) { window.location.hash = "#" + group.pages[0]; return; }
      openBottomSheet(group);
    });
  });
}

function openBottomSheet(group) {
  const sheet = el("bottomSheet");
  sheet.innerHTML = `<div class="sheet-inner">
    <p class="sheet-title">${escapeHtml(group.label)}</p>
    ${group.pages.map((page) => `<a href="#${page}">${escapeHtml(VIEWS[page].nav)}</a>`).join("")}
  </div>`;
  sheet.hidden = false;
  sheet.onclick = (event) => { if (event.target === sheet || event.target.tagName === "A") sheet.hidden = true; };
}

function groupOf(view) {
  return NAV_GROUPS.find((group) => group.pages.includes(view)) || NAV_GROUPS[0];
}

function route() {
  const hash = (window.location.hash || "#dashboard").slice(1);
  let view = VIEWS[hash] ? hash : "dashboard";
  if (VIEWS[view].supervisor && !auth.supervisor) view = "dashboard";
  currentView = view;

  Object.values(VIEWS).forEach(({ elId }) => { el(elId).hidden = true; });
  const panel = el(VIEWS[view].elId);
  panel.hidden = false;
  panel.classList.remove("view-enter");
  void panel.offsetWidth;
  panel.classList.add("view-enter");

  el("heroTitle").textContent = VIEWS[view].title;
  el("heroSub").textContent = VIEWS[view].sub;

  const activeGroup = groupOf(view).id;
  document.querySelectorAll(".gn-item").forEach((item) => item.classList.remove("active"));
  document.querySelectorAll(`[data-group="${activeGroup}"] .gn-item, a.gn-item[data-group="${activeGroup}"]`)
    .forEach((item) => item.classList.add("active"));
  document.querySelectorAll(".gn-menu a").forEach((link) => link.classList.toggle("active", link.dataset.page === view));
  el("bottomBar").querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.group === activeGroup));
  el("bottomSheet").hidden = true;

  if (view === "incident" || view === "daily") { setMode(view === "daily" ? "daily" : "incident"); buildStepper(); }
  if (view === "dashboard") loadDashboard();
  if (view === "keys" || view === "equipment") setCheckoutKind(view === "equipment" ? "equipment" : "key");
  if (view === "passdown") loadPassdown("passdownList", 48);
  if (view === "bolos") loadBolos("boloList", 0, true);
  if (view === "followups") loadFollowUps("followupsList", auth.supervisor);
  if (view === "gates") renderGates();
  if (view === "postorders") renderPostOrders();
  if (view === "contacts") renderContacts("contactsList");
  if (view === "command") loadCommand();
  if (view === "stats") loadStats();
}

window.addEventListener("hashchange", route);

/* ---------------- STATIC DATA ---------------- */

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
    "Ward Gates": ["Boocock Gate", "Jordan Gate", "Art Gate", "Referee Gate", "Vehicle Gate", "Hicks Gate", "Bellis Gate"]
  },
  "Wornall / Lower Campus": {
    "Main Areas": [
      "Early Childhood", "Founders Hall", "Dining Hall", "DeRamus Gym", "Intermediate Building",
      "Primary Building", "Primary Parking Lot", "Early Childhood Parking Lot", "Curry Theater",
      "Carriage House", "The Quad", "The Turf Field", "Secret Playground", "Gaga Playground",
      "Mellon Building", "Loose Park", "Early Childhood / Intermediate Driveline", "Wornall Security Kiosk"
    ],
    "Wornall Gates": ["Turf Field Gate", "EC Main Gate", "Wornall Main Gate", "DeRamus Gate", "Dock Gate", "Intermediate Gate", "Archives Gate", "51st Street Gate", "EC Side Gate"]
  }
};

let reportTypes = {};
let metadata = { boloTypes: [], shifts: [], overdueHours: 12 };
let currentMode = "incident";

/* ---------------- METADATA ---------------- */

function populateSelect(select, items, placeholder) {
  select.innerHTML = `<option value="">${placeholder}</option>`;
  (items || []).forEach((item) => {
    const option = document.createElement("option");
    option.value = item; option.textContent = item;
    select.appendChild(option);
  });
}

async function loadMetadata() {
  try {
    const data = await apiGet("/api/metadata");
    metadata = data;
    reportTypes = data.reportTypes || {};
    const select = el("reportType");
    select.innerHTML = `<option value="">Select report type</option>`;
    Object.entries(reportTypes)
      .filter(([, item]) => (item.category || "major") === "major")
      .forEach(([key, item]) => {
        const option = document.createElement("option");
        option.value = key; option.textContent = item.label || key;
        select.appendChild(option);
      });
    populateSelect(el("activityType"), data.dailyActivityTypes || fallbackDailyActivityTypes, "Select activity type");
    populateSelect(el("boloType"), data.boloTypes, "Select type");
    populateSelect(el("passdownShift"), data.shifts, "Select shift");
    buildRapidChips(data.dailyActivityTypes || fallbackDailyActivityTypes);
    setStatus("good", "Connected");
  } catch (err) {
    setStatus("bad", "Offline");
    populateSelect(el("activityType"), fallbackDailyActivityTypes, "Select activity type");
    buildRapidChips(fallbackDailyActivityTypes);
    console.warn("Metadata unavailable:", err.message);
  }
  try {
    const names = await hubAction("checkoutNames");
    checkoutSuggestions = { key: names.keys || [], equipment: names.equipment || [] };
    fillItemSuggestions();
  } catch { /* suggestions are optional */ }
}

/* ---------------- REPORT FORM (IR-01 / DA-02) ---------------- */

const elements = {
  form: el("reportForm"), result: el("resultBox"), submitButton: el("submitButton"),
  reportType: el("reportType"), activityType: el("activityType"),
  submittedBy: el("submittedBy"), priority: el("priority"),
  dateOfIncident: el("dateOfIncident"), timeOfIncident: el("timeOfIncident"),
  campus: el("campus"), locationSection: el("locationSection"), location: el("location"),
  building: el("building"), otherLocationWrap: el("otherLocationWrap"), otherLocation: el("otherLocation"),
  roomNumber: el("roomNumber"), roomNa: el("roomNa"),
  peopleChoices: Array.from(document.querySelectorAll("input[name='peopleInvolvedChoice']")),
  peopleEntriesWrap: el("peopleEntriesWrap"), peopleEntries: el("peopleEntries"),
  summary: el("summary"), actionTaken: el("actionTaken"),
  attachmentStatus: el("attachmentStatus"), fileList: el("fileList"),
  confirmCard: el("confirmCard"), confirmNumber: el("confirmNumber"), confirmMeta: el("confirmMeta")
};

function setDefaultDateTime() {
  const now = localDateTimeParts();
  if (!elements.dateOfIncident.value) elements.dateOfIncident.value = now.date;
  if (!elements.timeOfIncident.value) elements.timeOfIncident.value = now.time;
}

function setMode(mode) {
  currentMode = mode;
  el("formMode").value = mode;
  document.body.classList.toggle("mode-incident", mode === "incident");
  document.body.classList.toggle("mode-daily", mode === "daily");
  document.querySelectorAll(".incident-only").forEach((node) => { node.hidden = mode !== "incident"; });
  document.querySelectorAll(".daily-only").forEach((node) => { node.hidden = mode !== "daily"; });
  elements.reportType.required = mode === "incident";
  elements.activityType.required = mode === "daily";
  hideConfirm();

  if (mode === "incident") {
    el("modeBadge").textContent = "Incident Report";
    el("sideTitle").textContent = "Choose an incident report type";
    el("sideText").textContent = "Select the best category. The guidance panel updates with the purpose and required fields.";
    el("formTitle").textContent = "Submit an incident report";
    el("formIntro").textContent = "Use this for security, safety, conduct, property, or significant campus incidents.";
    el("dateLabel").textContent = "Date of incident";
    el("timeLabel").textContent = "Time of incident";
    el("summaryLabel").textContent = "Narrative";
    elements.submitButton.textContent = "Submit Incident Report";
    updateSelectedReportFeature();
  } else {
    el("modeBadge").textContent = "Daily Activity Log";
    el("sideTitle").textContent = "Quick officer activity entry";
    el("sideText").textContent = "Use the rapid log for one-liners, or the full form below for detailed entries.";
    el("formTitle").textContent = "Submit a daily activity log";
    el("formIntro").textContent = "Fast entry for routine officer activity.";
    el("dateLabel").textContent = "Date of activity";
    el("timeLabel").textContent = "Time of activity";
    el("summaryLabel").textContent = "Quick activity entry";
    elements.submitButton.textContent = "Submit Daily Log";
  }
}

function classificationCode(label) {
  return String(label || "").split(/[\s/]+/).filter(Boolean).map((word) => word[0]).join("").toUpperCase().slice(0, 3) || "IR";
}

function updateSelectedReportFeature() {
  const item = reportTypes[elements.reportType.value];
  if (!item) {
    el("typeFeatureIcon").textContent = "IR";
    el("typeFeatureTitle").textContent = "No type selected";
    el("typeFeatureDescription").textContent = "Pick a report type to show a short description.";
    el("reportTypeDescription").textContent = "Select a report type to see a short description.";
    return;
  }
  el("typeFeatureIcon").textContent = classificationCode(item.label);
  el("typeFeatureTitle").textContent = item.label;
  el("typeFeatureDescription").textContent = item.description || "";
  el("reportTypeDescription").textContent = item.description || "";
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
    elements.location.innerHTML = `<option value="">Select building or area first</option>`;
    return;
  }
  elements.locationSection.disabled = false;
  elements.locationSection.innerHTML = `<option value="">Select building or area</option>`;
  Object.keys(groups).forEach((group) => {
    const option = document.createElement("option");
    option.value = group; option.textContent = group;
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
    elements.location.innerHTML = `<option value="">Select building or area first</option>`;
    return;
  }
  elements.location.disabled = false;
  elements.location.innerHTML = `<option value="">Select location</option>`;
  locations.forEach((location) => {
    const option = document.createElement("option");
    option.value = location; option.textContent = location;
    elements.location.appendChild(option);
  });
}

elements.roomNa.addEventListener("change", () => {
  elements.roomNumber.disabled = elements.roomNa.checked;
  elements.roomNumber.value = elements.roomNa.checked ? "N/A" : "";
});

function selectedPeopleChoice() {
  return elements.peopleChoices.find((input) => input.checked)?.value || "";
}

function addPersonEntry(data = {}) {
  const clone = el("personTemplate").content.firstElementChild.cloneNode(true);
  ["name", "dob", "phone", "student", "role"].forEach((field) => {
    clone.querySelector(`[data-person-field='${field}']`).value = data[field] || "";
  });
  clone.querySelector(".remove-person").addEventListener("click", () => { clone.remove(); renumberPeople(); });
  elements.peopleEntries.appendChild(clone);
  renumberPeople();
}

function renumberPeople() {
  Array.from(elements.peopleEntries.querySelectorAll(".person-entry")).forEach((entry, index) => {
    entry.querySelector(".person-number").textContent = `Person ${index + 1}`;
    entry.querySelector(".remove-person").hidden = index === 0;
  });
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
  return people.map((person, index) => [
    `Person ${index + 1}:`, `Name: ${person.name || ""}`, `DOB: ${person.dob || ""}`,
    `Phone: ${person.phone || ""}`, `Student: ${person.student || ""}`, `Role: ${person.role || ""}`
  ].join("\n")).join("\n\n");
}

function validatePeople() {
  if (currentMode !== "incident") return "";
  const choice = selectedPeopleChoice();
  if (!choice) return "Please select whether people were involved.";
  if (choice === "No") return "";
  const people = collectPeople();
  if (!people.length) return "Please enter at least one person involved or change People Involved to No.";
  for (let i = 0; i < people.length; i++) {
    if (!people[i].name || !people[i].student || !people[i].role) {
      return `Please complete Name, Student, and Role for Person ${i + 1}.`;
    }
  }
  return "";
}

/* --- attachments: combined file list + camera + parallel chunked uploads --- */

let selectedFiles = [];

function refreshFileList() {
  const total = selectedFiles.reduce((sum, file) => sum + file.size, 0);
  elements.fileList.innerHTML = selectedFiles.map((file, index) =>
    `<li><strong>${escapeHtml(file.name)}</strong><span>${escapeHtml(formatBytes(file.size))}</span>
     <button type="button" class="file-remove" data-index="${index}" aria-label="Remove ${escapeHtml(file.name)}">✕</button></li>`).join("");
  elements.fileList.querySelectorAll(".file-remove").forEach((button) => {
    button.addEventListener("click", () => { selectedFiles.splice(Number(button.dataset.index), 1); refreshFileList(); });
  });
  elements.attachmentStatus.textContent = selectedFiles.length
    ? `${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} • ${formatBytes(total)}`
    : "No files selected";
}

function addFiles(fileList) {
  for (const file of fileList) {
    if (file.size > MAX_FILE_BYTES) {
      showResult("bad", `${escapeHtml(file.name)} is too large. Maximum file size is ${formatBytes(MAX_FILE_BYTES)}.`);
      continue;
    }
    selectedFiles.push(file);
  }
  refreshFileList();
}

el("attachments").addEventListener("change", (event) => { addFiles(event.target.files); event.target.value = ""; });
el("cameraInput").addEventListener("change", (event) => { addFiles(event.target.files); event.target.value = ""; });

["dragenter", "dragover"].forEach((name) => el("uploadZone").addEventListener(name, () => el("uploadZone").classList.add("dragover")));
["dragleave", "drop"].forEach((name) => el("uploadZone").addEventListener(name, () => el("uploadZone").classList.remove("dragover")));

function readSlice(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(blob);
  });
}

function setUploadProgress(done, total) {
  const bar = el("uploadProgress");
  if (total <= 0) { bar.hidden = true; return; }
  bar.hidden = false;
  const percent = Math.round((done / total) * 100);
  el("uploadProgressBar").style.width = percent + "%";
  el("uploadProgressText").textContent = `Uploading evidence — ${percent}%`;
  if (done >= total) setTimeout(() => { bar.hidden = true; }, 800);
}

// Small files inline; big files as parallel chunk uploads (3 at a time)
// with retry, feeding the progress bar.
async function prepareAttachments() {
  const prepared = [];
  const chunkJobs = [];

  for (const file of selectedFiles) {
    if (file.size <= CHUNK_BYTES) {
      prepared.push({ name: file.name, type: file.type || "application/octet-stream", size: file.size, data: await readSlice(file) });
      continue;
    }
    const uploadId = crypto.randomUUID();
    const total = Math.ceil(file.size / CHUNK_BYTES);
    for (let index = 0; index < total; index++) {
      chunkJobs.push({ file, uploadId, index, total });
    }
    prepared.push({ name: file.name, type: file.type || "application/octet-stream", size: file.size, uploadId, parts: total });
  }

  if (chunkJobs.length) {
    let done = 0;
    setUploadProgress(0, chunkJobs.length);
    const queue = chunkJobs.slice();

    async function worker() {
      while (queue.length) {
        const job = queue.shift();
        const slice = job.file.slice(job.index * CHUNK_BYTES, (job.index + 1) * CHUNK_BYTES);
        const data = await readSlice(slice);
        let attempts = 0;
        for (;;) {
          try {
            await apiPost("/api/upload-chunk", { uploadId: job.uploadId, index: job.index, total: job.total, data });
            break;
          } catch (err) {
            if (++attempts >= 3) throw new Error(`Upload failed for ${job.file.name}: ${err.message}`);
            await new Promise((resolve) => setTimeout(resolve, 800 * attempts));
          }
        }
        setUploadProgress(++done, chunkJobs.length);
      }
    }

    await Promise.all([worker(), worker(), worker()]);
  }

  return prepared;
}

/* --- validation, submit, confirmation --- */

function showResult(kind, message) {
  elements.result.hidden = false;
  elements.result.className = `result ${kind}`;
  elements.result.innerHTML = message;
}

function resetResult() {
  elements.result.hidden = true;
  elements.result.innerHTML = "";
}

function validateBeforeSubmit() {
  if (currentMode === "incident") {
    if (!elements.reportType.value) return "Choose a report type before submitting.";
    if (!elements.priority.value) return "Please select a priority.";
    const peopleError = validatePeople();
    if (peopleError) return peopleError;
    if (!elements.actionTaken.value.trim()) return "Please enter the response or action taken.";
  } else if (!elements.activityType.value) return "Choose a daily activity type.";

  if (!elements.dateOfIncident.value) return "Please select the date.";
  if (!elements.timeOfIncident.value) return "Please select the time.";
  if (!elements.campus.value) return "Please select a campus.";
  if (!elements.locationSection.value) return "Please select a building or area.";
  if (!elements.location.value) return "Please select a location.";
  if (elements.location.value === "Other" && !elements.otherLocation.value.trim()) return "Please enter the other location details.";
  if (!elements.roomNumber.value.trim()) return "Enter a room number, or check N/A.";
  if (!elements.summary.value.trim()) return currentMode === "daily" ? "Please enter a quick activity entry." : "Please enter the narrative.";
  return null;
}

function getFormPayload() {
  const formData = new FormData(elements.form);
  const payload = {};
  for (const [key, value] of formData.entries()) payload[key] = value;
  payload.building = elements.locationSection.value || "";
  payload.roomNumber = elements.roomNumber.value.trim();
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

function showConfirm(reportId, metaText) {
  elements.form.hidden = true;
  elements.confirmCard.hidden = false;
  elements.confirmNumber.textContent = reportId;
  elements.confirmNumber.classList.remove("stamp-run");
  void elements.confirmNumber.offsetWidth;
  elements.confirmNumber.classList.add("stamp-run");
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
  } catch { el("copyNumberButton").textContent = elements.confirmNumber.textContent; }
});

el("startAnotherButton").addEventListener("click", () => {
  hideConfirm();
  elements.form.reset();
  selectedFiles = [];
  refreshFileList();
  setDefaultDateTime();
  setMode(currentMode);
  buildStepper();
});

elements.reportType.addEventListener("change", updateSelectedReportFeature);
elements.campus.addEventListener("change", populateLocationSections);
elements.locationSection.addEventListener("change", populateLocations);
elements.location.addEventListener("change", () => {
  const isOther = elements.location.value === "Other";
  elements.otherLocationWrap.hidden = !isOther;
  elements.otherLocation.required = isOther;
});
elements.peopleChoices.forEach((input) => input.addEventListener("change", () => {
  const yes = selectedPeopleChoice() === "Yes";
  elements.peopleEntriesWrap.hidden = !yes;
  if (yes && !elements.peopleEntries.children.length) addPersonEntry();
}));
el("addPersonButton").addEventListener("click", () => addPersonEntry());

elements.form.addEventListener("reset", () => {
  resetResult();
  setTimeout(() => {
    selectedFiles = [];
    refreshFileList();
    elements.peopleEntries.innerHTML = "";
    elements.peopleEntriesWrap.hidden = true;
    elements.locationSection.innerHTML = `<option value="">Select campus first</option>`;
    elements.locationSection.disabled = true;
    elements.location.innerHTML = `<option value="">Select building or area first</option>`;
    elements.location.disabled = true;
    elements.otherLocationWrap.hidden = true;
    elements.roomNumber.disabled = false;
    if (auth.officer?.name) elements.submittedBy.value = auth.officer.name;
    setDefaultDateTime();
    if (currentMode === "incident") updateSelectedReportFeature();
    buildStepper();
  }, 0);
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  resetResult();
  const validationError = validateBeforeSubmit();
  if (validationError) { showResult("bad", escapeHtml(validationError)); return; }

  const payload = getFormPayload();
  elements.submitButton.disabled = true;
  elements.submitButton.textContent = "Preparing files…";

  try {
    payload.attachments = await prepareAttachments();
    elements.submitButton.textContent = "Submitting…";
    const result = await apiPost("/api/submit-report", payload);
    const label = result.reportType || reportTypes[payload.reportType]?.label || payload.activityType || payload.reportType;
    const fileLine = result.attachmentsSaved ? ` · ${result.attachmentCount} file${result.attachmentCount === 1 ? "" : "s"}` : "";
    showConfirm(result.reportId, `${label} · ${payload.dateOfIncident} ${friendlyTime(payload.timeOfIncident)}${fileLine}`);
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

/* --- stepper (mobile) + progress rail (desktop) --- */

let stepIndex = 0;

function visibleSections() {
  return Array.from(elements.form.querySelectorAll(".form-section[data-step]"))
    .filter((section) => !section.hidden);
}

function isMobile() { return window.matchMedia("(max-width: 860px)").matches; }

function buildStepper() {
  const sections = visibleSections();
  const rail = el("progressRail");
  rail.innerHTML = sections.map((section, index) =>
    `<button type="button" class="rail-step" data-index="${index}"><span class="rail-dot"></span>${escapeHtml(section.dataset.step)}</button>`).join("");
  rail.querySelectorAll(".rail-step").forEach((button) => {
    button.addEventListener("click", () => {
      if (isMobile()) { stepIndex = Number(button.dataset.index); applyStepper(); }
      else visibleSections()[Number(button.dataset.index)].scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  stepIndex = 0;
  applyStepper();
}

function applyStepper() {
  const sections = visibleSections();
  const mobile = isMobile();
  el("stepperNav").hidden = !mobile;
  el("formActions").style.display = mobile && stepIndex < sections.length - 1 ? "none" : "";

  sections.forEach((section, index) => {
    section.style.display = mobile && index !== stepIndex ? "none" : "";
  });

  el("stepDots").innerHTML = sections.map((section, index) =>
    `<span class="dot ${index === stepIndex ? "on" : index < stepIndex ? "done" : ""}"></span>`).join("");
  el("stepBack").disabled = stepIndex === 0;
  el("stepNext").style.visibility = stepIndex >= sections.length - 1 ? "hidden" : "visible";

  document.querySelectorAll(".rail-step").forEach((button, index) => {
    button.classList.toggle("on", index === stepIndex && mobile);
  });
}

el("stepBack").addEventListener("click", () => { if (stepIndex > 0) { stepIndex--; applyStepper(); window.scrollTo({ top: 0, behavior: "smooth" }); } });
el("stepNext").addEventListener("click", () => {
  const sections = visibleSections();
  if (stepIndex < sections.length - 1) { stepIndex++; applyStepper(); window.scrollTo({ top: 0, behavior: "smooth" }); }
});
window.addEventListener("resize", () => { if (VIEWS[currentView]?.elId === "view-reports") applyStepper(); });

/* --- rapid log --- */

let rapidChip = "";

function buildRapidChips(types) {
  const target = el("rapidChips");
  target.innerHTML = types.slice(0, 8).map((type) =>
    `<button type="button" class="chip" data-type="${escapeHtml(type)}">${escapeHtml(type)}</button>`).join("");
  target.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      rapidChip = chip.dataset.type;
      target.querySelectorAll(".chip").forEach((other) => other.classList.toggle("on", other === chip));
    });
  });
  populateSelect(el("rapidCampus"), Object.keys(locationGroups), "Campus");
  const remembered = JSON.parse(localStorage.getItem("phs-rapid") || "{}");
  if (remembered.campus) { el("rapidCampus").value = remembered.campus; fillRapidLocations(remembered.location); }
}

function fillRapidLocations(selectValue) {
  const groups = locationGroups[el("rapidCampus").value] || {};
  const flat = Object.values(groups).flat().filter((location) => location !== "Other");
  populateSelect(el("rapidLocation"), flat, "Location");
  if (selectValue) el("rapidLocation").value = selectValue;
}

el("rapidCampus").addEventListener("change", () => fillRapidLocations());

el("rapidForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const campus = el("rapidCampus").value;
  const location = el("rapidLocation").value;
  const text = el("rapidText").value.trim();
  if (!campus || !location) { alert("Pick a campus and location once — they're remembered."); return; }
  if (!rapidChip) { alert("Tap an activity type chip."); return; }
  if (!text) return;

  localStorage.setItem("phs-rapid", JSON.stringify({ campus, location }));
  const now = localDateTimeParts();
  const groups = locationGroups[campus];
  const building = Object.keys(groups).find((group) => groups[group].includes(location)) || "";

  const button = el("rapidForm").querySelector("button[type='submit']");
  button.disabled = true;

  try {
    const result = await apiPost("/api/submit-report", {
      formMode: "daily", reportType: "daily_activity", activityType: rapidChip,
      submittedBy: auth.officer?.name || el("submittedBy").value || "Officer",
      dateOfIncident: now.date, timeOfIncident: now.time,
      campus, building, locationSection: building, location,
      roomNumber: "N/A", summary: text,
      priority: "", actionTaken: "", peopleInvolvedChoice: "", peopleInvolved: "", peopleInvolvedJson: "[]",
      attachments: []
    });
    const log = el("rapidLog");
    log.insertAdjacentHTML("afterbegin",
      `<li class="fade-up"><span class="key-id">${escapeHtml(result.reportId)}</span> ${escapeHtml(now.time)} · ${escapeHtml(rapidChip)} · ${escapeHtml(text)}</li>`);
    el("rapidText").value = "";
    el("rapidText").focus();
  } catch (err) {
    alert("Not saved: " + err.message);
  } finally {
    button.disabled = false;
  }
});

/* ---------------- DASHBOARD ---------------- */

let dashboardLoadedAt = 0;

async function loadDashboard(force) {
  if (!force && Date.now() - dashboardLoadedAt < 60 * 1000) return;
  dashboardLoadedAt = Date.now();
  loadAnnouncements();
  loadWeather();
  loadCheckoutWidget();
  loadCalendar();
  loadBolos("boloDash", 2, false);
  loadPassdown("passdownRecent", 24, 4);
}

async function loadAnnouncements() {
  const target = el("announceBanners");
  try {
    const data = await hubAction("listAnnouncements");
    target.innerHTML = (data.active || []).map((item) => `
      <div class="announce-banner fade-up">
        <svg class="ic big"><use href="#i-mega"/></svg>
        <div class="ab-body">
          <p class="ab-label">From Security Operations</p>
          <p class="ab-msg">${escapeHtml(item.message)}</p>
        </div>
        <span class="ab-meta">${escapeHtml(item.postedBy)} · expires ${escapeHtml(item.expires)}</span>
      </div>`).join("");
  } catch { target.innerHTML = ""; }
}

async function loadWeather() {
  const target = el("weatherWidget");
  try {
    const data = await apiGet("/api/weather");
    target.innerHTML = `
      <div class="widget-big count-in">${escapeHtml(String(data.current.temp))}°</div>
      <div class="widget-detail">${escapeHtml(data.current.conditions)} · feels ${escapeHtml(String(data.current.feelsLike))}° · wind ${escapeHtml(String(data.current.wind))} mph</div>
      <div class="widget-detail">Today: ${escapeHtml(String(data.today.high))}° / ${escapeHtml(String(data.today.low))}° · ${escapeHtml(String(data.today.precipChance))}% precip</div>`;
  } catch (err) {
    target.innerHTML = `<span class="widget-loading">Weather unavailable — ${escapeHtml(err.message)}</span>`;
  }
}

function checkoutLine(item, kindLabel) {
  const overdue = hoursSince(item.timeOfIssue) > (metadata.overdueHours || 12);
  return `<li class="${overdue ? "overdue" : ""}">
    <span class="key-id">${escapeHtml(item.checkoutId)}</span> ${escapeHtml(item.keyName)} — ${escapeHtml(item.vendorEmployee)}
    ${overdue ? `<span class="overdue-tag">OVERDUE ${Math.floor(hoursSince(item.timeOfIssue))}h</span>` : ""}</li>`;
}

async function loadCheckoutWidget() {
  const target = el("keysWidget");
  try {
    const [keys, equipment] = await Promise.all([hubAction("listOpenKeys"), hubAction("listOpenEqp")]);
    metadata.overdueHours = keys.overdueHours || metadata.overdueHours;
    const all = [...keys.open, ...equipment.open];
    const overdueCount = all.filter((item) => hoursSince(item.timeOfIssue) > metadata.overdueHours).length;
    if (!all.length) {
      target.innerHTML = `<div class="widget-big count-in">0</div><div class="widget-detail">All keys and equipment accounted for.</div>`;
      return;
    }
    all.sort((a, b) => hoursSince(b.timeOfIssue) - hoursSince(a.timeOfIssue));
    target.innerHTML = `
      <div class="widget-big count-in">${all.length}${overdueCount ? ` <span class="overdue-inline">· ${overdueCount} overdue</span>` : ""}</div>
      <ul class="keys-out-names">${all.slice(0, 4).map((item) => checkoutLine(item)).join("")}
      ${all.length > 4 ? `<li>… and ${all.length - 4} more</li>` : ""}</ul>`;
  } catch (err) {
    target.innerHTML = `<span class="widget-loading">Unavailable — ${escapeHtml(err.message)}</span>`;
  }
}

/* --- calendar --- */

function dayLabel(dateStr, todayStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const monthDay = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { code: monthDay, name: dateStr === todayStr ? `${weekday} — Today` : weekday };
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
    (data.events || []).forEach((event) => { (byDate[event.date] ||= []).push(event); });
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
      html += `<details ${isToday ? "open" : ""}>
        <summary><span class="day-date">${escapeHtml(label.code)}</span><span>${escapeHtml(label.name)}</span>
        ${isToday ? `<span class="today-pill">TODAY</span>` : ""}
        <span class="day-count">${events.length ? `${events.length} event${events.length === 1 ? "" : "s"}` : "—"}</span></summary>
        ${eventsHtml}</details>`;
    });
    target.innerHTML = html || `<p class="widget-loading">No calendar data.</p>`;
  } catch (err) {
    target.innerHTML = `<div class="cal-error">Calendar unavailable — ${escapeHtml(err.message)}</div>`;
  }
}

el("dashLookupForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const value = el("dashLookupInput").value.trim();
  if (!value) return;
  el("lookupInput").value = value;
  window.location.hash = "#lookup";
  setTimeout(() => el("lookupForm").requestSubmit(), 200);
});

/* ---------------- B.O.L.O.s ---------------- */

const boloForm = el("boloForm");
el("boloToggle").addEventListener("click", () => {
  boloForm.hidden = !boloForm.hidden;
  if (!boloForm.hidden && !el("boloExpires").value) {
    el("boloExpires").value = localDateTimeParts(new Date(Date.now() + 7 * 86400000)).date;
  }
});
el("boloCancel").addEventListener("click", () => { boloForm.hidden = true; });

boloForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = boloForm.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    await hubAction("boloSubmit", {
      boloType: el("boloType").value, subject: el("boloSubject").value.trim(),
      details: el("boloDetails").value.trim(), expires: el("boloExpires").value,
      postedBy: auth.officer?.name || "Officer"
    });
    boloForm.reset(); boloForm.hidden = true;
    loadBolos("boloList", 0, true);
    dashboardLoadedAt = 0;
  } catch (err) { alert("B.O.L.O. not posted: " + err.message); }
  finally { button.disabled = false; }
});

async function loadBolos(targetId, limit, withResolve) {
  const target = el(targetId);
  try {
    const data = await hubAction("listBolos");
    let items = data.active || [];
    if (limit) items = items.slice(0, limit);
    if (!items.length) { target.innerHTML = `<p class="widget-loading">No active B.O.L.O.s.</p>`; return; }
    target.innerHTML = items.map((item) => `
      <div class="bolo-item fade-up">
        <span class="bolo-type">${escapeHtml(item.type)}</span>
        <h4>${escapeHtml(item.subject)}</h4>
        <p>${escapeHtml(item.details)}</p>
        <div class="bolo-meta"><span>Posted by ${escapeHtml(item.postedBy)}</span><span>Expires ${escapeHtml(item.expires)}</span>
        ${withResolve ? `<button class="bolo-resolve" data-advisory="${escapeHtml(item.advisoryId)}" type="button">Resolve</button>` : ""}</div>
      </div>`).join("");
    if (withResolve) target.querySelectorAll(".bolo-resolve").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!confirm("Mark this B.O.L.O. resolved?")) return;
        button.disabled = true;
        try {
          await hubAction("boloResolve", { advisoryId: button.dataset.advisory, resolvedBy: auth.officer?.name || "Officer" });
          loadBolos(targetId, limit, withResolve);
          dashboardLoadedAt = 0;
        } catch (err) { alert("Could not resolve: " + err.message); button.disabled = false; }
      });
    });
  } catch (err) { target.innerHTML = `<p class="widget-loading">Unavailable — ${escapeHtml(err.message)}</p>`; }
}

/* ---------------- CHECKOUTS (keys + equipment) ---------------- */

let checkoutSuggestions = { key: [], equipment: [] };

const CHECKOUT_UI = {
  key: {
    title: "Check out a key or keycard", code: "Form KC&#8209;03 <span class='form-code-org'>&middot; Vendor Key Checkout</span>",
    side: "Keys currently out", item: "Key / keycard", badge: true,
    actions: { submit: "keyCheckout", list: "listOpenKeys", ret: "keyReturn" }
  },
  equipment: {
    title: "Check out equipment", code: "Form EQ&#8209;05 <span class='form-code-org'>&middot; Equipment Checkout</span>",
    side: "Equipment currently out", item: "Equipment item", badge: false,
    actions: { submit: "eqpCheckout", list: "listOpenEqp", ret: "eqpReturn" }
  }
};

function fillItemSuggestions() {
  el("itemSuggestions").innerHTML = (checkoutSuggestions[checkoutKind] || [])
    .map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
}

function setCheckoutKind(kind) {
  checkoutKind = kind;
  const ui = CHECKOUT_UI[kind];
  el("coFormCode").innerHTML = ui.code;
  el("coTitle").textContent = ui.title;
  el("coSideTitle").textContent = ui.side;
  el("itemLabel").innerHTML = `${ui.item} <span class="required">*</span>`;
  el("badgeLabel").innerHTML = ui.badge ? `Contractor badge issued <span class="required">*</span>` : `Badge / ID (optional)`;
  el("badgeIssued").required = ui.badge;
  el("coOverdueHours").textContent = metadata.overdueHours || 12;
  el("coConfirmCard").hidden = true;
  el("checkoutForm").hidden = false;
  fillItemSuggestions();
  setCheckoutDefaultTime();
  loadOpenCheckouts();
}

function setCheckoutDefaultTime() {
  const input = el("timeOfIssue");
  if (!input.value) { const now = localDateTimeParts(); input.value = `${now.date}T${now.time}`; }
}

el("coStartAnotherButton").addEventListener("click", () => {
  el("coConfirmCard").hidden = true;
  el("checkoutForm").hidden = false;
  el("checkoutForm").reset();
  if (auth.officer?.name) el("issuingOfficer").value = auth.officer.name;
  setCheckoutDefaultTime();
});

el("checkoutForm").addEventListener("reset", () => setTimeout(() => {
  if (auth.officer?.name) el("issuingOfficer").value = auth.officer.name;
  setCheckoutDefaultTime();
}, 0));

el("checkoutForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const resultBox = el("coResultBox");
  resultBox.hidden = true;
  const button = el("coSubmitButton");
  button.disabled = true; button.textContent = "Recording…";
  try {
    const data = await hubAction(CHECKOUT_UI[checkoutKind].actions.submit, {
      vendorEmployee: el("vendorEmployee").value.trim(),
      vendorCompany: el("vendorCompany").value.trim(),
      badgeIssued: el("badgeIssued").value.trim(),
      keyName: el("itemName").value.trim(),
      timeOfIssue: el("timeOfIssue").value.replace("T", " "),
      issuingOfficer: el("issuingOfficer").value.trim(),
      remarks: el("coRemarks").value.trim()
    });
    el("coConfirmNumber").textContent = data.checkoutId;
    el("coConfirmNumber").classList.remove("stamp-run"); void el("coConfirmNumber").offsetWidth;
    el("coConfirmNumber").classList.add("stamp-run");
    el("coConfirmMeta").textContent = `${el("itemName").value.trim()} → ${el("vendorEmployee").value.trim()} (${el("vendorCompany").value.trim()})`;
    el("checkoutForm").hidden = true;
    el("coConfirmCard").hidden = false;
    if (!checkoutSuggestions[checkoutKind].includes(el("itemName").value.trim())) {
      checkoutSuggestions[checkoutKind].unshift(el("itemName").value.trim());
    }
    loadOpenCheckouts();
    dashboardLoadedAt = 0;
  } catch (err) {
    resultBox.hidden = false;
    resultBox.className = "result bad";
    resultBox.innerHTML = `<strong>Checkout not recorded.</strong><br>${escapeHtml(err.message)}`;
  } finally { button.disabled = false; button.textContent = "Record checkout"; }
});

async function loadOpenCheckouts() {
  const target = el("openCheckoutList");
  const ui = CHECKOUT_UI[checkoutKind];
  try {
    const data = await hubAction(ui.actions.list);
    metadata.overdueHours = data.overdueHours || metadata.overdueHours;
    el("coOverdueHours").textContent = metadata.overdueHours;
    if (!data.count) { target.innerHTML = `<p class="widget-loading">Nothing out. All accounted for.</p>`; return; }
    const sorted = data.open.slice().sort((a, b) => hoursSince(b.timeOfIssue) - hoursSince(a.timeOfIssue));
    target.innerHTML = sorted.map((item) => {
      const overdue = hoursSince(item.timeOfIssue) > metadata.overdueHours;
      return `<div class="open-key-item fade-up ${overdue ? "is-overdue" : ""}">
        <span class="ok-id">${escapeHtml(item.checkoutId)}</span>
        ${overdue ? `<span class="overdue-tag">OVERDUE ${Math.floor(hoursSince(item.timeOfIssue))}h</span>` : ""}
        <h4>${escapeHtml(item.keyName)}</h4>
        <div class="ok-meta">${escapeHtml(item.vendorEmployee)} — ${escapeHtml(item.vendorCompany)}${item.badgeIssued ? ` · badge ${escapeHtml(item.badgeIssued)}` : ""}<br>
        Issued ${escapeHtml(item.timeOfIssue)} by ${escapeHtml(item.issuingOfficer)}${item.remarks ? `<br>${escapeHtml(item.remarks)}` : ""}</div>
        <button class="return-button" data-checkout="${escapeHtml(item.checkoutId)}" type="button">Mark returned</button>
      </div>`;
    }).join("");
    target.querySelectorAll(".return-button").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!confirm(`Mark ${button.dataset.checkout} returned?`)) return;
        button.disabled = true; button.textContent = "Recording…";
        try {
          await hubAction(ui.actions.ret, { checkoutId: button.dataset.checkout, returningOfficer: auth.officer?.name || "Officer" });
          loadOpenCheckouts();
          dashboardLoadedAt = 0;
        } catch (err) { alert("Return not recorded: " + err.message); button.disabled = false; button.textContent = "Mark returned"; }
      });
    });
  } catch (err) { target.innerHTML = `<p class="widget-loading">Unavailable — ${escapeHtml(err.message)}</p>`; }
}

/* ---------------- PASS-DOWN ---------------- */

el("passdownForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const resultBox = el("passdownResultBox");
  resultBox.hidden = true;
  const button = el("passdownSubmitButton");
  button.disabled = true; button.textContent = "Saving…";
  try {
    await hubAction("passdownSubmit", {
      shift: el("passdownShift").value, notes: el("passdownNotes").value.trim(),
      flagged: el("passdownFlagged").checked ? "Yes" : "",
      relatedReport: el("passdownRelated").value.trim(),
      officer: auth.officer?.name || "Officer"
    });
    resultBox.hidden = false; resultBox.className = "result good";
    resultBox.innerHTML = `<strong>Pass-down saved.</strong> The next shift will see it on the dashboard.`;
    el("passdownForm").reset();
    loadPassdown("passdownList", 48);
    dashboardLoadedAt = 0;
  } catch (err) {
    resultBox.hidden = false; resultBox.className = "result bad";
    resultBox.innerHTML = `<strong>Not saved.</strong><br>${escapeHtml(err.message)}`;
  } finally { button.disabled = false; button.textContent = "Save pass-down"; }
});

async function loadPassdown(targetId, hours, limit) {
  const target = el(targetId);
  try {
    const data = await hubAction("listPassdown", { hours });
    let entries = data.entries || [];
    if (limit) entries = entries.slice(0, limit);
    if (!entries.length) { target.innerHTML = `<p class="widget-loading">No entries in the last ${hours} hours.</p>`; return; }
    target.innerHTML = entries.map((entry) => {
      const when = new Date(entry.timestamp).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
      return `<div class="passdown-item fade-up ${entry.flagged ? "flagged" : ""}">
        <div class="pd-meta">${entry.flagged ? `<span class="pd-flag">⚑ Flagged</span>` : ""}
        <span>${escapeHtml(when)}</span><span>${escapeHtml(entry.shift)}</span><span>${escapeHtml(entry.officer)}</span>
        ${entry.relatedReport ? `<span class="pd-report">${escapeHtml(entry.relatedReport)}</span>` : ""}</div>
        ${escapeHtml(entry.notes)}</div>`;
    }).join("");
  } catch (err) { target.innerHTML = `<p class="widget-loading">Unavailable — ${escapeHtml(err.message)}</p>`; }
}

/* ---------------- FOLLOW-UPS ---------------- */

async function loadFollowUps(targetId, canClose) {
  const target = el(targetId);
  try {
    const data = await hubAction("listFollowUps");
    if (!data.count) { target.innerHTML = `<p class="widget-loading">Nothing open. All reports closed.</p>`; return; }
    target.innerHTML = data.open.map((item) => `
      <div class="followup-item fade-up">
        <div class="fu-head">
          <span class="key-id">${escapeHtml(item.reportId)}</span>
          <strong>${escapeHtml(item.reportType)}</strong>
          ${item.priority ? `<span class="pill small ${item.priority === "Urgent" || item.priority === "High" ? "hot" : ""}">${escapeHtml(item.priority)}</span>` : ""}
          <span class="fu-status">${escapeHtml(item.status)}</span>
        </div>
        <p class="fu-meta">${escapeHtml(item.campus.split("/")[0].trim())} · ${escapeHtml(item.location)} · ${escapeHtml(item.submittedBy)}</p>
        <p class="fu-narr">${escapeHtml(item.narrative)}${item.narrative.length >= 200 ? "…" : ""}</p>
        ${canClose ? `<button class="secondary small fu-close" data-report="${escapeHtml(item.reportId)}" type="button"><svg class="ic"><use href="#i-check"/></svg> Close with note</button>` : ""}
      </div>`).join("");
    if (canClose) target.querySelectorAll(".fu-close").forEach((button) => {
      button.addEventListener("click", async () => {
        const note = prompt(`Closing ${button.dataset.report} — resolution note (optional):`);
        if (note === null) return;
        button.disabled = true;
        try {
          await hubAction("closeFollowUp", { reportId: button.dataset.report, note, closedBy: auth.officer?.name || "Supervisor" });
          loadFollowUps(targetId, canClose);
        } catch (err) { alert("Could not close: " + err.message); button.disabled = false; }
      });
    });
  } catch (err) { target.innerHTML = `<p class="widget-loading">Unavailable — ${escapeHtml(err.message)}</p>`; }
}

/* ---------------- LOOKUP & PRINT ---------------- */

let lastLookup = null;

el("lookupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const target = el("lookupResult");
  target.hidden = false;
  target.innerHTML = `<span class="widget-loading">Searching…</span>`;
  try {
    const data = await hubAction("lookupReport", { reportId: el("lookupInput").value.trim() });
    if (!data.found) {
      lastLookup = null;
      target.innerHTML = `No report found for <span class="lr-id">${escapeHtml(data.reportId)}</span>.`;
      return;
    }
    const r = data.report;
    lastLookup = r;
    const when = r.timestamp ? new Date(r.timestamp).toLocaleString("en-US") : "";
    target.innerHTML = `
      <div class="lr-head"><span class="lr-id">${escapeHtml(r.reportId)}</span> — ${escapeHtml(r.reportType)}
        <button class="secondary small" id="printReportButton" type="button"><svg class="ic"><use href="#i-print"/></svg> Print report</button>
      </div>
      <dl>
        <dt>Filed</dt><dd>${escapeHtml(when)}</dd>
        <dt>Filed by</dt><dd>${escapeHtml(r.submittedBy)}</dd>
        <dt>Campus</dt><dd>${escapeHtml(r.campus)}</dd>
        <dt>Building / Area</dt><dd>${escapeHtml(r.areaGroup || "")}</dd>
        <dt>Location</dt><dd>${escapeHtml(r.location)}</dd>
        ${r.priority ? `<dt>Priority</dt><dd>${escapeHtml(r.priority)}</dd>` : ""}
        <dt>Status</dt><dd>${escapeHtml(r.status)}</dd>
        <dt>Attachments</dt><dd>${escapeHtml(String(r.attachmentCount || 0))}</dd>
        <dt>Narrative</dt><dd class="pre">${escapeHtml(r.narrative)}</dd>
      </dl>`;
    el("printReportButton").addEventListener("click", printReport);
  } catch (err) {
    target.innerHTML = `Lookup failed — ${escapeHtml(err.message)}`;
  }
});

function printReport() {
  if (!lastLookup) return;
  const r = lastLookup;
  const when = r.timestamp ? new Date(r.timestamp).toLocaleString("en-US") : "";
  el("printArea").innerHTML = `
    <div class="print-doc">
      <div class="print-head">
        <div><p class="print-org">Pembroke Hill School — Security Operations</p>
        <p class="print-type">${escapeHtml(r.reportType)}</p></div>
        <p class="print-id">${escapeHtml(r.reportId)}</p>
      </div>
      <table class="print-table">
        <tr><th>Filed</th><td>${escapeHtml(when)}</td><th>Filed by</th><td>${escapeHtml(r.submittedBy)}</td></tr>
        <tr><th>Campus</th><td>${escapeHtml(r.campus)}</td><th>Location</th><td>${escapeHtml(r.location)}</td></tr>
        <tr><th>Priority</th><td>${escapeHtml(r.priority || "—")}</td><th>Status</th><td>${escapeHtml(r.status)}</td></tr>
        <tr><th>Attachments</th><td colspan="3">${escapeHtml(String(r.attachmentCount || 0))} (stored digitally — see the Security Hub)</td></tr>
      </table>
      <p class="print-section">Narrative</p>
      <p class="print-narr">${escapeHtml(r.narrative)}</p>
      <p class="print-foot">Printed ${new Date().toLocaleString("en-US")} · PHS Security Hub · This document may contain confidential information.</p>
    </div>`;
  document.body.classList.add("printing");
  window.print();
  setTimeout(() => document.body.classList.remove("printing"), 500);
}

/* ---------------- GATES ---------------- */

let gatesData = null;

async function loadGatesData() {
  if (gatesData) return gatesData;
  gatesData = await (await fetch("data/gates-schedule.json")).json();
  return gatesData;
}

function todayStr() { return localDateTimeParts().date; }

function gateStateNow(gate, data, now = new Date()) {
  const today = todayStr();
  if ((data.closedDates || []).includes(today)) return { open: false, closedDay: true };
  const isLateStart = (data.lateStartDates || []).includes(today);

  const day = now.getDay() === 0 ? 7 : now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const toMinutes = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

  const applicable = (gate.windows || []).filter((window) => {
    if (window.onlyLateStart && !isLateStart) return false;
    if (window.skipLateStart && isLateStart) return false;
    return window.days.includes(day);
  });

  for (const window of applicable) {
    if (minutes >= toMinutes(window.open) && minutes < toMinutes(window.close)) {
      return { open: true, label: window.label || "", until: window.close };
    }
  }
  let next = null;
  for (const window of applicable) {
    const open = toMinutes(window.open);
    if (open > minutes && (next === null || open < next.openMin)) next = { openMin: open, at: window.open };
  }
  return { open: false, next };
}

async function renderGates() {
  const target = el("gatesContent");
  try {
    const data = await loadGatesData();
    el("gatesSampleBanner").hidden = !data.sample;
    const closedToday = (data.closedDates || []).includes(todayStr());
    const lateToday = (data.lateStartDates || []).includes(todayStr());
    const dayNote = closedToday ? `<div class="sample-banner">No school today — all gates scheduled closed.</div>`
      : lateToday ? `<div class="sample-banner">Late start today — late-start windows apply.</div>` : "";
    target.innerHTML = dayNote + data.campuses.map((campus) => `
      <div class="gates-campus">
        <h3>${escapeHtml(campus.name)}</h3>
        <table class="gates-table">
          <thead><tr><th>Gate</th><th>Status now</th><th>Schedule</th></tr></thead>
          <tbody>
            ${campus.gates.map((gate) => {
              const state = gateStateNow(gate, data);
              const status = state.closedDay ? `<span class="gate-status closed">CLOSED · no school</span>`
                : state.open ? `<span class="gate-status open">OPEN${state.until ? ` · closes ${friendlyTime(state.until)}` : ""}</span>`
                : `<span class="gate-status closed">CLOSED${state.next ? ` · opens ${friendlyTime(state.next.at)}` : ""}</span>`;
              const schedule = (gate.windows || []).length
                ? gate.windows.map((window) => `<span class="gate-window">${friendlyTime(window.open)}–${friendlyTime(window.close)}
                    <span class="gw-label">${escapeHtml(window.label || "")}${window.onlyLateStart ? " (late start)" : ""} (${window.days.map((d) => "MTWTFSS"[d - 1]).join("")})</span></span>`).join("")
                : `<span class="gate-none">Locked — opened on request only</span>`;
              return `<tr><td><strong>${escapeHtml(gate.name)}</strong></td><td>${status}</td><td>${schedule}</td></tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`).join("");
  } catch (err) { target.innerHTML = `<p class="widget-loading">Gate schedule unavailable — ${escapeHtml(err.message)}</p>`; }
}

setInterval(() => { if (currentView === "gates") renderGates(); }, 60 * 1000);

/* ---------------- POST ORDERS & CONTACTS ---------------- */

async function renderPostOrders() {
  const target = el("postOrdersContent");
  if (target.dataset.loaded) return;
  try {
    const data = await (await fetch("data/post-orders.json")).json();
    target.innerHTML = (data.sections || []).map((section) => `
      <div class="po-section">
        <div class="po-section-head"><span class="po-code">${escapeHtml(section.code)}</span><h3>${escapeHtml(section.title)}</h3></div>
        <p class="po-desc">${escapeHtml(section.description)}</p>
        ${(section.groups || []).map((group) => `
          <p class="po-campus">${escapeHtml(group.campus)}</p>
          <div class="po-cards">
            ${(group.posts || []).map((post) => post.file
              ? `<div class="po-card"><strong>${escapeHtml(post.name)}</strong><a href="docs/post-orders/${encodeURIComponent(post.file)}" target="_blank" rel="noopener">Open PDF →</a></div>`
              : `<div class="po-card pending"><strong>${escapeHtml(post.name)}</strong><span class="po-pending">Document pending</span></div>`).join("")}
          </div>`).join("")}
      </div>`).join("");
    target.dataset.loaded = "1";
  } catch (err) { target.innerHTML = `<p class="widget-loading">Post orders unavailable — ${escapeHtml(err.message)}</p>`; }
}

async function renderContacts(targetId) {
  const target = el(targetId);
  if (target.dataset.loaded) return;
  try {
    const data = await (await fetch("data/contacts.json")).json();
    target.innerHTML = (data.contacts || []).map((contact) => {
      const telHref = contact.value.replace(/[^\d+]/g, "");
      const isPhone = /\d{7}/.test(telHref);
      return `<li><span><svg class="ic"><use href="#i-phone"/></svg> ${escapeHtml(contact.label)}</span>${isPhone
        ? `<a href="tel:${escapeHtml(telHref)}">${escapeHtml(contact.value)}</a>` : `<span>${escapeHtml(contact.value)}</span>`}</li>`;
    }).join("");
    target.dataset.loaded = "1";
  } catch { target.innerHTML = `<li>Contacts unavailable.</li>`; }
}

/* ---------------- SHIFT COMMAND (supervisors) ---------------- */

const annForm = el("annForm");
el("annToggle").addEventListener("click", () => {
  annForm.hidden = !annForm.hidden;
  if (!annForm.hidden && !el("annExpires").value) {
    el("annExpires").value = localDateTimeParts(new Date(Date.now() + 3 * 86400000)).date;
  }
});
el("annCancel").addEventListener("click", () => { annForm.hidden = true; });

annForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = annForm.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    await hubAction("announceSubmit", {
      message: el("annMessage").value.trim(), expires: el("annExpires").value,
      postedBy: auth.officer?.name || "Security Operations"
    });
    annForm.reset(); annForm.hidden = true;
    loadCommand(true);
    dashboardLoadedAt = 0;
  } catch (err) { alert("Announcement not posted: " + err.message); }
  finally { button.disabled = false; }
});

async function loadCommand(force) {
  loadAnnouncementsManage();
  loadPassdownInto("cmdPassdown");
  loadFollowUps("cmdFollowups", true);
  loadCommandCheckouts();
  loadBolos("cmdBolos", 0, true);
  loadCommandToday();
}

async function loadAnnouncementsManage() {
  const target = el("annManageList");
  try {
    const data = await hubAction("listAnnouncements");
    if (!data.count) { target.innerHTML = ""; return; }
    target.innerHTML = data.active.map((item) => `
      <div class="bolo-item ann-item fade-up">
        <p>${escapeHtml(item.message)}</p>
        <div class="bolo-meta"><span>${escapeHtml(item.postedBy)}</span><span>Expires ${escapeHtml(item.expires)}</span>
        <button class="bolo-resolve" data-ann="${escapeHtml(item.announcementId)}" type="button">Take down</button></div>
      </div>`).join("");
    target.querySelectorAll("[data-ann]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!confirm("Remove this announcement?")) return;
        button.disabled = true;
        try {
          await hubAction("announceExpire", { announcementId: button.dataset.ann, removedBy: auth.officer?.name || "Supervisor" });
          loadAnnouncementsManage();
          dashboardLoadedAt = 0;
        } catch (err) { alert("Could not remove: " + err.message); button.disabled = false; }
      });
    });
  } catch { target.innerHTML = ""; }
}

async function loadPassdownInto(targetId) {
  const target = el(targetId);
  try {
    const data = await hubAction("listPassdown", { hours: 24 });
    const flagged = (data.entries || []).filter((entry) => entry.flagged);
    target.innerHTML = flagged.length
      ? flagged.map((entry) => `<div class="passdown-item flagged"><div class="pd-meta"><span>${escapeHtml(entry.shift)}</span><span>${escapeHtml(entry.officer)}</span></div>${escapeHtml(entry.notes)}</div>`).join("")
      : `<p class="widget-loading">Nothing flagged in the last 24 hours.</p>`;
  } catch (err) { target.innerHTML = `<p class="widget-loading">${escapeHtml(err.message)}</p>`; }
}

async function loadCommandCheckouts() {
  const target = el("cmdCheckouts");
  try {
    const [keys, equipment] = await Promise.all([hubAction("listOpenKeys"), hubAction("listOpenEqp")]);
    const all = [...keys.open, ...equipment.open].sort((a, b) => hoursSince(b.timeOfIssue) - hoursSince(a.timeOfIssue));
    target.innerHTML = all.length
      ? `<ul class="keys-out-names">${all.map((item) => checkoutLine(item)).join("")}</ul>`
      : `<p class="widget-loading">All accounted for.</p>`;
  } catch (err) { target.innerHTML = `<p class="widget-loading">${escapeHtml(err.message)}</p>`; }
}

async function loadCommandToday() {
  const target = el("cmdToday");
  try {
    const data = await apiGet("/api/calendar-feed");
    const today = (data.events || []).filter((event) => event.date === data.today);
    target.innerHTML = today.length
      ? `<ul class="cal-events">${today.map((event) => `<li class="cal-event">
          <span class="cal-time">${event.allDay ? "All day" : escapeHtml(friendlyTime(event.time))}</span>
          <span><span class="cal-title">${escapeHtml(event.title)}</span>${event.location ? `<span class="cal-loc">${escapeHtml(event.location)}</span>` : ""}</span></li>`).join("")}</ul>`
      : `<p class="widget-loading">No scheduled events today.</p>`;
  } catch (err) { target.innerHTML = `<p class="widget-loading">${escapeHtml(err.message)}</p>`; }
}

/* ---------------- WEEKLY STATS (supervisors) ---------------- */

function barBlock(title, entries, ramp) {
  const max = Math.max(1, ...entries.map(([, value]) => value));
  return `<div class="stat-block"><h3>${escapeHtml(title)}</h3>
    ${entries.map(([label, value]) => `
      <div class="stat-row"><span class="stat-label">${escapeHtml(label)}</span>
      <span class="stat-bar-wrap"><span class="stat-bar ${ramp}" style="width:${Math.round((value / max) * 100)}%"></span></span>
      <span class="stat-value">${value}</span></div>`).join("")}</div>`;
}

async function loadStats() {
  const target = el("statsContent");
  target.innerHTML = `<p class="widget-loading">Crunching the last 8 weeks…</p>`;
  try {
    const data = await hubAction("statsSummary", { weeks: 8 });
    const weeks = Object.entries(data.byWeek).sort((a, b) => a[0].localeCompare(b[0]));
    const types = Object.entries(data.byType).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const campuses = Object.entries(data.byCampus).sort((a, b) => b[1] - a[1]);
    target.innerHTML = `
      <div class="metric-row">
        <div class="metric"><span class="metric-num count-in">${data.totalReports}</span><span class="metric-label">Reports filed</span></div>
        <div class="metric"><span class="metric-num count-in">${data.keyCheckouts}</span><span class="metric-label">Key checkouts</span></div>
        <div class="metric"><span class="metric-num count-in">${data.equipmentCheckouts}</span><span class="metric-label">Equipment checkouts</span></div>
        <div class="metric"><span class="metric-num count-in">${data.activeBolos}</span><span class="metric-label">Active B.O.L.O.s</span></div>
      </div>
      ${weeks.length ? barBlock("Reports by week", weeks, "bar-navy") : ""}
      ${types.length ? barBlock("By report type", types, "bar-crimson") : ""}
      ${campuses.length ? barBlock("By campus", campuses, "bar-gold") : ""}
      <p class="helper">Numbers cover the last ${data.weeks} weeks. Source: Reports Index, Key Checkouts, Equipment Checkouts.</p>`;
  } catch (err) { target.innerHTML = `<p class="widget-loading">Stats unavailable — ${escapeHtml(err.message)}</p>`; }
}

/* ---------------- PWA & BOOT ---------------- */

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

(async function boot() {
  await initAuth();
  buildNav();
  setDefaultDateTime();
  route();
  loadMetadata();
})();
