// review-contractor v11 (2026-07-17): ADVISORY-ONLY + locked down.
// - Never changes contractors.status — the AI verdict is saved for the admin,
//   who approves/deactivates manually (profile-page Admin Review panel).
// - verify_jwt=true + in-code gate: only the contractor themselves (after a doc
//   upload) or an admin can trigger a review. Previously anyone with a
//   contractor_id could invoke it AND a pass auto-activated the account.
// - On pass: contractor gets a "docs passed initial checks, final review
//   underway" email (NOT "you're approved"). On fail: action-needed email.
// - Admin (hello@) gets a verdict email either way with a profile-page link.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY           = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY     = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL         = "noreply@freddyfixit.ca";
const ADMIN_EMAIL        = "hello@freddyfixit.ca";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sendEmail(to: string, subject: string, html: string) {
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: `Freddy Fix It <${FROM_EMAIL}>`, to, subject, html }),
    });
  } catch (e) { console.error("email failed", e); }
}

async function docToBlock(bucket: string, path: string): Promise<any | null> {
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) return null;
  const buf = await data.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  const ext = path.split(".").pop()?.toLowerCase();
  const mediaType = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg";
  return mediaType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: mediaType, data: b64 } }
    : { type: "image",    source: { type: "base64", media_type: mediaType, data: b64 } };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Who's calling? Only the contractor themselves or an admin may trigger a review.
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await anon.auth.getUser();
    if (!user) return json({ error: "Not authenticated" }, 401);

    const { contractor_id } = await req.json();
    if (!contractor_id) return json({ error: "contractor_id required" }, 400);
    if (user.id !== contractor_id) {
      const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (me?.role !== "admin") return json({ error: "Not authorized" }, 403);
    }

    const { data: contractor, error: conErr } = await admin.from("contractors").select("doc_urls").eq("id", contractor_id).single();
    if (conErr || !contractor) return json({ error: "Contractor not found" }, 404);
    const { data: profile } = await admin.from("profiles").select("first_name, last_name, email").eq("id", contractor_id).maybeSingle();

    const docUrls: Record<string, string> = contractor.doc_urls || {};
    const DOC_KEYS = ["insurance", "wcb", "certification", "gov_id"];
    const DOC_LABELS: Record<string, string> = { insurance: "Liability Insurance Certificate", wcb: "WCB Certificate", certification: "Trade Certification", gov_id: "Government-Issued Photo ID" };
    const contentBlocks: any[] = [];
    const uploaded: string[] = [];
    const hasPdf: boolean[] = [];
    for (const key of DOC_KEYS) {
      const path = docUrls[key];
      if (!path) continue;
      const block = await docToBlock("contractor-docs", path);
      if (!block) continue;
      uploaded.push(key);
      if (block.source?.media_type === "application/pdf") hasPdf.push(true);
      contentBlocks.push({ type: "text", text: `--- ${DOC_LABELS[key]} ---` });
      contentBlocks.push(block);
    }
    if (uploaded.length === 0) {
      await admin.from("contractors").update({ review_result: { summary: "No documents uploaded." }, review_status: "pending" }).eq("id", contractor_id);
      return json({ status: "no_docs" });
    }

    contentBlocks.push({ type: "text", text: `Review these contractor documents for Freddy Fix It (Calgary home repair platform). Uploaded: ${uploaded.map(k => DOC_LABELS[k]).join(", ")}. Check: insurance=valid CoI, not expired, covers Alberta, min $1M; wcb=valid clearance, issued within 90 days; certification=valid trade cert or Red Seal; gov_id=government photo ID with visible name. Be lenient - pass if clearly legitimate. Return ONLY JSON:\n{"results":{"insurance":{"uploaded":bool,"pass":bool,"reason":"..."},"wcb":{"uploaded":bool,"pass":bool,"reason":"..."},"certification":{"uploaded":bool,"pass":bool,"reason":"..."},"gov_id":{"uploaded":bool,"pass":bool,"reason":"..."}},"overall":"approved" or "rejected","summary":"one sentence for contractor"}` });

    const hdrs: Record<string, string> = { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" };
    if (hasPdf.length > 0) hdrs["anthropic-beta"] = "pdfs-2024-09-25";
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: hdrs, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1024, messages: [{ role: "user", content: contentBlocks }] }) });
    const aiData = await aiRes.json();
    const rawText: string = aiData.content?.[0]?.text || "{}";
    let reviewResult: any = { overall: "pending", summary: "Automatic review could not complete." };
    try { const m = rawText.match(/\{[\s\S]*\}/); if (m) reviewResult = JSON.parse(m[0]); } catch {}
    const overall = reviewResult.overall === "approved" ? "approved" : "rejected";

    // ADVISORY ONLY: save the verdict for the admin — never touch contractors.status.
    await admin.from("contractors").update({ review_result: reviewResult, review_status: overall }).eq("id", contractor_id);

    const name = profile?.first_name || "there";
    const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "A contractor";
    const email = profile?.email;
    if (email) {
      if (overall === "approved") {
        await sendEmail(email, "Documents received — final review underway",
          `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:2rem;border-radius:12px;"><h2 style="color:#ea6b14;">Thanks, ${name} — your documents look good!</h2><p>Your documents passed our automated checks. Our team is completing your final review now — you'll get an email as soon as your account is active and you can start taking jobs.</p></div>`);
      } else {
        await sendEmail(email, "Document review — action needed",
          `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:2rem;border-radius:12px;"><h2 style="color:#ea6b14;">Document Review — Action Required</h2><p>Hi ${name}, we need a couple things before activating your account.</p><p style="background:rgba(255,255,255,.06);padding:1rem;border-radius:8px;border-left:3px solid #ea6b14;">${reviewResult.summary}</p><p>Log in to re-upload your documents or contact <a href="mailto:hello@freddyfixit.ca" style="color:#ea6b14;">hello@freddyfixit.ca</a>.</p><a href="https://freddyfixit.ca/login" style="display:inline-block;margin-top:1.5rem;padding:.75rem 1.5rem;background:#ea6b14;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Log In →</a></div>`);
      }
    }

    // Tell the admin the AI verdict is in, with a one-click link to review + approve.
    await sendEmail(ADMIN_EMAIL, `AI doc review: ${fullName} — ${overall}`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1a2236;color:#f0f4ff;padding:2rem;border-radius:12px;"><h2 style="color:#ea6b14;">AI doc review: ${overall}</h2><p><strong>${fullName}</strong> — ${reviewResult.summary ?? ""}</p><p>The AI verdict is advisory — nothing was activated. Review the documents and approve on their profile page.</p><a href="https://freddyfixit.ca/contractors/${contractor_id}" style="display:inline-block;margin-top:1rem;padding:.75rem 1.5rem;background:#ea6b14;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Open Admin Review →</a></div>`);

    return json({ status: overall, result: reviewResult });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
