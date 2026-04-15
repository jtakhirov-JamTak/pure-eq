"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAlreadyRegistered(false);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });

    if (error) {
      // Supabase returns "User already registered" (or a near variant) when
      // the email exists. Offer a clean path to login without losing the
      // pending quiz answers sitting in sessionStorage.
      if (/already\s+registered/i.test(error.message)) {
        setAlreadyRegistered(true);
      } else {
        setError(error.message);
      }
      setLoading(false);
      return;
    }

    router.push("/onboarding");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-zinc-900">Create account</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Start with your communication profile.
        </p>

        <form onSubmit={handleSignup} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="mt-1 block h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          {alreadyRegistered && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              You already have an account with this email.{" "}
              <Link href="/login" className="font-medium underline">
                Log in instead
              </Link>{" "}
              — your quiz answers will be saved automatically after you sign in.
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Get started"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Already have an account?{" "}
          <Link href="/login" className="text-zinc-700 underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
