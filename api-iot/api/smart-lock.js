import { Pool } from 'pg';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ✅ LOG CHI TIẾT REQUEST
  console.log('🚀 === SMART LOCK API REQUEST ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Query:', req.query);
  console.log('Body:', req.body);
  console.log('Headers:', req.headers);

  // Get action from query params (GET) or body (POST)
  const action = req.method === 'GET' ? req.query.action : req.body?.action;

  console.log('📝 Action extracted:', action);

  if (!action) {
    console.log('❌ No action provided');
    return res.status(400).json({ error: 'Action parameter is required' });
  }

  // ✅ KIỂM TRA DATABASE URL
  if (!process.env.POSTGRES_URL) {
    console.error('❌ POSTGRES_URL not found in environment');
    return res.status(500).json({ 
      error: 'Database not configured',
      detail: 'POSTGRES_URL environment variable missing'
    });
  }

  console.log('✅ POSTGRES_URL found in environment');

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });

  let client;

  try {
    console.log('🔌 Connecting to database...');
    client = await pool.connect();
    console.log('✅ Database connected successfully');

    switch (action) {
      // =================== DATA RETRIEVAL ===================
      case 'get_users':
        console.log('📋 Processing get_users action');
        return await getUsers(req, res, client);
      
      case 'get_access_log':
        console.log('📊 Processing get_access_log action');
        return await getAccessLog(req, res, client);
      
      // =================== SYSTEM ===================
      case 'test_connection':
        console.log('🔗 Processing test_connection action');
        return await testConnection(req, res, client);

      // =================== AUTHENTICATION ===================
      case 'check_password':
        console.log('🔐 Processing check_password action');
        return await checkPassword(req, res, client);
      
      case 'check_uid':
        console.log('📡 Processing check_uid action');
        return await checkUID(req, res, client);
      
      // =================== ACCESS LOGGING ===================
      case 'log_access':
        console.log('📝 Processing log_access action');
        return await logAccess(req, res, client);
      
      // =================== CARD MANAGEMENT ===================
      case 'add_card':
        console.log('🆔 Processing add_card action');
        return await addCard(req, res, client);
      
      case 'remove_card':
        console.log('🗑️ Processing remove_card action');
        return await removeCard(req, res, client);

      default:
        console.log('❌ Invalid action:', action);
        return res.status(400).json({ error: 'Invalid action: ' + action });
    }
  } catch (error) {
    console.error('❌ Smart Lock API Error:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ 
      error: 'Internal server error',
      detail: error.message,
      action: action
    });
  } finally {
    if (client) {
      client.release();
      console.log('🔌 Database connection released');
    }
    await pool.end();
    console.log('🔌 Pool ended');
  }
}

// =================== AUTHENTICATION FUNCTIONS ===================

