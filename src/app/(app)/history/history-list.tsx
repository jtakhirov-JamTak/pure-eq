"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { softDeleteEntries } from "./actions";

export type HistoryEntry = {
  id: string;
  recordType: string;
  label: string;
  completedAt: string;
};

export function HistoryList({
  initialEntries,
  pageSize,
}: {
  initialEntries: HistoryEntry[];
  pageSize: number;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<HistoryEntry[]>(initialEntries);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [noMore, setNoMore] = useState(initialEntries.length < pageSize);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCount = selected.size;
  const allVisibleSelected =
    entries.length > 0 && entries.every((e) => selected.has(e.id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    if (allVisibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map((e) => e.id)));
    }
  }

  async function loadMore() {
    if (loadingMore || noMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/history?offset=${entries.length}&limit=${pageSize}`
      );
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = (await res.json()) as { entries: HistoryEntry[] };
      if (!body.entries || body.entries.length === 0) {
        setNoMore(true);
      } else {
        setEntries((prev) => [...prev, ...body.entries]);
        if (body.entries.length < pageSize) setNoMore(true);
      }
    } catch (err) {
      console.error("history load-more failed", (err as Error).message);
      setError("Could not load more. Try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function confirmDelete() {
    if (deleting || selected.size === 0) return;
    setDeleting(true);
    setError(null);
    try {
      const ids = [...selected];
      const result = await softDeleteEntries(ids);
      if (!result.success) {
        throw new Error(result.error ?? "Delete failed");
      }
      // Optimistically remove the deleted rows from local state.
      setEntries((prev) => prev.filter((e) => !selected.has(e.id)));
      setSelected(new Set());
      setShowConfirm(false);
      // Auto-refill: if we dropped below pageSize, fetch more to backfill.
      // Using the server-revalidated path means counts also refresh on any
      // subsequent nav back to /history.
      if (!noMore) {
        // Silent background top-up.
        try {
          const res = await fetch(
            `/api/history?offset=${entries.length - ids.length}&limit=${ids.length}`
          );
          if (res.ok) {
            const body = (await res.json()) as { entries: HistoryEntry[] };
            if (body.entries && body.entries.length > 0) {
              setEntries((prev) => [...prev, ...body.entries]);
            }
            if (!body.entries || body.entries.length < ids.length) {
              setNoMore(true);
            }
          }
        } catch {
          // Non-fatal — the delete already succeeded.
        }
      }
      // Refresh server-rendered pieces (counts at top of page).
      router.refresh();
    } catch (err) {
      console.error("history delete failed", (err as Error).message);
      setError("Could not delete. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  if (entries.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-8 text-center">
        <p className="text-base text-zinc-700">No completed entries yet.</p>
        <p className="mt-2 text-sm text-zinc-500">
          Entries you complete in Coach or Tools will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleAllVisible}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
          />
          Select all {entries.length}
        </label>
        {selectedCount > 0 && (
          <button
            onClick={() => setShowConfirm(true)}
            className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 active:bg-red-800"
          >
            <Trash2 className="h-4 w-4" />
            Delete {selectedCount}
          </button>
        )}
      </div>

      <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
        {entries.map((e) => {
          const isSelected = selected.has(e.id);
          const date = new Date(e.completedAt);
          const dateLabel = date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          return (
            <li
              key={e.id}
              className="flex items-center gap-3 px-4 py-3"
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleOne(e.id)}
                className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                aria-label={`Select ${e.label} entry from ${dateLabel}`}
              />
              <div className="flex-1">
                <p className="text-base font-medium text-zinc-900">{e.label}</p>
                <p className="text-sm text-zinc-500">{dateLabel}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {!noMore && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-200 px-5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
          onClick={() => !deleting && setShowConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-zinc-900">
              Delete {selectedCount}{" "}
              {selectedCount === 1 ? "entry" : "entries"}?
            </h3>
            <p className="mt-2 text-sm text-zinc-600">
              This removes them from your history and from any insights they
              contributed to. This can&apos;t be undone.
            </p>
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={deleting}
                className="h-11 flex-1 rounded-full border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="h-11 flex-1 rounded-full bg-red-600 text-sm font-medium text-white hover:bg-red-700 active:bg-red-800 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
