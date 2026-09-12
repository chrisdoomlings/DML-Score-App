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
  "winnerFooter",
  "bg",
  "bgExp",
  "bgWe",
  "bgFv",
  "bgBp",
  "bgWeCustom",
  "bgFvCustom",
  "bgBpCustom",
  "bgExpCustom",
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
  images: ImageUrls; // empty string per key = use the bundled default asset ("logo" has no default — empty hides it)
  tipText: string; // shown in the home-screen tip bar; empty = hidden
  homeHeading: string; // welcome screen heading; empty = fall back to the theme block's data-heading
  homeSubheading: string; // welcome screen subheading (under the heading); empty = hidden
  logoWidth: number; // px; applies to the logo on both the home and winner screens
  cardMinHeight: number; // px; floor height for the score card — grows past this if content needs more room
  modalWidth: number; // px; max-width cap of the #dmls-modal shell itself (still bounded by 92vw on narrow phones)
  modalHeight: number; // raw number, interpreted per modalHeightUnit; height of the #dmls-modal shell itself
  modalHeightUnit: "vh" | "px"; // which unit modalHeight is in
  lockPageScroll: boolean; // while the tool's card is open, lock the underlying page from scrolling so only the card's own content scrolls (inline layoutMode only — modal mode always locks)
  layoutMode: "inline" | "modal"; // "inline" (default, Sept 2026 rebuild) renders in the page's own flow; "modal" restores the pre-rebuild full-screen overlay (fixed position, backdrop, always-locked page scroll)
  winnerImageSize: number; // px; max-width of the winner reveal art
  charactersWidth: number; // px; welcome-screen character illustration — can exceed the card width to bleed off the edges (card clips via overflow:hidden)
  headingWidth: number; // px; max-width of the welcome heading, controls line wrapping
  headingFontSize: number; // px
  discordUrl: string; // winner-screen "Join us on Discord" banner link; empty = banner hidden
  winnerFooterUrl: string; // click-through link for the winner-screen bottom banner image; empty = renders as a plain (non-clickable) image
  trophyHeading: string; // trophy screen heading — the loser names/"did not" line is always dynamic, this wraps it
  trophySubheading: string; // trophy screen caption shown after the loser names (e.g. "Did Not.")
  trophyTagline: string; // optional second line shown between the loser names and trophySubheading; empty = hidden
  trophyActionsBg: string; // hex color behind the trophy screen's action buttons; empty = transparent (card's own default background)
  steps: StepConfig; // per-step heading/description for the 4 scoring screens; character images are images.bgWe/bgFv/bgBp/bgExp; per-step background overrides are images.bgWeCustom/bgFvCustom/bgBpCustom/bgExpCustom (empty = falls back to the shared images.bg)
  trophyTopImages: string[]; // pool of trophy-graphic designs; storefront picks one at random per "Generate Trophy" (client spec — variety, not a single fixed design)
  showProducts: boolean; // winner-screen recommended-products widget on/off
  recsCollectionId: string; // Shopify GID (gid://shopify/Collection/...), chosen via Settings → Products' Admin-API-backed picker; empty = widget stays hidden even if showProducts is true
  recsCollectionTitle: string; // cached label for the picker's current-selection display, avoids an extra Admin API round trip just to show it
  productsHeading: string; // widget heading, shown above the 3 recommended products
  productsNote: string; // optional caption below the products; empty = hidden
}

const DEFAULTS = {
  tipText: "Tip: add Google’s keyboard if your phone doesn’t have a minus “-” symbol.",
  homeHeading: "",
  homeSubheading: "",
  discordUrl: "",
  winnerFooterUrl: "",
  trophyHeading: "Won The End Of The World!",
  trophySubheading: "Did Not.",
  trophyTagline: "",
  trophyActionsBg: "",
  logoWidth: 220,
  cardMinHeight: 560,
  modalWidth: 520,
  modalHeight: 90,
  modalHeightUnit: "vh" as const,
  lockPageScroll: false,
  layoutMode: "inline" as const,
  winnerImageSize: 260,
  charactersWidth: 320,
  headingWidth: 320,
  headingFontSize: 32,
  showProducts: true,
  recsCollectionId: "",
  recsCollectionTitle: "",
  productsHeading: "Level up your game",
  productsNote: "One tap to add to cart.",
};

