// Merged 14-day calendar for the dashboard.
// Sources (both configured in Netlify environment variables, never in code):
//   RSCHOOL_ICS_URL   — rSchoolToday athletics iCal feed (filtered to home events)
//   VERACROSS_ICS_URL — Veracross faculty calendar ICS subscription link
// Feed URLs act like passwords. Results are cached in Netlify Blobs for
// 15 minutes so the page stays fast and the feeds are not hammered.

import { json, requireOfficer, getStore, errorResponse } from "./lib/shared.mjs";

const CACHE_KEY = "calendar-v1";
const CACHE_TTL_MS = 15 * 60 * 1000;
const WINDOW_DAYS = 14;
const TIME_ZONE = "America/Chicago";

// Home-event filter for the athletics feed. An event counts as home when its
// location or title matches one of these keywords, or when it has no "@ /at"
// away marker. Adjust HOME_KEYWORDS in Netlify env vars if the live feed
// labels things differently.
function homeKeywords() {
  const raw = process.env.HOME_KEYWORDS || "pembroke";
  return raw.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
}

function unfoldIcs(text) {
  // RFC 5545 line unfolding: continuation lines start with a space or tab.
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function chicagoParts(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false
  });
  const parts = {};
  formatter.formatToParts(date).forEach((p) => { parts[p.type] = p.value; });
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`
  };
}

function parseDtValue(rawProp, rawValue) {
  // Handles: 20260815 (all-day), 20260815T183000 (floating/TZID -> treat as
  // Central, which school feeds use), 20260815T183000Z (UTC -> convert).
  const value = rawValue.trim();

  if (/^\d{8}$/.test(value)) {
    return { date: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`, time: null };
  }

  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!match) return null;

  const [, y, mo, d, h, mi, , zulu] = match;

  if (zulu) {
    const utc = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
    return chicagoParts(utc);
  }

  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  const pad = (v) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const BYDAY_MAP = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// Expands an event into the concrete dates it occurs on within a generous
// horizon. Handles the common school-feed cases: single events, multi-day
// all-day spans, and RRULE FREQ=DAILY/WEEKLY (INTERVAL, BYDAY, UNTIL, COUNT).
// MONTHLY/YEARLY repeats fall back to the first date only.
function occurrenceDates(current) {
  const startDate = current.start.date;
  const horizonEnd = addDays(chicagoParts(new Date()).date, WINDOW_DAYS + 1);

  // Multi-day all-day span (DTEND is exclusive per RFC 5545).
  if (current.start.time === null && current.end && current.end.date > startDate && !current.rrule) {
    const dates = [];
    let cursor = startDate;
    let guard = 0;
    while (cursor < current.end.date && cursor <= horizonEnd && guard++ < 60) {
      dates.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return dates.length ? dates : [startDate];
  }

  if (!current.rrule) return [startDate];

  const rules = {};
  current.rrule.split(";").forEach((part) => {
    const [key, value] = part.split("=");
    if (key && value) rules[key.toUpperCase()] = value.toUpperCase();
  });

  const freq = rules.FREQ;
  if (freq !== "DAILY" && freq !== "WEEKLY") return [startDate];

  const interval = Math.max(1, parseInt(rules.INTERVAL || "1", 10) || 1);
  const count = rules.COUNT ? parseInt(rules.COUNT, 10) : null;
  let until = null;
  if (rules.UNTIL) {
    const match = rules.UNTIL.match(/^(\d{4})(\d{2})(\d{2})/);
    if (match) until = `${match[1]}-${match[2]}-${match[3]}`;
  }

  const byDays = rules.BYDAY
    ? rules.BYDAY.split(",").map((token) => BYDAY_MAP[token.replace(/^[-+]?\d+/, "")]).filter((day) => day !== undefined)
    : null;

  const dates = [];
  let produced = 0;
  let cursor = startDate;
  let guard = 0;

  while (cursor <= horizonEnd && guard++ < 800) {
    if (until && cursor > until) break;
    if (count !== null && produced >= count) break;

    let matches = true;
    if (freq === "WEEKLY") {
      const dayOfWeek = new Date(`${cursor}T12:00:00`).getDay();
      matches = byDays ? byDays.includes(dayOfWeek) : cursor === startDate ||
        dayOfWeek === new Date(`${startDate}T12:00:00`).getDay();
      if (interval > 1 && matches) {
        const weeksApart = Math.floor((new Date(`${cursor}T12:00:00`) - new Date(`${startDate}T12:00:00`)) / (7 * 24 * 3600 * 1000));
        matches = weeksApart % interval === 0;
      }
    } else if (freq === "DAILY" && interval > 1) {
      const daysApart = Math.round((new Date(`${cursor}T12:00:00`) - new Date(`${startDate}T12:00:00`)) / (24 * 3600 * 1000));
      matches = daysApart % interval === 0;
    }

    if (matches) {
      produced++;
      dates.push(cursor);
    }
    cursor = addDays(cursor, 1);
  }

  return dates.length ? dates : [startDate];
}

function parseIcs(text, source) {
  const events = [];
  const lines = unfoldIcs(text).split("\n");
  let current = null;

  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      current = {};
      continue;
    }
    if (line.startsWith("END:VEVENT")) {
      if (current && current.start && current.title) {
        const base = {
          source,
          title: current.title,
          location: current.location || "",
          time: current.start.time,
          endTime: current.end && current.end.date === current.start.date ? current.end.time : null,
          allDay: current.start.time === null
        };
        for (const date of occurrenceDates(current)) {
          events.push({ ...base, date });
        }
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const prop = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const propName = prop.split(";")[0].toUpperCase();

    if (propName === "SUMMARY") {
      current.title = value.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/g, " ").trim();
    } else if (propName === "LOCATION") {
      current.location = value.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/g, " ").trim();
    } else if (propName === "DTSTART") {
      current.start = parseDtValue(prop, value);
    } else if (propName === "DTEND") {
      current.end = parseDtValue(prop, value);
    } else if (propName === "RRULE") {
      current.rrule = value.trim();
    }
  }

  return events;
}

