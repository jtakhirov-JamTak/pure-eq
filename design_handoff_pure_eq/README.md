# Handoff: Pure EQ — App Redesign (Soft Pastel / Sky & Clouds)

## Overview

Pure EQ is a mobile-first emotional intelligence coaching PWA. This handoff covers a visual redesign into a **soft-pastel, sky-and-clouds** direction — warm, approachable, human. The goal is to replace the current UI while keeping every flow, copy, and data model already implemented in `jtakhirov-JamTak/pure-eq` (the source repo this work was based on).

12 core screens are specced. 5 of them (Coach hub, Prepare voice step, Tools hub, Overwhelmed regulate, Insights) use a more stylized "cloud" treatment with a cartoony cloud logo; the remaining 7 use a flatter but visually coherent pastel treatment.

## About the Design Files

The HTML/JSX files in this bundle are **design references**, not production code. They render as React components using Babel-in-browser and inline styles — intentionally self-contained for preview, not intended to be lifted verbatim.

Your task: **recreate these designs in the existing Pure EQ Next.js 15 / Tailwind codebase** using its established patterns (server components, app router, Supabase auth, the existing `app-shell.tsx` tab bar, etc.). All screens here correspond 1:1 to pages that already exist in `src/app/` — you're re-skinning, not re-architecting.

## Fidelity

**High-fidelity.** Exact hex colors, type ramps, spacing, radii, and shadows are specified below. Recreate pixel-perfectly using Tailwind (+ `@theme` tokens) and the existing component conventions in the codebase.

## Design Tokens

### Palette — "Soft Pastel" (primary)

| Token          | Hex       | Usage                                  |
|----------------|-----------|----------------------------------------|
| `--sky-hi`     | `#D6EEFF` | Top of vertical gradients              |
| `--sky-mid`    | `#A9D9FF` | Mid-stop of gradients                  |
| `--brand`      | `#4FB0FF` | Primary CTA, active chips, accents     |
| `--brand-deep` | `#2A86E3` | Hover / pressed, deep accents          |
| `--ink`        | `#0E2748` | Primary text                           |
| `--ink-soft`   | `#4A5E82` | Secondary text                         |
| `--ink-muted`  | `#8AA0C2` | Tertiary text, captions                |
| `--surface`    | `#FFFFFF` | Cards                                  |
| `--surface-tint` | `#EEF8FF` | Raised alt surfaces                   |
| `--chip-bg`    | `#EEF8FF` | Chip backgrounds, subtle hover         |
| `--warm`       | `#FFD166` | Warm accent (Review pill, highlights)  |
| `--warm-soft`  | `#FFF1CA` | Warm-accent surfaces                   |
| `--hair`       | `rgba(14,39,72,0.08)` | Hairline dividers           |
| `--danger`     | `#D95F5F` | Error, destructive                     |
| `--trigger`    | `#F39423` | Triggered-flow accent (warm orange)    |

### Type

- **Sans (body, UI):** `"DM Sans", Inter, -apple-system, system-ui, sans-serif`
- **Display (headings):** `"Fraunces", "DM Serif Display", Georgia, serif` — regular weight, used with `font-style: italic` for emphasis
- **Cloud logo wordmark (only):** `"Fredoka"`, 700 weight, chunky with 1.2px navy stroke and drop shadow

Scale (px / line-height):

| Role                | Size | Weight | LH   | Tracking |
|---------------------|------|--------|------|----------|
| Display XL (page H) | 32–34 | 400 display | 1.08–1.15 | −0.9 |
| Display L           | 26–28 | 400 display | 1.12 | −0.6 |
| Display M           | 22    | 400 display | 1.15 | −0.4 |
| Display S (card)    | 18–20 | 400 display | 1.2  | −0.3 |
| Body L              | 14–15 | 500        | 1.5  | −0.1 |
| Body                | 13    | 500        | 1.45–1.5 | 0 |
| Caption             | 11–12 | 600–700    | 1.4  | 0.5–1.5 uppercase |

Italic is used narratively inside display text — e.g. *"What do you need today?"* — always via `<span style="font-style: italic">`.

### Radii

- Card primary: `28px`
- Card secondary: `22px`
- Card small: `20px`
- Chip / pill: `100px` (fully rounded)
- Icon tile: `14px`
- Avatar: `50%` circle

