import { connectToDatabase } from '@/lib/db/mongodb';

export default async function handler(req, res) {
  const { db } = await connectToDatabase();

  if (req.method === 'GET') {
    try {
      const receipts = await db.collection('receipts').find({}).toArray();
      
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
        totalAmount: body.totalAmount,
        uploadedBy: body.uploadedBy || 'anonymous',
        // persist participants if provided (used for Teilnehmerliste)
        participants: body.participants || [],
        text: body.text || ''
      };

      const result = await db.collection('receipts').insertOne(receipt);
      
      const savedReceipt = {
        ...receipt,
        id: result.insertedId.toString(),
        _id: result.insertedId,
        claimedItems: 0
      };

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
