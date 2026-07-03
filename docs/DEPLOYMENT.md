# PHS Security Hub v3 — Deployment Walkthrough

This guide upgrades your **existing** v2 setup (GitHub repo → Netlify site →
Apps Script backend) to v3. Every step tells you exactly where to click and
what you should see when it worked.

**Time estimate:** Part 1–3: about 30 minutes. Part 4 (logins): about 30
minutes. Part 5 (calendars): 10 minutes once you have the links.

**Order matters.** Do the parts in order. You can safely stop after Part 3 —
the hub will be live and working, just without sign-in and calendars yet.

---

# PART 1 — Update the Google Apps Script backend

### Step 1.1 — Open the script

1. Open your PHS reporting **Google Sheet** in the browser.
2. In the Sheet's menu bar, click **Extensions → Apps Script**.
   A new tab opens showing the script editor with `Code.gs` on the left.

### Step 1.2 — Paste in the new code

1. On your computer, open the v3 folder and open
   `google-apps-script/Code.gs` in any text editor (Notepad is fine).
2. Select all of it (Ctrl+A) and copy (Ctrl+C).
3. In the Apps Script tab, click inside the code area, select all
   (Ctrl+A), and paste (Ctrl+V). The old code is now fully replaced.
4. Click the **💾 Save** icon (or Ctrl+S).

> ✅ **Check:** the very top of the file should now say
> `PHS FIELD REPORTING — SAFE BACKEND` and, a little lower, a `CONFIG`
> block that includes `KEY_LIST` (the key checkout dropdown). If you see
> `KEY_LIST`, you have the v3 code.

### Step 1.3 — Review the CONFIG block (optional but recommended)

Near the top of the file:

- `ALERT_EMAIL` — where urgent alerts and the 6 AM digest go. Change if needed.
- `KEY_LIST` — the keys/keycards officers can issue. Edit the list now or later.
- `DAILY_SUMMARY_HOUR: 6` — the morning digest hour (6 = 6 AM Central).

If you change anything, **Save** again.

### Step 1.4 — Run setup()

1. In the toolbar above the code there's a function dropdown (it may say
   `doGet` or `setup`). Select **setup**.
2. Click **▶ Run**.
3. The first run asks for authorization: click **Review permissions**,
   pick your Google account, and if you see "Google hasn't verified this
   app," click **Advanced → Go to (project name) (unsafe)** — this is your
   own script, it's fine — then **Allow**.
4. Wait for it to finish (a few seconds).

> ✅ **Check:** go back to the Google Sheet tab. Along the bottom you
> should now see three **new sheet tabs**: `Key Checkouts`,
> `Pass-Down Log`, and `BOLO Board`, each with bold header rows.

### Step 1.5 — Run the tests

Run each of these from the same function dropdown, one at a time, clicking
**▶ Run** each time. After each run, click **Execution log** (View menu or
the bottom panel) and confirm you see `"ok":true` with no red errors:

1. `testMetadata`
2. `testSubmission` → also check the **Incident Reports** sheet: the test
   row's Report ID should be **PHS-0001** ← this is the new numbering working.
3. `testDailyActivitySubmission` → the Daily Activity Log sheet gets **DAR-0001**.
4. `testKeyCheckoutFlow` → Key Checkouts sheet gets **KEY-0001**, status
   flips OUT → RETURNED.
5. `testPassdownAndBolo` → one row each in Pass-Down Log and BOLO Board.

### Step 1.6 — Wipe the test data so production starts at 0001

1. In the Google Sheet, **delete the test rows** you just created in:
   Incident Reports, Daily Activity Log, Reports Index, Key Checkouts,
   Pass-Down Log, and BOLO Board (leave the bold header rows).
2. Back in the Apps Script tab, click the **⚙ gear icon (Project Settings)**
   in the left sidebar.
3. Scroll down to **Script Properties**. You'll see rows like
   `COUNTER_PHS = 1`, `COUNTER_DAR = 1`, `COUNTER_KEY = 1`.
4. Delete those three properties (trash icon next to each). Do **not**
   delete `API_TOKEN` or the others.

> ✅ **Check:** Script Properties still contains `API_TOKEN`, `ALERT_EMAIL`,
> and no `COUNTER_*` rows. The first real report will now be PHS-0001.

