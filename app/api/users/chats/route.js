import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
  }

  const uId = parseInt(userId);

  try {
    // Mark any unread messages sent to this user as 'delivered' (since they are polling for them)
    await pool.execute(
      `UPDATE messages SET status = 'delivered' WHERE receiver_id = ? AND status = 'sent'`,
      [uId]
    );

    // Find all users who have exchanged messages with the current user
    const [rows] = await pool.execute(
      `SELECT 
        u.id, 
        u.name as username,
        u.avatar_url,
        u.description,
        MAX(m.timestamp) as last_message_at
      FROM users u
      JOIN messages m ON (u.id = m.sender_id OR u.id = m.receiver_id)
      WHERE (m.sender_id = ? OR m.receiver_id = ?)
        AND u.id != ?
      GROUP BY u.id, u.name, u.avatar_url, u.description
      ORDER BY last_message_at DESC`,
      [uId, uId, uId]
    );

    // Ensure results are JSON serializable
    const chatData = JSON.parse(JSON.stringify(rows, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));
    return NextResponse.json(chatData);
  } catch (error) {
    console.error('Fetch Chats Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
