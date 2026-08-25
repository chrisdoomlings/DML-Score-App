import { getDb, jsonb } from "@/lib/supabase/client";
import { mergeAchievementConfig, type AchievementConfig } from "@/lib/score/achievements";
import { mergeStepConfig, type StepConfig } from "@/lib/score/steps";
import { sanitizeImageUrl } from "@/lib/score/imageUrl";

export const IMAGE_KEYS = [
  "worldsend",
  "compass",
  "drop",
  "suppress",
  "characters",
  "winner",
  "bg",
  "bgExp",
  "bgWe",
  "bgFv",
  "bgBp",
  "logo",
  "bgWinner",
  "beeNormal",
  "beeHover",
  "fishNormal",
  "fishHover",
  "trophyBg",
] as const;

export type ImageKey = (typeof IMAGE_KEYS)[number];
export type ImageUrls = Record<ImageKey, string>;

export interface ScoreSettings {
  achievements: AchievementConfig;
  guessEnabled: boolean;
  guessGapMax: number; // max point gap between 1st and 2nd for a game to count as "close"
  guessEveryN: number; // offer the mini-game every Nth logged game per customer
  images: ImageUrls; // empty string per key = use the bundled default asset ("logo" has no default — empty hides it)
  tipText: string; // shown in the home-screen tip bar; empty = hidden
  homeHeading: string; // welcome screen heading; empty = fall back to the theme block's data-heading
  logoWidth: number; // px; applies to the logo on both the home and winner screens
  cardMinHeight: number; // px; floor height for the score card — grows past this if content needs more room
  winnerImageSize: number; // px; max-width of the winner reveal art
  charactersWidth: number; // px; welcome-screen character illustration — can exceed the card width to bleed off the edges (card clips via overflow:hidden)
  headingWidth: number; // px; max-width of the welcome heading, controls line wrapping
  headingFontSize: number; // px
  discordUrl: string; // winner-screen "Join us on Discord" banner link; empty = banner hidden
  trophyHeading: string; // trophy screen heading — the loser names/"did not" line is always dynamic, this wraps it
  trophySubheading: string; // trophy screen caption shown after the loser names (e.g. "Did Not.")
  trophyTagline: string; // optional second line shown between the loser names and trophySubheading; empty = hidden
  trophyActionsBg: string; // hex color behind the trophy screen's action buttons; empty = transparent (card's own default background)
  steps: StepConfig; // per-step heading/description for the 4 scoring screens; backgrounds are images.bgWe/bgFv/bgBp/bgExp
  trophyTopImages: string[]; // pool of trophy-graphic designs; storefront picks one at random per "Generate Trophy" (client spec — variety, not a single fixed design)
}

const DEFAULTS = {
  guessEnabled: true,
  guessGapMax: 10,
  guessEveryN: 3,
  tipText: "Tip: add Google’s keyboard if your phone doesn’t have a minus “-” symbol.",
  homeHeading: "",
  discordUrl: "",
  trophyHeading: "Won The End Of The World!",
  trophySubheading: "Did Not.",
  trophyTagline: "",
  trophyActionsBg: "",
  logoWidth: 220,
  cardMinHeight: 560,
  winnerImageSize: 260,
  charactersWidth: 320,
  headingWidth: 320,
  headingFontSize: 32,
};

const EMPTY_IMAGES: ImageUrls = {
  worldsend: "", compass: "", drop: "", suppress: "", characters: "", winner: "", bg: "", bgExp: "", logo: "", bgWinner: "",
  bgWe: "", bgFv: "", bgBp: "",
  beeNormal: "", beeHover: "", fishNormal: "", fishHover: "",
  trophyBg: "",
};

