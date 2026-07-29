import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock3, GitMerge, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { dataReviewApi, type ReviewDetail } from "@/lib/api/imports";

export function DataReviewPanel() {
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decision, setDecision] = useState<"create" | "merge">("create");
  const [canonicalEntityId, setCanonicalEntityId] = useState("");
  const [reason, setReason] = useState("");
  const [reviewAfter, setReviewAfter] = useState("");
  const [selectedClaims, setSelectedClaims] = useState<string[]>([]);
  const [conflictType, setConflictType] = useState("reported_value_disagreement");
  const queue = useQuery({
    queryKey: ["data-review-queue"],
    queryFn: ({ signal }) => dataReviewApi.list("pending", signal),
    retry: false,
  });
  const canPreview = decision === "create" || canonicalEntityId.trim().length > 0;
  const detail = useQuery({
    queryKey: ["data-review-detail", selectedId, decision, canonicalEntityId.trim()],
    queryFn: ({ signal }) => dataReviewApi.detail(selectedId!, {
      decision,
      canonicalEntityId: decision === "merge" ? canonicalEntityId.trim() : null,
    }, signal),
    enabled: Boolean(selectedId && canPreview),
    retry: false,
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["data-review-queue"] }),
      client.invalidateQueries({ queryKey: ["data-review-detail"] }),
    ]);
  };
  const action = useMutation({
    mutationFn: async (kind: "approve" | "reject" | "defer" | "conflict") => {
      if (!selectedId || !detail.data) throw new Error("Select a review record first.");
      if (kind === "approve") {
        return dataReviewApi.approve(selectedId, {
          decision,
          canonicalEntityId: decision === "merge" ? canonicalEntityId.trim() : null,
          expectedDiffHash: detail.data.proposedMutation.hash,
        });
      }
      if (!reason.trim()) throw new Error("A review reason is required.");
      if (kind === "reject") return dataReviewApi.reject(selectedId, reason.trim());
      if (kind === "defer") {
        return dataReviewApi.defer(
          selectedId,
          reason.trim(),
          reviewAfter ? new Date(reviewAfter).toISOString() : null,
        );
      }
      if (selectedClaims.length < 2) throw new Error("Select at least two conflicting claims.");
      return dataReviewApi.recordConflict(selectedId, selectedClaims, conflictType);
    },
    onSuccess: async () => {
      setReason("");
      setSelectedClaims([]);
      await refresh();
    },
  });

  if (queue.isLoading) {
    return <ReviewState><Loader2 className="h-4 w-4 animate-spin" /> Loading the data-review queue…</ReviewState>;
  }
  if (queue.error instanceof ApiError && [401, 403].includes(queue.error.status)) {
    return <ReviewState><ShieldCheck className="h-4 w-4" /> Data review is available to platform moderators and administrators.</ReviewState>;
  }
  if (queue.error) {
    return <ReviewState tone="negative"><AlertTriangle className="h-4 w-4" /> {message(queue.error)}</ReviewState>;
  }
  const items = queue.data?.items ?? [];
  const canMutate = detail.data?.permissions.canMutate ?? queue.data?.permissions.canMutate ?? false;

  return <section className="surface-card mt-5 overflow-hidden" aria-label="External data review">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
      <div>
        <div className="section-title">External data trust gate</div>
        <h2 className="text-sm font-semibold">Claim-level review queue</h2>
      </div>
      <span className="badge-neutral">{items.length} pending</span>
    </div>
    {items.length === 0
      ? <div className="p-6 text-center text-xs text-muted-foreground">No staged or review-ready records.</div>
      : <div className="grid min-h-[440px] lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="max-h-[70vh] overflow-y-auto border-b border-border lg:border-b-0 lg:border-r">
          {items.map((item) => <button
            key={item.id}
            type="button"
            onClick={() => {
              setSelectedId(item.id);
              setDecision("create");
              setCanonicalEntityId("");
              setSelectedClaims([]);
            }}
            className={`block w-full border-b border-border p-3 text-left hover:bg-muted/50 ${selectedId === item.id ? "bg-primary/5" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium">{item.parsedData.name ? String(item.parsedData.name) : item.external_record_id}</span>
              <span className="badge-neutral">{item.record_type}</span>
            </div>
            <div className="mt-1 truncate text-[10px] text-muted-foreground">{item.source_name} · {item.status}</div>
            <div className="mt-1 truncate font-mono text-[9px] text-muted-foreground">{item.trace_id ?? "legacy trace unavailable"}</div>
          </button>)}
        </div>
        <div className="min-w-0 p-3 sm:p-4">
          {!selectedId && <ReviewState><ShieldCheck className="h-4 w-4" /> Select a record to inspect evidence and the exact proposed mutation.</ReviewState>}
          {selectedId && !canPreview && <ReviewState><GitMerge className="h-4 w-4" /> Enter a canonical entity ID to preview this merge.</ReviewState>}
          {detail.isLoading && <ReviewState><Loader2 className="h-4 w-4 animate-spin" /> Loading provenance…</ReviewState>}
          {detail.error && <ReviewState tone="negative"><AlertTriangle className="h-4 w-4" /> {message(detail.error)}</ReviewState>}
          {detail.data && <ReviewDetailView
            detail={detail.data}
            decision={decision}
            setDecision={setDecision}
            canonicalEntityId={canonicalEntityId}
            setCanonicalEntityId={setCanonicalEntityId}
            reason={reason}
            setReason={setReason}
            reviewAfter={reviewAfter}
            setReviewAfter={setReviewAfter}
            selectedClaims={selectedClaims}
            setSelectedClaims={setSelectedClaims}
            conflictType={conflictType}
            setConflictType={setConflictType}
            canMutate={canMutate}
            busy={action.isPending}
            actionError={action.error}
            act={(kind) => action.mutate(kind)}
          />}
        </div>
      </div>}
  </section>;
}

function ReviewDetailView(props: {
  detail: ReviewDetail;
  decision: "create" | "merge";
  setDecision(value: "create" | "merge"): void;
  canonicalEntityId: string;
  setCanonicalEntityId(value: string): void;
  reason: string;
  setReason(value: string): void;
  reviewAfter: string;
  setReviewAfter(value: string): void;
  selectedClaims: string[];
  setSelectedClaims(value: string[]): void;
  conflictType: string;
  setConflictType(value: string): void;
  canMutate: boolean;
  busy: boolean;
  actionError: Error | null;
  act(kind: "approve" | "reject" | "defer" | "conflict"): void;
}) {
  const { detail } = props;
  const groupedClaims = useMemo(() => {
    const values = new Map<string, ReviewDetail["claims"]>();
    for (const claim of detail.claims) values.set(claim.claimKey, [...(values.get(claim.claimKey) ?? []), claim]);
    return [...values.entries()];
  }, [detail.claims]);
  const stale = props.actionError instanceof ApiError && props.actionError.code === "STALE_REVIEW_DIFF";
  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-base font-semibold">{String(detail.record.parsedData.name ?? detail.record.externalRecordId)}</h3>
        <p className="text-[10px] text-muted-foreground">{detail.record.sourceName} · revision-aware {detail.record.schemaVersion}</p>
      </div>
      <span className="badge-neutral">{detail.record.reviewState}</span>
    </div>
    <dl className="grid gap-2 rounded border border-border p-3 text-[10px] sm:grid-cols-2">
      <Fact label="Trace" value={detail.record.traceId ?? "legacy trace unavailable"} mono />
      <Fact label="Source record" value={detail.record.externalRecordId} mono />
      <Fact label="Source URL" value={detail.record.sourceUrl ?? "not supplied"} />
      <Fact label="Confidence" value={`${Math.round(detail.record.confidence * 100)}%`} />
    </dl>

    <section>
      <h4 className="mb-2 text-xs font-semibold">Field claims</h4>
      <div className="space-y-2">{groupedClaims.map(([key, claims]) => <article key={key} className="rounded border border-border p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[10px]">{key}</span>
          {claims.length > 1 && <span className="text-[10px] text-caution">{claims.length} values</span>}
        </div>
        {claims.map((claim) => <label key={claim.id} className="flex min-h-10 items-start gap-2 border-t border-border py-2 first:border-t-0">
          <input
            type="checkbox"
            aria-label={`Select claim ${claim.id}`}
            checked={props.selectedClaims.includes(claim.id)}
            onChange={(event) => props.setSelectedClaims(event.target.checked
              ? [...props.selectedClaims, claim.id]
              : props.selectedClaims.filter((id) => id !== claim.id))}
            className="mt-1"
          />
          <span className="min-w-0 flex-1 text-[11px]">
            <span className="font-medium">{formatValue(claim.normalizedValue)} {claim.unit ?? ""}</span>
            <span className={`ml-2 ${claim.aiInferred ? "text-caution" : "text-muted-foreground"}`}>{claim.classification.replaceAll("_", " ")}</span>
            <span className="mt-1 block break-all text-[9px] text-muted-foreground">{claim.evidenceLocator}</span>
          </span>
        </label>)}
      </article>)}</div>
    </section>

    <section>
      <h4 className="mb-2 text-xs font-semibold">Evidence and source policy</h4>
      <div className="grid gap-2 sm:grid-cols-2">{detail.evidence.map((item) => <article key={item.id} className="rounded border border-border p-3 text-[10px]">
        <div className="font-medium">{item.sourceClass} · {item.detectedMediaType ?? "unknown media"}</div>
        <div className="mt-1 text-muted-foreground">{item.applicableRevision ?? "revision unknown"} · {item.retentionState}</div>
        <div className="mt-1">robots {item.policy.robotsStatus} · terms {item.policy.termsStatus} · reuse {item.policy.reuseStatus}</div>
        <a href={item.immutableExternalUrl ?? item.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-primary underline">Open attributed source</a>
      </article>)}</div>
      {detail.previews.map((preview) => <details key={preview.kind} className="mt-2 rounded border border-border p-3">
        <summary className="cursor-pointer text-[10px] font-medium">Bounded raw preview {preview.truncated ? "· truncated" : ""}</summary>
        <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-all text-[9px] text-muted-foreground">{preview.text}</pre>
        <p className="mt-2 text-[9px] text-muted-foreground">{preview.byteSize.toLocaleString()} of {preview.originalByteSize.toLocaleString()} UTF-8 bytes shown</p>
      </details>)}
    </section>

    <section className="rounded border border-primary/30 bg-primary/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold">Exact proposed mutation</h4>
        <span className="font-mono text-[9px]">{detail.proposedMutation.hash.slice(0, 12)}…</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[10px]">Decision<select value={props.decision} onChange={(event) => props.setDecision(event.target.value as "create" | "merge")} className="input-bare mt-1 min-h-10 w-full"><option value="create">Create canonical record</option><option value="merge">Merge into existing</option></select></label>
        <label className="text-[10px]">Canonical entity ID<input value={props.canonicalEntityId} disabled={props.decision === "create"} onChange={(event) => props.setCanonicalEntityId(event.target.value)} className="input-bare mt-1 min-h-10 w-full font-mono" placeholder="Required for merge" /></label>
      </div>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-background p-2 text-[9px]">{JSON.stringify(detail.proposedMutation.diff, null, 2)}</pre>
    </section>

    {!props.canMutate && <ReviewState><ShieldCheck className="h-4 w-4" /> Moderator access is read-only; an administrator must make review decisions.</ReviewState>}
    {props.canMutate && <section className="space-y-2 rounded border border-border p-3">
      <label className="block text-[10px]">Decision reason<textarea value={props.reason} onChange={(event) => props.setReason(event.target.value)} maxLength={2_000} className="input-bare mt-1 min-h-20 w-full" placeholder="Required for reject, defer, or conflict" /></label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[10px]">Review after<input type="datetime-local" value={props.reviewAfter} onChange={(event) => props.setReviewAfter(event.target.value)} className="input-bare mt-1 min-h-10 w-full" /></label>
        <label className="text-[10px]">Conflict type<input value={props.conflictType} onChange={(event) => props.setConflictType(event.target.value.replace(/[^a-z0-9_]/gu, "_"))} className="input-bare mt-1 min-h-10 w-full font-mono" /></label>
      </div>
      {props.actionError && <div role="alert" className="rounded border border-negative/30 bg-negative/5 p-2 text-[10px] text-negative">{stale ? "The review changed after this diff was displayed. Refresh before approving." : message(props.actionError)}</div>}
      <div className="flex flex-wrap gap-2">
        <button disabled={props.busy} onClick={() => props.act("approve")} className="btn-primary btn-sm min-h-10"><CheckCircle2 className="h-4 w-4" /> Approve displayed diff</button>
        <button disabled={props.busy || !props.reason.trim()} onClick={() => props.act("reject")} className="btn-ghost btn-sm min-h-10 text-negative"><XCircle className="h-4 w-4" /> Reject</button>
        <button disabled={props.busy || !props.reason.trim()} onClick={() => props.act("defer")} className="btn-ghost btn-sm min-h-10"><Clock3 className="h-4 w-4" /> Defer</button>
        <button disabled={props.busy || !props.reason.trim() || props.selectedClaims.length < 2} onClick={() => props.act("conflict")} className="btn-ghost btn-sm min-h-10"><AlertTriangle className="h-4 w-4" /> Record conflict</button>
      </div>
    </section>}
  </div>;
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className={`${mono ? "font-mono" : ""} break-all`}>{value}</dd></div>;
}

function ReviewState({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "negative" }) {
  return <div className={`flex min-h-24 items-center justify-center gap-2 p-4 text-center text-xs ${tone === "negative" ? "text-negative" : "text-muted-foreground"}`}>{children}</div>;
}

function formatValue(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected review error.";
}
