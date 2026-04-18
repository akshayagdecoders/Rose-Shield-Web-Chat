import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const [rows] = await pool.execute('DESCRIBE users');
    const [data] = await pool.execute('SELECT * FROM users');
    return NextResponse.json({ schema: rows, data: data });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
