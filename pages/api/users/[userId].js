import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  const { userId } = req.query;
  const { db } = await connectToDatabase();

  if (req.method === 'GET') {
    try {
      const u = await db.collection('people').findOne({ _id: new ObjectId(userId) });
      if (!u) return res.status(404).json({ error: 'Not found' });
      res.status(200).json({ id: u._id.toString(), name: u.name, color: u.color });
    } catch (err) {
      console.error('GET /api/users/[id] error', err);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else if (req.method === 'DELETE') {
    try {
      if (!ObjectId.isValid(userId)) {
        return res.status(400).json({ error: 'Invalid user ID' });
      }

      // First, remove all claims by this user
      await db.collection('claims').deleteMany({ userId: userId });
      
      // Remove the user from all receipt participants
      await db.collection('receipts').updateMany(
        { participants: userId },
        { $pull: { participants: userId } }
      );
      
      // Also update any items that have this user as a participant
      await db.collection('receipts').updateMany(
        { "items.participant": userId },
        { $unset: { "items.$.participant": "" } }
      );

      // Finally, delete the user
      const deleteResult = await db.collection('people').deleteOne({ _id: new ObjectId(userId) });
      
      if (deleteResult.deletedCount === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.status(200).json({ success: true, message: 'User and related data deleted successfully' });
    } catch (err) {
      console.error('DELETE /api/users/[id] error', err);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else {
    res.setHeader('Allow', ['GET','DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
