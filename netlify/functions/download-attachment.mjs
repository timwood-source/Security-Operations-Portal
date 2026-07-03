// Serves report attachments. Links carry a per-file secret token so they
// work directly from the Google Sheet (bearer-link model — treat the Sheet
// as sensitive). Large files stored as chunk manifests are streamed back
// as one continuous download.

import path from "node:path";
import { getStore } from "./lib/shared.mjs";

function textResponse(status, message) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" }
  });
}

function safeDownloadName(name) {
  return path.basename(String(name || "attachment")).replace(/["\r\n]/g, "_") || "attachment";
}

export default async (request) => {
  if (request.method !== "GET") return textResponse(405, "Method not allowed");

  try {
    const url = new URL(request.url);
    const key = url.searchParams.get("key") || "";
    const token = url.searchParams.get("t") || "";

    if (!key || !token) return textResponse(400, "Missing attachment key or token.");
    if (key.startsWith("chunks/")) return textResponse(403, "Not directly downloadable.");

    const store = await getStore("report-attachments");
    const meta = await store.getMetadata(key);

    if (!meta) return textResponse(404, "Attachment not found.");
    if (!meta.metadata || meta.metadata.accessToken !== token) {
      return textResponse(403, "Attachment token is invalid.");
    }

    const name = safeDownloadName(meta.metadata.name);
    const contentType = meta.metadata.type || "application/octet-stream";
    const size = Number(meta.metadata.size || 0);

    const headers = {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store"
    };
    if (size) headers["Content-Length"] = String(size);

    if (meta.metadata.chunked) {
      const manifest = await store.get(key, { type: "json" });
      const chunkKeys = Array.isArray(manifest?.chunkKeys) ? manifest.chunkKeys : [];
      if (!chunkKeys.length) return textResponse(500, "Attachment manifest is empty.");

      const stream = new ReadableStream({
        async start(controller) {
          try {
            for (const chunkKey of chunkKeys) {
              const chunk = await store.get(chunkKey, { type: "arrayBuffer" });
              if (!chunk) throw new Error("Attachment chunk missing.");
              controller.enqueue(new Uint8Array(chunk));
            }
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        }
      });

      return new Response(stream, { status: 200, headers });
    }

    const body = await store.get(key, { type: "stream" });
    if (!body) return textResponse(404, "Attachment not found.");

    return new Response(body, { status: 200, headers });
  } catch (err) {
    return textResponse(500, err.message || "Could not download attachment.");
  }
};

export const config = { path: "/api/download-attachment" };
