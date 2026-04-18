import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const [rows] = await pool.execute('SELECT id, name, email FROM users');
    const [messages] = await pool.execute('SELECT * FROM messages');
    return NextResponse.json({ users: rows, messages: messages });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
