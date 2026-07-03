// Tells the signed-in browser who the server thinks it is — including
// whether the Command tier (supervisor) is unlocked. The frontend uses this
// to show or lock supervisor-only navigation; enforcement stays server-side.

import { json, requireOfficer, isSupervisor, errorResponse } from "./lib/shared.mjs";

export default async (request) => {
  if (request.method !== "GET") return json(405, { ok: false, error: "Method not allowed." });
  try {
    const session = await requireOfficer(request);
    if (!session.enabled) {
      return json(200, { ok: true, authEnabled: false, supervisor: true });
    }
    return json(200, {
      ok: true,
      authEnabled: true,
      name: session.officer.name,
      email: session.officer.email,
      supervisor: isSupervisor(session.officer)
    });
  } catch (err) {
    return errorResponse(err);
  }
};

export const config = { path: "/api/whoami" };
