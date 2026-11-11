'use client';

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

export interface GrowthChartProps {
  data?: { month: string; tenants: number }[];
}

export function GrowthChart({ data }: GrowthChartProps) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="flex h-full min-h-[260px] items-center justify-center">
        <p className="border-l-2 border-line-strong py-1 pl-3 text-left text-[12px] leading-5 text-ink-faint">
          No tenant growth data available yet.
        </p>
      </div>
    );
  }

  const safeData = data.map((item) => ({
    month: item.month || 'Unknown',
    tenants: typeof item.tenants === 'number' ? item.tenants : Number(item.tenants) || 0,
  }));

  return (
    <div className="h-full min-h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={safeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="1 1" vertical={false} stroke="#ded7cb" />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#62665c' }}
            dy={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#62665c' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fbf9f5',
              borderRadius: '6px',
              border: '1px solid #ded7cb',
              color: '#20241f',
              fontSize: '12px',
            }}
            formatter={(value: any) => [Number(value), 'Tenants']}
          />
          <Bar dataKey="tenants" radius={[2, 2, 0, 0]} fill="#2f4a3c" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
