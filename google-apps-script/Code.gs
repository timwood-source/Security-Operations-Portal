/**
 * PHS FIELD REPORTING — SAFE BACKEND
 * Bound Google Sheet version.
 *
 * SECURITY DESIGN
 * - No DriveApp.
 * - No GmailApp.
 * - File bytes are not saved in Apps Script.
 * - Optional attachments are stored by Netlify Blobs and linked in the Sheet.
 * - No file delete/move/trash functions.
 * - Uses only the current bound spreadsheet.
 * - Uses MailApp only for outgoing report notifications.
 *
 * REQUIRED SETUP
 * 1. Create/open the Google Sheet you want to use.
 * 2. Extensions -> Apps Script.
 * 3. Paste this entire file into Code.gs.
 * 4. Paste the provided appsscript.json manifest.
 * 5. Change CONFIG.ALERT_EMAIL.
 * 6. Run setup().
 * 7. Deploy as Web App.
 */


/************************************************************
 * BASIC CONFIG
 ************************************************************/

const CONFIG = {
  APP_NAME: "PHS Field Reporting",
  SCHOOL_NAME: "Pembroke Hill School",

  // CHANGE THIS BEFORE RUNNING setup()
  ALERT_EMAIL: "Tim.wood@pembrokehill.org",

  // Morning digest hour in 24-hour format. 6 = 6 AM.
  // The digest covers YESTERDAY's reports plus keys still out.
  DAILY_SUMMARY_HOUR: 6,

  TIME_ZONE: "America/Chicago",

  SEND_URGENT_ALERTS: true,

  URGENT_FLAGS: [],

  // Report numbering. Sequential per series, 4-digit padded.
  ID_PAD: 4,
  ID_PREFIX_INCIDENT: "PHS",
  ID_PREFIX_DAILY: "DAR",
  ID_PREFIX_KEY: "KEY",

  // Managed key / keycard list for vendor checkouts (KC-03).
  // Edit this list to add or remove keys. No form code changes needed.
  KEY_LIST: [
    "Master Key — Ward Parkway",
    "Master Key — Wornall",
    "Contractor Keycard 01",
    "Contractor Keycard 02",
    "Contractor Keycard 03",
    "Mechanical Rooms Key",
    "Elevator Key",
    "Roof Access Key",
    "Athletic Facilities Key",
    "Other (note in remarks)"
  ],

  // BOLO / advisory types for the dashboard board.
  BOLO_TYPES: [
    "Trespass Warning",
    "Vehicle of Interest",
    "Person of Interest",
    "Custody Flag",
    "General Advisory"
  ],

  // Pass-down shifts.
  SHIFTS: ["Day Shift", "Evening Shift", "Overnight Shift"]
};


/************************************************************
 * INCIDENT REPORT TYPE CONFIG
 *
 * These are the approved school security incident report types.
 * They are exposed to the Netlify app through ?action=metadata.
 * Each report type includes a short description for helper text.
 *
 * Daily Activity types are built separately.
 ************************************************************/

const MAJOR_REPORT_FIELDS = [
  "reportId",
  "timestamp",
  "reportTypeKey",
  "reportTypeLabel",
  "reportTypeDescription",
  "submittedBy",
  "dateOfIncident",
  "timeOfIncident",
  "campus",
  "building",
  "locationSection",
  "location",
  "priority",
  "peopleInvolvedChoice",
  "peopleInvolved",
  "peopleInvolvedJson",
  "summary",
  "actionTaken",
  "attachmentCount",
  "attachmentLinks",
  "attachmentNote",
  "signatureReceived",
  "status"
];

const MAJOR_REPORT_REQUIRED_FIELDS = [
  "submittedBy",
  "dateOfIncident",
  "timeOfIncident",
  "campus",
  "location",
  "priority",
  "peopleInvolvedChoice",
  "summary",
  "actionTaken"
];

function majorReportType_(label, description) {
  return {
    category: "major",
    label: label,
    description: description,
    sheetName: "Incident Reports",
    includeInDailySummary: true,
    dateColumn: 2,
    fields: MAJOR_REPORT_FIELDS,
    required: MAJOR_REPORT_REQUIRED_FIELDS
  };
}

const DAILY_ACTIVITY_TYPES = [
  "Patrol Check",
  "Door / Gate Check",
  "Student Assist",
  "Staff Assist",
  "Visitor Assist",
  "Traffic / Driveline",
  "Event Coverage",
  "Alarm Check",
  "Unlock / Lockup",
  "Maintenance Notified",
  "Other"
];

const DAILY_ACTIVITY_FIELDS = [
  "reportId",
  "timestamp",
  "submittedBy",
  "dateOfIncident",
  "timeOfIncident",
  "campus",
  "building",
  "locationSection",
  "location",
  "activityType",
  "summary",
  "attachmentCount",
  "attachmentLinks",
  "attachmentNote",
  "status"
];

const DAILY_ACTIVITY_REQUIRED_FIELDS = [
  "submittedBy",
  "dateOfIncident",
  "timeOfIncident",
  "campus",
  "location",
  "activityType",
  "summary"
];

function dailyActivityReportType_() {
  return {
    category: "daily",
    label: "Daily Activity Log",
    description: "Quick officer activity entry for patrols, door checks, assists, traffic posts, event coverage, and routine activity.",
    sheetName: "Daily Activity Log",
    includeInDailySummary: true,
    dateColumn: 2,
    fields: DAILY_ACTIVITY_FIELDS,
    required: DAILY_ACTIVITY_REQUIRED_FIELDS
  };
}

