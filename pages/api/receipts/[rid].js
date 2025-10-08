import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import { handleConditionalGet, updateMetaTimestamp } from '@/lib/utils/http';

export default async function handler(req, res) {
  const { rid } = req.query;
  const { db } = await connectToDatabase();

  if (req.method === 'GET') {
    try {
      if (!ObjectId.isValid(rid)) return res.status(400).json({ error: 'Invalid receipt ID' });

      const receipt = await db.collection('receipts').findOne({ _id: new ObjectId(rid) });
      if (!receipt) return res.status(404).json({ error: 'Receipt not found' });

      const claims = await db.collection('claims').find({ receiptId: receipt._id.toString() }).toArray();
      const receiptItems = receipt.items?.map(item => {
        const claim = claims.find(c => c.itemId === item.id);
        return claim ? { ...item, claimedBy: claim.userId, claimedAt: claim.claimedAt } : item;
      }) || [];
      
      const receiptWithClaims = {
        ...receipt,
        id: receipt._id.toString(),
        items: receiptItems,
        discounts: receipt.discounts || [],
        claimedItems: claims.length
      };

      const last = receipt.updatedAt ? new Date(receipt.updatedAt) : 
                   (receipt.createdAt ? new Date(receipt.createdAt) : receipt._id.getTimestamp());
      if (handleConditionalGet(res, req, last)) return;

      res.status(200).json(receiptWithClaims);
    } catch (error) {
      console.error('Get receipt error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else if (req.method === 'DELETE') {
    try {
      if (!ObjectId.isValid(rid)) return res.status(400).json({ error: 'Invalid receipt ID' });

      const receipt = await db.collection('receipts').findOne({ _id: new ObjectId(rid) });
      if (!receipt) return res.status(404).json({ error: 'Receipt not found' });

      await db.collection('claims').deleteMany({ receiptId: rid });
      await db.collection('receipts').deleteOne({ _id: new ObjectId(rid) });

      if (receipt.imageId) {
        await db.collection('images').deleteOne({ _id: new ObjectId(receipt.imageId) }).catch(e => 
          console.warn('Failed to delete image for receipt', rid, e)
        );
      }

      await updateMetaTimestamp(db, 'receipts');
      res.status(200).json({ success: true, message: 'Receipt deleted successfully' });
    } catch (error) {
      console.error('Delete receipt error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else if (req.method === 'PATCH') {
    try {
      if (!ObjectId.isValid(rid)) return res.status(400).json({ error: 'Invalid receipt ID' });

      const { participants, recalculateItems, totalAmount } = req.body;
      let updateData = { participants };
      
      if (recalculateItems && totalAmount && participants) {
        const receipt = await db.collection('receipts').findOne({ _id: new ObjectId(rid) });
        if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
        
        const perPerson = participants.length > 0 ? parseFloat((totalAmount / participants.length).toFixed(2)) : totalAmount;
        updateData.items = participants.map((personId, idx) => ({
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
      }

      const result = await db.collection('receipts').updateOne(
        { _id: new ObjectId(rid) },
        { $set: { ...updateData, updatedAt: new Date().toISOString() } }
      );
      
      if (result.matchedCount === 0) return res.status(404).json({ error: 'Receipt not found' });
      res.status(200).json({ success: true, message: 'Receipt updated successfully' });
    } catch (error) {
      console.error('Update receipt error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else if (req.method === 'PUT') {
    try {
      if (!ObjectId.isValid(rid)) return res.status(400).json({ error: 'Invalid receipt ID' });

      const updateData = { ...req.body };
      delete updateData.id;

      const existing = await db.collection('receipts').findOne({ _id: new ObjectId(rid) });
      if (!existing) return res.status(404).json({ error: 'Receipt not found' });

      const newImageId = updateData.imageId ?? existing.imageId ?? null;
      const imageWasRemoved = existing.imageId && (updateData.imageId === null || updateData.imageUrl === null);

      await db.collection('receipts').updateOne(
        { _id: new ObjectId(rid) },
        { $set: { ...updateData, updatedAt: new Date().toISOString() } }
      );

      if (existing.imageId && (imageWasRemoved || (newImageId && existing.imageId !== newImageId))) {
        await db.collection('images').deleteOne({ _id: new ObjectId(existing.imageId) }).catch(e =>
          console.warn('Failed to delete old image', rid, e)
        );
      }

      const updatedReceipt = await db.collection('receipts').findOne({ _id: new ObjectId(rid) });
      res.status(200).json({ ...updatedReceipt, id: updatedReceipt._id.toString() });
    } catch (error) {
      console.error('Update receipt error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else {
    res.setHeader('Allow', ['GET', 'DELETE', 'PATCH', 'PUT']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
