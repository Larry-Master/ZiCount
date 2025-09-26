import { Storage } from '@google-cloud/storage';
import { checkMethod } from '@/lib/utils/apiHelpers';

export default async function handler(req, res) {
  if (!checkMethod(req, res, 'POST')) return;

  try {
    // Validate env vars
    if (!process.env.GCS_BUCKET_NAME) {
      return res.status(500).json({ error: 'Missing GCS_BUCKET_NAME' });
    }
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      return res.status(500).json({ error: 'Missing GOOGLE_APPLICATION_CREDENTIALS_JSON' });
    }

    // Initialize Storage client with credentials
    let storage;
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const serviceAccountKey = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      storage = new Storage({
        credentials: serviceAccountKey,
        projectId: serviceAccountKey.project_id
      });
    } else {
      storage = new Storage();  // Fallback for local dev
    }

    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
    const filename = `receipt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;
    const file = bucket.file(filename);

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: 'image/jpeg',
    });

    res.status(200).json({ uploadUrl: url, gcsUrl: `gs://${process.env.GCS_BUCKET_NAME}/${filename}` });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL', details: error.message });
  }
}