const REPORT_TYPES = {
  daily_activity: dailyActivityReportType_(),

  threat_violence_concern: majorReportType_(
    "Threat / Violence Concern",
    "Threats, violent statements, concerning behavior, or possible risk of harm to a person or campus."
  ),

  weapon_dangerous_item: majorReportType_(
    "Weapon / Dangerous Item",
    "Weapons, ammunition, dangerous objects, or suspected possession of an item that could cause harm."
  ),

  medical_emergency_serious_injury: majorReportType_(
    "Medical Emergency / Serious Injury",
    "Serious injury, illness, EMS response, head injury, seizure, allergic reaction, overdose concern, or medical transport."
  ),

  missing_unaccounted_for_student: majorReportType_(
    "Missing / Unaccounted For Student",
    "A student cannot be located, is separated from supervision, or is not accounted for during school operations."
  ),

  unauthorized_person_trespassing: majorReportType_(
    "Unauthorized Person / Trespassing",
    "Unknown, restricted, banned, or unauthorized person on campus or refusing to follow access procedures."
  ),

  custody_dispute: majorReportType_(
    "Custody Dispute",
    "Custody restriction, unauthorized pickup attempt, court order issue, or parent/guardian access concern."
  ),

  assault_physical_altercation: majorReportType_(
    "Assault / Physical Altercation",
    "Physical fight, assault, unwanted physical contact, or aggressive physical behavior requiring response."
  ),

  abuse_neglect_concern: majorReportType_(
    "Abuse / Neglect Concern",
    "Possible abuse, neglect, unsafe home condition, exploitation, or concern requiring mandated-reporting follow-up."
  ),

  bullying: majorReportType_(
    "Bullying",
    "Repeated or targeted student behavior involving intimidation, humiliation, exclusion, threats, or mistreatment."
  ),

  harassment: majorReportType_(
    "Harassment",
    "Unwanted, inappropriate, intimidating, discriminatory, sexual, threatening, or hostile conduct."
  ),

  self_harm: majorReportType_(
    "Self Harm",
    "Concern that a student may harm themselves, has made self-harm statements, or needs immediate safety support."
  ),

  drug_alcohol_concern: majorReportType_(
    "Drug / Alcohol Concern",
    "Suspected or confirmed possession, use, impairment, distribution, overdose concern, vaping, alcohol, drugs, or paraphernalia."
  ),

  theft_of_school_property: majorReportType_(
    "Theft of School Property",
    "Theft, attempted theft, or unauthorized possession of school-owned property, equipment, keys, supplies, or assets."
  ),

  theft_of_personal_property: majorReportType_(
    "Theft of Personal Property",
    "Theft, attempted theft, or unauthorized possession of personal property belonging to a student, staff member, visitor, or vendor."
  ),

  pembroke_hill_property_damage: majorReportType_(
    "Pembroke Hill Property Damage",
    "Damage, vandalism, graffiti, tampering, or destruction involving Pembroke Hill buildings, grounds, equipment, fixtures, or school-owned property."
  ),

  personal_property_damage: majorReportType_(
    "Personal Property Damage",
    "Damage, vandalism, tampering, or destruction involving property belonging to a student, staff member, parent, visitor, or vendor."
  ),

  life_safety_event: majorReportType_(
    "Life Safety Event",
    "Fire alarm, smoke, evacuation, gas smell, sprinkler activation, blocked exit, or serious life-safety concern."
  ),

  safety_hazard_unsafe_condition: majorReportType_(
    "Safety Hazard / Unsafe Condition",
    "Physical hazard or unsafe condition that creates risk but is not already a fire, medical, crime, or discipline incident."
  ),

  suspicious_activity: majorReportType_(
    "Suspicious Activity",
    "Unusual, concerning, or unexplained behavior, person, vehicle, or pattern requiring security attention or documentation."
  ),

  vehicle_pedestrian_accident: majorReportType_(
    "Vehicle / Pedestrian Accident",
    "Vehicle crash, pedestrian strike, near miss, or vehicle-related accident on or near campus."
  ),

  elopement: majorReportType_(
    "Elopement",
    "Student leaves supervision, an assigned area, building, activity, or campus without permission."
  ),

  sexual_misconduct: majorReportType_(
    "Sexual Misconduct",
    "Sexual behavior, contact, comments, exposure, image-sharing, coercion, boundary violation, or inappropriate sexual conduct."
  ),

  bias_hate_incident: majorReportType_(
    "Bias / Hate Incident",
    "Hate speech, slurs, symbols, intimidation, discrimination, or targeted conduct based on identity or perceived identity."
  ),

  lockdown_event: majorReportType_(
    "Lockdown Event",
    "Lockdown activation, response, failure, accidental activation, building check, or related emergency response documentation."
  ),

  severe_weather_shelter_event: majorReportType_(
    "Severe Weather / Shelter Event",
    "Tornado, severe storm, lightning, flooding, extreme temperature, or weather event requiring sheltering or operational response."
  ),

  centegix_alert: majorReportType_(
    "CENTEGIX Alert",
    "CENTEGIX badge, mobile, staff assist, medical assist, lockdown, accidental activation, or alert response needing documentation."
  ),

  kcpd_response_to_campus: majorReportType_(
    "KCPD Response to Campus",
    "KCPD responds to campus or a school event for an incident beyond normal scheduled coverage."
  ),

  bomb_threat_suspicious_package: majorReportType_(
    "Bomb Threat / Suspicious Package",
    "Bomb threat, suspicious package, unattended item, explosive threat, evacuation, search, or police/fire response."
  ),

  utility_facility_emergency: majorReportType_(
    "Utility / Facility Emergency",
    "Major power, water, gas, HVAC, elevator, plumbing, structural, or building system emergency affecting safety or operations."
  )
};

const STATUS_OPTIONS = [
  "New",
  "Reviewed",
  "Assigned",
  "Resolved",
  "No Action Needed",
  "Archived"
];


/************************************************************
 * SETUP
 ************************************************************/

function setup() {
  validateSetupConfig_();

  const ss = getDatabase_();
  const props = PropertiesService.getScriptProperties();

  let apiToken = props.getProperty("API_TOKEN");

  if (!apiToken) {
    apiToken = generateApiToken_();
    props.setProperty("API_TOKEN", apiToken);
  }

  props.setProperty("ALERT_EMAIL", CONFIG.ALERT_EMAIL);
  props.setProperty("APP_NAME", CONFIG.APP_NAME);
  props.setProperty("TIME_ZONE", CONFIG.TIME_ZONE);

  ensureReportIndex_(ss);
  ensureErrorLog_(ss);
  createSheetsFromConfig_(ss);
  ensureKeySheet_(ss);
  ensurePassdownSheet_(ss);
  ensureBoloSheet_(ss);
  createOrReplaceDailySummaryTrigger_();

  Logger.log("========================================");
  Logger.log(CONFIG.APP_NAME + " setup complete.");
  Logger.log("Spreadsheet URL: " + ss.getUrl());
  Logger.log("API token: " + apiToken);
  Logger.log("Alert email: " + CONFIG.ALERT_EMAIL);
  Logger.log("Drive permissions: NOT USED");
  Logger.log("Gmail permissions: NOT USED");
  Logger.log("Attachment storage: Netlify Blobs links only");
  Logger.log("========================================");
}

