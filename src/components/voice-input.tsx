"use client";

import { useEffect, useRef, useState } from "react";

type InputMode = "voice" | "text";

type Props = {
  value: string;
  onChange: (next: string, mode: InputMode) => void;
  fieldName: string;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
};

type Status = "idle" | "recording" | "transcribing" | "error";

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
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

export function VoiceInput({
  value,
  onChange,
  fieldName,
  placeholder,
  rows = 4,
  disabled,
}: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const usedVoiceRef = useRef(false);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      abortRef.current?.abort();
    };
  }, []);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
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
      setStatus("recording");
    } catch (err) {
      console.error("mic access failed", (err as Error)?.name);
      setStatus("error");
      setError("Microphone blocked. Enable mic access in your browser settings.");
    }
  }

  function stopRecording() {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") {
      setStatus("transcribing");
      r.stop();
    }
  }

  async function sendBlob(blob: Blob) {
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const fd = new FormData();
      fd.append("audio", blob, "audio");
      fd.append("fieldName", fieldName);

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
      if (!text) {
        setStatus("idle");
        return;
      }
      usedVoiceRef.current = true;
      const next = value.trim() ? `${value.trim()} ${text}` : text;
      onChange(next, "voice");
      setStatus("idle");
    } catch (err) {
      console.error("transcribe request failed", (err as Error)?.message);
      setStatus("error");
      setError("Couldn't transcribe. Try again or type it.");
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
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) =>
          onChange(e.target.value, usedVoiceRef.current ? "voice" : "text")
        }
        rows={rows}
        disabled={disabled}
        className="block w-full rounded-lg border border-zinc-300 p-3 pr-14 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-60"
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={handleMicClick}
        disabled={disabled || transcribing}
        aria-label={recording ? "Stop recording" : "Start voice input"}
        className={`absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
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
      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
      {recording && !error && (
        <p className="mt-2 text-xs text-zinc-500">Recording… tap to stop.</p>
      )}
    </div>
  );
}