### Shadows

```css
--card-shadow: 0 14px 30px rgba(20,60,130,0.14);
--soft-shadow: 0 4px 12px rgba(20,60,130,0.08);
--cta-glow:    0 10px 24px rgba(79,176,255,0.60);   /* brand button */
--dark-glow:   0 16px 36px rgba(14,39,72,0.40);     /* dark CTA cards */
```

### Spacing

Base unit `4px`. Page horizontal padding `22px`. Vertical section gaps `14–24px`. Bottom safe-area `28px`.

### Gradients (backgrounds)

| Variant   | Stops                                                        |
|-----------|--------------------------------------------------------------|
| `default` | `sky-hi 0% → sky-mid 55% → brand 100%`                       |
| `deep`    | `sky-mid 0% → sky-hi 55% → #FFFFFF 100%`                     |
| `warm`    | `sky-hi 0% → #FFF1E5 55% → #FFFFFF 100%`                     |

### Cloud scatter motif

Decorative fluffy clouds are layered behind content on cloud-treatment screens (Coach hub, Tools hub, Paywall). SVG, pure white, soft drop, 0.5–0.9 opacity, optional blur 2px. Used **sparingly** — 2 per screen max, behind the primary content.

---

## Screens

Each screen below maps to an existing page in `src/app/`. All copy is lifted directly from the real code — do not change wording.

### 1 · Coach hub — `src/app/(app)/coach/page.tsx`

**Purpose:** Main landing tab. User picks Prepare / Review / Repair, sees active conversations.

**Layout (top → bottom):**
1. Top row · 60px top padding, 22px sides
   - Left: wordmark (`<CloudLogo/>` + "Pure EQ" in Fredoka cloud type, 16px)
   - Right: 36×36 circle avatar with initial
2. Headline block · display XL: **"Hi, Maya."** / *"What do you need today?"* (italic). Subhead body L: "Prepare, Review, or Repair a conversation."
3. **Prepare card** — primary, full width
   - White surface, 28px radius, 20px padding, card-shadow
   - Pill: "PREPARE" (uppercase, brand bg, white text) + caption "· 9 steps"
   - Display L: "A conversation is *coming up*."
   - Body: "Get clear on what you want, and how to land it."
4. **Review + Repair** — 2-col grid, 10px gap
   - White surface, 22px radius, 16px padding, soft-shadow, min-height 108px
   - Review: warm-soft pill "REVIEW" + italic display "Reflect" + "A conversation just happened."
   - Repair: chip-bg pill "REPAIR" + italic display "Mend" + "Something went sideways."
5. **Active conversations** — white card, 20px radius, soft-shadow
   - Caption label "ACTIVE CONVERSATIONS" (ink-muted) + "See all" link (brand)
   - Rows: 6px colored dot, name + relationship (ink 13px 600), status (ink-muted 11px)
   - Hairline between rows
6. **Tab bar** — 48px pill, white/90 + blur, 3 segments: Coach / Tools / Insights. Active segment = brand fill + white text + `cta-glow`.

**Cloud scatter:** 3 clouds — top-left (130px, 0.9 opacity), top-right (90px, 0.85), mid-left (110px, 0.5 opacity, blur 2px).

---

### 2 · Prepare — step 1 (Person picker) — `src/app/(app)/coach/prepare/page.tsx`

**Purpose:** Pick which person this conversation is with.

**Layout:**
- Top bar: back chevron tile (40×40, white, soft-shadow) · centered caption "PREPARE · 1 OF 9" · step dots (9 dots, current = 22px brand pill, others = 5px 20%-ink)
- Headline: display L "Who is this *with*?"
- Subhead: "Pick someone from your circle, or add new."
- Person list card (white, 22px radius, 6px padding, soft-shadow)
  - Rows: 36px colored avatar circle · name (15px 600) + relationship (12px muted 500) · selected row shows a 20px brand circle with white check
  - Selected row bg = chip-bg, others transparent. Hairline between.
- Dashed "+ Add someone new" card: rgba(255,255,255,0.6), 1.5px dashed hair border, centered
- Footer CTA: 54px, brand fill, white, 700, `cta-glow`, "Continue"

---

### 3 · Prepare — outcome step — `src/app/(app)/coach/prepare/page.tsx`

