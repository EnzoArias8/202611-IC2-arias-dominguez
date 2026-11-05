#if defined(ARDUINO)
#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>

const char* ssid = "Personal-CARINA -2.4Ghz";
const char* password = "22715891CG"; 
IPAddress mqtt_server(192, 168, 0, 84);

WiFiClient espClient;
PubSubClient client(espClient);

// Sensores
#define ONE_WIRE_BUS 27
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

#define PUERTA_PIN 14

unsigned long lastMsg = 0;

void setup() {
  Serial.begin(115200);
  sensors.begin();
  pinMode(PUERTA_PIN, INPUT_PULLUP);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  
  client.setServer(mqtt_server, 1883);
}

void reconnect() {
  while (!client.connected()) {
    String clientId = "NodoCamara-" + String(random(0xffff), HEX);
    if (!client.connect(clientId.c_str())) delay(5000);
  }
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  unsigned long now = millis();
  if (now - lastMsg > 5000) {
    lastMsg = now;
    
    sensors.requestTemperatures();
    float tempSumergible = sensors.getTempCByIndex(0);
    
    int estadoPuerta = digitalRead(PUERTA_PIN);
    String mensajePuerta = (estadoPuerta == LOW) ? "Cerrada" : "Abierta";

    Serial.printf("Camara -> Temp: %.2f°C | Puerta: %s\n", tempSumergible, mensajePuerta.c_str());
    
    client.publish("proyecto/temperatura_sumergible", String(tempSumergible).c_str());
    client.publish("proyecto/puerta", mensajePuerta.c_str());
  }
}
#endif