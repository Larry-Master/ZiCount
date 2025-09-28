import { connectToDatabase } from '@/lib/db/mongodb';
import { checkMethod, errorResponse } from '@/lib/utils/apiHelpers';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  const { rid, id } = req.query; // receipt ID and item ID
  const { db } = await connectToDatabase();

  if (!checkMethod(req, res, 'POST')) return;

  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Check if item is already claimed
    const existingClaim = await db.collection('claims').findOne({
      receiptId: rid,
      itemId: id
    });

    if (existingClaim) {
      return res.status(409).json({ error: 'Item already claimed', existingClaim });
    }

    // Create claim
    const claim = {
      receiptId: rid,
      itemId: id,
      userId: userId,
      claimedAt: new Date().toISOString()
    };

    const result = await db.collection('claims').insertOne(claim);
    
    const savedClaim = {
      ...claim,
      id: result.insertedId.toString()
    };

    // bump receipt.updatedAt so GET /receipts and GET /receipts/[rid] return updated Last-Modified
    try {
      await db.collection('receipts').updateOne({ _id: new ObjectId(rid) }, { $set: { updatedAt: new Date().toISOString() } });
    } catch (e) {
      // ignore if receipt not found; claim still inserted
    }

    res.status(200).json(savedClaim);
  } catch (error) {
    errorResponse(res, error, 'Claim item error');
  }
}
