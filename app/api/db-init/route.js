import { initDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    await initDb();
    return NextResponse.json({ message: 'Database initialized' });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
