const mysql = require('mysql2/promise');

async function listAdmins() {
  const connection = await mysql.createConnection({
    host: '82.25.121.3',
    user: 'u437321654_reeba',
    password: 'Reeba125@',
    database: 'u437321654_reeba',
  });

  try {
    const [rows] = await connection.execute('SELECT id, name, email FROM users WHERE is_admin = 1');
    console.log('Current Administrators:');
    console.table(rows);
  } catch (error) {
    console.error('Error fetching admins:', error);
  } finally {
    await connection.end();
  }
}

listAdmins();
