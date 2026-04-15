"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProfileType, ProfileResult, ImprovementGoal } from "@/types";

const QUESTIONS = [
  {
    text: "When conversations go well, what feels most natural to you?",
    options: [
      { label: "A", text: "Saying what matters clearly and directly" },
      { label: "B", text: "Thinking carefully before I speak" },
      { label: "C", text: "Helping the other person feel comfortable and understood" },
      { label: "D", text: "Staying calm, measured, and in control" },
      { label: "E", text: "Bringing honest energy and emotional presence into the conversation" },
    ],
    mapping: { A: "direct", B: "reflective", C: "warm", D: "measured", E: "intense" } as Record<string, ProfileType>,
  },
  {
    text: "What do people tend to appreciate most about how you communicate?",
    options: [
      { label: "A", text: "I'm straightforward and easy to understand" },
      { label: "B", text: "I'm thoughtful and do not react too quickly" },
      { label: "C", text: "I'm warm, supportive, and considerate" },
      { label: "D", text: "I stay steady and do not make things bigger than they are" },
      { label: "E", text: "I notice what others are feeling, even when they do not say it directly" },
    ],
    mapping: { A: "direct", B: "reflective", C: "warm", D: "measured", E: "perceptive" } as Record<string, ProfileType>,
  },
  {
    text: "When someone is upset with you, what is your first instinct?",
    options: [
      { label: "A", text: "Clear things up directly" },
      { label: "B", text: "Slow down and understand what is really going on" },
      { label: "C", text: "Reassure them and reduce the tension" },
      { label: "D", text: "Pull back so I do not make it worse" },
      { label: "E", text: "Read between the lines and figure out what they really mean" },
    ],
    mapping: { A: "direct", B: "reflective", C: "warm", D: "measured", E: "perceptive" } as Record<string, ProfileType>,
  },
  {
    text: "In hard conversations, what becomes hardest for you?",
    options: [
      { label: "A", text: "Staying calm once emotions rise" },
      { label: "B", text: "Saying what I really mean without overthinking" },
      { label: "C", text: "Not taking responsibility for fixing everything" },
      { label: "D", text: "Not shutting down or pulling back" },
      { label: "E", text: "Not assuming I already know what the other person means" },
    ],
    mapping: { A: "intense", B: "reflective", C: "warm", D: "measured", E: "perceptive" } as Record<string, ProfileType>,
  },
  {
    text: "What usually goes wrong first when tension rises?",
    options: [
      { label: "A", text: "I push my point too hard" },
      { label: "B", text: "I hesitate, over-process, or wait too long" },
      { label: "C", text: "I focus too much on smoothing things over" },
      { label: "D", text: "I go quiet, withdraw, or avoid the real issue" },
      { label: "E", text: "I start interpreting instead of checking" },
    ],
    mapping: { A: "intense", B: "reflective", C: "warm", D: "measured", E: "perceptive" } as Record<string, ProfileType>,
  },
  {
    text: "When you feel misunderstood, what do you most tend to do?",
    options: [
      { label: "A", text: "Push harder to explain my point" },
      { label: "B", text: "Replay everything in my head and second-guess myself" },
      { label: "C", text: "Try to make the conversation feel better fast" },
      { label: "D", text: "Pull back and say less" },
      { label: "E", text: "React strongly or feel emotionally overwhelmed" },
    ],
    mapping: { A: "direct", B: "reflective", C: "warm", D: "measured", E: "intense" } as Record<string, ProfileType>,
  },
  {
    text: "When the other person gets more intense, what do you do?",
    options: [
      { label: "A", text: "Stand my ground" },
      { label: "B", text: "Go quiet and think" },
      { label: "C", text: "Try to bring the temperature down" },
      { label: "D", text: "Stay calm, don't react" },
      { label: "E", text: "Match their energy" },
    ],
    mapping: { A: "direct", B: "reflective", C: "warm", D: "measured", E: "intense" } as Record<string, ProfileType>,
  },
  {
    text: "After a conversation goes badly, what do you do first?",
    options: [
      { label: "A", text: "Go back and address it" },
      { label: "B", text: "Replay it in my head" },
      { label: "C", text: "Check if they're okay" },
      { label: "D", text: "Give it space" },
      { label: "E", text: "Try to read where they're at before I do anything" },
    ],
    mapping: { A: "direct", B: "reflective", C: "warm", D: "measured", E: "perceptive" } as Record<string, ProfileType>,
  },
  {
    text: "What do you most want to improve right now?",
    options: [
      { label: "A", text: "Staying calm" },
      { label: "B", text: "Understanding people better" },
      { label: "C", text: "Repairing conflict" },
      { label: "D", text: "Setting boundaries" },
      { label: "E", text: "Speaking up sooner" },
    ],
    // Question 9 — routing only, not profile scoring
    mapping: null,
  },
];

const GOAL_MAPPING: Record<string, ImprovementGoal> = {
  A: "staying_calm",
  B: "understanding_people",
  C: "repairing_conflict",
  D: "setting_boundaries",
  E: "speaking_up",
};

