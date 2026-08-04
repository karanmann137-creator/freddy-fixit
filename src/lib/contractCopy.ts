import { supabase } from "@/lib/supabase";

// Emailing the client their written contract copy is not cosmetic: `notify-email`
// stamps `jobs.contract_copy_sent_at`, and that timestamp is the audit record the
// Alberta 10-day cancellation clock runs from. Both call sites used to fire this
// with a bare `.catch(() => {})`, so a transient network blip meant the copy was
// never sent and nobody — client, contractor or owner — ever knew.
//
// The edge function's update is write-once (`.is("contract_copy_sent_at", null)`),
// so retrying is safe and can never double-send. Retry a couple of times with a
// short backoff; only if every attempt fails do we tell the caller, which lets the
// UI say something true instead of staying silent.
export async function sendContractCopy(jobId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 1500));
    try {
      const { error } = await supabase.functions.invoke("notify-email", {
        body: { event: "contract_copy", job_id: jobId },
      });
      if (!error) return true;
    } catch { /* try again */ }
  }
  return false;
}

// What to show if every attempt failed. Deliberately reassuring — the approval
// itself succeeded, so this must not read like the job didn't go through.
export const CONTRACT_COPY_FAILED =
  "Your approval went through. We couldn't email your written copy of the agreement just now — you can view it any time on this job, or email hello@freddyfixit.ca and we'll send it over.";
