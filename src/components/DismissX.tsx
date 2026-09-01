/**
 * The one "×" that removes a banner or an attention row.
 *
 * Styling matches the existing payment-return banner dismiss in
 * ClientDashboard, so every dismissible surface on the platform looks the same.
 *
 * `type="button"` on purpose — a bare `<button>` inside a real `<form>`
 * defaults to submit, which is how the password-field eye toggle once tried to
 * sign people in with a half-typed password.
 *
 * The hit area is padded well past the glyph: this sits beside text a user is
 * trying to READ, and an × that needs a precise tap on a phone is an × that
 * gets missed and then jabbed at.
 */
export default function DismissX({
  onClick, label = "Dismiss", title,
}: {
  onClick: () => void;
  /** Screen-reader label. Say what is being dismissed where it isn't obvious. */
  label?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      style={{
        background: "none", border: "none", color: "rgb(var(--ff-muted))",
        fontSize: "1.2rem", lineHeight: 1, cursor: "pointer",
        padding: ".2rem .45rem", margin: "-.2rem -.25rem -.2rem 0",
        flexShrink: 0, alignSelf: "flex-start", fontFamily: "inherit",
      }}
    >&times;</button>
  );
}
