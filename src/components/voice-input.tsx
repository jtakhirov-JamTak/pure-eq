"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
};

type Status = "idle" | "recording" | "transcribing" | "error";

const MAX_RECORDING_SECONDS = 45;

// Whisper hallucinates short filler ("you", "thank you.", "silence.silence.")
// when given silent audio. Gate the API call on RMS amplitude so a user who
// records silence sees a retry prompt instead of hallucinated text in their
// textbox — and we don't burn a Whisper call on empty audio.
// Typical phone-mic self-noise RMS is ~0.001–0.003 (-50 to -60 dBFS).
// Whispered speech measures ~0.01+ (-40 dBFS). 0.005 rejects ambient noise
// while leaving room for quiet voices.
const MIN_RMS_FOR_SPEECH = 0.005;

async function measureRms(blob: Blob): Promise<number | null> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const Ctx =
      typeof OfflineAudioContext !== "undefined" ? OfflineAudioContext : null;
    if (!Ctx) return null;
    // OfflineAudioContext resamples decoded audio to its own rate; 44.1kHz
    // works for any WebM/MP4/MP3/WAV input Whisper accepts.
    const ctx = new Ctx(1, 1, 44100);
    const audio = await ctx.decodeAudioData(arrayBuffer);
    const channel = audio.getChannelData(0);
    if (channel.length === 0) return 0;
    let sumSquares = 0;
    for (let i = 0; i < channel.length; i++) {
      sumSquares += channel[i] * channel[i];
    }
    return Math.sqrt(sumSquares / channel.length);
  } catch {
    return null;
  }
}

const CODEC_PREFERENCE = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
];

function pickMimeType(): string | undefined {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return undefined;
  }
  for (const t of CODEC_PREFERENCE) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      // Some browsers throw on unknown mime types.
    }
  }
  return undefined;
}

export function VoiceInput({
  value,
  onChange,
  placeholder,
  rows = 4,
  disabled,
}: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(MAX_RECORDING_SECONDS);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);

  // Fresh value + onChange refs so async callbacks never close over stale state.
  // Without these, a transcript returning after the parent re-renders would
  // overwrite whatever the user typed in the meantime.
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      abortRef.current?.abort();
      const r = recorderRef.current;
      if (r && r.state !== "inactive") {
        try {
          r.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  function clearTimer() {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function safeSetStatus(next: Status) {
    if (mountedRef.current) setStatus(next);
  }
  function safeSetError(next: string | null) {
    if (mountedRef.current) setError(next);
  }

  async function startRecording() {
    safeSetError(null);
    const mimeType = pickMimeType();
    if (!mimeType) {
      safeSetStatus("error");
      safeSetError("Voice input isn't supported in this browser. Please type instead.");
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
      startedAtRef.current = Date.now();
      setSecondsLeft(MAX_RECORDING_SECONDS);

      // Wall-clock timer — immune to iOS background throttling.
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
        const remaining = Math.max(0, MAX_RECORDING_SECONDS - elapsed);
        if (mountedRef.current) setSecondsLeft(remaining);
        if (remaining <= 0) {
          clearTimer();
          // Auto-stop: no error, just transcribe what we have.
          const r = recorderRef.current;
          if (r && r.state !== "inactive") {
            if (mountedRef.current) setStatus("transcribing");
            try { r.stop(); } catch { /* ignore */ }
          }
        }
      }, 500);

      safeSetStatus("recording");
    } catch (err) {
      console.error("mic access failed", (err as Error)?.name);
      safeSetStatus("error");
      safeSetError(
        "Microphone blocked. Enable mic access in your browser settings."
      );
    }
  }

  function stopRecording() {
    clearTimer();
    const r = recorderRef.current;
    if (r && r.state !== "inactive") {
      safeSetStatus("transcribing");
      try {
        r.stop();
      } catch {
        safeSetStatus("error");
        safeSetError("Recording ended unexpectedly. Try again.");
      }
    }
  }

  async function sendBlob(blob: Blob) {
    // Client-side silence gate: skip Whisper entirely on empty audio.
    // Whisper returns hallucinated filler on silence; rejecting here avoids
    // polluting the textbox AND saves one API call per empty submission.
    // If decoding fails (measureRms returns null), send anyway and let the
    // server decide — a decode failure on our side doesn't mean bad audio.
    const rms = await measureRms(blob);
    if (rms !== null && rms < MIN_RMS_FOR_SPEECH) {
      if (!mountedRef.current) return;
      safeSetStatus("error");
      safeSetError("We didn't hear anything — try again.");
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
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const data: { text?: string } = await res.json();
      const text = (data.text ?? "").trim();
      if (!mountedRef.current) return;
      if (!text) {
        safeSetStatus("idle");
        return;
      }
      // Read value via ref so we append to whatever the user has typed
      // since we started recording, not the captured render-time value.
      const current = valueRef.current.trim();
      const next = current ? `${current} ${text}` : text;
      onChangeRef.current(next);
      safeSetStatus("idle");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      console.error("transcribe request failed", (err as Error)?.message);
      safeSetStatus("error");
      safeSetError("Couldn't transcribe. Try again or type it.");
    }
  }

  function handleMicClick() {
    if (disabled) return;
    if (status === "recording") {
      stopRecording();
    } else if (status === "idle" || status === "error") {
      void startRecording();
    }
  }

  const recording = status === "recording";
  const transcribing = status === "transcribing";

  return (
    <div>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          disabled={disabled}
          // pb-14 reserves vertical room so the mic button never overlaps
          // the last line of text when the textarea fills up.
          className="block w-full rounded-lg border border-zinc-300 p-3 pb-14 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-60"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={handleMicClick}
          disabled={disabled || transcribing}
          aria-label={recording ? "Stop recording" : "Start voice input"}
          className={`absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
            recording
              ? "bg-red-500 text-white"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          } disabled:opacity-50`}
        >
          {transcribing ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
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
      </div>
      {/* Reserve vertical space so the hint -> recording -> silent-typing
          transitions don't cause a ~20px layout shift mid-interaction. */}
      <div className="mt-1.5 min-h-[1.25rem]">
        {error && <span className="text-sm text-red-600">{error}</span>}
        {!error && recording && (
          <span className="flex items-center gap-2 text-sm font-medium text-red-600">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Recording… {secondsLeft}s remaining
          </span>
        )}
        {!error && !recording && !transcribing && !value && (
          <span className="text-xs text-zinc-500">
            Speak up to 45 seconds — brief and clear works best.
          </span>
        )}
      </div>
    </div>
  );
}
