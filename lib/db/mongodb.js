import { MongoClient } from 'mongodb';
import { ObjectId } from 'mongodb';

const uri = process.env.MONGODB_URI;
const options = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

let client;
let clientPromise;

// Use a lazy initializer so we don't attempt to connect during module import.
// This prevents build-time errors when MONGODB_URI is not available.
function ensureClientPromise() {
  if (clientPromise) return clientPromise;

  // In development, cache the promise on the global object to survive HMR.
  if (process.env.NODE_ENV === 'development') {
    const globalAny = global;
    if (!globalAny._mongoClientPromise) {
      client = new MongoClient(uri, options);
      globalAny._mongoClientPromise = client.connect();
    }
    clientPromise = globalAny._mongoClientPromise;
  } else {
    // Production: create client/promise on first use.
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
  }

  return clientPromise;
}

export async function connectToDatabase() {
  try {
    // Only create/connect when this function is called at runtime.
    const conn = await ensureClientPromise();
    const db = conn.db('zicount');
    return { client: conn, db };
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

// Export default as undefined until a connection is made via connectToDatabase.
export default clientPromise;

// Helper to safely convert a value to ObjectId. Returns null if invalid.
export function safeObjectId(value) {
  if (!value || typeof value !== 'string') return null;
  // basic check: 24 hex characters
  if (!/^[0-9a-fA-F]{24}$/.test(value)) return null;
  try {
    return new ObjectId(value);
  } catch (err) {
    return null;
  }
}
