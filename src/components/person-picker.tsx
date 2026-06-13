// Pure EQ domain — replace in fork.
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { pickMimeType, measureRms, MIN_RMS_FOR_SPEECH } from "@/lib/audio";
import type { RelationshipDomain } from "@/types";

type Person = {
  person_id: string;
  display_name: string;
  relationship_domain: RelationshipDomain;
  relationship_subtype: string | null;
};

type Props = {
  /** Current text value of the name input */
  value: string;
  /** Fires when the user types or a suggestion fills the name */
  onChange: (name: string) => void;
  /** Fires when a person is selected (UUID) or cleared (null) */
  onPersonSelect: (personId: string | null, relationship?: RelationshipDomain) => void;
  /** Currently selected personId, if any */
  selectedPersonId: string | null;
  placeholder?: string;
  disabled?: boolean;
};

const RELATIONSHIP_LABELS: Record<RelationshipDomain, string> = {
  romantic: "Romantic",
  friend: "Friend",
  family: "Family",
  work: "Work",
  other: "Other",
};

type VoiceStatus = "idle" | "recording" | "transcribing" | "error";

// Names are short — 15s is plenty for "Mom" or "Sarah from work" and bounds
// the blast radius if a user taps record and walks away.
const MAX_RECORDING_SECONDS_NAME = 15;

