import React from "react";
import { Button } from "./Button";

/**
 * THE SCREEN A STUCK PERSON SEES, AND THE ONE PLACE IT IS WRITTEN.
 *
 * Every outage on this platform that reached a real person reached them as a
 * blank page or a redirect loop, never as an error — because the code that hit
 * the dead end had nowhere to say so. `readAuthUser()` gave us a third outcome
 * ("couldn't tell") and `role_change_block()` gives us a refusal sentence, and
 * both of those need somewhere to land. This is it.
 *
 * ⚠️ THE ACTION IS NOT OPTIONAL, AND THAT IS WHY THIS IS A COMPONENT RATHER
 * THAN A STYLE OBJECT. The failure mode being fixed is a page that tells
 * somebody something is wrong and leaves them there. `onRetry` defaults to a
 * full reload, so the cheapest possible call still renders a way forward:
 *
 *     <DeadEnd msg="We couldn't check whether you're signed in." />
 *
 * A caller that genuinely has no retry — a REFUSAL, where trying again will
 * fail identically forever — passes `retry={false}` and must pass `alt`, so
 * the screen still offers a door. There is deliberately no way to render this
 * with neither.
 *
 * `retry={false}` exists because "refresh to try again" is a LIE on a settled
 * refusal, and a lie sends the person round the loop by hand instead of the
 * code doing it for them. Distinguishing the two is the whole of
 * RoleWriteResult.permanent.
 */
export default function DeadEnd({
  msg,
  retry = true,
  retryLabel = "Refresh",
  onRetry,
  alt,
}: {
  msg: string;
  retry?: boolean;
  retryLabel?: string;
  onRetry?: () => void;
  /** A second way out: their real dashboard, a sign-in link, an email address. */
  alt?: React.ReactNode;
}) {
  return (
    <div className="ffu-dead">
      <p className="ffu-dead-msg">{msg}</p>
      {retry && (
        <Button variant="primary" onClick={onRetry ?? (() => window.location.reload())}>
          {retryLabel}
        </Button>
      )}
      {alt && <p className="ffu-dead-alt">{alt}</p>}
    </div>
  );
}
