#include <Keypad.h>
#include <LiquidCrystal_I2C.h>  // ✅ Thư viện này work với ESP32
#include <ESP32Servo.h>
#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

// WiFi credentials
const char* ssid = "MHEPro";
const char* password_wifi = "0934752432";

// API endpoints
const char* api_base_url = "https://api-iot-v2-narc5zc7q-hiens-projects-d1689d2e.vercel.app";
const char* smart_lock_endpoint = "/api/smart-lock";
const char* admin_endpoint = "/api/admin";

// NTP Server
const char* ntpServer = "pool.ntp.org";
const long gmtOffset_sec = 25200;
const int daylightOffset_sec = 0;

// LCD setup
LiquidCrystal_I2C lcd(0x27, 16, 2);

// Servo setup
Servo myServo;
const int SERVO_PIN = 4;

// Keypad setup
const byte ROWS = 4;
const byte COLS = 4;
char keys[ROWS][COLS] = {
  {'D','C','B','A'},
  {'#','9','6','3'},
  {'0','8','5','2'},
  {'*','7','4','1'}
};
byte rowPins[ROWS] = {32, 33, 25, 26};
byte colPins[COLS] = {27, 14, 12, 13};
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// Password
String password = "1234";
String input_pass = "";
bool inputStarted = false;

// RFID setup
#define SS_PIN 5
#define RST_PIN 2
MFRC522 mfrc522(SS_PIN, RST_PIN);
byte validUID[4] = {0x67, 0xA2, 0x14, 0x05};

// Registration mode variables
bool registrationMode = false;
String registrationStep = "waiting";
String pendingPassword = "";
unsigned long lastModeCheck = 0;
const unsigned long MODE_CHECK_INTERVAL = 3000;

// Debounce variables
unsigned long lastKeyTime = 0;
const unsigned long KEY_DEBOUNCE_DELAY = 200;
char lastKey = 0;

// Add Card mode variables
bool addCardMode = false;
String targetUserId = "";
unsigned long addCardStartTime = 0;
const unsigned long ADD_CARD_TIMEOUT = 30000;

// Thêm biến toàn cục
unsigned long lcdMessageTimer = 0;
bool lcdMessageToggle = false;
String fullMessage = "";
unsigned long lastTimeDisplay = 0;
const unsigned long TIME_DISPLAY_INTERVAL = 10000; // 10 giây cập nhật thời gian hiển thị

// =================== SETUP ===================
void setup() {
  Serial.begin(115200);
  Serial.println("🚀 Starting Smart Lock System...");
  
  // Initialize LCD
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Smart Lock Init");
  delay(1000);

  // Connect WiFi
  connectWiFi();
  
  // Initialize Servo
  myServo.attach(SERVO_PIN);
  myServo.write(0); // Lock position
  
  // Initialize RFID
  SPI.begin();
  mfrc522.PCD_Init();
  
  Serial.println("✅ Setup complete!");
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Smart Lock Ready");
  
  // Test API connection
  testAPIConnection();
}

// =================== WIFI & UTILITIES ===================
void connectWiFi() {
  WiFi.begin(ssid, password_wifi);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Connecting WiFi");
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    lcd.print(".");
  }
  
  Serial.println("");
  Serial.println("✅ WiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
  
  // Configure time
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("WiFi Connected!");
  delay(2000);
}

unsigned long getCurrentTimestamp() {
  time_t now;
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    Serial.println("⚠️ Failed to obtain time, using millis");
    return millis() / 1000;
  }
  time(&now);
  return now;
}

void testAPIConnection() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  http.begin(String(api_base_url) + smart_lock_endpoint + "?action=test_connection");
  http.setTimeout(5000);
  
  int responseCode = http.GET();
  Serial.println("🔗 API test response: " + String(responseCode));
  
  if (responseCode == 200) {
    String response = http.getString();
    Serial.println("✅ API connection OK: " + response);
  } else {
    Serial.println("⚠️ API connection failed: " + String(responseCode));
  }
  
  http.end();
}

// =================== LOCK CONTROL ===================
void openLockWithAnimation() {
  Serial.println("🔓 === OPENING LOCK ===");
  
  // Animation mở khóa
  for (int pos = 0; pos <= 90; pos += 10) {
    myServo.write(pos);
    delay(50);
  }
  
  delay(2000); // Giữ mở 2 giây
  
  // Animation đóng khóa
  for (int pos = 90; pos >= 0; pos -= 10) {
    myServo.write(pos);
    delay(50);
  }
  
  Serial.println("🔒 Lock operation complete!");
}

