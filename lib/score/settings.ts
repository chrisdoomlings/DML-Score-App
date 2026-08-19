import { getDb, jsonb } from "@/lib/supabase/client";
import { mergeAchievementConfig, type AchievementConfig } from "@/lib/score/achievements";
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
  "logo",
  "bgWinner",
  "beeNormal",
  "beeHover",
  "fishNormal",
  "fishHover",
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
  logoWidth: number; // px; applies to the logo on both the home and winner screens
  cardMinHeight: number; // px; floor height for the score card — grows past this if content needs more room
  winnerImageSize: number; // px; max-width of the winner reveal art
}

const DEFAULTS = {
  guessEnabled: true,
  guessGapMax: 10,
  guessEveryN: 3,
  tipText: "Tip: add Google’s keyboard if your phone doesn’t have a minus “-” symbol.",
  logoWidth: 220,
  cardMinHeight: 560,
  winnerImageSize: 260,
};

const EMPTY_IMAGES: ImageUrls = {
  worldsend: "", compass: "", drop: "", suppress: "", characters: "", winner: "", bg: "", bgExp: "", logo: "", bgWinner: "",
  beeNormal: "", beeHover: "", fishNormal: "", fishHover: "",
};

export async function getSettings(shop: string): Promise<ScoreSettings> {
  const db = getDb();
  const rows = await db<
    {
      achievements: unknown;
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
      imageLogo: string;
      imageBgWinner: string;
      imageBeeNormal: string;
      imageBeeHover: string;
      imageFishNormal: string;
      imageFishHover: string;
      tipText: string;
      logoWidth: number;
      cardMinHeight: number;
      winnerImageSize: number;
    }[]
  >`
    SELECT achievements,
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
           image_logo       AS "imageLogo",
           image_bg_winner  AS "imageBgWinner",
           image_bee_normal  AS "imageBeeNormal",
           image_bee_hover   AS "imageBeeHover",
           image_fish_normal AS "imageFishNormal",
           image_fish_hover  AS "imageFishHover",
           tip_text         AS "tipText",
           logo_width       AS "logoWidth",
           card_min_height  AS "cardMinHeight",
           winner_image_size AS "winnerImageSize"
    FROM score_settings WHERE shop = ${shop}
  `;
  const r = rows[0];
  return {
    achievements: mergeAchievementConfig(r?.achievements),
    guessEnabled: r?.guessEnabled ?? DEFAULTS.guessEnabled,
    guessGapMax: r?.guessGapMax ?? DEFAULTS.guessGapMax,
    guessEveryN: r?.guessEveryN ?? DEFAULTS.guessEveryN,
    tipText: r?.tipText ?? DEFAULTS.tipText,
    logoWidth: r?.logoWidth ?? DEFAULTS.logoWidth,
    cardMinHeight: r?.cardMinHeight ?? DEFAULTS.cardMinHeight,
    winnerImageSize: r?.winnerImageSize ?? DEFAULTS.winnerImageSize,
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
          logo: r.imageLogo ?? "",
          bgWinner: r.imageBgWinner ?? "",
          beeNormal: r.imageBeeNormal ?? "",
          beeHover: r.imageBeeHover ?? "",
          fishNormal: r.imageFishNormal ?? "",
          fishHover: r.imageFishHover ?? "",
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
    guessEnabled: typeof s.guessEnabled === "boolean" ? s.guessEnabled : current.guessEnabled,
    guessGapMax: clampInt(s.guessGapMax ?? current.guessGapMax, 0, 9_999),
    guessEveryN: clampInt(s.guessEveryN ?? current.guessEveryN, 1, 100),
    images: nextImages,
    tipText: typeof s.tipText === "string" ? s.tipText.trim().slice(0, 280) : current.tipText,
    logoWidth: clampInt(s.logoWidth ?? current.logoWidth, 40, 600),
    cardMinHeight: clampInt(s.cardMinHeight ?? current.cardMinHeight, 300, 1200),
    winnerImageSize: clampInt(s.winnerImageSize ?? current.winnerImageSize, 100, 500),
  };
  const db = getDb();
  await db`
    INSERT INTO score_settings (
      shop, achievements, guess_enabled, guess_gap_max, guess_every_n,
      image_worldsend, image_compass, image_drop, image_suppress, image_characters, image_winner, image_bg, image_bg_exp,
      image_logo, image_bg_winner, image_bee_normal, image_bee_hover, image_fish_normal, image_fish_hover,
      tip_text, logo_width, card_min_height, winner_image_size,
      updated_at
    )
    VALUES (
      ${shop}, ${jsonb(next.achievements)}, ${next.guessEnabled}, ${next.guessGapMax}, ${next.guessEveryN},
      ${next.images.worldsend}, ${next.images.compass}, ${next.images.drop}, ${next.images.suppress}, ${next.images.characters}, ${next.images.winner}, ${next.images.bg}, ${next.images.bgExp},
      ${next.images.logo}, ${next.images.bgWinner}, ${next.images.beeNormal}, ${next.images.beeHover}, ${next.images.fishNormal}, ${next.images.fishHover},
      ${next.tipText}, ${next.logoWidth}, ${next.cardMinHeight}, ${next.winnerImageSize},
      NOW()
    )
    ON CONFLICT (shop) DO UPDATE SET
      achievements     = EXCLUDED.achievements,
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
      image_logo       = EXCLUDED.image_logo,
      image_bg_winner  = EXCLUDED.image_bg_winner,
      image_bee_normal  = EXCLUDED.image_bee_normal,
      image_bee_hover   = EXCLUDED.image_bee_hover,
      image_fish_normal = EXCLUDED.image_fish_normal,
      image_fish_hover  = EXCLUDED.image_fish_hover,
      tip_text         = EXCLUDED.tip_text,
      logo_width       = EXCLUDED.logo_width,
      card_min_height  = EXCLUDED.card_min_height,
      winner_image_size = EXCLUDED.winner_image_size,
      updated_at       = NOW()
  `;
  return next;
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
