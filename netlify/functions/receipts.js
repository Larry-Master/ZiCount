/**
 * Netlify Function: Receipts (GET/POST)
 */

const { MongoClient, ObjectId } = require('mongodb');

exports.handler = async (event, context) => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();

  try {
    if (event.httpMethod === 'GET') {
      const receipts = await db.collection('receipts').find({}).toArray();
      
      // Add claim information to each receipt
      const receiptsWithClaims = await Promise.all(
        receipts.map(async (receipt) => {
          const claims = await db.collection('claims').find({
            receiptId: receipt._id.toString()
          }).toArray();
          
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
      
      await client.close();
      return {
        statusCode: 200,
        body: JSON.stringify(receiptsWithClaims),
      };

    } else if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      
      // Validate imageUrl is not base64 data
      let imageUrl = body.imageUrl;
      if (imageUrl && imageUrl.startsWith('data:')) {
        console.warn('Removing base64 image data to prevent size issues');
        imageUrl = null;
      }
      
      const receipt = {
        name: body.name || `Receipt ${new Date().toLocaleDateString('de-DE')}`,
        createdAt: body.createdAt ? new Date(body.createdAt) : new Date(),
        imageUrl: imageUrl,
        items: body.items || [],
        discounts: body.discounts || [],
        totalAmount: body.totalAmount || 0,
        uploadedBy: body.uploadedBy || null,
        participants: body.participants || [],
        text: body.text || ''
      };

      // Check document size
      const documentSize = JSON.stringify(receipt).length;
      const maxDocumentSize = 15 * 1024 * 1024; // 15MB
      
      if (documentSize > maxDocumentSize) {
        await client.close();
        return {
          statusCode: 413,
          body: JSON.stringify({ 
            error: `Receipt data too large (${Math.round(documentSize / 1024 / 1024)}MB).` 
          }),
        };
      }

      const result = await db.collection('receipts').insertOne(receipt);
      
      const savedReceipt = {
        ...receipt,
        id: result.insertedId.toString(),
        _id: result.insertedId,
        claimedItems: 0
      };

      await client.close();
      return {
        statusCode: 200,
        body: JSON.stringify(savedReceipt),
      };

    } else {
      await client.close();
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

  } catch (error) {
    await client.close();
    console.error('Receipts API error:', error);
    
    if (error.code === 10334 || error.message?.includes('document too large')) {
      return {
        statusCode: 413,
        body: JSON.stringify({ error: 'Receipt data too large.' }),
      };
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Database error' }),
    };
  }
};