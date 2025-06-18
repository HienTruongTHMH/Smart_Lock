#include <Keypad.h>
#include <LiquidCrystal_I2C.h>
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
const char* api_base_url = "https://api-ni7pgh09n-hiens-projects-d1689d2e.vercel.app";
const char* check_password_endpoint = "/api/check-password";
const char* check_uid_endpoint = "/api/check-uid";
const char* log_access_endpoint = "/api/log-access";

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
bool inputStarted = false; // Để track xem đã bắt đầu nhập chưa

// RFID setup
#define SS_PIN 5
#define RST_PIN 2
MFRC522 mfrc522(SS_PIN, RST_PIN);
byte validUID[4] = {0x67, 0xA2, 0x14, 0x05};

// Registration mode variables
bool registrationMode = false;
String registrationStep = "waiting"; // waiting, password_input, password_set, scanning
String pendingPassword = "";
unsigned long lastModeCheck = 0;
const unsigned long MODE_CHECK_INTERVAL = 3000;

// Thêm variables để debounce
unsigned long lastKeyTime = 0;
const unsigned long KEY_DEBOUNCE_DELAY = 200; // 200ms debounce
char lastKey = 0;

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
  Serial.println("WiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
  
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("WiFi Connected!");
  delay(2000);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Smart Lock Ready");
}

unsigned long getCurrentTimestamp() {
  time_t now;
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    Serial.println("Failed to obtain time");
    return millis() / 1000;
  }
  time(&now);
  return now;
}

bool checkPasswordAPI(String pass) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected");
    return false;
  }
  
  HTTPClient http;
  http.begin(String(api_base_url) + check_password_endpoint);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);
  
  DynamicJsonDocument doc(1024);
  doc["password"] = pass;
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("Checking password via API...");
  Serial.println("Request: " + jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode == 200) {
    String response = http.getString();
    Serial.println("Response: " + response);
    
    DynamicJsonDocument responseDoc(1024);
    deserializeJson(responseDoc, response);
    
    bool valid = responseDoc["valid"];
    http.end();
    return valid;
  } else {
    Serial.println("HTTP Error: " + String(httpResponseCode));
    http.end();
    return false;
  }
}

bool checkUIDAPI(String uid) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected");
    return false;
  }
  
  HTTPClient http;
  http.begin(String(api_base_url) + check_uid_endpoint);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);
  
  DynamicJsonDocument doc(1024);
  doc["uid"] = uid;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("Checking UID via API...");
  Serial.println("Request: " + jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode == 200) {
    String response = http.getString();
    Serial.println("Response: " + response);
    
    DynamicJsonDocument responseDoc(1024);
    deserializeJson(responseDoc, response);
    
    bool valid = responseDoc["valid"];
    http.end();
    return valid;
  } else {
    Serial.println("HTTP Error: " + String(httpResponseCode));
    http.end();
    return false;
  }
}

void logAccess(String method, String identifier, bool success) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected for logging");
    return;
  }
  
  HTTPClient http;
  http.begin(String(api_base_url) + log_access_endpoint);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);
  
  DynamicJsonDocument doc(1024);
  doc["method"] = method;
  doc["identifier"] = identifier;
  doc["success"] = success;
  doc["timestamp"] = getCurrentTimestamp();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("Logging access...");
  Serial.println("Request: " + jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Log response: " + response);
  } else {
    Serial.println("Log failed: " + String(httpResponseCode));
  }
  
  http.end();
}

void openLock() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Mo khoa...");
  myServo.write(90);
  delay(3000);
  myServo.write(0);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Smart Lock Ready");
  inputStarted = false; // Reset input state
}

bool checkRegistrationMode() {
  if (WiFi.status() != WL_CONNECTED) return false;
  
  HTTPClient http;
  http.begin(String(api_base_url) + "/api/set-registration-mode");
  int httpResponseCode = http.GET();
  
  if (httpResponseCode == 200) {
    String response = http.getString();
    
    // Parse JSON response
    if (response.indexOf("\"isActive\":true") > -1) {
      if (response.indexOf("\"step\":\"password_input\"") > -1) {
        registrationMode = true;
        registrationStep = "password_input";
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("CHE DO DANG KY");
        lcd.setCursor(0, 1);
        lcd.print("Nhap mat khau:");
        inputStarted = false;
        input_pass = "";
        return true;
      } else if (response.indexOf("\"step\":\"password_set\"") > -1) {
        registrationMode = true;
        registrationStep = "password_set";
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("CHE DO DANG KY");
        lcd.setCursor(0, 1);
        lcd.print("Quet the moi...");
        return true;
      }
    } else {
      if (registrationMode) {
        // Exit registration mode
        registrationMode = false;
        registrationStep = "waiting";
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Smart Lock Ready");
        inputStarted = false;
        input_pass = "";
      }
    }
  }
  
  http.end();
  return registrationMode;
}

bool sendPasswordToAPI(String password) {
  if (WiFi.status() != WL_CONNECTED) return false;
  
  HTTPClient http;
  http.begin(String(api_base_url) + "/api/set-registration-mode");
  http.addHeader("Content-Type", "application/json");

  String jsonData = "{\"action\":\"set_password\",\"password\":\"" + password + "\"}";
  int httpResponseCode = http.POST(jsonData);
  
  if (httpResponseCode == 200) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Mat khau da luu!");
    lcd.setCursor(0, 1);
    lcd.print("Quet the moi...");
    http.end();
    return true;
  }
  
  http.end();
  return false;
}