export async function getSettings(shop: string): Promise<ScoreSettings> {
  const db = getDb();
  const rows = await db<
    {
      achievements: unknown;
      steps: unknown;
      guessEnabled: boolean;
      guessGapMax: number;
      guessEveryN: number;
      imageWorldsend: string;
      imageCompass: string;
      imageDrop: string;
      imageSuppress: string;
      imageCharacters: string;
      imageWinner: string;
      imageBg: string;
      imageBgExp: string;
      imageBgWe: string;
      imageBgFv: string;
      imageBgBp: string;
      imageLogo: string;
      imageBgWinner: string;
      imageBeeNormal: string;
      imageBeeHover: string;
      imageFishNormal: string;
      imageFishHover: string;
      imageTrophyBg: string;
      trophyTopImages: unknown;
      tipText: string;
      homeHeading: string;
      discordUrl: string;
      trophyHeading: string;
      trophySubheading: string;
      trophyTagline: string;
      trophyActionsBg: string;
      logoWidth: number;
      cardMinHeight: number;
      winnerImageSize: number;
      charactersWidth: number;
      headingWidth: number;
      headingFontSize: number;
    }[]
  >`
    SELECT achievements,
           steps,
           guess_enabled AS "guessEnabled",
           guess_gap_max AS "guessGapMax",
           guess_every_n AS "guessEveryN",
           image_worldsend  AS "imageWorldsend",
           image_compass    AS "imageCompass",
           image_drop       AS "imageDrop",
           image_suppress   AS "imageSuppress",
           image_characters AS "imageCharacters",
           image_winner     AS "imageWinner",
           image_bg         AS "imageBg",
           image_bg_exp     AS "imageBgExp",
           image_bg_we      AS "imageBgWe",
           image_bg_fv      AS "imageBgFv",
           image_bg_bp      AS "imageBgBp",
           image_logo       AS "imageLogo",
           image_bg_winner  AS "imageBgWinner",
           image_bee_normal  AS "imageBeeNormal",
           image_bee_hover   AS "imageBeeHover",
           image_fish_normal AS "imageFishNormal",
           image_fish_hover  AS "imageFishHover",
           image_trophy_bg   AS "imageTrophyBg",
           trophy_top_images AS "trophyTopImages",
           tip_text         AS "tipText",
           home_heading     AS "homeHeading",
           discord_url      AS "discordUrl",
           trophy_heading    AS "trophyHeading",
           trophy_subheading AS "trophySubheading",
           trophy_tagline    AS "trophyTagline",
           trophy_actions_bg AS "trophyActionsBg",
           logo_width       AS "logoWidth",
           card_min_height  AS "cardMinHeight",
           winner_image_size AS "winnerImageSize",
           characters_width  AS "charactersWidth",
           heading_width     AS "headingWidth",
           heading_font_size AS "headingFontSize"
    FROM score_settings WHERE shop = ${shop}
  `;
  const r = rows[0];
  return {
    achievements: mergeAchievementConfig(r?.achievements),
    steps: mergeStepConfig(r?.steps),
    guessEnabled: r?.guessEnabled ?? DEFAULTS.guessEnabled,
    guessGapMax: r?.guessGapMax ?? DEFAULTS.guessGapMax,
    guessEveryN: r?.guessEveryN ?? DEFAULTS.guessEveryN,
    tipText: r?.tipText ?? DEFAULTS.tipText,
    homeHeading: r?.homeHeading ?? DEFAULTS.homeHeading,
    discordUrl: r?.discordUrl ?? DEFAULTS.discordUrl,
    trophyHeading: r?.trophyHeading ?? DEFAULTS.trophyHeading,
    trophySubheading: r?.trophySubheading ?? DEFAULTS.trophySubheading,
    trophyTagline: r?.trophyTagline ?? DEFAULTS.trophyTagline,
    trophyActionsBg: r?.trophyActionsBg ?? DEFAULTS.trophyActionsBg,
    trophyTopImages: Array.isArray(r?.trophyTopImages)
      ? r.trophyTopImages.filter((u): u is string => typeof u === "string" && u.length > 0)
      : [],
    logoWidth: r?.logoWidth ?? DEFAULTS.logoWidth,
    cardMinHeight: r?.cardMinHeight ?? DEFAULTS.cardMinHeight,
    winnerImageSize: r?.winnerImageSize ?? DEFAULTS.winnerImageSize,
    charactersWidth: r?.charactersWidth ?? DEFAULTS.charactersWidth,
    headingWidth: r?.headingWidth ?? DEFAULTS.headingWidth,
    headingFontSize: r?.headingFontSize ?? DEFAULTS.headingFontSize,
    images: r
      ? {
          worldsend: r.imageWorldsend ?? "",
          compass: r.imageCompass ?? "",
          drop: r.imageDrop ?? "",
          suppress: r.imageSuppress ?? "",
          characters: r.imageCharacters ?? "",
          winner: r.imageWinner ?? "",
          bg: r.imageBg ?? "",
          bgExp: r.imageBgExp ?? "",
          bgWe: r.imageBgWe ?? "",
          bgFv: r.imageBgFv ?? "",
          bgBp: r.imageBgBp ?? "",
          logo: r.imageLogo ?? "",
          bgWinner: r.imageBgWinner ?? "",
          beeNormal: r.imageBeeNormal ?? "",
          beeHover: r.imageBeeHover ?? "",
          fishNormal: r.imageFishNormal ?? "",
          fishHover: r.imageFishHover ?? "",
          trophyBg: r.imageTrophyBg ?? "",
        }
      : EMPTY_IMAGES,
  };
}

