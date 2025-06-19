const { Pool } = require('pg');
import { setupCors, handleOptions } from './_cors.js';

export default async function handler(req, res) {
  setupCors(res);
  
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

  let client;

  try {
    client = await pool.connect();
    
    console.log('🔌 Creating database tables with exact structure...');
    
    // ✅ BẢNG 1: Manager_Sign_In (GIỮ NGUYÊN CẤU TRÚC)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Manager_Sign_In" (
        id_user INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "Full_Name" VARCHAR(200),
        private_pwd TEXT,
        "UID" TEXT
      )
    `);
    
    // ✅ BẢNG 2: Manager_Access_Log (GIỮ NGUYÊN CẤU TRÚC)
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
    
    // ✅ BẢNG 3: Time_Tracking (GIỮ NGUYÊN CẤU TRÚC)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Time_Tracking" (
        "Time_Tracking" TIMESTAMPTZ,
        "Status" BOOLEAN,
        "Method" TEXT,
        id INTEGER REFERENCES "Manager_Sign_In"(id_user),
        "Check_Status" VARCHAR(10) DEFAULT 'IN'
      )
    `);
    
    // ✅ VIEW: Current_User_Status (GIỮ NGUYÊN CẤU TRÚC)
    await client.query(`
      CREATE OR REPLACE VIEW "Current_User_Status" AS
      SELECT 
        msi.id_user,
        msi."Full_Name",
        msi."UID",
        CASE 
          WHEN tt."Check_Status" = 'IN' THEN 'OUT'
          ELSE 'IN'
        END as next_action,
        tt."Time_Tracking" as latest_time
      FROM "Manager_Sign_In" msi
      LEFT JOIN (
        SELECT DISTINCT ON (id) *
        FROM "Time_Tracking"
        ORDER BY id, "Time_Tracking" DESC
      ) tt ON msi.id_user = tt.id
    `);

    // ✅ THÊM USER MẪU NẾU CHƯA CÓ
    const userCount = await client.query('SELECT COUNT(*) as count FROM "Manager_Sign_In"');
    
    if (parseInt(userCount.rows[0].count) === 0) {
      console.log('👤 Adding sample users...');
      await client.query(`
        INSERT INTO "Manager_Sign_In" ("Full_Name", private_pwd, "UID") VALUES 
        ('Hien Truong', '1234', '67A21405'),
        ('Admin User', '0000', NULL),
        ('Test User', '9999', 'ABC12345'),
        ('Manager Demo', '5555', NULL)
      `);
      console.log('✅ Sample users created');
    }

    // Get final counts
    const finalUserCount = await client.query('SELECT COUNT(*) as count FROM "Manager_Sign_In"');
    const logCount = await client.query('SELECT COUNT(*) as count FROM "Manager_Access_Log"');
    const timeTrackingCount = await client.query('SELECT COUNT(*) as count FROM "Time_Tracking"');
    
    client.release();
    
    res.json({ 
      success: true, 
      message: 'Database setup completed with original structure!',
      tablesCreated: ['Manager_Sign_In', 'Manager_Access_Log', 'Time_Tracking', 'Current_User_Status'],
      totalUsers: parseInt(finalUserCount.rows[0].count),
      totalLogs: parseInt(logCount.rows[0].count),
      totalTimeTracking: parseInt(timeTrackingCount.rows[0].count)
    });
    
  } catch (err) {
    console.error('Setup error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Database setup failed', 
      detail: err.message 
    });
  } finally {
    if (client) client.release();
    await pool.end();
  }
}