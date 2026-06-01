"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { softDeleteEntries } from "./actions";
import { Card } from "@/components/ui/card";

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

  function mergeUnique(
    prev: HistoryEntry[],
    incoming: HistoryEntry[],
  ): HistoryEntry[] {
    const seen = new Set(prev.map((e) => e.id));
    return [...prev, ...incoming.filter((e) => !seen.has(e.id))];
  }

  async function loadMore() {
    if (loadingMore || noMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/history?offset=${entries.length}&limit=${pageSize}`,
      );
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = (await res.json()) as { entries: HistoryEntry[] };
      if (!body.entries || body.entries.length === 0) {
        setNoMore(true);
      } else {
        setEntries((prev) => mergeUnique(prev, body.entries));
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
      setEntries((prev) => prev.filter((e) => !selected.has(e.id)));
      setSelected(new Set());
      setShowConfirm(false);
      if (!noMore) {
        try {
          const res = await fetch(
            `/api/history?offset=${entries.length - ids.length}&limit=${ids.length}`,
          );
          if (res.ok) {
            const body = (await res.json()) as { entries: HistoryEntry[] };
            if (body.entries && body.entries.length > 0) {
              setEntries((prev) => mergeUnique(prev, body.entries));
            }
            if (!body.entries || body.entries.length < ids.length) {
              setNoMore(true);
            }
          }
        } catch {
          // Non-fatal — the delete already succeeded.
        }
      }
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
      <Card className="mt-6 p-6 text-center">
        <p className="text-[15px] font-medium text-ink">
          No completed entries yet.
        </p>
        <p className="mt-1 text-[13px] font-medium text-ink-soft">
          Entries you complete in Coach or Tools will show up here.
        </p>
      </Card>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleAllVisible}
            className="h-4 w-4 rounded border-hairline text-accent focus:ring-accent"
          />
          Select all {entries.length}
        </label>
        {selectedCount > 0 && (
          <button
            onClick={() => setShowConfirm(true)}
            className="inline-flex h-11 items-center gap-1.5 rounded-pill bg-danger px-4 text-[13px] font-bold text-white active:opacity-90"
          >
            <Trash2 className="h-4 w-4" />
            Delete {selectedCount}
          </button>
        )}
      </div>

      <ul className="mt-3 overflow-hidden rounded-card border border-hairline bg-surface">
        {entries.map((e, idx) => {
          const isSelected = selected.has(e.id);
          const date = new Date(e.completedAt);
          const dateLabel = date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          return (
            <li key={e.id}>
              <label
                className={`flex min-h-11 cursor-pointer items-center gap-3 px-4 py-3 ${
                  idx > 0 ? "border-t border-hairline" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleOne(e.id)}
                  className="h-4 w-4 rounded border-hairline text-accent focus:ring-accent"
                  aria-label={`Select ${e.label} entry from ${dateLabel}`}
                />
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-ink">
                    {e.label}
                  </p>
                  <p className="text-[12px] font-medium text-ink-soft">
                    {dateLabel}
                  </p>
                </div>
              </label>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="mt-3 text-[13px] font-medium text-danger">{error}</p>
      )}

      {!noMore && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex h-11 items-center justify-center rounded-pill border border-hairline bg-surface px-5 text-[13px] font-semibold text-ink active:opacity-80 disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm"
          onClick={() => !deleting && setShowConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-card border border-hairline bg-surface p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-[22px] font-medium leading-[1.15] text-ink">
              Delete {selectedCount}{" "}
              {selectedCount === 1 ? "entry" : "entries"}?
            </h3>
            <p className="mt-2 text-[14px] font-medium leading-[1.5] text-ink-soft">
              This removes them from your history and from any insights they
              contributed to. This can&apos;t be undone.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={deleting}
                className="h-12 flex-1 rounded-pill bg-surface-tint text-[14px] font-semibold text-ink active:opacity-80 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="h-12 flex-1 rounded-pill bg-danger text-[14px] font-bold text-white active:opacity-90 disabled:opacity-50"
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
