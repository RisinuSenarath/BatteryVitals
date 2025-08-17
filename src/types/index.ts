export interface LogEntry {
  voltage: number;
  current: number;
  cycle: 'charging' | 'discharging';
}

export interface Session {
  startTime: number;
  endTime: number | null;
  status: 'charging' | 'discharging' | 'completed' | 'error';
  batteryType: string;
  logs: Record<string, LogEntry>;
  currentVoltage: number;
  currentCurrent: number;
  notes?: string;
}

export interface Port {
  name: string;
  currentSessionId: string | null;
  sessions: Record<string, Session>;
}
