# PHS Security Hub — Rebuild Update Steps

## 1. Replace the GitHub project files

Unzip this package and copy the contents into the existing GitHub repo. Replace the old files with the new ones.

Key files changed:

```text
public/index.html
public/styles.css
public/app.js
public/assets/campus-aerial.jpg
netlify/functions/submit-report.js
google-apps-script/Code.gs
README.md
docs/PROJECT-NOTES.md
docs/REBUILD-UPDATE-STEPS.md
```

## 2. Commit and push to GitHub

From GitHub Desktop:

```text
1. Review changed files.
2. Commit to main.
3. Push origin.
```

Or from command line:

```bash
git add .
git commit -m "Rebuild PHS Security Hub forms and UI"
git push origin main
```

## 3. Confirm Netlify settings

Use these Netlify settings:

```text
Build command: leave blank
Publish directory: public
Functions directory: netlify/functions
```

Keep these environment variables in Netlify:

```text
APPS_SCRIPT_URL=your Apps Script /exec URL
APPS_SCRIPT_TOKEN=your Apps Script API token
```

Do not put the real URL or token into GitHub. Tiny rule, giant consequences.

## 4. Update Google Apps Script

Open the bound Google Sheet, then:

```text
Extensions → Apps Script
```

Replace the existing `Code.gs` with the new file from:

```text
google-apps-script/Code.gs
```

Also confirm the manifest still matches:

```text
google-apps-script/appsscript.json
```

## 5. Run Apps Script setup

In Apps Script, run:

```text
setup
```

Then run:

```text
showConfig
testMetadata
testSubmission
testDailyActivitySubmission
```

The setup will create/update the needed sheets and headers.

## 6. Redeploy Apps Script web app if needed

If your Apps Script deployment does not automatically use the latest version, redeploy it as a Web App and copy the new `/exec` URL into Netlify.

Use:

```text
Execute as: Me
Who has access: Anyone with the link
```

## 7. Test the live Netlify site

Test both forms:

### Incident Report

Confirm:

- Report title says Incident Report.
- Priority is required.
- Date and time are required.
- Location uses dropdowns.
- People Involved requires Yes/No.
- If Yes, person fields appear.
- Witness is only a role option, not a separate box.
- Narrative spellcheck works.
- Notification and Alert Handling sections are gone.

### Daily Activity Log

Confirm:

- It looks visually different from Incident Report.
- It is a quick officer log.
- It does not show Priority, Follow Up, People Involved, Witnesses, Notes, or Action Taken.
- It has date/time, campus, location, activity type, and quick entry.

## 8. Test attachments

Try small files first. Then test a larger file.

Target behavior:

```text
50 MB per file
No fixed file count cap
```

If large uploads fail on Netlify, the likely fix is a direct-upload flow instead of pushing base64 file data through the submit function.
