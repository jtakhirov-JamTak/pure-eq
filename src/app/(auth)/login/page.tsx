"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Wordmark } from "@/components/brand/Wordmark";
import { SkyBackground } from "@/components/brand/SkyBackground";
import { GoogleGlyph } from "@/components/brand/GoogleGlyph";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const oauthInFlight = useRef(false);

  async function handleGoogle() {
    if (oauthInFlight.current) return;
    oauthInFlight.current = true;
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=/onboarding`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      oauthInFlight.current = false;
    }
    // Success: Supabase redirects the browser to Google's consent screen.
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Full navigation (not client-side) so the middleware runs and sets
    // session cookies before the onboarding page tries to read auth state.
    // router.push + router.refresh is a race — the page can mount before
    // the middleware processes the new session.
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
          Log in
        </h1>
        <p className="mt-2 text-center text-[14px] font-medium leading-[1.5] text-ink-soft">
          Welcome back to SpeakEasy.
        </p>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          aria-label="Continue with Google"
          className="mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-pill bg-surface text-[15px] font-bold text-ink shadow-soft transition active:scale-[0.98] disabled:opacity-50"
        >
          <GoogleGlyph />
          Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-hair" />
          <span className="text-[12px] font-semibold text-ink-soft">
            or continue with email
          </span>
          <div className="h-px flex-1 bg-hair" />
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1.5 block h-12 w-full rounded-card-xs bg-surface px-4 text-base text-ink shadow-soft placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-[13px] font-medium text-danger">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex h-14 w-full items-center justify-center rounded-pill bg-surface text-[15px] font-bold text-ink shadow-soft ring-1 ring-hair transition active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-center text-[13px] font-medium text-ink-soft">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="inline-flex min-h-11 items-center px-2 text-[13px] font-semibold text-brand-deep underline active:opacity-70"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
