// One-shot backfill: shrink images that were uploaded BEFORE browser-side
// compression existed (src/lib/imageCompress.ts). New uploads already arrive
// compressed; these are the leftovers.
//
// SCOPE IS DELIBERATELY TWO BUCKETS. `contractor-docs` is excluded on purpose
// and must stay excluded: review-contractor sends those files to Claude to
// *read*, and the owner reads them by eye. Compressing an insurance
// certificate can destroy the fine print that is the entire point of holding
// it. Photos are decoration; documents are evidence.
//
// IT WRITES BACK TO THE SAME PATH, keeping the original extension even though
// the bytes become JPEG. That looks wrong and is not: both buckets are read
// through `getPublicUrl(path)` / a stored URL, so renaming `x.png` to `x.jpg`
// would break every reference. Browsers dispatch on the Content-Type header,
// which is set correctly. The usual rule ("derive the extension from the
// returned file") governs NEW uploads, where no reference exists yet.
//
// THE GOVERNING RULE, copied from imageCompress.ts: every failure path leaves
// the ORIGINAL in place. Undecodable, encode error, or a "compressed" result
// that came out bigger -- all skip.
//
// v2: MEMORY. A 3 MB phone photo decodes to ~50 MB of RGBA, and three of them
// alive at once returns WORKER_RESOURCE_LIMIT (546) with nothing written --
// which v1 did. Each file is decoded inside its own scope, the pixel buffer
// is released explicitly rather than waiting on the collector to notice, and
// there is a yield between files. `limit` is capped at 4, not 12.
//
// v3: RE-RUNS MUST BE SAFE. Because workers do sometimes hit that limit, this
// gets run more than once, and JPEG is lossy -- re-encoding an already-
// processed file quietly degrades it every pass. `alreadyDone` is the
// idempotency test: a file that is already JPEG and already within maxDim has
// nothing left to gain, so it is skipped rather than re-encoded. That is what
// makes "just fire it again until the numbers stop moving" a correct
// procedure instead of a slow way to ruin the portfolio.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { Image, decode } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin        = createClient(SUPABASE_URL, SERVICE_KEY);

// No CORS allow-list and no browser entry point: reachable ONLY from Postgres.
const cors = { "Access-Control-Allow-Origin": "null" };

// AUTH. verify_jwt is NOT authentication -- the anon key is a valid
// project-signed JWT that ships in the public JS bundle. Redeeming a
// single-use internal token through the service-role client is what proves
// the caller is Postgres. That matters here because this function has
// service-role WRITE access to storage: an open version of it would let
// anyone overwrite any contractor's portfolio.
async function callerIsInternal(req: Request): Promise<boolean> {
  const t = req.headers.get("x-ff-internal") ?? "";
  if (!t) return false;
  const { data, error } = await admin.rpc("consume_internal_token", {
    p_token: t,
    p_purpose: "edge-internal",
  });
  return !error && data === true;
}

// Mirrors the two relevant profiles in src/lib/imageCompress.ts so a
// backfilled file is indistinguishable from one uploaded today. `document` is
// absent on purpose -- see the header.
const PROFILES: Record<string, { maxDim: number; quality: number }> = {
  "portfolio-photos":  { maxDim: 1600, quality: 82 }, // photo
  "contractor-photos": { maxDim: 640,  quality: 85 }, // avatar
};

// Below this there is nothing to win and a re-encode can only lose quality.
const FLOOR_BYTES = 300_000;

const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8;

type Row = { name: string; before: number; after: number; note: string };

// Returns the JPEG bytes, or null with a reason. Everything large is local to
// this function so it can be released the moment it returns.
async function shrink(src: Uint8Array, maxDim: number, quality: number): Promise<{ out?: Uint8Array; why?: string }> {
  let img: Image;
  try {
    const d = await decode(src);
    // A GIF decodes to a Frame collection, not an Image. Re-encoding one as a
    // still would silently kill the animation, so leave it.
    if (!(d instanceof Image)) return { why: "not a still image -- left alone" };
    img = d;
  } catch { return { why: "could not decode -- left alone" }; }

  try {
    const longest = Math.max(img.width, img.height);
    // The idempotency test -- see the v3 note in the header.
    if (longest <= maxDim && isJpeg(src)) {
      return { why: `already ${img.width}x${img.height} JPEG -- left alone` };
    }
    if (longest > maxDim) {
      const s = maxDim / longest;
      img.resize(Math.max(1, Math.round(img.width * s)), Math.max(1, Math.round(img.height * s)));
    }
    return { out: await img.encodeJPEG(quality) };
  } catch {
    return { why: "could not encode -- left alone" };
  } finally {
    // Hand the pixel buffer back now instead of hoping the collector gets to
    // it before the next file is decoded. This is the difference between the
    // batch finishing and a 546.
    try { (img as any).bitmap = new Uint32Array(0); } catch { /* best effort */ }
  }
}

async function processOne(bucket: string, name: string, size: number, dryRun: boolean): Promise<Row> {
  const p = PROFILES[bucket];
  const row: Row = { name, before: size, after: size, note: "" };

  const { data: blob, error: dErr } = await admin.storage.from(bucket).download(name);
  if (dErr || !blob) { row.note = "download failed -- left alone"; return row; }

  const src = new Uint8Array(await blob.arrayBuffer());
  const { out, why } = await shrink(src, p.maxDim, p.quality);
  if (!out) { row.note = why ?? "skipped"; return row; }

  if (out.byteLength >= src.byteLength) {
    row.note = `re-encode was bigger (${out.byteLength}) -- left alone`;
    return row;
  }

  row.after = out.byteLength;
  if (dryRun) { row.note = "would compress"; return row; }

  const { error: uErr } = await admin.storage.from(bucket).upload(name, out, {
    upsert: true,
    contentType: "image/jpeg",
    cacheControl: "3600",
  });
  if (uErr) { row.after = size; row.note = "upload failed -- original intact"; return row; }

  row.note = "compressed";
  return row;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!(await callerIsInternal(req))) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const bucket = String(body.bucket ?? "");
    const dryRun = body.dryRun !== false;        // must opt IN to writing
    const limit  = Math.min(Math.max(Number(body.limit ?? 2), 1), 4);
    const after  = String(body.after ?? "");     // cursor: last name processed

    if (!PROFILES[bucket]) {
      return new Response(JSON.stringify({ error: "unknown bucket" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // The worklist comes from storage.objects rather than storage.list() so
    // the size filter and the cursor are one indexed query, and so a re-run
    // naturally picks up only what is still oversized.
    const { data: todo, error: qErr } = await admin.rpc("admin_oversized_objects", {
      p_bucket: bucket, p_floor: FLOOR_BYTES, p_after: after, p_limit: limit,
    });
    if (qErr) throw qErr;

    const rows: Row[] = [];
    for (const t of (todo ?? []) as { name: string; bytes: number }[]) {
      rows.push(await processOne(bucket, t.name, Number(t.bytes), dryRun));
      // Yield so the collector actually runs between files.
      await new Promise((r) => setTimeout(r, 120));
    }

    const before = rows.reduce((a, r) => a + r.before, 0);
    const afterB = rows.reduce((a, r) => a + r.after, 0);

    return new Response(JSON.stringify({
      ok: true, bucket, dryRun,
      processed: rows.length,
      before_bytes: before,
      after_bytes: afterB,
      saved_bytes: before - afterB,
      next_cursor: rows.length ? rows[rows.length - 1].name : null,
      rows,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("compress-images error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
