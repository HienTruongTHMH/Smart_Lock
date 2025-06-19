import { Pool } from 'pg';
import { setupCors } from './_cors.js';

export default async function handler(req, res) {
  setupCors(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!process.env.POSTGRES_URL) {
    console.error('❌ POSTGRES_URL not found');
    return res.status(500).json({ 
      success: false, 
      error: 'POSTGRES_URL environment variable not found'
    });
  }

  console.log('🧹 Starting database reset...');

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });

  let client;

  try {
    client = await pool.connect();
    
    // Truncate all tables - reset everything
    await client.query(`
      TRUNCATE TABLE "Manager_Sign_In", "Time_Tracking" CASCADE;
    `);
    
    // Check counts after reset
    const userCount = await client.query('SELECT COUNT(*) FROM "Manager_Sign_In"');
    const logCount = await client.query('SELECT COUNT(*) FROM "Manager_Access_Log"');
    const timeCount = await client.query('SELECT COUNT(*) FROM "Time_Tracking"');
    
    return res.json({
      success: true,
      message: 'All tables have been completely reset!',
      tablesReset: [
        "Manager_Sign_In", 
        "Manager_Access_Log", 
        "Time_Tracking", 
        "Current_User_Status",
        "System_State"
      ],
      totalUsers: parseInt(userCount.rows[0].count),
      totalLogs: parseInt(logCount.rows[0].count),
      totalTimeTracking: parseInt(timeCount.rows[0].count)
    });
    
  } catch (error) {
    console.error('❌ Database reset error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to reset database', 
      detail: error.message 
    });
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}