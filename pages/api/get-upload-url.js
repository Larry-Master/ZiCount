import { Storage } from '@google-cloud/storage';
import { checkMethod } from '@/lib/utils/apiHelpers';

export default async function handler(req, res) {
  if (!checkMethod(req, res, 'POST')) return;

  try {
    const storage = new Storage();
    const bucket = storage.bucket(process.env.NEXT_PUBLIC_GCS_BUCKET_NAME);
    const filename = `receipt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;
    const file = bucket.file(filename);

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: 'image/jpeg',
    });

    res.status(200).json({ uploadUrl: url, gcsUrl: `gs://${process.env.NEXT_PUBLIC_GCS_BUCKET_NAME}/${filename}` });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
}