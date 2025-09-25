import { connectToDatabase } from '@/lib/db/mongodb';

const COLORS = ['#007bff', '#28a745', '#fd7e14', '#dc3545', '#6f42c1', '#e83e8c', '#20c997', '#ffc107'];

export default async function handler(req, res) {
  const { db } = await connectToDatabase();

  if (req.method === 'GET') {
    try {
      const users = await db.collection('people').find({}).toArray();
      const mapped = users.map(u => ({ id: u._id.toString(), name: u.name, color: u.color }));
      res.status(200).json(mapped);
    } catch (err) {
      console.error('GET /api/users error', err);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else if (req.method === 'POST') {
    try {
      const { name } = req.body || {};
      if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

      const baseName = name.trim();
      let finalName = baseName;
      
      // Check for duplicates and append numbers if needed
      const existingUsers = await db.collection('people').find({}, { projection: { name: 1 } }).toArray();
      const existingNames = existingUsers.map(user => user.name);
      
      if (existingNames.includes(finalName)) {
        let counter = 2;
        while (existingNames.includes(`${baseName} ${counter}`)) {
          counter++;
        }
        finalName = `${baseName} ${counter}`;
      }

      // pick a color based on count
      const count = await db.collection('people').countDocuments();
      const color = COLORS[count % COLORS.length];

      const result = await db.collection('people').insertOne({ name: finalName, color, createdAt: new Date() });
      const created = { id: result.insertedId.toString(), name: finalName, color };
      res.status(201).json(created);
    } catch (err) {
      console.error('POST /api/users error', err);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else {
    res.setHeader('Allow', ['GET','POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
