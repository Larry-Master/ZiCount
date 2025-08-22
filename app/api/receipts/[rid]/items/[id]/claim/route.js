import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import { safeObjectId } from '@/lib/db/mongodb';
import { NextResponse } from 'next/server';

export async function POST(request, context) {
  try {
  // Await params directly (Next.js requires awaiting params) and extract safely
  const params = await context.params;
  const { rid, id } = params || {};
    
    // Validate that both rid and id exist and are strings
    if (!rid || typeof rid !== 'string' || rid.trim() === '') {
      return NextResponse.json({ error: 'Invalid receipt ID' }, { status: 400 });
    }
    if (!id || typeof id !== 'string' || id.trim() === '') {
      return NextResponse.json({ error: 'Invalid item ID' }, { status: 400 });
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
      return NextResponse.json({ error: 'Item already claimed' }, { status: 400 });
    }

    // Get item details from receipt
    const receiptObjectId = safeObjectId(rid);
    if (!receiptObjectId) {
      return NextResponse.json({ error: 'Invalid receipt ID format' }, { status: 400 });
    }

    const receipt = await db.collection('receipts').findOne({ _id: receiptObjectId });
    
    if (!receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    const item = receipt.items?.find(item => item.id === id);
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
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

  return NextResponse.json({
      id,
      claimedBy: userId,
      claimedAt: claim.claimedAt.toISOString(),
      receiptId: rid,
      claimId: result.insertedId
    });
  } catch (error) {
    console.error('Claim error:', error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
