#!/usr/bin/env python3
"""
Send sample discharging data for testing.
"""

import os
import time
import random
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, db

def main():
    """
    Sends sample discharging data for port_3 to the Firebase Realtime Database.
    """
    # --- Configuration ---
    # Load environment variables from .env file
    load_dotenv()

    # Path to your Firebase service account key file
    # Ensure this file is in your project root and named serviceAccountKey.json
    SERVICE_ACCOUNT_KEY_PATH = 'serviceAccountKey.json'
    DATABASE_URL = os.getenv('NEXT_PUBLIC_FIREBASE_DATABASE_URL')

    if not os.path.exists(SERVICE_ACCOUNT_KEY_PATH):
        print(f"Error: Service account key file not found at '{SERVICE_ACCOUNT_KEY_PATH}'")
        print("Please download it from your Firebase project settings and place it in the project root.")
        return
        
    if not DATABASE_URL:
        print("Error: NEXT_PUBLIC_FIREBASE_DATABASE_URL is not set in your .env file.")
        return

    # --- Firebase Initialization ---
    try:
        cred = credentials.Certificate(SERVICE_ACCOUNT_KEY_PATH)
        # Check if the app is already initialized to prevent errors on re-runs
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred, {
                'databaseURL': DATABASE_URL
            })
        print("Successfully initialized Firebase Admin SDK.")
    except Exception as e:
        print(f"Error initializing Firebase Admin SDK: {e}")
        return

    # --- Data Simulation ---
    port_id = "port_3"
    port_ref = db.reference(f'ports/{port_id}')
    print(f"Targeting port: {port_id}")

    # 1. Create a new discharging session
    start_timestamp = int(time.time() * 1000)
    session_id = f"discharge_session_{start_timestamp}"
    session_ref = port_ref.child('sessions').child(session_id)

    session_data = {
        'startTime': start_timestamp,
        'endTime': None,
        'status': 'discharging',
        'batteryType': 'LiPo',
        'currentVoltage': 0.0,
        'currentCurrent': 0.0,
        'logs': {}
    }
    session_ref.set(session_data)
    print(f"Created new discharging session: {session_id}")

    # 2. Set this new session as the current session for the port
    port_ref.update({
        'name': 'Port 3',
        'currentSessionId': session_id
    })
    print(f"Set '{session_id}' as the current session for {port_id}.")

    # 3. Send log entries to simulate discharging
    print(f"Simulating live discharging data for '{port_id}'. Press Ctrl+C to stop.")
    try:
        while True:
            # During discharge, voltage decreases and current is negative
            voltage = round(random.uniform(3.2, 4.1), 2)
            current = round(random.uniform(-2.0, -0.5), 2)  # Negative for discharging
            log_timestamp = int(time.time() * 1000)
            
            # Update the 'live' stats in the session
            session_ref.update({
                'currentVoltage': voltage,
                'currentCurrent': current
            })

            # Add a new log entry
            log_entry = {
                'voltage': voltage,
                'current': current,
                'cycle': 'discharging'
            }
            session_ref.child('logs').child(str(log_timestamp)).set(log_entry)
            
            print(f"[{time.strftime('%H:%M:%S')}] Sent -> V: {voltage}V | A: {current}A (discharging)")
            time.sleep(5)
            
    except KeyboardInterrupt:
        # 4. Mark the session as completed on exit
        end_time = int(time.time() * 1000)
        session_ref.update({
            'status': 'completed',
            'endTime': end_time
        })
        # Clear the current session for the port
        port_ref.update({'currentSessionId': None})
        print(f"\nDischarging simulation complete. Session '{session_id}' marked as 'completed'.")


if __name__ == '__main__':
    main()