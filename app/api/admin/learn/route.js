import pool from '@/lib/db';
import { appendNewPattern } from '@/lib/detector';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { userId, messageId, content } = await request.json();

    if (!userId || !content) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // 1. Check if the requesting user is an admin
    const [users] = await pool.execute('SELECT is_admin FROM users WHERE id = ?', [userId]);
    if (users.length === 0 || !users[0].is_admin) {
      return NextResponse.json({ error: 'Unauthorized: Admin privileges required' }, { status: 403 });
    }

    // 2. Add the offensive pattern to the global blocklist
    await appendNewPattern(content);

    // 3. Mark the specific message as offensive and hidden in the DB
    if (messageId) {
      await pool.execute(
        'UPDATE messages SET is_offensive = 1, content = "the message is unavailable" WHERE id = ?',
        [messageId]
      );
    }

    return NextResponse.json({ success: true, message: 'Pattern learned and message blocked' });
  } catch (error) {
    console.error('Admin Learn Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
