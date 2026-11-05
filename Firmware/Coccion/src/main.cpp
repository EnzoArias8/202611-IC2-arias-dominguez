#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <max6675.h>

const char* ssid = "Personal-CARINA -2.4Ghz";
const char* password = "22715891CG"; 
IPAddress mqtt_server(192, 168, 0, 84);

WiFiClient espClient;
PubSubClient client(espClient);

// Sensores
#define GAS_PIN 32
MAX6675 thermocouple(18, 5, 19); // CLK, CS, DO

const int GAS_SAMPLES = 10;
const int GAS_NOISE_FLOOR = 10;

unsigned long lastMsg = 0;

int readGasAverage() {
  long total = 0;

  for (int i = 0; i < GAS_SAMPLES; i++) {
    total += analogRead(GAS_PIN);
    delay(20);
  }

  int promedio = total / GAS_SAMPLES;

  // Filtro simple para evitar ruido del sensor MQ en estado de reposo.
  if (promedio < GAS_NOISE_FLOOR) {
    promedio = 0;
  }

  return promedio;
}

void setup() {
  Serial.begin(115200);
  Serial.println("Iniciando nodo de coccion...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    Serial.println("Esperando conexion WiFi...");
    delay(2000);
  }
  Serial.print("WiFi conectado. IP: ");
  Serial.println(WiFi.localIP());
  
  client.setServer(mqtt_server, 1883);
  delay(500); // Estabilizar el chip MAX6675
}

void reconnect() {
  while (!client.connected()) {
    String clientId = "NodoCoccion-" + String(random(0xffff), HEX);
    if (!client.connect(clientId.c_str())) {
      Serial.printf("Error MQTT (estado %d); reintentando...\n", client.state());
      delay(5000);
    } else {
      Serial.println("MQTT conectado.");
    }
  }
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  unsigned long now = millis();
  if (now - lastMsg > 5000) {
    lastMsg = now;

    int valorGasRaw = readGasAverage();
    int valorGas = constrain((valorGasRaw * 100) / 4095, 0, 100);
    float tempIndustrial = thermocouple.readCelsius();

    Serial.printf("Coccion -> Gas: %d%%\n", valorGas);
    client.publish("proyecto/gas", String(valorGas).c_str());

    if (isnan(tempIndustrial) || tempIndustrial <= 0.0f) {
      Serial.printf("Coccion -> Lectura MAX6675 invalida (%.2f C). Revisar termopar y conexiones CLK=18, CS=5, DO=19\n", tempIndustrial);
    } else {
      Serial.printf("Coccion -> Horno: %.2f°C\n", tempIndustrial);
      bool publicado = client.publish("proyecto/temperatura_industrial", String(tempIndustrial, 2).c_str());
      Serial.printf("MQTT temperatura: %s (conectado: %s)\n",
                    publicado ? "publicada" : "fallo",
                    client.connected() ? "si" : "no");
    }
  }
}