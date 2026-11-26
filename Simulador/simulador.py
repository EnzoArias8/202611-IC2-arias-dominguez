import argparse
import os
import random
import time
import paho.mqtt.client as mqtt

MQTT_BROKER = os.getenv("MQTT_BROKER", "127.0.0.1")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
INTERVALO_SEGUNDOS = 5


def crear_cliente() -> mqtt.Client:
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"SimuladorCocina-{random.randint(1000, 9999)}",
    )
    return client


def publicar_clima(client: mqtt.Client, simular_error: bool) -> None:
    if simular_error and random.random() < 0.15:
        print("[Clima] Simulando lectura NaN del DHT22 -> publicación omitida")
        return

    temp_ambiente = round(random.uniform(20.0, 32.0), 2)
    humedad = round(random.uniform(40.0, 75.0), 2)

    client.publish("proyecto/temperatura", f"{temp_ambiente:.2f}")
    client.publish("proyecto/humedad", f"{humedad:.2f}")
    print(f"[Clima] Temp: {temp_ambiente:.2f}°C | Hum: {humedad:.2f}%")


def publicar_coccion(client: mqtt.Client, simular_error: bool) -> None:
    # Piso de ruido como en el ESP32: la mayoría del tiempo en 0 o bajo, con picos ocasionales
    valor_gas = random.randint(25, 85) if (simular_error and random.random() < 0.2) else random.choice([0, 0, 0, random.randint(1, 15)])
    client.publish("proyecto/gas", str(valor_gas))

    if simular_error and random.random() < 0.15:
        print(f"[Coccion] Gas: {valor_gas}% | MAX6675 invalida (NaN/<=0) -> temp omitida")
        return

    temp_industrial = round(random.uniform(150.0, 260.0), 2)
    client.publish("proyecto/temperatura_industrial", f"{temp_industrial:.2f}")
    print(f"[Coccion] Gas: {valor_gas}% | Horno: {temp_industrial:.2f}°C")


def publicar_frio(client: mqtt.Client, simular_error: bool) -> None:
    if simular_error and random.random() < 0.15:
        # DS18B20 desconectado devuelve exactamente -127.00 en DallasTemperature
        temp_sumergible = -127.00
    else:
        temp_sumergible = round(random.uniform(-2.0, 6.0), 2)

    puerta = "Abierta" if random.random() < 0.2 else "Cerrada"

    client.publish("proyecto/temperatura_sumergible", f"{temp_sumergible:.2f}")
    client.publish("proyecto/puerta", puerta)
    print(f"[Frio] Temp: {temp_sumergible:.2f}°C | Puerta: {puerta}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Simulador MQTT de los 3 nodos ESP32 (IC2)")
    parser.add_argument("--broker", default=MQTT_BROKER, help="IP o host del broker MQTT")
    parser.add_argument("--port", type=int, default=MQTT_PORT, help="Puerto TCP del broker MQTT")
    parser.add_argument(
        "--con-errores",
        action="store_true",
        help="Simula fallas aleatorias de sensores (NaN, DS18B20 -127°C, picos de gas)",
    )
    args = parser.parse_args()

    client = crear_cliente()
    print(f"Conectando al broker MQTT en {args.broker}:{args.port}...")
    client.connect(args.broker, args.port, keepalive=60)
    client.loop_start()

    try:
        while True:
            publicar_clima(client, args.con_errores)
            publicar_coccion(client, args.con_errores)
            publicar_frio(client, args.con_errores)
            print("-" * 50)
            time.sleep(INTERVALO_SEGUNDOS)
    except KeyboardInterrupt:
        print("\nSimulador detenido por el usuario.")
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()