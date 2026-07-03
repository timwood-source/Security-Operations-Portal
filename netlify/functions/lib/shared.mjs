// Shared helpers for all PHS Security Hub functions.
// Auth model: individual officer logins through Auth0.
// If AUTH0_DOMAIN is not set, auth runs in DISABLED mode so the site can be
// deployed and verified before Auth0 is configured. The frontend shows a
// clear warning banner in that state. Set AUTH0_DOMAIN, AUTH0_CLIENT_ID,
// and AUTH0_AUDIENCE in Netlify to turn enforcement on.

import { createRemoteJWKSet, jwtVerify } from "jose";

export function json(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

export function getBackendConfig() {
  const url = process.env.APPS_SCRIPT_URL;
  const token = process.env.APPS_SCRIPT_TOKEN;
  if (!url) throw new Error("Missing Netlify environment variable: APPS_SCRIPT_URL");
  if (!token) throw new Error("Missing Netlify environment variable: APPS_SCRIPT_TOKEN");
  return { url: String(url).replace(/\/+$/, ""), token };
}

export function authConfig() {
  const domain = process.env.AUTH0_DOMAIN || "";
  const clientId = process.env.AUTH0_CLIENT_ID || "";
  const audience = process.env.AUTH0_AUDIENCE || "";
  return { enabled: Boolean(domain && clientId && audience), domain, clientId, audience };
}

// JWKS is cached at module scope so warm invocations skip the network trip.
let jwksCache = null;
let jwksDomain = "";

function getJwks(domain) {
  if (!jwksCache || jwksDomain !== domain) {
    jwksCache = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
    jwksDomain = domain;
  }
  return jwksCache;
}

/**
 * Verifies the officer's session.
 * Returns { enabled, officer } on success.
 * Throws with .status = 401 when auth is enabled and the token is bad/missing.
 */
export async function requireOfficer(request) {
  const config = authConfig();

  if (!config.enabled) {
    return { enabled: false, officer: null };
  }

  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    const err = new Error("Sign in required.");
    err.status = 401;
    throw err;
  }

  try {
    const { payload } = await jwtVerify(match[1], getJwks(config.domain), {
      issuer: `https://${config.domain}/`,
      audience: config.audience
    });

    return {
      enabled: true,
      officer: {
        sub: String(payload.sub || ""),
        // Standard OIDC claims land here when Auth0 is configured to include
        // them in the access token; otherwise the frontend supplies the
        // display name from the verified ID token and we record sub as proof.
        email: String(payload.email || payload["https://phs-hub/email"] || ""),
        name: String(payload.name || payload["https://phs-hub/name"] || "")
      }
    };
  } catch (err) {
    const wrapped = new Error("Session expired or invalid. Sign in again.");
    wrapped.status = 401;
    throw wrapped;
  }
}

export async function getStore(name) {
  const blobs = await import("@netlify/blobs");
  return blobs.getStore({ name, consistency: "strong" });
}

export function errorResponse(err) {
  const status = err.status || 500;
  return json(status, { ok: false, error: err.message || "Request failed." });
}