void openLockWithFallback() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Mo khoa (offline)");
  lcd.setCursor(0, 1);
  lcd.print("Kiem tra mang...");
  
  Serial.println("⚠️ Opening lock in fallback mode");
  openLockWithAnimation();
  
  delay(2000);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Smart Lock Ready");
}

// =================== API FUNCTIONS ===================
bool checkPasswordAPI(String pass) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ WiFi not connected for password check");
    return false;
  }
  
  HTTPClient http;
  http.begin(String(api_base_url) + smart_lock_endpoint);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);
  
  DynamicJsonDocument doc(1024);
  doc["action"] = "check_password";
  doc["password"] = pass;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("🔐 Checking password via API...");
  Serial.println("Request: " + jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode == 200) {
    String response = http.getString();
    Serial.println("🔐 Password API Response: " + response);
    
    DynamicJsonDocument responseDoc(1024);
    DeserializationError error = deserializeJson(responseDoc, response);
    
    if (error) {
      Serial.println("❌ JSON parse error: " + String(error.c_str()));
      http.end();
      return false;
    }
    
    bool valid = responseDoc["valid"] | false;
    Serial.println("🔐 Password valid: " + String(valid));
    http.end();
    return valid;
  } else {
    Serial.println("❌ HTTP Error: " + String(httpResponseCode));
    http.end();
    return false;
  }
}

bool checkUIDAPI(String uid) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ WiFi not connected for UID check");
    return false;
  }
  
  HTTPClient http;
  http.begin(String(api_base_url) + smart_lock_endpoint);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);
  
  DynamicJsonDocument doc(1024);
  doc["action"] = "check_uid";
  doc["uid"] = uid;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("📡 Checking UID via API...");
  Serial.println("Request: " + jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode == 200) {
    String response = http.getString();
    Serial.println("📡 UID API Response: " + response);
    
    DynamicJsonDocument responseDoc(1024);
    DeserializationError error = deserializeJson(responseDoc, response);
    
    if (error) {
      Serial.println("❌ JSON parse error: " + String(error.c_str()));
      http.end();
      return false;
    }
    
    bool valid = responseDoc["valid"] | false;
    Serial.println("📡 UID valid: " + String(valid));
    http.end();
    return valid;
  } else {
    Serial.println("❌ HTTP Error: " + String(httpResponseCode));
    http.end();
    return false;
  }
}

// ✅ HÀM logAccessWithResponse() CHO ACCESS LOGGING VỚI PHẢN HỒI
void logAccessWithResponse(String method, String identifier, bool success) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ WiFi not connected - opening lock locally");
    openLockWithFallback();
    return;
  }
  
  HTTPClient http;
  http.begin(String(api_base_url) + smart_lock_endpoint);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);
  
  DynamicJsonDocument doc(1024);
  doc["action"] = "log_access";
  doc["method"] = method;
  doc["identifier"] = identifier;
  doc["success"] = success;
  doc["timestamp"] = getCurrentTimestamp();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("📝 Logging access with response...");
  Serial.println("Request: " + jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("📝 Access log response (" + String(httpResponseCode) + "): " + response);
    
    if (httpResponseCode == 200) {
      DynamicJsonDocument responseDoc(1024);
      DeserializationError error = deserializeJson(responseDoc, response);
      
      if (error) {
        Serial.println("❌ JSON parse error: " + String(error.c_str()));
        openLockWithFallback();
        http.end();
        return;
      }
      
      if (responseDoc["logged"] == true) {
        if (responseDoc.containsKey("action") && responseDoc.containsKey("user")) {
          String action = responseDoc["action"];
          String user = responseDoc["user"];
          
          lcd.clear();
          lcd.setCursor(0, 0);
          if (action == "IN") {
            lcd.print("CHAO MUNG!");
            lcd.setCursor(0, 1);
            lcd.print(user.substring(0, 13) + " VAO");
            Serial.println("✅ " + user + " CHECKED IN");
          } else if (action == "OUT") {
            lcd.print("TAM BIET!");
            lcd.setCursor(0, 1);
            lcd.print(user.substring(0, 13) + " RA");
            Serial.println("✅ " + user + " CHECKED OUT");
          } else {
            lcd.print("TRUY CAP THANH CONG");
            lcd.setCursor(0, 1);
            lcd.print(user.substring(0, 14));
            Serial.println("✅ " + user + " ACCESS GRANTED");
          }
          
          openLockWithAnimation();
          
        } else {
          lcd.clear();
          lcd.setCursor(0, 0);
          lcd.print("TRUY CAP THANH CONG");
          Serial.println("✅ Access granted (no user info)");
          
          openLockWithAnimation();
        }
        
        delay(3000);
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Smart Lock Ready");
        
      } else {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Mat khau hop le");
        lcd.setCursor(0, 1);
        lcd.print("Chua dang ky user");
        Serial.println("⚠️ Valid credentials but user not registered");
        
        delay(3000);
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Smart Lock Ready");
      }
    } else {
      Serial.println("❌ HTTP Error " + String(httpResponseCode) + " - opening lock anyway");
      openLockWithFallback();
    }
  } else {
    Serial.println("❌ Network error: " + String(httpResponseCode));
    openLockWithFallback();
  }
  
  http.end();
}

