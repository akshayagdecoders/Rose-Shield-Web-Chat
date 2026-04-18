import pool from '@/lib/db';
import { NextResponse } from 'next/server';

// POST /api/presence  { userId }
// Called as a heartbeat by logged-in client every ~30s to mark them online.
export async function POST(request) {
  try {
    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }
    await pool.execute(
      'UPDATE users SET last_seen = UTC_TIMESTAMP() WHERE id = ?',
      [userId]
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Presence POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET /api/presence?userId=X
// Returns { online: true/false, last_seen: '...' } for the requested user.
// Comparison is done entirely inside MySQL to avoid JS timezone parsing issues.
// A user is "online" if last_seen is within the last 60 seconds (per DB clock).
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }
    const [rows] = await pool.execute(
      `SELECT
         last_seen,
         (last_seen IS NOT NULL AND TIMESTAMPDIFF(SECOND, last_seen, UTC_TIMESTAMP()) < 60) AS online
       FROM users WHERE id = ?`,
      [userId]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    // MySQL returns BIT/TINYINT for boolean expressions — convert to JS boolean
    const online = rows[0].online === 1 || rows[0].online === true || rows[0].online === '1';
    return NextResponse.json({ online, last_seen: rows[0].last_seen });
  } catch (error) {
    console.error('Presence GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