**Purpose:** User types (or voice-dictates) their desired outcome for the conversation.

**Layout:**
- Top bar with step-dots at step 4 of 9
- Tiny label: "DESIRED OUTCOME" (ink-muted, uppercase, 11px, tracking 1.2)
- Headline: display L "If this goes well, / *what's different* after?"
- Subhead: "One sentence. Specific, not 'better.'"
- Input card (white, 22px radius, 18px padding, card-shadow, min-height 180)
  - Typed text in body 15.5px with a blinking brand caret (animation `caret 1.1s ease-in-out infinite`, keyframe: `50% { opacity: 0.25 }`)
  - Footer row separated by hair:
    - Left: chip-bg pill containing a voice waveform (10 animated bars, 2–14px tall, brand color) and tabular "0:12"
    - Right: "72 / 240" character counter (ink-muted 11px)
- Suggestion chips row: caption "STUCK? TRY" + 4 soft-shadow pills with example outcomes
- Footer CTA: "Continue"

**Voice waveform component:** 10 vertical bars, width 2px, randomized heights 2–14px, 1px border-radius, brand color, animating in staggered `scaleY` between 0.3–1.0.

---

### 4 · Prepare — feedback — `src/app/(app)/coach/prepare/page.tsx` (results view)

**Purpose:** AI coach output after user completes 9 steps. Three cards: reality-check, one-thing-not-to-do, best-next-move.

**Layout:** `deep` gradient background.
- Top bar: "PREPARE · COMPLETE"
- Headline: "Here's what *might help*." + subhead "Based on what you shared · for Dad"
- **Card 1 · Reality-check** — white, 22r, card-shadow
  - 22px chip-bg circle with "?" (brand-deep 11px 700)
  - Caption "REALITY-CHECK QUESTION"
  - Display S: "You assume he's *criticizing*. What if he's *worried*?"
- **Card 2 · One thing not to do** — white, 22r, `border-left: 3px solid danger`
  - Danger-tinted 22×22 icon with ✕
  - Caption "ONE THING NOT TO DO"
  - Body: "Don't open with 'you always.' It puts him on defense before you've even named what you want."
- **Card 3 · Best next move** — brand fill, white text, 22r, strong shadow
  - White-alpha icon circle with ★
  - Caption "BEST NEXT MOVE" (white 85% opacity)
  - Display S: "Name what you need *before* the dinner."
  - Body: suggested dialogue in quotes
- Footer: 2-button row — "Save thread" (white 80%, ink) flex 1 · "I'm ready →" (ink fill, white) flex 2

---

### 5 · Threads — new screen, wire into coach hub "See all"

**Purpose:** List of every active conversation the user is tracking.

**Layout:**
- Top bar: back · "THREADS"
- Headline: display XL "Conversations in *motion*."
- Filter chips: "All · Open · Stabilizing · Resolved" — active = ink fill white text, rest = white soft-shadow
- Card list (white, 22r, card-shadow)
  - Row: 8px colored status dot · name (14px 700) + meta "4 entries · stabilizing" (11px muted) · relative date (11px muted)
  - Hairline between rows
- Tab bar at bottom (Coach active)

---

### 6 · Tools hub — `src/app/tools/page.tsx`

**Purpose:** Two emergency tools — Overwhelmed and Triggered.

**Layout:**
- 60px top padding
- Warm-fill pill label: "WHEN IT'S A LOT" (uppercase, warm bg, white text)
- Headline: display XL "Two tools for when *emotions hit hard*."
- **I'm Overwhelmed card** — deep gradient (brand-deep → #1A4A8F), white text, 28r
  - Caption "~4 MIN · GUIDED"
  - Display L "I'm *overwhelmed*"
  - Body "Feel, label, validate, regulate, move."
  - 5 step pills: Feel · Label · Validate · Regulate · Move (rgba(255,255,255,0.18), 11px 700)
- **I'm Triggered card** — slate gradient (#3A4A66 → #1F2A42), white text, 28r
  - Caption "7 STEPS · REFLECT"
  - Display L "I'm *triggered*"
  - Body "Catch the spark before it becomes a fire."
  - 5 step pills: Fact · Story · Emotion · Urge · Outcome
- Tab bar (Tools active)

