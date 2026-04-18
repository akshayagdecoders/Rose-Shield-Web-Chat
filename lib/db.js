import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_WEB_USER,
  password: process.env.DB_WEB_PASSWORD,
  database: process.env.DB_WEB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: 'Z', // Force UTC so timestamps are always returned as proper UTC JS Dates
});

export default pool;

/**
 * Initializes the database tables if they don't exist
 */
export async function initDb() {
  const connection = await pool.getConnection();
  try {
    // Users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        avatar_url VARCHAR(255) DEFAULT NULL,
        description TEXT DEFAULT NULL,
        last_seen DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Upgrade users table for existing records
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN avatar_url VARCHAR(255) DEFAULT NULL`);
    } catch(err) {} 
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN description TEXT DEFAULT 'Available'`);
    } catch(err) {}
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE`);
      // For development/testing: auto-promote everyone to admin so they can use the report feature
      await connection.execute(`UPDATE users SET is_admin = 1`);
    } catch(err) {}

    // Add last_seen to existing users table if the column doesn't exist
    await connection.execute(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen DATETIME DEFAULT NULL
    `);

    // Messages table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sender_id INT NOT NULL,
        receiver_id INT NOT NULL,
        content MEDIUMTEXT,
        original_content MEDIUMTEXT,
        is_offensive BOOLEAN DEFAULT FALSE,
        type ENUM('text', 'image') DEFAULT 'text',
        status ENUM('sent', 'delivered', 'seen') DEFAULT 'sent',
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (sender_id),
        INDEX (receiver_id)
      )
    `);

    // Upgrade existing table for previous iterations
    await connection.execute(`
      ALTER TABLE messages 
      MODIFY content MEDIUMTEXT,
      MODIFY original_content MEDIUMTEXT
    `);

    try {
      await connection.execute(`ALTER TABLE messages ADD COLUMN status ENUM('sent', 'delivered', 'seen') DEFAULT 'sent'`);
    } catch(err) {
      // Column may already exist
    }

    // Calls table (WebRTC signaling + history)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS calls (
        id INT AUTO_INCREMENT PRIMARY KEY,
        caller_id INT NOT NULL,
        receiver_id INT NOT NULL,
        type ENUM('audio', 'video') DEFAULT 'audio',
        status ENUM('ringing', 'active', 'ended', 'missed', 'rejected') DEFAULT 'ringing',
        offer MEDIUMTEXT,
        answer MEDIUMTEXT,
        ice_caller MEDIUMTEXT,
        ice_receiver MEDIUMTEXT,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME DEFAULT NULL,
        duration_seconds INT DEFAULT NULL,
        INDEX (caller_id),
        INDEX (receiver_id),
        INDEX (status)
      )
    `);

    // Blocked patterns table (for RoseShield Learning)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS blocked_patterns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pattern VARCHAR(255) UNIQUE NOT NULL,
        type ENUM('text', 'image_hash') DEFAULT 'text',
        source ENUM('manual', 'auto_learn') DEFAULT 'manual',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database schema verified');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    connection.release();
  }
}
