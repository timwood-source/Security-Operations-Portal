# GitHub Setup

Create a private GitHub repository and upload the contents of this folder to the repo root.

The repo should show:

```text
public/
netlify/
google-apps-script/
docs/
.github/
netlify.toml
package.json
README.md
```

If GitHub shows an extra folder above these files, the upload is nested incorrectly. Delete the extra folder and upload the contents inside it instead.

Do not commit real secrets. Keep `APPS_SCRIPT_URL` and `APPS_SCRIPT_TOKEN` in Netlify environment variables only.
