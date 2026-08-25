import React, { useEffect, useRef, useState } from "react";
import { Ic } from "@/components/Ic";
import { scorePassword, checkPwned, formatBreachCount } from "@/lib/passwordStrength";

/**
 * The one password input on the platform.
 *
 * Every `<input type="password">` goes through this so the reveal toggle, the
 * strength meter and the breach check can't drift apart between the four pages
 * that ask for a password.
 *
 * TWO MODES. `meter` off (Login) gives just the eye — scoring a password the
 * person already has is noise, and there is nothing they can do about it on
 * that screen. `meter` on (both signups, password reset) adds the strength bar
 * and the Have I Been Pwned check, because those are the three moments where a
 * password is actually being chosen.
 *
 * THE EYE BUTTON IS `type="button"`. Login wraps its fields in a real <form
 * onSubmit>, and a bare <button> inside a form defaults to type="submit" — so
 * without this, clicking the eye would attempt a sign-in with a half-typed
 * password.
 */

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Applied to the <input>; the wrapper takes the width. */
  style?: React.CSSProperties;
  wrapStyle?: React.CSSProperties;
  autoComplete?: string;
  id?: string;
  disabled?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  /** Show the strength bar and run the breach check. */
  meter?: boolean;
  /**
   * Fires true only when the password was DEFINITIVELY found in a known breach.
   * An unreachable or blocked HIBP always reports false — see checkPwned.
   */
  onBreachChange?: (breached: boolean) => void;
};

const BAR_COLORS = ["#ef4444", "#ef4444", "#f59e0b", "#22c55e", "#22c55e"];

export default function PasswordField({
  value,
  onChange,
  placeholder,
  style,
  wrapStyle,
  autoComplete,
  id,
  disabled,
  onKeyDown,
  meter = false,
  onBreachChange,
}: Props) {
  const [show, setShow] = useState(false);
  const [breach, setBreach] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  // Keep the callback in a ref so the debounce effect doesn't re-fire every
  // time a parent re-renders and hands us a fresh inline arrow function.
  const cbRef = useRef(onBreachChange);
  cbRef.current = onBreachChange;

  useEffect(() => {
    if (!meter) return;

    // A new keystroke invalidates whatever the last answer was. Clear the flag
    // FIRST so a parent can never block a submit on a stale result.
    setBreach(null);
    if (cbRef.current) cbRef.current(false);

    if (!value || value.length < 8) {
      setChecking(false);
      return;
    }

    const ctrl = new AbortController();
    let alive = true;
    setChecking(true);

    const t = setTimeout(() => {
      checkPwned(value, ctrl.signal).then(n => {
        if (!alive) return;
        setChecking(false);
        setBreach(n);
        if (cbRef.current) cbRef.current(typeof n === "number" && n > 0);
      });
    }, 500);

    return () => {
      alive = false;
      clearTimeout(t);
      ctrl.abort();
      // Note: we do NOT reset the parent flag here. The next run of this effect
      // clears it on its first line, and clearing on unmount would wipe a real
      // positive during an unrelated re-render.
    };
  }, [value, meter]);

  const st = meter ? scorePassword(value) : null;
  const breached = typeof breach === "number" && breach > 0;

  return (
    <div style={{ width: "100%", ...wrapStyle }}>
      <div style={{ position: "relative", width: "100%" }}>
        <input
          id={id}
          type={show ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete={autoComplete}
          disabled={disabled}
          // Revealing flips the field to type="text", at which point a phone
          // will happily autocapitalise and spellcheck the password. These four
          // are inert while it is masked and load-bearing the moment it isn't.
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          style={{ ...style, paddingRight: "3.1rem" }}
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          title={show ? "Hide password" : "Show password"}
          style={{
            position: "absolute",
            right: ".35rem",
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            // 40px square — a thumb target, not a 17px glyph.
            width: "2.5rem",
            height: "2.5rem",
            padding: 0,
            background: "transparent",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            color: "rgba(var(--ff-muted), .65)",
            lineHeight: 0,
          }}
        >
          <Ic name={show ? "eye-off" : "eye"} size={17} />
        </button>
      </div>

      {meter && value.length > 0 && st && (
        <div style={{ marginTop: ".45rem" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: ".25rem",
            }}
            aria-hidden="true"
          >
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                style={{
                  height: "4px",
                  borderRadius: "2px",
                  background:
                    st.score > i ? BAR_COLORS[st.score] : "rgba(var(--ff-fg), .12)",
                  transition: "background .18s ease",
                }}
              />
            ))}
          </div>
          <p
            style={{
              fontSize: ".72rem",
              margin: ".3rem 0 0",
              lineHeight: 1.4,
              color: "rgba(var(--ff-muted), .7)",
            }}
          >
            <span style={{ color: BAR_COLORS[st.score], fontWeight: 500 }}>{st.label}</span>
            {st.hint ? " — " + st.hint : ""}
            {checking ? " Checking against known breaches…" : ""}
          </p>
        </div>
      )}

      {meter && breached && (
        <p
          style={{
            fontSize: ".76rem",
            margin: ".5rem 0 0",
            lineHeight: 1.45,
            padding: ".6rem .7rem",
            borderRadius: "8px",
            background: "rgba(239,68,68,.1)",
            border: "1px solid rgba(239,68,68,.3)",
            color: "var(--ff-danger)",
          }}
        >
          <strong>Please choose a different password.</strong> This one has appeared in
          public data breaches {formatBreachCount(breach as number)}, so attackers already
          have it on a list. It was checked without ever leaving your device.
        </p>
      )}
    </div>
  );
}
