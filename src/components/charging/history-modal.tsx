'use client';
import { useState, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Session, LogEntry } from '@/types';
import { Badge } from '@/components/ui/badge';
import { LiveChart } from './live-chart';
import { Download, AlertTriangle } from 'lucide-react';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: Record<string, Session>;
  portName: string;
}

interface FormattedSession extends Session {
  id: string;
  formattedStartTime: string;
  formattedEndTime: string;
}

// Helper function to safely format a timestamp
const formatTimestamp = (timestamp: number | null | undefined, defaultString: string): string => {
  if (typeof timestamp === 'number' && !isNaN(timestamp) && timestamp > 0) {
    return new Date(timestamp).toLocaleString();
  }
  return defaultString;
};

// Helper to get a valid start timestamp, falling back to the session ID
const getSessionStartTime = (session: Session, sessionId: string): number | null => {
    if (session?.startTime && typeof session.startTime === 'number') {
      return session.startTime;
    }
    // Fallback to extracting timestamp from session ID, e.g., "session_py_1720498800000" or "session_1720498800000"
    const match = sessionId.match(/_(\d+)$/) || sessionId.match(/^session_(\d+)$/) || sessionId.match(/^(\d+)$/);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
    return null;
  };

// Function to generate a high-quality chart image using canvas
const generateChartImage = (logs: Record<string, LogEntry> | undefined): string | null => {
  if (!logs || Object.keys(logs).length === 0) return null;

  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Set canvas size for high resolution
    canvas.width = 800;
    canvas.height = 500;
    
    // Scale context for crisp rendering
    ctx.scale(2, 2);
    canvas.style.width = '400px';
    canvas.style.height = '250px';

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 400, 250);

    // Border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 400, 250);

    // Process data
    const logData = Object.entries(logs)
      .map(([timestamp, values]) => ({
        timestamp: parseInt(timestamp, 10),
        voltage: Number(values.voltage),
        current: Number(values.current),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    if (logData.length < 2) return null;

    // Calculate scales - start from 0 for better readability
    const timeRange = logData[logData.length - 1].timestamp - logData[0].timestamp;
    const voltageRange = Math.max(...logData.map(d => d.voltage), 4.2) - 0; // Start from 0V, max at 4.2V or higher
    const currentRange = Math.max(...logData.map(d => d.current), 2.0) - 0; // Start from 0A, max at 2.0A or higher

    const padding = 50;
    const chartWidth = 400 - 2 * padding;
    const chartHeight = 250 - 2 * padding;

    // Draw grid lines
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 0.5;
    
    // Vertical grid lines (time)
    for (let i = 0; i <= 5; i++) {
      const x = padding + (i / 5) * chartWidth;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, padding + chartHeight);
      ctx.stroke();
    }

    // Horizontal grid lines (voltage)
    for (let i = 0; i <= 4; i++) {
      const y = padding + (i / 4) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + chartWidth, y);
      ctx.stroke();
    }
    
    // Add bottom margin to ensure labels are visible
    const bottomMargin = 30;

    // Draw voltage line
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    logData.forEach((point, index) => {
      const x = padding + ((point.timestamp - logData[0].timestamp) / timeRange) * chartWidth;
      const y = padding + chartHeight - (point.voltage / voltageRange) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw current line
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    logData.forEach((point, index) => {
      const x = padding + ((point.timestamp - logData[0].timestamp) / timeRange) * chartWidth;
      const y = padding + chartHeight - (point.current / currentRange) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw labels
    ctx.fillStyle = '#374151';
    ctx.font = '12px Arial';
    
    // Y-axis labels (voltage) - left side
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const voltage = 0 + (i / 4) * voltageRange;
      const y = padding + (4 - i) / 4 * chartHeight;
      
      // Add white background behind voltage labels
      const text = `${voltage.toFixed(1)}V`;
      const textWidth = ctx.measureText(text).width;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(25 - textWidth - 4, y - 8, textWidth + 8, 16);
      
      // Draw voltage labels
      ctx.fillStyle = '#374151';
      ctx.fillText(text, 25, y + 4);
    }

    // Y-axis labels (current) - right side
    ctx.textAlign = 'left';
    for (let i = 0; i <= 4; i++) {
      const current = 0 + (i / 4) * currentRange;
      const y = padding + (4 - i) / 4 * chartHeight;
      
      // Add white background behind current labels
      const text = `${current.toFixed(2)}A`;
      const textWidth = ctx.measureText(text).width;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(350, y - 8, textWidth + 8, 16);
      
      // Draw current labels
      ctx.fillStyle = '#374151';
      ctx.fillText(text, 350, y + 4);
    }

    // X-axis labels (time)
    ctx.textAlign = 'center';
    for (let i = 0; i <= 5; i++) {
      const time = logData[0].timestamp + (i / 5) * timeRange;
      const x = padding + (i / 5) * chartWidth;
      ctx.fillText(new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), x, padding + chartHeight + bottomMargin);
    }



    // Legend
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(320, 20, 15, 3);
    ctx.fillStyle = '#374151';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Voltage', 340, 23);

    ctx.fillStyle = '#ef4444';
    ctx.fillRect(320, 30, 15, 3);
    ctx.fillStyle = '#374151';
    ctx.fillText('Current', 340, 33);

    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Error generating chart image:', error);
    return null;
  }
};

export function HistoryModal({ isOpen, onClose, sessions, portName }: HistoryModalProps) {
  const [formattedSessions, setFormattedSessions] = useState<FormattedSession[]>([]);
  const chartRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (isOpen && sessions) {
      const sessionList = Object.entries(sessions)
        .map(([id, session]) => {
            const startTime = getSessionStartTime(session, id);
            return {
                id,
                ...session,
                // We use the derived startTime for formatting, ensuring it's never invalid
                startTime: startTime, 
                formattedStartTime: formatTimestamp(startTime, 'N/A'),
                formattedEndTime: session.status === 'completed' 
                    ? formatTimestamp(session.endTime, 'Completed') 
                    : 'In Progress',
            }
        })
        .sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
      setFormattedSessions(sessionList as FormattedSession[]);
    }
  }, [sessions, isOpen]);

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

  const generatePdf = async (session: FormattedSession) => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(20);
    doc.text('Charging Session Report', 14, 22);

    // Session Info
    doc.setFontSize(12);
    doc.text(`Port: ${portName}`, 14, 32);
    doc.text(`Session ID: ${session.id}`, 14, 38);
    doc.text(`Battery Type: ${session.batteryType || 'N/A'}`, 14, 44);
    doc.text(`Start Time: ${session.formattedStartTime}`, 14, 50);
    doc.text(`End Time: ${session.formattedEndTime}`, 14, 56);
    doc.text(`Status: ${session.status || 'N/A'}`, 14, 62);
    if(session.notes) {
      doc.text(`Notes: ${session.notes}`, 14, 68);
    }

    let chartStartY = 75;
    if(session.notes) {
        chartStartY = 81;
    }

    // Generate high-quality chart image if logs exist
    if (session.logs && Object.keys(session.logs).length > 0) {
        try {
            const chartImageData = generateChartImage(session.logs);
            if (chartImageData) {
                const imgProps = doc.getImageProperties(chartImageData);
                const pdfWidth = doc.internal.pageSize.getWidth();
                const imgWidth = pdfWidth - 28; // with some margin
                const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
                
                doc.addImage(chartImageData, 'PNG', 14, chartStartY, imgWidth, imgHeight);
                chartStartY += imgHeight + 15;
            }
        } catch (error) {
            console.error("Error generating chart image:", error);
            chartStartY += 20;
        }
    }

    // Logs Table
    const tableColumn = ["Timestamp", "Voltage (V)", "Current (A)", "Cycle"];
    const tableRows: (string | number)[][] = [];

    const logData = Object.entries(session.logs || {})
      .map(([timestamp, values]) => ({
          timestamp: parseInt(timestamp, 10),
          ...values
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    logData.forEach(log => {
      const logRow = [
        formatTimestamp(log.timestamp, 'N/A'),
        Number(log.voltage).toFixed(2),
        Number(log.current).toFixed(2),
        log.cycle || 'N/A',
      ];
      tableRows.push(logRow);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: chartStartY,
    });

    doc.save(`session-report-${session.id}.pdf`);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-[700px] h-[90vh] flex flex-col !translate-y-0 !top-4 !bottom-4 !translate-x-[-50%] !left-[50%]">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="font-headline">{portName} - Session History</DialogTitle>
          <DialogDescription>
            Review past charging and discharging sessions. Click a session to see its graph or download a report.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden mt-4">
          <div className="h-full w-full pr-4 overflow-y-auto">
            <Accordion type="single" collapsible className="w-full">
              {formattedSessions.length > 0 ? (
                formattedSessions.map((session) => (
                  <AccordionItem value={session.id} key={session.id} className="border-b">
                    <AccordionTrigger className="px-4 py-3 hover:bg-muted/50 rounded-md">
                      <div className="flex justify-between items-center w-full pr-4">
                        <div className="flex flex-col text-left">
                          <span className="font-semibold">{session.formattedStartTime}</span>
                          <span className="text-sm text-muted-foreground">{session.batteryType || 'N/A'}</span>
                        </div>
                        <div className="no-underline">
                          <Badge variant={getStatusBadgeVariant(session.status)} className="capitalize">{session.status || 'Unknown'}</Badge>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 space-y-4">
                      {session.notes && (
                          <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-800 text-sm">
                              <AlertTriangle className="h-5 w-5" />
                              <p>{session.notes}</p>
                          </div>
                      )}
                      <div ref={(el) => { chartRefs.current[session.id] = el; }} className="w-full overflow-x-auto">
                          <div className="min-w-[500px]">
                              <LiveChart data={session.logs} />
                          </div>
                      </div>
                      <div className="flex justify-end">
                        <Button variant="outline" onClick={() => generatePdf(session)}>
                          <Download className="mr-2" />
                          Download PDF
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))
              ) : (
                <div className="text-center text-muted-foreground p-8">
                  No historical sessions found.
                </div>
              )}
            </Accordion>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
