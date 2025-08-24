'use client';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { optimizeChargingParameters, OptimizeChargingParametersOutput } from '@/ai/flows/optimize-charging-parameters';
import type { Session } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Bot, Loader2, Sparkles } from 'lucide-react';

interface OptimizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: Session;
  portName: string;
}

export function OptimizationModal({ isOpen, onClose, session, portName }: OptimizationModalProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptimizeChargingParametersOutput | null>(null);
  const { toast } = useToast();

  const handleOptimize = async () => {
    setLoading(true);
    setResult(null);
    try {
      const historicalDataString = Object.entries(session.logs || {})
        .map(([ts, data]) => `${ts},${Number(data.voltage).toFixed(4)},${Number(data.current).toFixed(4)},${data.cycle}`)
        .join('\n');

      if (!historicalDataString) {
        toast({
          variant: 'destructive',
          title: 'Not Enough Data',
          description: 'Cannot run optimization without session log data.',
        });
        setLoading(false);
        return;
      }

      if (!session.batteryType) {
        toast({
          variant: 'destructive',
          title: 'Missing Battery Type',
          description: 'Please set the battery type before running optimization.',
        });
        setLoading(false);
        return;
      }

      const response = await optimizeChargingParameters({
        portName: portName,
        batteryType: session.batteryType,
        sessionType: session.status === 'discharging' ? 'discharging' : 'charging',
        historicalChargingData: historicalDataString,
      });
      setResult(response);
    } catch (error) {
      console.error('Optimization failed:', error);
      toast({
        variant: 'destructive',
        title: 'Optimization Failed',
        description: 'Could not get optimization suggestions from AI.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Reset state when closing, unless we are loading
    if (!loading) {
      setResult(null);
    }
    onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="font-headline flex items-center gap-2">
            <Bot className="text-primary" /> AI Battery Optimization
          </DialogTitle>
          <DialogDescription>
            {!session.batteryType ? (
              <span className="text-destructive">⚠️ Please set the battery type first to enable AI optimization.</span>
            ) : (
              'Let AI analyze the current session data to suggest optimal battery parameters for future use.'
            )}
          </DialogDescription>
        </DialogHeader>
        
        {loading && (
          <div className="flex flex-col items-center justify-center space-y-4 py-8">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
            <p className="text-muted-foreground">AI is analyzing session data...</p>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-4 py-4">
             <h3 className="text-lg font-semibold flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> AI Suggestions</h3>
            <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 bg-background">
              <div>
                <p className="text-sm text-muted-foreground">Voltage</p>
                <p className="text-2xl font-bold font-mono text-primary">{result.suggestedVoltage} V</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Current</p>
                <p className="text-2xl font-bold font-mono text-accent">{result.suggestedCurrent} A</p>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Reasoning</p>
              <p className="text-sm text-foreground/80">{result.reasoning}</p>
            </div>
          </div>
        )}
        
        <DialogFooter>
          {!result && !loading && (
             <Button onClick={handleOptimize} disabled={loading || !session.batteryType} className="w-full">
               {!session.batteryType ? 'Set Battery Type First' : 'Optimize Now'}
            </Button>
          )}
           {result && !loading && (
             <Button onClick={handleOptimize} variant="secondary" disabled={loading}>
              Re-analyze
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
