'use client';

import { useMemo, useState, useEffect, memo } from 'react';
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { LogEntry } from '@/types';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { ChartConfig } from '@/components/ui/chart';
import { calculateSOC, getCutoffVoltage } from '@/lib/utils';

interface LiveChartProps {
  data: Record<string, LogEntry> | undefined;
  batteryType?: string;
}

const chartConfig = {
  voltage: {
    label: "Voltage (V)",
    color: "hsl(var(--primary))",
  },
  current: {
    label: "Current (A)",
    color: "hsl(var(--accent))",
  },
  soc: {
    label: "SOC (%)",
    color: "hsl(var(--green-500))",
  },
} satisfies ChartConfig;
  
export const LiveChart = memo(function LiveChart({ data, batteryType }: LiveChartProps) {
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

  const chartData = useMemo(() => {
    if (!data || Object.keys(data).length === 0) return [];
    
    const entries = Object.entries(data)
      .map(([timestamp, values]) => ({
        timestamp: parseInt(timestamp, 10),
        voltage: Number(values.voltage),
        current: Number(values.current),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
    
    // Calculate SOC for each data point if we have battery type
    if (entries.length > 0 && batteryType) {
      const startVoltage = entries[0].voltage;
      const cutoffVoltage = getCutoffVoltage(batteryType);
      
      return entries.map(entry => ({
        ...entry,
        soc: calculateSOC(entry.voltage, startVoltage, cutoffVoltage)
      }));
    }
    
    return entries;
  }, [data, batteryType]);

  // Early return for insufficient data
  if (!isClient || chartData.length < 2) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center rounded-lg border border-dashed text-muted-foreground">
        Waiting for session data...
      </div>
    );
  }

  return (
    <div className="live-chart h-[300px] w-full">
      <ChartContainer config={chartConfig} className="h-full w-full">
            <LineChart
            accessibilityLayer
            data={chartData}
            margin={{
                left: 12,
                right: 12,
                top: 5,
                bottom: 0,
            }}
            >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
                dataKey="timestamp"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            />
            <YAxis
                yAxisId="left"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickCount={6}
                unit="V"
                domain={[0, 'auto']}
            />
            <YAxis
                orientation="right"
                yAxisId="right"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickCount={6}
                unit="A"
                domain={[0, 'auto']}
            />
            <YAxis
                orientation="right"
                yAxisId="soc"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickCount={6}
                unit="%"
                domain={[0, 100]}
                hide={!batteryType}
            />
            <ChartTooltip
                cursor={true}
                content={<ChartTooltipContent
                hideLabel
                indicator="line"
                />}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
                dataKey="voltage"
                type="monotone"
                stroke="var(--color-voltage)"
                strokeWidth={2}
                dot={false}
                yAxisId="left"
            />
            <Line
                dataKey="current"
                type="monotone"
                stroke="var(--color-current)"
                strokeWidth={2}
                dot={false}
                yAxisId="right"
            />
            {batteryType && (
              <Line
                  dataKey="soc"
                  type="monotone"
                  stroke="hsl(var(--green-500))"
                  strokeWidth={2}
                  dot={false}
                  yAxisId="soc"
              />
            )}
          </LineChart>
      </ChartContainer>
    </div>
  );
});
