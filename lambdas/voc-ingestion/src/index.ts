import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { fetchGooglePlayReviews } from './google-play.js';
import { fetchAppStoreReviews } from './app-store.js';
import { fetchTrustpilotReviews } from './trustpilot.js';

const s3 = new S3Client({});

async function saveToS3(bucket: string, key: string, data: unknown): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: JSON.stringify(data),
    ContentType: 'application/json',
  }));
}

export async function handler(event: { source?: string } = {}): Promise<{ ingested: number }> {
  const bucket = process.env.ASSETS_BUCKET_NAME!;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const source = event.source ?? 'all';

  let totalIngested = 0;

  // Google Play (6h cadence or 'all' / 'google-play' invocation)
  if (source === 'all' || source === 'google-play') {
    const appId = process.env.GOOGLE_PLAY_APP_ID;
    if (appId) {
      try {
        const reviews = await fetchGooglePlayReviews(appId);
        await saveToS3(bucket, `reviews/google-play/${timestamp}.json`, reviews);
        totalIngested += reviews.length;
        console.info(`Google Play: ingested ${reviews.length} reviews`);
      } catch (err) {
        console.error('Google Play ingestion failed:', err);
      }
    }
  }

  // App Store (6h cadence)
  if (source === 'all' || source === 'app-store') {
    const appId = process.env.APP_STORE_APP_ID;
    if (appId) {
      try {
        const reviews = await fetchAppStoreReviews(appId);
        await saveToS3(bucket, `reviews/app-store/${timestamp}.json`, reviews);
        totalIngested += reviews.length;
        console.info(`App Store: ingested ${reviews.length} reviews`);
      } catch (err) {
        console.error('App Store ingestion failed:', err);
      }
    }
  }

  // Trustpilot (12h cadence)
  if (source === 'all' || source === 'trustpilot') {
    const apiKey = process.env.TRUSTPILOT_API_KEY;
    const businessUnitId = process.env.TRUSTPILOT_BUSINESS_UNIT_ID;
    if (apiKey && businessUnitId) {
      try {
        const reviews = await fetchTrustpilotReviews(apiKey, businessUnitId);
        await saveToS3(bucket, `reviews/trustpilot/${timestamp}.json`, reviews);
        totalIngested += reviews.length;
        console.info(`Trustpilot: ingested ${reviews.length} reviews`);
      } catch (err) {
        console.error('Trustpilot ingestion failed:', err);
      }
    }
  }

  return { ingested: totalIngested };
}
