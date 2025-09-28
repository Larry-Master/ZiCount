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

// Allow overriding pool size via environment variable for flexibility in
// different deployment environments (local, serverless, etc.). Serverless
// platforms (Vercel, Cloud Functions) often create many isolated instances
// each with their own connection pool. To avoid exhausting Atlas connection
// limits, use a small default pool in those environments.
const DEFAULT_POOL = process.env.MONGODB_MAX_POOL
  ? parseInt(process.env.MONGODB_MAX_POOL, 10)
  : (process.env.VERCEL ? 2 : 10);

const options = {
  maxPoolSize: DEFAULT_POOL,          // Maximum number of connections in pool
  serverSelectionTimeoutMS: 5000,     // Time to wait for server selection
  socketTimeoutMS: 45000,             // Socket timeout for operations
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
  // If we already created a client promise in this runtime, reuse it
  if (clientPromise) return clientPromise;

  // Use globalThis so the cache survives across module reloads and serverless
  // invocations in environments like Vercel/Cloud Functions. This avoids
  // creating a new connection pool on every invocation which can quickly
  // exhaust Atlas connection limits.
  const globalAny = globalThis;
  if (globalAny._mongoClient && globalAny._mongoClientPromise) {
    client = globalAny._mongoClient;
    clientPromise = globalAny._mongoClientPromise;
    return clientPromise;
  }

  // Create and cache a single MongoClient instance and its connect() promise
  client = new MongoClient(uri, options);
  clientPromise = client.connect();

  // Cache on global so subsequent imports reuse the same promise/client
  try {
    globalAny._mongoClient = client;
    globalAny._mongoClientPromise = clientPromise;
  } catch (e) {
    // In very restricted runtimes assigning to globalThis may fail — ignore
    // and continue using the local variables.
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