function validateSetupConfig_() {
  if (!CONFIG.ALERT_EMAIL || CONFIG.ALERT_EMAIL === "your-email@pembrokehill.org") {
    throw new Error("Update CONFIG.ALERT_EMAIL before running setup().");
  }
}

function createSheetsFromConfig_(ss) {
  const processedSheets = {};

  Object.keys(REPORT_TYPES).forEach(function(typeKey) {
    const type = REPORT_TYPES[typeKey];

    if (processedSheets[type.sheetName]) return;

    let sheet = ss.getSheetByName(type.sheetName);

    if (!sheet) {
      sheet = ss.insertSheet(type.sheetName);
    }

    setupHeaderRow_(sheet, type.fields);
    processedSheets[type.sheetName] = true;
  });
}

function setupHeaderRow_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.autoResizeColumns(1, headers.length);
    return;
  }

  const width = Math.max(sheet.getLastColumn(), headers.length);
  const existingHeaders = sheet.getRange(1, 1, 1, width).getValues()[0];

  let changed = false;

  headers.forEach(function(header, index) {
    if (existingHeaders[index] !== header) {
      sheet.getRange(1, index + 1).setValue(header);
      changed = true;
    }
  });

  if (changed) {
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.autoResizeColumns(1, headers.length);
  }
}

function createOrReplaceDailySummaryTrigger_() {
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "sendDailySummary") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp
    .newTrigger("sendDailySummary")
    .timeBased()
    .everyDays(1)
    .atHour(CONFIG.DAILY_SUMMARY_HOUR)
    .create();
}


/************************************************************
 * WEB ENDPOINTS
 ************************************************************/

function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action || "" : "";

    if (action === "metadata") {
      return jsonResponse_({
        ok: true,
        app: CONFIG.APP_NAME,
        reportTypes: getPublicReportTypes_(),
        dailyActivityTypes: DAILY_ACTIVITY_TYPES,
        statusOptions: STATUS_OPTIONS,
        keyList: CONFIG.KEY_LIST,
        boloTypes: CONFIG.BOLO_TYPES,
        shifts: CONFIG.SHIFTS,
        attachmentsEnabled: true,
        attachmentMessage: "Attachments are stored by Netlify Blobs. Apps Script records links only."
      });
    }

    if (action === "health") {
      return jsonResponse_({
        ok: true,
        app: CONFIG.APP_NAME,
        message: "Backend is online.",
        timestamp: new Date().toISOString(),
        driveAccess: false,
        gmailAccess: false,
        attachmentStorage: "Netlify Blobs"
      });
    }

    return jsonResponse_({
      ok: true,
      app: CONFIG.APP_NAME,
      message: "PHS Field Reporting backend is running.",
      driveAccess: false,
      gmailAccess: false,
      attachmentStorage: "Netlify Blobs"
    });

  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: err.message
    });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  let locked = false;

  try {
    lock.waitLock(10000);
    locked = true;

    const payload = parsePayload_(e);

    validateToken_(payload.token);

    // v3 action routing. Anything without an action is a report submission,
    // which keeps the original submit flow fully backward compatible.
    const action = String(payload.action || "").trim();

    if (action) {
      switch (action) {
        case "keyCheckout":    return jsonResponse_(keyCheckout_(payload));
        case "keyReturn":      return jsonResponse_(keyReturn_(payload));
        case "listOpenKeys":   return jsonResponse_(listOpenKeys_());
        case "passdownSubmit": return jsonResponse_(passdownSubmit_(payload));
        case "listPassdown":   return jsonResponse_(listPassdown_(payload));
        case "boloSubmit":     return jsonResponse_(boloSubmit_(payload));
        case "boloResolve":    return jsonResponse_(boloResolve_(payload));
        case "listBolos":      return jsonResponse_(listBolos_());
        case "lookupReport":   return jsonResponse_(lookupReport_(payload));
        default:
          throw new Error("Unknown action: " + action);
      }
    }

    const reportTypeKey = resolveReportTypeKey_(payload);
    const reportType = REPORT_TYPES[reportTypeKey];

    if (!reportType) {
      throw new Error("Invalid or missing report type: " + String(payload.reportType || ""));
    }

    validateRequiredFields_(payload, reportType);

    const result = saveReport_(payload, reportTypeKey, reportType);

    if (CONFIG.SEND_URGENT_ALERTS && shouldSendUrgentAlert_(payload)) {
      sendUrgentAlert_(payload, result.reportId, reportType);
    }

    return jsonResponse_({
      ok: true,
      reportId: result.reportId,
      reportType: reportType.label,
      message: "Report saved.",
      attachmentsSaved: false
    });

  } catch (err) {
    logError_(err, e);

    return jsonResponse_({
      ok: false,
      error: err.message
    });

  } finally {
    if (locked) {
      lock.releaseLock();
    }
  }
}


/************************************************************
 * PAYLOAD HANDLING
 ************************************************************/

function parsePayload_(e) {
  if (!e) {
    throw new Error("No request received.");
  }

  if (e.postData && e.postData.contents) {
    const raw = e.postData.contents;

    try {
      return JSON.parse(raw);
    } catch (jsonErr) {
      if (e.parameter && e.parameter.payload) {
        return JSON.parse(e.parameter.payload);
      }

      throw new Error("Invalid JSON payload.");
    }
  }

  if (e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }

  if (e.parameter) {
    return e.parameter;
  }

  throw new Error("Empty submission.");
}

