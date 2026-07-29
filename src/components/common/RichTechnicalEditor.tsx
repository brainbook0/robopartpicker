import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type Ref } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bold, Code2, Eye, FileText, Fullscreen, Heading2, Italic, Link2, List, ListOrdered,
  MessageSquareQuote, Minus, Save, Table2, TextQuote, Users,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  maxLength?: number;
  minRows?: number;
  autosaveKey?: string;
  disabled?: boolean;
  className?: string;
  mono?: boolean;
};

type Edit = { before: string; after?: string; placeholder: string; linePrefix?: string };

export function RichTechnicalEditor({ value, onChange, label, placeholder, maxLength = 20_000, minRows = 8, autosaveKey, disabled, className, mono }: Props) {
  const inlineRef = useRef<HTMLTextAreaElement>(null);
  const fullscreenRef = useRef<HTMLTextAreaElement>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const [preview, setPreview] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!autosaveKey || value) return;
    const restored = localStorage.getItem(`rpp-draft:${autosaveKey}`);
    if (restored) onChange(restored.slice(0, maxLength));
  }, [autosaveKey, maxLength, onChange, value]);

  useEffect(() => {
    if (!autosaveKey) return;
    const timer = window.setTimeout(() => {
      if (value) localStorage.setItem(`rpp-draft:${autosaveKey}`, value);
      else localStorage.removeItem(`rpp-draft:${autosaveKey}`);
      setSavedAt(new Date());
    }, 600);
    return () => window.clearTimeout(timer);
  }, [autosaveKey, value]);

  const apply = useCallback((edit: Edit) => {
    const target = fullscreen ? fullscreenRef.current : inlineRef.current;
    if (!target || disabled) return;
    const start = target.selectionStart; const end = target.selectionEnd;
    const selected = value.slice(start, end) || edit.placeholder;
    let replacement: string; let selectionStart: number; let selectionEnd: number;
    if (edit.linePrefix) {
      const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      const blockEnd = value.indexOf("\n", end);
      const actualEnd = blockEnd < 0 ? value.length : blockEnd;
      const block = value.slice(lineStart, actualEnd) || edit.placeholder;
      replacement = block.split("\n").map((line, index) => edit.linePrefix!.replace("{n}", String(index + 1)) + line).join("\n");
      onChange((value.slice(0, lineStart) + replacement + value.slice(actualEnd)).slice(0, maxLength));
      selectionStart = lineStart; selectionEnd = lineStart + replacement.length;
    } else {
      replacement = `${edit.before}${selected}${edit.after ?? edit.before}`;
      onChange((value.slice(0, start) + replacement + value.slice(end)).slice(0, maxLength));
      selectionStart = start + edit.before.length; selectionEnd = selectionStart + selected.length;
    }
    window.setTimeout(() => { target.focus(); target.setSelectionRange(selectionStart, selectionEnd); }, 0);
  }, [disabled, fullscreen, maxLength, onChange, value]);

  const keyboard = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === "b") { event.preventDefault(); apply({ before: "**", placeholder: "bold text" }); }
    else if (key === "i") { event.preventDefault(); apply({ before: "_", placeholder: "italic text" }); }
    else if (key === "k") { event.preventDefault(); apply({ before: "[", after: "](https://)", placeholder: "link text" }); }
    else if (key === "enter" && event.shiftKey) { event.preventDefault(); setPreview((current) => !current); }
  };

  const editor = (ref: typeof inlineRef, expanded = false) => preview ? (
    <div className={cn("prose prose-sm max-w-none overflow-y-auto break-words rounded-b border-t border-border/60 bg-background p-4 dark:prose-invert", expanded ? "min-h-[55vh] max-h-[70vh]" : "min-h-48 max-h-[32rem]")}>
      {value.trim() ? <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
        a: ({ href, children }) => <a href={safeHref(href)} rel="noreferrer" target="_blank">{children}</a>,
        table: ({ children }) => <div className="overflow-x-auto"><table>{children}</table></div>,
      }}>{value}</ReactMarkdown> : <p className="text-muted-foreground">Nothing to preview yet.</p>}
    </div>
  ) : (
    <textarea ref={ref} aria-label={label} value={value} onChange={(event) => onChange(event.target.value.slice(0, maxLength))}
      onKeyDown={keyboard} maxLength={maxLength} rows={expanded ? Math.max(16, minRows) : minRows} disabled={disabled} placeholder={placeholder}
      className={cn("min-h-48 w-full resize-y scroll-mt-24 rounded-b bg-background p-3 text-[12px] leading-relaxed outline-none focus:ring-2 focus:ring-inset focus:ring-ring/40", expanded && "min-h-[55vh] max-h-[70vh]", mono && "font-mono", className)} />
  );

  const toolbar = (expanded = false) => (
    <div className="flex min-h-11 items-center gap-0.5 overflow-x-auto rounded-t border-b border-border/60 bg-muted/20 px-1.5 py-1 [scrollbar-width:thin]" role="toolbar" aria-label={`${label} formatting`}>
      <Tool icon={Eye} label={preview ? "Edit" : "Preview (Ctrl+Shift+Enter)"} active={preview} onClick={() => setPreview((current) => !current)} />
      <Tool icon={Fullscreen} label="Full screen" buttonRef={expanded ? undefined : fullscreenButtonRef} onClick={() => setFullscreen(true)} />
      <span className="mx-1 h-5 w-px shrink-0 bg-border" />
      <Tool icon={Bold} label="Bold (Ctrl+B)" onClick={() => apply({ before: "**", placeholder: "bold text" })} />
      <Tool icon={Italic} label="Italic (Ctrl+I)" onClick={() => apply({ before: "_", placeholder: "italic text" })} />
      <Tool icon={Heading2} label="Heading" onClick={() => apply({ before: "", placeholder: "Heading", linePrefix: "## " })} />
      <Tool icon={List} label="Bulleted list" onClick={() => apply({ before: "", placeholder: "List item", linePrefix: "- " })} />
      <Tool icon={ListOrdered} label="Numbered list" onClick={() => apply({ before: "", placeholder: "List item", linePrefix: "{n}. " })} />
      <Tool icon={Table2} label="Table" onClick={() => apply({ before: "", after: "", placeholder: "| Item | Value |\n| --- | --- |\n| Example | 1 |" })} />
      <Tool icon={Code2} label="Code block" onClick={() => apply({ before: "```\n", after: "\n```", placeholder: "code" })} />
      <Tool icon={Minus} label="Inline code" onClick={() => apply({ before: "`", placeholder: "code" })} />
      <Tool icon={TextQuote} label="Quote" onClick={() => apply({ before: "", placeholder: "Quoted evidence", linePrefix: "> " })} />
      <Tool icon={Link2} label="Link (Ctrl+K)" onClick={() => apply({ before: "[", after: "](https://)", placeholder: "link text" })} />
      <Tool icon={Users} label="Mention" onClick={() => apply({ before: "@", after: "", placeholder: "username" })} />
      <Tool icon={FileText} label="File reference" onClick={() => apply({ before: "[[file:", after: "]]", placeholder: "path/to/file" })} />
    </div>
  );

  return (
    <div className="space-y-1">
      <div className="overflow-hidden rounded border border-input focus-within:border-ring">
        {toolbar()}
        {editor(inlineRef)}
      </div>
      <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">{autosaveKey && <><Save className="h-3 w-3" /> {savedAt ? `Draft saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Autosave on"}</>}</span>
        <span className={value.length >= maxLength ? "text-negative" : ""}>{value.length.toLocaleString()} / {maxLength.toLocaleString()}</span>
      </div>
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); fullscreenButtonRef.current?.focus(); }} className="flex h-[min(92dvh,900px)] w-[min(96vw,1100px)] max-w-none flex-col overflow-hidden p-0">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle className="flex items-center gap-2"><MessageSquareQuote className="h-4 w-4" /> {label}</DialogTitle>
            <DialogDescription>Markdown editor. Raw HTML is ignored for safety.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="overflow-hidden rounded border border-input">{toolbar(true)}{editor(fullscreenRef, true)}</div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Tool({ icon: Icon, label, onClick, active, buttonRef }: { icon: typeof Bold; label: string; onClick: () => void; active?: boolean; buttonRef?: Ref<HTMLButtonElement> }) {
  return <button ref={buttonRef} type="button" title={label} aria-label={label} aria-pressed={active} onClick={onClick}
    className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:w-9", active && "bg-accent text-foreground")}>
    <Icon className="h-3.5 w-3.5" />
  </button>;
}

function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try { const url = new URL(href, window.location.origin); return ["http:", "https:", "mailto:"].includes(url.protocol) ? href : undefined; }
  catch { return undefined; }
}
