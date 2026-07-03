// Single authenticated gateway for the hub's operational data:
// key checkouts, pass-down entries, BOLO advisories, and report lookup.
// Forwards whitelisted actions to Apps Script with the server-side token
// and stamps the verified officer identity onto every write.

import { json, getBackendConfig, requireOfficer, isSupervisor, errorResponse } from "./lib/shared.mjs";

const ALLOWED_ACTIONS = new Set([
  "keyCheckout", "keyReturn", "listOpenKeys",
  "eqpCheckout", "eqpReturn", "listOpenEqp", "checkoutNames",
  "passdownSubmit", "listPassdown",
  "boloSubmit", "boloResolve", "listBolos",
  "announceSubmit", "announceExpire", "listAnnouncements",
  "listFollowUps", "closeFollowUp", "statsSummary",
  "lookupReport"
]);

// Command-tier actions: only supervisors may call these.
const SUPERVISOR_ACTIONS = new Set(["announceSubmit", "announceExpire", "closeFollowUp"]);

// Fields the verified identity overrides on each write action.
const IDENTITY_FIELDS = {
  keyCheckout: "issuingOfficer",
  keyReturn: "returningOfficer",
  eqpCheckout: "issuingOfficer",
  eqpReturn: "returningOfficer",
  passdownSubmit: "officer",
  boloSubmit: "postedBy",
  boloResolve: "resolvedBy",
  announceSubmit: "postedBy",
  announceExpire: "removedBy",
  closeFollowUp: "closedBy"
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

    if (SUPERVISOR_ACTIONS.has(action) && session.enabled && !isSupervisor(session.officer)) {
      return json(403, { ok: false, error: "Supervisor access required." });
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
