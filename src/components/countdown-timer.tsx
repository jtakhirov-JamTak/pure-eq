"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  durationSeconds: number;
  onComplete: () => void;
  label?: string;
  /** When true, cycles "In (4s) … Hold (4s) … Out (6s)" overlay text. */
  breathingMode?: boolean;
};

// Breathing cycle: 4s inhale, 4s hold, 6s exhale = 14s total
const INHALE = 4;
const HOLD = 4;
const EXHALE = 6;
const CYCLE = INHALE + HOLD + EXHALE;

function breathingPhase(elapsed: number): string {
  const pos = elapsed % CYCLE;
  if (pos < INHALE) return "Breathe in";
  if (pos < INHALE + HOLD) return "Hold";
  return "Breathe out";
}

/**
 * Play a gentle completion "ding" via Web Audio API.
 * No file dependency — synthesises a short sine-wave tone.
 */
function playPing(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 600;
  gain.gain.setValueAtTime(0.35, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.4);
}

// Module-level singleton so we don't leak AudioContexts across mounts.
let sharedAudioCtx: AudioContext | null = null;

/**
 * Ensure the shared AudioContext exists and is resumed.
 * Call from a user-gesture handler (button click) to satisfy iOS Safari's
 * autoplay policy BEFORE a timer needs to play a completion ping.
 */
export function unlockAudio(): void {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioContext();
  }
  if (sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume().catch(() => {});
  }
}

function ensureAudioCtx(): AudioContext {
  unlockAudio();
  return sharedAudioCtx!;
}

export function CountdownTimer({
  durationSeconds,
  onComplete,
  label,
  breathingMode = false,
}: Props) {
  const [remaining, setRemaining] = useState(durationSeconds);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);
  // Wall-clock anchor for drift-proof elapsed time. Set in the effect.
  const startedAtRef = useRef(0);

  const fireComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const ctx = ensureAudioCtx();
    playPing(ctx);
    // Small delay so ping plays before advancing.
    setTimeout(() => onCompleteRef.current(), 200);
  }, []);

  // Countdown interval — starts immediately on mount, uses wall-clock.
  useEffect(() => {
    startedAtRef.current = Date.now();
    completedRef.current = false;
    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      const next = Math.max(0, durationSeconds - elapsed);
      setRemaining(next);
      if (next <= 0) {
        fireComplete();
      }
    }, 1000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [durationSeconds, fireComplete]);

  const elapsed = durationSeconds - remaining;
  const progress = remaining / durationSeconds;

  // Format mm:ss
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const display = mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}`;

  function handleDone() {
    setRemaining(0);
    fireComplete();
  }

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {label && (
        <p className="text-center text-[11px] font-bold uppercase tracking-[1.5px] text-ink-soft">
          {label}
        </p>
      )}

      {/* Circular progress ring + optional breathing-cloud pulse */}
      <div
        className={`relative flex h-44 w-44 items-center justify-center ${
          breathingMode ? "[animation:breathe_14s_ease-in-out_infinite]" : ""
        }`}
      >
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 160 160">
          <circle
            cx="80"
            cy="80"
            r="70"
            fill="none"
            stroke="var(--color-surface-tint)"
            strokeWidth="6"
          />
          <circle
            cx="80"
            cy="80"
            r="70"
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 70}
            strokeDashoffset={2 * Math.PI * 70 * (1 - progress)}
            className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        </svg>
        <span
          className="font-display text-[48px] leading-none text-ink tabular-nums"
          style={{ letterSpacing: "-1.5px" }}
        >
          {display}
        </span>
      </div>

      {breathingMode && remaining > 0 && (
        <p className="font-display text-[18px] italic text-brand-deep">
          {breathingPhase(elapsed)}
        </p>
      )}

      <button
        type="button"
        onClick={handleDone}
        className="inline-flex h-11 items-center justify-center rounded-pill bg-surface px-6 text-[14px] font-semibold text-ink shadow-soft active:opacity-80"
      >
        Skip
      </button>
    </div>
  );
}
