#include <Keypad.h>
#include <LiquidCrystal_I2C.h>
#include <ESP32Servo.h>
#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>  // Thêm thư viện time

// WiFi credentials
const char* ssid = "ZONE FOURT";
const char* password_wifi = "12345678";

// API endpoints - Cập nhật URL của bạn
const char* api_base_url = "http://localhost:3000"; // Hoặc URL Vercel của bạn
const char* check_password_endpoint = "/api/check-password";
const char* check_uid_endpoint = "/api/check-uid";
const char* log_access_endpoint = "/api/log-access";

// NTP Server
const char* ntpServer = "pool.ntp.org";
const long gmtOffset_sec = 25200; // GMT+7 (Vietnam) = 7*3600
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

// RFID setup
#define SS_PIN 5
#define RST_PIN 2
MFRC522 mfrc522(SS_PIN, RST_PIN);
byte validUID[4] = {0x67, 0xA2, 0x14, 0x05};

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
  
  // Cấu hình NTP
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("WiFi Connected!");
  delay(2000);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Nhap mat khau:");
}

unsigned long getCurrentTimestamp() {
  time_t now;
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    Serial.println("Failed to obtain time");
    return millis() / 1000; // Fallback to millis
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
  http.setTimeout(10000); // 10 second timeout
  
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

bool checkUIDAPI(byte* uid) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected");
    return false;
  }
  
  HTTPClient http;
  http.begin(String(api_base_url) + check_uid_endpoint);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);
  
  DynamicJsonDocument doc(1024);
  String uidString = "";
  for (int i = 0; i < 4; i++) {
    if (uid[i] < 0x10) uidString += "0";
    uidString += String(uid[i], HEX);
  }
  doc["uid"] = uidString;
  
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
  doc["timestamp"] = getCurrentTimestamp(); // Sử dụng hàm mới
  
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
  lcd.print("Nhap mat khau:");
}

bool checkUID(byte *uid) {
  for (int i = 0; i < 4; i++) {
    if (uid[i] != validUID[i]) return false;
  }
  return true;
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
  lcd.print("Nhap mat khau:");
}

void loop() {
  char key = keypad.getKey();
  if (key) {
    Serial.println("Key pressed: " + String(key));
    
    if (key == '#') {
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
        lcd.print("Nhap mat khau:");
      }
      input_pass = "";
    } else if (key == '*') {
      input_pass = "";
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Nhap mat khau:");
      Serial.println("Password cleared");
    } else {
      if (input_pass.length() < 4) {
        input_pass += key;
        lcd.setCursor(0, 1);
        lcd.print(input_pass);
      }
    }
  }

  if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
    bool isValidUID = false;
    
    // Tạo UID string để debug
    String uidString = "";
    for (int i = 0; i < 4; i++) {
      if (mfrc522.uid.uidByte[i] < 0x10) uidString += "0";
      uidString += String(mfrc522.uid.uidByte[i], HEX);
    }
    
    Serial.println("Card detected: " + uidString);
    
    // Kiểm tra UID local trước
    if (checkUID(mfrc522.uid.uidByte)) {
      Serial.println("Local UID match");
      isValidUID = true;
    } else {
      // Kiểm tra UID qua API
      Serial.println("Checking UID via API...");
      isValidUID = checkUIDAPI(mfrc522.uid.uidByte);
    }
    
    if (isValidUID) {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("The hop le!");
      Serial.println("Card valid!");
      logAccess("rfid", uidString, true);
      openLock();
    } else {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("The sai");
      Serial.println("Card invalid!");
      logAccess("rfid", uidString, false);
      delay(2000);
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Nhap mat khau:");
    }

    mfrc522.PICC_HaltA();
    mfrc522.PCD_StopCrypto1();
  }
}