function validateToken_(token) {
  const expected = PropertiesService
    .getScriptProperties()
    .getProperty("API_TOKEN");

  if (!expected) {
    throw new Error("API token is not configured. Run setup().");
  }

  if (!token || token !== expected) {
    throw new Error("Invalid API token.");
  }
}

function resolveReportTypeKey_(payload) {
  const rawReportType = String(payload.reportType || "").trim();

  if (REPORT_TYPES[rawReportType]) {
    return rawReportType;
  }

  // Backward-compatible fallback:
  // If the old front end still sends reportType: "incident" and incidentType as the selected title,
  // convert that title into the approved major report type key.
  const rawIncidentType = String(payload.incidentType || "").trim();

  if (rawReportType === "incident" && rawIncidentType) {
    const matchedKey = findReportTypeKeyByLabel_(rawIncidentType);

    if (matchedKey) {
      return matchedKey;
    }
  }

  return rawReportType;
}

function findReportTypeKeyByLabel_(label) {
  const normalizedLabel = String(label || "").trim().toLowerCase();

  for (let i = 0; i < Object.keys(REPORT_TYPES).length; i++) {
    const key = Object.keys(REPORT_TYPES)[i];
    const type = REPORT_TYPES[key];

    if (String(type.label || "").trim().toLowerCase() === normalizedLabel) {
      return key;
    }
  }

  return "";
}

function validateRequiredFields_(payload, reportType) {
  reportType.required.forEach(function(field) {
    const value = payload[field];

    if (
      value === undefined ||
      value === null ||
      String(value).trim() === ""
    ) {
      throw new Error("Missing required field: " + field);
    }
  });
}


/************************************************************
 * SAVE REPORTS
 ************************************************************/

function saveReport_(payload, reportTypeKey, reportType) {
  const ss = getDatabase_();
  const sheet = ss.getSheetByName(reportType.sheetName);

  if (!sheet) {
    throw new Error("Missing sheet: " + reportType.sheetName + ". Run setup().");
  }

  const reportId = payload.reportId ? String(payload.reportId).trim() : generateReportId_(reportTypeKey);

  const attachmentCount = Number(payload.attachmentCount || 0) || countSubmittedAttachments_(payload);
  const attachmentLinks = normalizeAttachmentLinks_(payload);
  const signatureReceived = payload.signatureData || payload.signature ? "Yes" : "No";

  payload.reportId = reportId;
  payload.timestamp = new Date();
  payload.reportTypeKey = reportTypeKey;
  payload.reportTypeLabel = reportType.label;
  payload.reportTypeDescription = reportType.description || "";
  payload.incidentType = payload.incidentType || reportType.label;
  payload.status = payload.status || "New";
  payload.attachmentCount = attachmentCount;
  payload.attachmentLinks = attachmentLinks;
  payload.attachmentNote = buildAttachmentNote_(payload.attachmentNote, attachmentCount);
  payload.signatureReceived = signatureReceived;

  const row = reportType.fields.map(function(field) {
    return normalizeCellValue_(payload[field]);
  });

  sheet.appendRow(row);

  const detailRow = sheet.getLastRow();

  writeToReportIndex_(ss, payload, reportId, reportTypeKey, reportType, detailRow);

  return {
    reportId: reportId,
    detailRow: detailRow
  };
}

function writeToReportIndex_(ss, payload, reportId, reportTypeKey, reportType, detailRow) {
  const sheet = ensureReportIndex_(ss);

  sheet.appendRow([
    reportId,
    new Date(),
    reportTypeKey,
    reportType.label,
    payload.campus || "",
    payload.building || "",
    payload.locationSection || payload.building || "",
    payload.location || payload.eventLocation || payload.doorOrGate || "",
    payload.submittedBy || "",
    payload.priority || "",
    payload.summary || payload.notes || payload.issues || "",
    payload.followUpNeeded || "",
    payload.status || "New",
    payload.attachmentCount || 0,
    payload.attachmentLinks || "",
    payload.attachmentNote || "",
    reportType.sheetName,
    detailRow
  ]);
}

function ensureReportIndex_(ss) {
  let sheet = ss.getSheetByName("Reports Index");

  const headers = [
    "Report ID",
    "Timestamp",
    "Report Type Key",
    "Report Type",
    "Campus",
    "Building",
    "Area Group",
    "Location",
    "Submitted By",
    "Priority",
    "Narrative",
    "Follow Up Needed",
    "Status",
    "Attachment Count",
    "Attachment Links",
    "Attachment Note",
    "Detail Sheet",
    "Detail Row"
  ];

  if (!sheet) {
    sheet = ss.insertSheet("Reports Index");
  }

  setupHeaderRow_(sheet, headers);

  return sheet;
}


/************************************************************
 * DAILY SUMMARY EMAIL
 ************************************************************/

function sendDailySummary() {
  // Morning digest: runs at CONFIG.DAILY_SUMMARY_HOUR (default 6 AM)
  // and covers YESTERDAY's activity plus anything still outstanding.
  const ss = getDatabase_();

  const props = PropertiesService.getScriptProperties();
  const alertEmail = props.getProperty("ALERT_EMAIL") || CONFIG.ALERT_EMAIL;

  const yesterday = formatDate_(new Date(Date.now() - 24 * 60 * 60 * 1000));

  let total = 0;
  let lines = "";

  Object.keys(REPORT_TYPES).forEach(function(typeKey) {
    const type = REPORT_TYPES[typeKey];

    if (!type.includeInDailySummary) return;

    const count = countTodayByReportTypeKey_(ss, typeKey, yesterday);
    total += count;

    if (count > 0) {
      lines += "  " + type.label + ": " + count + "\n";
    }
  });

  const openKeys = listOpenKeys_();
  const activeBolos = listBolos_();

  let body =
    CONFIG.SCHOOL_NAME + " Security — Morning Digest\n" +
    "Covering: " + yesterday + "\n\n" +
    "REPORTS FILED YESTERDAY: " + total + "\n" +
    (lines || "  (none)\n") +
    "\nOPEN FOLLOW-UPS: " + countOpenFollowUps_(ss) + "\n" +
    "\nKEYS STILL OUT: " + openKeys.count + "\n";

  openKeys.open.forEach(function(item) {
    body += "  " + item.checkoutId + " — " + item.keyName + " — " + item.vendorEmployee +
      " (" + item.vendorCompany + "), issued " + item.timeOfIssue + "\n";
  });

  body += "\nACTIVE ADVISORIES: " + activeBolos.count + "\n";

  activeBolos.active.forEach(function(item) {
    body += "  " + item.type + " — " + item.subject + " (expires " + item.expires + ")\n";
  });

  body += "\nFull detail: " + ss.getUrl();

  MailApp.sendEmail(
    alertEmail,
    "[PHS Security] Morning digest — " + yesterday,
    body
  );
}

