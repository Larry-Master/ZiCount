import { connectToDatabase } from '@/lib/db/mongodb';
import { checkMethod, errorResponse } from '@/lib/utils/apiHelpers';

export default async function handler(req, res) {
  const { id } = req.query; // item ID
  const { db } = await connectToDatabase();

  if (!checkMethod(req, res, 'DELETE')) return;

  try {
    // Find and delete the claim
    const result = await db.collection('claims').deleteOne({ itemId: id });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    res.status(200).json({ success: true, message: 'Item unclaimed successfully' });
  } catch (error) {
    errorResponse(res, error, 'Unclaim item error');
  }
}
