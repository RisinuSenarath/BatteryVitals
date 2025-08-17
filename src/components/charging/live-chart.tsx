'use client';

import { useMemo, useState, useEffect } from 'react';
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { LogEntry } from '@/types';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { ChartConfig } from '@/components/ui/chart';

interface LiveChartProps {
  data: Record<string, LogEntry> | undefined;
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
} satisfies ChartConfig;
  
export function LiveChart({ data }: LiveChartProps) {
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

  const chartData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data)
      .map(([timestamp, values]) => ({
        timestamp: parseInt(timestamp, 10),
        voltage: Number(values.voltage),
        current: Number(values.current),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [data]);

  if (!isClient || chartData.length < 2) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center rounded-lg border border-dashed text-muted-foreground">
        Waiting for session data...
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full">
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
          </LineChart>
      </ChartContainer>
    </div>
  );
}
