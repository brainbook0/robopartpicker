import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { useMemo } from "react";

const fmtUsd = (v: number) => {
  if (!isFinite(v)) return "—";
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 10_000) return `$${(v / 1_000).toFixed(1)}k`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(2)}k`;
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

const fmtDate = (s: string) => {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export const PriceChart = ({
  data,
  height = 220,
  showAvg = true,
}: {
  data: { date: string; price: number }[];
  height?: number;
  showAvg?: boolean;
}) => {
  const { domain, ticks, avg, latest, first } = useMemo(() => {
    const prices = data.map((d) => d.price).filter((n) => Number.isFinite(n));
    if (!prices.length) return { domain: [0, 1] as [number, number], ticks: [0], avg: 0, latest: 0, first: 0 };
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    // Pad domain so flat series still render a band; never collapse to one value.
    const range = max - min;
    const pad = range > 0 ? range * 0.15 : Math.max(max * 0.05, 1);
    const lo = Math.max(0, Math.floor((min - pad) * 100) / 100);
    const hi = Math.ceil((max + pad) * 100) / 100;
    // Build 5 evenly-spaced ticks rounded to a nice step.
    const step = (hi - lo) / 4;
    const ticks = Array.from({ length: 5 }, (_, i) => lo + step * i);
    const avg = prices.reduce((s, n) => s + n, 0) / prices.length;
    return { domain: [lo, hi] as [number, number], ticks, avg, latest: prices[prices.length - 1], first: prices[0] };
  }, [data]);

  const up = latest >= first;
  const stroke = up ? "hsl(var(--positive))" : "hsl(var(--negative))";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="px-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
          tickFormatter={fmtDate}
          axisLine={{ stroke: "hsl(var(--border))" }}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis
          domain={domain}
          ticks={ticks}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
          tickFormatter={fmtUsd}
          axisLine={{ stroke: "hsl(var(--border))" }}
          tickLine={false}
          width={56}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
            fontSize: 11,
            padding: "6px 8px",
          }}
          labelStyle={{ color: "hsl(var(--muted-foreground))", marginBottom: 2 }}
          labelFormatter={(l) => fmtDate(String(l))}
          formatter={(v: number) => [fmtUsd(v), "Price"]}
        />
        {showAvg && avg > 0 && (
          <ReferenceLine
            y={avg}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="3 3"
            strokeOpacity={0.6}
            label={{ value: `avg ${fmtUsd(avg)}`, position: "insideTopRight", fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
          />
        )}
        <Area type="monotone" dataKey="price" stroke={stroke} strokeWidth={1.75} fill="url(#px-fill)" dot={false} activeDot={{ r: 3 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
};
