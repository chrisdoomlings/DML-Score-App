import { getDb, jsonb } from "@/lib/supabase/client";
import type { ScoreSettings } from "@/lib/score/settings";
import { getOfflineSession, hasScope, adminGraphql } from "@/lib/utils/adminGraphql";

export interface ProductCard {
  id: string;
  title: string;
  url: string;
  imageUrl: string;
  price: string;
  variantId: number;
  available: boolean;
}

// How long a resolved product list is trusted before re-fetching from Admin
// GraphQL — this widget doesn't need real-time freshness (price/stock changes
// mid-game are not a real concern), and avoids an Admin API round trip on
// every /apps/score/config request from every storefront visitor.
const CACHE_TTL_MS = 15 * 60 * 1000;

const COLLECTION_PRODUCTS_QUERY = `
  query CollectionProducts($id: ID!) {
    collection(id: $id) {
      handle
      products(first: 3) {
        edges {
          node {
            title
            handle
            featuredImage { url }
            priceRangeV2 { minVariantPrice { amount currencyCode } }
            variants(first: 1) { edges { node { id availableForSale } } }
          }
        }
      }
    }
  }
`;

interface CollectionProductsResponse {
  collection: {
    handle: string;
    products: {
      edges: {
        node: {
          title: string;
          handle: string;
          featuredImage: { url: string } | null;
          priceRangeV2: { minVariantPrice: { amount: string; currencyCode: string } };
          variants: { edges: { node: { id: string; availableForSale: boolean } }[] };
        };
      }[];
    } | null;
  } | null;
}

export interface RecommendedProducts {
  products: ProductCard[];
  collectionUrl: string; // storefront URL of the chosen collection ("Shop more" link); empty if unresolved
}

/** Numeric id from a Shopify GID (gid://shopify/ProductVariant/123) — what the
 *  storefront's /cart/add.js expects, same as the id dmls-score.js already
 *  sends for the Liquid-rendered variant of this widget. */
function numericIdFromGid(gid: string): number {
  const match = /\/(\d+)$/.exec(gid);
  return match ? Number(match[1]) : 0;
}

function formatPrice(amount: string, currencyCode: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(Number(amount));
  } catch {
    return `${amount} ${currencyCode}`;
  }
}

async function fetchFromAdminApi(shop: string, collectionId: string): Promise<RecommendedProducts | null> {
  const session = await getOfflineSession(shop);
  if (!session || !hasScope(session, "read_products")) return null;

  const result = await adminGraphql<CollectionProductsResponse>(
    shop,
    session.accessToken!,
    COLLECTION_PRODUCTS_QUERY,
    { id: collectionId }
  );
  const edges = result.data?.collection?.products?.edges;
  if (result.errors || !edges) {
    console.error("[products] Admin GraphQL error fetching collection products", result.errors);
    return null;
  }

  const products = edges.map(({ node }) => {
    const variant = node.variants.edges[0]?.node;
    return {
      id: node.handle,
      title: node.title,
      url: `/products/${node.handle}`,
      imageUrl: node.featuredImage?.url ?? "",
      price: formatPrice(node.priceRangeV2.minVariantPrice.amount, node.priceRangeV2.minVariantPrice.currencyCode),
      variantId: variant ? numericIdFromGid(variant.id) : 0,
      available: variant?.availableForSale ?? false,
    };
  });
  const collectionHandle = result.data?.collection?.handle;
  return { products, collectionUrl: collectionHandle ? `/collections/${collectionHandle}` : "" };
}

const EMPTY_RECOMMENDED: RecommendedProducts = { products: [], collectionUrl: "" };

/** Recommended products for the winner screen — cached in score_settings
 *  (products_cache/products_cache_at) in front of the Admin API call. Falls
 *  back to a stale cache (rather than an empty widget) if a live fetch fails,
 *  e.g. the scope was revoked or the collection was deleted. products_cache
 *  stores { products, collectionUrl } — collectionUrl backs the widget's
 *  "Shop more" link and shares the same cache/TTL/invalidation as products
 *  since both come off the one Admin GraphQL call. */
export async function getRecommendedProducts(shop: string, settings: ScoreSettings): Promise<RecommendedProducts> {
  if (!settings.showProducts || !settings.recsCollectionId) return EMPTY_RECOMMENDED;

  const db = getDb();
  const rows = await db<{ productsCache: unknown; productsCacheAt: string | null }[]>`
    SELECT products_cache AS "productsCache", products_cache_at AS "productsCacheAt"
    FROM score_settings WHERE shop = ${shop}
  `;
  const rawCache = rows[0]?.productsCache;
  const cached: RecommendedProducts = Array.isArray(rawCache)
    ? { products: rawCache as ProductCard[], collectionUrl: "" } // pre-existing cache row written before collectionUrl was tracked
    : rawCache && typeof rawCache === "object" && Array.isArray((rawCache as RecommendedProducts).products)
      ? (rawCache as RecommendedProducts)
      : EMPTY_RECOMMENDED;
  const cachedAt = rows[0]?.productsCacheAt ? new Date(rows[0].productsCacheAt).getTime() : 0;
  const isFresh = cachedAt > 0 && Date.now() - cachedAt < CACHE_TTL_MS;
  if (isFresh) return cached;

  const fresh = await fetchFromAdminApi(shop, settings.recsCollectionId);
  if (!fresh) return cached; // live fetch failed — serve stale cache rather than nothing

  // Fire-and-forget: don't block the response on writing the cache back.
  db`UPDATE score_settings SET products_cache = ${jsonb(fresh)}, products_cache_at = NOW() WHERE shop = ${shop}`
    .catch((err) => console.error("[products] failed to write products_cache", err));

  return fresh;
}
