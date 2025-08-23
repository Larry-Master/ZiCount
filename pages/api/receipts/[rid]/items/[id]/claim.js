import { connectToDatabase } from '@/lib/db/mongodb';

export default async function handler(req, res) {
  const { rid, id } = req.query; // receipt ID and item ID
  const { db } = await connectToDatabase();

  if (req.method === 'POST') {
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
      console.error('Claim item error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
