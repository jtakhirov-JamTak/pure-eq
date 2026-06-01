"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  initialFirstName: string;
};

export function SettingsForm({ initialFirstName }: Props) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(initialFirstName);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmed = firstName.trim().slice(0, 50);
  const dirty = trimmed !== initialFirstName;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        data: { first_name: trimmed || null },
      });
      if (updateError) throw updateError;
      setSavedAt(Date.now());
      router.refresh();
    } catch (err) {
      console.error("settings update failed", (err as Error)?.message);
      setError("Could not save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSave}
      className="rounded-card border border-hairline bg-surface p-5"
    >
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
        className="mt-1.5 block h-12 w-full rounded-input border border-hairline bg-surface-tint px-4 text-base text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent"
        placeholder="Jane"
      />
      <p className="mt-2 text-[12px] font-medium text-ink-soft">
        Used in your Coach greeting. Leave blank to show a default.
      </p>

      {error && (
        <p className="mt-3 text-[13px] font-medium text-danger">{error}</p>
      )}

      {savedAt && !dirty && !error && (
        <p className="mt-3 text-[13px] font-medium text-positive">Saved.</p>
      )}

      <button
        type="submit"
        disabled={!dirty || saving}
        className="mt-5 flex h-12 w-full items-center justify-center rounded-pill bg-accent text-[14px] font-bold text-accent-text shadow-cta transition active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
