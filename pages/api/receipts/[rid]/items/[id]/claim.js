import { connectToDatabase } from '@/lib/db/mongodb';
import { checkMethod, errorResponse } from '@/lib/utils/apiHelpers';

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
      return res.status(400).json({ error: 'Item already claimed' });
    }

    // Create claim
    const claim = {
      receiptId: rid,
      itemId: id,
      userId: userId,
      claimedAt: new Date()
    };

    const result = await db.collection('claims').insertOne(claim);
    
    const savedClaim = {
      ...claim,
      id: result.insertedId.toString()
    };

    res.status(200).json(savedClaim);
  } catch (error) {
    errorResponse(res, error, 'Claim item error');
  }
}
