import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  const { rid } = req.query;
  const { db } = await connectToDatabase();

  if (req.method === 'GET') {
    try {
      if (!ObjectId.isValid(rid)) {
        return res.status(400).json({ error: 'Invalid receipt ID' });
      }

      const receipt = await db.collection('receipts').findOne({ _id: new ObjectId(rid) });
      
      if (!receipt) {
        return res.status(404).json({ error: 'Receipt not found' });
      }

      // Get claims for this receipt
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
      
      const receiptWithClaims = {
        ...receipt,
        id: receipt._id.toString(),
        items: receiptItems,
        claimedItems: claims.length
      };

      res.status(200).json(receiptWithClaims);
    } catch (error) {
      console.error('Get receipt error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else if (req.method === 'DELETE') {
    try {
      if (!ObjectId.isValid(rid)) {
        return res.status(400).json({ error: 'Invalid receipt ID' });
      }

      // Delete all claims for this receipt first
      await db.collection('claims').deleteMany({ receiptId: rid });
      
      // Delete the receipt
      const result = await db.collection('receipts').deleteOne({ _id: new ObjectId(rid) });
      
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Receipt not found' });
      }

      res.status(200).json({ success: true, message: 'Receipt deleted successfully' });
    } catch (error) {
      console.error('Delete receipt error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else {
    res.setHeader('Allow', ['GET', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
