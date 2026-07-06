// netlify/functions/metadata.js
// PHS Security Hub - Metadata bridge

exports.handler = async function () {
  try {
    const appsScriptUrl =
      process.env.APPS_SCRIPT_URL ||
      process.env.GAS_WEB_APP_URL;

    if (!appsScriptUrl) {
      return json(500, {
        ok: false,
        error: "Missing Apps Script URL. Add APPS_SCRIPT_URL or GAS_WEB_APP_URL in Netlify environment variables."
      });
    }

    const metadataUrl = appsScriptUrl.includes("?")
      ? `${appsScriptUrl}&action=metadata`
      : `${appsScriptUrl}?action=metadata`;

    const response = await fetch(metadataUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return json(502, {
        ok: false,
        error: "Apps Script did not return JSON for metadata.",
        raw: text.slice(0, 500)
      });
    }

    return json(200, normalizeMetadata(data));
  } catch (err) {
    return json(502, {
      ok: false,
      error: "metadata function failed.",
      detail: err.message || String(err)
    });
  }
};

function normalizeMetadata(data) {
  const reportTypeOptions = Array.isArray(data.reportTypeOptions)
    ? data.reportTypeOptions
    : objectReportTypesToOptions(data.reportTypes);

  return {
    ...data,
    ok: data.ok !== false,
    reportTypeOptions,
    incidentTypes: Array.isArray(data.incidentTypes)
      ? data.incidentTypes
      : reportTypeOptions.filter(item => item.key !== "daily_activity"),
    dailyActivityTypes: Array.isArray(data.dailyActivityTypes)
      ? data.dailyActivityTypes
      : [],
    boloTypes: Array.isArray(data.boloTypes)
      ? data.boloTypes
      : [],
    shifts: Array.isArray(data.shifts)
      ? data.shifts
      : []
  };
}

function objectReportTypesToOptions(reportTypes) {
  if (!reportTypes || typeof reportTypes !== "object") return [];

  return Object.keys(reportTypes).map(key => {
    const item = reportTypes[key] || {};
    return {
      key,
      value: key,
      label: item.label || key,
      description: item.description || "",
      category: item.category || "major"
    };
  });
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}
