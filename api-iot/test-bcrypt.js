const bcrypt = require('bcryptjs');

async function testBcrypt() {
  console.log('=== TESTING BCRYPT ===');
  
  // Test 1: Hash mật khẩu "1234"
  const password = "1234";
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  
  console.log('Original password:', password);
  console.log('Hashed password:', hashedPassword);
  
  // Test 2: So sánh
  const isMatch = await bcrypt.compare(password, hashedPassword);
  console.log('Match result:', isMatch);
  
  // Test 3: So sánh với hash có sẵn từ database
  console.log('\n=== TESTING WITH DATABASE HASH ===');
  
  // Thay thế hash này bằng hash thực từ database của bạn
  const dbHash = "$2a$10$example..."; // CẦN THAY HASH THẬT
  
  try {
    const dbMatch = await bcrypt.compare("1234", dbHash);
    console.log('Database match:', dbMatch);
  } catch (error) {
    console.log('Error comparing with DB hash:', error.message);
  }
}

testBcrypt();