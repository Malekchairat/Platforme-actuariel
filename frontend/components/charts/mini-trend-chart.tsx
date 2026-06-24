"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

interface MiniTrendChartProps {
  data: { period: string; value: number }[];
  color?: string;
}

export function MiniTrendChart({ data, color = "var(--chart-1)" }: MiniTrendChartProps) {
  return (
    <div className="h-12 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
