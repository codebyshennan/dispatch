// google-play-scraper is an ESM-only module.
// Since this Lambda compiles to CommonJS (node16 moduleResolution), we use dynamic import().
export interface Review {
  id: string;
  date: string;
  score: number;
  text: string;
  userName: string;
  source: 'google-play' | 'app-store' | 'trustpilot';
}

export async function fetchGooglePlayReviews(appId: string): Promise<Review[]> {
  // Dynamic import required because google-play-scraper is ESM-only.
  // sort.NEWEST = 2 (numeric enum value from the library's type definitions)
  const gplay = await import('google-play-scraper');
  const SORT_NEWEST = 2; // sort.NEWEST value from google-play-scraper

  const results = await gplay.default.reviews({
    appId,
    sort: SORT_NEWEST as Parameters<typeof gplay.default.reviews>[0]['sort'],
    num: 200,
    lang: 'en',
  });

  return results.data.map((r) => ({
    id: r.id,
    date: String(r.date),
    score: r.score,
    text: r.text,
    userName: r.userName,
    source: 'google-play' as const,
  }));
}
