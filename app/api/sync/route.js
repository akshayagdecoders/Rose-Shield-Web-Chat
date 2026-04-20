import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const chattingWithId = searchParams.get('chattingWithId');

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const uId = parseInt(userId);
  const targetId = chattingWithId ? parseInt(chattingWithId) : null;

  try {
    // 1. Mark unread messages as delivered
    await pool.execute(
      `UPDATE messages SET status = 'delivered' WHERE receiver_id = ? AND status = 'sent'`,
      [uId]
    );

    // 2. Fetch Recent Chats
    const [chats] = await pool.execute(
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

    // 3. Fetch Messages & Presence (if chattingWithId provided)
    let messages = [];
    let presence = null;

    if (targetId) {
      // Mark as seen if we are actively chatting
      await pool.execute(
        `UPDATE messages SET status = 'seen' WHERE receiver_id = ? AND sender_id = ? AND status != 'seen'`,
        [uId, targetId]
      );

      const [msgRows] = await pool.execute(
        `SELECT
           id, sender_id, receiver_id, content, original_content, is_offensive, type, status,
           DATE_FORMAT(CONVERT_TZ(timestamp, @@session.time_zone, '+00:00'), '%Y-%m-%dT%H:%i:%sZ') AS timestamp
         FROM messages
         WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
         ORDER BY timestamp ASC`,
        [uId, targetId, targetId, uId]
      );
      
      messages = msgRows.map(row => {
        const isRecipient = Number(row.receiver_id) === uId;
        if (row.is_offensive && isRecipient) {
          return { ...row, content: "the message is unavailable", original_content: null };
        }
        return row;
      });

      const [presRows] = await pool.execute(
        `SELECT last_seen, (last_seen IS NOT NULL AND TIMESTAMPDIFF(SECOND, last_seen, UTC_TIMESTAMP()) < 60) AS online
         FROM users WHERE id = ?`,
        [targetId]
      );
      if (presRows.length > 0) {
        presence = {
          online: presRows[0].online === 1 || presRows[0].online === true || presRows[0].online === '1',
          last_seen: presRows[0].last_seen
        };
      }
    }

    // 4. Fetch Incoming Call
    const [callRows] = await pool.execute(
      `SELECT c.*, u.name as caller_name, u.avatar_url as caller_avatar
       FROM calls c
       JOIN users u ON c.caller_id = u.id
       WHERE c.receiver_id = ? AND c.status = 'ringing'
       ORDER BY c.started_at DESC LIMIT 1`,
      [uId]
    );
    const incomingCall = callRows.length > 0 ? callRows[0] : null;

    const syncData = JSON.parse(JSON.stringify({
      chats,
      messages,
      presence,
      incomingCall
    }, (key, value) => typeof value === 'bigint' ? value.toString() : value));

    return NextResponse.json(syncData);
  } catch (error) {
    console.error('Sync API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
