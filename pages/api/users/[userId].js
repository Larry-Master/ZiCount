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
      await db.collection('people').deleteOne({ _id: new ObjectId(userId) });
      res.status(204).end();
    } catch (err) {
      console.error('DELETE /api/users/[id] error', err);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else {
    res.setHeader('Allow', ['GET','DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
