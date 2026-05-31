// Pure EQ domain — coins redesign Slice B2.
//
// The subscription paywall is retired (coins model). This route is kept only as
// a thin forwarder so any lingering redirect target (Insights' requirePaidAccess
// until B3, stale Tools branches) lands on the coins purchase page instead of a
// dead route. MUST stay outside the (app) route group — see git history; an
// (app) placement risked a redirect loop with the old layout backstop.
import { redirect } from "next/navigation";

export default function PaywallPage() {
  redirect("/coins");
}
