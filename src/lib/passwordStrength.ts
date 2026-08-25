/**
 * Password strength scoring, plus a free leaked-password check.
 *
 * WHY THIS EXISTS
 * Supabase's own "prevent use of leaked passwords" setting is Pro-plan only, so
 * it is not available to this project. This file is the substitute, and it runs
 * entirely in the browser.
 *
 * THE PASSWORD NEVER LEAVES THE BROWSER. checkPwned() uses Have I Been Pwned's
 * k-anonymity range API: it SHA-1 hashes the password locally, sends only the
 * FIRST FIVE hex characters of that hash, and matches the remaining 35 against
 * the list HIBP returns. HIBP learns a 5-character prefix shared by roughly
 * 800 other hashes and nothing else. Never replace this with an API that takes
 * the password, or the plaintext.
 *
 * SCORING WEIGHTS LENGTH FAR ABOVE CHARACTER VARIETY, on purpose, per NIST
 * SP 800-63B. A meter that rates "P@ssw0rd!" above "correct horse battery
 * staple" teaches people exactly the wrong lesson: the first is in every crack
 * dictionary published since 2009 and the second is not. Symbol variety earns
 * at most one point here, and only once the password is already reasonably
 * long.
 */

export type PasswordScore = {
  /** 0 worst … 4 best. */
  score: 0 | 1 | 2 | 3 | 4;
  /** Short label for the meter, "" when there is nothing to say yet. */
  label: string;
  /** One sentence telling the person what would actually help. */
  hint: string;
};

/**
 * A deliberately SHORT list. HIBP covers the long tail far better than any
 * list we could ship; this only exists so the meter reacts instantly, before
 * the network check has had a chance to answer.
 */
const COMMON = [
  "password", "passw0rd", "password1", "password123", "12345678", "123456789",
  "1234567890", "qwerty", "qwerty123", "qwertyui", "abc12345", "letmein",
  "letmein1", "iloveyou", "admin123", "welcome1", "welcome123", "monkey123",
  "football", "baseball", "sunshine", "princess", "dragon123", "1qaz2wsx",
  "trustno1", "superman", "starwars", "freddyfixit", "calgary1", "calgary123",
];

const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"];

/**
 * True when the password leans on a run of 4+ sequential characters, either by
 * character code ("abcd", "4321") or along a keyboard row ("qwer", "asdf").
 * These read as varied to a naive scorer and are trivial to a cracker.
 */
function hasRun(pw: string, min = 4): boolean {
  const low = pw.toLowerCase();

  let run = 1;
  for (let i = 1; i < low.length; i++) {
    const d = low.charCodeAt(i) - low.charCodeAt(i - 1);
    if (d === 1 || d === -1) {
      run++;
      if (run >= min) return true;
    } else {
      run = 1;
    }
  }

  for (const row of KEYBOARD_ROWS) {
    for (let i = 0; i + min <= row.length; i++) {
      const seg = row.slice(i, i + min);
      const rev = seg.split("").reverse().join("");
      if (low.indexOf(seg) >= 0 || low.indexOf(rev) >= 0) return true;
    }
  }

  return false;
}

const LABELS = ["Very weak", "Weak", "Fair", "Good", "Strong"];

export function scorePassword(pw: string): PasswordScore {
  if (!pw) return { score: 0, label: "", hint: "" };

  const len = pw.length;
  if (len < 8) {
    return { score: 0, label: "Too short", hint: "Use at least 8 characters." };
  }

  const low = pw.toLowerCase();
  for (const c of COMMON) {
    // Exact match, or the common word with a couple of characters tacked on —
    // "password12" is not meaningfully better than "password".
    if (low === c || (low.indexOf(c) === 0 && low.length <= c.length + 2)) {
      return {
        score: 0,
        label: "Very weak",
        hint: "This is one of the most commonly used passwords. Pick something else.",
      };
    }
  }

  const uniqueChars = new Set(pw.split("")).size;
  if (uniqueChars <= 2) {
    return {
      score: 0,
      label: "Very weak",
      hint: "Too few different characters — try a phrase instead.",
    };
  }

  // Length is the whole game.
  let score = 1;
  if (len >= 12) score = 2;
  if (len >= 16) score = 3;
  if (len >= 20) score = 4;

  // Variety is worth exactly one point, and only on a password that already
  // has some length behind it.
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/[0-9]/.test(pw)) classes++;
  if (/[^a-zA-Z0-9]/.test(pw)) classes++;
  if (classes >= 3 && len >= 10) score++;

  if (hasRun(pw)) score--;
  if (/^[0-9]+$/.test(pw)) score--;

  const clamped = Math.max(0, Math.min(4, score)) as 0 | 1 | 2 | 3 | 4;

  let hint = "";
  if (clamped <= 1) {
    hint = "A longer password is the single biggest improvement — try four random words.";
  } else if (clamped === 2) {
    hint = "Decent. A few more characters would make it much harder to guess.";
  } else if (clamped === 3) {
    hint = "Good password.";
  } else {
    hint = "Strong password.";
  }

  return { score: clamped, label: LABELS[clamped], hint };
}

async function sha1Hex(pw: string): Promise<string | null> {
  const subtle =
    typeof crypto !== "undefined" && crypto && (crypto as Crypto).subtle
      ? (crypto as Crypto).subtle
      : null;
  // No SubtleCrypto means an insecure context (plain http). Say nothing rather
  // than pretending the password is clean.
  if (!subtle) return null;

  const digest = await subtle.digest("SHA-1", new TextEncoder().encode(pw));
  const view = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < view.length; i++) {
    const h = view[i].toString(16);
    hex += h.length === 1 ? "0" + h : h;
  }
  return hex.toUpperCase();
}

/**
 * How many known breaches this password appears in.
 *
 * Returns 0 when it is not in HIBP's corpus, a positive count when it is, and
 * **null when we could not find out** — offline, blocked, insecure context,
 * rate limited. Callers MUST treat null as "unknown", never as "safe" and
 * never as "unsafe": failing closed here would lock people out of signup over
 * a flaky network, which is a far more common event than a breached password.
 */
export async function checkPwned(pw: string, signal?: AbortSignal): Promise<number | null> {
  try {
    if (!pw || pw.length < 8) return null;

    const hex = await sha1Hex(pw);
    if (!hex) return null;

    const prefix = hex.slice(0, 5);
    const suffix = hex.slice(5);
    const url = "https://api.pwnedpasswords.com/range/" + prefix;

    // Add-Padding makes every response the same rough size, so a passive
    // observer can't infer anything from the response length. It's a custom
    // header, which triggers a CORS preflight — if that is ever blocked we
    // retry once without it rather than losing the check entirely.
    let res: Response | null = null;
    try {
      res = await fetch(url, { signal, headers: { "Add-Padding": "true" } });
    } catch {
      res = null;
    }
    if (!res || !res.ok) {
      res = await fetch(url, { signal });
    }
    if (!res.ok) return null;

    const text = await res.text();
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      if (line.slice(0, colon).trim().toUpperCase() !== suffix) continue;
      const n = parseInt(line.slice(colon + 1).trim(), 10);
      // Padded decoy rows come back with a count of 0, which is exactly the
      // answer we want for them anyway.
      return isFinite(n) ? n : null;
    }
    return 0;
  } catch {
    return null;
  }
}

/** "1,247 times" — used in the warning copy. */
export function formatBreachCount(n: number): string {
  return n.toLocaleString("en-CA") + (n === 1 ? " time" : " times");
}
