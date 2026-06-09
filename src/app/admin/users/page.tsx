// Pure EQ domain — replace in fork.
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { toggleAccess } from "../actions";

// Per-user aggregate from the `admin_user_activity` view (migration 0048). The
// view is deliberately NOT registered in the generated `Database` type: doing so
// poisons the `.from()` relation union that run-module.ts's dynamic-table casts
// depend on. Typed locally instead.
type UserActivityRow = {
  user_id: string;
  entry_count: number;
  last_active: string | null;
};

export default async function AdminUsersPage() {
  const sc = createServiceClient();

  // Fetch all users from auth (perPage: 1000 for MVP scale)
  const { data: authData } = await sc.auth.admin.listUsers({ perPage: 1000 });
  const users = authData?.users ?? [];
  const userIds = users.map((u) => u.id);

  // Parallel queries for user data
  const [profilesRes, subsRes, activityRes] = await Promise.all([
    sc
      .from("user_profiles")
      .select("user_id, primary_profile")
      .in("user_id", userIds)
      .order("created_at", { ascending: false }),
    sc
      .from("user_subscriptions")
      .select("user_id, status, role")
      .in("user_id", userIds),
    // Per-user entry count + last active, aggregated in Postgres (migration 0048
    // `admin_user_activity` view). Replaces the old 5000-row raw_records fetch +
    // JS count, which silently truncated counts past the cap. Untyped client cast
    // (see UserActivityRow note above) — the view is intentionally off the schema.
    (sc as SupabaseClient)
      .from("admin_user_activity")
      .select("user_id, entry_count, last_active")
      .in("user_id", userIds)
      .returns<UserActivityRow[]>(),
  ]);

  // Build lookup maps
  const profileMap = new Map<string, string>();
  for (const p of profilesRes.data ?? []) {
    // First match wins (most recent profile due to ORDER BY)
    if (!profileMap.has(p.user_id)) {
      profileMap.set(p.user_id, p.primary_profile);
    }
  }

  const subMap = new Map<string, { status: string; role: string }>();
  for (const s of subsRes.data ?? []) {
    subMap.set(s.user_id, { status: s.status, role: s.role });
  }

  const entryCountMap = new Map<string, number>();
  const lastActiveMap = new Map<string, string>();
  for (const a of activityRes.data ?? []) {
    // entry_count is a bigint — PostgREST may return it as a string.
    entryCountMap.set(a.user_id, Number(a.entry_count));
    if (a.last_active) {
      lastActiveMap.set(a.user_id, a.last_active);
    }
  }

  // Sort: most recent signup first
  const sorted = [...users].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div>
      <h2 className="text-xl font-bold text-zinc-900">
        Users ({users.length})
      </h2>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-400">
              <th className="pb-3 pr-4 font-medium">Email</th>
              <th className="pb-3 pr-4 font-medium">Profile</th>
              <th className="pb-3 pr-4 font-medium">Status</th>
              <th className="pb-3 pr-4 font-medium">Entries</th>
              <th className="pb-3 pr-4 font-medium">Last Active</th>
              <th className="pb-3 font-medium">Access</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((u) => {
              const sub = subMap.get(u.id);
              const hasAccess =
                sub?.status === "active" || sub?.status === "trial_active";
              const isAdminUser = sub?.role === "admin";

              return (
                <tr
                  key={u.id}
                  className="border-b border-zinc-100 hover:bg-zinc-50"
                >
                  <td className="py-3 pr-4">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="text-zinc-900 underline hover:text-zinc-600"
                    >
                      {u.email ?? "—"}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 capitalize text-zinc-600">
                    {profileMap.get(u.id) ?? "—"}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        isAdminUser
                          ? "bg-purple-100 text-purple-700"
                          : hasAccess
                            ? "bg-green-100 text-green-700"
                            : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {isAdminUser ? "admin" : (sub?.status ?? "none")}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-zinc-600">
                    {entryCountMap.get(u.id) ?? 0}
                  </td>
                  <td className="py-3 pr-4 text-zinc-500">
                    {lastActiveMap.has(u.id)
                      ? new Date(lastActiveMap.get(u.id)!).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="py-3">
                    {isAdminUser ? (
                      <span className="text-xs text-zinc-400">admin</span>
                    ) : (
                      <form
                        action={async () => {
                          "use server";
                          await toggleAccess(u.id, !hasAccess);
                        }}
                      >
                        <button
                          type="submit"
                          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                            hasAccess
                              ? "bg-red-50 text-red-600 hover:bg-red-100"
                              : "bg-green-50 text-green-600 hover:bg-green-100"
                          }`}
                        >
                          {hasAccess ? "Revoke" : "Grant"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
