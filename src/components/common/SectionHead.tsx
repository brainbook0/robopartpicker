import { Link } from "react-router-dom";
export const SectionHead = ({ title, href, kicker }: { title: string; href?: string; kicker?: string }) => (
  <div className="flex items-end justify-between mb-3">
    <div>
      {kicker && <div className="section-title">{kicker}</div>}
      <h2 className="text-[18px] font-semibold tracking-tight">{title}</h2>
    </div>
    {href && <Link to={href} className="text-[12px] font-medium text-muted-foreground hover:text-primary">View all →</Link>}
  </div>
);
