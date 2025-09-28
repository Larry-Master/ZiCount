import { connectToDatabase } from '@/lib/db/mongodb';
import { checkMethod, errorResponse } from '@/lib/utils/apiHelpers';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  const { id } = req.query; // item ID
  const { db } = await connectToDatabase();

  if (!checkMethod(req, res, 'DELETE')) return;

  try {
    // Find the claim to get receiptId
    const claim = await db.collection('claims').findOne({ itemId: id });
    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const result = await db.collection('claims').deleteOne({ itemId: id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    // bump receipt.updatedAt for the parent receipt
    try {
      await db.collection('receipts').updateOne({ _id: new ObjectId(claim.receiptId) }, { $set: { updatedAt: new Date().toISOString() } });
    } catch (e) {
      // ignore
    }

    res.status(200).json({ success: true, message: 'Item unclaimed successfully' });
  } catch (error) {
    errorResponse(res, error, 'Unclaim item error');
  }
}
