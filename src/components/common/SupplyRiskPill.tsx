export const SupplyRiskPill = ({ leadDays, suppliers }: { leadDays: number; suppliers: number }) => {
  if (suppliers >= 2 && leadDays <= 14) return <span className="pill pill-good">low risk</span>;
  if (suppliers >= 1 && leadDays <= 30) return <span className="pill pill-warn">med risk</span>;
  return <span className="pill pill-bad">high risk</span>;
};
