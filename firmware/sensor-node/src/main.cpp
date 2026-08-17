// Sentry Sonar — sensor node: LD2410C OUT-pin wiring test.
//
// Purpose: confirm the radar is wired correctly BEFORE adding WiFi / POST /events.
// It does nothing but read the radar's OUT pin and print presence to serial.
//
// Wiring (3 jumpers, no soldering, no level shifter):
//   LD2410C VCC  -> ESP32-S3 5V   (USB-fed rail, NOT 3V3)
//   LD2410C GND  -> ESP32-S3 GND
//   LD2410C OUT  -> ESP32-S3 GPIO4
//
// Flash + monitor over the board's UART (CH340) USB-C port at 115200 baud.
// Expected: "PRESENCE" when you move in front of the sensor, "clear" a few
// seconds after you leave (default LD2410C unoccupied delay ~5s).

#include <Arduino.h>

constexpr uint8_t RADAR_OUT_PIN = 4;   // LD2410C OUT -> GPIO4
constexpr uint32_t STATUS_MS = 2000;   // heartbeat print interval

static bool lastOccupied = false;
static uint32_t lastStatus = 0;

void setup() {
  Serial.begin(115200);
  delay(300);                 // let USB-CDC/serial settle
  pinMode(RADAR_OUT_PIN, INPUT);

  Serial.println();
  Serial.println("=== Sentry Sonar :: LD2410C OUT-pin test ===");
  Serial.printf("Reading radar OUT on GPIO%u\n", RADAR_OUT_PIN);
  Serial.println("Wave a hand in front of the sensor; watch the state flip.");
  Serial.println("(Sensor needs ~2s to warm up after power-up.)");
}

void loop() {
  bool occupied = digitalRead(RADAR_OUT_PIN) == HIGH;

  // Print immediately on any change (edge) ...
  if (occupied != lastOccupied) {
    Serial.printf("[change] %s\n", occupied ? "PRESENCE" : "clear");
    lastOccupied = occupied;
  }

  // ... and a periodic heartbeat so you can see it's alive when idle.
  uint32_t now = millis();
  if (now - lastStatus >= STATUS_MS) {
    lastStatus = now;
    Serial.printf("[status] occupied=%d\n", occupied ? 1 : 0);
  }

  delay(50);   // 20 Hz poll — plenty for a room presence signal
}
