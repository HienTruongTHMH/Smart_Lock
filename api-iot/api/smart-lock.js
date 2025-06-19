const { Pool } = require('pg');

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Get action from query params (GET) or body (POST)
  const action = req.method === 'GET' ? req.query.action : req.body?.action;

  if (!action) {
    return res.status(400).json({ error: 'Action parameter is required' });
  }

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    switch (action) {
      // =================== AUTHENTICATION ===================
      case 'check_password':
        return await checkPassword(req, res, pool);
      
      case 'check_uid':
        return await checkUID(req, res, pool);
      
      // =================== ACCESS LOGGING ===================
      case 'log_access':
        return await logAccess(req, res, pool);
      
      // =================== DATA RETRIEVAL ===================
      case 'get_users':
        return await getUsers(req, res, pool);
      
      case 'get_access_log':
        return await getAccessLog(req, res, pool);
      
      // =================== CARD MANAGEMENT ===================
      case 'add_card':
        return await addCard(req, res, pool);
      
      case 'remove_card':
        return await removeCard(req, res, pool);
      
      // =================== SYSTEM ===================
      case 'test_connection':
        return await testConnection(req, res, pool);

      default:
        return res.status(400).json({ error: 'Invalid action: ' + action });
    }
  } catch (error) {
    console.error('Smart Lock API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      detail: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    await pool.end();
  }
}

// =================== AUTHENTICATION FUNCTIONS ===================

async function checkPassword(req, res, pool) {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  console.log('🔐 Checking password:', password);
  
  // ✅ SỬA TABLE NAME
  const result = await pool.query(
    'SELECT id_user, "Full_Name", private_pwd FROM "Manager_Sign_In" WHERE private_pwd = $1',
    [password]
  );

  if (result.rows.length > 0) {
    console.log('✅ Password match found for:', result.rows[0].Full_Name);
    return res.json({
      valid: true,
      user: result.rows[0].Full_Name,
      userId: result.rows[0].id_user
    });
  }

  console.log('❌ No password match found');
  return res.json({ valid: false });
}

async function checkUID(req, res, pool) {
  const { uid } = req.body;
  
  if (!uid) {
    return res.status(400).json({ error: 'UID is required' });
  }

  console.log('📡 Checking UID:', uid);

  const result = await pool.query(
    'SELECT id_user, "Full_Name", "UID" FROM "Manager_Sign_In" WHERE "UID" = $1',
    [uid]
  );

  if (result.rows.length > 0) {
    console.log('✅ UID match found for:', result.rows[0].Full_Name);
    return res.json({
      valid: true,
      user: result.rows[0].Full_Name,
      userId: result.rows[0].id_user
    });
  }

  console.log('❌ No UID match found');
  return res.json({ valid: false });
}

// =================== ACCESS LOGGING ===================

async function logAccess(req, res, pool) {
  const { method, identifier, success, timestamp } = req.body;

  if (!method || !identifier || success === undefined) {
    return res.status(400).json({ error: 'Method, identifier, and success are required' });
  }

  console.log('📝 Logging access:', { method, identifier, success });

  // Insert access log entry
  const logTime = timestamp ? new Date(timestamp * 1000) : new Date();
  
  await pool.query(
    'INSERT INTO "Manager_Access_Log" ("Method", "Identifier", "Success", "Time_Tracking") VALUES ($1, $2, $3, $4)',
    [method, identifier, success, logTime]
  );

  // If failed access, just log and return
  if (!success) {
    return res.json({ logged: false, message: 'Failed access logged' });
  }

  // Find user for successful access
  let user = null;
  if (method === 'password') {
    const result = await pool.query(
      'SELECT * FROM "Manager_Sign_In" WHERE private_pwd = $1',
      [identifier]
    );
    user = result.rows[0];
  } else if (method === 'rfid') {
    const result = await pool.query(
      'SELECT * FROM "Manager_Sign_In" WHERE "UID" = $1',
      [identifier]
    );
    user = result.rows[0];
  }

  if (!user) {
    return res.json({ logged: false, message: 'Valid credentials but user not found' });
  }

  // Determine check-in/out status
  const lastLog = await pool.query(
    'SELECT * FROM "Manager_Access_Log" WHERE "User_ID" = $1 AND "Success" = true ORDER BY "Time_Tracking" DESC LIMIT 1',
    [user.id_user]
  );

  const newStatus = (lastLog.rows.length === 0 || lastLog.rows[0].Check_Status === 'OUT') ? 'IN' : 'OUT';

  // Update log entry with user info
  await pool.query(
    'UPDATE "Manager_Access_Log" SET "User_ID" = $1, "Check_Status" = $2 WHERE "Method" = $3 AND "Identifier" = $4 AND "Time_Tracking" = $5',
    [user.id_user, newStatus, method, identifier, logTime]
  );

  console.log(`✅ ${user.Full_Name} checked ${newStatus}`);

  return res.json({
    logged: true,
    action: newStatus,
    user: user.Full_Name,
    userId: user.id_user
  });
}

