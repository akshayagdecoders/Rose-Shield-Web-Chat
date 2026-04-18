import pool from '@/lib/db';
import { checkMessage } from '@/lib/detector';
import { checkImage } from '@/lib/imageDetector';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const senderId = formData.get('senderId');
    const receiverId = formData.get('receiverId');
    const type = formData.get('type') || 'text'; // 'text' or 'image'
    
    let content = formData.get('content');
    let isOffensive = false;
    let originalContent = content;

    if (type === 'text') {
      // Server-side AI + Keyword check
      isOffensive = await checkMessage(content);
      if (isOffensive) {
        originalContent = content;
        content = "the message is unavailable";
      }
    } else if (type === 'image') {
      const file = formData.get('file');
      if (!file) {
        return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
      }

      // 1. Server-side Image AI check
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      isOffensive = await checkImage(buffer);

      if (isOffensive) {
        originalContent = "Sensitive Image Blocked";
        content = "the message is unavailable";
      } else {
        // 2. Upload to external Hostinger server if safe
        const uploadFormData = new FormData();
        uploadFormData.append('image', file);

        const uploadRes = await fetch('https://lightgoldenrodyellow-deer-492936.hostingersite.com/upload.php', {
            method: 'POST',
            body: uploadFormData
        });

        if (!uploadRes.ok) {
            throw new Error("Failed to upload image to Hostinger external server");
        }

        const uploadData = await uploadRes.json();
        const fileUrl = uploadData.file_url;

        if (!fileUrl) {
            return NextResponse.json({ error: "Hostinger upload failed: No URL returned" }, { status: 500 });
        }

        originalContent = fileUrl;
        content = fileUrl;
      }
    }

    const [result] = await pool.execute(
      'INSERT INTO messages (sender_id, receiver_id, content, original_content, is_offensive, type) VALUES (?, ?, ?, ?, ?, ?)',
      [senderId, receiverId, content, originalContent, isOffensive, type]
    );

    return NextResponse.json({ 
        id: Number(result.insertId), 
        senderId, 
        receiverId, 
        content,
        originalContent,
        isOffensive,
        type,
        timestamp: new Date()
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const user1 = searchParams.get('user1');
  const user2 = searchParams.get('user2');

  if (!user1 || !user2) {
    return NextResponse.json({ error: 'Both user IDs are required' }, { status: 400 });
  }

  const u1 = parseInt(user1);
  const u2 = parseInt(user2);

  if (isNaN(u1) || isNaN(u2)) {
    return NextResponse.json({ error: 'Invalid user IDs' }, { status: 400 });
  }

  try {
    // Current user (u1) is opening the chat with u2, so any unread messages from u2 to u1 are now "seen"
    await pool.execute(
      `UPDATE messages SET status = 'seen' WHERE receiver_id = ? AND sender_id = ? AND status != 'seen'`,
      [u1, u2]
    );

    const [rows] = await pool.execute(
      `SELECT
         id,
         sender_id,
         receiver_id,
         content,
         original_content,
         is_offensive,
         type,
         status,
         DATE_FORMAT(
           CONVERT_TZ(timestamp, @@session.time_zone, '+00:00'),
           '%Y-%m-%dT%H:%i:%sZ'
         ) AS timestamp
       FROM messages
       WHERE (sender_id = ? AND receiver_id = ?)
          OR (sender_id = ? AND receiver_id = ?)
       ORDER BY timestamp ASC`,
      [u1, u2, u2, u1]
    );

    // Logic: If is_offensive is true, hide content from receiver
    const sanitizedRows = rows.map(row => {
      const isRecipient = Number(row.receiver_id) === u1;
      if (row.is_offensive && isRecipient) {
        return {
          ...row,
          content: "the message is unavailable",
          original_content: null // Hide original content from recipient
        };
      }
      return row;
    });

    const sanitizedResponse = JSON.parse(JSON.stringify(sanitizedRows, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));

    return NextResponse.json(sanitizedResponse);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

