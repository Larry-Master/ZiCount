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

// If deployed on Vercel, default to a very small pool to avoid creating many
// connections across function instances. You can still override via
// MONGODB_MAX_POOL in the environment.
const IS_VERCEL = !!process.env.VERCEL;

const DEFAULT_POOL = process.env.MONGODB_MAX_POOL
  ? parseInt(process.env.MONGODB_MAX_POOL, 10)
  : (IS_VERCEL ? 1 : 10);

const options = {
  maxPoolSize: DEFAULT_POOL,       // Maximum number of connections in pool
  minPoolSize: 0,                  // Allow pool to scale down to zero
  serverSelectionTimeoutMS: 5000,  // Time to wait for server selection
  socketTimeoutMS: 45000,          // Socket timeout for operations
  maxIdleTimeMS: 10000,            // Close idle sockets after 10s
  connectTimeoutMS: 10000,         // Short connect timeout to fail fast
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
    // If another concurrent call already created (or is creating) the client,
    // reuse that promise. We assign the promise to globalThis immediately so
    // other concurrent invocations observe it and don't each create a client.
    if (globalAny._mongoClientPromise) {
      client = globalAny._mongoClient;
      clientPromise = globalAny._mongoClientPromise;
      return clientPromise;
    }

    // Create a new client and its connect() promise, then store that promise
    // on globalThis immediately to avoid races where multiple requests each
    // construct a client concurrently.
    const newClient = new MongoClient(uri, options);
    const connectPromise = newClient.connect();

    try {
      globalAny._mongoClient = newClient;
      globalAny._mongoClientPromise = connectPromise;
    } catch (e) {
      // Assigning to global may fail in very restricted runtimes. In that case
      // we'll continue with local references.
    }

    client = globalAny._mongoClient || newClient;
    clientPromise = globalAny._mongoClientPromise || connectPromise;

    try {
      console.debug('[mongo] creating new MongoClient (pool=%d, vercel=%s)', DEFAULT_POOL, IS_VERCEL);
    } catch (e) {}

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
