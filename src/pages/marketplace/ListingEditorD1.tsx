import { useEffect, useMemo, useState } from "react";
import { useLocation, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ImagePlus, Save, Send, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useComponents } from "@/lib/api/catalog";
import { buildsApi } from "@/lib/api/builds";
import { attachFile, uploadFile } from "@/lib/api/files";
import { marketplaceApi, useMarketplaceListing } from "@/lib/api/marketplace";
import type { MarketplaceListing, MarketplaceListingInput } from "@/shared/marketplace";
import { AiNarrativeComposer } from "@/components/ai/AiNarrativeComposer";
import { SubmissionQualityCard } from "@/components/ai/SubmissionQualityCard";
import { reviewSubmission, type SubmissionQualityReview } from "@/lib/assistant";

const grades: NonNullable<MarketplaceListing["conditionGrade"]>[] = ["A", "B", "C", "untested", "for_parts", "not_applicable"];

export default function ListingEditorD1() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [search] = useSearchParams();
  const draftId = search.get("draft") ?? undefined;
  const existing = useMarketplaceListing(draftId);
  const components = useComponents({ limit: 100 });
  const builds = useQuery({ queryKey: ["builds", "marketplace-source"], queryFn: ({ signal }) => buildsApi.list(true, signal), enabled: Boolean(user) });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [componentId, setComponentId] = useState("");
  const [sourceBuildId, setSourceBuildId] = useState("");
  const [category, setCategory] = useState("robot");
  const [grade, setGrade] = useState<MarketplaceListing["conditionGrade"]>("B");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [region, setRegion] = useState("US");
  const [runtimeHours, setRuntimeHours] = useState("");
  const [provenance, setProvenance] = useState("");
  const [testReport, setTestReport] = useState(false);
  const [video, setVideo] = useState(false);
  const [returns, setReturns] = useState(false);
  const [serial, setSerial] = useState(false);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [qualityReview, setQualityReview] = useState<SubmissionQualityReview | null>(null);
  const [reviewedFingerprint, setReviewedFingerprint] = useState<string | null>(null);
  const [reviewUnavailable, setReviewUnavailable] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && !user) navigate("/auth", { replace: true, state: { from: `/marketplace/new${location.search}` } }); }, [loading, location.search, navigate, user]);
  useEffect(() => {
    const item = existing.data?.item;
    if (!item || item.listingType !== "sell") return;
    setTitle(item.title); setDescription(item.description); setComponentId(item.sourceComponentId ?? ""); setSourceBuildId(item.sourceBuildId ?? ""); setCategory(item.category);
    setGrade(item.conditionGrade); setPrice(item.price == null ? "" : String(item.price)); setQuantity(String(item.quantity)); setRegion(item.region ?? "Global");
    setRuntimeHours(item.details.runtimeHours == null ? "" : String(item.details.runtimeHours)); setProvenance(item.details.provenanceText ?? "");
    setTestReport(item.details.sellerDeclaresTestReport); setVideo(item.details.sellerDeclaresVideo); setReturns(item.details.sellerAcceptsReturns); setSerial(item.details.serialAvailable);
  }, [existing.data?.item]);

  const selectedComponent = components.data?.items.find((component) => component.id === componentId);
  const selectedComponentCategory = selectedComponent?.category;
  useEffect(() => { if (selectedComponentCategory) setCategory(selectedComponentCategory); }, [selectedComponentCategory]);
  const sourceBuild = useQuery({ queryKey: ["build", sourceBuildId], queryFn: ({ signal }) => buildsApi.get(sourceBuildId, signal), enabled: Boolean(sourceBuildId) });
  const manuallyPricedItems = sourceBuild.data?.item.items.filter((item) => item.unitCostMinor != null) ?? [];
  const draftPartsCost = sourceBuild.data && manuallyPricedItems.length > 0
    ? manuallyPricedItems.reduce((sum, item) => sum + (item.unitCostMinor ?? 0) * item.quantity, 0) / 100
    : null;
  const partsCost = existing.data?.item.sourceBuildId === sourceBuildId ? existing.data.item.partsCost : draftPartsCost;
  const partsCurrency = existing.data?.item.sourceBuildId === sourceBuildId
    ? existing.data.item.partsCostCurrency ?? "USD"
    : sourceBuild.data?.item.currency ?? "USD";
  const partsCoverage = existing.data?.item.sourceBuildId === sourceBuildId
    ? `${existing.data.item.partsCostPricedItems}/${existing.data.item.partsCostTotalItems} lines priced`
    : sourceBuild.data ? `${sourceBuild.data.item.items.filter((item) => item.unitCostMinor != null).length}/${sourceBuild.data.item.items.length} lines manually priced` : null;

  const errors = useMemo(() => {
    const output: string[] = [];
    if (title.trim().length < 4) output.push("Title must be at least 4 characters.");
    if (description.trim().length < 20) output.push("Tell buyers at least 20 characters about the item.");
    if (!price.trim() || !Number.isFinite(Number(price)) || Number(price) < 0) output.push("Price must be a non-negative number.");
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) output.push("Quantity must be greater than zero.");
    if (runtimeHours && (!/^\d+$/u.test(runtimeHours) || Number(runtimeHours) < 0)) output.push("Runtime must be a non-negative whole number.");
    if (grade === "untested" && testReport) output.push("An untested listing cannot declare a test report.");
    return output;
  }, [description, grade, price, quantity, runtimeHours, testReport, title]);

  const input = (): MarketplaceListingInput => ({
    listingType: "sell", title: title.trim(), description: description.trim(), category, conditionGrade: grade,
    currency: "USD", price: Number(price), quantity: Number(quantity), region, visibility: "private",
    sourceBuildId: sourceBuildId || null, sourceComponentId: componentId || null,
    runtimeHours: runtimeHours ? Number(runtimeHours) : null, provenanceText: provenance.trim() || null,
    sellerDeclaresTestReport: testReport, sellerDeclaresVideo: video, sellerAcceptsReturns: returns, serialAvailable: serial,
  });

  const applyAiDraft = (draft: Record<string, unknown>) => {
    if (typeof draft.title === "string") setTitle(draft.title);
    if (typeof draft.description === "string") setDescription(draft.description);
    if (typeof draft.category === "string") setCategory(draft.category);
    if (typeof draft.conditionGrade === "string" && grades.includes(draft.conditionGrade as NonNullable<MarketplaceListing["conditionGrade"]>)) setGrade(draft.conditionGrade as MarketplaceListing["conditionGrade"]);
    if (typeof draft.price === "number" && Number.isFinite(draft.price)) setPrice(String(draft.price));
    if (typeof draft.quantity === "number" && Number.isFinite(draft.quantity)) setQuantity(String(draft.quantity));
    if (typeof draft.region === "string" && ["US", "EU", "CN", "JP", "KR", "Global"].includes(draft.region)) setRegion(draft.region);
    if (typeof draft.runtimeHours === "number" && Number.isInteger(draft.runtimeHours)) setRuntimeHours(String(draft.runtimeHours));
    if (typeof draft.provenance === "string") setProvenance(draft.provenance);
  };

  const fingerprint = useMemo(() => JSON.stringify({ title, description, category, grade, price, quantity, region, runtimeHours, provenance, testReport, video, returns, serial, sourceBuildId, componentId }), [title, description, category, grade, price, quantity, region, runtimeHours, provenance, testReport, video, returns, serial, sourceBuildId, componentId]);

  const persist = async (publish: boolean) => {
    if (errors.length) { toast.error(errors[0]); return; }
    if (publish && reviewedFingerprint !== fingerprint && !reviewUnavailable) {
      setBusy(true);
      try {
        const review = await reviewSubmission("marketplace_listing", description.trim(), { ...input(), imageCount: (existing.data?.item.images.length ?? 0) + pendingImages.length, partsCost, partsCoverage });
        setQualityReview(review); setReviewedFingerprint(fingerprint);
        toast.info(review.decision === "meets_standard" ? "Quality review passed. Review it, then publish." : "Quality review found suggested changes. Review them before publishing.");
      } catch (error) {
        setReviewUnavailable(true);
        toast.error("AI quality review is unavailable", { description: `${error instanceof Error ? error.message : String(error)} You may retry or explicitly publish on the next click.` });
      } finally { setBusy(false); }
      return;
    }
    setBusy(true);
    try {
      let saved = existing.data?.item
        ? (await marketplaceApi.update(existing.data.item.id, existing.data.item.version, input())).item
        : (await marketplaceApi.create(input())).item;
      for (const image of pendingImages) {
        const uploaded = await uploadFile(image, "image", "private");
        await attachFile(uploaded.fileId, { entityType: "marketplace_listing", entityId: saved.id, purpose: "media", altText: `${saved.title} listing image` });
      }
      setPendingImages([]);
      if (publish) saved = (await marketplaceApi.status(saved.id, "published")).item;
      toast.success(publish ? "Listing published" : "Private draft saved", { description: publish ? "The listing and its evidence disclosures are now visible." : "Continue editing the narrative, images, and technical details." });
      navigate(publish ? `/marketplace/${saved.slug}` : `/marketplace/new?draft=${saved.id}`, { replace: true });
      if (!publish) await existing.refetch();
    } catch (error) { toast.error("Listing could not be saved", { description: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(false); }
  };

  const removeImage = async (fileId: string) => {
    const item = existing.data?.item;
    if (!item) return;
    setBusy(true);
    try { await marketplaceApi.removeImage(item.id, fileId); await existing.refetch(); toast.success("Listing image removed"); }
    catch (error) { toast.error("Image could not be removed", { description: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(false); }
  };

  if (!user) return null;
  if (draftId && existing.isPending) return <div className="p-8" role="status">Loading draft…</div>;
  if (draftId && (existing.isError || !existing.data?.item)) return <div className="p-8 text-negative" role="alert">Draft could not be loaded.</div>;
  if (draftId && existing.data.item.listingType !== "sell") return <div className="p-8 text-negative" role="alert">This draft is a {existing.data.item.listingType} record. Open it from the matching Marketplace editor.</div>;

  return <main className="mx-auto max-w-[1080px] px-4 py-6">
    <div className="text-[12px] text-muted-foreground"><Link to="/marketplace" className="hover:text-primary">Marketplace</Link> / {draftId ? "edit draft" : "new listing"}</div>
    <h1 className="mt-1 text-[22px] font-bold tracking-tight">{draftId ? "Edit listing draft" : "Tell the story of what you are selling"}</h1>
    <p className="mt-1 text-[12px] text-muted-foreground">Start naturally. The assistant can organize your facts into a technical listing, but you control the final wording and every evidence declaration.</p>
    <div className="surface-card mt-3 flex gap-2 border-warning/30 bg-warning/5 p-2 text-[11.5px] text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" /> RoboPartPicker does not verify identity, serial numbers, payment, escrow, shipping, or inspection. Seller declarations remain clearly labeled.</div>

    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void persist(false); }}>
        <AiNarrativeComposer form="marketplace_listing" value={description} onChange={setDescription} current={{ title, description, category, conditionGrade: grade, price, quantity, region, runtimeHours, provenance }} onApply={applyAiDraft} title="Describe the item in your own words" hint="Include what it is, exact model or revision, what is included, condition, defects, history, evidence, location, delivery constraints, and asking price. The assistant only organizes facts you provide." placeholder="Example: I’m selling my completed 12-DOF research robot after one semester of lab use…" rows={9} />

        <section className="surface-card p-4 space-y-3">
          <div className="section-title">Buyer-facing essentials</div>
          <Field label="Listing title"><input className="input-bare" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Specific robot, kit, component, or fabricated assembly" /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Asking price (USD)"><input type="number" min="0" step="0.01" className="input-bare mono" value={price} onChange={(event) => setPrice(event.target.value)} /></Field><Field label="Quantity"><input type="number" min="0.001" step="any" className="input-bare mono" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></Field></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Category"><input className="input-bare" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="robot, kit, actuator, fabrication…" /></Field><Field label="Condition"><select className="input-bare" value={grade ?? "not_applicable"} onChange={(event) => setGrade(event.target.value as MarketplaceListing["conditionGrade"])}>{grades.map((value) => <option key={value} value={value}>{conditionLabel(value)}</option>)}</select></Field></div>
        </section>

        <section className="surface-card p-4">
          <div className="flex items-start justify-between gap-3"><div><div className="section-title">Images</div><p className="mt-1 text-[11px] text-muted-foreground">Upload up to 12 validated PNG, JPEG, WebP, or GIF images. The first image becomes the marketplace card cover.</p></div><label className="btn-primary btn-sm cursor-pointer"><ImagePlus className="h-3.5 w-3.5" /> Add images<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="sr-only" disabled={busy} onChange={(event) => { const selected = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; const total = (existing.data?.item.images.length ?? 0) + pendingImages.length + selected.length; if (total > 12) toast.error("A listing can contain at most 12 images."); else setPendingImages((current) => [...current, ...selected]); }} /></label></div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {existing.data?.item.images.map((image, index) => <div key={image.fileId} className="relative overflow-hidden rounded border border-border"><img src={image.contentUrl} alt={image.altText ?? `${title} image ${index + 1}`} className="aspect-[4/3] w-full object-cover" /><button type="button" aria-label={`Remove image ${index + 1}`} onClick={() => void removeImage(image.fileId)} className="absolute right-1 top-1 rounded bg-background/90 p-1 text-negative"><Trash2 className="h-3.5 w-3.5" /></button>{index === 0 && <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1.5 py-0.5 text-[9px] uppercase">cover</span>}</div>)}
            {pendingImages.map((image, index) => <div key={`${image.name}-${image.lastModified}-${index}`} className="relative rounded border border-dashed border-primary/50 bg-primary/5 p-3 text-[11px]"><div className="truncate font-medium">{image.name}</div><div className="text-muted-foreground">Queued · {(image.size / 1024 / 1024).toFixed(1)} MiB</div><button type="button" aria-label={`Remove queued ${image.name}`} onClick={() => setPendingImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1 top-1 p-1 text-negative"><Trash2 className="h-3.5 w-3.5" /></button></div>)}
          </div>
          {(existing.data?.item.images.length ?? 0) + pendingImages.length === 0 && <p className="mt-3 rounded border border-dashed border-border p-3 text-[11px] text-muted-foreground">No images yet. Clear photos of the full item, identifiers, interfaces, wear, defects, and included accessories reduce buyer uncertainty.</p>}
        </section>

        <details open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)} className="surface-card p-4">
          <summary className="cursor-pointer font-semibold">Technical details, provenance, and evidence</summary>
          <div className="mt-4 space-y-3">
            <Field label="Source build (optional)"><select className="input-bare" value={sourceBuildId} onChange={(event) => setSourceBuildId(event.target.value)}><option value="">Not linked to a personal reproduction</option>{(builds.data?.items ?? []).map((build) => <option key={build.id} value={build.id}>{build.name} · {build.status}</option>)}</select></Field>
            {sourceBuildId && <div className="rounded border border-border bg-muted/30 p-2 text-[11px]"><span className="font-medium">Known build parts cost:</span> {partsCost == null ? "not priced" : `${partsCurrency} ${partsCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} {partsCoverage && <span className="text-muted-foreground">· {partsCoverage}</span>}<p className="mt-1 text-muted-foreground">This is an aggregate of recorded build-item costs or selected same-currency internal supplier offers, not a live market quote.</p></div>}
            <Field label="Catalog component (optional)"><select className="input-bare" value={componentId} onChange={(event) => setComponentId(event.target.value)}><option value="">No linked catalog component</option>{(components.data?.items ?? []).map((component) => <option key={component.id} value={component.id}>{component.name} — {component.maker}</option>)}</select></Field>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Region"><select className="input-bare" value={region} onChange={(event) => setRegion(event.target.value)}>{["US", "EU", "CN", "JP", "KR", "Global"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Runtime hours"><input className="input-bare mono" inputMode="numeric" value={runtimeHours} onChange={(event) => setRuntimeHours(event.target.value)} /></Field></div>
            <Field label="Provenance and maintenance"><textarea className="input-bare min-h-24" value={provenance} onChange={(event) => setProvenance(event.target.value)} placeholder="Origin, exact revision, usage, modifications, maintenance, ownership, and traceability…" /></Field>
            <fieldset className="border-t border-border/60 pt-3"><legend className="section-title mb-2">Seller declarations</legend><div className="grid gap-2 text-[12px] sm:grid-cols-2"><Check label="Test report available" value={testReport} onChange={setTestReport} /><Check label="Video available" value={video} onChange={setVideo} /><Check label="Returns accepted" value={returns} onChange={setReturns} /><Check label="Serial available to buyer" value={serial} onChange={setSerial} /></div></fieldset>
          </div>
        </details>

        {qualityReview && <SubmissionQualityCard review={qualityReview} />}
        {errors.length > 0 && <ul className="list-disc pl-4 text-[11px] text-negative" role="alert">{errors.map((error) => <li key={error}>{error}</li>)}</ul>}
        <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy || errors.length > 0} className="btn-ghost">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save private draft</button><button type="button" disabled={busy || errors.length > 0} onClick={() => void persist(true)} className="btn-primary">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} {reviewedFingerprint === fingerprint || reviewUnavailable ? "Publish listing" : "Review before publishing"}</button><Link to="/marketplace" className="btn-ghost ml-auto">Cancel</Link></div>
      </form>

      <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <div className="surface-card p-3"><div className="section-title mb-2">Price context</div><dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]"><Row k="Asking" v={price ? `USD ${Number(price).toLocaleString()}` : "not set"} /><Row k="Known parts" v={partsCost == null ? "not linked" : `${partsCurrency} ${partsCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} /><Row k="Difference" v={partsCost == null || !price || partsCurrency !== "USD" ? "—" : `USD ${(Number(price) - partsCost).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} /></dl><p className="mt-2 text-[10px] text-muted-foreground">Parts cost excludes unpriced or cross-currency lines, labor, tooling, fabrication, shipping, tax, risk, and seller value. It is context, not a valuation.</p></div>
        <div className="surface-card p-3"><div className="section-title mb-2">Publication state</div><dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]"><Row k="Records" v="D1" /><Row k="Images" v="R2" /><Row k="Draft" v="Private listing" /><Row k="Payments" v="Not configured" /><Row k="AI" v="Draft + advisory review" /></dl></div>
      </aside>
    </div>
  </main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-[11px] text-muted-foreground"><span className="section-title mb-1 block">{label}</span>{children}</label>; }
function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) { return <label className="flex items-center gap-2"><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />{label}</label>; }
function Row({ k, v }: { k: string; v: React.ReactNode }) { return <><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></>; }
function conditionLabel(value: NonNullable<MarketplaceListing["conditionGrade"]>) { return ({ A: "A · like new", B: "B · used, fully functional", C: "C · used, notable wear", untested: "Untested", for_parts: "For parts / repair", not_applicable: "Not applicable" } as const)[value]; }