// ✅ HÀM logAccess() CHO SIMPLE LOGGING
void logAccess(String method, String identifier, bool success) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ WiFi not connected for logging");
    return;
  }
  
  HTTPClient http;
  http.begin(String(api_base_url) + smart_lock_endpoint);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);
  
  DynamicJsonDocument doc(1024);
  doc["action"] = "log_access";
  doc["method"] = method;
  doc["identifier"] = identifier;
  doc["success"] = success;
  doc["timestamp"] = getCurrentTimestamp();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("📝 Logging access (simple)...");
  Serial.println("Request: " + jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("📝 Log response: " + response);
  } else {
    Serial.println("❌ Log failed: " + String(httpResponseCode));
  }
  
  http.end();
}

// ✅ HÀM sendCardIdToAPI() ĐỂ THÊM CARD
bool sendCardIdToAPI(String uid) {
  if (WiFi.status() != WL_CONNECTED) return false;
  
  HTTPClient http;
  http.begin(String(api_base_url) + smart_lock_endpoint);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);
  
  DynamicJsonDocument doc(1024);
  doc["action"] = "add_card";
  doc["uid"] = uid;
  doc["userId"] = targetUserId;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("📡 Sending card ID to API...");
  Serial.println("Request: " + jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode == 200) {
    String response = http.getString();
    Serial.println("📡 Add card response: " + response);
    
    DynamicJsonDocument responseDoc(1024);
    DeserializationError error = deserializeJson(responseDoc, response);
    
    if (error) {
      Serial.println("❌ JSON parse error: " + String(error.c_str()));
      http.end();
      return false;
    }
    
    bool success = responseDoc["success"] | false;
    String message = responseDoc["message"] | "Unknown response";
    
    lcd.clear();
    lcd.setCursor(0, 0);
    if (success) {
      lcd.print("THEM THE THANH CONG!");
      lcd.setCursor(0, 1);
      String userName = responseDoc["user"]["name"] | "Unknown";
      lcd.print("User: " + userName.substring(0, 10));
      Serial.println("✅ Card added successfully for: " + userName);
    } else {
      lcd.print("LOI THEM THE!");
      lcd.setCursor(0, 1);
      lcd.print(message.substring(0, 16));
      Serial.println("❌ Failed to add card: " + message);
    }
    
    delay(3000);
    
    // Reset add card mode
    addCardMode = false;
    targetUserId = "";
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Smart Lock Ready");
    
    http.end();
    return success;
  } else {
    Serial.println("❌ HTTP Error: " + String(httpResponseCode));
    
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("LOI MANG!");
    delay(2000);
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Smart Lock Ready");
    
    http.end();
    return false;
  }
}

