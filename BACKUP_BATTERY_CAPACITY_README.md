# Backup Battery Capacity System

## Overview

The Backup Battery Capacity System provides a dedicated table in Firebase Realtime Database that stores the current battery capacity for each of the 4 ports. This system serves as a backup and provides easy access for ESP32 devices to retrieve battery capacity data.

## Key Features

### 🔒 Capacity Input Restriction
- **Battery capacity can ONLY be set during discharging sessions**
- Prevents capacity input during charging or resting sessions
- Ensures data integrity and proper session management

### 🔄 Real-time Backup Updates
- Automatically updates backup table when capacity is set
- Maintains sync between main session data and backup table
- Updates when sessions are completed or ended

### 📱 ESP32 Easy Access
- Simple Firebase path: `/batteryCapacityBackup/{port_id}/ratedCapacity`
- Each port has exactly one capacity value
- Optimized for embedded device access

## Port Assignments

### Battery Type by Port
- **Port 1**: LiPo/Li-ion batteries (0.5 - 20 Ah typical)
- **Port 2**: LiPo/Li-ion batteries (0.5 - 20 Ah typical)  
- **Port 3**: LiPo/Li-ion batteries (0.5 - 20 Ah typical)
- **Port 4**: Lead Acid batteries (1.0 - 200 Ah typical)

### Database Structure

### Simplified Backup Table Path
```
/batteryCapacityBackup/
  /port_1/
    - ratedCapacity: 2.2  // Current battery capacity in Ah (LiPo/Li-ion)
  /port_2/
    - ratedCapacity: 1.8  // Current battery capacity in Ah (LiPo/Li-ion)
  /port_3/
    - ratedCapacity: 7.0  // Current battery capacity in Ah (LiPo/Li-ion)
  /port_4/
    - ratedCapacity: 50.0 // Current battery capacity in Ah (Lead Acid)
```

### Data Fields
- **port_1, port_2, port_3**: Port identifiers for LiPo/Li-ion batteries
- **port_4**: Port identifier specifically for Lead Acid batteries
- **ratedCapacity**: Current battery capacity in Ampere-hours (Ah)

## Usage

### Web Application

#### Setting Capacity During Discharge
1. Start a discharging session
2. Click "Edit" button next to Rated Capacity
3. Enter capacity in Ah or mAh (e.g., "2200 mAh" or "2.2 Ah")
4. Click "Save" to update both session and backup table

#### Setting Capacity for Completed Sessions
1. Open Session History modal
2. Find the discharging session
3. Click "Edit" button next to Rated Capacity
4. Enter the capacity and save
5. Updates both session data and backup table

### ESP32 Access

#### Python Example
```python
import firebase_admin
from firebase_admin import credentials, db

# Initialize Firebase
cred = credentials.Certificate('serviceAccountKey.json')
firebase_admin.initialize_app(cred, {'databaseURL': 'your_database_url'})

# Get battery capacity for a port
def get_battery_capacity(port_id):
    backup_ref = db.reference(f'batteryCapacityBackup/{port_id}')
    snapshot = backup_ref.get()
    
    if snapshot and 'ratedCapacity' in snapshot:
        return snapshot['ratedCapacity']
    return None

# Usage
capacity = get_battery_capacity('port_1')
if capacity:
    print(f"Port 1 Capacity: {capacity} Ah")
```

#### Arduino/ESP32 Example
```cpp
#include <ArduinoJson.h>
#include <HTTPClient.h>

// Function to get battery capacity from Firebase
bool getBatteryCapacity(const char* portId, float* capacity) {
    HTTPClient http;
    String url = "https://your-project.firebaseio.com/batteryCapacityBackup/";
    url += portId;
    url += "/ratedCapacity.json";
    
    http.begin(url);
    int httpCode = http.GET();
    
    if (httpCode == HTTP_CODE_OK) {
        String payload = http.getString();
        DynamicJsonDocument doc(1024);
        deserializeJson(doc, payload);
        
        if (doc.is<float>()) {
            *capacity = doc.as<float>();
            http.end();
            return true;
        }
    }
    
    http.end();
    return false;
}

// Usage in setup or loop
void setup() {
    float capacity;
    
    if (getBatteryCapacity("port_1", &capacity)) {
        Serial.printf("Port 1 Capacity: %.2f Ah\n", capacity);
    }
}
```

## Supported Battery Types

### LiPo/Li-ion
- **Cutoff Voltage**: 3.0V per cell
- **Typical Capacity Range**: 0.5 - 20 Ah
- **Common Applications**: RC vehicles, drones, portable electronics

### Lead Acid
- **Cutoff Voltage**: 10.5V per 12V cell
- **Typical Capacity Range**: 1.0 - 200 Ah
- **Common Applications**: Automotive, UPS, solar storage

### NiMH/NiCd
- **Cutoff Voltage**: 0.9V per cell
- **Typical Capacity Range**: 0.1 - 10 Ah
- **Common Applications**: Rechargeable batteries, power tools

## Implementation Details

### Utility Functions
- `updateBackupBatteryCapacity(portId, ratedCapacity)`: Updates backup table for a port
- `removeBackupBatteryCapacity(portId)`: Removes capacity data for a port
- `getBackupBatteryCapacity(portId)`: Retrieves capacity for a specific port
- `getAllBackupBatteryCapacities()`: Gets all port capacities

### Automatic Updates
- **Session Start**: Backup table updated when discharging session begins
- **Capacity Change**: Backup table updated when user modifies capacity
- **Session End**: Backup table cleaned up when session completes
- **Real-time Sync**: Maintains consistency with main session data

### Error Handling
- Graceful fallback if backup table operations fail
- Logging of all backup table operations
- Validation of capacity values before storage

## Benefits

### For Users
- **Simplified Workflow**: Only set capacity during discharge
- **Historical Access**: Can add capacity to completed sessions
- **Data Consistency**: All capacity data in one place

### For ESP32 Devices
- **Easy Access**: Simple Firebase path structure
- **Real-time Data**: Always up-to-date capacity information
- **Port-based Access**: Each port has exactly one capacity value
- **Simple Queries**: No need to search through sessions

### For System
- **Backup Redundancy**: Capacity data stored in multiple locations
- **Performance**: Optimized queries for embedded devices
- **Scalability**: Supports all 4 ports independently
- **Maintenance**: Automatic cleanup of completed sessions

## Troubleshooting

### Common Issues

#### Capacity Not Saving
- Ensure session is in "discharging" state
- Check Firebase connection and permissions
- Verify battery type is set before capacity

#### ESP32 Cannot Access Data
- Check Firebase rules allow read access to backup table
- Verify port ID matches exactly (e.g., "port_1", not "Port 1")
- Access path should be `/batteryCapacityBackup/{port_id}/ratedCapacity`

#### Backup Table Not Updating
- Check console for error messages
- Verify session has both battery type and capacity
- Ensure Firebase write permissions

### Debug Information
- All backup table operations are logged to console
- Check browser developer tools for error messages
- Use Firebase console to inspect backup table structure

## Future Enhancements

### Planned Features
- **Capacity Templates**: Pre-defined capacity values for common batteries
- **Batch Operations**: Update multiple ports at once
- **Capacity Validation**: Range checking based on battery type
- **Export/Import**: Backup and restore capacity data

### Integration Opportunities
- **Battery Database**: Integration with battery manufacturer databases
- **Smart Detection**: Automatic battery type and capacity detection
- **Mobile App**: Dedicated mobile interface for capacity management
- **API Endpoints**: REST API for external system integration
