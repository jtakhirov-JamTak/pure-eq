// Pure EQ domain — replace in fork.
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { toggleAccess } from "../../actions";

export default async function AdminUserDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sc = createServiceClient();

  // Fetch auth user
  const { data: authData, error: authErr } =
    await sc.auth.admin.getUserById(id);
  if (authErr || !authData?.user) {
    notFound();
  }
  const authUser = authData.user;

  // Parallel queries
  const [profileRes, subRes, entriesRes, recentRes] = await Promise.all([
    sc
      .from("user_profiles")
      .select("primary_profile, secondary_profile, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sc
      .from("user_subscriptions")
      .select("*")
      .eq("user_id", id)
      .maybeSingle(),
    sc.from("raw_records").select("module_type").eq("user_id", id),
    sc
      .from("raw_records")
      .select("record_type, module_type, is_complete, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const profile = profileRes.data;
  const sub = subRes.data;
  const hasAccess =
    sub?.status === "active" || sub?.status === "trial_active";
  const isAdminUser = sub?.role === "admin";

  // Entry counts by module
  const moduleCounts: Record<string, number> = {};
  for (const e of entriesRes.data ?? []) {
    const mod = e.module_type ?? "unknown";
    moduleCounts[mod] = (moduleCounts[mod] || 0) + 1;
  }

  const recentEntries = recentRes.data ?? [];

  return (
    <div>
      <Link
        href="/admin/users"
        className="text-sm text-zinc-400 hover:text-zinc-600"
      >
        &larr; All Users
      </Link>

      <h2 className="mt-4 text-xl font-bold text-zinc-900">
        {authUser.email ?? "Unknown"}
      </h2>

      {/* Auth info */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="text-sm font-medium uppercase tracking-wide text-zinc-400">
            Account
          </h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500">User ID</dt>
              <dd className="font-mono text-xs text-zinc-600">
                {authUser.id.slice(0, 8)}...
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Signed up</dt>
              <dd className="text-zinc-900">
                {new Date(authUser.created_at).toLocaleDateString()}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Last sign-in</dt>
              <dd className="text-zinc-900">
                {authUser.last_sign_in_at
                  ? new Date(authUser.last_sign_in_at).toLocaleDateString()
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="text-sm font-medium uppercase tracking-wide text-zinc-400">
            Profile
          </h3>
          {profile ? (
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Primary</dt>
                <dd className="capitalize text-zinc-900">
                  {profile.primary_profile}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Secondary</dt>
                <dd className="capitalize text-zinc-900">
                  {profile.secondary_profile ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Completed</dt>
                <dd className="text-zinc-900">
                  {new Date(profile.created_at).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">
              No profile — onboarding not completed
            </p>
          )}
        </div>
      </div>

      {/* Subscription */}
      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium uppercase tracking-wide text-zinc-400">
            Subscription
          </h3>
          {!isAdminUser && (
            <form
              action={async () => {
                "use server";
                await toggleAccess(id, !hasAccess);
              }}
            >
              <button
                type="submit"
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  hasAccess
                    ? "bg-red-50 text-red-600 hover:bg-red-100"
                    : "bg-green-50 text-green-600 hover:bg-green-100"
                }`}
              >
                {hasAccess ? "Revoke Access" : "Grant Access"}
              </button>
            </form>
          )}
        </div>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-500">Status</dt>
            <dd>
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
            </dd>
          </div>
          {sub?.trial_started_at && (
            <div className="flex justify-between">
              <dt className="text-zinc-500">Trial started</dt>
              <dd className="text-zinc-900">
                {new Date(sub.trial_started_at).toLocaleDateString()}
              </dd>
            </div>
          )}
          {sub?.trial_ends_at && (
            <div className="flex justify-between">
              <dt className="text-zinc-500">Trial ends</dt>
              <dd className="text-zinc-900">
                {new Date(sub.trial_ends_at).toLocaleDateString()}
              </dd>
            </div>
          )}
          {sub?.free_prepare_used_at && (
            <div className="flex justify-between">
              <dt className="text-zinc-500">Free Prepare used</dt>
              <dd className="text-zinc-900">
                {new Date(sub.free_prepare_used_at).toLocaleDateString()}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Entry counts */}
      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-5">
        <h3 className="text-sm font-medium uppercase tracking-wide text-zinc-400">
          Entries by Module
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { key: "prepare", label: "Prepare" },
            { key: "review", label: "Review" },
            { key: "before_you_send", label: "Before-Send" },
            { key: "tools", label: "Tools" },
          ].map((mod) => (
            <div key={mod.key}>
              <p className="text-2xl font-bold text-zinc-900">
                {moduleCounts[mod.key] ?? 0}
              </p>
              <p className="text-xs text-zinc-500">{mod.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent entries (no content — just metadata) */}
      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-5">
        <h3 className="text-sm font-medium uppercase tracking-wide text-zinc-400">
          Recent Entries
        </h3>
        {recentEntries.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">No entries yet</p>
        ) : (
          <div className="mt-3 space-y-2">
            {recentEntries.map((e, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="capitalize text-zinc-700">
                    {e.record_type}
                  </span>
                  {e.is_complete ? (
                    <span className="text-xs text-green-600">complete</span>
                  ) : (
                    <span className="text-xs text-zinc-400">incomplete</span>
                  )}
                </div>
                <span className="text-xs text-zinc-400">
                  {new Date(e.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