### Step 1.7 — Deploy the new version

1. Top-right of the Apps Script editor: **Deploy → Manage deployments**.
2. You should see your existing Web App deployment. Click the **✏️ pencil**.
3. Under Version, choose **New version**.
4. Click **Deploy**.

> ✅ **Check:** the URL shown ends in `/exec` and is the **same URL** as
> before — that means Netlify's existing `APPS_SCRIPT_URL` still points to
> the right place. If for some reason you created a *new* deployment
> instead of editing the old one, copy the new `/exec` URL — you'll need
> it in Step 3.2.

### Step 1.8 — Copy the API token

1. Function dropdown → **showConfig** → **▶ Run**.
2. Open the Execution log. Copy the long value after `API Token:` into a
   notepad. (It should be the same token you already have in Netlify; you'll
   just confirm it in Part 3.)

---

# PART 2 — Push the new code to GitHub

### If you edit files on the GitHub website (no Git installed):

The simplest reliable way to replace many files at once:

1. Go to your repo on github.com.
2. Click **Add file → Upload files**.
3. On your computer, open the v3 folder so you can see `public`, `netlify`,
   `google-apps-script`, `docs`, and the loose files (`netlify.toml`,
   `package.json`, `README.md`, etc.).
4. Select **all of those folders and files** and drag them into the GitHub
   upload area. GitHub keeps folder structure and **overwrites files with
   the same names** — that's what we want.
5. Commit message: `v3 rebuild`. Click **Commit changes** (directly to `main`).

⚠️ Old v2 files that v3 no longer uses (like `netlify/functions/metadata.js` —
note the plain `.js`) will still exist in the repo after an upload, and the
old `.js` functions will conflict with the new `.mjs` ones. Delete these
five files on GitHub (open each → trash-can icon → commit):

- `netlify/functions/_shared.js`
- `netlify/functions/metadata.js`
- `netlify/functions/submit-report.js`
- `netlify/functions/download-attachment.js`