const EMPTY_IMAGES: ImageUrls = {
  worldsend: "", compass: "", drop: "", suppress: "", characters: "", winner: "", winnerFooter: "", bg: "", bgExp: "", logo: "", bgWinner: "",
  bgWe: "", bgFv: "", bgBp: "",
  bgWeCustom: "", bgFvCustom: "", bgBpCustom: "", bgExpCustom: "",
  beeNormal: "", beeHover: "", fishNormal: "", fishHover: "",
  trophyBg: "",
};

export async function getSettings(shop: string): Promise<ScoreSettings> {
  const db = getDb();
  const rows = await db<
    {
      achievements: unknown;
      steps: unknown;
      imageWorldsend: string;
      imageCompass: string;
      imageDrop: string;
      imageSuppress: string;
      imageCharacters: string;
      imageWinner: string;
      imageWinnerFooter: string;
      imageBg: string;
      imageBgExp: string;
      imageBgWe: string;
      imageBgFv: string;
      imageBgBp: string;
      imageBgWeCustom: string;
      imageBgFvCustom: string;
      imageBgBpCustom: string;
      imageBgExpCustom: string;
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
      homeSubheading: string;
      discordUrl: string;
      winnerFooterUrl: string;
      trophyHeading: string;
      trophySubheading: string;
      trophyTagline: string;
      trophyActionsBg: string;
      logoWidth: number;
      cardMinHeight: number;
      modalWidth: number;
      modalHeight: number;
      modalHeightUnit: string;
      lockPageScroll: boolean;
      layoutMode: string;
      winnerImageSize: number;
      charactersWidth: number;
      headingWidth: number;
      headingFontSize: number;
      showProducts: boolean;
      recsCollectionId: string;
      recsCollectionTitle: string;
      productsHeading: string;
      productsNote: string;
    }[]
  >`
    SELECT achievements,
           steps,
           image_worldsend  AS "imageWorldsend",
           image_compass    AS "imageCompass",
           image_drop       AS "imageDrop",
           image_suppress   AS "imageSuppress",
           image_characters AS "imageCharacters",
           image_winner     AS "imageWinner",
           image_winner_footer AS "imageWinnerFooter",
           image_bg         AS "imageBg",
           image_bg_exp     AS "imageBgExp",
           image_bg_we      AS "imageBgWe",
           image_bg_fv      AS "imageBgFv",
           image_bg_bp      AS "imageBgBp",
           image_bg_we_custom  AS "imageBgWeCustom",
           image_bg_fv_custom  AS "imageBgFvCustom",
           image_bg_bp_custom  AS "imageBgBpCustom",
           image_bg_exp_custom AS "imageBgExpCustom",
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
           home_subheading  AS "homeSubheading",
           discord_url      AS "discordUrl",
           winner_footer_url AS "winnerFooterUrl",
           trophy_heading    AS "trophyHeading",
           trophy_subheading AS "trophySubheading",
           trophy_tagline    AS "trophyTagline",
           trophy_actions_bg AS "trophyActionsBg",
           logo_width       AS "logoWidth",
           card_min_height  AS "cardMinHeight",
           modal_width      AS "modalWidth",
           modal_height     AS "modalHeight",
           modal_height_unit AS "modalHeightUnit",
           lock_page_scroll AS "lockPageScroll",
           layout_mode AS "layoutMode",
           winner_image_size AS "winnerImageSize",
           characters_width  AS "charactersWidth",
           heading_width     AS "headingWidth",
           heading_font_size AS "headingFontSize",
           show_products     AS "showProducts",
           recs_collection_id    AS "recsCollectionId",
           recs_collection_title AS "recsCollectionTitle",
           products_heading  AS "productsHeading",
           products_note     AS "productsNote"
    FROM score_settings WHERE shop = ${shop}
  `;
  const r = rows[0];
  return {
    achievements: mergeAchievementConfig(r?.achievements),
    steps: mergeStepConfig(r?.steps),
    tipText: r?.tipText ?? DEFAULTS.tipText,
    homeHeading: r?.homeHeading ?? DEFAULTS.homeHeading,
    homeSubheading: r?.homeSubheading ?? DEFAULTS.homeSubheading,
    discordUrl: r?.discordUrl ?? DEFAULTS.discordUrl,
    winnerFooterUrl: r?.winnerFooterUrl ?? DEFAULTS.winnerFooterUrl,
    trophyHeading: r?.trophyHeading ?? DEFAULTS.trophyHeading,
    trophySubheading: r?.trophySubheading ?? DEFAULTS.trophySubheading,
    trophyTagline: r?.trophyTagline ?? DEFAULTS.trophyTagline,
    trophyActionsBg: r?.trophyActionsBg ?? DEFAULTS.trophyActionsBg,
    trophyTopImages: Array.isArray(r?.trophyTopImages)
      ? r.trophyTopImages.filter((u): u is string => typeof u === "string" && u.length > 0)
      : [],
    logoWidth: r?.logoWidth ?? DEFAULTS.logoWidth,
    cardMinHeight: r?.cardMinHeight ?? DEFAULTS.cardMinHeight,
    modalWidth: r?.modalWidth ?? DEFAULTS.modalWidth,
    modalHeight: r?.modalHeight ?? DEFAULTS.modalHeight,
    modalHeightUnit: r?.modalHeightUnit === "px" ? "px" : DEFAULTS.modalHeightUnit,
    lockPageScroll: r?.lockPageScroll ?? DEFAULTS.lockPageScroll,
    layoutMode: r?.layoutMode === "modal" ? "modal" : DEFAULTS.layoutMode,
    winnerImageSize: r?.winnerImageSize ?? DEFAULTS.winnerImageSize,
    charactersWidth: r?.charactersWidth ?? DEFAULTS.charactersWidth,
    headingWidth: r?.headingWidth ?? DEFAULTS.headingWidth,
    headingFontSize: r?.headingFontSize ?? DEFAULTS.headingFontSize,
    showProducts: r?.showProducts ?? DEFAULTS.showProducts,
    recsCollectionId: r?.recsCollectionId ?? DEFAULTS.recsCollectionId,
    recsCollectionTitle: r?.recsCollectionTitle ?? DEFAULTS.recsCollectionTitle,
    productsHeading: r?.productsHeading ?? DEFAULTS.productsHeading,
    productsNote: r?.productsNote ?? DEFAULTS.productsNote,
    images: r
      ? {
          worldsend: r.imageWorldsend ?? "",
          compass: r.imageCompass ?? "",
          drop: r.imageDrop ?? "",
          suppress: r.imageSuppress ?? "",
          characters: r.imageCharacters ?? "",
          winner: r.imageWinner ?? "",
          winnerFooter: r.imageWinnerFooter ?? "",
          bg: r.imageBg ?? "",
          bgExp: r.imageBgExp ?? "",
          bgWe: r.imageBgWe ?? "",
          bgFv: r.imageBgFv ?? "",
          bgBp: r.imageBgBp ?? "",
          bgWeCustom: r.imageBgWeCustom ?? "",
          bgFvCustom: r.imageBgFvCustom ?? "",
          bgBpCustom: r.imageBgBpCustom ?? "",
          bgExpCustom: r.imageBgExpCustom ?? "",
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
  const modalHeightUnit: "vh" | "px" =
    s.modalHeightUnit === "px" ? "px" : s.modalHeightUnit === "vh" ? "vh" : current.modalHeightUnit;
  const next: ScoreSettings = {
    achievements: mergeAchievementConfig(s.achievements ?? current.achievements),
    steps: mergeStepConfig(s.steps ?? current.steps),
    images: nextImages,
    tipText: typeof s.tipText === "string" ? s.tipText.trim().slice(0, 280) : current.tipText,
    homeHeading: typeof s.homeHeading === "string" ? s.homeHeading.trim().slice(0, 120) : current.homeHeading,
    homeSubheading: typeof s.homeSubheading === "string" ? s.homeSubheading.trim().slice(0, 200) : current.homeSubheading,
    discordUrl: typeof s.discordUrl === "string" ? sanitizeExternalUrl(s.discordUrl) : current.discordUrl,
    winnerFooterUrl: typeof s.winnerFooterUrl === "string" ? sanitizeExternalUrl(s.winnerFooterUrl) : current.winnerFooterUrl,
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
    modalWidth: clampInt(s.modalWidth ?? current.modalWidth, 320, 900),
    modalHeightUnit,
    modalHeight:
      modalHeightUnit === "px"
        ? clampInt(s.modalHeight ?? current.modalHeight, 300, 1200)
        : clampInt(s.modalHeight ?? current.modalHeight, 50, 100),
    lockPageScroll: typeof s.lockPageScroll === "boolean" ? s.lockPageScroll : current.lockPageScroll,
    layoutMode: s.layoutMode === "modal" ? "modal" : s.layoutMode === "inline" ? "inline" : current.layoutMode,
    winnerImageSize: clampInt(s.winnerImageSize ?? current.winnerImageSize, 100, 500),
    charactersWidth: clampInt(s.charactersWidth ?? current.charactersWidth, 60, 900),
    headingWidth: clampInt(s.headingWidth ?? current.headingWidth, 100, 600),
    headingFontSize: clampInt(s.headingFontSize ?? current.headingFontSize, 14, 60),
    showProducts: typeof s.showProducts === "boolean" ? s.showProducts : current.showProducts,
    recsCollectionId: typeof s.recsCollectionId === "string" ? sanitizeCollectionGid(s.recsCollectionId) : current.recsCollectionId,
    recsCollectionTitle: typeof s.recsCollectionTitle === "string" ? s.recsCollectionTitle.trim().slice(0, 120) : current.recsCollectionTitle,
    productsHeading: typeof s.productsHeading === "string" ? s.productsHeading.trim().slice(0, 120) || DEFAULTS.productsHeading : current.productsHeading,
    productsNote: typeof s.productsNote === "string" ? s.productsNote.trim().slice(0, 200) : current.productsNote,
  };
  const db = getDb();
  await db`
    INSERT INTO score_settings (
      shop, achievements, steps,
      image_worldsend, image_compass, image_drop, image_suppress, image_characters, image_winner, image_winner_footer, image_bg, image_bg_exp,
      image_bg_we, image_bg_fv, image_bg_bp,
      image_bg_we_custom, image_bg_fv_custom, image_bg_bp_custom, image_bg_exp_custom,
      image_logo, image_bg_winner, image_bee_normal, image_bee_hover, image_fish_normal, image_fish_hover,
      image_trophy_bg, trophy_top_images,
      tip_text, home_heading, home_subheading, discord_url, winner_footer_url, trophy_heading, trophy_subheading, trophy_tagline, trophy_actions_bg, logo_width, card_min_height, modal_width, modal_height, modal_height_unit, lock_page_scroll, layout_mode, winner_image_size,
      characters_width, heading_width, heading_font_size,
      show_products, recs_collection_id, recs_collection_title, products_heading, products_note,
      updated_at
    )
    VALUES (
      ${shop}, ${jsonb(next.achievements)}, ${jsonb(next.steps)},
      ${next.images.worldsend}, ${next.images.compass}, ${next.images.drop}, ${next.images.suppress}, ${next.images.characters}, ${next.images.winner}, ${next.images.winnerFooter}, ${next.images.bg}, ${next.images.bgExp},
      ${next.images.bgWe}, ${next.images.bgFv}, ${next.images.bgBp},
      ${next.images.bgWeCustom}, ${next.images.bgFvCustom}, ${next.images.bgBpCustom}, ${next.images.bgExpCustom},
      ${next.images.logo}, ${next.images.bgWinner}, ${next.images.beeNormal}, ${next.images.beeHover}, ${next.images.fishNormal}, ${next.images.fishHover},
      ${next.images.trophyBg}, ${jsonb(next.trophyTopImages)},
      ${next.tipText}, ${next.homeHeading}, ${next.homeSubheading}, ${next.discordUrl}, ${next.winnerFooterUrl}, ${next.trophyHeading}, ${next.trophySubheading}, ${next.trophyTagline}, ${next.trophyActionsBg}, ${next.logoWidth}, ${next.cardMinHeight}, ${next.modalWidth}, ${next.modalHeight}, ${next.modalHeightUnit}, ${next.lockPageScroll}, ${next.layoutMode}, ${next.winnerImageSize},
      ${next.charactersWidth}, ${next.headingWidth}, ${next.headingFontSize},
      ${next.showProducts}, ${next.recsCollectionId}, ${next.recsCollectionTitle}, ${next.productsHeading}, ${next.productsNote},
      NOW()
    )
    ON CONFLICT (shop) DO UPDATE SET
      achievements     = EXCLUDED.achievements,
      steps            = EXCLUDED.steps,
      image_worldsend  = EXCLUDED.image_worldsend,
      image_compass    = EXCLUDED.image_compass,
      image_drop       = EXCLUDED.image_drop,
      image_suppress   = EXCLUDED.image_suppress,
      image_characters = EXCLUDED.image_characters,
      image_winner     = EXCLUDED.image_winner,
      image_winner_footer = EXCLUDED.image_winner_footer,
      image_bg         = EXCLUDED.image_bg,
      image_bg_exp     = EXCLUDED.image_bg_exp,
      image_bg_we      = EXCLUDED.image_bg_we,
      image_bg_fv      = EXCLUDED.image_bg_fv,
      image_bg_bp      = EXCLUDED.image_bg_bp,
      image_bg_we_custom  = EXCLUDED.image_bg_we_custom,
      image_bg_fv_custom  = EXCLUDED.image_bg_fv_custom,
      image_bg_bp_custom  = EXCLUDED.image_bg_bp_custom,
      image_bg_exp_custom = EXCLUDED.image_bg_exp_custom,
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
      home_subheading  = EXCLUDED.home_subheading,
      discord_url      = EXCLUDED.discord_url,
      winner_footer_url = EXCLUDED.winner_footer_url,
      trophy_heading    = EXCLUDED.trophy_heading,
      trophy_subheading = EXCLUDED.trophy_subheading,
      trophy_tagline    = EXCLUDED.trophy_tagline,
      trophy_actions_bg = EXCLUDED.trophy_actions_bg,
      logo_width       = EXCLUDED.logo_width,
      card_min_height  = EXCLUDED.card_min_height,
      modal_width      = EXCLUDED.modal_width,
      modal_height     = EXCLUDED.modal_height,
      modal_height_unit = EXCLUDED.modal_height_unit,
      lock_page_scroll = EXCLUDED.lock_page_scroll,
      layout_mode      = EXCLUDED.layout_mode,
      winner_image_size = EXCLUDED.winner_image_size,
      characters_width  = EXCLUDED.characters_width,
      heading_width     = EXCLUDED.heading_width,
      heading_font_size = EXCLUDED.heading_font_size,
      show_products     = EXCLUDED.show_products,
      recs_collection_id    = EXCLUDED.recs_collection_id,
      recs_collection_title = EXCLUDED.recs_collection_title,
      products_heading  = EXCLUDED.products_heading,
      products_note     = EXCLUDED.products_note,
      updated_at       = NOW()
  `;
  // The cache is keyed implicitly to "whichever collection was last fetched" —
  // switching collections without clearing it would keep serving the old
  // collection's products until the TTL in lib/score/products.ts lapses.
  if (next.recsCollectionId !== current.recsCollectionId) {
    await db`UPDATE score_settings SET products_cache = '[]'::jsonb, products_cache_at = NULL WHERE shop = ${shop}`;
  }
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

/** Recommended-products collection — a Shopify GID from our own Admin GraphQL
 * picker (app/api/admin/collections/route.ts), not free text; reject anything
 * that doesn't look like one rather than storing arbitrary client input. */
function sanitizeCollectionGid(v: string): string {
  const trimmed = v.trim();
  if (!trimmed) return "";
  return /^gid:\/\/shopify\/Collection\/\d+$/.test(trimmed) ? trimmed : "";
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
