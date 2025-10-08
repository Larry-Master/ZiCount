import { connectToDatabase } from '@/lib/db/mongodb';
import { checkMethod, errorResponse } from '@/lib/utils/apiHelpers';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  const { rid, id } = req.query;
  const { db } = await connectToDatabase();

  if (!checkMethod(req, res, 'POST')) return;

  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    console.log('[Claim API] Claiming item:', { rid, id, userId });
    
    const existingClaim = await db.collection('claims').findOne({ receiptId: rid, itemId: id });
    if (existingClaim) {
      console.log('[Claim API] Item already claimed:', existingClaim);
      return res.status(409).json({ error: 'Item already claimed', existingClaim });
    }

    const now = new Date().toISOString();
    const claim = { receiptId: rid, itemId: id, userId, claimedAt: now };
    const result = await db.collection('claims').insertOne(claim);
    
    console.log('[Claim API] Claim created successfully:', { claimId: result.insertedId.toString(), itemId: id });
    
    await db.collection('receipts').updateOne(
      { _id: new ObjectId(rid) }, 
      { $set: { updatedAt: now } }
    ).catch(() => {});

    res.status(200).json({ ...claim, id: result.insertedId.toString() });
  } catch (error) {
    console.error('[Claim API] Error:', error);
    errorResponse(res, error, 'Claim item error');
  }
}