function countTodayByReportTypeKey_(ss, reportTypeKey, today) {
  const sheet = ss.getSheetByName("Reports Index");

  if (!sheet || sheet.getLastRow() < 2) return 0;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const timestampCol = headers.indexOf("Timestamp") + 1;
  const reportTypeKeyCol = headers.indexOf("Report Type Key") + 1;

  if (timestampCol < 1 || reportTypeKeyCol < 1) return 0;

  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
    .getValues();

  let count = 0;

  values.forEach(function(row) {
    const rowTypeKey = String(row[reportTypeKeyCol - 1] || "").trim();
    const timestamp = row[timestampCol - 1];

    if (!timestamp || rowTypeKey !== reportTypeKey) return;

    const dateString = formatDate_(new Date(timestamp));

    if (dateString === today) {
      count++;
    }
  });

  return count;
}

function countTodayByReportType_(ss, type, today) {
  const sheet = ss.getSheetByName(type.sheetName);

  if (!sheet) return 0;

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return 0;

  const values = sheet
    .getRange(2, type.dateColumn, lastRow - 1, 1)
    .getValues();

  let count = 0;

  values.forEach(function(row) {
    const value = row[0];

    if (!value) return;

    const dateString = formatDate_(new Date(value));

    if (dateString === today) {
      count++;
    }
  });

  return count;
}

function countOpenFollowUps_(ss) {
  const sheet = ss.getSheetByName("Reports Index");

  if (!sheet || sheet.getLastRow() < 2) return 0;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const followUpCol = headers.indexOf("Follow Up Needed") + 1;
  const statusCol = headers.indexOf("Status") + 1;

  if (followUpCol < 1 || statusCol < 1) return 0;

  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
    .getValues();

  let count = 0;

  values.forEach(function(row) {
    const followUp = String(row[followUpCol - 1] || "").toLowerCase();
    const status = String(row[statusCol - 1] || "").toLowerCase();

    const needsFollowUp =
      followUp === "yes" ||
      followUp === "true" ||
      followUp === "y" ||
      followUp === "needed";

    const stillOpen =
      status !== "resolved" &&
      status !== "no action needed" &&
      status !== "archived";

    if (needsFollowUp && stillOpen) {
      count++;
    }
  });

  return count;
}


/************************************************************
 * URGENT ALERTS
 ************************************************************/

function shouldSendUrgentAlert_(payload) {
  for (let i = 0; i < CONFIG.URGENT_FLAGS.length; i++) {
    const field = CONFIG.URGENT_FLAGS[i];
    const value = String(payload[field] || "").toLowerCase();

    if (
      value === "yes" ||
      value === "true" ||
      value === "urgent" ||
      value === "high"
    ) {
      return true;
    }
  }

  const priority = String(payload.priority || "").toLowerCase();

  return priority === "urgent" || priority === "high";
}

function sendUrgentAlert_(payload, reportId, reportType) {
  const props = PropertiesService.getScriptProperties();
  const alertEmail = props.getProperty("ALERT_EMAIL") || CONFIG.ALERT_EMAIL;

  const ss = getDatabase_();

  const body =
    "Urgent / follow-up report submitted.\n\n" +
    "Report ID: " + reportId + "\n" +
    "Report Type: " + reportType.label + "\n" +
    "Submitted By: " + safeText_(payload.submittedBy) + "\n" +
    "Campus: " + safeText_(payload.campus) + "\n" +
    "Building: " + safeText_(payload.building) + "\n" +
    "Location: " + safeText_(payload.location || payload.eventLocation || payload.doorOrGate) + "\n" +
    "Date/Time: " + safeText_(payload.dateOfIncident) + " " + safeText_(payload.timeOfIncident) + "\n" +
    "Priority: " + safeText_(payload.priority) + "\n" +
    "Narrative: " + safeText_(payload.summary || payload.notes || payload.issues) + "\n\n" +
    "Full detail: " + ss.getUrl();

  MailApp.sendEmail(
    alertEmail,
    "[PHS Security] Urgent report — " + reportType.label,
    body
  );
}


/************************************************************
 * KEY / KEYCARD CHECKOUTS (KC-03)
 * Vendor key checkout with a full lifecycle: issue -> return.
 * Open checkouts are listed on the hub; any logged-in officer
 * can record a return.
 ************************************************************/

const KEY_SHEET_NAME = "Key Checkouts";

const KEY_SHEET_HEADERS = [
  "Checkout ID",
  "Status",
  "Vendor Employee",
  "Vendor Company",
  "Contractor Badge",
  "Key / Keycard",
  "Time of Issue",
  "Issuing Officer",
  "Time of Return",
  "Returning Officer",
  "Remarks",
  "Created"
];

