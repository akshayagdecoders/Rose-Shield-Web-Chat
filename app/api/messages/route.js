import pool from '@/lib/db';
import { checkMessage } from '@/lib/detector';
import { checkImage } from '@/lib/imageDetector';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const startTime = performance.now();
    const contentType = request.headers.get('content-type') || '';
    let senderId, receiverId, type, content, originalContent, fileData;
    
    if (contentType.includes('application/json')) {
      const body = await request.json();
      senderId = body.senderId;
      receiverId = body.receiverId;
      type = body.type || 'text';
      content = body.content || '';
      fileData = body.file; // This might be a Base64 string
    } else {
      const formData = await request.formData();
      senderId = formData.get('senderId');
      receiverId = formData.get('receiverId');
      type = formData.get('type') || 'text';
      content = formData.get('content');
      fileData = formData.get('file'); // This is a File object
    }
    
    let isOffensive = false;
    originalContent = content;

    if (type === 'text') {
      // Server-side AI + Keyword check
      const modStart = performance.now();
      isOffensive = await checkMessage(content);
      const modEnd = performance.now();
      console.log(`[PERF] Text Moderation: ${(modEnd - modStart).toFixed(2)}ms`);

      if (isOffensive) {
        originalContent = content;
        content = "the message is unavailable";
      }
    } else if (type === 'image') {
      if (!fileData) {
        return NextResponse.json({ error: 'No image provided' }, { status: 400 });
      }

      let buffer;
      let filename = 'upload.jpg';
      let mimeType = 'image/jpeg';

      if (typeof fileData === 'string' && fileData.startsWith('data:')) {
        // Handle Base64
        const parts = fileData.split(';base64,');
        mimeType = parts[0].split(':')[1];
        buffer = Buffer.from(parts[1], 'base64');
      } else {
        // Handle File object (FormData)
        const arrayBuffer = await fileData.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
        filename = fileData.name || 'upload.jpg';
        mimeType = fileData.type || 'image/jpeg';
      }

      // 1. Server-side Image AI check
      const modStart = performance.now();
      isOffensive = await checkImage(buffer);
      const modEnd = performance.now();
      console.log(`[PERF] Image Moderation: ${(modEnd - modStart).toFixed(2)}ms`);

      if (isOffensive) {
        // Preserving original image data in original_content for AI training/audit
        originalContent = typeof fileData === 'string' ? fileData : `data:${mimeType};base64,${buffer.toString('base64')}`;
        content = "the message is unavailable";
      } else {
        // 2. Upload to external Hostinger server if safe
        const uploadFormData = new FormData();
        const blob = new Blob([buffer], { type: mimeType });
        uploadFormData.append('image', blob, filename);

        const uploadStart = performance.now();
        const uploadRes = await fetch('https://lightgoldenrodyellow-deer-492936.hostingersite.com/upload.php', {
            method: 'POST',
            body: uploadFormData
        });
        const uploadEnd = performance.now();
        console.log(`[PERF] Hostinger Upload: ${(uploadEnd - uploadStart).toFixed(2)}ms`);

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

    const dbStart = performance.now();
    const [result] = await pool.execute(
      'INSERT INTO messages (sender_id, receiver_id, content, original_content, is_offensive, type) VALUES (?, ?, ?, ?, ?, ?)',
      [senderId, receiverId, content, originalContent, isOffensive, type]
    );
    const dbEnd = performance.now();
    console.log(`[PERF] DB Insert: ${(dbEnd - dbStart).toFixed(2)}ms`);

    const totalTime = performance.now() - startTime;
    console.log(`[PERF] Total Server Processing: ${totalTime.toFixed(2)}ms`);

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

