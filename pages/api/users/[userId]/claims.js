import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import { handleConditionalGet, getLatestTimestamp } from '@/lib/utils/http';

export default async function handler(req, res) {
  const { userId } = req.query;
  const { db } = await connectToDatabase();

  if (req.method === 'GET') {
    try {
      const claims = await db.collection('claims').find({ userId }).toArray();
      
      const receipts = await db.collection('receipts').find({
        _id: { $in: claims.map(c => new ObjectId(c.receiptId)) }
      }).toArray();

      const latest = getLatestTimestamp([...claims, ...receipts]);
      if (latest && handleConditionalGet(res, req, latest)) return;
      
      const claimsWithDetails = claims.map(claim => {
        const receipt = receipts.find(r => r._id.toString() === claim.receiptId);
        if (!receipt) return null;
        
        const item = receipt.items?.find(item => item.id === claim.itemId);
        if (!item) return null;
        
        return {
          id: claim.itemId,
          receiptId: claim.receiptId,
          itemId: claim.itemId,
          userId: claim.userId,
          claimedAt: claim.claimedAt,
          receiptName: receipt.name,
          name: item.name,
          price: item.price,
          priceEUR: item.priceEUR || item.price,
          tags: item.tags || [],
          confidence: item.confidence
        };
      }).filter(Boolean);

      res.status(200).json(claimsWithDetails);
    } catch (error) {
      console.error('Get user claims error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
