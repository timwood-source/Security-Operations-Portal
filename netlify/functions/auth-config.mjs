// Serves the public Auth0 settings the browser needs to start a login.
// Domain, client ID, and audience are public by design (they appear in
// every Auth0 SPA); the secrets stay server-side.

import { json, authConfig } from "./lib/shared.mjs";

export default async () => {
  const config = authConfig();
  return json(200, {
    ok: true,
    authEnabled: config.enabled,
    domain: config.domain,
    clientId: config.clientId,
    audience: config.audience
  });
};

export const config = { path: "/api/auth-config" };
