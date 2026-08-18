/**
 * Client-side image compression, applied to every upload on the platform.
 *
 * WHY IN THE BROWSER, NOT AN EDGE FUNCTION
 * Compressing before the upload means the phone sends 300KB instead of 4MB.
 * That is the half of the trip that is actually slow for a contractor standing
 * in someone's basement on one bar of signal, and it costs us no compute and no
 * storage egress. A server-side resizer would have to receive the big file
 * first, which is the exact cost we are trying to avoid.
 *
 * THE GOVERNING RULE: NEVER LOSE A PHOTO.
 * Every failure path returns the ORIGINAL file untouched. If the browser can't
 * decode it, if the canvas comes back empty, if the "compressed" result is
 * somehow bigger — we upload what the user picked. A completion photo is a
 * payment gate and a dispute exhibit; a slightly large photo is a rounding
 * error, a missing one is a blocked payout.
 *
 * Output is always WebP. Verified against storage.buckets: image/webp is in
 * allowed_mime_types on all six image buckets (completion-photos,
 * contractor-docs, contractor-photos, message-media, portfolio-photos,
 * problem-photos), so this can't trip a bucket's MIME filter.
 */

export type CompressProfile = "photo" | "avatar" | "document";

/**
 * maxDim is the longest edge. Quality is deliberately per-use-case:
 *
 *  photo     Job before/after shots, request photos, chat images, portfolio.
 *            1600px is more than any surface displays and still lets an admin
 *            zoom into a dispute photo.
 *  avatar    Contractor headshot. Displayed at 44px on a bid row and a few
 *            hundred on the profile, so 640 is generous.
 *  document  Insurance certificates, WCB letters, trade tickets, government ID.
 *            Compressed GENTLY on purpose — review-contractor sends these to
 *            Claude to read, and the owner reads them by eye in the admin
 *            Documents panel. Small text is the whole payload, so this profile
 *            keeps far more detail than the others. PDFs skip compression
 *            entirely (see below).
 */
const PROFILES: Record<CompressProfile, { maxDim: number; quality: number }> = {
  photo: { maxDim: 1600, quality: 0.82 },
  avatar: { maxDim: 640, quality: 0.85 },
  document: { maxDim: 2400, quality: 0.92 },
};

/** Extensions we'll attempt even when the browser reports an empty MIME type. */
const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "heic", "heif", "bmp", "tif", "tiff", "avif"];

function extOf(name: string): string {
  const parts = (name || "").split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

/**
 * HEIC photos frequently arrive with an EMPTY f.type (a long-standing gotcha on
 * this codebase), so a strict MIME test silently skips good iPhone photos.
 * Fall back to the extension exactly like the upload validators do.
 */
function looksCompressible(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("video/")) return false;
  if (t === "application/pdf") return false;
  // An animated GIF loses its animation on a canvas round-trip, which turns a
  // sent clip into a still. Not worth the bytes.
  if (t === "image/gif") return false;
  if (extOf(file.name) === "pdf" || extOf(file.name) === "gif") return false;
  if (t.startsWith("image/")) return true;
  return IMAGE_EXTS.includes(extOf(file.name));
}

/** Decode via createImageBitmap, falling back to an <img>. Null = can't decode. */
async function decode(file: File): Promise<{ src: CanvasImageSource; w: number; h: number } | null> {
  // imageOrientation:"from-image" is what stops a portrait phone photo being
  // re-encoded sideways — the canvas ignores EXIF rotation otherwise.
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as any);
    if (bmp.width && bmp.height) return { src: bmp, w: bmp.width, h: bmp.height };
  } catch {
    /* older Safari rejects the options bag; fall through */
  }
  try {
    const bmp = await createImageBitmap(file);
    if (bmp.width && bmp.height) return { src: bmp, w: bmp.width, h: bmp.height };
  } catch {
    /* not decodable this way either */
  }
  return await new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.naturalWidth && img.naturalHeight) {
        resolve({ src: img, w: img.naturalWidth, h: img.naturalHeight });
      } else resolve(null);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/**
 * Shrink and re-encode an image for upload.
 * ALWAYS resolves — on any problem it resolves with the file you passed in.
 */
export async function compressImage(file: File, profile: CompressProfile = "photo"): Promise<File> {
  try {
    if (!file || typeof document === "undefined") return file;
    if (!looksCompressible(file)) return file;

    const { maxDim, quality } = PROFILES[profile] ?? PROFILES.photo;
    const decoded = await decode(file);
    if (!decoded) return file; // HEIC on desktop Chrome lands here — upload as-is

    const scale = Math.min(1, maxDim / Math.max(decoded.w, decoded.h));
    const w = Math.max(1, Math.round(decoded.w * scale));
    const h = Math.max(1, Math.round(decoded.h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(decoded.src, 0, 0, w, h);
    if ("close" in decoded.src && typeof (decoded.src as any).close === "function") {
      (decoded.src as any).close();
    }

    const blob: Blob | null = await new Promise(resolve =>
      canvas.toBlob(b => resolve(b), "image/webp", quality)
    );
    // A browser with no WebP encoder silently hands back a PNG, which is
    // usually LARGER than the original — the size guard below catches that too.
    if (!blob || !blob.size) return file;
    if (blob.size >= file.size) return file;

    const base = (file.name || "upload").replace(/\.[^.]+$/, "");
    return new File([blob], base + ".webp", { type: "image/webp", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

/** Same contract, for the call sites that upload several photos at once. */
export function compressImages(files: File[], profile: CompressProfile = "photo"): Promise<File[]> {
  return Promise.all(files.map(f => compressImage(f, profile)));
}
