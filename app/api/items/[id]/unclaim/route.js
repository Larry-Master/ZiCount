import { connectToDatabase } from '@/lib/db/mongodb';

export async function POST(request, { params }) {
  try {
    const { id } = await params;

    const { db } = await connectToDatabase();

    // Find and remove claim
    const result = await db.collection('claims').deleteOne({ 
      itemId: id 
    });

    if (result.deletedCount === 0) {
      return Response.json({ error: 'No claim found for this item' }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Unclaim error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
