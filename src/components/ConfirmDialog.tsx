import { useEffect } from "react";

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
export default function ConfirmDialog({
  state, onClose,
}: { state: ConfirmState | null; onClose: (ok: boolean) => void }) {
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  if (!state) return null;
  const danger = state.danger !== false; // default to danger styling

  return (
    <div
      onClick={() => onClose(false)}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(8,11,20,.72)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1.25rem", fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: "420px",
          background: "var(--ff-bg)", border: "1px solid rgba(var(--ff-fg), .12)",
          borderRadius: "16px", padding: "1.6rem",
          boxShadow: "0 24px 70px rgba(0,0,0,.6)", color: "var(--ff-text)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: ".9rem" }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
            background: danger ? "rgba(239,68,68,.15)" : "rgba(234,107,20,.15)",
            border: `1px solid ${danger ? "rgba(239,68,68,.4)" : "rgba(234,107,20,.4)"}`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem",
          }}>⚠️</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem", letterSpacing: ".04em" }}>
            {state.title}
          </div>
        </div>

        <p style={{ fontSize: ".92rem", lineHeight: 1.6, color: "rgba(var(--ff-muted), .85)", margin: "0 0 .5rem" }}>
          {state.message}
        </p>
        <p style={{ fontSize: ".8rem", color: danger ? "var(--ff-danger)" : "var(--ff-warn)", margin: "0 0 1.4rem", fontWeight: 500 }}>
          This action can’t be undone.
        </p>

        <div style={{ display: "flex", gap: ".7rem", justifyContent: "flex-end" }}>
          <button
            onClick={() => onClose(false)}
            style={{
              padding: ".6rem 1.1rem", borderRadius: "9px", cursor: "pointer",
              background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .14)",
              color: "rgba(var(--ff-muted), .85)", fontFamily: "inherit", fontSize: ".88rem",
            }}
          >
            {state.cancelLabel || "Cancel"}
          </button>
          <button
            onClick={() => onClose(true)}
            style={{
              padding: ".6rem 1.2rem", borderRadius: "9px", cursor: "pointer", border: "none",
              background: danger ? "#ef4444" : "#ea6b14", color: "#fff",
              fontFamily: "inherit", fontSize: ".88rem", fontWeight: 600,
            }}
          >
            {state.confirmLabel || "Yes, continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
