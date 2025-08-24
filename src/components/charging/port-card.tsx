'use client';
import { useState, useEffect, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Zap, Waves, History, Bot, Battery, Activity, Save } from 'lucide-react';
import { usePortData } from '@/hooks/use-port-data';
import { LiveChart } from './live-chart';
import { HistoryModal } from './history-modal';
import { useToast } from '@/hooks/use-toast';
import { calculateMeasuredCapacity, calculateSOH, getCutoffVoltage, calculateSOC, calculateDischargedCapacity, calculateRemainingCapacity, updateBackupBatteryCapacity } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ref, update } from 'firebase/database';
import { database } from '@/lib/firebase';

interface PortCardProps {
  portId: string;
  portName: string;
}

export const PortCard = memo(function PortCard({ portId, portName }: PortCardProps) {
  const { portData, currentSession, historicalSessions, loading, error } = usePortData(portId);
  const { toast } = useToast();
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [ratedCapacityInput, setRatedCapacityInput] = useState<string>('');
  const [batteryTypeInput, setBatteryTypeInput] = useState<string>('');
  const [isEditingCapacity, setIsEditingCapacity] = useState(false);
  const [isEditingBatteryType, setIsEditingBatteryType] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(0);
  
  // Initialize rated capacity input when session changes
  useEffect(() => {
    // Priority: current session > port level > empty
    const capacity = currentSession?.ratedCapacity || portData?.ratedCapacity;
    if (capacity) {
      setRatedCapacityInput(capacity.toString());
    } else {
      setRatedCapacityInput('');
    }
  }, [currentSession?.ratedCapacity, portData?.ratedCapacity, forceRefresh]);

  // Initialize battery type input when session changes
  useEffect(() => {
    const batteryType = currentSession?.batteryType;
    if (batteryType) {
      setBatteryTypeInput(batteryType);
    } else {
      setBatteryTypeInput('');
    }
  }, [currentSession?.batteryType, forceRefresh]);

  const handleEditCapacity = () => {
    // If there's no current session, initialize with empty string
    if (!currentSession) {
      setRatedCapacityInput('');
    } else {
      setRatedCapacityInput(currentSession.ratedCapacity?.toString() || '');
    }
    setIsEditingCapacity(true);
  };

  const handleCancelEdit = () => {
    if (currentSession) {
      setRatedCapacityInput(currentSession.ratedCapacity?.toString() || '');
    } else {
      setRatedCapacityInput('');
    }
    setIsEditingCapacity(false);
  };

  const handleEditBatteryType = () => {
    if (!currentSession) {
      // Port 4 automatically sets to Lead Acid
      if (portId === 'port_4') {
        setBatteryTypeInput('Lead Acid');
      } else {
        setBatteryTypeInput('');
      }
    } else {
      // Port 4 always shows Lead Acid, others show current type
      if (portId === 'port_4') {
        setBatteryTypeInput('Lead Acid');
      } else {
        setBatteryTypeInput(currentSession.batteryType || '');
      }
    }
    setIsEditingBatteryType(true);
  };

  const handleCancelBatteryTypeEdit = () => {
    if (currentSession) {
      setBatteryTypeInput(currentSession.batteryType || '');
    } else {
      setBatteryTypeInput('');
    }
    setIsEditingBatteryType(false);
  };

  const handleSaveRatedCapacity = async () => {
    if (!ratedCapacityInput.trim()) return;
    
    // Only allow capacity input during discharging sessions
    if (!currentSession || currentSession.type !== 'discharging') {
      toast({
        variant: 'destructive',
        title: 'Capacity Input Restricted',
        description: 'Battery capacity can only be set during discharging sessions.',
      });
      return;
    }
    
    // Parse the input and detect units
    const input = ratedCapacityInput.trim().toLowerCase();
    let capacity: number;
    let unit: string;
    
    // Check if input contains "mah" or "ah"
    if (input.includes('mah')) {
      // Extract number from mAh input (e.g., "2200mah" -> 2200)
      const match = input.match(/(\d+(?:\.\d+)?)/);
      if (!match) {
        toast({
          variant: 'destructive',
          title: 'Invalid Input',
          description: 'Please enter a valid number followed by mAh (e.g., 2200 mAh)',
        });
        return;
      }
      const rawValue = parseFloat(match[1]);
      if (rawValue <= 0) {
        toast({
          variant: 'destructive',
          title: 'Invalid Input',
          description: 'Capacity must be a positive number',
        });
        return;
      }
      capacity = rawValue / 1000; // Convert mAh to Ah
      unit = 'mAh';
    } else if (input.includes('ah')) {
      // Extract number from Ah input (e.g., "2.2ah" -> 2.2)
      const match = input.match(/(\d+(?:\.\d+)?)/);
      if (!match) {
        toast({
          variant: 'destructive',
          title: 'Invalid Input',
          description: 'Please enter a valid number followed by Ah (e.g., 2.2 Ah)',
        });
        return;
      }
      const rawValue = parseFloat(match[1]);
      if (rawValue <= 0) {
        toast({
          variant: 'destructive',
          title: 'Invalid Input',
          description: 'Capacity must be a positive number',
        });
        return;
      }
      capacity = rawValue;
      unit = 'Ah';
    } else {
      // No unit specified, assume mAh for user convenience
      const rawValue = parseFloat(input);
      if (rawValue <= 0) {
        toast({
          variant: 'destructive',
          title: 'Invalid Input',
          description: 'Capacity must be a positive number',
        });
        return;
      }
      capacity = rawValue / 1000; // Convert to Ah
      unit = 'mAh';
    }
    
    if (isNaN(capacity) || capacity <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid Capacity',
        description: `Please enter a valid positive number. You entered: ${ratedCapacityInput}`,
      });
      return;
    }

    try {
      if (currentSession && portData?.currentSessionId) {
        // Save rated capacity to the current discharging session
        const sessionRef = ref(database, `ports/${portId}/sessions/${portData.currentSessionId}`);
        await update(sessionRef, {
          ratedCapacity: capacity
        });
        
        // Update the backup battery capacity table for ESP32 access
        await updateBackupBatteryCapacity(
          database,
          portId,
          capacity
        );
      } else {
        toast({
          variant: 'destructive',
          title: 'No Active Discharge Session',
          description: 'Please start a discharging session before setting rated capacity.',
        });
        return;
      }
      
      setIsEditingCapacity(false);
      const originalInput = ratedCapacityInput;
      
      // Update local state immediately for better UX
      setRatedCapacityInput(capacity.toString());
      
      toast({
        title: 'Capacity Updated',
        description: `${originalInput} converted to ${capacity.toFixed(3)} Ah and saved to current discharge session`,
      });
      
      // Debug: Log the update
      console.log('Capacity updated:', {
        portId,
        capacity,
        originalInput,
        sessionType: currentSession?.type,
        sessionId: portData?.currentSessionId,
        backupTableUpdated: true
      });
      
      setForceRefresh(prev => prev + 1); // Force refresh to update the input value
      
      // Small delay to show the saved value before closing edit mode
      setTimeout(() => {
        setIsEditingCapacity(false);
      }, 1000);
    } catch (error) {
      console.error('Failed to save capacity:', error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Failed to update rated capacity. Please try again.',
      });
    }
  };

  const handleSaveBatteryType = async () => {
    if (!batteryTypeInput.trim()) return;
    
    let batteryType = batteryTypeInput.trim();
    
    // Port 4 is Lead Acid only
    if (portId === 'port_4') {
      if (batteryType.toLowerCase() !== 'lead acid' && batteryType.toLowerCase() !== 'leadacid') {
        toast({
          variant: 'destructive',
          title: 'Port 4 Restriction',
          description: 'Port 4 only accepts Lead Acid batteries. Please use a different port for other battery types.',
        });
        return;
      }
      batteryType = 'Lead Acid';
      toast({
        title: 'Port 4 Restriction',
        description: 'Port 4 is Lead Acid only. Battery type set to Lead Acid.',
      });
    }
    
    try {
      if (currentSession && portData?.currentSessionId) {
        // Always save battery type to the current session
        const sessionRef = ref(database, `ports/${portId}/sessions/${portData.currentSessionId}`);
        await update(sessionRef, {
          batteryType: batteryType
        });
      } else {
        // If no current session, show error
        toast({
          variant: 'destructive',
          title: 'No Active Session',
          description: 'Please start a session before setting battery type.',
        });
        return;
      }
      
      setIsEditingBatteryType(false);
      setForceRefresh(prev => prev + 1);
      toast({
        title: 'Battery Type Updated',
        description: `Battery type set to ${batteryType}`,
      });
    } catch (error) {
      console.error('Failed to save battery type:', error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Could not save battery type. Please try again.',
      });
    }
  };

  useEffect(() => {
    if (error) {
        toast({
            variant: 'destructive',
            title: 'Error Loading Data',
            description: error,
        });
    }
  }, [error, toast]);

  const getSessionStartTime = (): number | null => {
    if (currentSession?.startTime && typeof currentSession.startTime === 'number') {
      return currentSession.startTime;
    }
    // Fallback to extracting timestamp from session ID, e.g., "session_py_1720498800000" or "session_1720498800000"
    if (portData?.currentSessionId) {
        const match = portData.currentSessionId.match(/_(\d+)$/) || portData.currentSessionId.match(/^session_(\d+)$/) || portData.currentSessionId.match(/^(\d+)$/);
        if (match && match[1]) {
          return parseInt(match[1], 10);
        }
    }
    return null;
  };

  const startTime = getSessionStartTime();
  const formattedStartDate = startTime
    ? new Date(startTime).toLocaleString()
    : 'No active session. Connect a battery to start.';


  const getStatusBadgeVariant = (status: string | undefined): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'charging':
        return 'default';
      case 'discharging':
        return 'destructive';
      case 'completed':
        return 'outline';
      case 'error':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const renderLoadingState = () => (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-3/4 rounded-md" />
        <Skeleton className="mt-2 h-4 w-1/2 rounded-md" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-8 w-full rounded-md" />
          <Skeleton className="h-8 w-full rounded-md" />
          <Skeleton className="h-8 w-full rounded-md" />
          <Skeleton className="h-8 w-full rounded-md" />
        </div>
        <Skeleton className="h-[300px] w-full rounded-lg" />
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Skeleton className="h-10 w-28 rounded-md" />
        <Skeleton className="h-10 w-28 rounded-md" />
      </CardFooter>
    </Card>
  );

  if (loading) {
    return renderLoadingState();
  }

  return (
    <>
      <Card className="port-card w-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                {portName}
                {portId === 'port_4' && (
                  <Badge variant="secondary" className="text-xs">
                    🔒 Lead Acid Only
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                {portId === 'port_4' 
                  ? 'Lead Acid batteries only. Expected capacity: 20-200 Ah'
                  : 'LiPo/Li-ion batteries. Expected capacity: 0.5-10 Ah'
                }
              </CardDescription>
            </div>
            {currentSession ? (
              <Badge variant={getStatusBadgeVariant(currentSession.status)} className="capitalize">
                {currentSession.status}
              </Badge>
            ) : (
              <Badge variant="secondary">Idle</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-card border">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-xs text-muted-foreground cursor-help">Voltage</p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Current battery voltage</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <strong className="font-mono text-lg">{Number(currentSession?.currentVoltage).toFixed(2) ?? '0.00'} V</strong>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-card border">
              <Waves className="h-4 w-4 text-muted-foreground" />
               <div className="flex-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-xs text-muted-foreground cursor-help">Current</p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Current flowing through the battery</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <strong className="font-mono text-lg">{Number(currentSession?.currentCurrent).toFixed(2) ?? '0.00'} A</strong>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-card border">
              <Battery className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-xs text-muted-foreground cursor-help">Measured Capacity</p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Capacity measured during discharge to cutoff voltage</p>
                      {currentSession?.type === 'discharging' && (
                        <p className="text-xs mt-1 text-blue-600">📊 Showing real-time discharged capacity during active session</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <strong className="font-mono text-lg">
                  {currentSession ? (
                    currentSession.type === 'discharging' ? (
                      (currentSession.ratedCapacity || portData?.ratedCapacity) ? (
                        currentSession.batteryType ? 
                          (() => {
                            try {
                              if (!currentSession.logs || Object.keys(currentSession.logs).length < 2) return '0.00 Ah';
                              // During discharge, show current discharged capacity as measured capacity
                              const dischargedCapacity = calculateDischargedCapacity(currentSession.logs, getCutoffVoltage(currentSession.batteryType));
                              return `${dischargedCapacity.toFixed(2)} Ah`;
                            } catch (error) {
                              console.error('Error calculating measured capacity:', error);
                              return 'Error';
                            }
                          })() :
                          'Set Battery Type First'
                      ) : (
                        'Set Rated Capacity First'
                      )
                    ) : currentSession.type === 'charging' ? (
                      'Charge First'
                    ) : (
                      'Resting'
                    )
                  ) : (portData?.ratedCapacity ? 'No Active Session' : '0.00')}
                </strong>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-card border">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-xs text-muted-foreground cursor-help">SOH</p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>State of Health: Measured Capacity / Rated Capacity × 100</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <strong className="font-mono text-lg">
                  {currentSession ? (
                    (currentSession.ratedCapacity || portData?.ratedCapacity) ? (
                      currentSession.type === 'discharging' ? (
                        currentSession.batteryType ? 
                          (() => {
                            try {
                              if (!currentSession.logs || Object.keys(currentSession.logs).length < 2) return '0%';
                              // During discharge, show projected SOH based on current discharge state
                              const dischargedCapacity = calculateDischargedCapacity(currentSession.logs, getCutoffVoltage(currentSession.batteryType));
                              const ratedCapacity = currentSession.ratedCapacity || portData?.ratedCapacity || 0;
                              const projectedSOH = (dischargedCapacity / ratedCapacity) * 100;
                              return `${projectedSOH.toFixed(1)}%`;
                            } catch (error) {
                              console.error('Error calculating projected SOH:', error);
                              return 'Error';
                            }
                          })() :
                          'Set Battery Type First'
                      ) : currentSession.type === 'charging' ? (
                        'Discharge First'
                      ) : (
                        'Resting'
                      )
                    ) : (
                      'Set Rated Capacity'
                    )
                  ) : (
                    portData?.ratedCapacity ? 'No Active Session' : 'Set Rated Capacity'
                  )}
                </strong>
              </div>
            </div>
          </div>
          
          {/* Real-time Discharge Metrics */}
          {currentSession && currentSession.type === 'discharging' && currentSession.batteryType ? (
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-card border">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-xs text-muted-foreground cursor-help">Discharged Capacity</p>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Real-time discharged capacity during current discharge cycle (Ah)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <strong className="font-mono text-lg text-blue-600">
                    {(() => {
                      try {
                        if (!currentSession.logs || Object.keys(currentSession.logs).length < 2) return '0.000 Ah';
                        return `${calculateDischargedCapacity(currentSession.logs, getCutoffVoltage(currentSession.batteryType)).toFixed(3)} Ah`;
                      } catch (error) {
                        console.error('Error calculating discharged capacity:', error);
                        return 'Error';
                      }
                    })()}
                  </strong>
                </div>
              </div>
              
              <div className="flex items-center gap-2 p-2 rounded-lg bg-card border">
                <Waves className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-xs text-muted-foreground cursor-help">SOC</p>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>State of Charge: Remaining capacity as percentage</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <strong className="font-mono text-lg text-green-600">
                    {(() => {
                      try {
                        const logs = Object.entries(currentSession.logs || {});
                        if (logs.length < 2) return '0%';
                        
                        const sortedLogs = logs
                          .map(([ts, data]) => ({ timestamp: parseInt(ts), voltage: Number(data.voltage) }))
                          .sort((a, b) => a.timestamp - b.timestamp);
                        
                        const startVoltage = sortedLogs[0]?.voltage || 0;
                        const currentVoltage = sortedLogs[sortedLogs.length - 1]?.voltage || 0;
                        
                        return `${calculateSOC(currentVoltage, startVoltage, getCutoffVoltage(currentSession.batteryType)).toFixed(1)}%`;
                      } catch (error) {
                        console.error('Error calculating SOC:', error);
                        return 'Error';
                      }
                    })()}
                  </strong>
                </div>
              </div>
              
              <div className="flex items-center gap-2 p-2 rounded-lg bg-card border">
                <Battery className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-xs text-muted-foreground cursor-help">Remaining Capacity</p>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Estimated remaining capacity based on rated capacity (Ah)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <strong className="font-mono text-lg text-orange-600">
                    {(() => {
                      try {
                        const ratedCapacity = currentSession.ratedCapacity || portData?.ratedCapacity || 0;
                        if (ratedCapacity <= 0) return '0.00 Ah';
                        
                        if (!currentSession.logs || Object.keys(currentSession.logs).length < 2) return '0.000 Ah';
                        
                        const dischargedCapacity = calculateDischargedCapacity(currentSession.logs, getCutoffVoltage(currentSession.batteryType));
                        const remainingCapacity = calculateRemainingCapacity(ratedCapacity, dischargedCapacity);
                        
                        return `${remainingCapacity.toFixed(3)} Ah`;
                      } catch (error) {
                        console.error('Error calculating remaining capacity:', error);
                        return 'Error';
                      }
                    })()}
                  </strong>
                </div>
              </div>
            </div>
          ) : null}
          
          {/* Rated Capacity Section - Always visible */}
          <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help">Rated Capacity:</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Enter capacity in Ah or mAh (e.g., 2.2 Ah or 2200 mAh)</p>
                    <p className="text-xs mt-1">mAh will be automatically converted to Ah</p>
                    <p className="text-xs mt-1 text-blue-600">⚠️ Only available during discharging sessions</p>
                    {portId === 'port_4' && (
                      <p className="text-xs mt-1 text-purple-600">🔒 Port 4: Lead Acid only (1.0 - 200 Ah typical)</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {isEditingCapacity ? (
                <>
                  <Input
                    type="text"
                    value={ratedCapacityInput}
                    onChange={(e) => setRatedCapacityInput(e.target.value)}
                    placeholder="e.g., 2200 mAh or 2.2 Ah"
                    className="h-6 text-xs w-32"
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveRatedCapacity}
                    className="h-6 px-2 text-xs"
                  >
                    <Save className="h-3 w-3 mr-1" />
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCancelEdit}
                    className="h-6 px-2 text-xs"
                  >
                    Cancel
                  </Button>
                  <span className="text-xs text-blue-600">
                    Will save to current discharge session
                  </span>
                </>
              ) : (
                <>
                  <span>Rated Capacity: {currentSession?.ratedCapacity || portData?.ratedCapacity ? `${currentSession?.ratedCapacity || portData?.ratedCapacity} Ah` : 'Not set'}</span>
                  {(currentSession?.ratedCapacity || portData?.ratedCapacity) && (
                    <span className="text-xs text-muted-foreground">
                      {currentSession?.ratedCapacity ? '(from session)' : '(from port)'}
                    </span>
                  )}
                  {currentSession?.type === 'discharging' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleEditCapacity}
                      className="h-6 px-1 text-xs"
                    >
                      Edit
                    </Button>
                  )}
                </>
              )}
              {!(currentSession?.ratedCapacity || portData?.ratedCapacity) && (
                <p className="text-xs text-blue-600">
                  💡 Set rated capacity during discharging sessions to enable capacity measurement and SOH calculation
                  {portId === 'port_4' && (
                    <span className="block mt-1 text-purple-600">
                      🔋 Port 4 expects Lead Acid batteries (1.0 - 200 Ah typical)
                    </span>
                  )}
                </p>
              )}
              {currentSession && currentSession.type !== 'discharging' && (
                <p className="text-xs text-orange-600">
                  ⚠️ Capacity can only be set during discharging sessions
                </p>
              )}
            </div>
            {currentSession ? (
              <>
                <div className="flex items-center gap-2">
                  <p>Battery Type: {currentSession.batteryType || 'Not set'}</p>
                  {isEditingBatteryType ? (
                    <>
                      <Input
                        type="text"
                        value={batteryTypeInput}
                        onChange={(e) => setBatteryTypeInput(e.target.value)}
                        placeholder={portId === 'port_4' ? 'Lead Acid (fixed)' : 'e.g., LiPo, Li-ion, NiMH'}
                        className="h-6 text-xs w-24"
                        disabled={portId === 'port_4'}
                      />
                      <Button
                        size="sm"
                        onClick={handleSaveBatteryType}
                        className="h-6 px-2 text-xs"
                        disabled={portId === 'port_4'}
                      >
                        <Save className="h-3 w-3 mr-1" />
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancelBatteryTypeEdit}
                        className="h-6 px-2 text-xs"
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleEditBatteryType}
                      className="h-6 px-1 text-xs"
                      disabled={portId === 'port_4'}
                    >
                      Edit
                    </Button>
                  )}
                </div>
                {portId === 'port_4' && (
                  <p className="text-xs text-purple-600 font-medium">
                    🔒 Port 4 is Lead Acid only - battery type cannot be changed
                  </p>
                )}
                {!currentSession.batteryType && (
                  <p className="text-xs text-blue-600">
                    💡 Set battery type to enable AI optimization and accurate cutoff voltage calculation
                  </p>
                )}
                <p>Cutoff Voltage: {currentSession.batteryType ? `${getCutoffVoltage(currentSession.batteryType)}V` : 'Not set'}</p>
                <p className="font-medium">Current State: {currentSession.type}</p>
                {currentSession.type === 'charging' && (
                  <p className="text-blue-600">💡 Charging - complete charging before measuring capacity</p>
                )}
                {currentSession.type === 'discharging' && (
                  <p className="text-green-600">📊 Discharging - capacity measurement in progress</p>
                )}
                {currentSession.type === 'resting' && (
                  <p className="text-gray-600">⏸️ Resting - battery is not actively charging or discharging</p>
                )}
              </>
            ) : (
              <p className="text-amber-600">⚠️ No active session. Connect a battery to start monitoring.</p>
            )}
          </div>
          <div className="w-full overflow-x-auto">
            <div className="min-w-[500px]">
              <LiveChart data={currentSession?.logs} batteryType={currentSession?.batteryType} />
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" onClick={() => setHistoryModalOpen(true)}>
            <History className="mr-2" />
            History
          </Button>
        </CardFooter>
      </Card>
      
      <HistoryModal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        sessions={historicalSessions}
        portName={portName}
      />
    </>
  );
});
