import { ArrowDown, ArrowUp, Minus } from "lucide-react";
export const PriceDeltaPill = ({ pct }: { pct: number }) => {
  const sign = pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat";
  if (sign === "flat") return <span className="pill mono"><Minus className="h-3 w-3" /> 0.0%</span>;
  if (sign === "up") return <span className="pill pill-bad mono"><ArrowUp className="h-3 w-3" /> {pct.toFixed(1)}%</span>;
  return <span className="pill pill-good mono"><ArrowDown className="h-3 w-3" /> {Math.abs(pct).toFixed(1)}%</span>;
};
