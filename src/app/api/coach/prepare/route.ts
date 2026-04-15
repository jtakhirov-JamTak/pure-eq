import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { createPrepareSchema } from "@/lib/validation";
import { prepareOutputSchema, validateAIOutput } from "@/lib/ai/schemas";
import { buildPreparePrompt } from "@/lib/ai/prompts";
import Anthropic from "@anthropic-ai/sdk";

const MAX_RETRIES = 2;

export async function POST(request: Request) {
  try {
    // Auth check
    const user = await getAuthUser();

    // Validate input
    const body = await request.json();
    const parsed = createPrepareSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const input = parsed.data;

    // TODO: Save raw record to Supabase here
    // const rawRecord = await saveRawRecord(user.id, "prepare", input);

    // Build AI prompt
    // TODO: Fetch user profile from DB
    const userProfile = "reflective"; // placeholder

    const prompt = buildPreparePrompt({
      profile: userProfile as "reflective",
      personName: input.personName,
      relationship: input.relationship,
      situation: input.situation,
      desiredOutcome: input.desiredOutcome,
      primaryEmotion: input.primaryEmotion,
      defaultPattern: input.defaultPattern,
      otherPersonHypothesis: input.otherPersonHypothesis,
      realityCheckQuestion: input.realityCheckQuestion,
      triggerPlan: input.triggerPlan,
    });

    // Call AI with retries
    let aiOutput = null;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const client = new Anthropic();
        const message = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: prompt.system,
          messages: [{ role: "user", content: prompt.user }],
        });

        // Extract text response
        const textBlock = message.content.find((b) => b.type === "text");
        if (!textBlock || textBlock.type !== "text") {
          throw new Error("No text response from AI");
        }

        // Parse and validate JSON output
        const raw = textBlock.text.replace(/```json\n?|```/g, "").trim();
        const jsonOutput = JSON.parse(raw);

        // Validate against schema
        const validated = prepareOutputSchema.safeParse(jsonOutput);
        if (!validated.success) {
          throw new Error("AI output does not match schema");
        }

        // Check for banned phrases
        validateAIOutput(validated.data);

        aiOutput = validated.data;
        break;
      } catch (err) {
        lastError = err as Error;
        console.error(
          `AI attempt ${attempt + 1} failed:`,
          (err as Error).message
        );
      }
    }

    // Return result
    if (aiOutput) {
      return NextResponse.json({
        success: true,
        aiOutput,
        // recordId: rawRecord.id,
      });
    }

    // AI failed after retries — entry still saved
    console.error("AI generation failed after retries:", lastError?.message);
    return NextResponse.json({
      success: true,
      aiOutput: null,
      message:
        "We could not generate coaching feedback right now. Your entry has been saved and will still contribute to your insights.",
    });
  } catch (err) {
    if ((err as Error).message === "Not authenticated") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Prepare error:", (err as Error).message);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
