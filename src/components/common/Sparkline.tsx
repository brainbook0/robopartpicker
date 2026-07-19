type Pt = { date: string; price: number };
export const Sparkline = ({ data, width = 96, height = 24 }: { data: Pt[]; width?: number; height?: number }) => {
  if (!data.length) return null;
  const ps = data.map(d => d.price);
  const min = Math.min(...ps), max = Math.max(...ps);
  const r = max - min || 1;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((d.price - min) / r) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const up = ps[ps.length - 1] >= ps[0];
  return (
    <svg width={width} height={height} className="block">
      <polyline points={pts} fill="none" strokeWidth="1.5"
        stroke={`hsl(var(--${up ? "negative" : "positive"}))`} />
    </svg>
  );
};
