import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Save, Send, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useComponents } from "@/lib/api/catalog";
import { marketplaceApi, useMarketplaceListing } from "@/lib/api/marketplace";
import type { MarketplaceListing, MarketplaceListingInput } from "@/shared/marketplace";
import { AiFormDraft } from "@/components/ai/AiFormDraft";

const grades: NonNullable<MarketplaceListing["conditionGrade"]>[] = ["A", "B", "C", "untested", "for_parts", "not_applicable"];

export default function ListingEditorD1() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const draftId = search.get("draft") ?? undefined;
  const existing = useMarketplaceListing(draftId);
  const components = useComponents({ limit: 100 });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [componentId, setComponentId] = useState("");
  const [category, setCategory] = useState("component");
  const [grade, setGrade] = useState<MarketplaceListing["conditionGrade"]>("B");
  const [price, setPrice] = useState("500");
  const [quantity, setQuantity] = useState("1");
  const [region, setRegion] = useState("US");
  const [runtimeHours, setRuntimeHours] = useState("");
  const [provenance, setProvenance] = useState("");
  const [testReport, setTestReport] = useState(false);
  const [video, setVideo] = useState(false);
  const [returns, setReturns] = useState(false);
  const [serial, setSerial] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && !user) navigate("/auth", { replace: true, state: { from: `/marketplace/new${location.search}` } }); }, [loading, navigate, user]);
  useEffect(() => {
    const item = existing.data?.item;
    if (!item) return;
    setTitle(item.title); setDescription(item.description); setComponentId(item.sourceComponentId ?? ""); setCategory(item.category);
    setGrade(item.conditionGrade); setPrice(item.price == null ? "" : String(item.price)); setQuantity(String(item.quantity)); setRegion(item.region ?? "Global");
    setRuntimeHours(item.details.runtimeHours == null ? "" : String(item.details.runtimeHours)); setProvenance(item.details.provenanceText ?? "");
    setTestReport(item.details.sellerDeclaresTestReport); setVideo(item.details.sellerDeclaresVideo); setReturns(item.details.sellerAcceptsReturns); setSerial(item.details.serialAvailable);
  }, [existing.data?.item]);

  const selectedComponent = components.data?.items.find((component) => component.id === componentId);
  useEffect(() => { if (selectedComponent) setCategory(selectedComponent.category); }, [selectedComponent?.id]);
  const errors = useMemo(() => {
    const output: string[] = [];
    if (title.trim().length < 4) output.push("Title must be at least 4 characters.");
    if (description.trim().length < 10) output.push("Description must be at least 10 characters.");
    if (!Number.isFinite(Number(price)) || Number(price) < 0) output.push("Price must be a non-negative number.");
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) output.push("Quantity must be greater than zero.");
    if (runtimeHours && (!/^\d+$/u.test(runtimeHours) || Number(runtimeHours) < 0)) output.push("Runtime must be a non-negative whole number.");
    if (grade === "untested" && testReport) output.push("An untested listing cannot declare a test report.");
    return output;
  }, [description, grade, price, quantity, runtimeHours, testReport, title]);

  const input = (): MarketplaceListingInput => ({
    listingType: "sell", title: title.trim(), description: description.trim(), category, conditionGrade: grade,
    currency: "USD", price: Number(price), quantity: Number(quantity), region, visibility: "public",
    sourceComponentId: componentId || null, runtimeHours: runtimeHours ? Number(runtimeHours) : null, provenanceText: provenance.trim() || null,
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

  const persist = async (publish: boolean) => {
    if (errors.length) { toast.error(errors[0]); return; }
    setBusy(true);
    try {
      const saved = existing.data?.item
        ? (await marketplaceApi.update(existing.data.item.id, existing.data.item.version, input())).item
        : (await marketplaceApi.create(input())).item;
      const result = publish ? (await marketplaceApi.status(saved.id, "published")).item : saved;
      toast.success(publish ? "Listing published" : "Server-backed draft saved", { description: publish ? "The listing is now visible in RoboPartPicker." : "The draft is private and can be edited later." });
      navigate(publish ? `/marketplace/${result.slug}` : "/marketplace");
    } catch (error) { toast.error("Listing could not be saved", { description: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(false); }
  };

  if (!user) return null;
  if (draftId && existing.isPending) return <div className="p-8" role="status">Loading draft…</div>;
  if (draftId && (existing.isError || !existing.data?.item)) return <div className="p-8 text-negative" role="alert">Draft could not be loaded.</div>;

  return <main className="mx-auto max-w-[1000px] px-4 py-6">
    <div className="text-[12px] text-muted-foreground"><Link to="/marketplace" className="hover:text-primary">Marketplace</Link> / {draftId ? "edit draft" : "new listing"}</div>
    <div className="mt-1 flex items-center justify-between gap-3"><h1 className="text-[22px] font-bold tracking-tight">{draftId ? "Edit listing draft" : "Create a technical listing"}</h1><AiFormDraft form="marketplace_listing" current={{ title, description, category, conditionGrade: grade, price, quantity, region, runtimeHours, provenance }} onApply={applyAiDraft} hint="Describe the item, condition, included hardware, defects, provenance, quantity, and asking price. Evidence declarations remain manual." /></div>
    <div className="surface-card mt-3 border-warning/30 bg-warning/5 p-2 text-[11.5px] text-muted-foreground flex gap-2"><AlertTriangle className="h-3.5 w-3.5 text-warning" /> Evidence fields below are seller declarations. RoboPartPicker does not verify identity, serial numbers, payment, escrow, shipping, or inspection.</div>
    <div className="grid gap-4 lg:grid-cols-[1fr_300px] mt-4">
      <form className="surface-card p-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void persist(false); }}>
        <Field label="Catalog component (optional)"><select className="input-bare" value={componentId} onChange={(event) => setComponentId(event.target.value)}><option value="">No linked catalog component</option>{(components.data?.items ?? []).map((component) => <option key={component.id} value={component.id}>{component.name} — {component.maker}</option>)}</select></Field>
        <Field label="Title"><input className="input-bare" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} /></Field>
        <Field label="Description"><textarea className="input-bare min-h-28" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Exact model/revision, condition, included accessories, defects, and shipping constraints…" /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Category"><input className="input-bare" value={category} onChange={(event) => setCategory(event.target.value)} /></Field><Field label="Condition"><select className="input-bare" value={grade ?? "not_applicable"} onChange={(event) => setGrade(event.target.value as MarketplaceListing["conditionGrade"])}>{grades.map((value) => <option key={value}>{value}</option>)}</select></Field></div>
        <div className="grid grid-cols-2 gap-3"><Field label="Price (USD)"><input type="number" min="0" step="0.01" className="input-bare mono" value={price} onChange={(event) => setPrice(event.target.value)} /></Field><Field label="Quantity"><input type="number" min="0.001" step="any" className="input-bare mono" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></Field></div>
        <div className="grid grid-cols-2 gap-3"><Field label="Region"><select className="input-bare" value={region} onChange={(event) => setRegion(event.target.value)}>{["US", "EU", "CN", "JP", "KR", "Global"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Runtime hours"><input className="input-bare mono" inputMode="numeric" value={runtimeHours} onChange={(event) => setRuntimeHours(event.target.value)} /></Field></div>
        <Field label="Provenance"><textarea className="input-bare min-h-20" value={provenance} onChange={(event) => setProvenance(event.target.value)} placeholder="Where it came from, revision, usage, maintenance, and traceability…" /></Field>
        <fieldset className="border-t border-border/60 pt-3"><legend className="section-title mb-2">Seller declarations</legend><div className="grid sm:grid-cols-2 gap-2 text-[12px]"><Check label="Test report available" value={testReport} onChange={setTestReport} /><Check label="Video available" value={video} onChange={setVideo} /><Check label="Returns accepted" value={returns} onChange={setReturns} /><Check label="Serial available to buyer" value={serial} onChange={setSerial} /></div></fieldset>
        {errors.length > 0 && <ul className="text-[11px] text-negative list-disc pl-4" role="alert">{errors.map((error) => <li key={error}>{error}</li>)}</ul>}
        <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy || errors.length > 0} className="btn-ghost"><Save className="h-3.5 w-3.5" /> Save private draft</button><button type="button" disabled={busy || errors.length > 0} onClick={() => void persist(true)} className="btn-primary"><Send className="h-3.5 w-3.5" /> Publish</button><Link to="/marketplace" className="btn-ghost ml-auto">Cancel</Link></div>
      </form>
      <aside className="surface-card p-3 h-fit"><div className="section-title mb-2">Publication state</div><dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]"><dt className="text-muted-foreground">Storage</dt><dd>D1</dd><dt className="text-muted-foreground">Draft visibility</dt><dd>Private</dd><dt className="text-muted-foreground">Payments</dt><dd>Not configured</dd><dt className="text-muted-foreground">Files</dt><dd>R2 upload after save</dd></dl></aside>
    </div>
  </main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-[11px] text-muted-foreground"><span className="section-title block mb-1">{label}</span>{children}</label>; }
function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) { return <label className="flex gap-2 items-center"><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />{label}</label>; }
