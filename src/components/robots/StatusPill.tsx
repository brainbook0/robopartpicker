import type { Robot } from "@/data/robots";
const map: Record<Robot["status"], { label: string; cls: string }> = {
  shipping:    { label: "Shipping",    cls: "pill pill-up" },
  preorder:    { label: "Preorder",    cls: "pill pill-accent" },
  research:    { label: "Research",    cls: "pill pill-warn" },
  discontinued:{ label: "Discontinued",cls: "pill pill-down" },
};
export const StatusPill = ({ status }: { status: Robot["status"] }) => {
  const m = map[status];
  return <span className={m.cls}>{m.label}</span>;
};