function isHomeEvent(event) {
  const keywords = homeKeywords();
  const haystack = `${event.location} ${event.title}`.toLowerCase();
  if (keywords.some((k) => haystack.includes(k))) return true;
  // Away games are usually written "... @ Opponent" or "at Opponent".
  if (/(^|\s)(@|at)\s/i.test(event.title) && event.location) return false;
  if (event.title.includes("@")) return false;
  return !event.location || false;
}

function windowDates() {
  const today = chicagoParts(new Date()).date;
  const start = new Date(`${today}T00:00:00`);
  const dates = [];
  for (let i = 0; i <= WINDOW_DAYS; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const pad = (v) => String(v).padStart(2, "0");
    dates.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return { today, dates, last: dates[dates.length - 1] };
}

async function fetchFeed(url, source) {
  const response = await fetch(url, { headers: { Accept: "text/calendar, text/plain, */*" } });
  if (!response.ok) throw new Error(`${source} feed returned ${response.status}`);
  return parseIcs(await response.text(), source);
}

export default async (request) => {
  if (request.method !== "GET") return json(405, { ok: false, error: "Method not allowed." });

  try {
    await requireOfficer(request);

    const store = await getStore("hub-cache");
    const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";

    if (!forceRefresh) {
      const cached = await store.get(CACHE_KEY, { type: "json" });
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return json(200, { ok: true, cached: true, ...cached.body });
      }
    }

    const { today, dates, last } = windowDates();
    const sources = [];
    const errors = [];
    let events = [];

    const athleticsUrl = process.env.RSCHOOL_ICS_URL;
    const facultyUrl = process.env.VERACROSS_ICS_URL;

    if (athleticsUrl) {
      try {
        const all = await fetchFeed(athleticsUrl, "athletics");
        events = events.concat(all.filter(isHomeEvent));
        sources.push("athletics");
      } catch (err) {
        errors.push({ source: "athletics", error: err.message });
      }
    } else {
      errors.push({ source: "athletics", error: "RSCHOOL_ICS_URL is not configured." });
    }

    if (facultyUrl) {
      try {
        events = events.concat(await fetchFeed(facultyUrl, "faculty"));
        sources.push("faculty");
      } catch (err) {
        errors.push({ source: "faculty", error: err.message });
      }
    } else {
      errors.push({ source: "faculty", error: "VERACROSS_ICS_URL is not configured." });
    }

    const inWindow = events
      .filter((e) => e.date >= today && e.date <= last)
      .sort((a, b) => (a.date + (a.time || "00:00")).localeCompare(b.date + (b.time || "00:00")));

    const body = { today, dates, events: inWindow, sources, errors };

    await store.setJSON(CACHE_KEY, { fetchedAt: Date.now(), body });

    return json(200, { ok: true, cached: false, ...body });
  } catch (err) {
    return errorResponse(err);
  }
};

export const config = { path: "/api/calendar-feed" };
