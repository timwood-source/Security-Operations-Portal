// Receives one chunk of a large attachment. The browser slices files bigger
// than the inline limit into ~3 MB chunks and posts them here one at a time,
// which keeps every request safely under the serverless payload cap while
// still supporting 50 MB files end to end. submit-report ties the chunks
// together into a single downloadable attachment.

import crypto from "node:crypto";
import { json, requireOfficer, getStore, errorResponse } from "./lib/shared.mjs";

const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_CHUNKS = 20; // 20 x ~3 MB = 60 MB ceiling, above the 50 MB app limit

const UPLOAD_ID_PATTERN = /^[a-f0-9-]{36}$/;

export default async (request) => {
  if (request.method !== "POST") return json(405, { ok: false, error: "Method not allowed." });

  try {
    await requireOfficer(request);

    const body = JSON.parse(await request.text());
    const uploadId = String(body.uploadId || "");
    const index = Number(body.index);
    const total = Number(body.total);

    if (!UPLOAD_ID_PATTERN.test(uploadId)) throw new Error("Invalid upload ID.");
    if (!Number.isInteger(index) || index < 0 || index >= MAX_CHUNKS) throw new Error("Invalid chunk index.");
    if (!Number.isInteger(total) || total < 1 || total > MAX_CHUNKS) throw new Error("Invalid chunk count.");
    if (!body.data) throw new Error("Missing chunk data.");

    const buffer = Buffer.from(String(body.data), "base64");
    if (!buffer.length) throw new Error("Empty chunk.");
    if (buffer.length > MAX_CHUNK_BYTES) throw new Error("Chunk exceeds the size limit.");

    const store = await getStore("report-attachments");
    const key = `chunks/${uploadId}/${String(index).padStart(3, "0")}`;

    await store.set(key, buffer, {
      metadata: {
        uploadId,
        index,
        total,
        size: buffer.length,
        checksum: crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16),
        uploadedAt: new Date().toISOString()
      }
    });

    return json(200, { ok: true, uploadId, index, received: buffer.length });
  } catch (err) {
    return errorResponse(err);
  }
};

export const config = { path: "/api/upload-chunk" };
