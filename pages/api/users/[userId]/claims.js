import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  const { userId } = req.query;
  const { db } = await connectToDatabase();

  if (req.method === 'GET') {
    try {
      // Get all claims for this user
      const claims = await db.collection('claims').find({ userId }).toArray();
      
      // Determine latest timestamp among claims and receipts referenced
      let latest = null;
      for (const c of claims) {
        if (c.claimedAt) {
          const t = new Date(c.claimedAt);
          if (!latest || t > latest) latest = t;
        }
        // try to quickly get the receipt's updatedAt (cheap by _id lookup)
        try {
          const r = await db.collection('receipts').findOne({ _id: new ObjectId(c.receiptId) }, { projection: { updatedAt: 1, createdAt: 1 } });
          if (r) {
            const t = r.updatedAt ? new Date(r.updatedAt) : (r.createdAt ? new Date(r.createdAt) : null);
            if (t && (!latest || t > latest)) latest = t;
          }
        } catch (e) {
          // ignore
        }
      }

      if (latest) {
        const lm = latest.toUTCString();
        res.setHeader('Last-Modified', lm);
        const ifModifiedSince = req.headers['if-modified-since'];
        if (ifModifiedSince) {
          const since = new Date(ifModifiedSince);
          if (!isNaN(since) && since >= latest) return res.status(304).end();
        }
      }
      
      // Get receipt details for each claim
      const claimsWithDetails = await Promise.all(
        claims.map(async (claim) => {
          const receipt = await db.collection('receipts').findOne({
            _id: new ObjectId(claim.receiptId)
          });
          
          if (!receipt) return null;
          
          // Find the specific item in the receipt
          const item = receipt.items?.find(item => item.id === claim.itemId);
          
          if (!item) return null;
          
          return {
            id: claim.itemId, // Use itemId as the main id for unclaiming
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
        })
      );
      
      // Filter out null values (deleted receipts/items)
      const validClaims = claimsWithDetails.filter(claim => claim !== null);

      res.status(200).json(validClaims);
    } catch (error) {
      console.error('Get user claims error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
