# Project Notes — PHS Security Hub

## Active working model

This folder is the active working model for the PHS Security Hub / Field Reporting Hub.
Use this build as the main source for future edits unless a newer working model is created.

## Current build contents

- Visual reporting hub in `public/`
- Netlify Functions in `netlify/functions/`
- Google Apps Script backend in `google-apps-script/`
- Setup and workflow documents in `docs/`
- Netlify configuration in `netlify.toml`

## Current capabilities

- Incident Report workflow
- Daily Activity Log workflow
- File uploads attached to reports through Netlify Blobs
- Server-side protection for Apps Script URL and API token through Netlify environment variables
- Google Apps Script writes report data to the Google Sheet

## Rebuild changes completed in this version

- Renamed user-facing “Major Incident” language to “Incident Report.”
- Made backend status minimal.
- Added approved Ward Parkway / Upper Campus and Wornall / Lower Campus location dropdowns.
- Added required Date and Time fields.
- Made incident Priority mandatory.
- Rebuilt People Involved as a mandatory Yes/No section.
- Added dynamic person entries with Name, DOB, Phone, Student Yes/No, and Role.
- Removed the separate Witness box because role now handles Witness.
- Renamed Summary to Narrative in the report interface and enabled browser spellcheck.
- Split Vandalism / Property Damage into Pembroke Hill Property Damage and Personal Property Damage.
- Removed the visible Notification section and Alert Handling section.
- Redesigned Daily Activity Log as a quick officer entry form.
- Removed Priority, Follow Up, People Involved, Witnesses, Notes, and Action Taken from Daily Activity Log.
- Raised attachment validation to 50 MB per file with no fixed front-end file count cap.
- Added the uploaded campus aerial image as the hero image.
- Made Incident Report and Daily Activity Log visually distinct.
- Reworked the random icon area into a useful report guidance panel.
- Added more useful colorful icons and PHS-style colors.

## Important security notes

- Do not place real `APPS_SCRIPT_URL` or `APPS_SCRIPT_TOKEN` values in GitHub.
- Keep secrets only in Netlify environment variables.
- Apps Script should remain least-privilege and should not use broad Drive or Gmail permissions unless explicitly approved.
- Attachment links should be treated as sensitive because anyone with the private Sheet link may be able to access them.

## Where to edit common items

| Need | Edit this file |
|---|---|
| Visual design, icons, layout | `public/index.html`, `public/styles.css` |
| Form behavior | `public/app.js` |
| Report types and activity types | `google-apps-script/Code.gs` |
| Upload limits | `public/app.js`, `netlify/functions/submit-report.js` |
| Netlify routing | `netlify.toml` |
| Backend URL/token | Netlify environment variables only |

## Change log

### 2026-07-03 (v3 — Security Hub rebuild)

Planned in conversation notes, built in one pass. Full change list:

1. **Sequential report numbering** — PHS-#### (incidents), DAR-#### (daily logs), KEY-#### (key checkouts). 4-digit, independent counters starting at 1, generated in Apps Script under the existing script lock, stored in Script Properties (`COUNTER_PHS` etc.). Netlify no longer generates IDs. Old timestamp-style IDs on existing rows untouched.
2. **Dashboard** (new main page, top of hub): 14-day calendar (today expanded, other days click-to-expand) merging the rSchoolToday athletics feed (home events only, keyword heuristic via `HOME_KEYWORDS`) and the Veracross faculty ICS feed; feeds fetched/cached 15 min by `calendar-feed.mjs`; feed URLs live only in Netlify env vars. Plus weather strip (Open-Meteo, no key), "Gates right now", "Keys out" badge, BOLO board, recent pass-downs, report lookup, quick contacts.
3. **Gates merged in** as a tab; schedule data at `public/data/gates-schedule.json` (currently `"sample": true` with a visible banner until real schedules are supplied). Live widget computes *scheduled* status and is labeled as such.
4. **Post Orders tab** — PO-01 (by campus → post), EP-02, GE-03; manifest-driven placeholder cards; PDFs go in `public/docs/post-orders/`.
5. **Hub-wide login** — individual officer accounts via Auth0 (SPA + API/JWT). All Netlify functions verify the session server-side; verified identity overrides submittedBy/issuingOfficer/etc. Graceful "auth disabled" mode with banner when env vars unset, so the site can deploy before Auth0 exists. Netlify Identity intentionally not used (wound down).
6. **Key/Keycard Checkout (KC-03)** — full lifecycle in a new "Key Checkouts" sheet; managed key list in `CONFIG.KEY_LIST`; any officer can record returns; dashboard badge.
7. **Shift Pass-Down (PD-04)** — new "Pass-Down Log" sheet; flagged entries highlighted; last 24h on dashboard.
8. **BOLO/advisories** — new "BOLO Board" sheet; auto-expire past their date; resolve button.
9. **Report lookup** — Apps Script reads Reports Index by report number.
10. **Morning digest** — daily summary moved from 5 PM to 6 AM and now covers yesterday's reports, open follow-ups, keys still out, and active advisories. (Resolves the old edit-queue question: urgent alerts stay real-time, everything else goes to the digest.)
11. **Direct-to-blob-style chunked uploads** — files >3 MB upload in chunks via `upload-chunk.mjs`; `download-attachment.mjs` streams them back as one file. Resolves the 50 MB serverless-limit risk from the old edit queue.
12. **Confirmation screen upgrade** — big report number, copy button, "Start another".
13. **Night mode** — auto 19:00–06:30, manual ◐ toggle, per-device preference.
14. **Nav rework** — top-bar nav with hash routing across 7 views; mobile hamburger.
15. **PWA** — manifest + icons + minimal network-first service worker (installable, never stale).
16. Netlify functions rewritten in modern (Functions 2.0 / ESM) style with `config.path` routing; `netlify.toml` redirects removed accordingly; `jose` added for JWT verification; security headers added.

