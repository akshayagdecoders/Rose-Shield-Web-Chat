import pool from '@/lib/db';
import { NextResponse } from 'next/server';

// GET: poll for incoming ringing call OR get specific call state
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const callId = searchParams.get('callId');

  try {
    if (callId) {
      const [rows] = await pool.execute('SELECT * FROM calls WHERE id = ?', [parseInt(callId)]);
      if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      
      const callData = JSON.parse(JSON.stringify(rows[0], (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      ));
      return NextResponse.json(callData);
    }

    if (userId) {
      // Check for incoming RINGING call destined for this user
      const [rows] = await pool.execute(
        `SELECT c.*, u.name as caller_name, u.avatar_url as caller_avatar
         FROM calls c
         JOIN users u ON c.caller_id = u.id
         WHERE c.receiver_id = ? AND c.status = 'ringing'
         ORDER BY c.started_at DESC LIMIT 1`,
        [parseInt(userId)]
      );
      
      if (rows.length === 0) return NextResponse.json(null);
      
      const callData = JSON.parse(JSON.stringify(rows[0], (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      ));
      return NextResponse.json(callData);
    }

    return NextResponse.json({ error: 'userId or callId required' }, { status: 400 });
  } catch (error) {
    console.error('Calls GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: initiate a new call
export async function POST(request) {
  try {
    const { callerId, receiverId, type, offer } = await request.json();

    if (!callerId || !receiverId || !type || !offer) {
      return NextResponse.json({ error: 'callerId, receiverId, type, offer required' }, { status: 400 });
    }

    // Mark any existing ringing calls from this caller as missed before starting a new one
    await pool.execute(
      `UPDATE calls SET status = 'missed', ended_at = NOW() WHERE caller_id = ? AND status = 'ringing'`,
      [parseInt(callerId)]
    );

    const [result] = await pool.execute(
      `INSERT INTO calls (caller_id, receiver_id, type, status, offer) VALUES (?, ?, ?, 'ringing', ?)`,
      [parseInt(callerId), parseInt(receiverId), type, offer]
    );

    return NextResponse.json({ id: Number(result.insertId) }, { status: 201 });
  } catch (error) {
    console.error('Calls POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
