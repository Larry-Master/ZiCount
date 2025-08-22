import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import { safeObjectId } from '@/lib/db/mongodb';

export async function GET(request, context) {
  try {
  // Await params directly (Next.js requires awaiting params) and extract safely
  const params = await context.params;
  const rid = params?.rid;
    
    // Validate that rid exists and is a string
    if (!rid || typeof rid !== 'string' || rid.trim() === '') {
      return Response.json({ error: 'Invalid receipt ID' }, { status: 400 });
    }
    
    const { db } = await connectToDatabase();    // Find the receipt in MongoDB
    const objectId = safeObjectId(rid);
    if (!objectId) {
      return Response.json({ error: 'Invalid receipt ID format' }, { status: 400 });
    }

    const receipt = await db.collection('receipts').findOne({ _id: objectId });
    
    if (!receipt) {
      return Response.json({ error: 'Receipt not found' }, { status: 404 });
    }

    // Get all claims for this receipt
    const claims = await db.collection('claims').find({ 
      receiptId: rid 
    }).toArray();

    // Merge receipt items with claims status
    const receiptItems = receipt.items?.map(item => {
      const claim = claims.find(c => c.itemId === item.id);
      return claim ? {
        ...item,
        claimedBy: claim.userId,
        claimedAt: claim.claimedAt
      } : item;
    }) || [];

    return Response.json({
      ...receipt,
      id: receipt._id.toString(),
      items: receiptItems
    });
  } catch (error) {
    console.error('Get receipt error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request, context) {
  try {
  // Await params directly (Next.js requires awaiting params) and extract safely
  const params = await context.params;
  const rid = params?.rid;
    
    // Validate that rid exists and is a string
    if (!rid || typeof rid !== 'string' || rid.trim() === '') {
      return Response.json({ error: 'Invalid receipt ID' }, { status: 400 });
    }
    
    const { db } = await connectToDatabase();    // Verify receipt exists
    const objectId = safeObjectId(rid);
    if (!objectId) {
      return Response.json({ error: 'Invalid receipt ID format' }, { status: 400 });
    }

    const receipt = await db.collection('receipts').findOne({ _id: objectId });
    if (!receipt) {
      return Response.json({ error: 'Receipt not found' }, { status: 404 });
    }

    // Delete receipt document
    await db.collection('receipts').deleteOne({ _id: objectId });

    // Remove any claims associated with this receipt
    await db.collection('claims').deleteMany({ receiptId: rid });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Delete receipt error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