// ✅ HÀM sendPasswordToAPI() CHO REGISTRATION
bool sendPasswordToAPI(String password) {
  if (WiFi.status() != WL_CONNECTED) return false;
  
  HTTPClient http;
  http.begin(String(api_base_url) + admin_endpoint);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);

  DynamicJsonDocument doc(1024);
  doc["action"] = "submit_password"; // ✅ SỬA: từ "set_password" thành "submit_password"
  doc["password"] = password;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("📡 Sending password to admin API...");
  Serial.println("Request: " + jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode == 200) {
    String response = http.getString();
    Serial.println("📡 Password API response: " + response);
    
    // Phân tích response để kiểm tra thành công hay thất bại
    DynamicJsonDocument responseDoc(1024);
    DeserializationError error = deserializeJson(responseDoc, response);
    
    if (error) {
      Serial.println("❌ JSON parse error: " + String(error.c_str()));
      return false;
    }
    
    bool success = responseDoc["success"] | false;
    String message = responseDoc["message"] | "";
    
    if (!success) {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("LOI MAT KHAU!");
      lcd.setCursor(0, 1);
      lcd.print(message.substring(0, 16));
      Serial.println("❌ Password error: " + message);
      delay(2000);
      return false;
    }
    
    // Success case
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Mat khau da luu!");
    lcd.setCursor(0, 1);
    lcd.print("Quet the moi...");
    http.end();
    return true;
  } else {
    Serial.println("❌ Password API error: " + String(httpResponseCode));
  }
  
  http.end();
  return false;
}

// ✅ HÀM sendScannedUID() CHO REGISTRATION
bool sendScannedUID(String uid) {
  if (WiFi.status() != WL_CONNECTED) return false;
  
  HTTPClient http;
  http.begin(String(api_base_url) + admin_endpoint);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);

  DynamicJsonDocument doc(1024);
  doc["action"] = "submit_card";
  doc["uid"] = uid;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("📡 Sending scanned UID to admin API...");
  Serial.println("Request: " + jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode == 200) {
    String response = http.getString();
    Serial.println("📡 UID scan response: " + response);
    
    DynamicJsonDocument responseDoc(1024);
    DeserializationError error = deserializeJson(responseDoc, response);
    
    if (error) {
      Serial.println("❌ JSON parse error: " + String(error.c_str()));
      http.end();
      return false;
    }
    
    bool success = responseDoc["success"] | false;
    
    if (success) {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Dang ky thanh cong!");
      lcd.setCursor(0, 1);
      String userName = responseDoc["user"]["name"] | "User";
      lcd.print(userName.substring(0, 16));
      
      delay(3000);
      
      // ✅ Reset registration mode
      registrationMode = false;
      registrationStep = "waiting";
      inputStarted = false;
      input_pass = "";
      
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Smart Lock Ready");
      
      http.end();
      return true;
    } else {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("LOI QUET THE!");
      lcd.setCursor(0, 1);
      String error = responseDoc["error"] | "Unknown error";
      lcd.print(error.substring(0, 16));
      delay(2000);
    }
    
  } else {
    Serial.println("❌ UID scan error: " + String(httpResponseCode));
    
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("LOI HTTP: " + String(httpResponseCode));
    lcd.setCursor(0, 1);
    lcd.print("Thu lai sau...");
    delay(2000);
  }
  
  http.end();
  return false;
}

