import { Pool } from 'pg';
import { setupCors, handleOptions, handleError } from './_cors.js';

export default async function handler(req, res) {
  // ✅ Setup CORS đầu tiên
  setupCors(res);
  
  // ✅ Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    console.log('🔄 Smart Lock API - Handling CORS preflight');
    return handleOptions(req, res);
  }

  console.log('🚀 === SMART LOCK API REQUEST ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Origin:', req.headers.origin);
  console.log('Body:', req.body);

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
      
      case 'process_registration':
        console.log('🔐 Processing registration input from ESP32');
        return await processRegistration(req, res, client);
      
      // ✅ THÊM: Handle complete without card
      case 'complete_without_card':
        console.log('⏩ Processing complete without card');
        return await completeWithoutCard(req, res, client);
      
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
    // ❌ REMOVE: await pool.end();
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
    // ✅ THÊM LOGS DETAIL DEBUGGING
    console.log('🔍 POSTGRES_URL:', process.env.POSTGRES_URL ? 'Exists (masked)' : 'Missing');
    
    // Kiểm tra kết nối database
    const testQuery = await client.query('SELECT NOW() as time');
    console.log('✅ Database connection works, time:', testQuery.rows[0].time);
    
    // ✅ KIỂM TRA SQL QUERY
    console.log('🔍 Running query: SELECT * FROM "Manager_Sign_In"');
    
    const result = await client.query(`
      SELECT 
        id_user, 
        "Full_Name", 
        "UID", 
        private_pwd
      FROM "Manager_Sign_In" 
      ORDER BY "Full_Name"
    `);
    
    console.log(`✅ Query returned ${result.rows.length} rows`);
    console.log('📊 First row sample:', result.rows[0] || 'No rows');
    
    // ✅ CHUYỂN ĐỔI ĐÚNG ĐỊNH DẠNG
    const users = result.rows.map(user => ({
      id: user.id_user,
      name: user.Full_Name,
      uid: user.UID || null,
      hasPassword: !!user.private_pwd,
      createdAt: null // Không có trong cấu trúc gốc
    }));
    
    console.log('📤 Mapped users array:', users.length, 'items');
    console.log('📤 First mapped user:', users[0] || 'No users');
    
    return res.json({ success: true, users: users });
    
  } catch (error) {
    console.error('❌ Get users error:', error);
    return res.status(500).json({ 
      error: 'Failed to get users', 
      detail: error.message,
      stack: error.stack
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

// =================== REGISTRATION PROCESSING ===================

async function processRegistration(req, res, client) {
  const { type, value } = req.body;
  
  if (!type || !value) {
    return res.status(400).json({ error: 'Type and value are required' });
  }
  
  // Load current registration state
  const stateResult = await client.query(
    'SELECT value FROM "System_State" WHERE key = $1',
    ['registration_state']
  );
  
  if (stateResult.rows.length === 0 || !stateResult.rows[0].value.isActive) {
    return res.json({
      success: false,
      error: 'No active registration'
    });
  }
  
  const registrationState = stateResult.rows[0].value;
  console.log('📊 Current registration state:', registrationState);
  
  // Process based on input type and current state
  if (type === 'password' && registrationState.step === 'password_input') {
    // Submit password
    console.log('🔐 Password received from ESP32:', value);
    
    // Call admin API to set password
    await client.query('BEGIN');
    
    try {
      // Check if password exists
      const existingPwd = await client.query(
        'SELECT id_user FROM "Manager_Sign_In" WHERE private_pwd = $1',
        [value]
      );
      
      if (existingPwd.rows.length > 0) {
        // Password already exists
        registrationState.message = 'Mật khẩu đã tồn tại, vui lòng thử lại';
        
        await client.query(
          'UPDATE "System_State" SET value = $1 WHERE key = $2',
          [JSON.stringify(registrationState), 'registration_state']
        );
        
        await client.query('COMMIT');
        
        return res.json({
          success: false,
          error: 'Password already exists',
          message: 'Mật khẩu đã tồn tại, vui lòng thử lại'
        });
      }
      
      // Password is unique, update state
      registrationState.password = value;
      registrationState.step = 'password_set';
      registrationState.message = 'Mật khẩu đã được nhận. Quét thẻ RFID hoặc nhấn # để bỏ qua';
      
      await client.query(
        'UPDATE "System_State" SET value = $1 WHERE key = $2',
        [JSON.stringify(registrationState), 'registration_state']
      );
      
      await client.query('COMMIT');
      
      return res.json({
        success: true,
        message: 'Password accepted',
        nextStep: 'card_scan_optional'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } 
  else if (type === 'card' && registrationState.step === 'password_set') {
    // Submit card for registration
    console.log('🎫 Card received from ESP32:', value);
    
    // Call admin API to set card
    await client.query('BEGIN');
    
    try {
      // Check if card exists
      const existingCard = await client.query(
        'SELECT "Full_Name" FROM "Manager_Sign_In" WHERE "UID" = $1',
        [value]
      );
      
      if (existingCard.rows.length > 0) {
        // Card already exists
        registrationState.message = 'Thẻ đã tồn tại, vui lòng thử thẻ khác';
        
        await client.query(
          'UPDATE "System_State" SET value = $1 WHERE key = $2',
          [JSON.stringify(registrationState), 'registration_state']
        );
        
        await client.query('COMMIT');
        
        return res.json({
          success: false,
          error: 'Card already exists',
          cardOwner: existingCard.rows[0].Full_Name
        });
      }
      
      // Card is unique, update state and complete registration
      registrationState.uid = value;
      
      // Generate user ID
      const userIdResult = await client.query(
        'SELECT COALESCE(MAX(id_user), 0) + 1 as next_id FROM "Manager_Sign_In"'
      );
      const newUserId = userIdResult.rows[0].next_id;
      
      // Generate name - use provided name or auto-generate
      const userName = registrationState.userData?.fullName || `User${String(newUserId).padStart(3, '0')}`;
      
      // Insert new user
      const insertResult = await client.query(
        `INSERT INTO "Manager_Sign_In" (id_user, "Full_Name", private_pwd, "UID") 
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [newUserId, userName, registrationState.password, value]
      );
      
      // Reset state
      registrationState = {
        isActive: false,
        step: 'waiting',
        targetUserId: null,
        userData: null,
        password: null,
        uid: null,
        startTime: null,
        message: 'Đăng ký thành công'
      };
      
      await client.query(
        'UPDATE "System_State" SET value = $1 WHERE key = $2',
        [JSON.stringify(registrationState), 'registration_state']
      );
      
      await client.query('COMMIT');
      
      return res.json({
        success: true,
        message: 'Registration completed successfully',
        user: {
          id: insertResult.rows[0].id_user,
          name: insertResult.rows[0].Full_Name
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  else if (type === 'skip_card' && registrationState.step === 'password_set') {
    // Skip card scan and complete registration without card
    console.log('⏩ Skipping card scan, completing registration');
    
    await client.query('BEGIN');
    
    try {
      // Generate user ID
      const userIdResult = await client.query(
        'SELECT COALESCE(MAX(id_user), 0) + 1 as next_id FROM "Manager_Sign_In"'
      );
      const newUserId = userIdResult.rows[0].next_id;
      
      // Generate name - use provided name or auto-generate
      const userName = registrationState.userData?.fullName || `User${String(newUserId).padStart(3, '0')}`;
      
      // Insert new user without card
      const insertResult = await client.query(
        `INSERT INTO "Manager_Sign_In" (id_user, "Full_Name", private_pwd) 
         VALUES ($1, $2, $3) RETURNING *`,
        [newUserId, userName, registrationState.password]
      );
      
      // Reset state
      registrationState = {
        isActive: false,
        step: 'waiting',
        targetUserId: null,
        userData: null,
        password: null,
        uid: null,
        startTime: null,
        message: 'Đăng ký thành công không có thẻ'
      };
      
      await client.query(
        'UPDATE "System_State" SET value = $1 WHERE key = $2',
        [JSON.stringify(registrationState), 'registration_state']
      );
      
      await client.query('COMMIT');
      
      return res.json({
        success: true,
        message: 'Registration completed without card',
        user: {
          id: insertResult.rows[0].id_user,
          name: insertResult.rows[0].Full_Name
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  else if (type === 'card' && registrationState.step === 'add_card') {
    // Add card to existing user
    console.log('🎫 Card received for existing user:', value);
    
    await client.query('BEGIN');
    
    try {
      // Check if card exists
      const existingCard = await client.query(
        'SELECT "Full_Name" FROM "Manager_Sign_In" WHERE "UID" = $1',
        [value]
      );
      
      if (existingCard.rows.length > 0) {
        // Card already exists
        registrationState.message = 'Thẻ đã tồn tại, vui lòng thử thẻ khác';
        
        await client.query(
          'UPDATE "System_State" SET value = $1 WHERE key = $2',
          [JSON.stringify(registrationState), 'registration_state']
        );
        
        await client.query('COMMIT');
        
        return res.json({
          success: false,
          error: 'Card already exists',
          cardOwner: existingCard.rows[0].Full_Name
        });
      }
      
      // Update user with new card
      const updateResult = await client.query(
        'UPDATE "Manager_Sign_In" SET "UID" = $1 WHERE id_user = $2 RETURNING *',
        [value, registrationState.targetUserId]
      );
      
      if (updateResult.rows.length === 0) {
        throw new Error('User not found');
      }
      
      // Reset state
      registrationState = {
        isActive: false,
        step: 'waiting',
        targetUserId: null,
        userData: null,
        password: null,
        uid: null,
        startTime: null,
        message: 'Thêm thẻ thành công'
      };
      
      await client.query(
        'UPDATE "System_State" SET value = $1 WHERE key = $2',
        [JSON.stringify(registrationState), 'registration_state']
      );
      
      await client.query('COMMIT');
      
      return res.json({
        success: true,
        message: 'Card added successfully',
        user: {
          id: updateResult.rows[0].id_user,
          name: updateResult.rows[0].Full_Name
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  else {
    return res.status(400).json({
      success: false,
      error: 'Invalid input type or state',
      currentState: registrationState.step,
      inputType: type
    });
  }
}

// ✅ THÊM: Complete without card function
async function completeWithoutCard(req, res, client) {
  console.log('⏩ Completing registration without card from ESP32');
  
  // Load current registration state
  const stateResult = await client.query(
    'SELECT value FROM "System_State" WHERE key = $1',
    ['registration_state']
  );
  
  if (stateResult.rows.length === 0) {
    return res.json({
      success: false,
      error: 'No active registration'
    });
  }
  
  let registrationState = stateResult.rows[0].value;
  
  if (!registrationState.isActive || registrationState.step !== 'password_set') {
    return res.json({
      success: false,
      error: 'Invalid state for completion'
    });
  }
  
  await client.query('BEGIN');
  
  try {
    // Generate user ID
    const userIdResult = await client.query(
      'SELECT COALESCE(MAX(id_user), 0) + 1 as next_id FROM "Manager_Sign_In"'
    );
    const newUserId = userIdResult.rows[0].next_id;
    
    // Generate name
    const userName = registrationState.userData?.fullName || `User${String(newUserId).padStart(3, '0')}`;
    
    // Insert new user without card
    const insertResult = await client.query(
      `INSERT INTO "Manager_Sign_In" (id_user, "Full_Name", private_pwd) 
       VALUES ($1, $2, $3) RETURNING *`,
      [newUserId, userName, registrationState.password]
    );
    
    // Reset state
    registrationState = {
      isActive: false,
      step: 'waiting',
      targetUserId: null,
      userData: null,
      password: null,
      uid: null,
      startTime: null,
      message: 'Đăng ký thành công'
    };
    
    await client.query(
      'UPDATE "System_State" SET value = $1 WHERE key = $2',
      [JSON.stringify(registrationState), 'registration_state']
    );
    
    await client.query('COMMIT');
    
    return res.json({
      success: true,
      message: 'Registration completed without card',
      user: {
        id: insertResult.rows[0].id_user,
        name: insertResult.rows[0].Full_Name
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}