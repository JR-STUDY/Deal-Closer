"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Label,
  Line,
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
  if (value === 0) return "0";
  return `${(value / 100_000_000).toFixed(1)}억`;
}

// ── 월별 문서·매출 추이 (막대 = 문서 수, 선 = 계약 매출) ──
const trendConfig = {
  count: { label: "문서 수", color: "#4f46e5" },
  revenue: { label: "계약 매출", color: "#10b981" },
} satisfies ChartConfig;

export type TrendPoint = { label: string; count: number; revenue: number };

export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ChartContainer config={trendConfig} className="aspect-auto h-[280px] w-full">
      <ComposedChart
        data={data}
        margin={{ top: 12, right: 12, left: 4, bottom: 0 }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          yAxisId="left"
          tickLine={false}
          axisLine={false}
          width={28}
          allowDecimals={false}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={toEok}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {trendConfig[name as keyof typeof trendConfig]?.label ??
                      name}
                  </span>
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {name === "revenue"
                      ? `₩${Number(value).toLocaleString("ko-KR")}`
                      : `${value}건`}
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar
          yAxisId="left"
          dataKey="count"
          fill="var(--color-count)"
          radius={[4, 4, 0, 0]}
          maxBarSize={40}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="revenue"
          stroke="var(--color-revenue)"
          strokeWidth={2.5}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ChartContainer>
  );
}

// ── 문서 상태 분포 (도넛) ──
const statusConfig = {
  count: { label: "문서" },
  DRAFT: { label: "초안", color: "#f59e0b" },
  SENT: { label: "발송완료", color: "#3b82f6" },
  COMPLETED: { label: "계약완료", color: "#10b981" },
} satisfies ChartConfig;

export type StatusSlice = { key: string; label: string; count: number };

const STATUS_FILL: Record<string, string> = {
  DRAFT: "#f59e0b",
  SENT: "#3b82f6",
  COMPLETED: "#10b981",
};

export function StatusChart({
  data,
  total,
}: {
  data: StatusSlice[];
  total: number;
}) {
  return (
    <ChartContainer
      config={statusConfig}
      className="mx-auto aspect-square h-[240px]"
    >
      <PieChart>
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent nameKey="label" hideLabel />}
        />
        <Pie
          data={data}
          dataKey="count"
          nameKey="label"
          innerRadius={60}
          outerRadius={90}
          strokeWidth={2}
          paddingAngle={2}
        >
          {data.map((d) => (
            <Cell key={d.key} fill={STATUS_FILL[d.key]} />
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
                    y={viewBox.cy}
                    className="fill-foreground text-3xl font-bold"
                  >
                    {total}
                  </tspan>
                  <tspan
                    x={viewBox.cx}
                    y={(viewBox.cy ?? 0) + 22}
                    className="fill-muted-foreground text-xs"
                  >
                    전체 문서
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

// ── 문서 종류 분포 (막대) ──
const typeConfig = {
  count: { label: "문서 수" },
} satisfies ChartConfig;

export type TypeBar = { label: string; count: number; fill: string };

export function TypeChart({ data }: { data: TypeBar[] }) {
  return (
    <ChartContainer config={typeConfig} className="aspect-auto h-[240px] w-full">
      <BarChart
        data={data}
        margin={{ top: 12, right: 12, left: 4, bottom: 0 }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={28}
          allowDecimals={false}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent hideLabel />}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={56}>
          {data.map((d) => (
            <Cell key={d.label} fill={d.fill} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
