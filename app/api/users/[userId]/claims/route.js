import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(request, { params }) {
  try {
    const { userId } = await params;
    
    const { db } = await connectToDatabase();
    
    // Get all claims for this user with receipt details
    const claims = await db.collection('claims').find({ userId }).toArray();
    
    // Get receipt details for each claim
    const claimsWithDetails = await Promise.all(
      claims.map(async (claim) => {
        const receipt = await db.collection('receipts').findOne({ 
          _id: new ObjectId(claim.receiptId) 
        });
        
        return {
          id: claim.itemId,
          name: claim.itemName || `Item ${claim.itemId}`,
          price: claim.itemPrice || 0,
          receiptId: claim.receiptId,
          receiptName: receipt?.name || `Receipt ${claim.receiptId}`,
          claimedAt: claim.claimedAt,
          tags: claim.itemTags || [],
          claimId: claim._id
        };
      })
    );

    return Response.json(claimsWithDetails);
  } catch (error) {
    console.error('Get user claims error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
