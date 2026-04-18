import pool from '@/lib/db';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function POST(request) {
  try {
    const { mode, email, password, name } = await request.json();

    if (mode === 'signup') {
      const hashedPassword = await bcrypt.hash(password, 10);
      const [result] = await pool.execute(
        'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
        [name, email, hashedPassword]
      );
      return NextResponse.json({ id: result.insertId, name, email });
    } else {
      // mode === 'login'
      const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
      if (rows.length === 0) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const user = rows[0];
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
      }

      const { password: _, ...userWithoutPassword } = user;
      return NextResponse.json(userWithoutPassword);
    }
  } catch (error) {
    console.error('Auth API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
