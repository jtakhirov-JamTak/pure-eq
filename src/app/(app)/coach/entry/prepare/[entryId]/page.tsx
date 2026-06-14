import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { StormBackground } from "@/components/brand/StormBackground";
import { Kicker } from "@/components/ui/kicker";
import { Card } from "@/components/ui/card";
import {
  PrepareResultCards,
  type PrepareAiOutput,
} from "@/components/coach/prepare-result-cards";
import { RegenerateButton } from "@/components/coach/regenerate-button";
import type { AiTier } from "@/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Past-entry card view for a saved Prepare entry. The full cards otherwise only
// appear in-session right after generation; this is where you revisit them
// (from the Conversations timeline) and pay to regenerate.
export default async function PrepareEntryPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  if (!UUID_RE.test(entryId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: entry, error } = await supabase
    .from("prepare_entries")
    .select(
      "prepare_entry_id, ai_plan_json, ai_tier, situation_text, person_id, thread_id, created_at",
    )
    .eq("prepare_entry_id", entryId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    // Fail loudly — a transient DB error must not masquerade as a 404.
    throw new Error("prepare_entry_read_failed");
  }
  if (!entry) notFound();

  const personRes = entry.person_id
    ? await supabase
        .from("persons")
        .select("display_name")
        .eq("user_id", user.id)
        .eq("person_id", entry.person_id)
        .maybeSingle()
    : { data: null };
  const personName = personRes.data?.display_name ?? "Someone";

  const tier: AiTier = entry.ai_tier === "deep" ? "deep" : "quick";
  const ai = entry.ai_plan_json as PrepareAiOutput | null;
  const isNormal = ai?.mode === "normal";
  const isRefusal = ai?.mode === "refusal";

  const backHref = entry.thread_id
    ? `/conversations/${entry.thread_id}`
    : "/conversations";

  return (
    <div className="relative min-h-full px-5 pb-28 pt-8">
      <StormBackground />

      <Link
        href={backHref}
        className="rounded-pill border border-hairline bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-ink-soft active:opacity-80"
      >
        Back
      </Link>

      <div className="mt-4">
        <Kicker className="text-accent-ink">
          Prepare · {tier === "deep" ? "Deep" : "Quick"}
        </Kicker>
        <h1
          className="mt-2 text-[24px] font-medium leading-[1.15] text-ink"
          style={{ letterSpacing: "-0.5px" }}
        >
          Your feedback for {personName}.
        </h1>
      </div>

      {entry.situation_text && (
        <Card className="mt-5">
          <Kicker>What you wrote</Kicker>
          <p className="mt-1.5 text-[14px] font-medium leading-[1.5] text-ink-soft">
            {entry.situation_text}
          </p>
        </Card>
      )}

      <div className="mt-3">
        {isNormal ? (
          <PrepareResultCards output={ai} entryId={entryId} />
        ) : isRefusal ? (
          <Card>
            <p className="text-[14px] font-medium leading-[1.55] text-ink">
              {ai.message_to_user}
            </p>
          </Card>
        ) : (
          <Card>
            <p className="text-[14px] font-medium leading-[1.5] text-ink-soft">
              No coaching feedback is saved for this entry yet — regenerate below
              to create it.
            </p>
          </Card>
        )}
      </div>

      <p className="mt-8 text-[12px] font-medium leading-[1.5] text-ink-muted">
        Want a fresh take? Regenerating spends coins and replaces the cards above.
      </p>
      <div className="mt-2">
        <RegenerateButton entryId={entryId} tier={tier} />
      </div>
    </div>
  );
}
