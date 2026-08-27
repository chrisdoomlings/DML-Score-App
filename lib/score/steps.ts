/**
 * The 4 scoring steps (World's End, Face Value, Bonus Points, Expansion
 * Points) — admin-editable heading + description text, JSONB merged over
 * DEFAULT_STEPS the same way score_settings.achievements works (see
 * lib/score/achievements.ts's mergeAchievementConfig). Trigger order/logic
 * (STEPS in dmls-score.js: key/min/exp) is NOT here and NOT configurable —
 * this only covers the player-facing copy. Each step's background image is
 * a separate score_settings.images entry (bgWe/bgFv/bgBp/bgExp), not part
 * of this JSONB blob.
 */

export const STEP_KEYS = ["we", "fv", "bp", "mp"] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export interface StepDef {
  preHeading: string; // optional small tag rendered above heading (e.g. "RESOLVE", "OPTIONAL"); empty = hidden
  heading: string;
  sub: string;
}

export type StepConfig = Record<StepKey, StepDef>;

export const DEFAULT_STEPS: StepConfig = {
  we: {
    preHeading: "RESOLVE",
    heading: "WORLD'S END EFFECTS",
    sub: "First, play World's End ➹ effects on traits in turn order. Then follow ONLY the gold text on the 3rd catastrophe, and enter any +/- points below.",
  },
  fv: {
    preHeading: "",
    heading: "TALLY FACE VALUE TOTALS",
    sub: "Add up the face value points for each player. Ignore bonus points with ⊕ & 💧 symbols for now.",
  },
  bp: {
    preHeading: "",
    heading: "ENTER ALL BONUS POINTS",
    sub: "Tally up all bonus points. Look for the Drop of Life 💧 symbol on the bottom right of each card.",
  },
  mp: {
    preHeading: "OPTIONAL",
    heading: "EXPANSION POINTS",
    sub: "Add all extra points for Suppressed Traits, Trinkets, Meaning of Life, and Class Bonuses.",
  },
};

/** Merge stored JSONB (possibly partial/stale keys) over the defaults. */
export function mergeStepConfig(stored: unknown): StepConfig {
  const out = {} as StepConfig;
  const src = (typeof stored === "object" && stored !== null ? stored : {}) as Record<string, Partial<StepDef>>;
  for (const key of STEP_KEYS) {
    const d = DEFAULT_STEPS[key];
    const s = src[key] ?? {};
    out[key] = {
      preHeading: typeof s.preHeading === "string" ? s.preHeading.trim().slice(0, 30) : d.preHeading,
      heading: sanitizeText(s.heading, 80) ?? d.heading,
      sub: sanitizeText(s.sub, 300) ?? d.sub,
    };
  }
  return out;
}

function sanitizeText(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim().slice(0, max);
  return trimmed || undefined;
}
