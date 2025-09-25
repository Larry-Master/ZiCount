import { connectToDatabase } from '@/lib/db/mongodb';

// Increase timeout and body size limits for large receipt data
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
    responseLimit: '50mb',
  },
};

export default async function handler(req, res) {
  const { db } = await connectToDatabase();

  if (req.method === 'GET') {
    try {
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
            discounts: receipt.discounts || [],
            claimedItems: claims.length
          };
        })
      );
      
      res.status(200).json(receiptsWithClaims);
    } catch (error) {
      console.error('Get receipts error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else if (req.method === 'POST') {
    try {
      const body = req.body;
      
      // Validate that imageUrl is not a base64 data URL to prevent document size issues
      let imageUrl = body.imageUrl;
      if (imageUrl && imageUrl.startsWith('data:')) {
        console.warn('Attempted to save base64 image data directly to receipt document - removing to prevent size issues');
        imageUrl = null; // Remove base64 data to prevent document size issues
      }
      
      const receipt = {
        name: body.name || `Receipt ${new Date().toLocaleDateString('de-DE')}`,
        // allow client to pass createdAt (e.g., manual form), fallback to now
        createdAt: body.createdAt ? new Date(body.createdAt) : new Date(),
        imageUrl: imageUrl,
        items: body.items || [],
        discounts: body.discounts || [],
        // Only use totalAmount from request, never calculate fallback
        totalAmount: body.totalAmount || 0,
        uploadedBy: body.uploadedBy || null,
        // persist participants if provided (used for Teilnehmerliste)
        participants: body.participants || [],
        text: body.text || ''
      };

      // Check document size before insertion to prevent MongoDB errors
      const documentSize = JSON.stringify(receipt).length;
      const maxDocumentSize = 15 * 1024 * 1024; // 15MB to leave some buffer
      
      if (documentSize > maxDocumentSize) {
        console.error(`Receipt document too large: ${Math.round(documentSize / 1024 / 1024)}MB`);
        return res.status(413).json({ 
          error: `Receipt data too large (${Math.round(documentSize / 1024 / 1024)}MB). This is likely due to high-resolution image data being included. Please ensure images are uploaded separately.` 
        });
      }

      const result = await db.collection('receipts').insertOne(receipt);
      
      const savedReceipt = {
        ...receipt,
        id: result.insertedId.toString(),
        _id: result.insertedId,
        claimedItems: 0
      };

      res.status(200).json(savedReceipt);
    } catch (error) {
      console.error('Create receipt error:', error);
      
      // Handle specific MongoDB errors
      if (error.code === 10334 || error.message?.includes('document too large')) {
        return res.status(413).json({ error: 'Receipt data too large. This usually happens with high-resolution images. Please try compressing the image.' });
      }
      if (error.code === 11000) {
        return res.status(409).json({ error: 'Duplicate receipt data detected.' });
      }
      
      res.status(500).json({ error: 'Database error while saving receipt. Please try again.' });
    }

  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
