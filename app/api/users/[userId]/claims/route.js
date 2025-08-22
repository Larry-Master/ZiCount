import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(request, context) {
  try {
  // Await params directly (Next.js requires awaiting params) and extract safely
  const params = await context.params;
  const userId = params?.userId;
    
    // Validate that userId exists and is a string
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      return Response.json({ error: 'Invalid user ID' }, { status: 400 });
    }
    
    const { db } = await connectToDatabase();
    
    // Get all claims for this user with receipt details
    const claims = await db.collection('claims').find({ userId }).toArray();
    
    // Get receipt details for each claim
    const claimsWithDetails = await Promise.all(
      claims.map(async (claim) => {
        let receiptObjectId;
        try {
          receiptObjectId = new ObjectId(claim.receiptId);
        } catch (err) {
          // If ObjectId conversion fails, skip this receipt lookup
          return {
            id: claim.itemId,
            name: claim.itemName || `Item ${claim.itemId}`,
            price: claim.itemPrice || 0,
            receiptId: claim.receiptId,
            receiptName: `Receipt ${claim.receiptId}`,
            claimedAt: claim.claimedAt,
            tags: claim.itemTags || [],
            claimId: claim._id
          };
        }
        
        const receipt = await db.collection('receipts').findOne({ 
          _id: receiptObjectId 
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
