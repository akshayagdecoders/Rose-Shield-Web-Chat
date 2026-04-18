import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const timestamp = Date.now();
    const [res] = await pool.execute(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [`Test User ${timestamp}`, `test${timestamp}@example.com`, 'testpassword']
    );
    return NextResponse.json({ success: true, insertId: res.insertId });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
