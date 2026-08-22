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
import { formatKRW, formatNumber } from "@/lib/format";

/**
 * 대시보드 차트.
 *
 * 색은 **검증된 팔레트에서 고른 값**이고 라이트·다크 각각 지정한다(`theme` 로 넘기면
 * shadcn `ChartStyle` 이 `.dark` 선택자까지 만들어 준다). 프로젝트의 `--chart-*` 토큰은
 * nova preset 의 무채색이라 계열 구분에 쓸 수 없어 여기서 값을 준다.
 *
 * 지켜야 할 규칙 세 가지:
 *  ① **두 개의 y축을 한 그래프에 겹치지 않는다.** 문서 수(건)와 누적 매출(원)은 단위가 달라
 *     한 좌표계에 얹으면 두 축의 정렬이 임의로 결정되고, 있지도 않은 상관관계를 그림이
 *     주장한다. 위아래 두 판으로 나누고 x축(월)만 공유한다.
 *  ② **계열을 색으로만 구분하지 않는다** (ACC_*). 판마다 제목·단위·색 키를 함께 두고,
 *     도넛은 값 라벨(배지 + 건수 · 비중)이 옆에 붙는다 — 라이트 배경에서 3:1 미만인 색이
 *     있어 라벨이 필수다.
 *  ③ **눈금·격자는 배경에서 한 단계만 벗어난 실선**이고 값 서식은 `@/lib/format` 을 쓴다
 *     (₩·건 표기가 화면마다 갈리지 않게).
 */

/** 억 단위 축약 (예: 289000000 → "2.9억") — 원 단위 눈금은 자릿수가 넘쳐 읽히지 않는다 */
function toEok(value: number): string {
  if (value === 0) return "0";
  return `${(value / 100_000_000).toFixed(1)}`;
}

/** 축·격자 색 — 배경에서 한 단계 벗어난 실선 (점선은 "예측"으로 읽힌다) */
const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 11 } as const;
const GRID_STROKE = "var(--border)";

// ── 월별 문서 발행 · 누적 계약 매출 (한 x축을 공유하는 두 판) ──
const trendConfig = {
  count: {
    label: "문서 발행 수",
    theme: { light: "#2a78d6", dark: "#3987e5" },
  },
  cumulative: {
    label: "누적 계약 매출",
    theme: { light: "#1baf7a", dark: "#199e70" },
  },
} satisfies ChartConfig;

export type TrendPoint = {
  label: string;
  count: number;
  revenue: number;
  cumulative: number;
};

/** 판 제목 + 단위 + 색 키 — 계열 이름을 색 맞추기로 유추하게 하지 않는다 */
function PanelLegend({
  color,
  title,
  unit,
}: {
  color: string;
  title: string;
  unit: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <span
          aria-hidden
          className="inline-block h-0.5 w-3.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        {title}
      </span>
      <span className="text-xs text-muted-foreground">{unit}</span>
    </div>
  );
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <PanelLegend
          color="var(--color-cumulative)"
          title="누적 계약 매출"
          unit="단위: 억원"
        />
        <ChartContainer
          config={trendConfig}
          className="aspect-auto h-[168px] w-full"
        >
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="fillCumulative" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-cumulative)" stopOpacity={0.28} />
                <stop offset="95%" stopColor="var(--color-cumulative)" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={AXIS_TICK}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={34}
              tickMargin={4}
              tick={AXIS_TICK}
              tickFormatter={toEok}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => `${label} 누적`}
                  formatter={(value) => (
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground">누적 계약 매출</span>
                      <span className="font-mono font-medium text-foreground tabular-nums">
                        {formatKRW(Number(value))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke="var(--color-cumulative)"
              strokeWidth={2}
              strokeLinecap="round"
              fill="url(#fillCumulative)"
              dot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }}
            />
          </AreaChart>
        </ChartContainer>
      </div>

      <div className="space-y-1">
        <PanelLegend
          color="var(--color-count)"
          title="문서 발행 수"
          unit="단위: 건"
        />
        <ChartContainer
          config={trendConfig}
          className="aspect-auto h-[136px] w-full"
        >
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={AXIS_TICK}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={34}
              tickMargin={4}
              tick={AXIS_TICK}
              allowDecimals={false}
              tickFormatter={(value: number) => formatNumber(value)}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  formatter={(value) => (
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground">문서 발행 수</span>
                      <span className="font-mono font-medium text-foreground tabular-nums">
                        {formatNumber(Number(value))}건
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Bar
              dataKey="count"
              fill="var(--color-count)"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
            />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}

// ── 문서 상태 분포 (도넛) ──
/**
 * 초안 → 발송완료 → 계약완료는 문서가 지나는 순서지만, 색은 상태 배지(`StatusBadge`)와
 * 계열을 맞춘다 — 도넛 옆의 배지가 곧 범례이므로 둘의 색이 어긋나면 범례가 아니게 된다.
 */
const statusConfig = {
  count: { label: "문서" },
  DRAFT: { label: "초안", theme: { light: "#eda100", dark: "#c98500" } },
  SENT: { label: "발송완료", theme: { light: "#2a78d6", dark: "#3987e5" } },
  COMPLETED: { label: "계약완료", theme: { light: "#1baf7a", dark: "#199e70" } },
} satisfies ChartConfig;

export type StatusSlice = { key: string; label: string; count: number };

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
      className="mx-auto aspect-square h-[220px]"
    >
      <PieChart>
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              nameKey="label"
              hideLabel
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">{name}</span>
                  <span className="font-mono font-medium text-foreground tabular-nums">
                    {formatNumber(Number(value))}건
                  </span>
                </div>
              )}
            />
          }
        />
        <Pie
          data={data}
          dataKey="count"
          nameKey="label"
          innerRadius={58}
          outerRadius={88}
          paddingAngle={2}
          // 조각을 가르는 것은 테두리가 아니라 **배경색 틈**이다 (2px)
          stroke="var(--card)"
          strokeWidth={2}
        >
          {data.map((d) => (
            <Cell key={d.key} fill={`var(--color-${d.key})`} />
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
                    className="fill-foreground text-3xl font-semibold"
                  >
                    {formatNumber(total)}
                  </tspan>
                  <tspan
                    x={viewBox.cx}
                    y={(viewBox.cy ?? 0) + 22}
                    className="fill-muted-foreground text-xs"
                  >
                    전체 문서(건)
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
