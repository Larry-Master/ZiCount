# Architecture Guide - After Refactoring

## Data Flow Architecture

### Client-Side (React Components)
```
Component
   ↓
React Query Hook (usePeople, useReceipts, etc.)
   ↓
API Client (lib/api/client.js)
   ↓
Fetch API
   ↓
API Routes
```

### Server-Side (API Routes)
```
API Route Handler
   ↓
HTTP Utilities (handleConditionalGet, etc.)
   ↓
MongoDB Connection (connectToDatabase)
   ↓
Database Operations
   ↓
Response (with Last-Modified headers)
```

## Key Architectural Patterns

### 1. React Query for State Management
All data fetching now uses React Query instead of manual state management:

```javascript
// OLD: Manual state + useEffect + polling
const [data, setData] = useState([]);
const [loading, setLoading] = useState(false);
useEffect(() => { /* fetch logic */ }, []);

// NEW: React Query handles everything
const { data, loading, error } = useQuery({
  queryKey: ['key'],
  queryFn: fetchFunction,
  refetchInterval: 7000
});
```

**Benefits:**
- Automatic caching
- Automatic background refetching
- Optimistic updates
- Request deduplication
- Stale-while-revalidate pattern

### 2. Conditional GET Pattern
All API endpoints support HTTP conditional GET:

```javascript
// Client side (hooks)
const prev = queryClient.getQueryData(['key']);
const data = await conditionalFetch('/api/endpoint', prev);
if (data?.__notModified) return prev;

// Server side (API routes)
const latest = getLatestTimestamp(docs, metaTimestamp);
if (handleConditionalGet(res, req, latest)) return; // 304 Not Modified
```

**Benefits:**
- Reduced bandwidth
- Faster responses
- Better performance
- Less database load

### 3. Meta Collection Pattern
Track collection-level changes for proper cache invalidation:

```javascript
// After any create/delete operation
await updateMetaTimestamp(db, 'receipts');

// When fetching, include meta timestamp
const metaDoc = await db.collection('meta').findOne({ _id: 'receipts' });
const latest = getLatestTimestamp(docs, metaDoc?.updatedAt);
```

**Why?** DELETE operations don't change remaining documents' timestamps, but clients need to know the list changed.

### 4. Optimistic Updates Pattern
All mutations use optimistic updates:

```javascript
const mutation = useMutation({
  mutationFn: actualApiCall,
  onMutate: async (variables) => {
    // 1. Cancel ongoing queries
    await queryClient.cancelQueries({ queryKey });
    
    // 2. Save current state
    const prev = queryClient.getQueryData({ queryKey });
    
    // 3. Optimistically update
    queryClient.setQueryData({ queryKey }, newData);
    
    return { prev }; // Context for rollback
  },
  onError: (err, variables, context) => {
    // 4. Rollback on error
    queryClient.setQueryData({ queryKey }, context.prev);
  },
  onSettled: () => {
    // 5. Refetch to sync with server
    queryClient.invalidateQueries({ queryKey });
  }
});
```

### 5. Global MongoDB Connection
Simple, efficient connection pooling:

```javascript
// Global connection promise (survives serverless cold starts)
if (!global._mongoClientPromise) {
  const client = new MongoClient(uri, options);
  global._mongoClientPromise = client.connect();
}

// Use in API routes
const { db } = await connectToDatabase();
```

**Benefits:**
- Connection reuse across requests
- Survives HMR in development
- Efficient for serverless (Vercel)
- No connection leaks

## File Organization

### Shared Utilities
```
lib/
  utils/
    http.js          # Shared HTTP utilities (conditionalFetch, etc.)
    apiHelpers.js    # API route helpers (checkMethod, errorResponse)
    avatar.js        # Avatar utilities
    currency.js      # Currency formatting
    ...
```

### Hooks (React Query)
```
lib/
  hooks/
    usePeople.js     # People/users management
    useReceipts.js   # Receipts, claims, mutations
    useReceiptUpload.js
```

### API Layer
```
lib/
  api/
    client.js        # Centralized HTTP client
  db/
    mongodb.js       # Database connection
```

### API Routes
```
pages/
  api/
    users/
      index.js       # GET, POST users
      [userId].js    # GET, DELETE user
      [userId]/
        claims.js    # GET user's claims
    receipts/
      index.js       # GET, POST receipts
      [rid].js       # GET, DELETE, PATCH, PUT receipt
      [rid]/items/[id]/
        claim.js     # POST claim item
    items/
      [id]/
        unclaim.js   # DELETE unclaim item
```

## Data Synchronization Strategy

### Multi-Tab Synchronization
React Query handles this automatically via:
- `refetchOnWindowFocus: true` - Refetch when tab becomes active
- `refetchInterval` - Periodic background refetching when visible
- Shared cache across all hook instances