function ensureKeySheet_(ss) {
  let sheet = ss.getSheetByName(KEY_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(KEY_SHEET_NAME);
  setupHeaderRow_(sheet, KEY_SHEET_HEADERS);
  return sheet;
}

function keyCheckout_(payload) {
  const required = ["vendorEmployee", "vendorCompany", "badgeIssued", "keyName", "timeOfIssue", "issuingOfficer"];
  required.forEach(function(field) {
    if (!String(payload[field] || "").trim()) {
      throw new Error("Missing required field: " + field);
    }
  });

  const ss = getDatabase_();
  const sheet = ensureKeySheet_(ss);
  const checkoutId = nextSequentialId_(CONFIG.ID_PREFIX_KEY);

  sheet.appendRow([
    checkoutId,
    "OUT",
    String(payload.vendorEmployee).trim(),
    String(payload.vendorCompany).trim(),
    String(payload.badgeIssued).trim(),
    String(payload.keyName).trim(),
    String(payload.timeOfIssue).trim(),
    String(payload.issuingOfficer).trim(),
    "",
    "",
    String(payload.remarks || "").trim(),
    new Date()
  ]);

  return { ok: true, checkoutId: checkoutId, message: "Key checkout recorded." };
}

function keyReturn_(payload) {
  const checkoutId = String(payload.checkoutId || "").trim();
  const returningOfficer = String(payload.returningOfficer || "").trim();
  if (!checkoutId) throw new Error("Missing checkoutId.");
  if (!returningOfficer) throw new Error("Missing returningOfficer.");

  const ss = getDatabase_();
  const sheet = ensureKeySheet_(ss);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error("No checkouts on record.");

  const values = sheet.getRange(2, 1, lastRow - 1, KEY_SHEET_HEADERS.length).getValues();

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === checkoutId) {
      if (String(values[i][1]).trim() !== "OUT") {
        throw new Error(checkoutId + " is already returned.");
      }
      const row = i + 2;
      const returnTime = payload.timeOfReturn
        ? String(payload.timeOfReturn).trim()
        : Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, "yyyy-MM-dd HH:mm");
      sheet.getRange(row, 2).setValue("RETURNED");
      sheet.getRange(row, 9).setValue(returnTime);
      sheet.getRange(row, 10).setValue(returningOfficer);
      return { ok: true, checkoutId: checkoutId, message: "Key marked returned." };
    }
  }

  throw new Error("Checkout not found: " + checkoutId);
}

function listOpenKeys_() {
  const ss = getDatabase_();
  const sheet = ensureKeySheet_(ss);
  const lastRow = sheet.getLastRow();
  const open = [];

  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, KEY_SHEET_HEADERS.length).getValues();
    values.forEach(function(row) {
      if (String(row[1]).trim() === "OUT") {
        open.push({
          checkoutId: String(row[0]),
          vendorEmployee: String(row[2]),
          vendorCompany: String(row[3]),
          badgeIssued: String(row[4]),
          keyName: String(row[5]),
          timeOfIssue: String(row[6]),
          issuingOfficer: String(row[7]),
          remarks: String(row[10] || "")
        });
      }
    });
  }

  return { ok: true, open: open, count: open.length };
}


/************************************************************
 * SHIFT PASS-DOWN LOG (PD-04)
 ************************************************************/

const PASSDOWN_SHEET_NAME = "Pass-Down Log";

const PASSDOWN_SHEET_HEADERS = [
  "Entry ID",
  "Timestamp",
  "Shift",
  "Officer",
  "Notes",
  "Flagged",
  "Related Report"
];

function ensurePassdownSheet_(ss) {
  let sheet = ss.getSheetByName(PASSDOWN_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(PASSDOWN_SHEET_NAME);
  setupHeaderRow_(sheet, PASSDOWN_SHEET_HEADERS);
  return sheet;
}

function passdownSubmit_(payload) {
  const shift = String(payload.shift || "").trim();
  const officer = String(payload.officer || "").trim();
  const notes = String(payload.notes || "").trim();
  if (!shift) throw new Error("Missing required field: shift");
  if (!officer) throw new Error("Missing required field: officer");
  if (!notes) throw new Error("Missing required field: notes");

  const ss = getDatabase_();
  const sheet = ensurePassdownSheet_(ss);
  const entryId = "PD-" + Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, "yyyyMMdd-HHmmss");

  sheet.appendRow([
    entryId,
    new Date(),
    shift,
    officer,
    notes,
    payload.flagged === true || String(payload.flagged).toLowerCase() === "yes" ? "Yes" : "",
    String(payload.relatedReport || "").trim()
  ]);

  return { ok: true, entryId: entryId, message: "Pass-down entry saved." };
}

function listPassdown_(payload) {
  const hours = Math.min(Number(payload.hours || 48) || 48, 168);
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  const ss = getDatabase_();
  const sheet = ensurePassdownSheet_(ss);
  const lastRow = sheet.getLastRow();
  const entries = [];

  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, PASSDOWN_SHEET_HEADERS.length).getValues();
    values.forEach(function(row) {
      const ts = row[1] instanceof Date ? row[1] : new Date(row[1]);
      if (ts && ts >= cutoff) {
        entries.push({
          entryId: String(row[0]),
          timestamp: ts.toISOString(),
          shift: String(row[2]),
          officer: String(row[3]),
          notes: String(row[4]),
          flagged: String(row[5]).trim() === "Yes",
          relatedReport: String(row[6] || "")
        });
      }
    });
  }

  entries.sort(function(a, b) { return a.timestamp < b.timestamp ? 1 : -1; });
  return { ok: true, entries: entries, hours: hours };
}


/************************************************************
 * BOLO / ACTIVE ADVISORIES BOARD
 * Advisories expire automatically when their expiration passes.
 ************************************************************/

const BOLO_SHEET_NAME = "BOLO Board";

const BOLO_SHEET_HEADERS = [
  "Advisory ID",
  "Status",
  "Type",
  "Subject",
  "Details",
  "Posted By",
  "Posted",
  "Expires",
  "Resolved By",
  "Resolved"
];

function ensureBoloSheet_(ss) {
  let sheet = ss.getSheetByName(BOLO_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(BOLO_SHEET_NAME);
  setupHeaderRow_(sheet, BOLO_SHEET_HEADERS);
  return sheet;
}

function boloSubmit_(payload) {
  const type = String(payload.boloType || "").trim();
  const subject = String(payload.subject || "").trim();
  const details = String(payload.details || "").trim();
  const postedBy = String(payload.postedBy || "").trim();
  const expires = String(payload.expires || "").trim();

  if (!type) throw new Error("Missing required field: boloType");
  if (!subject) throw new Error("Missing required field: subject");
  if (!details) throw new Error("Missing required field: details");
  if (!postedBy) throw new Error("Missing required field: postedBy");
  if (!expires) throw new Error("Missing required field: expires");

  const ss = getDatabase_();
  const sheet = ensureBoloSheet_(ss);
  const advisoryId = "ADV-" + Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, "yyyyMMdd-HHmmss");

  sheet.appendRow([
    advisoryId,
    "ACTIVE",
    type,
    subject,
    details,
    postedBy,
    new Date(),
    expires,
    "",
    ""
  ]);

  return { ok: true, advisoryId: advisoryId, message: "Advisory posted." };
}

