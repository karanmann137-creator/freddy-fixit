import { useEffect, useRef } from "react";
import { ensureUiStyles } from "./ui/uiStyles";

export type ConfirmState = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
};

// Reusable "are you sure?" modal for irreversible actions.
// Drive it with a piece of state + a promise-based helper:
//   const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
//   const askConfirm = (o) => new Promise<boolean>(r => setConfirmState({ ...o, resolve: r }));
//   if (!(await askConfirm({ title, message }))) return;
//
// ⚠️ askConfirm only ever settles when this component closes, so a page that
// builds the helper and forgets to mount <ConfirmDialog/> hangs the button
// forever with no error anywhere. That contract is unchanged below.
//
// ── Why this is the reference implementation (2026-11-08) ──────────────────
// It is the ONE shared dialog on the platform, so it is where the bottom-sheet
// presentation lands first. On a phone it rises from the bottom edge and its
// buttons sit under the thumb; above 560px it is the centred card it always
// was. All of that comes from .ffu-scrim / .ffu-modal / .ffu-grab in
// ui/uiStyles.ts — there is no width logic in here, deliberately, because the
// other ~19 hand-rolled modals in src/components/ are meant to be converted by
// deleting their inline positioning and adding these two classes, and that is
// only a mechanical change while the classes carry 100% of the behaviour.
export default function ConfirmDialog({
  state, onClose,
}: { state: ConfirmState | null; onClose: (ok: boolean) => void }) {
  ensureUiStyles();
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  // Focus lands on CANCEL, not on the confirm button. Every caller of this
  // dialog is about to do something irreversible, so the key that is already
  // under the user's finger — Enter, having just pressed a button — must not
  // be the one that confirms it.
  useEffect(() => {
    if (state) cancelRef.current?.focus();
  }, [state]);

  if (!state) return null;
  const danger = state.danger !== false; // default to danger styling

  const tint = danger ? "var(--ff-danger)" : "var(--ff-accent-500)";

  return (
    <div
      className="ffu-scrim"
      onClick={() => onClose(false)}
    >
      <div
        className="ffu-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ff-confirm-title"
        aria-describedby="ff-confirm-msg"
        onClick={e => e.stopPropagation()}
      >
        {/* Presentational only — the dismiss is the scrim tap. aria-hidden so a
            screen reader doesn't announce a bar that does nothing. */}
        <span className="ffu-grab" aria-hidden="true" />

        <div style={{ display: "flex", alignItems: "center", gap: "var(--ff-s3)", marginBottom: "var(--ff-s4)" }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
            background: danger ? "rgba(248,113,113,.15)" : "var(--ff-accent-soft)",
            border: `var(--ff-hair-w) solid ${danger ? "rgba(248,113,113,.4)" : "var(--ff-accent-line)"}`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem",
          }}>⚠️</div>
          <div
            id="ff-confirm-title"
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem", letterSpacing: ".04em" }}
          >
            {state.title}
          </div>
        </div>

        <p id="ff-confirm-msg" style={{ fontSize: ".92rem", lineHeight: 1.6, color: "rgba(var(--ff-muted), .85)", margin: "0 0 .5rem" }}>
          {state.message}
        </p>
        <p style={{ fontSize: ".8rem", color: tint, margin: "0 0 var(--ff-s6)", fontWeight: 500 }}>
          This action can’t be undone.
        </p>

        {/* ffu-btnrow is a 2-up grid, so on a phone both buttons are full-width
            halves at the bottom of the sheet rather than two small right-aligned
            targets. Cancel is first in the DOM, which puts it on the left and
            makes it the first Tab stop. */}
        <div className="ffu-btnrow">
          <button
            ref={cancelRef}
            className="ffu-btn ffu-sec"
            onClick={() => onClose(false)}
          >
            {state.cancelLabel || "Cancel"}
          </button>
          <button
            className="ffu-btn ffu-pri"
            onClick={() => onClose(true)}
            style={danger ? { background: "var(--ff-danger)" } : undefined}
          >
            {state.confirmLabel || "Yes, continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
