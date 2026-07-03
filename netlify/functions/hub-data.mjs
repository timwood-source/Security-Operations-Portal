// Single authenticated gateway for the hub's operational data:
// key checkouts, pass-down entries, BOLO advisories, and report lookup.
// Forwards whitelisted actions to Apps Script with the server-side token
// and stamps the verified officer identity onto every write.

import { json, getBackendConfig, requireOfficer, errorResponse } from "./lib/shared.mjs";

const ALLOWED_ACTIONS = new Set([
  "keyCheckout",
  "keyReturn",
  "listOpenKeys",
  "passdownSubmit",
  "listPassdown",
  "boloSubmit",
  "boloResolve",
  "listBolos",
  "lookupReport"
]);

// Fields the verified identity overrides on each write action.
const IDENTITY_FIELDS = {
  keyCheckout: "issuingOfficer",
  keyReturn: "returningOfficer",
  passdownSubmit: "officer",
  boloSubmit: "postedBy",
  boloResolve: "resolvedBy"
};

export default async (request) => {
  if (request.method !== "POST") return json(405, { ok: false, error: "Method not allowed." });

  try {
    const session = await requireOfficer(request);
    const { url, token } = getBackendConfig();

    let body;
    try {
      body = JSON.parse(await request.text());
    } catch {
      return json(400, { ok: false, error: "Invalid JSON request." });
    }

    const action = String(body.action || "");
    if (!ALLOWED_ACTIONS.has(action)) {
      return json(400, { ok: false, error: "Unknown action." });
    }

    const payload = { ...body, action, token };

    if (session.enabled && session.officer) {
      const verifiedName = session.officer.name || session.officer.email;
      const field = IDENTITY_FIELDS[action];
      if (field && verifiedName) payload[field] = verifiedName;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      return json(502, { ok: false, error: "Apps Script did not return JSON.", status: response.status });
    }

    return json(response.ok ? 200 : response.status, result);
  } catch (err) {
    return errorResponse(err);
  }
};

export const config = { path: "/api/hub-data" };
