/**
 * MongoDB Database Connection Manager
 * 
 * Handles MongoDB connections with optimizations for both development and production:
 * - Development: Reuses connections across Hot Module Replacement (HMR)
 * - Production: Efficient connection pooling and timeout management
 * - Lazy initialization to prevent build-time connection attempts
 * 
 * Configuration:
 * - Connection pooling (max 10 concurrent connections)
 * - 5s server selection timeout
 * - 45s socket timeout for long-running operations
 * 
 * Database: 'zicount'
 * Collections: receipts, users, claims
 */

import { MongoClient } from 'mongodb';
import { ObjectId } from 'mongodb';

// MongoDB connection configuration
const uri = process.env.MONGODB_URI;
const options = {
  maxPoolSize: 10,          // Maximum number of connections in pool
  serverSelectionTimeoutMS: 5000,   // Time to wait for server selection
  socketTimeoutMS: 45000,   // Socket timeout for operations
};

let client;
let clientPromise;

/**
 * Lazy client initialization to prevent build-time connection attempts
 * Implements different strategies for development vs production environments
 * 
 * Development: Caches promise globally to survive Hot Module Replacement
 * Production: Creates fresh client/promise on first use
 */
function ensureClientPromise() {
  if (clientPromise) return clientPromise;

  // Development mode: preserve connection across HMR cycles
  if (process.env.NODE_ENV === 'development') {
    const globalAny = global;
    if (!globalAny._mongoClientPromise) {
      client = new MongoClient(uri, options);
      globalAny._mongoClientPromise = client.connect();
    }
    clientPromise = globalAny._mongoClientPromise;
  } else {
    // Production: create fresh client and connection promise
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
  }

  return clientPromise;
}

/**
 * Main database connection function
 * Returns connected client and database instance
 * 
 * @returns {Object} { client: MongoClient, db: Database }
 * @throws {Error} MongoDB connection errors
 */
export async function connectToDatabase() {
  try {
    // Establish connection only when function is called at runtime
    const conn = await ensureClientPromise();
    const db = conn.db('zicount');
    return { client: conn, db };
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

// Export connection promise for advanced use cases
export default clientPromise;
