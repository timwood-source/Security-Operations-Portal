import { json, getBackendConfig, requireOfficer, errorResponse } from "./lib/shared.mjs";

export default async (request) => {
  if (request.method !== "GET") return json(405, { ok: false, error: "Method not allowed." });

  try {
    await requireOfficer(request);
    const { url } = getBackendConfig();

    const response = await fetch(`${url}?action=metadata`, {
      headers: { Accept: "application/json" }
    });

    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return json(502, { ok: false, error: "Apps Script did not return JSON for metadata.", status: response.status });
    }

    return json(response.ok ? 200 : response.status, payload);
  } catch (err) {
    return errorResponse(err);
  }
};

export const config = { path: "/api/metadata" };