function scoreProfile(answers: (string | null)[]): ProfileResult {
  const scores: Record<ProfileType, number> = {
    direct: 0,
    reflective: 0,
    warm: 0,
    measured: 0,
    perceptive: 0,
    intense: 0,
  };

  // Score questions 1-8 (index 0-7), 2 points each
  for (let i = 0; i < 8; i++) {
    const answer = answers[i];
    if (!answer) continue;
    const mapping = QUESTIONS[i].mapping;
    if (!mapping) continue;
    const profile = mapping[answer];
    if (profile) scores[profile] += 2;
  }

  // Sort by score descending
  const sorted = (Object.entries(scores) as [ProfileType, number][]).sort(
    (a, b) => b[1] - a[1]
  );

  let primary = sorted[0][0];
  const secondary = sorted[1][1] > 0 ? sorted[1][0] : null;

  // Tie-break: use Q8, Q7, Q6, Q5, Q4 in order
  if (sorted[0][1] === sorted[1][1]) {
    const tieBreakers = [7, 6, 5, 4, 3]; // question indices
    for (const qi of tieBreakers) {
      const answer = answers[qi];
      if (!answer) continue;
      const mapping = QUESTIONS[qi].mapping;
      if (!mapping) continue;
      const profile = mapping[answer];
      if (profile === sorted[0][0] || profile === sorted[1][0]) {
        primary = profile;
        break;
      }
    }
  }

  // Question 9 — improvement goal
  const q9Answer = answers[8];
  const improvementGoal: ImprovementGoal = q9Answer
    ? GOAL_MAPPING[q9Answer] || "staying_calm"
    : "staying_calm";

  // Route to starting module based on goal
  let recommendedModule: "prepare" | "review" | "repair" = "prepare";
  if (improvementGoal === "repairing_conflict") {
    recommendedModule = "repair";
  } else if (improvementGoal === "understanding_people") {
    recommendedModule = "review";
  }

  return { primary, secondary, scores, improvementGoal, recommendedModule };
}

const PROFILE_DESCRIPTIONS: Record<ProfileType, { strength: string; stress: string }> = {
  direct: {
    strength: "You bring clarity, honesty, and straightforward energy.",
    stress: "You can push too hard, over-explain, or come across as blunt.",
  },
  reflective: {
    strength: "You bring perspective, thoughtfulness, and restraint.",
    stress: "You can overthink, delay, or say less than you mean.",
  },
  warm: {
    strength: "You bring empathy, care, and emotional safety.",
    stress: "You can over-accommodate, avoid conflict, or lose your own needs.",
  },
  measured: {
    strength: "You bring steadiness, calm, and emotional control.",
    stress: "You can withdraw, shut down, or become hard to read.",
  },
  perceptive: {
    strength: "You bring awareness, intuition, and emotional depth.",
    stress: "You can over-interpret, assume, or react to things not yet confirmed.",
  },
  intense: {
    strength: "You bring passion, emotional honesty, and presence.",
    stress: "You can escalate, flood, or overwhelm the other person.",
  },
};

export default function OnboardingPage() {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<(string | null)[]>(
    new Array(9).fill(null)
  );
  const [result, setResult] = useState<ProfileResult | null>(null);
  const router = useRouter();

  function handleAnswer(option: string) {
    const newAnswers = [...answers];
    newAnswers[currentQuestion] = option;
    setAnswers(newAnswers);

    if (currentQuestion < 8) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      // All 9 answered — score it
      const profileResult = scoreProfile(newAnswers);
      setResult(profileResult);
    }
  }

  // Result screen
  if (result) {
    const desc = PROFILE_DESCRIPTIONS[result.primary];
    const moduleLabel =
      result.recommendedModule === "prepare"
        ? "Prepare"
        : result.recommendedModule === "review"
          ? "Review"
          : "Repair";

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-6">
        <div className="w-full max-w-sm text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-zinc-400">
            Your Communication Profile
          </p>
          <h1 className="mt-3 text-3xl font-bold capitalize text-zinc-900">
            {result.primary}
          </h1>

          <div className="mt-8 space-y-4 text-left">
            <div>
              <p className="text-sm font-medium text-zinc-500">At your best</p>
              <p className="mt-1 text-sm text-zinc-700">{desc.strength}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-500">Under stress</p>
              <p className="mt-1 text-sm text-zinc-700">{desc.stress}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-500">
                Best place to start
              </p>
              <p className="mt-1 text-sm text-zinc-700">{moduleLabel}</p>
            </div>
          </div>

          <button
            onClick={() => router.push("/signup")}
            className="mt-10 flex h-12 w-full items-center justify-center rounded-full bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            Try a 60-second {moduleLabel}
          </button>

          <button
            onClick={() => {
              setResult(null);
              setCurrentQuestion(0);
              setAnswers(new Array(9).fill(null));
            }}
            className="mt-3 text-sm text-zinc-400 underline"
          >
            This doesn&apos;t feel right
          </button>
        </div>
      </div>
    );
  }

  // Quiz screen
  const question = QUESTIONS[currentQuestion];

  return (
    <div className="flex min-h-dvh flex-col bg-white px-6 pb-12 pt-16">
      <div className="mx-auto w-full max-w-sm">
        {/* Progress */}
        <div className="flex items-center gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= currentQuestion ? "bg-zinc-900" : "bg-zinc-200"
              }`}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-400">
          {currentQuestion + 1} of 9
        </p>

        {/* Question */}
        <h2 className="mt-8 text-lg font-semibold leading-snug text-zinc-900">
          {question.text}
        </h2>

        {/* Options */}
        <div className="mt-6 space-y-3">
          {question.options.map((option) => (
            <button
              key={option.label}
              onClick={() => handleAnswer(option.label)}
              className="flex w-full items-start gap-3 rounded-xl border border-zinc-200 p-4 text-left text-sm text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50 active:bg-zinc-100"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-xs font-medium text-zinc-400">
                {option.label}
              </span>
              <span>{option.text}</span>
            </button>
          ))}
        </div>

        {/* Back button */}
        {currentQuestion > 0 && (
          <button
            onClick={() => setCurrentQuestion(currentQuestion - 1)}
            className="mt-6 text-sm text-zinc-400 underline"
          >
            Back
          </button>
        )}
      </div>
    </div>
  );
}
