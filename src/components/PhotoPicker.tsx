import { Ic } from "@/components/Ic";

/**
 * The one photo tap-target on the client side.
 *
 * There are two client-facing ways to post a job — `ClientOnboarding` for a new
 * client and `NewRequest` for a returning one — and they ask for the photo in
 * the same words on the same kind of screen. They had two copies of this
 * control, and the copies had ALREADY drifted: one rejected an oversized file
 * with "That photo is over 10MB — please pick a smaller one." and the other
 * with "That photo is over 10 MB. Please choose a smaller one.". That is the
 * `upsertMeta` shape exactly — a renderer pasted twice, drifting with no error
 * anywhere to show for it — so a third copy was not worth writing.
 *
 * ⚠️ The three file-picker rules from CLAUDE.md are ALL encoded here, and each
 * one is a real bug that has been hit before:
 *
 *   - `if (!f) return;` and never `?? null`. A cancelled picker returns no
 *     file, and writing null on cancel wipes a photo the client had already
 *     attached — pressing the control to look at it and pressing Escape would
 *     silently throw it away.
 *   - `e.target.value = ""` on reject, or re-choosing the SAME file never
 *     re-fires `onChange` and the second attempt looks like a dead control.
 *   - `accept="image/*"` with NO `capture`. That offers the camera AND the
 *     gallery. Forcing the camera means anyone who isn't standing in front of
 *     the problem right now has nothing they can attach — and it also means an
 *     iPhone HEIC arriving with an empty `f.type`, which is why nothing here
 *     tests the MIME string.
 *
 * The size cap is the only rejection, and it is deliberately generous: every
 * upload is compressed in the browser afterwards (`imageCompress.ts`), so a
 * photo straight off a phone is fine and the cap only exists to stop a video
 * or a RAW file being read into memory.
 *
 * The caller keeps ownership of the file itself, the pulse wrapper, the label
 * and the nudge advisory — those differ between the two forms (different
 * anchor ids, different surrounding copy). This owns the control and the
 * refusal, which are the parts that must not disagree.
 */

export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** The single wording for a too-big photo. Both forms show this string. */
export const PHOTO_TOO_BIG = "That photo is over 10 MB. Please choose a smaller one.";

export default function PhotoPicker({
  id,
  file,
  onPick,
  onError,
  hint,
}: {
  /** Unique DOM id for the hidden input — the two forms mount on different screens. */
  id: string;
  file: File | null;
  onPick: (f: File) => void;
  onError: (msg: string) => void;
  /** Second line when nothing is attached yet. */
  hint?: string;
}) {
  const picked = !!file;
  return (
    <label
      htmlFor={id}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: ".8rem",
        padding: "1.9rem 1.25rem",
        borderRadius: "14px",
        cursor: "pointer",
        border: "2px dashed " + (picked ? "rgba(234,107,20,.55)" : "rgba(var(--ff-fg), .16)"),
        background: picked ? "rgba(234,107,20,.06)" : "rgba(var(--ff-fg), .02)",
        transition: "border-color .2s, background .2s",
      }}
    >
      {/* The camera, big and orange. This control used to be a bare
          <input type="file">, which on every platform renders as a small grey
          "Choose File" button next to the words "No file chosen" — it reads as
          a form field somebody forgot to fill in rather than as an invitation,
          and it is the single most-skipped step on the form. */}
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "76px",
          height: "76px",
          borderRadius: "999px",
          flexShrink: 0,
          background: "rgba(234,107,20,.12)",
          border: "1px solid rgba(234,107,20,.35)",
        }}
      >
        <Ic name="camera" size={36} color="#ea6b14" />
      </span>
      <span style={{ display: "block", maxWidth: "100%" }}>
        <span
          style={{
            display: "block",
            fontSize: ".95rem",
            fontWeight: 500,
            lineHeight: 1.4,
            wordBreak: "break-word",
            color: picked ? "#ea6b14" : "var(--ff-text)",
          }}
        >
          {picked ? file!.name : "Tap to add a photo"}
        </span>
        <span style={{ display: "block", marginTop: ".3rem", fontSize: ".78rem", lineHeight: 1.5, color: "rgba(var(--ff-muted), .55)" }}>
          {picked ? "Tap to choose a different one" : (hint || "Take one now, or pick one you've already got")}
        </span>
      </span>
      <input
        id={id}
        type="file"
        accept="image/*"
        onChange={e => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > PHOTO_MAX_BYTES) { onError(PHOTO_TOO_BIG); e.target.value = ""; return; }
          onPick(f);
        }}
        style={{ display: "none" }}
      />
    </label>
  );
}
