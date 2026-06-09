// Admin detection. isAdmin is the hot-path env-var gate used by the layout +
// every coin-debiting route (admins bypass the charge), so a regression that
// wrongly returns true would hand free AI to a non-admin; one that wrongly
// returns false would charge the founder. checkAdmin adds the DB-role slow path.

import { describe, it, expect, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { isAdmin, checkAdmin } from "@/lib/admin";

const ORIGINAL_ADMIN_EMAIL = process.env.ADMIN_EMAIL;
afterEach(() => {
  if (ORIGINAL_ADMIN_EMAIL === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = ORIGINAL_ADMIN_EMAIL;
});

describe("isAdmin", () => {
  it("returns false for an undefined email", () => {
    process.env.ADMIN_EMAIL = "boss@example.com";
    expect(isAdmin(undefined)).toBe(false);
  });

  it("returns false when ADMIN_EMAIL is unset (no implicit admin)", () => {
    delete process.env.ADMIN_EMAIL;
    expect(isAdmin("boss@example.com")).toBe(false);
  });

  it("matches the configured admin email exactly", () => {
    process.env.ADMIN_EMAIL = "boss@example.com";
    expect(isAdmin("boss@example.com")).toBe(true);
  });

  it("is case-insensitive on both sides", () => {
    process.env.ADMIN_EMAIL = "Boss@Example.com";
    expect(isAdmin("BOSS@example.COM")).toBe(true);
  });

  it("rejects a non-matching email", () => {
    process.env.ADMIN_EMAIL = "boss@example.com";
    expect(isAdmin("intruder@example.com")).toBe(false);
  });
});

// Minimal chainable Supabase stub: .from(table).select().eq().maybeSingle().
// `onFrom` records whether the DB was queried so we can assert the env fast path
// short-circuits before any DB round trip.
function fakeClient(
  role: string | null,
  onFrom?: (table: string) => void,
): SupabaseClient<Database> {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: role === null ? null : { role } }),
  };
  return {
    from: (table: string) => {
      onFrom?.(table);
      return builder;
    },
  } as unknown as SupabaseClient<Database>;
}

describe("checkAdmin", () => {
  afterEach(() => {
    if (ORIGINAL_ADMIN_EMAIL === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = ORIGINAL_ADMIN_EMAIL;
  });

  it("returns true on the env fast path WITHOUT touching the DB", async () => {
    process.env.ADMIN_EMAIL = "boss@example.com";
    let queried = false;
    const client = fakeClient(null, () => {
      queried = true;
    });
    expect(await checkAdmin("boss@example.com", client, "user-1")).toBe(true);
    expect(queried).toBe(false);
  });

  it("falls back to the DB role and returns true for role=admin", async () => {
    delete process.env.ADMIN_EMAIL;
    const client = fakeClient("admin");
    expect(await checkAdmin("someone@example.com", client, "user-1")).toBe(true);
  });

  it("returns false when neither env nor DB role grant admin", async () => {
    delete process.env.ADMIN_EMAIL;
    expect(await checkAdmin("someone@example.com", fakeClient("user"), "u")).toBe(
      false,
    );
    expect(await checkAdmin("someone@example.com", fakeClient(null), "u")).toBe(
      false,
    );
  });
});
