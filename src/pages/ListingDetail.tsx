import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Bookmark, BookmarkCheck, Copy, Mail, HandCoins, Check, X } from "lucide-react";
import { listingById, sellers } from "@/data/listings";
import { partById, lowestPrice } from "@/data/parts";
import { ExpandableImage } from "@/components/common/ExpandableImage";
import { ExpandableField } from "@/components/common/ExpandableField";
import { gallery } from "@/lib/media";
import { copyToClipboard, isListingSaved, toggleSavedListing } from "@/lib/marketplaceDrafts";
import { trustScore } from "./Marketplace";

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <ExpandableField k={k} v={v} />;

export default function ListingDetail() {
  const { id } = useParams();
  const l = listingById(id ?? "");
  const [saved, setSaved] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useState<string>("");
  const [offerNote, setOfferNote] = useState("");

  useEffect(() => { if (l) { setSaved(isListingSaved(l.id)); setOfferAmount(String(l.price)); } }, [l]);

  if (!l) return <div className="p-8">Listing not found. <Link to="/marketplace" className="text-primary hover:underline">Back to marketplace</Link>.</div>;

  const p = partById(l.partId)!;
  const s = sellers[l.sellerId];
  const newPrice = lowestPrice(p);
  const g = gallery("listing", l.id, 5);
  const score = trustScore(l);

  const flagCount =
    Number(l.identityVerified) + Number(l.serialVerified) + Number(l.hasTestReport) +
    Number(l.hasVideo) + Number(l.returnsAccepted) + Number(l.escrowEligible);

  const handleSaveToggle = () => {
    const nowSaved = toggleSavedListing(l.id);
    setSaved(nowSaved);
    toast(nowSaved ? "Listing saved locally" : "Removed from saved", {
      description: "Saved list lives only in this browser.",
    });
  };

  const handleCopyInquiry = async () => {
    const body =
`Re: ${l.title} — inquiry
Listing: ${l.id} · Part: ${p.name} (${p.maker}) · Region: ${l.region}
Asking: $${l.price.toLocaleString()} (vs new $${newPrice.toLocaleString()} · ${l.priceVsNewPct}%)
Grade ${l.grade} · Runtime ${l.runtimeHours ?? "unknown"}h · Posted ${l.postedDaysAgo}d ago

Hello ${s.name},

I'd like to confirm the following before proceeding:
  • Latest bench test / video evidence (please share files or links)
  • Serial number(s) and provenance
  • Return window and condition of return
  • Shipping origin, packaging, and lead time
  • Payment / handoff preferences

Additional context from my side: <describe intended use, quantity, timing>

Thanks,
— <your name>
`;
    const ok = await copyToClipboard(body);
    toast[ok ? "success" : "error"](ok ? "Inquiry copied to clipboard" : "Copy failed", {
      description: ok ? "Nothing was sent. Paste it into your own message." : undefined,
    });
  };

  const submitOffer = async () => {
    const amt = Number(offerAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid offer amount");
      return;
    }
    const diffPct = ((amt - l.price) / l.price) * 100;
    const body =
`Offer for ${l.title}
Listing: ${l.id}
Seller: ${s.name}
Asking: $${l.price.toLocaleString()}
Offer:  $${amt.toLocaleString()} (${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(1)}% vs asking)

Note:
${offerNote.trim() || "<no note>"}

— prepared in RoboPartPicker; copied locally and not delivered to the seller.
`;
    const ok = await copyToClipboard(body);
    toast[ok ? "success" : "error"](ok ? "Offer copied to clipboard" : "Copy failed", {
      description: ok ? "Nothing was sent. Paste it into your own outreach." : undefined,
    });
    if (ok) setOfferOpen(false);
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="text-[12px] text-muted-foreground mb-1">
        <Link to="/marketplace" className="hover:text-primary">Marketplace</Link> / {l.title}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">{l.title}</h1>
          <div className="text-[13px] text-muted-foreground mt-0.5">
            for <Link to={`/parts/${p.category}/${p.slug}`} className="hover:text-primary">{p.name}</Link> · {p.maker} · posted {l.postedDaysAgo}d ago
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`pill ${l.grade === "A" ? "pill-good" : l.grade === "ForParts" ? "pill-bad" : l.grade === "Untested" ? "pill-warn" : ""}`}>Grade {l.grade}</span>
          <span className="pill">{l.region}</span>
          <span
            className={`pill mono ${score >= 75 ? "pill-good" : score >= 50 ? "pill-yellow" : score >= 30 ? "pill-warn" : "pill-bad"}`}
            title="Derived from listing flags (identity/serial verification, test report, video, returns, escrow) and seller history."
          >
            trust {score}/100
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          {/* Media */}
          <div className="surface-card p-3 space-y-2">
            <ExpandableImage src={g.hero} alt={`${l.title} hero`} thumbs={g.thumbs} caption={l.title} className="aspect-[16/9]" />
            <div className="grid grid-cols-4 gap-2">
              {g.thumbs.map((t, i) => (
                <ExpandableImage
                  key={i}
                  src={t}
                  alt={`${l.title} photo ${i + 1}`}
                  thumbs={[g.hero, ...g.thumbs.filter((_, j) => j !== i)]}
                  className="aspect-[4/3]"
                />
              ))}
            </div>
            {l.hasVideo && (
              <div className="mt-1 rounded border border-dashed border-border p-2 text-[11px] text-muted-foreground">
                Video proof reported by seller. Request the file directly — RoboPartPicker does not host or verify video.
              </div>
            )}
          </div>

          {/* Price intelligence */}
          <div className="surface-card p-4">
            <div className="section-title mb-2">Price intelligence</div>
            <div className="grid gap-2 sm:grid-cols-3 text-[12px]">
              <Fact k="Asking price" v={<span className="mono font-semibold">${l.price.toLocaleString()}</span>} />
              <Fact k="Lowest new offer" v={<span className="mono">${newPrice.toLocaleString()}</span>} />
              <Fact k="Delta vs new" v={
                <span className={`mono ${l.priceVsNewPct < 0 ? "text-positive" : l.priceVsNewPct > 0 ? "text-negative" : ""}`}>
                  {l.priceVsNewPct}%
                </span>
              } />
            </div>
          </div>

          {/* Verification checklist */}
          <div className="surface-card p-4">
            <div className="section-title mb-2">Listing-provided evidence ({flagCount}/6)</div>
            <ul className="grid gap-1 sm:grid-cols-2 text-[12.5px]">
              <Check2 ok={l.identityVerified} label="Seller identity verified" />
              <Check2 ok={l.serialVerified} label="Serial number verified" />
              <Check2 ok={l.hasTestReport} label="Bench test report attached" />
              <Check2 ok={l.hasVideo} label="Video proof reported" />
              <Check2 ok={l.returnsAccepted} label="Seller accepts returns" />
              <Check2 ok={l.escrowEligible} label="Seller marked escrow-eligible" />
            </ul>
            <div className="mt-3 text-[11px] text-muted-foreground">
              These are seller-declared flags surfaced from the listing. RoboPartPicker does not currently process payments, hold escrow,
              perform third-party inspections, or arbitrate disputes — arrange those separately with your counterparty.
            </div>
          </div>

          {/* Test report */}
          {l.testReport && (
            <div className="surface-card p-4">
              <div className="section-title mb-2">Test report ({p.category})</div>
              {Object.entries(l.testReport).map(([k, v]) => <Row key={k} k={k} v={String(v)} />)}
            </div>
          )}

          {/* Item details */}
          <div className="surface-card p-4">
            <div className="section-title mb-2">Item details</div>
            <Row k="Condition grade" v={`Grade ${l.grade}`} />
            <Row k="Runtime hours" v={l.runtimeHours ?? "—"} />
            <Row k="Region" v={l.region} />
            <Row k="Listing age" v={`${l.postedDaysAgo} day(s)`} />
            <Row k="Returns accepted" v={l.returnsAccepted ? "yes (per seller)" : "no"} />
            <Row k="Escrow eligible" v={l.escrowEligible ? "seller says yes" : "no"} />
            <Row k="Serial verified" v={l.serialVerified ? "yes" : "no"} />
            {l.notes && <Row k="Seller notes" v={l.notes} />}
          </div>
        </section>

        <aside className="space-y-4">
          {/* Actions */}
          <div className="surface-card p-4">
            <div className="mono text-[24px] font-bold">${l.price.toLocaleString()}</div>
            <div className="text-[12px] text-muted-foreground">
              vs new <span className="mono">${newPrice.toLocaleString()}</span> · {l.priceVsNewPct}%
            </div>
            <button onClick={handleCopyInquiry} className="btn-primary w-full mt-3">
              <Mail className="h-3.5 w-3.5" /> Copy seller inquiry
            </button>
            <button onClick={() => setOfferOpen(o => !o)} className="btn-ghost w-full mt-2" aria-expanded={offerOpen}>
              <HandCoins className="h-3.5 w-3.5" /> {offerOpen ? "Close offer composer" : "Compose an offer"}
            </button>
            <button onClick={handleSaveToggle} className="btn-ghost w-full mt-2" aria-pressed={saved}>
              {saved ? <><BookmarkCheck className="h-3.5 w-3.5" /> Saved (click to remove)</> : <><Bookmark className="h-3.5 w-3.5" /> Save to this browser</>}
            </button>
            <div className="mt-2 text-[11px] text-muted-foreground">
              Actions are local. Nothing is sent to the seller, and no payment is placed.
            </div>

            {offerOpen && (
              <div className="mt-3 rounded border border-border bg-surface p-3 space-y-2">
                <label className="block">
                  <div className="section-title mb-1">Offer amount (USD)</div>
                  <input
                    type="number"
                    className="input-bare mono"
                    value={offerAmount}
                    onChange={(e) => setOfferAmount(e.target.value)}
                    aria-label="Offer amount in USD"
                  />
                </label>
                <label className="block">
                  <div className="section-title mb-1">Note to seller</div>
                  <textarea
                    className="input-bare h-20 py-1"
                    value={offerNote}
                    onChange={(e) => setOfferNote(e.target.value)}
                    placeholder="Timing, quantity, evidence requests, pickup preferences…"
                    aria-label="Note to seller"
                  />
                </label>
                <div className="flex gap-2">
                  <button onClick={submitOffer} className="btn-primary btn-sm flex-1">
                    <Copy className="h-3 w-3" /> Copy offer
                  </button>
                  <button onClick={() => setOfferOpen(false)} className="btn-ghost btn-sm">
                    <X className="h-3 w-3" /> Cancel
                  </button>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Copy places the offer on your clipboard only. It is not delivered.
                </div>
              </div>
            )}
          </div>

          {/* Seller */}
          <div className="surface-card p-4">
            <div className="section-title mb-2">Seller</div>
            <div className="font-semibold">{s.name}</div>
            <Row k="Rating" v={`★ ${s.rating}`} />
            <Row k="Prior sales on platform" v={s.sales} />
            <Row k="Typical response" v={`${s.responseHr} hr`} />
            <Row k="Dispute rate" v={`${s.disputePct}%`} />
            <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
              {l.identityVerified && <span className="pill pill-good">identity verified</span>}
              {l.serialVerified && <span className="pill pill-good">serial verified</span>}
              {l.hasTestReport && <span className="pill">test report</span>}
              {l.hasVideo && <span className="pill">video reported</span>}
            </div>
          </div>

          <div className="surface-card p-3 text-[11px] text-muted-foreground">
            Trust score {score}/100 is derived transparently from the flags above and the seller's rating, prior sales, and dispute rate.
            It is not a guarantee — always confirm evidence directly with the seller before paying.
          </div>
        </aside>
      </div>
    </div>
  );
}

const Fact = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="rounded border border-border bg-surface px-2 py-1.5">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
    <div className="mt-0.5">{v}</div>
  </div>
);

const Check2 = ({ ok, label }: { ok: boolean; label: string }) => (
  <li className={`flex items-center gap-1.5 ${ok ? "text-foreground" : "text-muted-foreground"}`}>
    {ok ? <Check className="h-3.5 w-3.5 text-positive" /> : <X className="h-3.5 w-3.5 opacity-60" />}
    <span>{label}</span>
  </li>
);
