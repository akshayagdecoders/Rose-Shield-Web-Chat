import pool from '@/lib/db';
import { NextResponse } from 'next/server';

// PUT: update call state (answer, ICE candidates, end, reject)
export async function PUT(request, { params }) {
  try {
    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id);
    const body = await request.json();
    const { status, answer, ice_caller, ice_receiver, duration_seconds } = body;

    const fields = [];
    const values = [];

    if (status)                       { fields.push('status = ?');           values.push(status); }
    if (answer !== undefined)         { fields.push('answer = ?');           values.push(answer); }
    if (ice_caller !== undefined)     { fields.push('ice_caller = ?');       values.push(ice_caller); }
    if (ice_receiver !== undefined)   { fields.push('ice_receiver = ?');     values.push(ice_receiver); }
    if (duration_seconds !== undefined){ fields.push('duration_seconds = ?'); values.push(duration_seconds); }

    if (status === 'ended' || status === 'rejected' || status === 'missed') {
      fields.push('ended_at = NOW()');
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    values.push(id);
    await pool.execute(`UPDATE calls SET ${fields.join(', ')} WHERE id = ?`, values);

    const [rows] = await pool.execute('SELECT * FROM calls WHERE id = ?', [id]);
    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    
    // Ensure the row is JSON serializable (mysql2 might return BigInt for some fields)
    const callData = JSON.parse(JSON.stringify(rows[0], (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));
    
    return NextResponse.json(callData);
  } catch (error) {
    console.error('Calls PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