// =================== MODE CHECKING ===================
bool checkRegistrationMode() {
  if (WiFi.status() != WL_CONNECTED) return false;
  
  HTTPClient http;
  String url = String(api_base_url) + admin_endpoint;
  Serial.println("🔍 Checking registration mode at: " + url);
  
  http.begin(url);
  http.setTimeout(5000);
  int httpResponseCode = http.GET();
  
  Serial.println("📥 Registration check response code: " + String(httpResponseCode));
  
  if (httpResponseCode == 200) {
    String response = http.getString();
    Serial.println("📥 Registration response: " + response);
    
    DynamicJsonDocument doc(1024);
    DeserializationError error = deserializeJson(doc, response);
    
    if (error) {
      Serial.println("❌ JSON parse error: " + String(error.c_str()));
      http.end();
      return false;
    }
    
    bool isActive = doc["isActive"];
    String step = doc["step"];
    
    Serial.println("📊 Registration state - isActive: " + String(isActive) + ", step: " + step);
    
    // ✅ SỬA: Kiểm tra nếu không active thì thoát khỏi tất cả modes
    if (!isActive) {
      if (registrationMode || addCardMode) {
        Serial.println("✅ Exiting all special modes - API says not active");
        registrationMode = false;
        addCardMode = false;
        registrationStep = "waiting";
        targetUserId = "";
        inputStarted = false;
        input_pass = "";
        
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Smart Lock Ready");
      }
      http.end();
      return false; // ✅ QUAN TRỌNG: Return false khi không active
    }
    
    // ✅ Chỉ xử lý khi isActive = true
    if (step == "add_card") {
      if (!addCardMode) {
        Serial.println("✅ Entering Add Card mode");
        addCardMode = true;
        registrationMode = false;
        registrationStep = "waiting";
        targetUserId = doc["targetUserId"] | "";
        addCardStartTime = millis();
        
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("CHE DO THEM THE");
        lcd.setCursor(0, 1);
        lcd.print("Quet the moi...");
      }
    }
    else if (step == "password_input") {
      if (!registrationMode || registrationStep != "password_input") {
        Serial.println("✅ Entering password input mode");
        registrationMode = true;
        addCardMode = false;
        registrationStep = "password_input";
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("CHE DO DANG KY");
        lcd.setCursor(0, 1);
        lcd.print("Nhap mat khau:");
        inputStarted = false;
        input_pass = "";
      }
    } 
    else if (step == "password_set") {
      if (!registrationMode || registrationStep != "password_set") {
        Serial.println("✅ Entering card scanning mode");
        registrationMode = true;
        addCardMode = false;
        registrationStep = "password_set";
        
        // Hiển thị thông báo từ API
        String message = doc["message"] | "Quet the hoac nhan # de bo qua";
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("BUOC 2: THEM THE");
        lcd.setCursor(0, 1);
        lcd.print(message.substring(0, 16));
        
        // Set timer để hiển thị nội dung thông báo còn lại
        lcdMessageTimer = millis();
        lcdMessageToggle = true;
      }
    }
    
    http.end();
    return (registrationMode || addCardMode);
    
  } else {
    Serial.println("❌ HTTP error: " + String(httpResponseCode));
    // ✅ THÊM: Reset modes khi có lỗi network
    if (registrationMode || addCardMode) {
      Serial.println("⚠️ Network error - resetting modes");
      registrationMode = false;
      addCardMode = false;
      registrationStep = "waiting";
      targetUserId = "";
      
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Smart Lock Ready");
    }
  }
  
  http.end();
  return false; // ✅ Return false khi có lỗi
}


// =================== INPUT HANDLERS ===================

// ✅ HÀM handleRegistrationPasswordInput()
void handleRegistrationPasswordInput(char key) {
  Serial.println("🔐 Registration input - current pass: '" + input_pass + "', key: " + String(key));
  
  if (key == '*') {
    input_pass = "";
    inputStarted = false;
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("CHE DO DANG KY");
    lcd.setCursor(0, 1);
    lcd.print("Nhap mat khau:");
    Serial.println("🔐 Registration password cleared by user");
  } 
  else if (key >= '0' && key <= '9') {
    if (!inputStarted) {
      inputStarted = true;
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Mat khau la:");
      lcd.setCursor(0, 1);
      Serial.println("🔐 Started password input");
    }
    
    if (input_pass.length() < 4) {
      input_pass += key;
      lcd.setCursor(input_pass.length() - 1, 1);
      lcd.print("*");
      
      Serial.println("🔐 Password progress: " + String(input_pass.length()) + "/4 - '" + input_pass + "'");
      
      if (input_pass.length() == 4) {
        Serial.println("🔐 Registration password complete: " + input_pass);
        if (sendPasswordToAPI(input_pass)) {
          pendingPassword = input_pass;
          registrationStep = "password_set";
          
          lcd.clear();
          lcd.setCursor(0, 0);
          lcd.print("Mat khau da luu!");
          lcd.setCursor(0, 1);
          lcd.print("Quet the/nhan #");
          
          // ✅ KHÔNG tự động complete - chờ user action
        }
        input_pass = "";
        inputStarted = false;
      }
    }
  }
  else {
    Serial.println("🔐 Invalid key for password: " + String(key));
  }
}

