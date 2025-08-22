import { connectToDatabase } from '@/lib/db/mongodb';

export async function GET(request) {
  try {
    const { db } = await connectToDatabase();
    const receipts = await db.collection('receipts').find({}).toArray();
    
    // Add claim information to each receipt
    const receiptsWithClaims = await Promise.all(
      receipts.map(async (receipt) => {
        const claims = await db.collection('claims').find({
          receiptId: receipt._id.toString()
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
        
        return {
          ...receipt,
          id: receipt._id.toString(),
          items: receiptItems,
          claimedItems: claims.length
        };
      })
    );
    
    return Response.json(receiptsWithClaims);
  } catch (error) {
    console.error('Get receipts error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { db } = await connectToDatabase();
    
    const receipt = {
      name: body.name || `Receipt ${new Date().toLocaleDateString('de-DE')}`,
      createdAt: new Date(),
      imageUrl: body.imageUrl,
      items: body.items || [],
      uploadedBy: body.uploadedBy || 'anonymous'
    };

    const result = await db.collection('receipts').insertOne(receipt);
    
    const savedReceipt = {
      ...receipt,
      id: result.insertedId.toString(),
      _id: result.insertedId,
      claimedItems: 0
    };

    return Response.json(savedReceipt);
  } catch (error) {
    console.error('Create receipt error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
