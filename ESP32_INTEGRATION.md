# Integrating an ESP32 with the ChargeTrack Application

This guide will walk you through setting up an ESP32 to send charging data to your Firebase Realtime Database using your PC as a bridge.

In this setup, the ESP32 sends data over its USB serial connection to a Python script on your computer, and that script sends the data to Firebase. This is great for development and testing as it simplifies the ESP32 code significantly.

### 1. Prerequisites

-   An ESP32 development board.
-   [Arduino IDE](https://www.arduino.cc/en/software) installed.
-   [ESP32 board support](https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html) installed in the Arduino IDE.
-   Python 3 installed on your PC.
-   The `pyserial`, `firebase-admin`, and `python-dotenv` Python libraries installed:
    ```bash
    pip install pyserial firebase-admin python-dotenv
    ```
-   Your `serviceAccountKey.json` file in the project root.

### 2. Simplified ESP32 Code (Serial Output)

Upload the following simplified code to your ESP32. It generates data and prints it as JSON to the serial port. It does not require any WiFi or Firebase libraries.

```cpp
#include <Arduino.h>
#include <ArduinoJson.h>

// Port ID on the ESP32
const char* portId = "port_3"; // Example: Corresponds to "Port 3" in the app

// We will use this to keep track of the session on the ESP32 side
String currentSessionId = "";
unsigned long startTimestamp = 0;

void setup() {
  Serial.begin(115200);
  
  // Create a new session ID and timestamp
  startTimestamp = millis();
  currentSessionId = "session_" + String(startTimestamp);

  // Send a startup message to the Python script to begin the session
  StaticJsonDocument<256> doc;
  doc["type"] = "start";
  doc["portId"] = portId;
  doc["sessionId"] = currentSessionId;
  doc["startTime"] = startTimestamp;
  doc["batteryType"] = "LiPo";
  
  serializeJson(doc, Serial);
  Serial.println(); // Send a newline to indicate end of message
}

void loop() {
  // Generate some random data for voltage and current
  float voltage = 3.7 + (random(0, 50) / 100.0); // 3.70V - 4.20V
  float current = 1.0 + (random(0, 50) / 100.0); // 1.00A - 1.50A

  // Create a JSON object for the log entry
  StaticJsonDocument<256> doc;
  doc["type"] = "log";
  doc["portId"] = portId;
  doc["sessionId"] = currentSessionId;
  doc["timestamp"] = startTimestamp + (millis() - startTimestamp);
  doc["voltage"] = voltage;
  doc["current"] = current;

  // Send the JSON data over serial
  serializeJson(doc, Serial);
  Serial.println(); // Send a newline

  delay(5000); // Wait 5 seconds
}
```

### 3. Python Bridge Script

Save the following code as `serial_to_firebase.py` in your project root. Before running, find your ESP32's COM port (e.g., `COM3` on Windows, `/dev/ttyUSB0` on Linux/macOS) and update the `ESP32_SERIAL_PORT` variable.

```python
import os
import serial
import json
import time
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, db

# --- Configuration ---
ESP32_SERIAL_PORT = 'COM3'  # <--- IMPORTANT: SET YOUR ESP32's
SERIAL_BAUD_RATE = 115200
SERVICE_ACCOUNT_KEY_PATH = 'serviceAccountKey.json'

def main():
    """
    Listens for serial data from an ESP32 and sends it to Firebase.
    """
    print("Starting Serial to Firebase Bridge...")

    # --- Firebase Initialization ---
    load_dotenv()
    database_url = os.getenv('NEXT_PUBLIC_FIREBASE_DATABASE_URL')
    if not database_url:
        print("Error: NEXT_PUBLIC_FIREBASE_DATABASE_URL not found in .env file.")
        return

    try:
        cred = credentials.Certificate(SERVICE_ACCOUNT_KEY_PATH)
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred, {'databaseURL': database_url})
        print(f"Successfully initialized Firebase for database: {database_url}")
    except Exception as e:
        print(f"Error initializing Firebase Admin SDK: {e}")
        return

    # --- Serial Port Initialization ---
    try:
        ser = serial.Serial(ESP32_SERIAL_PORT, SERIAL_BAUD_RATE, timeout=1)
        print(f"Listening on serial port {ESP32_SERIAL_PORT}...")
    except serial.SerialException as e:
        print(f"Error: Could not open serial port {ESP32_SERIAL_PORT}. {e}")
        print("Please make sure your ESP32 is connected and you've selected the correct port.")
        return

    # --- Main Loop ---
    try:
        while True:
            if ser.in_waiting > 0:
                line = ser.readline().decode('utf-8').rstrip()
                try:
                    data = json.loads(line)
                    print(f"Received data: {data}")

                    port_id = data.get('portId')
                    session_id = data.get('sessionId')

                    if not port_id or not session_id:
                        continue

                    port_ref = db.reference(f'ports/{port_id}')
                    session_ref = port_ref.child(f'sessions/{session_id}')

                    if data.get('type') == 'start':
                        session_data = {
                            'startTime': data.get('startTime'),
                            'endTime': None,
                            'status': 'charging',
                            'batteryType': data.get('batteryType'),
                            'currentVoltage': 0.0,
                            'currentCurrent': 0.0,
                            'logs': {}
                        }
                        session_ref.set(session_data)
                        port_ref.update({'name': port_id.replace("_", " ").title(), 'currentSessionId': session_id})
                        print(f"Created new session: {session_id}")

                    elif data.get('type') == 'log':
                        voltage = data.get('voltage', 0.0)
                        current = data.get('current', 0.0)
                        log_timestamp = data.get('timestamp')

                        # Add a new log entry
                        log_entry = {'voltage': voltage, 'current': current, 'cycle': 'charging'}
                        session_ref.child(f'logs/{log_timestamp}').set(log_entry)
                        
                        # Update the 'live' stats in the session
                        session_ref.update({'currentVoltage': voltage, 'currentCurrent': current})
                        print(f"  > Logged V={voltage:.2f}V, A={current:.2f}A")

                except json.JSONDecodeError:
                    print(f"Received non-JSON line: {line}")
                except Exception as e:
                    print(f"An error occurred: {e}")
            
            time.sleep(0.1)

    except KeyboardInterrupt:
        print("\nStopping bridge script.")
    finally:
        ser.close()
        print("Serial port closed.")

if __name__ == '__main__':
    main()
```

### 4. How to Run

1.  Upload the simplified Arduino sketch to your ESP32.
2.  Open the Arduino Serial Monitor to ensure the ESP32 is printing JSON data.
3.  Close the Arduino Serial Monitor (this is important, as only one program can use the serial port at a time).
4.  Run the Python script from your terminal: `python serial_to_firebase.py`
5.  Open your ChargeTrack web application. You should see "Port 3" become active and data streaming in.