export async function saveSettings(shop: string, s: Partial<ScoreSettings>): Promise<ScoreSettings> {
  const current = await getSettings(shop);
  const nextImages: ImageUrls = { ...current.images };
  if (s.images) {
    for (const key of IMAGE_KEYS) {
      if (typeof s.images[key] === "string") nextImages[key] = sanitizeImageUrl(s.images[key]);
    }
  }
  const next: ScoreSettings = {
    achievements: mergeAchievementConfig(s.achievements ?? current.achievements),
    steps: mergeStepConfig(s.steps ?? current.steps),
    guessEnabled: typeof s.guessEnabled === "boolean" ? s.guessEnabled : current.guessEnabled,
    guessGapMax: clampInt(s.guessGapMax ?? current.guessGapMax, 0, 9_999),
    guessEveryN: clampInt(s.guessEveryN ?? current.guessEveryN, 1, 100),
    images: nextImages,
    tipText: typeof s.tipText === "string" ? s.tipText.trim().slice(0, 280) : current.tipText,
    homeHeading: typeof s.homeHeading === "string" ? s.homeHeading.trim().slice(0, 120) : current.homeHeading,
    discordUrl: typeof s.discordUrl === "string" ? sanitizeExternalUrl(s.discordUrl) : current.discordUrl,
    trophyHeading: typeof s.trophyHeading === "string" ? s.trophyHeading.trim().slice(0, 120) || DEFAULTS.trophyHeading : current.trophyHeading,
    trophySubheading: typeof s.trophySubheading === "string" ? s.trophySubheading.trim().slice(0, 60) || DEFAULTS.trophySubheading : current.trophySubheading,
    trophyTagline: typeof s.trophyTagline === "string" ? s.trophyTagline.trim().slice(0, 120) : current.trophyTagline,
    trophyActionsBg: typeof s.trophyActionsBg === "string" ? sanitizeHexColor(s.trophyActionsBg) : current.trophyActionsBg,
    trophyTopImages: Array.isArray(s.trophyTopImages)
      ? s.trophyTopImages
          .filter((u): u is string => typeof u === "string")
          .map(sanitizeImageUrl)
          .filter(Boolean)
          .slice(0, 40)
      : current.trophyTopImages,
    logoWidth: clampInt(s.logoWidth ?? current.logoWidth, 40, 600),
    cardMinHeight: clampInt(s.cardMinHeight ?? current.cardMinHeight, 300, 1200),
    winnerImageSize: clampInt(s.winnerImageSize ?? current.winnerImageSize, 100, 500),
    charactersWidth: clampInt(s.charactersWidth ?? current.charactersWidth, 60, 900),
    headingWidth: clampInt(s.headingWidth ?? current.headingWidth, 100, 600),
    headingFontSize: clampInt(s.headingFontSize ?? current.headingFontSize, 14, 60),
  };
  const db = getDb();
  await db`
    INSERT INTO score_settings (
      shop, achievements, steps, guess_enabled, guess_gap_max, guess_every_n,
      image_worldsend, image_compass, image_drop, image_suppress, image_characters, image_winner, image_bg, image_bg_exp,
      image_bg_we, image_bg_fv, image_bg_bp,
      image_logo, image_bg_winner, image_bee_normal, image_bee_hover, image_fish_normal, image_fish_hover,
      image_trophy_bg, trophy_top_images,
      tip_text, home_heading, discord_url, trophy_heading, trophy_subheading, trophy_tagline, trophy_actions_bg, logo_width, card_min_height, winner_image_size,
      characters_width, heading_width, heading_font_size,
      updated_at
    )
    VALUES (
      ${shop}, ${jsonb(next.achievements)}, ${jsonb(next.steps)}, ${next.guessEnabled}, ${next.guessGapMax}, ${next.guessEveryN},
      ${next.images.worldsend}, ${next.images.compass}, ${next.images.drop}, ${next.images.suppress}, ${next.images.characters}, ${next.images.winner}, ${next.images.bg}, ${next.images.bgExp},
      ${next.images.bgWe}, ${next.images.bgFv}, ${next.images.bgBp},
      ${next.images.logo}, ${next.images.bgWinner}, ${next.images.beeNormal}, ${next.images.beeHover}, ${next.images.fishNormal}, ${next.images.fishHover},
      ${next.images.trophyBg}, ${jsonb(next.trophyTopImages)},
      ${next.tipText}, ${next.homeHeading}, ${next.discordUrl}, ${next.trophyHeading}, ${next.trophySubheading}, ${next.trophyTagline}, ${next.trophyActionsBg}, ${next.logoWidth}, ${next.cardMinHeight}, ${next.winnerImageSize},
      ${next.charactersWidth}, ${next.headingWidth}, ${next.headingFontSize},
      NOW()
    )
    ON CONFLICT (shop) DO UPDATE SET
      achievements     = EXCLUDED.achievements,
      steps            = EXCLUDED.steps,
      guess_enabled    = EXCLUDED.guess_enabled,
      guess_gap_max    = EXCLUDED.guess_gap_max,
      guess_every_n    = EXCLUDED.guess_every_n,
      image_worldsend  = EXCLUDED.image_worldsend,
      image_compass    = EXCLUDED.image_compass,
      image_drop       = EXCLUDED.image_drop,
      image_suppress   = EXCLUDED.image_suppress,
      image_characters = EXCLUDED.image_characters,
      image_winner     = EXCLUDED.image_winner,
      image_bg         = EXCLUDED.image_bg,
      image_bg_exp     = EXCLUDED.image_bg_exp,
      image_bg_we      = EXCLUDED.image_bg_we,
      image_bg_fv      = EXCLUDED.image_bg_fv,
      image_bg_bp      = EXCLUDED.image_bg_bp,
      image_logo       = EXCLUDED.image_logo,
      image_bg_winner  = EXCLUDED.image_bg_winner,
      image_bee_normal  = EXCLUDED.image_bee_normal,
      image_bee_hover   = EXCLUDED.image_bee_hover,
      image_fish_normal = EXCLUDED.image_fish_normal,
      image_fish_hover  = EXCLUDED.image_fish_hover,
      image_trophy_bg   = EXCLUDED.image_trophy_bg,
      trophy_top_images = EXCLUDED.trophy_top_images,
      tip_text         = EXCLUDED.tip_text,
      home_heading     = EXCLUDED.home_heading,
      discord_url      = EXCLUDED.discord_url,
      trophy_heading    = EXCLUDED.trophy_heading,
      trophy_subheading = EXCLUDED.trophy_subheading,
      trophy_tagline    = EXCLUDED.trophy_tagline,
      trophy_actions_bg = EXCLUDED.trophy_actions_bg,
      logo_width       = EXCLUDED.logo_width,
      card_min_height  = EXCLUDED.card_min_height,
      winner_image_size = EXCLUDED.winner_image_size,
      characters_width  = EXCLUDED.characters_width,
      heading_width     = EXCLUDED.heading_width,
      heading_font_size = EXCLUDED.heading_font_size,
      updated_at       = NOW()
  `;
  return next;
}

/** External link (winner-screen Discord banner) — http(s) only, rejects anything
 * that could break out of an href attribute once interpolated on the storefront. */
function sanitizeExternalUrl(v: string): string {
  const trimmed = v.trim();
  if (!trimmed) return "";
  if (/["'<>\\\s]/.test(trimmed)) return "";
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
  } catch {
    return "";
  }
  return trimmed.slice(0, 300);
}

/** Trophy action-area background color — a strict #rgb/#rrggbb hex or nothing
 * (empty = transparent), rejecting anything that isn't a plain color value. */
function sanitizeHexColor(v: string): string {
  const trimmed = v.trim();
  if (!trimmed) return "";
  return /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : "";
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
