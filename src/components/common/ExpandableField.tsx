import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Copy, Maximize2, Check } from "lucide-react";

type Props = {
  k: string;
  v: ReactNode;
  raw?: string | number | boolean | null;
  detail?: ReactNode;     // optional rich detail panel
  source?: string;        // optional evidence / provenance string
};

export function ExpandableField({ k, v, raw, detail, source }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = raw !== undefined && raw !== null ? String(raw) : typeof v === "string" || typeof v === "number" ? String(v) : k;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { setCopied(false); }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group grid w-full grid-cols-2 gap-4 border-b border-border/60 py-1.5 text-left text-[13px] hover:bg-surface/60"
      >
        <div className="text-muted-foreground">{k}</div>
        <div className="mono flex items-center justify-between gap-2">
          <span className="truncate">{v}</span>
          <Maximize2 className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60" />
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl bg-background border-border">
          <DialogTitle className="text-[12px] uppercase tracking-wider text-muted-foreground">{k}</DialogTitle>
          <div className="mt-1 break-words text-[18px] mono font-semibold">{v}</div>
          {detail && <div className="mt-3 text-[13px] text-muted-foreground">{detail}</div>}
          {source && (
            <div className="mt-3 rounded border border-border bg-surface p-2 text-[12px] text-muted-foreground">
              <span className="text-foreground">source:</span> {source}
            </div>
          )}
          <div className="mt-3 flex items-center justify-end gap-2">
            <button onClick={copy} className="btn-ghost btn-sm">
              {copied ? <><Check className="h-3.5 w-3.5" /> copied</> : <><Copy className="h-3.5 w-3.5" /> copy value</>}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