// ✅ HÀM handleNormalModeInput()
void handleNormalModeInput(char key) {
  if (key == '*') {
    input_pass = "";
    inputStarted = false;
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Smart Lock Ready");
    Serial.println("🔐 Password cleared");
  } 
  else if (key >= '0' && key <= '9') {
    if (!inputStarted) {
      inputStarted = true;
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Mat khau la:");
      lcd.setCursor(0, 1);
    }
    
    if (input_pass.length() < 4) {
      input_pass += key;
      lcd.setCursor(input_pass.length() - 1, 1);
      lcd.print("*");
      
      if (input_pass.length() == 4) {
        checkPasswordAndOpenLock();
      }
    }
  }
  else {
    Serial.println("🔐 Invalid key: " + String(key));
  }
}

void handleCardScanInput(char key) {
  if (key == '#' && registrationStep == "password_set") {
    Serial.println("⏩ Skipping card scan by user request");
    completeRegistrationWithoutUID();
  }
}

// ✅ HÀM checkPasswordAndOpenLock()
void checkPasswordAndOpenLock() {
  bool isValidPassword = false;
  
  Serial.println("🔐 Checking password: " + input_pass);
  
  // Kiểm tra password local trước
  if (input_pass == password) {
    Serial.println("✅ Local password match");
    isValidPassword = true;
  } else {
    // Kiểm tra password qua API
    Serial.println("🌐 Checking via API...");
    isValidPassword = checkPasswordAPI(input_pass);
  }
  
  if (isValidPassword) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Dung mat khau!");
    lcd.setCursor(0, 1);
    lcd.print("Dang xu ly...");
    Serial.println("✅ Password correct!");
    
    logAccessWithResponse("password", input_pass, true);
    
  } else {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Sai mat khau!");
    Serial.println("❌ Password incorrect!");
    logAccess("password", input_pass, false);
    delay(2000);
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Smart Lock Ready");
  }
  input_pass = "";
  inputStarted = false;
}

// ✅ HÀM completeRegistrationWithoutUID()
bool completeRegistrationWithoutUID() {
  if (WiFi.status() != WL_CONNECTED) return false;
  
  HTTPClient http;
  http.begin(String(api_base_url) + admin_endpoint);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(15000); // ✅ Increase timeout
  
  DynamicJsonDocument doc(1024);
  doc["action"] = "complete_without_card";
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("📡 Completing registration without UID...");
  Serial.println("🔗 URL: " + String(api_base_url) + admin_endpoint);
  Serial.println("📤 Request: " + jsonString);
  Serial.println("🕐 Timeout: 15000ms");
  
  int httpResponseCode = http.POST(jsonString);
  
  Serial.println("📥 Response Code: " + String(httpResponseCode));
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("📥 Response Body: " + response);
    
    if (httpResponseCode == 200) {
      DynamicJsonDocument responseDoc(1024);
      DeserializationError error = deserializeJson(responseDoc, response);
      
      if (error) {
        Serial.println("❌ JSON parse error: " + String(error.c_str()));
        http.end();
        return false;
      }
      
      bool success = responseDoc["success"] | false;
      
      if (success) {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Dang ky thanh cong!");
        lcd.setCursor(0, 1);
        String userName = responseDoc["user"]["name"] | "User";
        lcd.print(userName.substring(0, 16));
        
        delay(3000);
        
        // Reset registration mode
        registrationMode = false;
        registrationStep = "waiting";
        inputStarted = false;
        input_pass = "";
        
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Smart Lock Ready");
        
        http.end();
        return true;
      } else {
        String errorMsg = responseDoc["error"] | "Unknown error";
        String detail = responseDoc["detail"] | "";
        
        Serial.println("❌ API Error: " + errorMsg);
        Serial.println("❌ Error Detail: " + detail);
        
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("LOI DANG KY!");
        lcd.setCursor(0, 1);
        lcd.print(errorMsg.substring(0, 16));
        delay(3000);
      }
    } else {
      // ✅ HANDLE SPECIFIC HTTP ERROR CODES
      String response = http.getString();
      Serial.println("❌ HTTP Error " + String(httpResponseCode) + ": " + response);
      
      lcd.clear();
      lcd.setCursor(0, 0);
      if (httpResponseCode == 400) {
        lcd.print("LOI THAM SO!");
      } else if (httpResponseCode == 500) {
        lcd.print("LOI SERVER!");
      } else {
        lcd.print("LOI HTTP: " + String(httpResponseCode));
      }
      lcd.setCursor(0, 1);
      lcd.print("Thu lai sau...");
      delay(3000);
    }
  } else {
    Serial.println("❌ Network error: " + String(httpResponseCode));
    Serial.println("❌ HTTP error: " + http.errorToString(httpResponseCode));
    
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("LOI MANG!");
    lcd.setCursor(0, 1);
    lcd.print("Kiem tra WiFi...");
    delay(3000);
  }
  
  http.end();
  return false;
}