### Real-Time Updates (Optimistic)
1. User performs action (e.g., claim item)
2. UI updates immediately (optimistic)
3. Request sent to server in background
4. On success: query invalidated, fresh data fetched
5. On error: rollback to previous state

### Polling Strategy
Different resources have different polling intervals:
- People: 7s (changes frequently during setup)
- Receipts: 15s (moderate update frequency)
- Individual receipt: 7s (when viewing details)
- User claims: 10s (moderate update frequency)

All polling only happens when:
- Window is visible (`document.visibilityState === 'visible'`)
- Component is mounted
- Query is enabled

## Performance Optimizations

### 1. Batch Queries (N+1 → 1)
```javascript
// OLD: N+1 queries
const receiptsWithClaims = await Promise.all(
  receipts.map(async (receipt) => {
    const claims = await db.collection('claims').find({ receiptId: receipt._id }).toArray();
    return { ...receipt, claims };
  })
);

// NEW: 1 batch query
const claims = await db.collection('claims').find({}).toArray();
const claimsByReceipt = claims.reduce((acc, c) => {
  if (!acc[c.receiptId]) acc[c.receiptId] = [];
  acc[c.receiptId].push(c);
  return acc;
}, {});
```

### 2. Conditional GET (304 Not Modified)
- Clients send `If-Modified-Since` header
- Server responds with 304 if not modified
- Saves ~90% bandwidth for unchanged data

### 3. Query Deduplication
React Query automatically deduplicates simultaneous requests to the same endpoint.

### 4. Stale-While-Revalidate
```javascript
{
  staleTime: 1000 * 60 * 5,  // 5min - data considered fresh
  cacheTime: 1000 * 60 * 30, // 30min - keep in cache
}
```

## Error Handling Strategy

### Client-Side
```javascript
const { data, error, isLoading } = useQuery(...);

if (isLoading) return <Loading />;
if (error) return <ErrorMessage error={error} />;
return <Component data={data} />;
```

### Server-Side
```javascript
try {
  // Operation
  res.status(200).json(result);
} catch (error) {
  console.error('Operation error:', error);
  res.status(500).json({ error: 'Internal server error' });
}
```

### Mutation Errors
```javascript
const mutation = useMutation({
  mutationFn: apiCall,
  onError: (err) => {
    // Automatic rollback via context
    // User sees error message
    console.error('Mutation failed:', err);
  }
});
```

## Best Practices Applied

1. **Single Source of Truth**: React Query cache
2. **Optimistic Updates**: Immediate UI feedback
3. **Error Recovery**: Automatic rollback on failure
4. **Cache Invalidation**: Proper query invalidation
5. **Request Deduplication**: Prevent duplicate requests
6. **Connection Pooling**: Reuse MongoDB connections
7. **Conditional GET**: Reduce unnecessary data transfer
8. **Batch Operations**: Minimize database queries
9. **Shared Utilities**: DRY principle
10. **Consistent Patterns**: Same approach everywhere

## Migration Notes

### No Breaking Changes
All refactoring is internal - the component API remains the same:

```javascript
// Still works exactly the same way
const { people, loading, error, addPerson, removePerson } = usePeople();
const { receipts, loading, error, refetch } = useReceipts();
```

### What Changed Under the Hood
1. Manual state → React Query
2. Manual polling → React Query intervals
3. Manual pub/sub → React Query cache
4. Duplicate code → Shared utilities
5. N+1 queries → Batch queries
6. Verbose code → Concise code

## Debugging Tips

### React Query DevTools
Already included in the app - shows:
- All queries and their state
- Cache contents
- Query invalidations
- Mutations in progress

### MongoDB Connection Issues
Check:
1. `process.env.MONGODB_URI` is set
2. Connection pool size (defaults: Vercel=1, local=10)
3. Global object caching: `global._mongoClientPromise`

### Cache Issues
```javascript
// Force refetch
queryClient.invalidateQueries({ queryKey: ['receipts'] });

// Clear cache
queryClient.clear();

// Get cache data
queryClient.getQueryData(['receipts']);
```

### Conditional GET Issues
Check:
1. `Last-Modified` header in response
2. `If-Modified-Since` header in request
3. Timestamp calculation in `getLatestTimestamp()`
4. Meta collection timestamps

## Conclusion

The new architecture is:
- **Simpler**: Less code, clearer patterns
- **Faster**: Better caching, batch queries, conditional GET
- **More Robust**: React Query handles edge cases
- **More Maintainable**: Consistent patterns, shared utilities
- **More Scalable**: Proper connection pooling, efficient queries

All while maintaining 100% backward compatibility!
