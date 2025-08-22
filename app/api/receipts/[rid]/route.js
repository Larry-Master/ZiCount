import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(request, { params }) {
  try {
  const { rid } = await Promise.resolve(params || {});
    const { db } = await connectToDatabase();
    
    // Find the receipt in MongoDB
    const receipt = await db.collection('receipts').findOne({ 
      _id: new ObjectId(rid) 
    });
    
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

export async function DELETE(request, { params }) {
  try {
  const { rid } = await Promise.resolve(params || {});
    const { db } = await connectToDatabase();

    // Verify receipt exists
    const receipt = await db.collection('receipts').findOne({ _id: new ObjectId(rid) });
    if (!receipt) {
      return Response.json({ error: 'Receipt not found' }, { status: 404 });
    }

    // Delete receipt document
    await db.collection('receipts').deleteOne({ _id: new ObjectId(rid) });

    // Remove any claims associated with this receipt
    await db.collection('claims').deleteMany({ receiptId: rid });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Delete receipt error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