function boloResolve_(payload) {
  const advisoryId = String(payload.advisoryId || "").trim();
  const resolvedBy = String(payload.resolvedBy || "").trim();
  if (!advisoryId) throw new Error("Missing advisoryId.");
  if (!resolvedBy) throw new Error("Missing resolvedBy.");

  const ss = getDatabase_();
  const sheet = ensureBoloSheet_(ss);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error("No advisories on record.");

  const values = sheet.getRange(2, 1, lastRow - 1, BOLO_SHEET_HEADERS.length).getValues();

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === advisoryId) {
      const row = i + 2;
      sheet.getRange(row, 2).setValue("RESOLVED");
      sheet.getRange(row, 9).setValue(resolvedBy);
      sheet.getRange(row, 10).setValue(new Date());
      return { ok: true, advisoryId: advisoryId, message: "Advisory resolved." };
    }
  }

  throw new Error("Advisory not found: " + advisoryId);
}

function listBolos_() {
  const ss = getDatabase_();
  const sheet = ensureBoloSheet_(ss);
  const lastRow = sheet.getLastRow();
  const active = [];
  const now = new Date();

  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, BOLO_SHEET_HEADERS.length).getValues();
    values.forEach(function(row) {
      if (String(row[1]).trim() !== "ACTIVE") return;

      // Auto-expire: an advisory past its expiration date is not returned.
      const expiresRaw = row[7];
      if (expiresRaw) {
        const expires = expiresRaw instanceof Date ? expiresRaw : new Date(String(expiresRaw) + "T23:59:59");
        if (!isNaN(expires.getTime()) && expires < now) return;
      }

      active.push({
        advisoryId: String(row[0]),
        type: String(row[2]),
        subject: String(row[3]),
        details: String(row[4]),
        postedBy: String(row[5]),
        posted: row[6] instanceof Date ? row[6].toISOString() : String(row[6]),
        expires: expiresRaw instanceof Date
          ? Utilities.formatDate(expiresRaw, CONFIG.TIME_ZONE, "yyyy-MM-dd")
          : String(expiresRaw || "")
      });
    });
  }

  return { ok: true, active: active, count: active.length };
}


/************************************************************
 * REPORT LOOKUP BY NUMBER
 * Officers can pull up a report summary by its PHS/DAR number.
 ************************************************************/

function lookupReport_(payload) {
  const reportId = String(payload.reportId || "").trim().toUpperCase();
  if (!reportId) throw new Error("Enter a report number, like PHS-0001 or DAR-0001.");

  const ss = getDatabase_();
  const sheet = ss.getSheetByName("Reports Index");
  if (!sheet || sheet.getLastRow() < 2) {
    return { ok: true, found: false, reportId: reportId };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]).trim().toUpperCase() === reportId) {
      const record = {};
      headers.forEach(function(header, index) {
        const value = values[i][index];
        record[header] = value instanceof Date ? value.toISOString() : String(value === undefined || value === null ? "" : value);
      });

      return {
        ok: true,
        found: true,
        reportId: reportId,
        report: {
          reportId: record["Report ID"],
          timestamp: record["Timestamp"],
          reportType: record["Report Type"],
          campus: record["Campus"],
          areaGroup: record["Area Group"],
          location: record["Location"],
          submittedBy: record["Submitted By"],
          priority: record["Priority"],
          narrative: record["Narrative"],
          status: record["Status"],
          attachmentCount: record["Attachment Count"]
        }
      };
    }
  }

  return { ok: true, found: false, reportId: reportId };
}


/************************************************************
 * METADATA
 ************************************************************/

function getPublicReportTypes_() {
  const out = {};

  Object.keys(REPORT_TYPES).forEach(function(key) {
    const type = REPORT_TYPES[key];

    out[key] = {
      category: type.category || "major",
      label: type.label,
      description: type.description || "",
      fields: type.fields,
      required: type.required,
      includeInDailySummary: type.includeInDailySummary
    };
  });

  return out;
}


/************************************************************
 * ERROR LOGGING
 ************************************************************/

function ensureErrorLog_(ss) {
  let sheet = ss.getSheetByName("Error Log");

  const headers = [
    "Timestamp",
    "Error Message",
    "Stack",
    "Raw Request"
  ];

  if (!sheet) {
    sheet = ss.insertSheet("Error Log");
  }

  setupHeaderRow_(sheet, headers);

  return sheet;
}

function logError_(err, e) {
  try {
    const ss = getDatabase_();
    const sheet = ensureErrorLog_(ss);

    let raw = "";

    if (e && e.postData && e.postData.contents) {
      raw = e.postData.contents;
    } else if (e && e.parameter) {
      raw = JSON.stringify(e.parameter);
    }

    sheet.appendRow([
      new Date(),
      err.message || String(err),
      err.stack || "",
      raw
    ]);

  } catch (loggingErr) {
    Logger.log("Failed to log error: " + loggingErr.message);
    Logger.log("Original error: " + err.message);
  }
}


/************************************************************
 * HELPERS
 ************************************************************/

function getDatabase_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error(
      "No active spreadsheet found. This script must be bound to a Google Sheet. Open the Sheet, then go to Extensions > Apps Script."
    );
  }

  return ss;
}

function generateApiToken_() {
  return Utilities.getUuid() + "-" + Utilities.getUuid();
}

/**
 * Sequential report numbering.
 * Incident reports: PHS-0001, PHS-0002, ...
 * Daily activity:   DAR-0001, DAR-0002, ...
 * Key checkouts:    KEY-0001, KEY-0002, ...
 * Counters are independent, stored in Script Properties, and doPost()
 * already holds a script lock, so two simultaneous submissions cannot
 * receive the same number.
 */
