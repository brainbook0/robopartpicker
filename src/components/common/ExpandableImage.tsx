import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Maximize2, ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  src: string;
  alt: string;
  className?: string;
  thumbs?: string[]; // additional images for gallery navigation
  caption?: string;
};

export function ExpandableImage({ src, alt, className, thumbs = [], caption }: Props) {
  const all = [src, ...thumbs];
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const cur = all[idx] ?? src;

  return (
    <>
      <button
        type="button"
        onClick={() => { setIdx(0); setOpen(true); }}
        className={`group relative overflow-hidden rounded border border-border bg-surface ${className ?? ""}`}
        aria-label={`Expand ${alt}`}
      >
        <img src={src} alt={alt} className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" loading="lazy" />
        <span className="absolute right-1.5 top-1.5 rounded bg-background/80 px-1 py-0.5 text-[10px] text-foreground opacity-0 group-hover:opacity-100 flex items-center gap-1">
          <Maximize2 className="h-3 w-3" /> expand
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl p-0 bg-background border-border">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <div className="relative">
            <img src={cur} alt={alt} className="w-full max-h-[80vh] object-contain bg-black" />
            {all.length > 1 && (
              <>
                <button onClick={() => setIdx((idx - 1 + all.length) % all.length)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 hover:bg-background" aria-label="Previous"><ChevronLeft className="h-4 w-4" /></button>
                <button onClick={() => setIdx((idx + 1) % all.length)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 hover:bg-background" aria-label="Next"><ChevronRight className="h-4 w-4" /></button>
              </>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 p-3 border-t border-border">
            <div className="text-[12px] text-muted-foreground truncate">{caption ?? alt}</div>
            {all.length > 1 && (
              <div className="flex gap-1.5">
                {all.map((t, i) => (
                  <button key={i} onClick={() => setIdx(i)} className={`h-10 w-14 overflow-hidden rounded border ${i===idx?"border-primary":"border-border"}`}>
                    <img src={t} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}