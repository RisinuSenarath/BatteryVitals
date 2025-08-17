'use client';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Zap, Waves, History, Bot } from 'lucide-react';
import { usePortData } from '@/hooks/use-port-data';
import { LiveChart } from './live-chart';
import { HistoryModal } from './history-modal';
import { OptimizationModal } from './optimization-modal';
import { useToast } from '@/hooks/use-toast';

interface PortCardProps {
  portId: string;
  portName: string;
}

export function PortCard({ portId, portName }: PortCardProps) {
  const { portData, currentSession, historicalSessions, loading, error } = usePortData(portId);
  const { toast } = useToast();
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [optimizationModalOpen, setOptimizationModalOpen] = useState(false);
  
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
      <Card className="flex flex-col shadow-md hover:shadow-lg transition-shadow duration-300">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-headline">{portName}</CardTitle>
            {currentSession ? (
              <Badge variant={getStatusBadgeVariant(currentSession.status)} className="capitalize">
                {currentSession.status}
              </Badge>
            ) : (
              <Badge variant="secondary">Idle</Badge>
            )}
          </div>
          <CardDescription>
            {currentSession
              ? `Session started: ${formattedStartDate}`
              : 'No active session. Connect a battery to begin.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-card border">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Voltage</p>
                <strong className="font-mono text-lg">{Number(currentSession?.currentVoltage).toFixed(2) ?? '0.00'} V</strong>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-card border">
              <Waves className="h-4 w-4 text-muted-foreground" />
               <div className="flex-1">
                <p className="text-xs text-muted-foreground">Current</p>
                <strong className="font-mono text-lg">{Number(currentSession?.currentCurrent).toFixed(2) ?? '0.00'} A</strong>
              </div>
            </div>
          </div>
          <div className="w-full overflow-x-auto">
            <div className="min-w-[500px]">
              <LiveChart data={currentSession?.logs} />
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" onClick={() => setHistoryModalOpen(true)}>
            <History className="mr-2" />
            History
          </Button>
          <Button onClick={() => setOptimizationModalOpen(true)} disabled={!currentSession}>
            <Bot className="mr-2" />
            Optimize
          </Button>
        </CardFooter>
      </Card>
      
      <HistoryModal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        sessions={historicalSessions}
        portName={portName}
      />
      {currentSession && (
        <OptimizationModal
          isOpen={optimizationModalOpen}
          onClose={() => setOptimizationModalOpen(false)}
          session={currentSession}
          portName={portName}
        />
      )}
    </>
  );
}
