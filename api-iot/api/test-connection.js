// test-connection.js
const { Pool } = require('pg');

// Test với connection string trực tiếp
const connectionString = "postgresql://SmartLockDB_owner:npg_Wl2iaYQ7SzIA@ep-icy-frog-a8n06j5i-pooler.eastus2.azure.neon.tech/SmartLockDB?sslmode=require";

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function testConnection() {
  try {
    console.log('🔌 Testing connection...');
    const client = await pool.connect();
    
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ Connection successful!');
    console.log('🕐 Current time:', result.rows[0].current_time);
    console.log('🐘 PostgreSQL version:', result.rows[0].pg_version);
    
    client.release();
    await pool.end();
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    console.error('Full error:', err);
  }
}

testConnection();