(If a file isn't there, fine — skip it.)

### If you use Git on your computer:

```
# from inside your local repo folder
# copy the v3 files over the old ones, then:
git add -A
git rm netlify/functions/_shared.js netlify/functions/metadata.js \
       netlify/functions/submit-report.js netlify/functions/download-attachment.js 2>/dev/null
git commit -m "v3 rebuild"
git push origin main
```

> ✅ **Check:** on GitHub, `netlify/functions/` should show **only `.mjs`
> files plus the `lib/` folder** — no plain `.js` files. `public/` should
> contain `manifest.webmanifest`, `sw.js`, and a `data/` folder.

---

# PART 3 — Netlify: verify settings and go live

### Step 3.1 — Watch the deploy

1. Log in at app.netlify.com and open your site.
2. The push in Part 2 triggers a deploy automatically. Click **Deploys**
   and watch the top entry. It should reach a green **Published** in 1–3
   minutes. (v3 adds an npm dependency, `jose`, so this deploy takes
   slightly longer than usual — normal.)

If it fails, click the failed deploy and read the log — 90% of the time it's
a leftover old `.js` function (go back to the Part 2 deletion step).

### Step 3.2 — Confirm environment variables

1. **Site configuration → Environment variables.**
2. Confirm these two exist from v2 (add them if missing):
   - `APPS_SCRIPT_URL` = your `/exec` URL
   - `APPS_SCRIPT_TOKEN` = the token from Step 1.8
3. If you changed either one, go to **Deploys → Trigger deploy →
   Deploy site** so functions pick up the new values.

### Step 3.3 — First look at the live hub

Open your site URL. You should see:

- The new **top navigation**: Dashboard · IR-01 Incident · DA-02 Daily Log ·
  KC-03 Keys · PD-04 Pass-Down · Gates · Post Orders.
- A **yellow banner**: "Officer login is not configured yet…" — expected;
  we turn login on in Part 4.
- The dashboard with a working **weather** card, a **Gates right now** card
  saying "Sample schedule," a **Keys out: 0** card, and red notes in the
  calendar area saying the feeds aren't configured — also expected until
  Part 5.
- Status pill in the top bar: **Connected** (green).

### Step 3.4 — Smoke test (5 minutes, do all of these)

1. **DA-02 Daily Log** → fill it out → Submit. You should get the big
   confirmation screen with **DAR-0001**. Tap **Copy number** — it should
   say "Copied ✓". Check the Google Sheet: the row is there.
2. **KC-03 Keys** → check out a test key → confirmation shows **KEY-0001**
   → it appears under "Keys currently out" → tap **Mark returned** →
   it clears. Dashboard "Keys out" card shows 0 again.
3. **PD-04 Pass-Down** → save a flagged test entry → it appears in the list
   with a gold flag, and on the Dashboard under "Pass-down · last 24h".
4. **Dashboard → Report lookup** → type `DAR-0001` → the summary card
   should appear.
5. **Dashboard → + Post advisory** → post a test advisory expiring
   tomorrow → it appears → click **Resolve** → it disappears.
6. Tap the **◐** button top-right → the whole hub flips to night mode.
7. On your phone, open the site → browser menu → **Add to Home Screen** →
   it installs like an app.

Then clean up: delete the test rows from the Sheet, and (if you want the
counters back at 0001) delete the `COUNTER_*` script properties again as in
Step 1.6.

**You are now live.** Parts 4 and 5 add login and calendars.

---

# PART 4 — Turn on officer logins (Auth0)

Auth0's free tier easily covers a security team. Budget ~30 minutes.

### Step 4.1 — Create the Auth0 account & application

1. Go to **auth0.com → Sign up** (use your work email). When asked for a
   tenant name/region, anything is fine — note the **tenant domain** it
   gives you, like `phs-security.us.auth0.com`.
2. In the left sidebar: **Applications → Applications → Create Application**.
3. Name: `PHS Security Hub`. Type: **Single Page Web Applications** → Create.
4. Open the app's **Settings** tab and scroll to **Application URIs**.
   Put your site URL (e.g. `https://phs-security-hub.netlify.app`) into
   **all three** of these boxes:
   - Allowed Callback URLs
   - Allowed Logout URLs
   - Allowed Web Origins
5. Scroll to the bottom → **Save Changes**.
6. Scroll back to the top of Settings and copy two values into a notepad:
   **Domain** and **Client ID**.

### Step 4.2 — Create the API (this makes secure tokens possible)

1. Left sidebar: **Applications → APIs → Create API**.
2. Name: `PHS Hub API`. Identifier: exactly `https://phs-security-hub`
   (it's a label, not a real web address — nothing needs to exist there).
   Leave the signing algorithm as RS256. → Create.

### Step 4.3 — Make it invite-only (important)

By default anyone could create an account. Shut that off:

1. Left sidebar: **Authentication → Database → Username-Password-Authentication**.
2. Open the **Settings** tab, find **Disable Sign Ups**, switch it **ON**, Save.

### Step 4.4 — Create officer accounts

1. Left sidebar: **User Management → Users → Create User**.
2. For each officer: their email + a temporary password. Connection:
   Username-Password-Authentication.
3. After creating each user, open the user → edit the **Name** field to
   their real name (e.g. "T. Wood") — this is what auto-fills
   "Submitted by" on reports.
4. Tell each officer their temp password; they change it at first login via
   "Forgot password" or you can send a password-reset email from their
   user page (**Actions → Send a password reset**).

When someone leaves the team: **User Management → Users → (person) →
Actions → Block** (or Delete). Their sign-in stops working immediately.

### Step 4.5 — Give Netlify the three values

1. Netlify → **Site configuration → Environment variables → Add a variable**,
   three times:
   - `AUTH0_DOMAIN` = the Domain from Step 4.1 (e.g. `phs-security.us.auth0.com` — no `https://`)
   - `AUTH0_CLIENT_ID` = the Client ID from Step 4.1
   - `AUTH0_AUDIENCE` = `https://phs-security-hub`
2. **Deploys → Trigger deploy → Deploy site.**

### Step 4.6 — Verify login end to end

1. Open the hub in a fresh tab. You should now see the **sign-in screen**
   (navy card over the campus photo) instead of the yellow banner.
2. Click **Sign in** → Auth0's login page → enter a test officer's email +
   password → you land back on the dashboard.
3. Top-right shows the officer's name with a **Sign out** button.
4. Open **IR-01 Incident** → "Submitted by" is pre-filled with their name
   and can't be edited ("Filled from your sign-in").
5. The real proof the backend is locked: open a **private/incognito
   window**, don't sign in, and go to
   `https://YOUR-SITE.netlify.app/api/metadata` — you should see
   `{"ok":false,"error":"Sign in required."}`.

> ⚠️ If sign-in bounces you back with an error, 99% of the time one of the
> three **Application URI boxes** in Step 4.1 doesn't exactly match your
> site URL (https, no trailing slash).

---

# PART 5 — Connect the calendars

### Step 5.1 — Athletics (rSchoolToday)

1. Open the public athletics calendar page.
2. Look for **Subscribe** (sometimes under a "Download/Subscribe" or
   bell/feed icon near the schedule view).
3. Choose the **iCal** option and copy the URL it gives you
   (starts with `http` and usually ends in `.ics` or has `ical` in it).

### Step 5.2 — Faculty (Veracross)

1. Sign in to the faculty portal and open the faculty calendar.
2. Find the **Subscribe to Calendar** option (often a small feed/gear icon
   near the calendar).
3. Copy the ICS link. If it starts with `webcal://`, change that part to
   `https://` — the rest stays the same.
4. **Treat this link like a password** — anyone who has it can read the
   faculty calendar. It goes only into Netlify, never into GitHub or a doc.

### Step 5.3 — Add to Netlify and verify

1. Netlify → Environment variables → add:
   - `RSCHOOL_ICS_URL` = the athletics iCal URL
   - `VERACROSS_ICS_URL` = the faculty ICS URL
2. Trigger a deploy.
3. Open the dashboard. The red "not configured" notes are gone and the
   **Next 14 days** panel fills in: today expanded, other days tappable,
   each event tagged **ATH** (teal) or **FAC** (crimson).

> ⚠️ **Check the home/away filter:** compare a few days against the real
> athletics calendar. If away games are sneaking in (or home games missing),
> the fix is the `HOME_KEYWORDS` variable — comma-separated words matched
> against the event's location/title (default `pembroke`). Adjust, redeploy,
> re-check. If it still misbehaves, send me two or three example event
> titles/locations from the feed and I'll tune the filter properly.

Note: the calendar caches for 15 minutes, so feed changes take up to 15
minutes to appear.

---

# PART 6 — Swap in real data (whenever ready)

| What | Where | How |
|---|---|---|
| Real gate schedules | `public/data/gates-schedule.json` | Replace the sample windows; set `"sample": false`. The yellow banners disappear and "Gates right now" goes live. |
| Post order PDFs | `public/docs/post-orders/` + `public/data/post-orders.json` | Upload the PDF, then change that post's `"file": null` to `"file": "the-filename.pdf"`. |
| Quick contacts | `public/data/contacts.json` | Replace the `EDIT:` placeholders with real numbers. |
| Key list changes | `CONFIG.KEY_LIST` in Code.gs | Edit in Apps Script and Save. No redeploy needed — the dropdown updates on next page load. |

Every file edit above = commit to GitHub → Netlify auto-deploys.

---

# Troubleshooting quick reference

| Symptom | Likely cause / fix |
|---|---|
| Netlify deploy fails | Old `.js` function files still in `netlify/functions/` — delete them (Part 2). |
| Status pill says Offline | `APPS_SCRIPT_URL` / `APPS_SCRIPT_TOKEN` wrong or missing; or you forgot to Deploy a **New version** in Apps Script (Step 1.7). |
| Reports still get long timestamp IDs | The Apps Script deployment is serving the old code — Step 1.7 again, and make sure you edited the **existing** deployment. |
| Sign-in loops or errors | Application URIs in Auth0 don't exactly match the site URL (Step 4.1). |
| "Sign in required" on everything after enabling Auth0 | Expected for anyone not signed in — that's the protection working. |
| Calendar shows one source only | The other feed's URL is wrong/expired — the red note names which one and why. |
| Big video upload fails | Try once more (chunk uploads resume from scratch per attempt). If it persists, tell me the file size and the exact error text. |
| Morning digest didn't arrive | Re-run `setup()` (it re-creates the trigger), and check Apps Script → Triggers shows `sendDailySummary` daily 6–7 AM. |
