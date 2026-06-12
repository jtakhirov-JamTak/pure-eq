"use client";

import { useState } from "react";
import { updateThreadStatus } from "./actions";

const STATUSES = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
] as const;

export default function ThreadStatusSelector({
  threadId,
  currentStatus,
}: {
  threadId: string;
  currentStatus: string;
}) {
  const [status, setStatus] = useState(currentStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(newStatus: string) {
    if (newStatus === status) return;
    const previousStatus = status;
    setStatus(newStatus);
    setSaving(true);
    setError(null);
    try {
      const result = await updateThreadStatus(threadId, newStatus);
      if (!result.success) {
        setStatus(previousStatus);
        setError(result.error ?? "Update failed");
      }
    } catch {
      setStatus(previousStatus);
      setError("Update failed");
    }
    setSaving(false);
  }

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="thread-status"
        className="text-[13px] font-medium text-ink-soft"
      >
        Status:
      </label>
      <select
        id="thread-status"
        className="rounded-input border border-hairline bg-surface px-2 py-1.5 text-base text-ink focus:border-accent focus:outline-none disabled:opacity-50"
        value={status}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {saving && <span className="text-[11px] text-ink-muted">Saving...</span>}
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}
