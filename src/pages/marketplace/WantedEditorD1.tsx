import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Save, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { marketplaceApi } from "@/lib/api/marketplace";

export default function WantedEditorD1() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("actuator");
  const [quantity, setQuantity] = useState("1");
  const [budget, setBudget] = useState("");
  const [region, setRegion] = useState("Global");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!loading && !user) navigate("/auth", { replace: true, state: { from: "/marketplace/wanted/new" } }); }, [loading, navigate, user]);
  const errors = useMemo(() => {
    const result: string[] = [];
    if (title.trim().length < 4) result.push("Title must be at least 4 characters.");
    if (description.trim().length < 10) result.push("Describe the required revision, evidence, and constraints.");
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) result.push("Quantity must be greater than zero.");
    if (budget && (!Number.isFinite(Number(budget)) || Number(budget) < 0)) result.push("Budget must be non-negative.");
    return result;
  }, [budget, description, quantity, title]);
  const save = async (publish: boolean) => {
    if (errors.length) return toast.error(errors[0]);
    setBusy(true);
    try {
      const draft = (await marketplaceApi.create({ listingType: "wanted", title: title.trim(), description: description.trim(), category,
        conditionGrade: "not_applicable", currency: "USD", price: budget ? Number(budget) : null, quantity: Number(quantity), region, visibility: "public" })).item;
      const item = publish ? (await marketplaceApi.status(draft.id, "published")).item : draft;
      toast.success(publish ? "Wanted request published" : "Wanted draft saved", { description: "No RFQ was sent to external suppliers." });
      navigate(publish ? `/marketplace/${item.slug}` : "/marketplace");
    } catch (error) { toast.error("Wanted request could not be saved", { description: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(false); }
  };
  if (!user) return null;
  return <main className="mx-auto max-w-[850px] px-4 py-6"><div className="text-[12px] text-muted-foreground"><Link to="/marketplace" className="hover:text-primary">Marketplace</Link> / wanted</div><h1 className="text-[22px] font-bold tracking-tight mt-1">Create a wanted request</h1><p className="text-[12px] text-muted-foreground mt-1">Publish demand to the internal Marketplace. This does not send an RFQ or contact suppliers automatically.</p>
    <form className="surface-card mt-4 p-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void save(false); }}>
      <Field label="Title"><input className="input-bare" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Need 12× RMD-X8 Pro, matched revision" /></Field>
      <Field label="Technical requirements"><textarea className="input-bare min-h-32" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Acceptable models/revisions, condition, test evidence, destination, and deadline…" /></Field>
      <div className="grid sm:grid-cols-2 gap-3"><Field label="Category"><select className="input-bare" value={category} onChange={(event) => setCategory(event.target.value)}>{["actuator", "hand", "sensor", "compute", "driver", "reducer", "robot", "fabrication", "service"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Quantity"><input className="input-bare mono" type="number" min="0.001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></Field></div>
      <div className="grid sm:grid-cols-2 gap-3"><Field label="Maximum total budget (USD, optional)"><input className="input-bare mono" type="number" min="0" step="0.01" value={budget} onChange={(event) => setBudget(event.target.value)} /></Field><Field label="Destination region"><select className="input-bare" value={region} onChange={(event) => setRegion(event.target.value)}>{["US", "EU", "CN", "JP", "KR", "Global"].map((value) => <option key={value}>{value}</option>)}</select></Field></div>
      {errors.length > 0 && <ul className="text-[11px] text-negative list-disc pl-4" role="alert">{errors.map((error) => <li key={error}>{error}</li>)}</ul>}
      <div className="flex gap-2"><button className="btn-ghost" type="submit" disabled={busy || errors.length > 0}><Save className="h-3.5 w-3.5" /> Save private draft</button><button className="btn-primary" type="button" disabled={busy || errors.length > 0} onClick={() => void save(true)}><Send className="h-3.5 w-3.5" /> Publish request</button><Link className="btn-ghost ml-auto" to="/marketplace">Cancel</Link></div>
    </form></main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="section-title block mb-1">{label}</span>{children}</label>; }
