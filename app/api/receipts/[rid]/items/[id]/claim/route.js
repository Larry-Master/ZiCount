import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';

export async function POST(request, context) {
  try {
    // Safely extract params with multiple fallbacks
    const params = context?.params || {};
    const { rid, id } = params;
    
    // Validate that both rid and id exist and are strings
    if (!rid || typeof rid !== 'string' || rid.trim() === '') {
      return Response.json({ error: 'Invalid receipt ID' }, { status: 400 });
    }
    if (!id || typeof id !== 'string' || id.trim() === '') {
      return Response.json({ error: 'Invalid item ID' }, { status: 400 });
    }
    
    const body = await request.json();
    const { userId } = body;

    const { db } = await connectToDatabase();
    
    // Check if item exists and is not already claimed
    const existingClaim = await db.collection('claims').findOne({ 
      itemId: id,
      receiptId: rid 
    });
    
    if (existingClaim) {
      return Response.json({ error: 'Item already claimed' }, { status: 400 });
    }

    // Get item details from receipt
    let receiptObjectId;
    try {
      receiptObjectId = new ObjectId(rid);
    } catch (err) {
      return Response.json({ error: 'Invalid receipt ID format' }, { status: 400 });
    }
    
    const receipt = await db.collection('receipts').findOne({ 
      _id: receiptObjectId
    });
    
    if (!receipt) {
      return Response.json({ error: 'Receipt not found' }, { status: 404 });
    }

    const item = receipt.items?.find(item => item.id === id);
    if (!item) {
      return Response.json({ error: 'Item not found' }, { status: 404 });
    }

    // Create the claim
    const claim = {
      itemId: id,
      receiptId: rid,
      userId,
      claimedAt: new Date(),
      itemName: item.name,
      itemPrice: item.price,
      itemTags: item.tags || []
    };

    const result = await db.collection('claims').insertOne(claim);

    return Response.json({
      id,
      claimedBy: userId,
      claimedAt: claim.claimedAt.toISOString(),
      receiptId: rid,
      claimId: result.insertedId
    });
  } catch (error) {
    console.error('Claim error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
