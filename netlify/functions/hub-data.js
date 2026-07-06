// netlify/functions/hub-data.js
// PHS Security Hub - Dashboard data bridge

exports.handler = async function () {
  try {
    const appsScriptUrl =
      process.env.APPS_SCRIPT_URL ||
      process.env.GAS_WEB_APP_URL;

    const apiToken =
      process.env.APPS_SCRIPT_TOKEN ||
      process.env.GAS_API_TOKEN;

    if (!appsScriptUrl) {
      return json(500, {
        ok: false,
        error: "Missing Apps Script URL. Add APPS_SCRIPT_URL or GAS_WEB_APP_URL in Netlify environment variables."
      });
    }

    if (!apiToken) {
      return json(500, {
        ok: false,
        error: "Missing API token. Add APPS_SCRIPT_TOKEN or GAS_API_TOKEN in Netlify environment variables."
      });
    }

    const response = await fetch(appsScriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        token: apiToken,
        action: "hubData"
      })
    });

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return json(502, {
        ok: false,
        error: "Apps Script did not return JSON for hubData.",
        raw: text.slice(0, 500)
      });
    }

    return json(200, normalizeHubData(data));
  } catch (err) {
    return json(502, {
      ok: false,
      error: "hub-data function failed.",
      detail: err.message || String(err)
    });
  }
};

function normalizeHubData(data) {
  const open =
    data.keysAndEquipmentOut ||
    data.keysEquipmentOut ||
    data.equipmentOut ||
    data.keysOut ||
    data.openCheckouts ||
    data.openKeys ||
    data.openItems ||
    (data.keys && data.keys.open) ||
    data.open ||
    [];

  const safeOpen = Array.isArray(open) ? open : [];

  return {
    ...data,
    ok: data.ok !== false,
    openKeys: safeOpen,
    keysOut: safeOpen,
    equipmentOut: safeOpen,
    keysAndEquipmentOut: safeOpen,
    keysEquipmentOut: safeOpen,
    openCheckouts: safeOpen,
    openItems: safeOpen,
    keyCount: safeOpen.length,
    equipmentOutCount: safeOpen.length,
    keysAndEquipmentOutCount: safeOpen.length
  };
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
