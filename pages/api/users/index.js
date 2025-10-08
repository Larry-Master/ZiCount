import { connectToDatabase } from '@/lib/db/mongodb';
import { handleConditionalGet, updateMetaTimestamp, getLatestTimestamp } from '@/lib/utils/http';

const COLORS = ['#007bff', '#28a745', '#fd7e14', '#dc3545', '#6f42c1', '#e83e8c', '#20c997', '#ffc107'];

export default async function handler(req, res) {
  const { db } = await connectToDatabase();

  if (req.method === 'GET') {
    try {
      const users = await db.collection('people').find({}).toArray();
      const metaDoc = await db.collection('meta').findOne({ _id: 'people' });
      const metaTimestamp = metaDoc?.updatedAt ? new Date(metaDoc.updatedAt) : null;
      const latest = getLatestTimestamp(users, metaTimestamp);

      if (latest && handleConditionalGet(res, req, latest)) return;

      const mapped = users.map(u => ({ 
        id: u._id.toString(), 
        name: u.name, 
        color: u.color, 
        createdAt: u.createdAt, 
        updatedAt: u.updatedAt 
      }));
      res.status(200).json(mapped);
    } catch (err) {
      console.error('GET /api/users error', err);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else if (req.method === 'POST') {
    try {
      const { name } = req.body || {};
      if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

      const baseName = name.trim();
      const existingUsers = await db.collection('people').find({}, { projection: { name: 1 } }).toArray();
      const existingNames = existingUsers.map(u => u.name);
      
      let finalName = baseName;
      if (existingNames.includes(finalName)) {
        let counter = 2;
        while (existingNames.includes(`${baseName} ${counter}`)) counter++;
        finalName = `${baseName} ${counter}`;
      }

      const count = await db.collection('people').countDocuments();
      const now = new Date().toISOString();
      
      const result = await db.collection('people').insertOne({ 
        name: finalName, 
        color: COLORS[count % COLORS.length], 
        createdAt: now, 
        updatedAt: now 
      });

      await updateMetaTimestamp(db, 'people');

      res.status(201).json({ 
        id: result.insertedId.toString(), 
        name: finalName, 
        color: COLORS[count % COLORS.length], 
        createdAt: now, 
        updatedAt: now 
      });
    } catch (err) {
      console.error('POST /api/users error', err);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else {
    res.setHeader('Allow', ['GET','POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