**Important:** Both cards are the same height. Achieved by matching pill count and body length.

---

### 7 · Overwhelmed · Feel (step 3) — `src/app/tools/overwhelmed/overwhelmed-client.tsx`

**Purpose:** 31-second guided body scan. User taps where they feel the emotion.

**Layout:** `deep` background.
- Top bar: back · "STEP 3 · FEEL"
- Headline: "Where do you *feel it* in your body?" + subhead "31 seconds. Just notice — no fixing."
- **Body scan card** — white, 26r, card-shadow, horizontal flex
  - Left: SVG body silhouette (130×220) in chip-bg fill; chest hotspot `warm` 16r + halo 22r; throat hotspot `brand` 8r
  - Right: caption "TAP WHERE" + 5 rows: "Chest · tight" (selected, warm), "Throat · lump" (selected, brand), "Stomach / Head / Shoulders" (off). Selected = 6px colored dot + tinted bg + bold ink.
- **Timer ring** — centered, 120×120. SVG `rotate(-90deg)`. Background track = hair stroke 6, progress stroke = brand 6, `strokeDasharray` / `strokeDashoffset` computed from circumference. Inside: italic display "0:20" (tabular) + caption "OF 0:31".
- Footer CTA: "Skip step" (white 70%, ink, 50px, hair border)

---

### 8 · Overwhelmed · Regulate (step 4) — `src/app/tools/overwhelmed/overwhelmed-client.tsx`

**Purpose:** 61-second box-breathing guide. Cloud expands/contracts with breath.

**Layout:** `default` background, centered layout.
- Top bar: back · "STEP 4 · REGULATE"
- **Breathing cloud** — 240×200 SVG (5 overlapping white circles + base pill + soft ellipse shadow). Drop-shadow filter `0 20px 30px rgba(14,39,72,0.20)`. Scales `1.0 → 1.15 → 1.0` over 14s (4-4-6 cycle) via CSS keyframes.
- Centered overlay text on cloud:
  - Caption "INHALE · 4" (letter-spacing 2.5, 60% opacity)
  - Italic display `0:32` 48px tabular
  - Micro "of 1:01"
- Below cloud: display M "In for 4, hold 4, *out for 6*." + body "You don't need to do this perfectly. Just slowly."
- Footer: "Skip step"

**Animation:** `@keyframes breathe { 0%,100% { transform: scale(1) } 28%,50% { transform: scale(1.15) } }` over 14s infinite, ease-in-out.

---

### 9 · Triggered · Emotion (step 3 of 7) — `src/app/tools/triggered/triggered-client.tsx`

**Purpose:** User picks closest emotion word and rates intensity 1–10.

**Layout:** `deep` background (not warm — matches Overwhelmed Feel).
- Top bar: "STEP 3 OF 7"
- Headline: "What's the *emotion*?" + subhead "Pick the closest word, then rate intensity."
- Emotion chips: Angry / Hurt / Anxious / Ashamed / Sad / Disappointed
  - Selected: `#F39423` bg, white text, glow `0 8px 18px #F3942350`
  - Others: white surface, soft-shadow, ink text
