import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  const { rid } = req.query;
  const { db } = await connectToDatabase();

  if (req.method === 'GET') {
    try {
      if (!ObjectId.isValid(rid)) {
        return res.status(400).json({ error: 'Invalid receipt ID' });
      }

      const receipt = await db.collection('receipts').findOne({ _id: new ObjectId(rid) });
      
      if (!receipt) {
        return res.status(404).json({ error: 'Receipt not found' });
      }

      // Get claims for this receipt
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
      
      const receiptWithClaims = {
        ...receipt,
        id: receipt._id.toString(),
        items: receiptItems,
        discounts: receipt.discounts || [],
        claimedItems: claims.length
      };

      // Last-Modified header based on receipt.updatedAt or createdAt
      const last = receipt.updatedAt ? new Date(receipt.updatedAt) : (receipt.createdAt ? new Date(receipt.createdAt) : receipt._id.getTimestamp());
      const lastModified = last.toUTCString();
      res.setHeader('Last-Modified', lastModified);
      const ifModifiedSince = req.headers['if-modified-since'];
      if (ifModifiedSince) {
        const since = new Date(ifModifiedSince);
        if (!isNaN(since) && since >= last) {
          return res.status(304).end();
        }
      }

      res.status(200).json(receiptWithClaims);
    } catch (error) {
      console.error('Get receipt error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else if (req.method === 'DELETE') {
    try {
      if (!ObjectId.isValid(rid)) {
        return res.status(400).json({ error: 'Invalid receipt ID' });
      }

      // Delete all claims for this receipt first
      await db.collection('claims').deleteMany({ receiptId: rid });

      // Find the receipt to get imageId (if any)
      const receipt = await db.collection('receipts').findOne({ _id: new ObjectId(rid) });
      if (!receipt) return res.status(404).json({ error: 'Receipt not found' });

      // Delete the receipt
      const result = await db.collection('receipts').deleteOne({ _id: new ObjectId(rid) });

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Receipt not found' });
      }

      // If receipt had an associated imageId, delete the image document
      try {
        if (receipt.imageId) {
          await db.collection('images').deleteOne({ _id: new ObjectId(receipt.imageId) });
        }
      } catch (e) {
        // If deleting image fails, log but don't fail the whole request
        console.warn('Failed to delete associated image for receipt', rid, e);
      }

      try { await db.collection('meta').updateOne({ _id: 'receipts' }, { $set: { updatedAt: new Date().toISOString() } }, { upsert: true }); } catch (e) {}

      res.status(200).json({ success: true, message: 'Receipt deleted successfully' });
    } catch (error) {
      console.error('Delete receipt error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else if (req.method === 'PATCH') {
    try {
      if (!ObjectId.isValid(rid)) {
        return res.status(400).json({ error: 'Invalid receipt ID' });
      }

      const { participants, recalculateItems, totalAmount } = req.body;
      
      let updateData = { participants };
      
      // If this is a manual receipt and we need to recalculate items
      if (recalculateItems && totalAmount && participants) {
        // Get the receipt to check if it's manual
        const receipt = await db.collection('receipts').findOne({ _id: new ObjectId(rid) });
        if (!receipt) {
          return res.status(404).json({ error: 'Receipt not found' });
        }
        
        // Use only the selected participants for cost splitting
        const participantCount = participants.length;
        const perPerson = participantCount > 0 ? parseFloat((totalAmount / participantCount).toFixed(2)) : totalAmount;
        
        // Recreate items for selected participants only
        const newItems = participants.map((personId, idx) => ({
          id: `manual_item_${Date.now()}_${idx}`,
          name: receipt.items?.[0]?.name || 'Manual item',
          price: perPerson,
          priceEUR: perPerson,
          claimedBy: null,
          claimedAt: null,
          tags: ['manual'],
          confidence: 1,
          participant: personId
        }));
        
        updateData.items = newItems;
      }

      const result = await db.collection('receipts').updateOne(
        { _id: new ObjectId(rid) },
        { $set: { ...updateData, updatedAt: new Date().toISOString() } }
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Receipt not found' });
      }

  res.status(200).json({ success: true, message: 'Receipt updated successfully' });
    } catch (error) {
      console.error('Update receipt error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else if (req.method === 'PUT') {
    try {
      if (!ObjectId.isValid(rid)) {
        return res.status(400).json({ error: 'Invalid receipt ID' });
      }

      const updateData = { ...req.body };
      delete updateData.id; // Remove the id field from the update data

      // If imageId or imageUrl are being changed, handle removal of old image
      const existing = await db.collection('receipts').findOne({ _id: new ObjectId(rid) });
      if (!existing) return res.status(404).json({ error: 'Receipt not found' });

      const newImageId = updateData.imageId ?? existing.imageId ?? null;
      const newImageUrl = updateData.imageUrl ?? existing.imageUrl ?? null;

      // If the update explicitly removes the image (imageId set to null or imageUrl removed)
      const imageWasRemoved = (existing.imageId && (updateData.imageId === null || (updateData.imageUrl === null)));

      const result = await db.collection('receipts').updateOne(
        { _id: new ObjectId(rid) },
        { $set: { ...updateData, updatedAt: new Date().toISOString() } }
      );

      // If image was removed or replaced, delete the old image doc
      try {
        if (existing.imageId && (imageWasRemoved || (newImageId && existing.imageId !== newImageId))) {
          await db.collection('images').deleteOne({ _id: new ObjectId(existing.imageId) });
        }
      } catch (e) {
        console.warn('Failed to delete old image after receipt update', rid, e);
      }
      
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Receipt not found' });
      }

      // Get the updated receipt
      const updatedReceipt = await db.collection('receipts').findOne({ _id: new ObjectId(rid) });
      const response = {
        ...updatedReceipt,
        id: updatedReceipt._id.toString()
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Update receipt error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else {
    res.setHeader('Allow', ['GET', 'DELETE', 'PATCH', 'PUT']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