async function checkPassword(req, res, client) {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  console.log('🔐 Checking password:', password);
  
  // ✅ SỬA TABLE NAME
  const result = await client.query(
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

async function checkUID(req, res, client) {
  const { uid } = req.body;
  
  if (!uid) {
    return res.status(400).json({ error: 'UID is required' });
  }

  console.log('📡 Checking UID:', uid);

  const result = await client.query(
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

async function logAccess(req, res, client) {
  const { method, identifier, success, timestamp } = req.body;

  if (!method || !identifier || success === undefined) {
    return res.status(400).json({ error: 'Method, identifier, and success are required' });
  }

  console.log('📝 Logging access:', { method, identifier, success });

  try {
    const logTime = timestamp ? new Date(timestamp * 1000) : new Date();
    
    // ✅ INSERT VÀO Manager_Access_Log
    await client.query(
      'INSERT INTO "Manager_Access_Log" ("Method", "Identifier", "Success", "Time_Tracking") VALUES ($1, $2, $3, $4)',
      [method, identifier, success, logTime]
    );

    if (!success) {
      return res.json({ logged: false, message: 'Failed access logged' });
    }

    // Find user for successful access
    let user = null;
    if (method === 'password') {
      const result = await client.query(
        'SELECT * FROM "Manager_Sign_In" WHERE private_pwd = $1',
        [identifier]
      );
      user = result.rows[0];
    } else if (method === 'rfid') {
      const result = await client.query(
        'SELECT * FROM "Manager_Sign_In" WHERE "UID" = $1',
        [identifier]
      );
      user = result.rows[0];
    }

    if (!user) {
      return res.json({ logged: false, message: 'Valid credentials but user not found' });
    }

    // ✅ DETERMINE CHECK STATUS
    const lastStatus = await client.query(
      'SELECT "Check_Status" FROM "Time_Tracking" WHERE id = $1 ORDER BY "Time_Tracking" DESC LIMIT 1',
      [user.id_user]
    );

    const newStatus = (lastStatus.rows.length === 0 || lastStatus.rows[0].Check_Status === 'OUT') ? 'IN' : 'OUT';

    // ✅ UPDATE Manager_Access_Log VỚI USER INFO
    await client.query(
      'UPDATE "Manager_Access_Log" SET "User_ID" = $1, "Check_Status" = $2 WHERE "Method" = $3 AND "Identifier" = $4 AND "Time_Tracking" = $5',
      [user.id_user, newStatus, method, identifier, logTime]
    );

    // ✅ INSERT VÀO Time_Tracking
    await client.query(
      'INSERT INTO "Time_Tracking" ("Time_Tracking", "Status", "Method", id, "Check_Status") VALUES ($1, $2, $3, $4, $5)',
      [logTime, true, method, user.id_user, newStatus]
    );

    console.log(`✅ ${user.Full_Name} checked ${newStatus}`);

    return res.json({
      logged: true,
      action: newStatus,
      user: user.Full_Name,
      userId: user.id_user
    });
  } catch (error) {
    console.error('❌ Log access error:', error);
    return res.status(500).json({ 
      error: 'Failed to log access', 
      detail: error.message 
    });
  }
}

// =================== DATA RETRIEVAL ===================

// =================== GET USERS FUNCTION ===================
async function getUsers(req, res, client) {
  console.log('📋 === GET USERS FUNCTION ===');
  
  try {
    // ✅ KIỂM TRA BẢNG TỒN TẠI
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'Manager_Sign_In'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.error('❌ Table Manager_Sign_In does not exist');
      return res.status(500).json({ 
        error: 'Database not initialized',
        detail: 'Manager_Sign_In table not found. Run setup-database first.'
      });
    }
    
    // ✅ QUERY THEO CẤU TRÚC GỐC (KHÔNG CÓ created_at)
    console.log('✅ Querying user data with original structure...');
    const result = await client.query(`
      SELECT 
        id_user, 
        "Full_Name", 
        "UID", 
        private_pwd
      FROM "Manager_Sign_In" 
      ORDER BY "Full_Name"
    `);
    
    console.log(`✅ Found ${result.rows.length} users`);
    
    const response = { 
      success: true, 
      users: result.rows.map(user => ({
        id: user.id_user,
        name: user.Full_Name,
        uid: user.UID || null,
        hasPassword: !!user.private_pwd,
        createdAt: null // Không có trong cấu trúc gốc
      }))
    };
    
    console.log('📤 Sending response with users:', response.users.length);
    return res.json(response);
    
  } catch (error) {
    console.error('❌ Get users error:', error);
    return res.status(500).json({ 
      error: 'Failed to get users', 
      detail: error.message 
    });
  }
}

// =================== GET ACCESS LOG FUNCTION ===================
async function getAccessLog(req, res, client) {
  console.log('📊 Getting access log');
  
  const { limit = 50 } = req.query;
  
  try {
    // ✅ QUERY THEO CẤU TRÚC GỐC
    const result = await client.query(`
      SELECT 
        al.*,
        msi."Full_Name",
        msi."UID"
      FROM "Manager_Access_Log" al
      LEFT JOIN "Manager_Sign_In" msi ON al."User_ID" = msi."id_user"
      ORDER BY al."Time_Tracking" DESC 
      LIMIT $1
    `, [limit]);
    
    console.log(`✅ Found ${result.rows.length} access log entries`);
    
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
  } catch (error) {
    console.error('❌ Get access log error:', error);
    return res.status(500).json({ 
      error: 'Failed to get access log', 
      detail: error.message 
    });
  }
}

// =================== CARD MANAGEMENT ===================

async function addCard(req, res, client) {
  const { uid, userId } = req.body;

  if (!uid || !userId) {
    return res.status(400).json({ 
      success: false,
      error: 'UID and User ID are required' 
    });
  }

  console.log('🆔 Adding card:', { uid, userId });

  try {
    // Check if user exists
    const userCheck = await client.query(
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
    const uidCheck = await client.query(
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
    const updateResult = await client.query(
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
  } catch (error) {
    console.error('❌ Add card error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to add card', 
      detail: error.message 
    });
  }
}

async function removeCard(req, res, client) {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ 
      success: false,
      error: 'User ID is required' 
    });
  }

  console.log('🗑️ Removing card for user:', userId);

  const result = await client.query(
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

async function testConnection(req, res, client) {
  console.log('🔗 Testing database connection...');
  
  try {
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    
    return res.json({ 
      success: true, 
      timestamp: result.rows[0].current_time,
      message: 'Database connection OK',
      pgVersion: result.rows[0].pg_version.substring(0, 50),
      environment: process.env.NODE_ENV || 'production'
    });
  } catch (error) {
    console.error('❌ Test connection error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Database test failed', 
      detail: error.message 
    });
  }
}