function nextSequentialId_(prefix) {
  const props = PropertiesService.getScriptProperties();
  const counterKey = "COUNTER_" + prefix;
  const current = Number(props.getProperty(counterKey) || 0) + 1;
  props.setProperty(counterKey, String(current));

  let padded = String(current);
  while (padded.length < CONFIG.ID_PAD) padded = "0" + padded;

  return prefix + "-" + padded;
}

function generateReportId_(reportTypeKey) {
  const prefix = reportTypeKey === "daily_activity"
    ? CONFIG.ID_PREFIX_DAILY
    : CONFIG.ID_PREFIX_INCIDENT;
  return nextSequentialId_(prefix);
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function formatDate_(date) {
  return Utilities.formatDate(
    date,
    CONFIG.TIME_ZONE,
    "yyyy-MM-dd"
  );
}

function normalizeCellValue_(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(function(item) {
      if (typeof item === "object") {
        return JSON.stringify(item);
      }

      return String(item);
    }).join("\n");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function safeText_(value) {
  if (value === undefined || value === null || value === "") {
    return "Not provided";
  }

  return String(value);
}

function normalizeAttachmentLinks_(payload) {
  if (payload.attachmentLinks) {
    return String(payload.attachmentLinks);
  }

  if (payload.attachments && Array.isArray(payload.attachments)) {
    return payload.attachments.map(function(item) {
      const name = item.name || item.filename || "Attachment";
      const url = item.url || item.downloadUrl || "";
      return url ? name + ": " + url : name;
    }).join("\n");
  }

  return "";
}

function buildAttachmentNote_(note, attachmentCount) {
  const cleanNote = String(note || "").trim();

  if (cleanNote) {
    return cleanNote;
  }

  if (attachmentCount > 0) {
    return "Files uploaded through Netlify Blobs. Apps Script records links only.";
  }

  return "";
}

function countSubmittedAttachments_(payload) {
  if (payload.attachments && Array.isArray(payload.attachments)) {
    return payload.attachments.length;
  }

  if (payload.photo || payload.photoData || payload.image || payload.signatureData || payload.signature) {
    return 1;
  }

  return 0;
}


/************************************************************
 * ADMIN / TEST FUNCTIONS
 ************************************************************/

function showConfig() {
  const props = PropertiesService.getScriptProperties();
  const ss = getDatabase_();

  Logger.log("Spreadsheet URL: " + ss.getUrl());
  Logger.log("Alert Email: " + props.getProperty("ALERT_EMAIL"));
  Logger.log("API Token: " + props.getProperty("API_TOKEN"));
  Logger.log("DriveApp used: NO");
  Logger.log("GmailApp used: NO");
  Logger.log("Attachment storage: Netlify Blobs links only");
}

function resetApiToken() {
  const token = generateApiToken_();

  PropertiesService
    .getScriptProperties()
    .setProperty("API_TOKEN", token);

  Logger.log("New API token: " + token);
}

function testMetadata() {
  const response = getPublicReportTypes_();
  Logger.log(JSON.stringify(response, null, 2));
}

function testSubmission() {
  const token = PropertiesService
    .getScriptProperties()
    .getProperty("API_TOKEN");

  const fakeEvent = {
    postData: {
      contents: JSON.stringify({
        token: token,
        reportType: "threat_violence_concern",
        submittedBy: "Test User",
        campus: "Ward Parkway",
        dateOfIncident: "2026-07-02",
        timeOfIncident: "12:00",
        campus: "Ward Parkway / Upper Campus",
        building: "Main Areas",
        locationSection: "Main Areas",
        location: "Upper School Commons",
        priority: "High",
        peopleInvolvedChoice: "Yes",
        peopleInvolved: "Person 1:\nName: Test Student\nStudent: Yes\nRole: Witness",
        peopleInvolvedJson: "[]",
        summary: "This is a test incident report submission.",
        actionTaken: "Security documented the test submission."
      })
    }
  };

  const response = doPost(fakeEvent);
  Logger.log(response.getContent());
}

function testKeyCheckoutFlow() {
  const checkout = keyCheckout_({
    vendorEmployee: "Test Vendor Tech",
    vendorCompany: "Test HVAC Co",
    badgeIssued: "C-17",
    keyName: CONFIG.KEY_LIST[0],
    timeOfIssue: "2026-07-03 09:00",
    issuingOfficer: "Test Officer"
  });
  Logger.log(JSON.stringify(checkout));
  Logger.log(JSON.stringify(listOpenKeys_()));
  Logger.log(JSON.stringify(keyReturn_({
    checkoutId: checkout.checkoutId,
    returningOfficer: "Test Officer"
  })));
}

function testPassdownAndBolo() {
  Logger.log(JSON.stringify(passdownSubmit_({
    shift: "Day Shift",
    officer: "Test Officer",
    notes: "Test pass-down entry.",
    flagged: "Yes"
  })));
  Logger.log(JSON.stringify(listPassdown_({ hours: 48 })));

  const bolo = boloSubmit_({
    boloType: "General Advisory",
    subject: "Test advisory",
    details: "Test advisory details.",
    postedBy: "Test Officer",
    expires: formatDate_(new Date(Date.now() + 24 * 60 * 60 * 1000))
  });
  Logger.log(JSON.stringify(bolo));
  Logger.log(JSON.stringify(listBolos_()));
  Logger.log(JSON.stringify(boloResolve_({
    advisoryId: bolo.advisoryId,
    resolvedBy: "Test Officer"
  })));
}

function testLookup() {
  Logger.log(JSON.stringify(lookupReport_({ reportId: "PHS-0001" })));
}

function testDailyActivitySubmission() {
  const token = PropertiesService
    .getScriptProperties()
    .getProperty("API_TOKEN");

  const fakeEvent = {
    postData: {
      contents: JSON.stringify({
        token: token,
        reportType: "daily_activity",
        submittedBy: "Test User",
        dateOfIncident: "2026-07-02",
        timeOfIncident: "12:00",
        campus: "Ward Parkway / Upper Campus",
        building: "Main Areas",
        locationSection: "Main Areas",
        location: "Upper School Commons",
        activityType: "Patrol Check",
        summary: "This is a test daily activity log."
      })
    }
  };

  const response = doPost(fakeEvent);
  Logger.log(response.getContent());
}
