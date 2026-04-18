import pool from '@/lib/db';
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 });
  }

  try {
    // 1. Check admin status
    const [users] = await pool.execute('SELECT is_admin FROM users WHERE id = ?', [userId]);
    if (users.length === 0 || !users[0].is_admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // 2. Read the grooming_phrases.txt file
    const filePath = path.join(process.cwd(), 'public', 'assets', 'grooming_phrases.txt');
    const content = await fs.readFile(filePath, 'utf-8');
    
    // 3. Extract auto-learned lines (marked with //)
    const lines = content.split('\n');
    const learned = lines
      .filter(line => line.includes('// Auto-Learned Bypass'))
      .map(line => {
        const parts = line.split('//');
        return {
          word: parts[0].trim(),
          meta: parts[1] || ''
        };
      });

    return NextResponse.json(learned.reverse()); // Show newest first
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { userId, word } = await request.json();
    
    // 1. Check admin
    const [users] = await pool.execute('SELECT is_admin FROM users WHERE id = ?', [userId]);
    if (users.length === 0 || !users[0].is_admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // 2. Read and filter out the word
    const filePath = path.join(process.cwd(), 'public', 'assets', 'grooming_phrases.txt');
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const newLines = lines.filter(line => !line.trim().startsWith(word));

    await fs.writeFile(filePath, newLines.join('\n'));

    return NextResponse.json({ success: true, message: 'Word removed from blocklist' });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
