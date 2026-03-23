// Apple App Store reviews via public iTunes RSS endpoint (no auth required)
// Source: industry-standard approach — Apple has no official reviews API
// Max 50 reviews per page, pages 1-10 (500 reviews max per fetch)
import type { Review } from './google-play.js';

interface ItunesEntry {
  id: { label: string };
  'im:rating': { label: string };
  content: { label: string };
  author: { name: { label: string } };
  updated: { label: string };
}

interface ItunesFeed {
  feed: { entry?: ItunesEntry[] };
}

export async function fetchAppStoreReviews(appId: string, country = 'us'): Promise<Review[]> {
  const reviews: Review[] = [];

  for (let page = 1; page <= 5; page++) {
    const url = `https://itunes.apple.com/${country}/rss/customerreviews/page=${page}/id=${appId}/sortBy=mostRecent/json`;
    const res = await fetch(url);
    if (!res.ok) break;

    const json = await res.json() as ItunesFeed;
    const entries = json.feed?.entry;
    if (!entries || entries.length === 0) break;

    for (const entry of entries) {
      reviews.push({
        id: entry.id.label,
        date: entry.updated.label,
        score: parseInt(entry['im:rating'].label, 10),
        text: entry.content.label,
        userName: entry.author.name.label,
        source: 'app-store',
      });
    }
  }

  return reviews;
}