- Intensity card (white, 22r, card-shadow, 20px padding)
  - Caption "INTENSITY"
  - Slider: 10px rail, chip-bg track. Filled portion `linear-gradient(90deg, brand 0%, #F39423 100%)` 72% width. Thumb: 28×28 white circle, 2.5px `#F39423` border, card-shadow.
  - Below: "slightly" (muted) · display "**7** / 10" (tabular) · "very" (colored #F39423 700)
- CTA: `#F39423` fill, white, "Continue", `cta-glow` computed with #F39423

**Note:** The Triggered-flow accent color is `#F39423` (warm orange-yellow). Isolated to this flow — do not apply globally.

---

### 10 · Insights — `src/app/(app)/insights/page.tsx`

**Purpose:** User's communication style + main pattern + a per-person pattern. Data-driven from backend.

**Layout:** `deep` background.
- 60px top padding
- Brand-fill pill: "LAST 28 DAYS · 12 ENTRIES"
- Headline: display XL "Your *patterns* are who you are."
- **Card 1 · Your Style** — white, 24r
  - Caption "YOUR STYLE"
  - 48px brand-fill circle with italic display "W" (white) · display S "Withdrawer" · "Secondary: Peacekeeper" (warm 700)
  - Body: "You pull back under stress to protect the room. It preserves the peace — and often hides what you need."
- **Card 2 · Your Main Pattern** — white, 24r
  - Caption "YOUR MAIN PATTERN" + "ESTABLISHED" (brand, right-aligned)
  - Display S: "You *withdraw* when you feel criticized."
  - Body: "Seen in 7 of 12 entries. Strongest with Dad."
  - 12-bar frequency chart, last 3 bars = brand, rest = chip-bg. Height = data × 3.6px.
  - Inline callout (warm-soft bg, 12r): "**Shift noticed:** last 3 entries, you paused before withdrawing."
- **Card 3 · With Dad** — ink → brand-deep linear gradient, white text, 24r
  - Caption "WITH DAD"
  - Display S: "Comments on food → you go *quiet*." (with "quiet" in warm italic)
  - Body: "4 of 5 dinners. Emerging — keep logging to confirm."
- Tab bar (Insights active)

---

### 11 · Onboarding · Communication Profile result — `src/app/onboarding/onboarding-client.tsx`

**Purpose:** End-of-onboarding result page showing user's primary style.

**Layout:** `deep` background.
- 60px top padding
- Tiny caption: "YOUR COMMUNICATION PROFILE"
- Headline: display XL "You're a *Withdrawer*." + subhead "With notes of Peacekeeper."
- **At your best** — white 20r, `border-left: 3px brand`
  - Caption "AT YOUR BEST" (brand)
  - Body: "You read rooms well. You don't need to win — you want everyone to feel okay."
- **Under stress** — white 20r, `border-left: 3px warm`
  - Caption "UNDER STRESS" (warm)
  - Body: "You go quiet and hope it passes. The other person often reads silence as agreement — or anger."
- **Best place to start** — ink fill, white text, 20r
  - Caption "BEST PLACE TO START" (70% opacity)
  - Display S: "Try '*I'm Overwhelmed*' next time you notice yourself pulling back."
  - Body: "It'll help you stay in the room."
- CTA: brand fill "Start with Overwhelmed →"

---

### 12 · Paywall — `src/app/paywall/paywall-content.tsx`

**Purpose:** End of 7-day trial. Two plans, annual highlighted.

**Layout:** `default` background, cloud scatter behind.
- 60px top padding, centered
- 56px `<CloudLogo/>` mark
- Headline: display L "Keep going with / *Pure EQ Premium*."
- Subhead: "Your free 7-day window ends today."
- **Features list** — white 20r, soft-shadow
  - Each row: 20px brand circle with white check · body "…"
  - Features: Unlimited Prepare, Review, Repair · Unlimited Overwhelmed & Triggered · Full Insights — your style, patterns, people · Private, on-device. No accounts.
  - Hairline between
- **Annual plan card** (primary) — white 22r, card-shadow, **2px brand border**
  - Absolutely-positioned ribbon top-right: brand fill "BEST VALUE · SAVE 35%"
  - Left: "Annual" 14px 700 + "$5.83/mo billed yearly" 11 muted
  - Right: display "$69.99"
- **Monthly plan card** — white 22r, soft-shadow, 1px hair border
  - "Monthly" + "Cancel anytime" + "$8.99"
- CTA: ink fill white text "Start Premium" · below, centered muted "Maybe later"

---

## Interactions & Behavior

- **Tab bar:** active segment animates (200ms ease) between positions; use layoutId or CSS-only width+translate.
- **Step dots:** current segment is 22px wide, others 5px — animate width change over 400ms `cubic-bezier(.2,.8,.2,1)`.
- **Breathing cloud (Regulate):** 14s loop, ease-in-out, scale 1.0 → 1.15 → 1.0.
- **Voice waveform:** 10 bars, each animating staggered `scaleY` 0.3–1.0 over 600–900ms.
- **Caret blink:** `@keyframes caret { 50% { opacity: 0.25 } }` 1.1s ease-in-out infinite.
- **Cloud scatter:** static. No parallax.
- **CTA buttons:** press = scale(0.98), shadow softens; tap uses `:active`.
- **Cards:** press → translate y 1px, shadow compresses.

## State Management

Data already modeled in the existing codebase (Supabase + server actions). No new state needed — this is a re-skin. Surfaces to keep in sync:

- `CoachHub` reads active conversations, 2 rows visible + "See all" → Threads
- `Prepare` is a 9-step stateful wizard; step 4 is the voice-dictatable outcome. Persist draft per-person in the existing table.
- `Tools/Overwhelmed` is a 5-step timed flow; step 3 = Feel (31s), step 4 = Regulate (61s).
- `Tools/Triggered` is a 7-step reflection flow; step 3 = Emotion + intensity (0–10).
- `Insights` data: user style (primary + secondary), main pattern (name + count + sparkline array + "shift noticed" callout), per-person patterns.
- `Paywall` is gated by existing trial-status logic.

## Assets

- **Cloud logo:** SVG composed of 5 overlapping circles + base pill + bottom shadow ellipse. Source in `directionB.jsx` → `CloudLogo` component (lines ~25–65). Re-draw as a reusable Next.js component at `src/components/brand/cloud-logo.tsx`.
- **Cloud scatter:** 5-circle white SVG, same structure, no colored shadow. Reusable positional component with `x`, `y`, `size`, `opacity`, `blur` props.
- **Cloud wordmark:** "Pure EQ" rendered in Fredoka 700 with `WebkitTextStroke: 1.2px #0E2748` and `text-shadow: 0 2px 0 rgba(14,39,72,0.3), 0 4px 10px rgba(14,39,72,0.3)`, `paintOrder: stroke fill`.
- **No raster images** — everything is SVG + CSS.

## Fonts

Google Fonts imports (add to `app/layout.tsx` or equivalent):

```ts
import { DM_Sans, Fraunces, Fredoka } from 'next/font/google';

const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400','500','600','700'] });
const fraunces = Fraunces({ subsets: ['latin'], weight: ['400','500'], style: ['normal','italic'] });
const fredoka = Fredoka({ subsets: ['latin'], weight: ['700'] });
```

## Files

Design references included in this bundle (open in a browser after extracting):

- `SpeakEasy Directions.html` — the full design canvas with all 12 real screens + the earlier exploration directions. Open in a browser to pan/zoom and focus any artboard. You'll want to run it from a static server (`python -m http.server`, `npx serve`) so the JSX modules load.
- `realScreensCoach.jsx` — screens 1–5
- `realScreensTools.jsx` — screens 6–9
- `realScreensInsights.jsx` — screens 10–12
- `realScreens.jsx` — shared palette + helpers (`R_Bg`, `R_TabBar`, `R_TopBar`, `R_StepDots`, `R_Scatter`, `R_Mark`, `R_Wordmark`)
- `directionB.jsx` — the stylized cloud direction for screens 1, 3, 6, 8, 10. Contains `CloudLogo`, `Scatter`, `B_TabBar` primitives that the final implementation should lift.
- `ios-frame.jsx` — iPhone bezel shell used for preview only (not needed in production)
- `design-canvas.jsx` — canvas harness (not needed in production)

## Notes for the Developer

1. **Tailwind config:** add the tokens above as CSS vars in `globals.css` under `@theme`. Reference them via `bg-[--brand]` / `text-[--ink]` or map to named keys.
2. **Don't change copy.** Every headline, subhead, and microcopy string is already the real product voice — match character-for-character including the italic emphasis inside display text.
3. **Italic-in-display is a brand signature.** When you see an italic span inside a display heading, preserve it — it's the editorial fingerprint that keeps the pastel from feeling juvenile.
4. **Keep breathing on the cloud animation.** Don't linearize it. The asymmetric 4-4-6 ratio is doing the emotional work — reduce-motion users get a still cloud.
5. **Respect `prefers-reduced-motion`** everywhere: waveforms, breathing, step-dot widening, caret.
6. **Accessibility:** minimum 4.5:1 on body text. Light-on-light is the main trap — in particular `ink` on `sky-hi` = ok, but white text must only be on `brand`, `brand-deep`, `ink`, or the dark-gradient cards.

## Out of scope (not in this bundle)

- Review flow (post-conversation questionnaire)
- Repair flow (draft-a-message)
- Settings
- Sign-in / auth screens
- Admin
- Empty states / error states
- iPad / web-wide breakpoints

Ask the designer if you need these before implementing — don't infer.
