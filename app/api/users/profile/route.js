import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export async function PUT(request) {
  try {
    const formData = await request.formData();
    const userId = formData.get('userId');
    const description = formData.get('description');
    const avatarFile = formData.get('avatar');

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    let queryStr = '';
    let queryParams = [];
    const name = formData.get('name');

    if (avatarFile && avatarFile.size > 0) {
      const uploadFormData = new FormData();
      uploadFormData.append('image', avatarFile);

      const uploadRes = await fetch('https://lightgoldenrodyellow-deer-492936.hostingersite.com/upload.php', {
          method: 'POST',
          body: uploadFormData
      });

      if (!uploadRes.ok) throw new Error("Avatar upload failed to Hostinger");
      const uploadData = await uploadRes.json();
      const fileUrl = uploadData.file_url;
      if (!fileUrl) throw new Error("No URL returned for Avatar");

      queryStr = 'UPDATE users SET name = ?, description = ?, avatar_url = ? WHERE id = ?';
      queryParams = [name || '', description || '', fileUrl, userId];
    } else {
      queryStr = 'UPDATE users SET name = ?, description = ? WHERE id = ?';
      queryParams = [name || '', description || '', userId];
    }

    await pool.execute(queryStr, queryParams);

    // Fetch the updated user
    const [rows] = await pool.execute('SELECT id, name, email, avatar_url, description, is_admin FROM users WHERE id = ?', [userId]);

    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error('Profile Update Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'User ID required' }, { status: 400 });

    // Delete associated messages (where sender or receiver) to prevent database foreign constraint orphaned data
    await pool.execute('DELETE FROM messages WHERE sender_id = ? OR receiver_id = ?', [userId, userId]);
    
    // Delete target user
    await pool.execute('DELETE FROM users WHERE id = ?', [userId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Profile Delete Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'User ID required' }, { status: 400 });

    const [rows] = await pool.execute('SELECT id, name, email, avatar_url, description, is_admin FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error('Profile Fetch Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
