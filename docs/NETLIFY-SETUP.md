# Netlify Setup

## Build settings

Use these settings:

```text
Build command: leave blank
Publish directory: public
Functions directory: netlify/functions
```

## Environment variables

In Netlify, go to Site configuration > Environment variables and add:

```text
APPS_SCRIPT_URL=your Apps Script /exec URL
APPS_SCRIPT_TOKEN=your Apps Script API token
```

Do not place these in GitHub.

## Upload storage

This build uses Netlify Blobs for report attachments. Netlify will install `@netlify/blobs` from `package.json` during deploy.

The file download function is available at:

```text
/api/download-attachment
```

The report submission function is available at:

```text
/api/submit-report
```

The metadata function is available at:

```text
/api/metadata
```
