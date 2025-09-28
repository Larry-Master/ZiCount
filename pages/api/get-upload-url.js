import { Storage } from '@google-cloud/storage';
import { checkMethod } from '@/lib/utils/apiHelpers';

export default async function handler(req, res) {
  if (!checkMethod(req, res, 'POST')) return;

  try {
    // Validate env vars
    if (!process.env.GCS_BUCKET_NAME) {
      return res.status(500).json({ error: 'Missing GCS_BUCKET_NAME' });
    }
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      return res.status(500).json({ error: 'Missing Google Cloud credentials' });
    }

    // Initialize Storage client with credentials
    let storage;
    if (process.env.NODE_ENV === 'development' && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // For local development - use GOOGLE_APPLICATION_CREDENTIALS file path
      storage = new Storage();
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      // For Vercel deployment - use service account key from environment variable
      const serviceAccountKey = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
      storage = new Storage({
        credentials: serviceAccountKey,
        projectId: serviceAccountKey.project_id
      });
    } else {
      return res.status(500).json({ error: 'Missing Google Cloud credentials. Set GOOGLE_APPLICATION_CREDENTIALS (dev) or GOOGLE_APPLICATION_CREDENTIALS_JSON (prod)' });
    }

    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
    const filename = `receipt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;
    const file = bucket.file(filename);

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      // contentType: 'image/jpeg',  // Allow any content type
    });
  // Also create a signed read URL so the client can fetch the uploaded image for preview
  // Note: the read URL will return 404 until the object exists; that's expected.
  const [readUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    });

    res.status(200).json({ uploadUrl: url, gcsUrl: `gs://${process.env.GCS_BUCKET_NAME}/${filename}`, readUrl });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL', details: error.message });
  }
}