// =================== DATA RETRIEVAL ===================

async function getUsers(req, res, pool) {
  console.log('📋 Getting user list');
  
  const result = await pool.query(
    'SELECT id_user, "Full_Name", "UID", private_pwd, created_at FROM "Manager_Sign_In" ORDER BY "Full_Name"'
  );
  
  return res.json({ 
    success: true, 
    users: result.rows.map(user => ({
      id: user.id_user,
      name: user.Full_Name,
      uid: user.UID || null,
      hasPassword: !!user.private_pwd,
      createdAt: user.created_at
    }))
  });
}

async function getAccessLog(req, res, pool) {
  console.log('📊 Getting access log');
  
  const { limit = 50 } = req.query;
  
  const result = await pool.query(`
    SELECT 
      al.*,
      msi."Full_Name",
      msi."UID"
    FROM "Manager_Access_Log" al
    LEFT JOIN "Manager_Sign_In" msi ON al."User_ID" = msi."id_user"
    ORDER BY al."Time_Tracking" DESC 
    LIMIT $1
  `, [limit]);
  
  return res.json({ 
    success: true, 
    logs: result.rows.map(log => ({
      id: log.id,
      method: log.Method,
      identifier: log.Identifier,
      success: log.Success,
      checkStatus: log.Check_Status,
      timestamp: log.Time_Tracking,
      user: log.Full_Name || 'Unknown',
      uid: log.UID
    }))
  });
}

// =================== CARD MANAGEMENT ===================

async function addCard(req, res, pool) {
  const { uid, userId } = req.body;

  if (!uid || !userId) {
    return res.status(400).json({ 
      success: false,
      error: 'UID and User ID are required' 
    });
  }

  console.log('🆔 Adding card:', { uid, userId });

  // Check if user exists
  const userCheck = await pool.query(
    'SELECT * FROM "Manager_Sign_In" WHERE id_user = $1',
    [userId]
  );

  if (userCheck.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  const user = userCheck.rows[0];

  // Check if user already has a card
  if (user.UID && user.UID.trim() !== '') {
    return res.status(400).json({
      success: false,
      error: 'User already has a card: ' + user.UID
    });
  }

  // Check if UID is already in use
  const uidCheck = await pool.query(
    'SELECT * FROM "Manager_Sign_In" WHERE "UID" = $1',
    [uid]
  );

  if (uidCheck.rows.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'This card is already assigned to: ' + uidCheck.rows[0].Full_Name
    });
  }

  // Add card to user
  const updateResult = await pool.query(
    'UPDATE "Manager_Sign_In" SET "UID" = $1 WHERE id_user = $2 RETURNING *',
    [uid, userId]
  );

  console.log('✅ Card added successfully for:', updateResult.rows[0].Full_Name);

  return res.json({
    success: true,
    message: 'Card added successfully',
    user: {
      id: updateResult.rows[0].id_user,
      name: updateResult.rows[0].Full_Name,
      uid: updateResult.rows[0].UID
    }
  });
}

async function removeCard(req, res, pool) {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ 
      success: false,
      error: 'User ID is required' 
    });
  }

  console.log('🗑️ Removing card for user:', userId);

  const result = await pool.query(
    'UPDATE "Manager_Sign_In" SET "UID" = NULL WHERE id_user = $1 RETURNING "Full_Name"',
    [userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  console.log('✅ Card removed for:', result.rows[0].Full_Name);

  return res.json({
    success: true,
    message: 'Card removed successfully',
    user: result.rows[0].Full_Name
  });
}

// =================== SYSTEM ===================

async function testConnection(req, res, pool) {
  console.log('🔗 Testing database connection...');
  
  const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
  
  return res.json({ 
    success: true, 
    timestamp: result.rows[0].current_time,
    message: 'Database connection OK',
    pgVersion: result.rows[0].pg_version.substring(0, 50),
    environment: process.env.NODE_ENV || 'production'
  });
}