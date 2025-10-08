// Shared conditional fetch utility
export async function conditionalFetch(url, prevData) {
  const headers = {};
  if (prevData?._lastModified) {
    headers['If-Modified-Since'] = prevData._lastModified;
  }

  const res = await fetch(url, { headers });
  if (res.status === 304) return { __notModified: true };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  
  const data = await res.json();
  data._lastModified = res.headers.get('last-modified') || new Date().toUTCString();
  return data;
}

// Set Last-Modified header and check If-Modified-Since
export function handleConditionalGet(res, req, timestamp) {
  if (!timestamp) return false;
  
  const lastModified = timestamp instanceof Date ? timestamp.toUTCString() : timestamp;
  res.setHeader('Last-Modified', lastModified);
  
  const ifModifiedSince = req.headers['if-modified-since'];
  if (ifModifiedSince) {
    const since = new Date(ifModifiedSince);
    const compareDate = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (!isNaN(since) && since >= compareDate) {
      res.status(304).end();
      return true;
    }
  }
  return false;
}

// Update meta collection timestamp
export async function updateMetaTimestamp(db, collectionName) {
  try {
    await db.collection('meta').updateOne(
      { _id: collectionName },
      { $set: { updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
  } catch (e) {
    // Non-critical, ignore
  }
}

// Get latest timestamp from documents
export function getLatestTimestamp(docs, metaTimestamp = null) {
  const timestamps = [metaTimestamp].filter(Boolean);
  
  for (const doc of docs) {
    const t = doc.updatedAt ? new Date(doc.updatedAt) : 
              (doc.createdAt ? new Date(doc.createdAt) : null);
    if (t) timestamps.push(t);
  }
  
  return timestamps.length > 0 
    ? timestamps.reduce((a, b) => a > b ? a : b)
    : null;
}
