import { connectToDatabase } from '@/lib/db/mongodb';
import { handleConditionalGet, updateMetaTimestamp, getLatestTimestamp } from '@/lib/utils/http';

export const config = {
  api: {
    bodyParser: { sizeLimit: '50mb' },
    responseLimit: '50mb',
  },
};

export default async function handler(req, res) {
  const { db } = await connectToDatabase();

  if (req.method === 'GET') {
    try {
      const receipts = await db.collection('receipts').find({}).toArray();

      const metaDoc = await db.collection('meta').findOne({ _id: 'receipts' });
      const metaTimestamp = metaDoc?.updatedAt ? new Date(metaDoc.updatedAt) : null;
      const latest = getLatestTimestamp(receipts, metaTimestamp);

      if (latest && handleConditionalGet(res, req, latest)) return;
      
      const claims = await db.collection('claims').find({}).toArray();
      const claimsByReceipt = claims.reduce((acc, c) => {
        if (!acc[c.receiptId]) acc[c.receiptId] = [];
        acc[c.receiptId].push(c);
        return acc;
      }, {});

      const receiptsWithClaims = receipts.map(receipt => {
        const receiptClaims = claimsByReceipt[receipt._id.toString()] || [];
        const receiptItems = receipt.items?.map(item => {
          const claim = receiptClaims.find(c => c.itemId === item.id);
          return claim ? { ...item, claimedBy: claim.userId, claimedAt: claim.claimedAt } : item;
        }) || [];
        
        return {
          ...receipt,
          id: receipt._id.toString(),
          items: receiptItems,
          discounts: receipt.discounts || [],
          claimedItems: receiptClaims.length
        };
      });
      
      res.status(200).json(receiptsWithClaims);
    } catch (error) {
      console.error('Get receipts error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else if (req.method === 'POST') {
    try {
      const body = req.body;
      const now = new Date().toISOString();
      
      const receipt = {
        name: body.name || `Receipt ${new Date().toLocaleDateString('de-DE')}`,
        createdAt: body.createdAt ? new Date(body.createdAt) : new Date(),
        imageUrl: body.imageUrl,
        imageId: body.imageId || null,
        items: body.items || [],
        discounts: body.discounts || [],
        totalAmount: body.totalAmount || 0,
        uploadedBy: body.uploadedBy || null,
        participants: body.participants || [],
        text: body.text || '',
        updatedAt: now
      };

      const result = await db.collection('receipts').insertOne(receipt);
      await updateMetaTimestamp(db, 'receipts');
      
      res.status(200).json({
        ...receipt,
        id: result.insertedId.toString(),
        _id: result.insertedId,
        claimedItems: 0
      });
    } catch (error) {
      console.error('Create receipt error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
