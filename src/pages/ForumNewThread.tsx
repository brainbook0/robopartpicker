import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  listCategories, slugify, type ForumCategory,
  THREAD_TYPES, threadTypeLabel, threadTypeHint,
  RELATED_ENTITY_TYPES, type RelatedEntityType, relatedEntityLabel,
  type ThreadType, resolveRelated, type ResolvedRelated,
  isInternalPath, normalizeTags, type ForumThreadInsert, createThread,
} from "@/lib/forum";
import { useComponents, useSuppliers } from "@/lib/api/catalog";
import { listPublicProjects } from "@/lib/projects";
import { useMarketplace } from "@/lib/api/marketplace";
import { toast } from "@/hooks/use-toast";
import { Info } from "lucide-react";
import { AiFormDraft } from "@/components/ai/AiFormDraft";

type FieldDef = { key: string; label: string; placeholder?: string; multiline?: boolean };

const structuredFields: Record<ThreadType, FieldDef[]> = {
  question: [
    { key: "system_context", label: "System / context", placeholder: "Hardware, firmware, protocol, revisions" },
    { key: "expected", label: "Expected behavior" },
    { key: "observed", label: "Observed behavior", multiline: true },
    { key: "attempts", label: "Attempts so far", multiline: true },
    { key: "evidence_ref", label: "Logs / evidence reference" },
  ],
  build_log: [
    { key: "project_version", label: "Project / version", placeholder: "name @ vX.Y.Z" },
    { key: "milestone", label: "Milestone" },
    { key: "completed", label: "Completed work", multiline: true },
    { key: "blockers", label: "Blockers", multiline: true },
    { key: "measurements", label: "Measurements (with units)", multiline: true },
  ],
  integration_report: [
    { key: "entities", label: "Entities / revisions", multiline: true },
    { key: "mech", label: "Mechanical requirements", multiline: true },
    { key: "elec", label: "Electrical requirements", multiline: true },
    { key: "sw", label: "Software requirements", multiline: true },
    { key: "result", label: "Result" },
    { key: "limitations", label: "Limitations", multiline: true },
    { key: "evidence_ref", label: "Evidence reference" },
  ],
  substitution_report: [
    { key: "original", label: "Original item (MPN, rev)" },
    { key: "replacement", label: "Replacement item (MPN, rev)" },
    { key: "adaptations", label: "Adaptations", multiline: true },
    { key: "result", label: "Result" },
    { key: "failure_modes", label: "Failure modes / side effects", multiline: true },
    { key: "evidence_ref", label: "Evidence reference" },
  ],
  bom_correction: [
    { key: "project_version", label: "Project / version" },
    { key: "incorrect", label: "Incorrect item", multiline: true },
    { key: "corrected", label: "Corrected item / quantity", multiline: true },
    { key: "source", label: "Source" },
  ],
  supplier_report: [
    { key: "supplier", label: "Supplier" },
    { key: "region", label: "Region", placeholder: "US / EU / CN / JP / KR / Global" },
    { key: "ordered_item", label: "Ordered item" },
    { key: "quoted_lead", label: "Quoted lead time (days)" },
    { key: "actual_lead", label: "Actual lead time (days)" },
    { key: "outcome", label: "Outcome" },
    { key: "evidence_ref", label: "Evidence reference" },
  ],
  teardown: [
    { key: "device_version", label: "Robot / device / version" },
    { key: "components", label: "Identified components", multiline: true },
    { key: "confidence", label: "Confidence (0–100 with notes)" },
    { key: "source", label: "Source" },
  ],
  measured_test: [
    { key: "dut", label: "Component / configuration" },
    { key: "methodology", label: "Methodology", multiline: true },
    { key: "conditions", label: "Conditions (V, load, ambient)", multiline: true },
    { key: "instruments", label: "Instruments (model, calibration)", multiline: true },
    { key: "measurements", label: "Measurements (values + units)", multiline: true },
    { key: "repeatability", label: "Repeatability" },
    { key: "source", label: "Source" },
  ],
  discussion: [
    { key: "context", label: "Context", multiline: true },
    { key: "decision", label: "Decision / trade-off" },
    { key: "question", label: "Concrete question" },
  ],
  project_update: [
    { key: "project_version", label: "Project / version" },
    { key: "context", label: "Context", multiline: true },
    { key: "decision", label: "Decision / trade-off" },
    { key: "compat", label: "Compatibility impact" },
  ],
};

