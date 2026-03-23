// node-trustpilot: official Trustpilot TypeScript SDK
// OAuth2 service-to-service auth for reading reviews (no user login needed)
import type { Review } from './google-play.js';

// node-trustpilot may not have full type declarations; use dynamic import
export async function fetchTrustpilotReviews(
  apiKey: string,
  businessUnitId: string,
): Promise<Review[]> {
  // Trustpilot public reviews endpoint (read-only, API key auth)
  const url = `https://api.trustpilot.com/v1/business-units/${businessUnitId}/reviews?apikey=${encodeURIComponent(apiKey)}&perPage=100&orderBy=createdat.desc`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Trustpilot API error: ${res.status}`);
  }

  const json = await res.json() as { reviews: Array<{
    id: string;
    createdAt: string;
    stars: number;
    text: string;
    consumer: { displayName: string };
  }> };

  return (json.reviews ?? []).map((r) => ({
    id: r.id,
    date: r.createdAt,
    score: r.stars,
    text: r.text ?? '',
    userName: r.consumer?.displayName ?? 'Anonymous',
    source: 'trustpilot' as const,
  }));
}