export function PersonPicker({
  value,
  onChange,
  onPersonSelect,
  selectedPersonId,
  placeholder = "Person name or label",
  disabled = false,
}: Props) {
  const [suggestions, setSuggestions] = useState<Person[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  // Highlighted option for keyboard nav (-1 = none). Drives aria-activedescendant
  // and the visual highlight; focus stays on the input (combobox pattern).
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  // Stable, instance-unique ids for the combobox/listbox/option wiring.
  const listboxId = useId();
  const optionId = (i: number) => `${listboxId}-opt-${i}`;

  // Voice recording state
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceSecondsLeft, setVoiceSecondsLeft] = useState(
    MAX_RECORDING_SECONDS_NAME,
  );
  const [hasRedo, setHasRedo] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceStartedAtRef = useRef<number>(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Fresh refs so sendBlob + redo always see current state, not closure state
  // captured when the recorder was set up.
  const valueRef = useRef(value);
  const selectedPersonIdRef = useRef(selectedPersonId);
  valueRef.current = value;
  selectedPersonIdRef.current = selectedPersonId;
  // Relationship is only observable at handleSelect time; track it so Redo
  // can restore the parent's full state (id + relationship), not just the id.
  const selectedRelationshipRef = useRef<RelationshipDomain | null>(null);
  // Snapshot captured immediately before a voice commit. Restoring this
  // (value + personId + relationship) is the whole redo payload.
  const redoSnapshotRef = useRef<{
    value: string;
    personId: string | null;
    relationship: RelationshipDomain | null;
  } | null>(null);

  function clearVoiceTimer() {
    if (voiceTimerRef.current !== null) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearVoiceTimer();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      abortRef.current?.abort();
      const r = recorderRef.current;
      if (r && r.state !== "inactive") {
        try { r.stop(); } catch { /* ignore */ }
      }
    };
  }, []);

  // Fetch suggestions on input change (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = value.trim();
    if (q.length === 0 || selectedPersonId) {
      setSuggestions([]);
      setShowDropdown(false);
      setActiveIndex(-1);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/persons?q=${encodeURIComponent(q)}`
        );
        if (res.ok) {
          const data = await res.json();
          const persons: Person[] = data.persons ?? [];
          setSuggestions(persons);
          setShowDropdown(persons.length > 0);
          setActiveIndex(-1);
        }
      } catch {
        // Silently fail — user can still type a new name
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, selectedPersonId]);

  // Close dropdown on outside click/tap (pointerdown covers both mouse + touch)
  useEffect(() => {
    function handlePointerOutside(e: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
        // Reset the highlight too, matching the Escape path — otherwise
        // aria-activedescendant dangles at an unmounted option id.
        setActiveIndex(-1);
      }
    }
    document.addEventListener("pointerdown", handlePointerOutside);
    return () => document.removeEventListener("pointerdown", handlePointerOutside);
  }, []);

  // Scroll dropdown into view when it opens (prevents hiding behind keyboard)
  useEffect(() => {
    if (showDropdown && dropdownRef.current) {
      dropdownRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [showDropdown]);

  function handleSelect(person: Person) {
    selectedRelationshipRef.current = person.relationship_domain;
    // A deliberate new selection replaces the voice outcome — tapping Redo
    // afterward would clobber the user's chosen person with pre-voice state.
    redoSnapshotRef.current = null;
    setHasRedo(false);
    onChange(person.display_name);
    onPersonSelect(person.person_id, person.relationship_domain);
    setShowDropdown(false);
    setSuggestions([]);
  }

  function handleInputChange(next: string) {
    if (selectedPersonId) {
      selectedRelationshipRef.current = null;
      // Clearing a selection via typing is a parent-state mutation — drop
      // the redo buffer so Redo can't silently re-select the cleared person.
      // Plain typing without a selection does NOT clear the buffer (spec:
      // snapshot-restore after typing is the correct undo behavior).
      redoSnapshotRef.current = null;
      setHasRedo(false);
      onPersonSelect(null);
    }
    onChange(next);
  }

  // Keyboard navigation for the combobox listbox (ArrowDown/Up move the
  // highlight, Enter selects it, Escape closes). Focus stays on the input;
  // the highlighted option is conveyed via aria-activedescendant.
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || suggestions.length === 0) {
      // ArrowDown re-opens a closed dropdown when suggestions exist.
      if (e.key === "ArrowDown" && suggestions.length > 0) {
        e.preventDefault();
        setShowDropdown(true);
        setActiveIndex(0);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1 >= suggestions.length ? 0 : i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault();
        handleSelect(suggestions[activeIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowDropdown(false);
      setActiveIndex(-1);
    }
  }

  // Keep the highlighted option scrolled into view during keyboard nav.
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = document.getElementById(optionId(activeIndex));
    el?.scrollIntoView({ block: "nearest" });
    // optionId is derived from the stable listboxId; safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  // ---------- Voice recording ----------
  async function startRecording() {
    setVoiceError(null);
    // Defensive: abort any still-in-flight transcribe from a previous cycle
    // before we overwrite recorder/stream refs.
    abortRef.current?.abort();
    abortRef.current = null;
    // New recording invalidates any prior redo buffer. Re-arms on next
    // successful voice commit.
    redoSnapshotRef.current = null;
    if (mountedRef.current) setHasRedo(false);
    const mimeType = pickMimeType();
    if (!mimeType) {
      setVoiceStatus("error");
      setVoiceError("Voice input isn't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType });
      } catch {
        recorder = new MediaRecorder(stream);
      }
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        void sendBlob(blob);
      };

      recorder.start();
      voiceStartedAtRef.current = Date.now();
      setVoiceSecondsLeft(MAX_RECORDING_SECONDS_NAME);

      // Wall-clock timer — immune to iOS background throttling.
      voiceTimerRef.current = setInterval(() => {
        const elapsed = Math.floor(
          (Date.now() - voiceStartedAtRef.current) / 1000,
        );
        const remaining = Math.max(
          0,
          MAX_RECORDING_SECONDS_NAME - elapsed,
        );
        if (mountedRef.current) setVoiceSecondsLeft(remaining);
        if (remaining <= 0) {
          clearVoiceTimer();
          const r = recorderRef.current;
          if (r && r.state !== "inactive") {
            if (mountedRef.current) setVoiceStatus("transcribing");
            try { r.stop(); } catch { /* ignore */ }
          }
        }
      }, 500);

      if (mountedRef.current) setVoiceStatus("recording");
    } catch (err) {
      console.error("mic access failed", (err as Error)?.name);
      if (mountedRef.current) {
        setVoiceStatus("error");
        setVoiceError("Microphone blocked. Enable mic access in your browser settings.");
      }
    }
  }

  function stopRecording() {
    clearVoiceTimer();
    const r = recorderRef.current;
    if (r && r.state !== "inactive") {
      if (mountedRef.current) setVoiceStatus("transcribing");
      try { r.stop(); } catch {
        if (mountedRef.current) {
          setVoiceStatus("error");
          setVoiceError("Recording ended unexpectedly.");
        }
      }
    }
  }

  async function sendBlob(blob: Blob) {
    // Client-side silence gate — see src/lib/audio.ts for threshold rationale.
    const rms = await measureRms(blob);
    if (rms !== null && rms < MIN_RMS_FOR_SPEECH) {
      if (!mountedRef.current) return;
      setVoiceStatus("error");
      setVoiceError("We didn't hear anything — try again.");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const fd = new FormData();
      fd.append("audio", blob, "audio");
      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: fd,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data: { text?: string } = await res.json();
      const text = (data.text ?? "").trim();
      if (!mountedRef.current) return;
      if (text) {
        // Snapshot BEFORE the commit so Redo can fully restore value +
        // personId + relationship for this specific mounted instance.
        const preSelectedId = selectedPersonIdRef.current;
        redoSnapshotRef.current = {
          value: valueRef.current,
          personId: preSelectedId,
          relationship: selectedRelationshipRef.current,
        };
        // For a name field, replace the current value (not append)
        if (preSelectedId) {
          selectedRelationshipRef.current = null;
          onPersonSelect(null);
        }
        onChangeRef.current(text);
        if (mountedRef.current) setHasRedo(true);
      }
      setVoiceStatus("idle");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      console.error("transcribe failed", (err as Error)?.message);
      if (mountedRef.current) {
        setVoiceStatus("error");
        setVoiceError("Couldn't transcribe. Try again or type it.");
      }
    }
  }

  function handleMicClick() {
    if (disabled) return;
    if (voiceStatus === "recording") {
      stopRecording();
    } else if (voiceStatus === "idle" || voiceStatus === "error") {
      void startRecording();
    }
  }

  function handleRedoClick() {
    if (disabled) return;
    const snapshot = redoSnapshotRef.current;
    if (snapshot === null) return;
    // Restore both halves of the pre-commit state so the parent's
    // selectedPersonId + relationship don't drift. Relationship may be null
    // if the parent pre-seeded a personId outside of handleSelect — parents
    // that rely on relationship (prepare) just skip the autofill in that case.
    onPersonSelect(
      snapshot.personId,
      snapshot.relationship ?? undefined,
    );
    selectedRelationshipRef.current = snapshot.relationship;
    onChangeRef.current(snapshot.value);
    redoSnapshotRef.current = null;
    setHasRedo(false);
    // No input focus before starting — keeps the keyboard from popping up
    // and competing with recording UI.
    void startRecording();
  }

  const recording = voiceStatus === "recording";
  const transcribing = voiceStatus === "transcribing";

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0 && !selectedPersonId) {
              setShowDropdown(true);
            }
          }}
          placeholder={placeholder}
          disabled={disabled || transcribing}
          autoComplete="off"
          autoCapitalize="words"
          role="combobox"
          aria-expanded={showDropdown && suggestions.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? optionId(activeIndex) : undefined
          }
          className={`w-full rounded-[14px] border px-4 py-3 pr-24 text-base text-ink placeholder:text-ink-soft focus:outline-none ${
            selectedPersonId
              ? "border-accent bg-accent-soft"
              : "border-hairline bg-surface focus:border-accent"
          }`}
        />
        {/* Right-side buttons: mic + clear */}
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {/* Mic button — always visible unless a person is selected */}
          {!selectedPersonId && (
            <button
              type="button"
              onClick={handleMicClick}
              disabled={disabled || transcribing}
              aria-label={recording ? "Stop recording" : "Start voice input"}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                recording
                  ? "bg-danger text-white"
                  : "text-accent-ink hover:bg-accent-soft"
              } disabled:opacity-50`}
            >
              {transcribing ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-hairline-strong border-t-accent" />
              ) : recording ? (
                <span className="h-3 w-3 rounded-sm bg-white" />
              ) : (
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
          )}
          {/* Clear button — shown when a person is selected */}
          {selectedPersonId && (
            <button
              type="button"
              onClick={() => {
                // X-clear is a deliberate parent-state mutation — drop the
                // redo buffer so a subsequent Redo can't resurrect the
                // person the user just cleared.
                redoSnapshotRef.current = null;
                setHasRedo(false);
                selectedRelationshipRef.current = null;
                onPersonSelect(null);
                onChange("");
                setSuggestions([]);
              }}
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-surface-tint hover:text-ink"
              aria-label="Clear selection"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
          {/* Search loading indicator */}
          {loading && !selectedPersonId && !recording && !transcribing && (
            <div className="flex h-10 w-10 items-center justify-center">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-hairline-strong border-t-accent" />
            </div>
          )}
        </div>
      </div>

      {/* Voice feedback */}
      {voiceError && (
        <p role="alert" className="mt-2 text-sm text-danger">{voiceError}</p>
      )}
      {recording && !voiceError && (
        <p
          role="status"
          className="mt-2 flex items-center gap-2 text-sm font-medium text-danger"
        >
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-danger" />
          Recording… {voiceSecondsLeft}s remaining
        </p>
      )}

      {/* Hide Redo while the suggestions dropdown is open — the dropdown
          (absolute z-20) overlays the same slot, and picking a suggestion
          is the more likely next action anyway. */}
      {voiceStatus === "idle" && hasRedo && !showDropdown && (
        <div className="mt-3">
          <button
            type="button"
            onClick={handleRedoClick}
            disabled={disabled}
            aria-label="Redo voice input"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-hairline bg-surface px-4 py-2 text-sm font-medium text-ink-soft active:opacity-80 disabled:opacity-50"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            Redo
          </button>
        </div>
      )}

      {/* Suggestions dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <ul
          ref={dropdownRef}
          id={listboxId}
          role="listbox"
          aria-label="Matching people"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-[14px] border border-hairline bg-surface shadow-card"
        >
          {suggestions.map((person, i) => (
            <li
              key={person.person_id}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
            >
              <button
                type="button"
                tabIndex={-1}
                onClick={() => handleSelect(person)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left ${
                  i === activeIndex ? "bg-surface-tint" : ""
                }`}
                style={{ minHeight: "44px" }}
              >
                <span className="text-base font-medium text-ink">
                  {person.display_name}
                </span>
                <span className="rounded-full bg-surface-tint px-2 py-0.5 text-xs text-ink-soft">
                  {RELATIONSHIP_LABELS[person.relationship_domain] ??
                    person.relationship_domain}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Bottom spacer when dropdown is open — prevents keyboard from hiding suggestions */}
      {showDropdown && suggestions.length > 0 && (
        <div className="h-40" aria-hidden />
      )}
    </div>
  );
}
