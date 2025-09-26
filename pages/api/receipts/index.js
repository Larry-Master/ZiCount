import { connectToDatabase } from '@/lib/db/mongodb';

// Increase timeout and body size limits for large receipt data
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
    responseLimit: '50mb',
  },
};

export default async function handler(req, res) {
  const { db } = await connectToDatabase();

  if (req.method === 'GET') {
    try {
      const receipts = await db.collection('receipts').find({}).toArray();

      // Determine latest updatedAt across receipts for Last-Modified
      const latest = receipts.reduce((acc, r) => {
        const t = r.updatedAt ? new Date(r.updatedAt) : (r.createdAt ? new Date(r.createdAt) : null);
        if (!t) return acc;
        return acc && acc > t ? acc : t;
      }, null);

      if (latest) {
        const lastModified = latest.toUTCString();
        res.setHeader('Last-Modified', lastModified);
        const ifModifiedSince = req.headers['if-modified-since'];
        if (ifModifiedSince) {
          const since = new Date(ifModifiedSince);
          if (!isNaN(since) && since >= latest) {
            return res.status(304).end();
          }
        }
      }
      
      // Add claim information to each receipt
      const receiptsWithClaims = await Promise.all(
        receipts.map(async (receipt) => {
          const claims = await db.collection('claims').find({
            receiptId: receipt._id.toString()
          }).toArray();
          
          // Merge receipt items with claims status
          const receiptItems = receipt.items?.map(item => {
            const claim = claims.find(c => c.itemId === item.id);
            return claim ? {
              ...item,
              claimedBy: claim.userId,
              claimedAt: claim.claimedAt
            } : item;
          }) || [];
          
          return {
            ...receipt,
            id: receipt._id.toString(),
            items: receiptItems,
            discounts: receipt.discounts || [],
            claimedItems: claims.length
          };
        })
      );
      
      res.status(200).json(receiptsWithClaims);
    } catch (error) {
      console.error('Get receipts error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else if (req.method === 'POST') {
    try {
      const body = req.body;
      
      const receipt = {
        name: body.name || `Receipt ${new Date().toLocaleDateString('de-DE')}`,
        // allow client to pass createdAt (e.g., manual form), fallback to now
        createdAt: body.createdAt ? new Date(body.createdAt) : new Date(),
        imageUrl: body.imageUrl,
        items: body.items || [],
        discounts: body.discounts || [],
        // Only use totalAmount from request, never calculate fallback
        totalAmount: body.totalAmount || 0,
        uploadedBy: body.uploadedBy || null,
        // persist participants if provided (used for Teilnehmerliste)
        participants: body.participants || [],
        text: body.text || ''
      };

  // set updatedAt for change tracking
  receipt.updatedAt = new Date().toISOString();
  const result = await db.collection('receipts').insertOne(receipt);
      
      const savedReceipt = {
        ...receipt,
        id: result.insertedId.toString(),
        _id: result.insertedId,
        claimedItems: 0
      };

  // bump receipts meta
  try { await db.collection('meta').updateOne({ _id: 'receipts' }, { $set: { updatedAt: new Date().toISOString() } }, { upsert: true }); } catch (e) {}
  res.status(200).json(savedReceipt);
    } catch (error) {
      console.error('Create receipt error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
