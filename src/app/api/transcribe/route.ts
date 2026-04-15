import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAuthUser } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { transcribeSchema } from "@/lib/validation";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export async function POST(req: Request) {
  let user;
  try {
    user = await getAuthUser();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rl = rateLimit(`transcribe:${user.id}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const audio = form.get("audio");
  const fieldName = form.get("fieldName");

  const parsed = transcribeSchema.safeParse({ fieldName });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid fieldName" }, { status: 400 });
  }

  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "Missing audio" }, { status: 400 });
  }
  if (audio.size === 0) {
    return NextResponse.json({ error: "Empty audio" }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Audio too large" }, { status: 413 });
  }
  if (!audio.type.startsWith("audio/")) {
    return NextResponse.json({ error: "Invalid audio type" }, { status: 400 });
  }

  const ext = audio.type.includes("mp4")
    ? "mp4"
    : audio.type.includes("mpeg")
    ? "mp3"
    : "webm";

  try {
    const buffer = await audio.arrayBuffer();
    const file = new File([buffer], `audio.${ext}`, { type: audio.type });

    const client = new OpenAI();
    const result = await client.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "en",
      response_format: "json",
    });

    return NextResponse.json({ text: result.text ?? "" });
  } catch (err) {
    const code = (err as { status?: number; code?: string })?.code ?? "unknown";
    console.error("transcribe failed", code);
    return NextResponse.json(
      { error: "Transcription failed" },
      { status: 502 }
    );
  }
}
