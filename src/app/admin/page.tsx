// Pure EQ domain — replace in fork.
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";

export default async function AdminDashboard() {
  const sc = createServiceClient();

  // Parallel queries for stats — all use head:true or count to avoid
  // fetching unbounded result sets.
  const [
    usersRes,
    subsRes,
    prepareCount,
    reviewCount,
    bysCount,
    toolsCount,
  ] = await Promise.all([
    sc.auth.admin.listUsers({ perPage: 1000 }),
    sc
      .from("user_subscriptions")
      .select("status", { count: "exact", head: true })
      .in("status", ["trial_active", "active"]),
    sc
      .from("raw_records")
      .select("*", { count: "exact", head: true })
      .eq("module_type", "prepare"),
    sc
      .from("raw_records")
      .select("*", { count: "exact", head: true })
      .eq("module_type", "review"),
    sc
      .from("raw_records")
      .select("*", { count: "exact", head: true })
      .eq("module_type", "before_you_send"),
    sc
      .from("raw_records")
      .select("*", { count: "exact", head: true })
      .eq("module_type", "tools"),
  ]);

  const allUsers = usersRes.data?.users ?? [];
  const totalUsers = allUsers.length;
  const activeSubs = subsRes.count ?? 0;

  // Signups this week
  const weekAgo = new Date(
    new Date().getTime() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  const signupsThisWeek = allUsers.filter(
    (u) => u.created_at && u.created_at >= weekAgo
  ).length;

  const stats = [
    { label: "Total Users", value: totalUsers },
    { label: "Active Subscriptions", value: activeSubs },
    { label: "Signups This Week", value: signupsThisWeek },
  ];

  const moduleStats = [
    { label: "Prepare", value: prepareCount.count ?? 0 },
    { label: "Review", value: reviewCount.count ?? 0 },
    { label: "Before-Send", value: bysCount.count ?? 0 },
    { label: "Tools", value: toolsCount.count ?? 0 },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold text-zinc-900">Dashboard</h2>

      {/* Stats grid */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-zinc-200 bg-white p-5"
          >
            <p className="text-sm text-zinc-500">{s.label}</p>
            <p className="mt-1 text-3xl font-bold text-zinc-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Module entries */}
      <h3 className="mt-8 text-sm font-medium uppercase tracking-wide text-zinc-400">
        Entries by Module
      </h3>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {moduleStats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-zinc-200 bg-white p-5"
          >
            <p className="text-sm text-zinc-500">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Quick link */}
      <div className="mt-8">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600 underline hover:text-zinc-900"
        >
          View all users &rarr;
        </Link>
      </div>
    </div>
  );
}
