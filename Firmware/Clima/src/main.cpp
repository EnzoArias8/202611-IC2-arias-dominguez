#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>

const char* ssid = "Personal-CARINA -2.4Ghz";
const char* password = "22715891CG"; 
IPAddress mqtt_server(192, 168, 0, 84);

WiFiClient espClient;
PubSubClient client(espClient);

// Sensores
#define DHTPIN 4
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

unsigned long lastMsg = 0;

void setup() {
  Serial.begin(115200);
  dht.begin();

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  client.setServer(mqtt_server, 1883);
}

void reconnect() {
  while (!client.connected()) {
    String clientId = "NodoClima-" + String(random(0xffff), HEX);
    if (!client.connect(clientId.c_str())) delay(5000);
  }
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  unsigned long now = millis();
  if (now - lastMsg > 5000) {
    lastMsg = now;

    float humedad = dht.readHumidity();
    float tempAmbiente = dht.readTemperature();

    if (!isnan(humedad) && !isnan(tempAmbiente)) {
      Serial.printf("Ambiente -> Temp: %.2f°C | Hum: %.2f%%\n", tempAmbiente, humedad);

      client.publish("proyecto/temperatura", String(tempAmbiente).c_str());
      client.publish("proyecto/humedad", String(humedad).c_str());
    }
  }
}