const tagSuggestions: Record<ThreadType, string[]> = {
  question: ["diagnostic", "help", "spec"],
  build_log: ["milestone", "in-progress"],
  integration_report: ["integration", "hardware-test"],
  substitution_report: ["substitution", "drop-in"],
  bom_correction: ["bom", "correction"],
  supplier_report: ["supplier", "lead-time"],
  teardown: ["teardown", "inference"],
  measured_test: ["measurement", "bench-test"],
  discussion: ["design", "trade-off"],
  project_update: ["release", "compat"],
};

export default function ForumNewThread() {
  const componentQuery = useComponents({ limit: 100 });
  const supplierQuery = useSuppliers();
  const marketplaceQuery = useMarketplace({ type: "sell" });
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [cats, setCats] = useState<ForumCategory[]>([]);
  // Deep-link params: sanitize before use so the FK insert can't receive junk.
  const spTypeRaw = sp.get("type");
  const spType = (THREAD_TYPES as readonly string[]).includes(spTypeRaw ?? "")
    ? (spTypeRaw as ThreadType)
    : "discussion";
  const spRelatedRaw = sp.get("relatedType");
  const spRelated: RelatedEntityType | "" =
    (RELATED_ENTITY_TYPES as readonly string[]).includes(spRelatedRaw ?? "")
      ? (spRelatedRaw as RelatedEntityType)
      : "";

  const [categoryId, setCategoryId] = useState<string>("");
  const [threadType, setThreadType] = useState<ThreadType>(spType);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);

  const [relatedType, setRelatedType] = useState<RelatedEntityType | "">(spRelated);
  const [relatedId, setRelatedId] = useState<string>(sp.get("relatedId") ?? "");
  const [relatedSearch, setRelatedSearch] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string; slug: string; version: string }[]>([]);
  const [resolved, setResolved] = useState<ResolvedRelated | null>(null);

  const [linkedLabel, setLinkedLabel] = useState(sp.get("entityLabel") ?? "");
  const [linkedPath, setLinkedPath] = useState(sp.get("entityPath") ?? "");

  const [structuredValues, setStructuredValues] = useState<Record<string, string>>({});
  const setSV = (k: string, v: string) => setStructuredValues(prev => ({ ...prev, [k]: v }));

  useEffect(() => {
    if (!loading && !user) nav("/auth", { state: { from: `/community/new${window.location.search}` } });
  }, [loading, user, nav]);

  useEffect(() => {
    listCategories().then(c => {
      setCats(c);
      // Resolve the ?category= deep-link as either id or slug, otherwise pick
      // the first category. This prevents a stray value from reaching the FK.
      const raw = sp.get("category");
      const match = raw ? c.find(x => x.id === raw || x.slug === raw) : null;
      setCategoryId(match?.id ?? c[0]?.id ?? "");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (relatedType === "project") {
      listPublicProjects().then((items) => setProjects(items.map(({ id, name, slug, version }) => ({ id, name, slug, version }))));
    }
  }, [relatedType]);

  useEffect(() => {
    if (!relatedType || !relatedId) { setResolved(null); return; }
    let alive = true;
    resolveRelated(relatedType, relatedId).then(r => { if (alive) setResolved(r); });
    return () => { alive = false; };
  }, [relatedType, relatedId]);

  const relatedOptions = useMemo(() => {
    const s = relatedSearch.trim().toLowerCase();
    if (relatedType === "component") {
      return (componentQuery.data?.items ?? []).filter(p => !s || p.name.toLowerCase().includes(s) || p.maker.toLowerCase().includes(s)).slice(0, 40)
        .map(p => ({ id: p.id, label: p.name, sub: `${p.maker} · ${p.category}` }));
    }
    if (relatedType === "marketplace_listing") {
      return (marketplaceQuery.data?.items ?? []).filter((listing) => !s || listing.title.toLowerCase().includes(s)).slice(0, 40)
        .map((listing) => ({ id: listing.id, label: listing.title, sub: `${listing.conditionGrade ?? "n/a"} · ${listing.price == null ? "quote" : `$${listing.price.toLocaleString()}`}` }));
    }
    if (relatedType === "project") {
      return projects.filter(p => !s || p.name.toLowerCase().includes(s)).slice(0, 40)
        .map(p => ({ id: p.id, label: p.name, sub: `v${p.version}` }));
    }
    if (relatedType === "supplier") {
      return (supplierQuery.data?.items ?? []).filter(sp2 => !s || sp2.name.toLowerCase().includes(s)).slice(0, 40)
        .map(sp2 => ({ id: sp2.id, label: sp2.name, sub: `${sp2.region} · ${sp2.categories.join(", ")}` }));
    }
    return [];
  }, [relatedType, relatedSearch, projects, componentQuery.data?.items, supplierQuery.data?.items, marketplaceQuery.data?.items]);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (title.trim().length < 8) e.title = "Title should be at least 8 characters.";
    if (title.length > 140) e.title = "Title must be 140 characters or fewer.";
    if (body.trim().length < 20) e.body = "Body should be at least 20 characters.";
    if (!categoryId) e.category = "Choose a category.";
    if (!threadType) e.type = "Choose a thread type.";
    if (relatedType && !relatedId) e.related = "Select a specific object or clear the related type.";
    if (!relatedType && relatedId) e.related = "Choose the related type for this ID.";
    if (relatedType && relatedId && resolved && !resolved.ok) e.related = "The chosen related object could not be resolved.";
    if (linkedPath.trim() && !isInternalPath(linkedPath.trim())) {
      e.linked = "Linked path must be an internal path starting with / (no // or external URLs).";
    }
    if (linkedLabel.trim() && !linkedPath.trim()) {
      e.linked = "Add an internal path or remove the label.";
    }
    return e;
  }, [title, body, categoryId, threadType, relatedType, relatedId, resolved, linkedLabel, linkedPath]);

  const fields = structuredFields[threadType] ?? [];
  const filledCount = fields.filter(f => (structuredValues[f.key] ?? "").trim()).length;
  const suggestions = tagSuggestions[threadType] ?? [];

  const addTag = (t: string) => {
    const merged = normalizeTags(`${tags}, ${t}`);
    setTags(merged.join(", "));
  };

  const applyAiDraft = (draft: Record<string, unknown>) => {
    if (typeof draft.title === "string") setTitle(draft.title);
    if (typeof draft.body === "string") setBody(draft.body);
    if (Array.isArray(draft.tags)) setTags(normalizeTags(draft.tags.filter((item): item is string => typeof item === "string").join(", ")).join(", "));
    if (typeof draft.threadType === "string" && (THREAD_TYPES as readonly string[]).includes(draft.threadType)) setThreadType(draft.threadType as ThreadType);
    if (typeof draft.structuredValues === "object" && draft.structuredValues !== null && !Array.isArray(draft.structuredValues)) {
      const values = Object.fromEntries(Object.entries(draft.structuredValues).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
      setStructuredValues((current) => ({ ...current, ...values }));
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (Object.keys(errors).length) {
      toast({ title: "Please fix errors", description: Object.values(errors)[0], variant: "destructive" });
      return;
    }
    setBusy(true);
    const cleanTags = normalizeTags(tags);
    const structured: Record<string, unknown> = {};
    for (const f of fields) {
      const v = (structuredValues[f.key] ?? "").trim();
      if (v) structured[f.key] = v;
    }
    const payload: ForumThreadInsert = {
      user_id: user.id,
      category_id: categoryId,
      title: title.trim(),
      slug: slugify(title) + "-" + Math.random().toString(36).slice(2, 6),
      body: body.trim(),
      tags: cleanTags,
      thread_type: threadType,
      status: "open",
      related_entity_type: relatedType || null,
      related_entity_id: relatedType ? relatedId : null,
      linked_entity_label: linkedLabel.trim() || null,
      linked_entity_path: linkedPath.trim() || null,
      structured_data: structured as ForumThreadInsert["structured_data"],
    };
    try {
      const created = await createThread(payload);
      nav(`/community/t/${created.id}`);
    } catch (error) {
      toast({ title: "Could not create", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6">
      <div className="text-[12px] text-muted-foreground mb-1"><Link to="/community" className="hover:text-primary">Forum</Link> / new thread</div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-[20px] font-bold tracking-tight">Start a new discussion</h1>
        <AiFormDraft
          form="community_thread"
          current={{ threadType, title, body, tags: normalizeTags(tags), structuredValues }}
          onApply={applyAiDraft}
          hint="Paste rough notes, logs, measurements, or a question. The assistant will structure them without inventing evidence."
        />
      </div>

      <form onSubmit={onSubmit} className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        <div className="surface-card p-4 space-y-3">
          <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <legend className="sr-only">Classification</legend>
            <div>
              <label className="text-[11px] text-muted-foreground" htmlFor="category">Category</label>
              <select id="category" value={categoryId} onChange={e => setCategoryId(e.target.value)} className="input-bare mt-0.5">
                {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.category && <div className="text-[10.5px] text-destructive mt-0.5">{errors.category}</div>}
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground" htmlFor="ttype">Thread type</label>
              <select id="ttype" value={threadType} onChange={e => setThreadType(e.target.value as ThreadType)} className="input-bare mt-0.5">
                {THREAD_TYPES.map(t => <option key={t} value={t}>{threadTypeLabel[t]}</option>)}
              </select>
              {errors.type && <div className="text-[10.5px] text-destructive mt-0.5">{errors.type}</div>}
            </div>
          </fieldset>

          <div className="rounded border border-border/60 bg-muted/30 p-2 text-[11.5px] text-muted-foreground flex gap-2">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
            <div className="flex-1">{threadTypeHint[threadType]}</div>
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground" htmlFor="title">Title</label>
            <input id="title" className="input-bare mt-0.5" value={title} onChange={e => setTitle(e.target.value)} maxLength={140} placeholder="A clear, specific question or topic" />
            <div className="flex items-center justify-between">
              {errors.title ? <div className="text-[10.5px] text-destructive mt-0.5">{errors.title}</div> : <span />}
              <div className="text-[10px] text-muted-foreground mono">{title.length}/140</div>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground" htmlFor="body">Body (required)</label>
            <textarea id="body" className="w-full min-h-56 rounded border border-input bg-background p-2 text-[13px] outline-none focus:ring-1 focus:ring-ring/40 focus:border-ring mt-0.5 font-mono" value={body} onChange={e => setBody(e.target.value)} placeholder="Context, what you've tried, what you're optimizing for…" />
            <div className="flex items-center justify-between">
              {errors.body
                ? <div className="text-[10.5px] text-destructive mt-0.5">{errors.body}</div>
                : <div className="text-[10.5px] text-muted-foreground mt-0.5">Plain text with preserved line breaks. Markdown syntax is not rendered.</div>}
              <div className="text-[10px] text-muted-foreground mono">{body.length} chars</div>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground" htmlFor="tags">Tags (comma-separated, up to 6)</label>
            <input id="tags" className="input-bare mt-0.5" value={tags} onChange={e => setTags(e.target.value)} placeholder="bldc, harmonic-drive, ros2" />
            {suggestions.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1 items-center">
                <span className="text-[10.5px] text-muted-foreground">Suggested:</span>
                {suggestions.map(t => (
                  <button key={t} type="button" onClick={() => addTag(t)} className="pill text-[10.5px] hover:bg-primary/10">#{t}</button>
                ))}
              </div>
            )}
          </div>

          {fields.length > 0 && (
            <fieldset className="border border-border/60 rounded p-2">
              <legend className="px-1 text-[11px] text-muted-foreground">
                Structured report fields — {filledCount}/{fields.length} filled (optional, improves signal)
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {fields.map(f => (
                  <div key={f.key} className={f.multiline ? "sm:col-span-2" : ""}>
                    <label className="text-[10.5px] text-muted-foreground" htmlFor={`sf-${f.key}`}>{f.label}</label>
                    {f.multiline ? (
                      <textarea id={`sf-${f.key}`} rows={2}
                        value={structuredValues[f.key] ?? ""}
                        onChange={e => setSV(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        className="w-full rounded border border-input bg-background p-1.5 text-[12px] font-mono outline-none focus:ring-1 focus:ring-ring/40" />
                    ) : (
                      <input id={`sf-${f.key}`}
                        value={structuredValues[f.key] ?? ""}
                        onChange={e => setSV(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        className="input-bare" />
                    )}
                  </div>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="border border-border/60 rounded p-2">
            <legend className="px-1 text-[11px] text-muted-foreground">Related object (optional)</legend>
            <div className="flex flex-wrap gap-2 items-center">
              <select value={relatedType} onChange={e => { setRelatedType(e.target.value as RelatedEntityType | ""); setRelatedId(""); setRelatedSearch(""); }}
                aria-label="Related object type"
                className="h-7 rounded border border-input bg-background px-1.5 text-[12px]">
                <option value="">— none —</option>
                {RELATED_ENTITY_TYPES.map(t => (
                  <option key={t} value={t} disabled={t === "build"}>
                    {relatedEntityLabel[t]}{t === "build" ? " (unavailable)" : ""}
                  </option>
                ))}
              </select>
              {relatedType && relatedType !== "build" && (
                <input value={relatedSearch} onChange={e => setRelatedSearch(e.target.value)} placeholder="Search…" className="input-bare max-w-[240px]" />
              )}
            </div>
            {relatedType && relatedType !== "build" && (
              <div className="mt-2 max-h-40 overflow-auto border border-border/60 rounded">
                {relatedOptions.length === 0 && <div className="p-2 text-[11px] text-muted-foreground">No matches.</div>}
                <ul>
                  {relatedOptions.map(o => (
                    <li key={o.id}>
                      <button type="button" onClick={() => setRelatedId(o.id)}
                        className={`w-full text-left px-2 py-1 text-[12px] hover:bg-muted ${relatedId === o.id ? "bg-primary/10" : ""}`}>
                        <div className="font-medium truncate">{o.label}</div>
                        <div className="text-[10.5px] text-muted-foreground truncate">{o.sub}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {errors.related && <div className="text-[10.5px] text-destructive mt-1">{errors.related}</div>}
          </fieldset>

          <fieldset className="border border-border/60 rounded p-2">
            <legend className="px-1 text-[11px] text-muted-foreground">
              Internal link (optional — for integration threads or generic internal pages; no canonical integration table yet, so label honestly)
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-2">
              <input value={linkedLabel} onChange={e => setLinkedLabel(e.target.value)}
                placeholder="Label (e.g. Assembly Guide)" className="input-bare" aria-label="Linked label" />
              <input value={linkedPath} onChange={e => setLinkedPath(e.target.value)}
                placeholder="/projects/my-arm or /parts/actuators/foo" className="input-bare mono" aria-label="Linked internal path" />
            </div>
            <div className="text-[10.5px] text-muted-foreground mt-1">
              Must be an internal path starting with <span className="mono">/</span>. Protocol-relative (<span className="mono">//…</span>) and external URLs are rejected.
            </div>
            {errors.linked && <div className="text-[10.5px] text-destructive mt-1">{errors.linked}</div>}
          </fieldset>

          <div className="flex items-center justify-end gap-2">
            <Link to="/community" className="btn-ghost">Cancel</Link>
            <button disabled={busy || Object.keys(errors).length > 0} className="btn-primary disabled:opacity-50">{busy ? "Posting…" : "Post thread"}</button>
          </div>
        </div>

        <aside className="surface-card p-3 h-max sticky top-4">
          <div className="section-title mb-2">Preview</div>
          <div className="text-[11px] text-muted-foreground mb-1">
            {threadTypeLabel[threadType]}
            {relatedType && resolved ? ` · linked to ${relatedEntityLabel[relatedType]}` : ""}
          </div>
          <div className="font-semibold text-[13px] mb-1 break-words">{title || "Untitled thread"}</div>
          {resolved && resolved.ok && (
            <div className="text-[11px] mb-1"><span className="text-muted-foreground">Related:</span> <span className="mono">{resolved.label}</span></div>
          )}
          {fields.length > 0 && (
            <div className="text-[10.5px] text-muted-foreground mb-1">
              Structured fields: <span className="mono">{filledCount}/{fields.length}</span>
              {filledCount < fields.length && <span> · some detail missing</span>}
            </div>
          )}
          <pre className="whitespace-pre-wrap font-sans text-[12px] text-muted-foreground max-h-64 overflow-auto">{body || "Body preview will appear here."}</pre>
          <div className="mt-2 text-[10.5px] text-muted-foreground">
            Technical claims posted here are individual contributions — check against primary documentation before acting on them.
          </div>
        </aside>
      </form>
    </div>
  );
}