// =================== RFID HANDLER ===================
void handleRFIDScan() {
  if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
    String uid = "";
    for (byte i = 0; i < mfrc522.uid.size; i++) {
      uid += String(mfrc522.uid.uidByte[i], HEX);
    }
    uid.toUpperCase();
    
    Serial.println("📡 RFID detected: " + uid);

    if (addCardMode) {
      Serial.println("📡 Add Card mode - sending UID: " + uid);
      sendCardIdToAPI(uid);
    }
    else if (registrationMode && registrationStep == "password_set") {
      if (sendScannedUID(uid)) {
        delay(2000);
      }
    } 
    else if (!registrationMode && !addCardMode) {
      if (checkUIDAPI(uid)) {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("The hop le!");
        lcd.setCursor(0, 1);
        lcd.print("Dang xu ly...");
        
        logAccessWithResponse("rfid", uid, true);
        
      } else {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("The khong hop le");
        logAccess("rfid", uid, false);
        delay(2000);
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Smart Lock Ready");
      }
    }

    mfrc522.PICC_HaltA();
    mfrc522.PCD_StopCrypto1();
  }
  
  // Kiểm tra timeout cho Add Card mode
  if (addCardMode && (millis() - addCardStartTime > ADD_CARD_TIMEOUT)) {
    Serial.println("⏰ Add Card mode timeout");
    addCardMode = false;
    targetUserId = "";
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("HET THOI GIAN!");
    delay(2000);
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Smart Lock Ready");
  }
}

// =================== MAIN LOOP ===================
void loop() {
  // 1. CHỨC NĂNG CHÍNH: Xử lý keypad và RFID để mở khóa
  char key = keypad.getKey();
  
  if (key && key != lastKey && (millis() - lastKeyTime > KEY_DEBOUNCE_DELAY)) {
    Serial.println("Valid key pressed: " + String(key));
    lastKey = key;
    lastKeyTime = millis();
    
    // Normal mode (mở khóa cửa) được ưu tiên xử lý đầu tiên
    if (!registrationMode && !addCardMode) {
      handleNormalModeInput(key);
    }
    // Các chế độ đặc biệt chỉ khi được yêu cầu từ web interface
    else if (registrationMode && registrationStep == "password_input") {
      handleRegistrationPasswordInput(key);
    }
    else if (registrationMode && registrationStep == "password_set") {
      handleCardScanInput(key);
    }
  }
  
  // Reset last key
  if (millis() - lastKeyTime > 1000) {
    lastKey = 0;
  }

  // Xử lý quét thẻ RFID - chức năng chính
  handleRFIDScan();

  // 2. ✅ SỬA: HIỂN THỊ THỜI GIAN CHỈ KHI Ở CHẾ ĐỘ NORMAL
  if (!registrationMode && !addCardMode && !inputStarted && 
      millis() - lastTimeDisplay > TIME_DISPLAY_INTERVAL) {
    
    struct tm timeinfo;
    if(getLocalTime(&timeinfo)) {
      char timeString[16];
      strftime(timeString, 16, "%H:%M:%S", &timeinfo);
      
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Smart Lock Ready");
      lcd.setCursor(0, 1);
      lcd.print(timeString);
    }
    
    lastTimeDisplay = millis();
  }
  
  // 3. ✅ SỬA: CHECK REGISTRATION MODE - Ưu tiên thấp hơn
  if (millis() - lastModeCheck > MODE_CHECK_INTERVAL) {
    checkRegistrationMode();
    lastModeCheck = millis();
  }

  // 4. ✅ SỬA: Toggle message chỉ khi cần thiết
  if (registrationMode && registrationStep == "password_set" && 
      (millis() - lcdMessageTimer > 3000)) {
    lcdMessageTimer = millis();
    lcdMessageToggle = !lcdMessageToggle;
    
    lcd.setCursor(0, 1);
    if (lcdMessageToggle) {
      lcd.print("Quet the moi...  ");
    } else {
      lcd.print("Nhan # de bo qua ");
    }
  }
}
