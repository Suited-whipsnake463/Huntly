import Outscraper from 'outscraper';
import { env } from '../config.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface LeadSourceData {
  businessName: string;
  category: string;
  address: string;
  phone?: string;
  websiteUrl?: string;
  googleMapsPlaceId: string;
  googleRating?: number;
  googleReviewCount?: number;
  raw: Record<string, unknown>;
}

export interface ReviewResult {
  reviews: string[];
  rating: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function createClient(): InstanceType<typeof Outscraper> {
  return new Outscraper(env.OUTSCRAPER_API_KEY);
}

/* ------------------------------------------------------------------ */
/*  searchBusinesses                                                   */
/* ------------------------------------------------------------------ */

/**
 * Search Google Maps for businesses matching `query`.
 * Returns deduplicated leads normalised into LeadSourceData[].
 *
 * Note: Outscraper's googleMapsSearch defaults to async=true, so we
 * explicitly pass asyncRequest=false to get synchronous results.
 */
export async function searchBusinesses(
  query: string,
  limit = 100,
): Promise<LeadSourceData[]> {
  const client = createClient();

  // googleMapsSearch(query, limit, language, region, skip, dropDuplicates, enrichment, asyncRequest)
  const results = await client.googleMapsSearch(
    query,
    limit,
    'en',    // language
    null,    // region
    0,       // skip
    false,   // dropDuplicates (we dedup ourselves)
    null,    // enrichment
    false,   // asyncRequest — MUST be false for synchronous response
  );

  const seen = new Set<string>();
  const leads: LeadSourceData[] = [];

  // Outscraper returns an array of arrays (one per query). When a
  // single query string is supplied it's [[...results]].
  for (const batch of results) {
    for (const item of Array.isArray(batch) ? batch : [batch]) {
      const placeId: string | undefined = item.place_id;
      if (!placeId || seen.has(placeId)) continue;
      seen.add(placeId);

      leads.push({
        businessName: item.name ?? 'Unknown',
        category: item.type ?? item.category ?? '',
        address: item.full_address ?? item.address ?? '',
        phone: item.phone ?? undefined,
        websiteUrl: item.site ?? undefined,
        googleMapsPlaceId: placeId,
        googleRating: item.rating != null ? Number(item.rating) : undefined,
        googleReviewCount: item.reviews != null ? Number(item.reviews) : undefined,
        raw: item,
      });
    }
  }

  return leads;
}

/* ------------------------------------------------------------------ */
/*  fetchReviews                                                       */
/* ------------------------------------------------------------------ */

/**
 * Fetch Google Maps reviews for a given place ID.
 * Returns an object with the review texts and the overall rating.
 */
export async function fetchReviews(
  placeId: string,
  limit = 20,
): Promise<ReviewResult> {
  const client = createClient();

  // googleMapsReviews(query, reviewsLimit, ...) — defaults to async=false
  const results = await client.googleMapsReviews(placeId, limit);

  const reviews: string[] = [];
  let rating = 0;

  for (const batch of results) {
    for (const item of Array.isArray(batch) ? batch : [batch]) {
      if (item.reviews_data) {
        for (const review of item.reviews_data) {
          if (review.review_text) reviews.push(review.review_text);
        }
      }
      if (item.rating != null) rating = Number(item.rating);
    }
  }

  return { reviews, rating };
}
