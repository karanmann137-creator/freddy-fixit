// ONE answer to "turn a job's storage photos into thumbnails a printed document
// can carry." Used by the completion certificate; the contractor side will want
// the same thing, and two copies of this would drift on the size cap first.
//
// Why it exists at all: printDoc's photo block only accepts `data:` URLs, because
// a signed storage URL expires in an hour and a document people FILE must not go
// blank after it is saved. So somebody has to download, shrink and base64 the
// photo, and that is a different job from rendering.
//
// ⚠️ THE SIZE CAP IS THE POINT, NOT A NICETY. The completion-photos bucket caps
// uploads at 10MB, base64 inflates by ~33%, and `compressImage()` returns the
// ORIGINAL FILE on every one of its failure paths (by design — a failed compress
// must never block an upload). Chain those and a two-photo certificate is a 27MB
// document: it hangs the print dialog, and it bounces off every mail server it is
// sent through, which is the one thing this document exists to survive. So the
// size is checked AFTER compressing and a photo over the cap is dropped. The
// caller reports the count; it never silently ships a document that cannot be sent.

import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompress";

/** Per-photo ceiling on the encoded bytes. Two of these plus the page stays under ~1.5MB. */
const MAX_THUMB_BYTES = 420 * 1024;

export type DocPhoto = { src: string; caption?: string };

function toDataUrl(f: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(f);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Download, shrink and base64 one storage object. Null on any failure — a missing
 * thumbnail is a visible gap in the document, never a thrown error that costs the
 * client the whole certificate.
 */
async function thumb(bucket: string, path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) return null;
    const res = await fetch(data.signedUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;

    // `avatar` is 640px / q0.85 — the right geometry for a ~3in print frame, and
    // small enough that the cap below almost never has to fire.
    const name = path.split("/").pop() || "photo";
    const shrunk = await compressImage(new File([blob], name, { type: blob.type || "image/jpeg" }), "avatar");
    if (shrunk.size > MAX_THUMB_BYTES) return null;

    const url = await toDataUrl(shrunk);
    return url && /^data:image\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}

/**
 * The before/after pair for a job, ready for printDoc's photo block.
 *
 * Returns only what it actually managed to embed, plus how many it could not, so
 * the caller can print "1 photo could not be included" rather than quietly
 * handing over a certificate with half the evidence missing.
 */
export async function jobPhotoThumbs(job: any): Promise<{ photos: DocPhoto[]; dropped: number }> {
  const want: { path: string; caption: string }[] = [];
  if (job?.before_photo_path) want.push({ path: String(job.before_photo_path), caption: "Before" });
  if (job?.completion_photo_path) want.push({ path: String(job.completion_photo_path), caption: "After — work completed" });

  const photos: DocPhoto[] = [];
  for (const w of want) {
    const src = await thumb("completion-photos", w.path);
    if (src) photos.push({ src, caption: w.caption });
  }
  return { photos, dropped: want.length - photos.length };
}
