#!/usr/bin/env python3
"""
ESP32 Battery Capacity Access Script

This script demonstrates how an ESP32 can access the simplified backup battery capacity table
to get the rated capacity for each port.

The simplified backup table structure:
/batteryCapacityBackup/
  /port_1/
    - ratedCapacity: 2.2  // Current battery capacity in Ah (LiPo/Li-ion)
  /port_2/
    - ratedCapacity: 1.8  // Current battery capacity in Ah (LiPo/Li-ion)
  /port_3/
    - ratedCapacity: 7.0  // Current battery capacity in Ah (LiPo/Li-ion)
  /port_4/
    - ratedCapacity: 50.0 // Current battery capacity in Ah (Lead Acid)
"""

import os
import time
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, db

# Load environment variables
load_dotenv()

# Firebase configuration
SERVICE_ACCOUNT_KEY_PATH = 'serviceAccountKey.json'
DATABASE_URL = os.getenv('NEXT_PUBLIC_FIREBASE_DATABASE_URL')

def initialize_firebase():
    """Initialize Firebase Admin SDK"""
    try:
        cred = credentials.Certificate(SERVICE_ACCOUNT_KEY_PATH)
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred, {
                'databaseURL': DATABASE_URL
            })
        print("✅ Firebase initialized successfully")
        return True
    except Exception as e:
        print(f"❌ Firebase initialization failed: {e}")
        return False

def get_battery_capacity(port_id):
    """
    Get the battery capacity for a specific port
    
    Args:
        port_id (str): Port ID (e.g., 'port_1', 'port_2')
    
    Returns:
        float: Battery capacity in Ah or None if not found
    """
    try:
        backup_ref = db.reference(f'batteryCapacityBackup/{port_id}')
        snapshot = backup_ref.get()
        
        if snapshot and 'ratedCapacity' in snapshot:
            capacity = snapshot['ratedCapacity']
            print(f"✅ Found battery capacity for {port_id}: {capacity} Ah")
            return capacity
        else:
            print(f"⚠️ No battery capacity found for {port_id}")
            return None
            
    except Exception as e:
        print(f"❌ Error getting battery capacity: {e}")
        return None

def get_all_port_capacities():
    """Get battery capacity data for all ports"""
    try:
        backup_ref = db.reference('batteryCapacityBackup')
        snapshot = backup_ref.get()
        
        if not snapshot:
            print("⚠️ No backup capacity data found")
            return {}
        
        print("\n📋 Current Battery Capacity Status:")
        print("-" * 40)
        
        all_capacities = {}
        for port_id, port_data in snapshot.items():
            if isinstance(port_data, dict) and 'ratedCapacity' in port_data:
                capacity = port_data['ratedCapacity']
                all_capacities[port_id] = capacity
                
                if capacity > 0:
                    print(f"🟢 {port_id}: {capacity} Ah")
                else:
                    print(f"⚫ {port_id}: No battery connected")
            else:
                print(f"⚠️ {port_id}: Invalid data format")
        
        return all_capacities
        
    except Exception as e:
        print(f"❌ Error getting all port capacities: {e}")
        return {}

def simulate_esp32_access():
    """Simulate how an ESP32 would access battery capacity data"""
    print("\n🤖 ESP32 Access Simulation")
    print("=" * 50)
    
    # Simulate ESP32 checking its assigned port
    esp32_port = "port_1"  # ESP32 would know its assigned port
    
    print(f"ESP32 checking battery capacity for {esp32_port}...")
    
    capacity = get_battery_capacity(esp32_port)
    
    if capacity and capacity > 0:
        print(f"\n🔋 ESP32 can now use this data:")
        print(f"   - Rated Capacity: {capacity} Ah")
        print(f"   - Port ID: {esp32_port}")
        
        # Simulate ESP32 calculations
        print(f"\n📊 ESP32 Calculations:")
        print(f"   - Max discharge time estimate: {capacity * 3600 / 1000:.1f} seconds at 1A")
        print(f"   - Energy capacity: {capacity * 3.7:.2f} Wh (assuming 3.7V nominal)")
    else:
        print("❌ ESP32 cannot find battery capacity data")

def main():
    """Main function"""
    print("🔋 ESP32 Battery Capacity Access Demo")
    print("=" * 50)
    
    # Initialize Firebase
    if not initialize_firebase():
        return
    
    # Get all port capacities
    all_capacities = get_all_port_capacities()
    
    # Simulate ESP32 access
    simulate_esp32_access()
    
    print("\n💡 Usage Notes:")
    print("- ESP32 can access /batteryCapacityBackup/{port_id}/ratedCapacity")
    print("- Each port has exactly one capacity value")
    print("- Capacity updates automatically when user changes it in web UI")
    print("- ESP32 can use this for discharge calculations and cutoff detection")
    print("\n📊 Port Assignments:")
    print("   Port 1-3: LiPo/Li-ion batteries (0.5 - 20 Ah typical)")
    print("   Port 4: Lead Acid batteries (1.0 - 200 Ah typical)")
    print("\n📊 Current Capacities:")
    for port_id, capacity in all_capacities.items():
        battery_type = "Lead Acid" if port_id == "port_4" else "LiPo/Li-ion"
        print(f"   {port_id}: {capacity} Ah ({battery_type})")

if __name__ == '__main__':
    main()
