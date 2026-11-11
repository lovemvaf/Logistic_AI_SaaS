'use client';

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

export interface MRRChartProps {
  data?: { month: string; amount: number }[];
}

export function MRRChart({ data }: MRRChartProps) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="flex h-full min-h-[260px] items-center justify-center">
        <p className="border-l-2 border-line-strong py-1 pl-3 text-left text-[12px] leading-5 text-ink-faint">
          No MRR data available yet.
        </p>
      </div>
    );
  }

  const safeData = data.map((item) => ({
    month: item.month || 'Unknown',
    amount: typeof item.amount === 'number' ? item.amount : Number(item.amount) || 0,
  }));

  if (safeData.every((item) => item.amount === 0)) {
    return (
      <div className="flex h-full min-h-[260px] items-center justify-center">
        <p className="border-l-2 border-line-strong py-1 pl-3 text-left text-[12px] leading-5 text-ink-faint">
          No revenue recorded yet.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={safeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorMrr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2f4a3c" stopOpacity={0.16} />
              <stop offset="95%" stopColor="#2f4a3c" stopOpacity={0} />
            </linearGradient>
          </defs>
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
            tickFormatter={(value) => `$${Number(value) > 0 ? (Number(value) / 1000).toFixed(1) : 0}k`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fbf9f5',
              borderRadius: '6px',
              border: '1px solid #ded7cb',
              color: '#20241f',
              fontSize: '12px',
            }}
            formatter={(value: any) => [`$${Number(value).toLocaleString()}`, 'MRR']}
          />
          <Area
            type="monotone"
            dataKey="amount"
            stroke="#2f4a3c"
            strokeWidth={1.5}
            fillOpacity={1}
            fill="url(#colorMrr)"
            activeDot={{ r: 3, strokeWidth: 0, fill: '#2f4a3c' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
