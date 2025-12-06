#include <WiFi.h>
#include <PubSubClient.h>

const char* ssid = "Wokwi-GUEST";
const char* password = "";
const char* mqtt_server = "broker.emqx.io";
const int ledPin = 2;

// Унікальний ID для ваших воріт (змініть на свій!)
const String GATE_ID = "roman_zvir_2024";

WiFiClient espClient;
PubSubClient client(espClient);
unsigned long lastReconnectAttempt = 0;

void setup_wifi() {
  WiFi.begin(ssid, password);
  Serial.print("WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" OK!");
}

void callback(char* topic, byte* payload, unsigned int length) {
  Serial.print(">>> [");
  Serial.print(topic);
  Serial.print("]: ");
  
  String msg = "";
  for (int i = 0; i < length; i++) {
    Serial.print((char)payload[i]);
    msg += (char)payload[i];
  }
  Serial.println();

  String controlTopic = "gate/" + GATE_ID + "/control";
  if (String(topic) == controlTopic) {
    if (msg == "open") {
      Serial.println("🚪 ВІДКРИВАЮ ВОРОТА!");
      
      // Повідомляємо що починаємо відкривати
      String statusTopic = "gate/" + GATE_ID + "/status";
      client.publish(statusTopic.c_str(), "opening");
      Serial.println("📤 Статус: opening");
      
      // Симулюємо процес відкриття (3 секунди)
      for (int i = 0; i < 6; i++) {
        digitalWrite(ledPin, !digitalRead(ledPin)); // Блимання
        delay(500);
      }
      digitalWrite(ledPin, HIGH); // Залишаємо світитися (відкрито)
      
      // Повідомляємо що відкрито
      client.publish(statusTopic.c_str(), "opened");
      Serial.println("✅ ВОРОТА ВІДКРИТІ!");
      Serial.println("📤 Статус: opened");
      
    } else if (msg == "close") {
      Serial.println("🚪 ЗАЧИНЯЮ ВОРОТА!");
      
      // Повідомляємо що починаємо закривати
      String statusTopic = "gate/" + GATE_ID + "/status";
      client.publish(statusTopic.c_str(), "closing");
      Serial.println("📤 Статус: closing");
      
      // Симулюємо процес закриття (3 секунди)
      for (int i = 0; i < 6; i++) {
        digitalWrite(ledPin, !digitalRead(ledPin)); // Блимання
        delay(500);
      }
      digitalWrite(ledPin, LOW); // Вимикаємо (закрито)
      
      // Повідомляємо що закрито
      client.publish(statusTopic.c_str(), "closed");
      Serial.println("✅ ВОРОТА ЗАЧИНЕНІ!");
      Serial.println("📤 Статус: closed");
    }
  }
}

boolean reconnect() {
  String clientId = "ESP32-";
  clientId += String(random(0xffff), HEX);
  
  Serial.print("MQTT connect as: ");
  Serial.println(clientId);
  
  if (client.connect(clientId.c_str())) {
    Serial.println("✓ MQTT підключено!");
    
    // Підписуємось на топік
    String controlTopic = "gate/" + GATE_ID + "/control";
    bool subscribed = client.subscribe(controlTopic.c_str());
    if (subscribed) {
      Serial.print("✓ Підписано на ");
      Serial.println(controlTopic);
    } else {
      Serial.println("✗ Помилка підписки");
    }
    
    // Публікуємо статус
    String statusTopic = "gate/" + GATE_ID + "/status";
    bool published = client.publish(statusTopic.c_str(), "online");
    if (published) {
      Serial.println("✓ Опубліковано статус online");
    }
    
    return true;
  }
  
  Serial.print("✗ Помилка підключення, rc=");
  Serial.println(client.state());
  return false;
}

void setup() {
  Serial.begin(115200);
  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, LOW);
  
  Serial.println("\n=== ESP32 GATE ===");
  setup_wifi();
  
  client.setServer(mqtt_server, 1883);
  client.setCallback(callback);
  client.setKeepAlive(60);
}

void loop() {
  if (!client.connected()) {
    unsigned long now = millis();
    if (now - lastReconnectAttempt > 5000) {
      lastReconnectAttempt = now;
      Serial.print("Reconnect...");
      if (reconnect()) {
        lastReconnectAttempt = 0;
      }
    }
  } else {
    client.loop();
  }
}