#include <Keypad.h>
#include <LiquidCrystal_I2C.h>
#include <ESP32Servo.h>
#include <SPI.h>
#include <MFRC522.h>


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
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Nhap mat khau:");


  myServo.attach(SERVO_PIN);
  myServo.write(0);


  SPI.begin();
  mfrc522.PCD_Init();
}


void loop() {
  char key = keypad.getKey();
  if (key) {
    if (key == '#') {
      if (input_pass == password) {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Dung mat khau!");
        openLock();
      } else {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Sai mat khau!");
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
    } else {
      if (input_pass.length() < 4) {
        input_pass += key;
        lcd.setCursor(0, 1);
        lcd.print(input_pass);
      }
    }
  }


  if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
    if (checkUID(mfrc522.uid.uidByte)) {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("The hop le!");
      openLock();
    } else {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("The sai");
      delay(2000);
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Nhap mat khau:");
    }


    mfrc522.PICC_HaltA();
    mfrc522.PCD_StopCrypto1();
  }
}
