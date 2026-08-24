// OnboardingProgress — numbered step indicator for the client and contractor
// onboarding flows. Replaces the old "Step X of Y" text line, the plain
// unlabelled segment bar, and the Freddy speech-bubble reframe (GuideBubble)
// that used to sit above the form. The step number is now carried visually
// by the bar itself, so nothing textual needs to repeat it.
export default function OnboardingProgress({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: "1.75rem" }}
      role="img" aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const filled = n <= step;
        const active = n === step;
        return (
          <div key={n} style={{ display: "flex", alignItems: "center", flex: n < total ? 1 : "0 0 auto" }}>
            <div style={{
              width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'Bebas Neue', sans-serif", fontSize: "0.92rem", letterSpacing: ".02em",
              background: filled ? "#ea6b14" : "rgba(var(--ff-fg), .08)",
              color: filled ? "#fff" : "rgba(var(--ff-muted), .55)",
              boxShadow: active ? "0 0 0 3px rgba(234,107,20,.18)" : "none",
              transition: "background .2s ease, box-shadow .2s ease",
            }}>
              {n}
            </div>
            {n < total && (
              <div style={{
                flex: 1, height: "3px", margin: "0 6px", borderRadius: "99px",
                background: n < step ? "rgba(234,107,20,.45)" : "rgba(var(--ff-fg), .1)",
                transition: "background .2s ease",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
