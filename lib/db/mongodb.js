import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const options = {
  maxPoolSize: process.env.MONGODB_MAX_POOL ? parseInt(process.env.MONGODB_MAX_POOL, 10) : (process.env.VERCEL ? 1 : 10),
  minPoolSize: 0,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  maxIdleTimeMS: 10000,
  connectTimeoutMS: 10000,
};

let clientPromise;

if (!global._mongoClientPromise) {
  const client = new MongoClient(uri, options);
  global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

export async function connectToDatabase() {
  const client = await clientPromise;
  return { client, db: client.db('zicount') };
}

export default clientPromise;
