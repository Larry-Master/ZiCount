/**
 * Netlify Function: Users (GET/POST)
 */

const { MongoClient, ObjectId } = require('mongodb');

const COLORS = ['#007bff', '#28a745', '#fd7e14', '#dc3545', '#6f42c1', '#e83e8c', '#20c997', '#ffc107'];

exports.handler = async (event, context) => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();

  try {
    if (event.httpMethod === 'GET') {
      const users = await db.collection('people').find({}).toArray();
      const mapped = users.map(u => ({ id: u._id.toString(), name: u.name, color: u.color }));
      
      await client.close();
      return {
        statusCode: 200,
        body: JSON.stringify(mapped),
      };

    } else if (event.httpMethod === 'POST') {
      const { name } = JSON.parse(event.body || '{}');
      if (!name || !name.trim()) {
        await client.close();
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Name is required' }),
        };
      }

      const baseName = name.trim();
      let finalName = baseName;
      
      // Check for duplicates
      const existingUsers = await db.collection('people').find({}, { projection: { name: 1 } }).toArray();
      const existingNames = existingUsers.map(user => user.name);
      
      if (existingNames.includes(finalName)) {
        let counter = 1;
        while (existingNames.includes(`${baseName} ${counter}`)) {
          counter++;
        }
        finalName = `${baseName} ${counter}`;
      }
      
      // Assign color
      const colorIndex = existingUsers.length % COLORS.length;
      const color = COLORS[colorIndex];
      
      const user = { name: finalName, color };
      const result = await db.collection('people').insertOne(user);
      
      const savedUser = { 
        id: result.insertedId.toString(), 
        name: finalName, 
        color 
      };

      await client.close();
      return {
        statusCode: 200,
        body: JSON.stringify(savedUser),
      };

    } else {
      await client.close();
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

  } catch (error) {
    await client.close();
    console.error('Users API error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Database error' }),
    };
  }
};