import { useEffect, useState } from "react";
import { CheckCircle2, Download, PackageCheck, Send, ShieldCheck, XCircle } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { rfqApi, type RfqLine, type RfqRequest } from "@/lib/api/rfq";
import { isRfqTerminal, transitionRfq, type RfqAction } from "@/shared/rfq";

const labels: Record<RfqRequest["status"], string> = {
  estimate_ready: "Estimate captured",
  quote_requested: "Quote requested",
  supplier_requests_prepared: "Supplier packages prepared",
  requests_sent: "Requests marked sent",
  partial_quotes_received: "Partial quotes received",
  quotes_reconciled: "Quotes reconciled",
  user_review_required: "User review required",
  option_selected: "Option selected",
  expired: "Expired",
  cancelled: "Cancelled",
};

export default function QuoteDetail() {
  const { id = "" } = useParams();
  const [request, setRequest] = useState<RfqRequest | null>(null);
  const [lines, setLines] = useState<RfqLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const result = await rfqApi.get(id);
    setRequest(result.item); setLines(result.lines);
  };
  useEffect(() => { refresh().catch((reason) => setError(reason instanceof Error ? reason.message : "Quote request unavailable.")).finally(() => setLoading(false)); }, [id]);

  const act = async (action: RfqAction) => {
    if (!request) return;
    if (action === "send" && !confirm("Only continue if you manually delivered the prepared RFQ packages outside RoboPartPicker. No email or supplier API will be called by this action.")) return;
    setBusy(true);
    try { setRequest((await rfqApi.transition(request.id, action)).item); toast({ title: labels[transitionRfq(request.status, action) ?? request.status] }); }
    catch (reason) { toast({ title: "Transition failed", description: reason instanceof Error ? reason.message : "Unexpected error.", variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!request || !confirm("Cancel this quote workflow?")) return;
    setBusy(true);
    try { setRequest((await rfqApi.cancel(request.id)).item); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="mx-auto max-w-[1200px] p-8 text-sm text-muted-foreground">Loading quote workflow…</div>;
  if (error || !request) return <div className="mx-auto max-w-[1200px] p-8 text-sm text-negative">{error ?? "Quote request not found."}</div>;
  const next = nextAction(request.status);

  return <div className="mx-auto max-w-[1200px] px-4 py-6">
    <div className="mb-2 text-xs text-muted-foreground">Firm supplier quote workflow</div>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Quote request</h1><p className="mt-1 text-xs text-muted-foreground mono">{request.id}</p></div>
      <div className="flex gap-2"><button onClick={() => downloadPackage(request, lines)} className="btn-ghost btn-sm"><Download className="h-3.5 w-3.5" /> RFQ package</button>{request.projectId && <Link to="/projects" className="btn-ghost btn-sm">Projects</Link>}</div>
    </div>

    <section className="surface-card mt-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="section-title">Current state</div><div className="mt-1 flex items-center gap-2 text-lg font-semibold"><PackageCheck className="h-5 w-5 text-primary" /> {labels[request.status]}</div></div><span className={`pill ${request.status === "option_selected" ? "pill-good" : request.status === "cancelled" || request.status === "expired" ? "pill-yellow" : ""}`}>{request.status}</span></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3"><Kpi label="Estimated parts" value={money(request.totalEstimateMinor)} /><Kpi label="Lines" value={String(lines.length)} /><Kpi label="Unpriced or excluded" value={String(lines.filter((line) => line.isExcluded).length)} /></div>
      <div className="mt-4 border border-warning/30 bg-warning/5 p-3 text-xs leading-5 text-muted-foreground"><strong className="text-foreground">Outbound automation status:</strong> coming soon. RoboPartPicker can prepare packages and reconcile quotes, but it does not send email or call supplier APIs unless a delivery provider is configured. “Mark manually sent” records only your external action.</div>
      {!isRfqTerminal(request.status) && <div className="mt-4 flex flex-wrap gap-2">{next && <button disabled={busy} onClick={() => void act(next.action)} className="btn-primary btn-sm">{next.icon === "send" ? <Send className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />} {next.label}</button>}<button disabled={busy} onClick={() => void cancel()} className="btn-ghost btn-sm text-destructive"><XCircle className="h-3.5 w-3.5" /> Cancel</button></div>}
      {request.status === "option_selected" && <div className="mt-4 flex items-center gap-2 text-xs text-positive"><ShieldCheck className="h-4 w-4" /> The user explicitly approved the reconciled option. This is still not proof of payment or order placement.</div>}
    </section>

    <section className="surface-card mt-4 overflow-x-auto"><table className="data-table min-w-[900px]"><thead><tr><th>Line</th><th className="text-right">Qty</th><th className="text-right">Estimate unit</th><th className="text-right">Quoted unit</th><th>Supplier / SKU</th><th className="text-right">Lead time</th><th>Status</th></tr></thead><tbody>{lines.map((line) => <tr key={line.id}><td><div className="font-medium">{line.description}</div><div className="text-[10px] text-muted-foreground mono">{line.lineKey}</div></td><td className="text-right mono">{line.quantity}</td><td className="text-right mono">{money(line.estimateUnitPriceMinor)}</td><td className="text-right mono">{money(line.quoteUnitPriceMinor, line.quoteCurrency)}</td><td>{line.supplierId ?? "—"}{line.supplierSku && <div className="text-[10px] text-muted-foreground">{line.supplierSku}</div>}</td><td className="text-right mono">{line.leadTimeDays == null ? "—" : `${line.leadTimeDays}d`}</td><td>{line.isExcluded ? <span className="pill pill-yellow">unpriced/excluded</span> : line.isSubstitute ? <span className="pill pill-yellow">substitute</span> : <span className="pill pill-good">exact/selected</span>}</td></tr>)}</tbody></table></section>
  </div>;
}

function nextAction(status: RfqRequest["status"]): { action: RfqAction; label: string; icon?: "send" } | null {
  switch (status) {
    case "estimate_ready": return { action: "request", label: "Start quote request" };
    case "quote_requested": return { action: "prepare", label: "Prepare supplier packages" };
    case "supplier_requests_prepared": return { action: "send", label: "Mark manually sent", icon: "send" };
    case "quotes_reconciled": return { action: "review", label: "Review reconciled quotes" };
    case "user_review_required": return { action: "approve", label: "Approve selected option" };
    default: return null;
  }
}
function Kpi({ label, value }: { label: string; value: string }) { return <div className="rounded border border-border p-2"><div className="section-title">{label}</div><div className="mt-1 mono font-semibold">{value}</div></div>; }
function money(value: number | null, currency = "USD") { return value == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: currency ?? "USD" }).format(value / 100); }
function downloadPackage(request: RfqRequest, lines: RfqLine[]) { const blob = new Blob([JSON.stringify({ request, lines, warning: "Prepared RFQ only. No supplier was contacted by this download." }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `robopartpicker-rfq-${request.id}.json`; anchor.click(); URL.revokeObjectURL(url); }
