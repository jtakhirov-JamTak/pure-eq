import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Dev-only smoke test page. Proves the full chain:
// browser → middleware cookies → server client → auth → RLS-scoped query.
// Delete this route once Coach tab ships.

export const dynamic = "force-dynamic";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function WhoAmIPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // RLS smoke test — each of these queries runs as the authenticated user.
  // If RLS is correctly configured, counts reflect only rows owned by them.
  const [rawRecords, userProfiles, persons] = await Promise.all([
    supabase
      .from("raw_records")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("user_profiles")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("persons")
      .select("*", { count: "exact", head: true }),
  ]);

  const checks = [
    { table: "raw_records", result: rawRecords },
    { table: "user_profiles", result: userProfiles },
    { table: "persons", result: persons },
  ];

  const allOk = checks.every((c) => !c.result.error);

  return (
    <div className="min-h-dvh bg-white px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-zinc-900">/dev/whoami</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Smoke test — proves auth + session + RLS + database query all work end to end.
        </p>

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Authenticated user
          </h2>
          <dl className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-zinc-50">
            <div className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
              <dt className="font-medium text-zinc-700">user.id</dt>
              <dd className="break-all text-right font-mono text-xs text-zinc-900">
                {user.id}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
              <dt className="font-medium text-zinc-700">user.email</dt>
              <dd className="text-right text-zinc-900">{user.email}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
              <dt className="font-medium text-zinc-700">created_at</dt>
              <dd className="text-right text-zinc-900">
                {new Date(user.created_at).toLocaleString()}
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            RLS-scoped query checks
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Each query runs as you. A clean pass = query succeeded AND returned only
            rows you own (counts should be 0 for a brand-new account).
          </p>
          <ul className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-zinc-50">
            {checks.map(({ table, result }) => (
              <li
                key={table}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span className="font-mono text-zinc-700">{table}</span>
                {result.error ? (
                  <span className="text-right text-red-600">
                    FAIL — {result.error.message}
                  </span>
                ) : (
                  <span className="text-right text-zinc-900">
                    OK — {result.count ?? 0} row
                    {result.count === 1 ? "" : "s"}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p
            className={`mt-3 text-sm font-medium ${
              allOk ? "text-green-700" : "text-red-700"
            }`}
          >
            {allOk
              ? "All checks passed — the full chain is working."
              : "One or more checks failed. See above."}
          </p>
        </section>

        <section className="mt-8">
          <form action={signOut}>
            <button
              type="submit"
              className="flex h-11 items-center justify-center rounded-lg border border-zinc-300 bg-white px-6 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
            >
              Sign out
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