Open items still owed by PHS: Veracross ICS link, rSchoolToday iCal link, real gate schedules, post order PDFs, officer roster in Auth0, real contact numbers, and verification of the athletics home/away filter against the live feed.

### 2026-07-02 (visual overhaul v2 — readability pass)

- Replaced Saira Condensed after feedback that the condensed all-caps type was blocky and hard to read. New pairing: Fraunces (serif display — warm, collegiate, readable) for headings, Instrument Sans for labels and body, IBM Plex Mono reserved for form codes and small metadata only. Labels are now sentence case.
- Warmer, richer look overall: taller hero with the campus aerial more visible under a navy-to-crimson gradient (navy-to-teal in Daily mode), gold accents throughout, softer rounded panels with layered shadows, gradient submit button, gold/accent ribbon across each panel top.
- Section numbers restyled from bordered squares to italic serif folio numbers in gold (01, 02, …). Auto-renumbering in Daily mode still works via CSS counters.
- Mode tabs are now rounded cards with a blur backdrop; the active tab lifts onto the page.
- No changes to `app.js`, form fields, IDs, or backend in this pass — CSS rewrite plus two small HTML edits (font link, hero subhead).

### 2026-07-02 (visual overhaul)

- Full visual/UI redesign of `public/index.html` and `public/styles.css`. No backend, Netlify Function, or Apps Script changes. All form field names and element IDs preserved, so the submit payload is unchanged.
- New direction: "official field report document." Condensed uppercase display type (Saira Condensed), IBM Plex Sans body, IBM Plex Mono for form codes and metadata. Fonts load from Google Fonts with Arial Narrow fallback.
- Removed all emoji. Report types now show plain labels; the guidance panel shows auto-generated classification codes (e.g., TVC, MES, KRC) instead of icons. Three small edits in `app.js` support this (`classificationCode()` helper, emoji removed from dropdown options and the daily-mode panel).
- Replaced the 355px hero with a compact navy top bar (PHS monogram, system status) plus a slim aerial band. The campus aerial photo is retained.
- Mode switcher restyled as report-folder tabs labeled Form IR-01 / Form DA-02, color-coded crimson (incident) and teal (daily).
- Form reorganized into numbered sections via CSS counters: 01 Classification, 02 Time & Location, 03 People Involved, 04 Narrative, 05 Attachments. Numbering renumbers automatically in Daily mode because hidden sections are skipped.
- Mobile: form now appears before the guidance panel, single-column grids, full-width buttons, larger touch targets.
- Accessibility: visible gold focus rings, reduced-motion respected, sr-only legend on the attachments fieldset.
- Rollback path: the previous frontend lives in git history (commit before this one) and in the 2026-07-02 rebuild ZIP. The screenshots in `docs/previews/` show the old design and are stale; replace after the live site is verified.

### 2026-07-02

- Adopted uploaded ZIP as the active working model.
- Confirmed folder is structured correctly for Netlify deployment.
- Added project notes file.
- Built the first rebuild pass with the current improvement list.

## Future edit queue

- Confirm exact official Pembroke Hill font/brand rules if a brand guide is available.
- Test 50 MB file uploads on the live Netlify site and adjust to a direct-upload flow if serverless request limits interfere.
- Decide whether urgent/high priority should still trigger email alerts from Apps Script or only log to Sheets.
- Consider adding admin-only configuration for report types later, if changing Apps Script manually becomes annoying.
