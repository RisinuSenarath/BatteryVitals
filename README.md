# Battery Management System

A NextJS-based web application for monitoring and managing battery charging/discharging sessions with real-time capacity and health tracking.

## Features

### Real-time Battery Monitoring
- **Voltage & Current Tracking**: Live monitoring of battery voltage and current
- **Measured Capacity**: Calculated by integrating current during discharge to cutoff voltage (Ah)
- **State of Health (SOH)**: Calculated as `SOH = Measured Capacity / Rated Capacity × 100`
- **Session Management**: Track charging and discharging sessions with detailed logs
- **Backup Capacity Table**: Dedicated Firebase table for ESP32 access to battery capacity data

### Key Components
- **Port Cards**: Individual monitoring cards for each battery port
- **Live Charts**: Real-time visualization of voltage and current data
- **History Tracking**: Complete session history with performance metrics
- **AI Optimization**: Intelligent charging parameter optimization

## Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Setup**
   - Create a `.env` file with your Firebase configuration
   - Ensure you have `serviceAccountKey.json` for data simulation

3. **Run the Application**
   ```bash
   npm run dev
   ```

4. **Test Data Simulation**
   ```bash
   # Simulate charging data
   python send_sample_data.py
   
   # Simulate discharging data
   python send_discharge_data.py
   ```

## Data Structure

### Session Data
Each battery session includes:
- `startTime`: Session start timestamp
- `status`: 'charging', 'discharging', 'completed', or 'error'
- `type`: Current battery state - 'charging', 'discharging', or 'resting'
- `batteryType`: Type of battery (e.g., 'LiPo', 'Lead Acid')
- `ratedCapacity`: Battery's rated capacity in Ah (required for SOH calculation)
- `logs`: Time-series data of voltage and current measurements
- `currentVoltage`: Latest voltage reading
- `currentCurrent`: Latest current reading

### Capacity Calculation
The system calculates measured capacity by integrating current over time during discharge to cutoff voltage:
```
Capacity = Σ(Current × Time) during discharge to cutoff voltage
```

**Important**: Capacity is only measured when `type = 'discharging'`. The system automatically detects discharge sessions and applies appropriate cutoff voltages based on battery type.

**Battery States**:
- **`charging`**: Battery is being charged - capacity measurement not available
- **`discharging`**: Battery is being discharged - capacity measurement active
- **`resting`**: Battery is neither charging nor discharging - capacity measurement not available

### Cutoff Voltages by Battery Type
- **LiPo/Li-ion**: 3.0V per cell
- **Lead Acid**: 10.5V per 12V cell  
- **NiMH/NiCd**: 0.9V per cell

### SOH Calculation
State of Health is calculated as:
```
SOH = (Measured Capacity / Rated Capacity) × 100
```

**Note**: SOH can exceed 100% for new batteries that exceed their rated capacity.

## Usage

1. **Start a Session**: Connect a battery to begin monitoring
2. **Set Rated Capacity**: Enter the battery's rated capacity in mAh or Ah (e.g., 2200 mAh or 2.2 Ah)
3. **Monitor Battery State**: Watch the `type` attribute to see current battery state
4. **Charge First**: Set `type = 'charging'` and fully charge the battery
5. **Discharge to Measure**: Set `type = 'discharging'` to measure actual capacity
6. **Monitor Metrics**: Watch real-time voltage, current, capacity, and SOH during discharge
7. **View History**: Access complete session data and performance trends
8. **Optimize**: Use AI-powered optimization for charging parameters

**Capacity Measurement Workflow**:
- Set `type = 'charging'` and charge the battery completely
- Switch to `type = 'discharging'` to begin capacity measurement
- Monitor until battery reaches cutoff voltage
- System automatically calculates measured capacity and SOH when `type = 'discharging'`
- Set `type = 'resting'` when battery is not actively being used

## Backup Battery Capacity System

### Overview
The system includes a dedicated backup table (`/batteryCapacityBackup`) that stores battery capacity information for all discharging sessions across all 4 ports. Ports 1-3 are for LiPo/Li-ion batteries, while Port 4 is specifically designated for Lead Acid batteries. This provides:

- **ESP32 Easy Access**: Simple Firebase path for embedded devices
- **Capacity Input Restriction**: Capacity can only be set during discharging sessions
- **Historical Management**: Add capacity to completed sessions via session history
- **Real-time Sync**: Automatic updates when capacity changes or sessions end

### Key Features
- **Restricted Input**: Capacity input only available during discharging sessions
- **Backup Table**: Dedicated Firebase table for ESP32 access
- **Session History**: Edit capacity for completed discharging sessions
- **Multi-port Support**: Supports all 4 ports including Lead Acid batteries
- **Automatic Cleanup**: Removes completed sessions from backup table

### ESP32 Access
ESP32 devices can access battery capacity data via:
```
/batteryCapacityBackup/{port_id}/ratedCapacity
```

For detailed implementation and examples, see [BACKUP_BATTERY_CAPACITY_README.md](BACKUP_BATTERY_CAPACITY_README.md).

**Rated Capacity Input**:
- **mAh Input**: Enter capacity in milliampere-hours (e.g., "2200 mAh", "2200mah")
- **Ah Input**: Enter capacity in ampere-hours (e.g., "2.2 Ah", "2.2ah")
- **Auto-conversion**: mAh values are automatically converted to Ah for calculations
- **Validation**: System validates input and prevents negative or invalid values

## Technical Details

- **Frontend**: Next.js 14 with TypeScript
- **UI Components**: Radix UI with Tailwind CSS
- **Real-time Data**: Firebase Realtime Database
- **Charts**: Recharts for data visualization
- **State Management**: React hooks with custom data fetching

## Contributing

This project uses modern React patterns and TypeScript. Ensure all new features include proper type definitions and error handling.
