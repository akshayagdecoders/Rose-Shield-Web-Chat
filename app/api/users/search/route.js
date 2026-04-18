import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT id, name as username, avatar_url, description FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Ensure result is JSON serializable
    const userData = JSON.parse(JSON.stringify(rows[0], (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));

    return NextResponse.json(userData);
  } catch (error) {
    console.error('Search API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
