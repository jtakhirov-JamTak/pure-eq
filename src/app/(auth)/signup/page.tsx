"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Wordmark } from "@/components/brand/Wordmark";
import { SkyBackground } from "@/components/brand/SkyBackground";

export default function SignupPage() {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAlreadyRegistered(false);
    setLoading(true);

    const trimmedName = firstName.trim().slice(0, 50);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
        data: trimmedName ? { first_name: trimmedName } : undefined,
      },
    });

    if (error) {
      // Supabase returns "User already registered" (or a near variant) when
      // the email exists. Match both the HTTP status code (primary, stable)
      // and the English message (fallback) so localization or minor wording
      // changes don't silently break the graceful path.
      const looksAlreadyRegistered =
        error.status === 422 ||
        /already\s+(registered|exists|in use)/i.test(error.message) ||
        /user\s+exists/i.test(error.message);
      if (looksAlreadyRegistered) {
        setAlreadyRegistered(true);
      } else {
        setError(error.message);
      }
      setLoading(false);
      return;
    }

    // Full navigation so middleware sets session cookies before onboarding
    // tries to read auth state. Client-side push + refresh is a race.
    window.location.href = "/onboarding";
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-6 pb-[env(safe-area-inset-bottom)] pt-[max(3rem,env(safe-area-inset-top))]">
      <SkyBackground variant="calm" />

      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Wordmark size={18} />
        </div>
        <h1
          className="mt-8 font-display text-[30px] leading-[1.12] text-ink text-center"
          style={{ letterSpacing: "-0.7px" }}
        >
          Create account
        </h1>
        <p className="mt-2 text-center text-[14px] font-medium leading-[1.5] text-ink-soft">
          Start with your communication profile.
        </p>

        <form onSubmit={handleSignup} className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="firstName"
              className="block text-[13px] font-semibold text-ink"
            >
              First name
            </label>
            <input
              id="firstName"
              type="text"
              inputMode="text"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={50}
              required
              className="mt-1.5 block h-12 w-full rounded-card-xs bg-surface px-4 text-base text-ink shadow-soft placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Jane"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-[13px] font-semibold text-ink"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1.5 block h-12 w-full rounded-card-xs bg-surface px-4 text-base text-ink shadow-soft placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-[13px] font-semibold text-ink"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="mt-1.5 block h-12 w-full rounded-card-xs bg-surface px-4 text-base text-ink shadow-soft placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-[13px] font-medium text-danger">{error}</p>
          )}

          {alreadyRegistered && (
            <div className="space-y-3 rounded-card-sm bg-warm-soft p-4 shadow-soft">
              <p className="text-[13px] font-medium leading-[1.5] text-ink">
                You already have an account with this email. Your quiz answers
                will be saved automatically after you sign in.
              </p>
              <Link
                href="/login"
                className="flex h-12 w-full items-center justify-center rounded-pill bg-ink text-[14px] font-bold text-white shadow-soft active:scale-[0.98]"
              >
                Log in instead
              </Link>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex h-14 w-full items-center justify-center rounded-pill bg-brand text-[15px] font-bold text-white shadow-cta transition active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Get started"}
          </button>
        </form>

        <p className="mt-6 text-center text-[13px] font-medium text-ink-soft">
          Already have an account?{" "}
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center px-2 text-[13px] font-semibold text-brand-deep underline active:opacity-70"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
