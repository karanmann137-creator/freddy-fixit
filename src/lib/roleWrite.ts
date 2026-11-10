import { supabase } from "@/lib/supabase";
import { clearMyProfile } from "@/lib/myProfile";

// THE ONE WAY A ROLE IS WRITTEN FROM THE BROWSER.
//
// There were three copies of this write — AuthCallback's contractor branch,
// AuthCallback's "I'm a homeowner / I'm a contractor" chooser, and
// ContractorOnboarding's save — and all three were the same two lines:
//
//     await supabase.from("profiles").update({ role }).eq("id", user.id);
//     setLocation("/contractor-onboarding");
//
// which is wrong in three separate ways that only this shared version can fix
// once instead of three times.
//
// (1) `.update()` RESOLVES with { data, error } — it does not throw. A discarded
//     `error` is not an absence of one, so every refusal looked like a success
//     and the person was redirected onward as though their role had changed.
//
// (2) A ZERO-ROW UPDATE IS REPORTED AS SUCCESS. `eq("id", userId)` against a
//     profile row that hasn't been created yet matches nothing, and PostgREST
//     calls that a 204. `.select("role")` is what makes the difference visible:
//     an empty array back means nothing was written. Same class as the
//     poll-timeout bug in AuthCallback, met from the other side.
//
// (3) `role_change_block()` can refuse the write, and the refusal is a SENTENCE
//     FOR THE PERSON, not a status. We ask the predicate BEFORE attempting the
//     write — the same predicate the prevent_role_escalation trigger asks — so
//     the reason shown and the reason enforced cannot drift. Asking first is
//     also what keeps us off the thing CLAUDE.md forbids: branching on a server
//     error's wording where the state itself can answer.
//
// The trigger remains the gate. This is the explanation, not the enforcement.

const RETRY =
  "Nothing has been lost — refresh the page to try again.";

export type RoleWriteResult =
  | { ok: true }
  // `permanent` is the difference between "try again" and "this will never
  // work": a refusal from role_change_block is a settled fact about the account,
  // so offering a refresh there would send someone round the same loop forever,
  // which is the whole complaint this work came from.
  | { ok: false; reason: string; permanent: boolean };

export async function setMyRole(
  userId: string,
  role: "client" | "contractor",
): Promise<RoleWriteResult> {
  if (!userId) {
    return { ok: false, reason: `We couldn't tell which account to update. ${RETRY}`, permanent: false };
  }

  // May this account become `role`? NULL means yes.
  const { data: block, error: blockErr } = await supabase.rpc("role_change_block", {
    p_user_id: userId,
    p_new_role: role,
  });
  // A failed read is not an empty result: an unreadable predicate is "we don't
  // know", never "allowed".
  if (blockErr) {
    return { ok: false, reason: `We couldn't check your account just now. ${RETRY}`, permanent: false };
  }
  if (block) {
    return { ok: false, reason: String(block), permanent: true };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId)
    .select("role");

  if (error) {
    return { ok: false, reason: `We couldn't save your account type. ${RETRY}`, permanent: false };
  }
  if (!data || data.length === 0) {
    // The row wasn't there to update. ensure_profile() is the repair primitive
    // for this; every caller runs it first, so reaching here means something
    // genuinely unexpected rather than a race we can paper over.
    return { ok: false, reason: `Your account isn't quite ready yet. ${RETRY}`, permanent: false };
  }

  clearMyProfile(); // the role just changed — the shared cache must not answer with the old one
  return { ok: true };
}
