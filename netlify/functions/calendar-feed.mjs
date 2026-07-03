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
        events.push({
          source,
          title: current.title,
          location: current.location || "",
          date: current.start.date,
          time: current.start.time,
          endTime: current.end && current.end.date === current.start.date ? current.end.time : null,
          allDay: current.start.time === null
        });
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
