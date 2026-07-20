import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, MessageSquare, Star, StarOff, Edit3 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { marketplaceApi, useMarketplaceListing } from "@/lib/api/marketplace";

export default function ListingDetailD1() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useMarketplaceListing(id);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  if (query.isPending) return <div className="p-8" role="status">Loading listing from D1…</div>;
  if (query.isError || !query.data?.item) return <div className="p-8 text-negative" role="alert">Listing could not be loaded: {query.error?.message}</div>;
  const item = query.data.item;
  const own = user?.id === item.sellerUserId;
  const seller = item.seller?.displayName || item.seller?.username || (item.isDemo ? "Demo fixture" : "Seller unavailable");

  const toggleSave = async () => {
    if (!user) { navigate("/auth", { state: { from: location.pathname } }); return; }
    try { await marketplaceApi.save(item.id, !item.saved); await query.refetch(); toast.success(item.saved ? "Removed from saved listings" : "Listing saved"); }
    catch (error) { toast.error("Could not update save", { description: error instanceof Error ? error.message : String(error) }); }
  };
  const inquire = async () => {
    if (!user) { navigate("/auth", { state: { from: location.pathname } }); return; }
    if (message.trim().length < 5) { toast.error("Write a short technical inquiry first."); return; }
    setBusy(true);
    try {
      const response = await marketplaceApi.inquire(item.id, message.trim(), `Inquiry: ${item.title}`);
      setMessage(""); toast.success("Inquiry created", { description: response.deliveryScope });
    } catch (error) { toast.error("Inquiry could not be created", { description: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(false); }
  };
  const status = async (next: "published" | "reserved" | "sold" | "withdrawn") => {
    try { await marketplaceApi.status(item.id, next); await queryClient.invalidateQueries({ queryKey: ["marketplace"] }); await query.refetch(); toast.success(`Listing marked ${next}`, { description: "This changes only the RoboPartPicker record; no payment was processed." }); }
    catch (error) { toast.error("Status update failed", { description: error instanceof Error ? error.message : String(error) }); }
  };

  return <main className="mx-auto max-w-[1200px] px-4 py-5">
    <div className="text-[12px] text-muted-foreground"><Link to="/marketplace" className="hover:text-primary">Marketplace</Link> / {item.slug}</div>
    <div className="surface-card mt-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="section-title">{item.listingType} · {item.category}</div><h1 className="text-[22px] font-bold tracking-tight mt-1">{item.title}</h1><div className="text-[12px] text-muted-foreground mt-1">{seller} · {item.region ?? "region not specified"} · status {item.status}</div></div>
        <div className="text-right"><div className="mono text-[22px] font-semibold">{item.price == null ? "Quote requested" : `${item.currency ?? "USD"} ${item.price.toLocaleString()}`}</div><div className="text-[11px] text-muted-foreground">quantity {item.quantity}</div></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1"><span className="pill">{item.conditionGrade ?? "condition n/a"}</span>{item.component && <Link className="pill pill-yellow" to={`/parts/${item.component.category}/${item.component.slug}`}>{item.component.name}</Link>}{item.isDemo && <span className="pill pill-yellow">demonstration record</span>}</div>
      {item.partsCost != null && <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-3"><PriceContext label="Asking price" value={`${item.currency ?? "USD"} ${item.price?.toLocaleString() ?? "—"}`} /><PriceContext label="Known parts cost" value={`${item.partsCostCurrency ?? "USD"} ${item.partsCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} detail={`${item.partsCostPricedItems}/${item.partsCostTotalItems} build lines priced`} /><PriceContext label="Ask minus parts" value={item.price == null ? "—" : `${item.currency ?? "USD"} ${(item.price - item.partsCost).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} detail="Not seller margin; excludes labor and other costs" /></div>}
    </div>

    <div className="surface-card mt-3 border-warning/30 bg-warning/5 p-2 text-[11.5px] text-muted-foreground flex gap-2"><AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" /> No payment, escrow, inspection, shipping, identity-verification, or dispute provider is configured. Verify the counterparty and evidence independently.</div>

    <div className="grid gap-4 lg:grid-cols-[1fr_320px] mt-4">
      <section className="space-y-3">
        {item.images.length > 0 && <div className="surface-card p-3"><div className="grid gap-2 sm:grid-cols-2">{item.images.map((image, index) => <img key={image.fileId} src={image.contentUrl} alt={image.altText ?? `${item.title} image ${index + 1}`} className={`${index === 0 ? "sm:col-span-2 aspect-[16/9]" : "aspect-[4/3]"} w-full rounded border border-border bg-muted object-contain`} loading={index === 0 ? "eager" : "lazy"} />)}</div></div>}
        <div className="surface-card p-4"><div className="section-title mb-2">Description</div><p className="whitespace-pre-wrap text-[13px]">{item.description}</p></div>
        <div className="surface-card p-4"><div className="section-title mb-2">Seller-declared evidence</div><dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]"><Row k="Runtime" v={item.details.runtimeHours == null ? "not stated" : `${item.details.runtimeHours} h`} /><Row k="Test report" v={item.details.sellerDeclaresTestReport ? "seller says available" : "not declared"} /><Row k="Video" v={item.details.sellerDeclaresVideo ? "seller says available" : "not declared"} /><Row k="Returns" v={item.details.sellerAcceptsReturns ? "seller says accepted" : "not declared"} /><Row k="Serial" v={item.details.serialAvailable ? "seller says available to buyer" : "not declared"} /></dl>{item.details.provenanceText && <div className="mt-3 border-t border-border/60 pt-2 text-[12px] whitespace-pre-wrap"><span className="text-muted-foreground">Provenance: </span>{item.details.provenanceText}</div>}</div>
        {!own && !item.isDemo && <div className="surface-card p-4"><div className="section-title mb-2 flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> Internal inquiry</div><textarea className="input-bare min-h-28" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask for exact revision, serial/provenance, test method, files, lead time, and delivery constraints…" /><button className="btn-primary mt-2" disabled={busy} onClick={() => void inquire()}>Create inquiry</button><p className="text-[10.5px] text-muted-foreground mt-2">This sends only an internal RoboPartPicker message. It does not create an order or process a payment.</p></div>}
      </section>
      <aside className="space-y-3">
        <div className="surface-card p-3"><div className="section-title mb-2">Actions</div><div className="grid gap-2"><button className="btn-ghost justify-center" onClick={() => void toggleSave()}>{item.saved ? <Star className="h-3.5 w-3.5" /> : <StarOff className="h-3.5 w-3.5" />} {item.saved ? "Saved" : "Save listing"}</button>{own && item.status === "draft" && <Link to={`/marketplace/new?draft=${item.id}`} className="btn-ghost justify-center"><Edit3 className="h-3.5 w-3.5" /> Edit draft fields</Link>}{own && <div className="grid grid-cols-2 gap-1">{item.status === "draft" && <button className="btn-primary btn-sm" onClick={() => void status("published")}>Publish</button>}{item.status === "published" && <button className="btn-ghost btn-sm" onClick={() => void status("reserved")}>Reserve</button>}{["published", "reserved"].includes(item.status) && <button className="btn-ghost btn-sm" onClick={() => void status("sold")}>Mark sold</button>}{!["withdrawn", "sold"].includes(item.status) && <button className="btn-ghost btn-sm text-negative" onClick={() => void status("withdrawn")}>Withdraw</button>}</div>}</div></div>
        <div className="surface-card p-3 text-[11px] text-muted-foreground"><div className="section-title mb-2">Record</div><div>D1 listing <span className="mono">{item.id}</span></div><div>Version <span className="mono">{item.version}</span></div><div>Updated {new Date(item.updatedAt).toLocaleString()}</div></div>
      </aside>
    </div>
  </main>;
}

function Row({ k, v }: { k: string; v: React.ReactNode }) { return <><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></>; }
function PriceContext({ label, value, detail }: { label: string; value: string; detail?: string }) { return <div><div className="section-title">{label}</div><div className="mono mt-1 text-[15px] font-semibold">{value}</div>{detail && <div className="mt-0.5 text-[9.5px] text-muted-foreground">{detail}</div>}</div>; }
