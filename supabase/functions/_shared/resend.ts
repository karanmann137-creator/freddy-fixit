// Shared Resend sender for edge functions. Returns the raw Response so each
// caller keeps its own handling of a failed send (log it, retry it, or ignore
// it); a thrown fetch is the caller's to catch.
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

export const FROM_EMAIL = "noreply@freddyfixit.ca";

export function sendEmail(msg: { to: string; subject: string; html: string }): Promise<Response> {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: `Freddy Fix It <${FROM_EMAIL}>`,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
    }),
  });
}
