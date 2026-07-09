"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

/** 억 단위 축약 (예: 289000000 → "2.9억") */
function toEok(value: number): string {
  if (!value) return "0";
  return `${(value / 100_000_000).toFixed(1)}억`;
}

function krw(value: unknown): string {
  return `₩${Number(value).toLocaleString("ko-KR")}`;
}

// ── 월별 계약 매출 추이 (영역) ──
const trendConfig = {
  revenue: { label: "계약 매출", color: "#10b981" },
} satisfies ChartConfig;

export type RevenuePoint = { label: string; revenue: number };

export function RevenueTrendChart({ data }: { data: RevenuePoint[] }) {
  return (
    <ChartContainer config={trendConfig} className="aspect-auto h-[280px] w-full">
      <AreaChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.4} />
            <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={toEok}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">계약 매출</span>
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {krw(value)}
                  </span>
                </div>
              )}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="var(--color-revenue)"
          strokeWidth={2.5}
          fill="url(#fillRevenue)"
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ChartContainer>
  );
}

// ── 담당자별 계약 매출 (가로 막대) ──
const repConfig = {
  revenue: { label: "계약 매출", color: "#4f46e5" },
} satisfies ChartConfig;

export type RepPoint = { name: string; revenue: number };

export function RepRevenueChart({ data }: { data: RepPoint[] }) {
  return (
    <ChartContainer config={repConfig} className="aspect-auto h-[240px] w-full">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
      >
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={toEok} />
        <YAxis
          type="category"
          dataKey="name"
          tickLine={false}
          axisLine={false}
          width={64}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {item?.payload?.name}
                  </span>
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {krw(value)}
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar
          dataKey="revenue"
          fill="var(--color-revenue)"
          radius={[0, 4, 4, 0]}
          maxBarSize={36}
        />
      </BarChart>
    </ChartContainer>
  );
}

// ── 문서 종류별 매출 구성 (도넛) ──
const typeConfig = {
  revenue: { label: "계약 매출" },
} satisfies ChartConfig;

export type TypeRevenueSlice = {
  key: string;
  label: string;
  revenue: number;
  fill: string;
};

export function TypeRevenueChart({
  data,
  total,
}: {
  data: TypeRevenueSlice[];
  total: number;
}) {
  return (
    <ChartContainer
      config={typeConfig}
      className="mx-auto aspect-square h-[240px]"
    >
      <PieChart>
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              nameKey="label"
              hideLabel
              formatter={(value, _name, item) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {item?.payload?.label}
                  </span>
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {krw(value)}
                  </span>
                </div>
              )}
            />
          }
        />
        <Pie
          data={data}
          dataKey="revenue"
          nameKey="label"
          innerRadius={60}
          outerRadius={90}
          strokeWidth={2}
          paddingAngle={2}
        >
          {data.map((d) => (
            <Cell key={d.key} fill={d.fill} />
          ))}
          <Label
            content={({ viewBox }) => {
              if (!viewBox || !("cx" in viewBox)) return null;
              return (
                <text
                  x={viewBox.cx}
                  y={viewBox.cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  <tspan
                    x={viewBox.cx}
                    y={(viewBox.cy ?? 0) - 6}
                    className="fill-foreground text-xl font-bold"
                  >
                    {toEok(total)}
                  </tspan>
                  <tspan
                    x={viewBox.cx}
                    y={(viewBox.cy ?? 0) + 16}
                    className="fill-muted-foreground text-xs"
                  >
                    총 계약 매출
                  </tspan>
                </text>
              );
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
