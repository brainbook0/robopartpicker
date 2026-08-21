import { Link } from "react-router-dom";
import { Boxes } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Honest unavailable/coming-soon state for a production-facing surface whose
 *  real (non-demo) data is not yet available. Renders no fake prices, stock,
 *  ratings, imagery, or marketplace activity. */
export function ComingSoon({
  icon: Icon = Boxes,
  kicker = "Unavailable",
  title,
  body,
  actionLabel,
  actionTo,
}: {
  icon?: LucideIcon;
  kicker?: string;
  title: string;
  body: string;
  actionLabel?: string;
  actionTo?: string;
}) {
  return (
    <section role="status" className="surface-card overflow-hidden">
      <div className="grid place-items-center gap-3 px-6 py-12 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" aria-hidden />
        </div>
        <div>
          <div className="section-title">{kicker}</div>
          <h2 className="mt-1 text-lg font-bold tracking-tight">{title}</h2>
          <p className="mx-auto mt-2 max-w-xl text-[13px] leading-6 text-muted-foreground">{body}</p>
        </div>
        {actionLabel && actionTo && <Link to={actionTo} className="btn-primary">{actionLabel}</Link>}
      </div>
    </section>
  );
}