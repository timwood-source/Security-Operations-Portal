# PHS Security Hub — v3

The security operations hub for Pembroke Hill School: one signed-in site for
the daily dashboard, incident reporting, daily activity logs, vendor key
checkouts, shift pass-down, gate schedules, and post orders.

**Deployment: follow `docs/DEPLOYMENT.md` step by step.**

## What v3 includes

- **Dashboard** — 14-day calendar (home athletics + faculty feeds), weather,
  "Gates right now" (scheduled status), "Keys out" badge, active BOLO/advisory
  board, recent pass-downs, report lookup by number, and quick contacts.
- **Sequential report numbering** — Incident Reports file as `PHS-0001…`,
  Daily Activity Logs as `DAR-0001…`, key checkouts as `KEY-0001…`. Numbers
  are generated server-side in Apps Script under a lock (no duplicates), and
  the confirmation screen shows the number big with a copy button.
- **Key / Keycard Checkout (KC-03)** — vendor name, company, badge, key (from
  a managed list), issue time, issuing officer. Open checkouts list on the hub;
  any officer can record a return.
- **Shift Pass-Down (PD-04)** — quick entries with a flag for items that need
  attention today; last 24h shows on the dashboard.
- **BOLO / advisories** — trespass warnings, vehicles of interest, custody
  flags. Advisories auto-expire on their end date.
- **Gates** — the gate dashboard merged in as a tab, driven by
  `public/data/gates-schedule.json` (currently SAMPLE data), with live
  scheduled open/closed status.
- **Post Orders** — PO-01 / EP-02 / GE-03 sections rendered from
  `public/data/post-orders.json`; PDFs live in `public/docs/post-orders/`.
- **Officer logins** — the whole hub (pages and APIs) sits behind individual
  Auth0 accounts; "Submitted by" auto-fills from the verified session. Until
  Auth0 env vars are set, the hub runs open with a warning banner.
- **Night mode** — auto after dark, manual toggle in the top bar.
- **Installable app** — pin to a phone home screen; opens full-screen.
- **50 MB attachments that actually work** — large files upload in ~3 MB
  chunks (each request stays under serverless limits) and download as a single
  streamed file.
- **6 AM morning digest** — yesterday's reports by type, open follow-ups,
  keys still out overnight, and active advisories, emailed by Apps Script.

## Environment variables (Netlify — never in GitHub)

| Variable | Purpose |
|---|---|
| `APPS_SCRIPT_URL` | Apps Script `/exec` URL |
| `APPS_SCRIPT_TOKEN` | Apps Script API token |
| `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_AUDIENCE` | Officer logins (unset = open mode + banner) |
| `RSCHOOL_ICS_URL` | Athletics iCal feed (treat as secret) |
| `VERACROSS_ICS_URL` | Faculty calendar ICS link (treat as secret) |
| `HOME_KEYWORDS` | Optional; home-game filter keywords (default `pembroke`) |
| `WEATHER_LAT`, `WEATHER_LON` | Optional; default Ward Parkway campus |

## Where to edit common items

| Need | Edit |
|---|---|
| Gate schedules | `public/data/gates-schedule.json` |
| Post order documents | `public/docs/post-orders/` + `public/data/post-orders.json` |
| Quick contacts | `public/data/contacts.json` |
| Key/keycard list, BOLO types, shifts, digest hour | `CONFIG` in `google-apps-script/Code.gs` |
| Visual design | `public/styles.css`, `public/index.html` |
| Form/dashboard behavior | `public/app.js` |
| API behavior | `netlify/functions/*.mjs` |

## Notes

- Apps Script still uses no DriveApp/GmailApp; attachments live in Netlify
  Blobs and the Sheet stores links only. Attachment links are bearer links —
  treat the Sheet as sensitive.
- Project history and decisions: `docs/PROJECT-NOTES.md`.
