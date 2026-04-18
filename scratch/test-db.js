const mysql = require('mysql2/promise');

async function testConn() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_WEB_USER;
  const password = process.env.DB_WEB_PASSWORD;
  const database = process.env.DB_WEB_DATABASE;

  console.log('Testing connection to:', host);
  if (!host) {
    console.error('DB_HOST is not set in environment!');
    process.exit(1);
  }

  try {
    const conn = await mysql.createConnection({
      host,
      user,
      password,
      database,
      connectTimeout: 5000
    });
    console.log('Connection successful!');
    await conn.end();
  } catch (err) {
    console.error('Connection failed:', err.message);
    process.exit(1);
  }
}

testConn();
