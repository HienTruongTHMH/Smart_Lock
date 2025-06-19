const { Pool } = require('pg');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!process.env.POSTGRES_URL) {
    return res.status(500).json({ 
      success: false, 
      error: 'POSTGRES_URL environment variable not found'
    });
  }

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    
    console.log('🔌 Creating database tables...');
    
    // ✅ TẠO BẢNG ĐÚNG TÊN VỚI CODE
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Manager_Sign_In" (
        id_user SERIAL PRIMARY KEY,
        "Full_Name" VARCHAR(100) NOT NULL,
        private_pwd VARCHAR(10),
        "UID" VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Manager_Access_Log" (
        id SERIAL PRIMARY KEY,
        "User_ID" INTEGER REFERENCES "Manager_Sign_In"(id_user),
        "Method" VARCHAR(20) NOT NULL,
        "Identifier" VARCHAR(100) NOT NULL,
        "Success" BOOLEAN NOT NULL,
        "Check_Status" VARCHAR(10),
        "Time_Tracking" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ✅ THÊM USER MẪU NẾU CHƯA CÓ
    const userCount = await client.query('SELECT COUNT(*) as count FROM "Manager_Sign_In"');
    
    if (parseInt(userCount.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO "Manager_Sign_In" ("Full_Name", private_pwd, "UID") VALUES 
        ('Hien Truong', '1234', '67A21405'),
        ('Admin User', '0000', NULL),
        ('Test User', '9999', 'ABC12345')
      `);
      console.log('✅ Sample users created');
    }

    // Get final counts
    const finalUserCount = await client.query('SELECT COUNT(*) as count FROM "Manager_Sign_In"');
    const logCount = await client.query('SELECT COUNT(*) as count FROM "Manager_Access_Log"');
    
    client.release();
    
    res.json({ 
      success: true, 
      message: 'Database setup completed!',
      tablesCreated: ['Manager_Sign_In', 'Manager_Access_Log'],
      totalUsers: parseInt(finalUserCount.rows[0].count),
      totalLogs: parseInt(logCount.rows[0].count)
    });
    
  } catch (err) {
    console.error('Setup error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Database setup failed', 
      detail: err.message 
    });
  } finally {
    await pool.end();
  }
}