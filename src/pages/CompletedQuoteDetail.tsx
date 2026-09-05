import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { completedQuotesApi } from "@/lib/api/completed-quotes";
import { toast } from "@/hooks/use-toast";

export default function CompletedQuoteDetail() {
  const { id = "" } = useParams();
  const [sending, setSending] = useState(false);
  const query = useQuery({ queryKey: ["completed-quote", id], queryFn: ({ signal }) => completedQuotesApi.get(id, signal), enabled: Boolean(id) });
  const draft = query.data?.item;

  const send = async () => {
    if (!draft) return;
    const unsent = draft.deliveries.filter((delivery) => delivery.status !== "sent").length;
    if (!confirm(`Send this completed quote separately to ${unsent} recipient${unsent === 1 ? "" : "s"}? Sent recipients will never be sent again by a retry.`)) return;
    setSending(true);
    try {
      const result = await completedQuotesApi.send(draft.id, draft.draftVersion);
      await query.refetch();
      toast({ title: result.item.status === "sent" ? "Completed quote sent" : "Delivery incomplete", description: deliverySummary(result.item.deliveries) });
    } catch (error) {
      toast({ title: "Could not send completed quote", description: error instanceof Error ? error.message : "Unexpected error.", variant: "destructive" });
    } finally { setSending(false); }
  };

  if (query.isLoading) return <div className="mx-auto max-w-[1100px] p-8 text-sm text-muted-foreground">Loading completed quote…</div>;
  if (query.error || !draft) return <div className="mx-auto max-w-[1100px] p-8 text-negative">{query.error?.message ?? "Completed quote not found."}</div>;
  const snapshot = draft.pricingSnapshot;
  const retryable = draft.deliveries.some((delivery) => delivery.status === "pending" || delivery.status === "failed");

  return <div className="mx-auto max-w-[1100px] px-4 py-6">
    <div className="mb-1 text-xs text-muted-foreground"><Link to={`/boms/${encodeURIComponent(draft.bomId)}`} className="hover:text-primary">BOM</Link> / completed quote</div>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{draft.subject}</h1><p className="mt-1 text-xs text-muted-foreground">Frozen from BOM version {snapshot.bomVersionId} at {formatDate(snapshot.generatedAt)}.</p></div><span className={`pill ${draft.status === "sent" ? "pill-good" : draft.status === "invalidated" || draft.status === "failed" ? "pill-yellow" : ""}`}>{draft.status}</span></div>

    <section className="surface-card mt-4 p-4"><div className="section-title">Recipients</div><div className="mt-2 grid gap-2 sm:grid-cols-2">{draft.deliveries.map((delivery) => <div key={delivery.id} className="flex items-center justify-between rounded border border-border p-2 text-xs"><span>{delivery.recipient}</span><span className={`pill ${delivery.status === "sent" ? "pill-good" : delivery.status === "failed" ? "pill-yellow" : ""}`}>{delivery.status}</span></div>)}</div><p className="mt-3 text-xs text-muted-foreground">Each recipient receives a separate message. No recipient can see another address.</p></section>

    <section className="surface-card mt-4 overflow-hidden"><div className="border-b border-border p-4"><div className="section-title">Email preview</div><p className="mt-2 whitespace-pre-wrap text-sm">{draft.introduction}</p></div><div className="overflow-x-auto"><table className="data-table min-w-[800px]"><thead><tr><th>Item</th><th className="text-right">Quantity</th><th className="text-right">Unit price</th><th className="text-right">Line total</th><th>Price observed</th></tr></thead><tbody>{snapshot.lines.map((line) => <tr key={line.bomItemId}><td>{line.description}<div className="text-[10px] text-muted-foreground mono">{line.evidenceLocator}</div></td><td className="text-right mono">{line.quantity} {line.unit}</td><td className="text-right mono">{money(line.unitPriceMinor, snapshot.currency)}</td><td className="text-right mono font-semibold">{money(line.extendedPriceMinor, snapshot.currency)}</td><td className="text-xs mono">{formatDate(line.observedAt)}</td></tr>)}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4"><div className="text-xs text-muted-foreground">Shipping and tax are excluded. Prices are internal observations, not proof of fulfillment.</div><div className="text-right"><div className="section-title">Subtotal</div><div className="mono text-xl font-bold">{money(snapshot.subtotalMinor, snapshot.currency)}</div></div></div></section>

    <section className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-primary/30 bg-primary/5 p-4"><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-5 w-5 text-primary" /><div><div className="font-semibold">Second confirmation required</div><p className="mt-1 text-xs text-muted-foreground">The server rechecks the BOM version and every price before sending. Changed or stale data invalidates this draft.</p>{!draft.emailDeliveryConfigured && <p className="mt-1 text-xs text-negative">Email delivery is not configured in this environment.</p>}</div></div>{draft.status === "sent" ? <div className="inline-flex items-center gap-1 text-sm text-positive"><CheckCircle2 className="h-4 w-4" /> Sent</div> : <button disabled={sending || !draft.emailDeliveryConfigured || !retryable || draft.status === "invalidated"} onClick={() => void send()} className="btn-primary inline-flex items-center gap-1">{retryable && draft.deliveries.some((delivery) => delivery.status === "failed") ? <RefreshCw className="h-4 w-4" /> : <Mail className="h-4 w-4" />} {sending ? "Sending…" : draft.deliveries.some((delivery) => delivery.status === "failed") ? "Retry failed recipients" : "Confirm and send"}</button>}</section>
  </div>;
}

function money(value: number, currency: string): string { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value / 100); }
function formatDate(value: string): string { const time = Date.parse(value); return Number.isFinite(time) ? new Date(time).toLocaleString() : value; }
function deliverySummary(deliveries: Array<{ status: string }>): string { const sent = deliveries.filter((delivery) => delivery.status === "sent").length; return `${sent}/${deliveries.length} recipient deliveries completed.`; }