bool sendScannedUID(String uid) {
  if (WiFi.status() != WL_CONNECTED) return false;
  
  HTTPClient http;
  http.begin(String(api_base_url) + "/api/set-registration-mode");
  http.addHeader("Content-Type", "application/json");

  String jsonData = "{\"action\":\"scan_uid\",\"uid\":\"" + uid + "\"}";
  int httpResponseCode = http.POST(jsonData);
  
  if (httpResponseCode == 200) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Da quet the!");
    lcd.setCursor(0, 1);
    lcd.print("Dang xu ly...");
    http.end();
    return true;
  }
  
  http.end();
  return false;
}

void setup() {
  Serial.begin(115200);
  Serial.println("Starting Smart Lock...");
  
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Smart Lock Init");
  delay(1000);

  connectWiFi();
  
  myServo.attach(SERVO_PIN);
  myServo.write(0);

  SPI.begin();
  mfrc522.PCD_Init();
  
  Serial.println("Setup complete!");
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Smart Lock Ready");

  // Test API connection on startup
  Serial.println("Testing API connection...");
  HTTPClient http;
  http.begin(String(api_base_url) + "/api/test-db");
  int responseCode = http.GET();
  Serial.println("API test response: " + String(responseCode));
  http.end();
}

void loop() {
  // Check registration mode periodically
  if (millis() - lastModeCheck > MODE_CHECK_INTERVAL) {
    checkRegistrationMode();
    lastModeCheck = millis();
  }

  char key = keypad.getKey();
  
  // Thêm debounce và validation
  if (key && key != lastKey && (millis() - lastKeyTime > KEY_DEBOUNCE_DELAY)) {
    Serial.println("Valid key pressed: " + String(key));
    lastKey = key;
    lastKeyTime = millis();
    
    // Nếu đang ở chế độ đăng ký và cần nhập password
    if (registrationMode && registrationStep == "password_input") {
      handleRegistrationPasswordInput(key);
    }
    // Chế độ bình thường
    else if (!registrationMode) {
      handleNormalModeInput(key);
    }
  }
  
  // Reset lastKey sau 1 giây để cho phép nhấn lại
  if (millis() - lastKeyTime > 1000) {
    lastKey = 0;
  }

  // RFID scanning logic (giữ nguyên)
  handleRFIDScan();
}

// Tách riêng function xử lý password trong chế độ đăng ký:
void handleRegistrationPasswordInput(char key) {
  if (key == '*') {
    input_pass = "";
    inputStarted = false;
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("CHE DO DANG KY");
    lcd.setCursor(0, 1);
    lcd.print("Nhap mat khau:");
    Serial.println("Registration password cleared");
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
      
      Serial.println("Password length: " + String(input_pass.length()));
      
      // Tự động xác nhận khi đủ 4 số
      if (input_pass.length() == 4) {
        Serial.println("Registration password complete: " + input_pass);
        if (sendPasswordToAPI(input_pass)) {
          pendingPassword = input_pass;
          registrationStep = "password_set";
        }
        input_pass = "";
        inputStarted = false;
      }
    }
  }
  else {
    Serial.println("Invalid key for password: " + String(key));
  }
}

// Tách riêng function xử lý input ở chế độ bình thường:
void handleNormalModeInput(char key) {
  // if (key == 'A') {
  //   testServoManual();
  //   return;
  // }
  
  if (key == '*') {
    input_pass = "";
    inputStarted = false;
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Smart Lock Ready");
    Serial.println("Password cleared");
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
      
      // Tự động xác nhận khi đủ 4 số
      if (input_pass.length() == 4) {
        checkPasswordAndOpenLock();
      }
    }
  }
  else {
    Serial.println("Invalid key: " + String(key));
  }
}

// Tách riêng function check password:
void checkPasswordAndOpenLock() {
  bool isValidPassword = false;
  
  Serial.println("Checking password: " + input_pass);
  
  // Kiểm tra password local trước
  if (input_pass == password) {
    Serial.println("Local password match");
    isValidPassword = true;
  } else {
    // Kiểm tra password qua API
    Serial.println("Checking via API...");
    isValidPassword = checkPasswordAPI(input_pass);
  }
  
  if (isValidPassword) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Dung mat khau!");
    Serial.println("Password correct!");
    logAccess("password", input_pass, true);
    openLock();
  } else {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Sai mat khau!");
    Serial.println("Password incorrect!");
    logAccess("password", input_pass, false);
    delay(2000);
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Smart Lock Ready");
  }
  input_pass = "";
  inputStarted = false;
}

// Tách riêng RFID handling:
void handleRFIDScan() {
  if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
    String uid = "";
    for (byte i = 0; i < mfrc522.uid.size; i++) {
      uid += String(mfrc522.uid.uidByte[i], HEX);
    }
    uid.toUpperCase();

    if (registrationMode && registrationStep == "password_set") {
      // Registration mode - send UID to web
      if (sendScannedUID(uid)) {
        // Wait for registration completion
        delay(2000);
      }
    } else if (!registrationMode) {
      // Normal mode - check UID
      if (checkUIDAPI(uid)) {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("The hop le!");
        lcd.setCursor(0, 1);
        lcd.print("Mo cua...");
        logAccess("rfid", uid, true);
        openLock();
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
}
