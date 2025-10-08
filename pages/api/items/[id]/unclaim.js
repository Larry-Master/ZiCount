import { connectToDatabase } from '@/lib/db/mongodb';
import { checkMethod, errorResponse } from '@/lib/utils/apiHelpers';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  const { id } = req.query;
  const { db } = await connectToDatabase();

  if (!checkMethod(req, res, 'DELETE')) return;

  try {
    console.log('[Unclaim API] Looking for claim with itemId:', id);
    const claim = await db.collection('claims').findOne({ itemId: id });
    
    if (!claim) {
      console.log('[Unclaim API] No claim found for itemId:', id);
      
      // Try to find the receipt that contains this item to update its timestamp
      // This ensures frontend cache gets invalidated even if claim doesn't exist
      const receipt = await db.collection('receipts').findOne({ 
        'items.id': id 
      });
      
      if (receipt) {
        console.log('[Unclaim API] Found receipt for item, updating timestamp');
        await db.collection('receipts').updateOne(
          { _id: receipt._id }, 
          { $set: { updatedAt: new Date().toISOString() } }
        ).catch((err) => console.warn('[Unclaim API] Failed to update receipt timestamp:', err));
      }
      
      // Return success anyway to allow frontend to proceed
      return res.status(200).json({ 
        success: true, 
        message: 'Item was not claimed or already unclaimed',
        wasNotClaimed: true 
      });
    }

    console.log('[Unclaim API] Found claim:', claim);
    await db.collection('claims').deleteOne({ itemId: id });
    await db.collection('receipts').updateOne(
      { _id: new ObjectId(claim.receiptId) }, 
      { $set: { updatedAt: new Date().toISOString() } }
    ).catch(() => {});

    console.log('[Unclaim API] Successfully unclaimed item:', id);
    res.status(200).json({ success: true, message: 'Item unclaimed successfully' });
  } catch (error) {
    console.error('[Unclaim API] Error:', error);
    errorResponse(res, error, 'Unclaim item error');
  }
}
