import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  try {
    const [rows] = await pool.execute(
      `SELECT 
         c.*,
         CASE WHEN c.caller_id = ? THEN u2.name    ELSE u1.name    END as partner_name,
         CASE WHEN c.caller_id = ? THEN u2.avatar_url ELSE u1.avatar_url END as partner_avatar,
         CASE WHEN c.caller_id = ? THEN 'outgoing'  ELSE 'incoming'  END as direction
       FROM calls c
       JOIN users u1 ON c.caller_id   = u1.id
       JOIN users u2 ON c.receiver_id = u2.id
       WHERE c.caller_id = ? OR c.receiver_id = ?
       ORDER BY c.started_at DESC
       LIMIT 100`,
      [userId, userId, userId, userId, userId]
    );
    // Ensure results are JSON serializable (mysql2 might return BigInt)
    const historyData = JSON.parse(JSON.stringify(rows, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));
    return NextResponse.json(historyData);
  } catch (error) {
    console.error('Call history error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
