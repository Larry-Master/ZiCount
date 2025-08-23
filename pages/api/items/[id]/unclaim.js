import { connectToDatabase } from '@/lib/db/mongodb';

export default async function handler(req, res) {
  const { id } = req.query; // item ID
  const { db } = await connectToDatabase();

  if (req.method === 'DELETE') {
    try {
      // Find and delete the claim
      const result = await db.collection('claims').deleteOne({ itemId: id });
      
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Claim not found' });
      }

      res.status(200).json({ success: true, message: 'Item unclaimed successfully' });
    } catch (error) {
      console.error('Unclaim item error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else {
    res.setHeader('Allow', ['DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
