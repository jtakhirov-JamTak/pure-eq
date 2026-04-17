"use client";

import { useEffect, useRef, useMemo, useReducer } from "react";

interface Thread {
  thread_id: string;
  title: string | null;
  status: string;
  last_activity_at: string;
}

interface ThreadPickerProps {
  personId: string | null;
  value: string | null;
  onChange: (threadId: string | null) => void;
}

type State = {
  fetchedPersonId: string | null;
  threads: Thread[];
  loading: boolean;
};

type Action =
  | { type: "fetch_start" }
  | { type: "fetch_done"; personId: string; threads: Thread[] }
  | { type: "fetch_error"; personId: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "fetch_start":
      return { ...state, loading: true };
    case "fetch_done":
      return { fetchedPersonId: action.personId, threads: action.threads, loading: false };
    case "fetch_error":
      return { fetchedPersonId: action.personId, threads: [], loading: false };
  }
}

export default function ThreadPicker({
  personId,
  value,
  onChange,
}: ThreadPickerProps) {
  const [state, dispatch] = useReducer(reducer, {
    fetchedPersonId: null,
    threads: [],
    loading: false,
  });
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!personId) return;

    let cancelled = false;
    dispatch({ type: "fetch_start" });

    fetch(`/api/coach/threads?personId=${encodeURIComponent(personId)}`)
      .then((res) => (res.ok ? res.json() : { threads: [] }))
      .then((data) => {
        if (!cancelled) {
          dispatch({ type: "fetch_done", personId, threads: data.threads ?? [] });
        }
      })
      .catch(() => {
        if (!cancelled) {
          dispatch({ type: "fetch_error", personId });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [personId]);

  // Derive visible threads: only show when fetched result matches current personId
  const threads = useMemo(() => {
    if (!personId || state.fetchedPersonId !== personId) return [];
    return state.threads;
  }, [personId, state.fetchedPersonId, state.threads]);

  if (!personId || threads.length === 0) return null;

  function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  }

  return (
    <div className="mt-3">
      <label className="block text-sm font-medium text-zinc-700">
        Link to conversation
      </label>
      <select
        className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        value={value ?? "auto"}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "auto" ? null : v);
        }}
      >
        <option value="auto">Auto (most recent)</option>
        {threads.map((t) => (
          <option key={t.thread_id} value={t.thread_id}>
            {t.title ?? "Untitled"} — {formatDate(t.last_activity_at)}
          </option>
        ))}
      </select>
      {state.loading && (
        <p className="mt-1 text-xs text-zinc-500">Loading threads...</p>
      )}
    </div>
  );
}
