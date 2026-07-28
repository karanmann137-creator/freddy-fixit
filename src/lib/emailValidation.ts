// Shared, dependency-free signup validators.
// Goal: catch input that is *structurally* fine but almost certainly a mistake
// — e.g. someone typing "@gmai.com" instead of "@gmail.com" — BEFORE we create
// an account we can never email. Used by every signup / lead entry point.

export type EmailCheck = { ok: boolean; error?: string; suggestion?: string };
export type PhoneCheck = { ok: boolean; error?: string };

// Common mistyped email domains -> the domain the person almost certainly meant.
const DOMAIN_TYPOS: Record<string, string> = {
  // gmail
  "gmai.com": "gmail.com", "gmial.com": "gmail.com", "gmal.com": "gmail.com",
  "gamil.com": "gmail.com", "gnail.com": "gmail.com", "gmaill.com": "gmail.com",
  "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com", "gmailcom": "gmail.com", "gmail.comm": "gmail.com",
  " gmail.com": "gmail.com", "googlemail.co": "googlemail.com",
  // hotmail
  "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmil.com": "hotmail.com",
  "hotmail.co": "hotmail.com", "hotmail.con": "hotmail.com", "hotmal.com": "hotmail.com",
  "hotnail.com": "hotmail.com",
  // outlook
  "outlok.com": "outlook.com", "outook.com": "outlook.com", "outlook.co": "outlook.com",
  "outlook.con": "outlook.com", "otulook.com": "outlook.com",
  // yahoo
  "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yahoo.co": "yahoo.com",
  "yahoo.con": "yahoo.com", "yhaoo.com": "yahoo.com", "yahho.com": "yahoo.com",
  // icloud
  "iclould.com": "icloud.com", "icloud.co": "icloud.com", "iclod.com": "icloud.com",
  "icloud.con": "icloud.com", "icoud.com": "icloud.com",
  // live / other
  "live.co": "live.com", "live.con": "live.com",
  "shaw.co": "shaw.ca", "telus.net.": "telus.net",
};

// Generic top-level-domain slips (apply when the exact domain isn't in the map above).
const TLD_TYPOS: Record<string, string> = {
  con: "com", conm: "com", comm: "com", cmo: "com", ocm: "com", vom: "com",
  xom: "com", cim: "com", con2: "com", co3: "com", "c0m": "com", om: "com",
};

export function validateEmail(raw: string): EmailCheck {
  const email = (raw || "").trim();
  if (!email) return { ok: false, error: "Email is required" };
  if (/\s/.test(email)) return { ok: false, error: "Email can't contain spaces" };
  if ((email.match(/@/g) || []).length !== 1)
    return { ok: false, error: "Enter a valid email (one @ sign)" };

  const [local, domain] = email.split("@");
  if (!local) return { ok: false, error: "Add the part before the @" };
  if (!domain) return { ok: false, error: "Add the part after the @" };
  if (email.includes("..") || local.startsWith(".") || local.endsWith("."))
    return { ok: false, error: "That doesn't look like a valid email" };

  const dom = domain.toLowerCase();
  if (!dom.includes(".")) return { ok: false, error: "The email domain is missing a '.'" };
  if (dom.startsWith(".") || dom.endsWith("."))
    return { ok: false, error: "That doesn't look like a valid email" };

  const labels = dom.split(".");
  const tld = labels[labels.length - 1];
  if (tld.length < 2 || !/^[a-z]+$/.test(tld))
    return { ok: false, error: "That doesn't look like a valid email" };

  // Base structural check (mirrors the regex used across the app).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { ok: false, error: "That doesn't look like a valid email" };

  // Exact known-bad domain -> suggest the fix.
  if (DOMAIN_TYPOS[dom]) {
    return { ok: false, error: `Did you mean ${local}@${DOMAIN_TYPOS[dom]}?`, suggestion: `${local}@${DOMAIN_TYPOS[dom]}` };
  }
  // Generic TLD slip (e.g. anything@company.con).
  if (TLD_TYPOS[tld]) {
    const fixed = [...labels.slice(0, -1), TLD_TYPOS[tld]].join(".");
    return { ok: false, error: `Did you mean ${local}@${fixed}?`, suggestion: `${local}@${fixed}` };
  }

  return { ok: true };
}

// North-American (NANP) 10-digit phone. `required=false` => empty passes (phone
// is optional in most flows), but any non-empty value must be a real 10-digit number.
export function validatePhone(raw: string, required = false): PhoneCheck {
  const trimmed = (raw || "").trim();
  if (!trimmed) return required ? { ok: false, error: "Phone number is required" } : { ok: true };

  let digits = trimmed.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);

  if (digits.length !== 10) return { ok: false, error: "Enter a 10-digit phone number" };
  if (/^(\d)\1{9}$/.test(digits)) return { ok: false, error: "That doesn't look like a real phone number" };
  // NANP: area + exchange codes start 2-9.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits))
    return { ok: false, error: "That doesn't look like a valid phone number" };

  return { ok: true };
}
