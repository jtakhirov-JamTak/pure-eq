// Pure EQ domain — replace in fork.
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasToolsAccess } from "@/lib/require-access";
import { ToolsHubLocked } from "./tools-hub-locked";

export default async function ToolsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await hasToolsAccess(user))) {
    return <ToolsHubLocked />;
  }

  return (
    <div className="px-5 pt-8 pb-28">
      <h2 className="text-xl font-bold text-zinc-900">Tools</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Use these when you need help in the moment.
      </p>

      <div className="mt-8 space-y-4">
        <Link
          href="/tools/overwhelmed"
          className="flex w-full flex-col items-start rounded-xl border border-zinc-200 p-5 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50 active:bg-zinc-100"
        >
          <h3 className="text-base font-semibold text-zinc-900">
            I&apos;m Overwhelmed
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            A fast nervous-system reset. Calm your body and reduce the grip of
            intense emotion.
          </p>
          <span className="mt-3 text-xs text-zinc-500">
            ~4 min guided exercise
          </span>
        </Link>

        <Link
          href="/tools/triggered"
          className="flex w-full flex-col items-start rounded-xl border border-zinc-200 p-5 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50 active:bg-zinc-100"
        >
          <h3 className="text-base font-semibold text-zinc-900">
            I&apos;m Triggered
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            Log a trigger in real time. Understand your pattern and see the
            situation more clearly.
          </p>
          <span className="mt-3 text-xs text-zinc-500">
            7-step guided reflection
          </span>
        </Link>
      </div>
    </div>
  );
}
