import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';

export async function POST(request, { params }) {
  try {
    // keep await semantics but guard against undefined params
    const { rid, id } = await Promise.resolve(params || {});
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
    const receipt = await db.collection('receipts').findOne({ 
      _id: new ObjectId(rid) 
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
