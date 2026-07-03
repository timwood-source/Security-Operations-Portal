# Update Workflow

## Site design changes

Edit files in:

```text
public/index.html
public/styles.css
public/app.js
```

Commit changes to GitHub. Netlify redeploys automatically.

## Report type or daily activity changes

Edit:

```text
google-apps-script/Code.gs
```

Then copy the updated `Code.gs` into the bound Google Sheet Apps Script project and run:

```text
setup
```

## File upload changes

Upload behavior is controlled by:

```text
public/app.js
netlify/functions/submit-report.js
netlify/functions/download-attachment.js
```

Current upload limits:

```text
Max files: 3
Max total size: 5 MB
Storage: Netlify Blobs
```

## Environment variables

Keep these in Netlify only:

```text
APPS_SCRIPT_URL
APPS_SCRIPT_TOKEN
```
