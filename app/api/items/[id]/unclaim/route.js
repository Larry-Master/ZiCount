import { connectToDatabase } from '@/lib/db/mongodb';
import { NextResponse } from 'next/server';

export async function POST(request, context) {
  try {
  // Await params directly (Next.js requires awaiting params) and extract safely
  const params = await context.params;
  const id = params?.id;
    
    // Validate that id exists and is a string
    if (!id || typeof id !== 'string' || id.trim() === '') {
      return NextResponse.json({ error: 'Invalid item ID' }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    // Find and remove claim
    const result = await db.collection('claims').deleteOne({ 
      itemId: id 
    });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'No claim found for this item' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unclaim error:', error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
