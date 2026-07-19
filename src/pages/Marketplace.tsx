import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { listings, wanted, sellers, type ConditionGrade } from "@/data/listings";
import { partById, lowestPrice } from "@/data/parts";
import { PageHeader } from "@/components/common/PageHeader";
import { ExpandableImage } from "@/components/common/ExpandableImage";
import { gallery, thumb } from "@/lib/media";
import { LayoutGrid, Rows3, X, Copy, Search, Trash2 } from "lucide-react";
import {
  listingDrafts as readListingDrafts,
  wantedDrafts as readWantedDrafts,
  deleteListingDraft,
  deleteWantedDraft,
  copyToClipboard,
  type ListingDraft,
  type WantedDraft,
} from "@/lib/marketplaceDrafts";

type SortKey = "newest" | "price_asc" | "discount_desc" | "trust_desc" | "response_asc";
const grades: (ConditionGrade | "all")[] = ["all", "A", "B", "C", "Untested", "ForParts"];
const regions = ["US", "EU", "CN", "JP", "KR"] as const;

const median = (nums: number[]) => {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Transparent trust/readiness score derived only from existing flags.
// 0–100 scale. Every contribution is documented in the tooltip.
export const trustScore = (l: (typeof listings)[number]): number => {
  let s = 0;
  if (l.identityVerified) s += 18;
  if (l.serialVerified) s += 18;
  if (l.hasTestReport) s += 20;
  if (l.hasVideo) s += 10;
  if (l.returnsAccepted) s += 12;
  if (l.escrowEligible) s += 10;
  const seller = sellers[l.sellerId];
  if (seller) {
    s += Math.max(0, Math.min(6, (seller.rating - 4) * 12)); // 0–6 for 4.0–4.5+
    s += Math.max(0, Math.min(6, seller.sales / 20));         // 0–6 for prior sales
    s -= Math.min(10, seller.disputePct);                     // penalty
  }
  return Math.max(0, Math.min(100, Math.round(s)));
};

const relAge = (d: number) => (d === 0 ? "today" : `${d}d ago`);

export default function Marketplace() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<"table" | "cards">("cards");
  const [drafts, setDrafts] = useState<{ listings: ListingDraft[]; wanted: WantedDraft[] }>({ listings: [], wanted: [] });

  const refreshDrafts = () =>
    setDrafts({ listings: readListingDrafts(), wanted: readWantedDrafts() });
  useEffect(() => { refreshDrafts(); }, []);

  const tab = (params.get("tab") as "listings" | "wanted") || "listings";
  const q = params.get("q") ?? "";
  const cat = params.get("cat") ?? "";
  const region = params.get("region") ?? "";
  const grade = (params.get("grade") as ConditionGrade | "all" | null) ?? "all";
  const sort = (params.get("sort") as SortKey) || "newest";
  const verifiedOnly = params.get("verified") === "1";
  const withReport = params.get("report") === "1";
  const escrowOnly = params.get("escrow") === "1";
  const minPrice = params.get("min") ? Number(params.get("min")) : null;
  const maxPrice = params.get("max") ? Number(params.get("max")) : null;

  const setParam = (key: string, value: string | null, replace = false) => {
    const next = new URLSearchParams(params);
    if (!value) next.delete(key); else next.set(key, value);
    setParams(next, { replace });
  };
  const clearFilters = () => {
    const next = new URLSearchParams();
    if (tab === "wanted") next.set("tab", "wanted");
    setParams(next, { replace: false });
  };
  const activeFilters =
    Number(!!q) + Number(!!cat) + Number(!!region) + Number(grade !== "all") +
    Number(verifiedOnly) + Number(withReport) + Number(escrowOnly) +
    Number(minPrice !== null) + Number(maxPrice !== null);

  // ---- Market overview strip (computed only from static sample listings) ----
  const overview = useMemo(() => {
    const verified = listings.filter(l => l.identityVerified && l.serialVerified).length;
    const withReports = listings.filter(l => l.hasTestReport).length;
    const med = median(listings.map(l => l.priceVsNewPct));
    const wantedBudget = wanted.reduce((s, w) => s + w.maxBudget, 0);
    return {
      active: listings.length,
      verified,
      reportPct: Math.round((withReports / listings.length) * 100),
      medDiscount: med,
      wantedBudget,
      wantedCount: wanted.length,
    };
  }, []);

  // ---- Filter + sort listings ----
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return listings
      .filter(l => {
        const p = partById(l.partId)!;
        const s = sellers[l.sellerId];
        if (needle) {
          const hay = `${l.title} ${p.name} ${p.maker} ${s?.name ?? ""}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        if (cat && p.category !== cat) return false;
        if (region && l.region !== region) return false;
        if (grade !== "all" && l.grade !== grade) return false;
        if (verifiedOnly && !(l.identityVerified && l.serialVerified)) return false;
        if (withReport && !l.hasTestReport) return false;
        if (escrowOnly && !l.escrowEligible) return false;
        if (minPrice !== null && l.price < minPrice) return false;
        if (maxPrice !== null && l.price > maxPrice) return false;
        return true;
      })
      .sort((a, b) => {
        switch (sort) {
          case "price_asc": return a.price - b.price;
          case "discount_desc": return a.priceVsNewPct - b.priceVsNewPct; // more negative first
          case "trust_desc": return trustScore(b) - trustScore(a);
          case "response_asc":
            return (sellers[a.sellerId]?.responseHr ?? 999) - (sellers[b.sellerId]?.responseHr ?? 999);
          case "newest":
          default:
            return a.postedDaysAgo - b.postedDaysAgo;
        }
      });
  }, [q, cat, region, grade, sort, verifiedOnly, withReport, escrowOnly, minPrice, maxPrice]);

  // ---- Wanted RFQ actions ----
  const copyWantedReply = async (w: (typeof wanted)[number]) => {
    const perUnit = w.maxBudget / w.qty;
    const body =
`Re: Wanted — ${w.partName}
Region: ${w.region} · Qty: ${w.qty} · Total budget: $${w.maxBudget.toLocaleString()} (~$${perUnit.toFixed(0)} / unit)

Hello ${w.buyer},

I can supply the following against your wanted request:
  • Part: <describe exact make/model + condition grade (A/B/C/Untested)>
  • Quantity available: <qty>  ·  Unit price: $<price>  ·  Total: $<total>
  • Runtime hours / provenance: <details>
  • Test evidence: <attach report or video links>
  • Lead time from confirmation: <days>  ·  Ships from: <region>
  • Payment / handling preferences: <e.g. escrow, wire, terms>

Happy to answer follow-up questions or provide additional test data.

— <your name / org>
`;
    const ok = await copyToClipboard(body);
    toast[ok ? "success" : "error"](ok ? "Seller reply copied to clipboard" : "Copy failed", {
      description: ok ? "Nothing was sent. Paste it into your own email or messaging tool." : undefined,
    });
  };

  return (
    <>
      <PageHeader
        kicker="Marketplace"
        title="Used & refurbished robotics equipment"
        sub="Condition-graded listings and demand-side wanted requests. All transactions happen off-platform — RoboPartPicker surfaces evidence and price context, not payments."
        actions={
          <div className="flex gap-2">
            <Link to="/marketplace/new" className="btn-ghost">Draft listing</Link>
            <Link to="/marketplace/wanted/new" className="btn-primary">Draft wanted</Link>
          </div>
        }
      />

      <div className="mx-auto max-w-[1400px] px-4 py-6">
        {/* Market overview strip */}
        <div className="surface-card mb-4 flex flex-wrap items-stretch">
          <Stat k="Active listings" v={overview.active.toString()} />
          <Stat k="ID + S/N verified" v={`${overview.verified}/${overview.active}`} />
          <Stat k="Test-report coverage" v={`${overview.reportPct}%`} />
          <Stat
            k="Median discount vs new"
            v={
              overview.medDiscount === null
                ? "—"
                : overview.medDiscount < 0
                  ? `${Math.abs(overview.medDiscount).toFixed(1)}% below new`
                  : overview.medDiscount > 0
                    ? `${overview.medDiscount.toFixed(1)}% above new`
                    : "at new price"
            }
          />
          <Stat k="Open wanted requests" v={overview.wantedCount.toString()} />
          <Stat k="Aggregate wanted budget" v={`$${overview.wantedBudget.toLocaleString()}`} />
        </div>

        {/* Tab bar */}
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => setParam("tab", null)}
            className={`btn-${tab === "listings" ? "primary" : "ghost"} btn-sm`}
          >Listings ({listings.length})</button>
          <button
            onClick={() => setParam("tab", "wanted")}
            className={`btn-${tab === "wanted" ? "primary" : "ghost"} btn-sm`}
          >Wanted ({wanted.length})</button>
          <div className="ml-auto text-[11px] text-muted-foreground">
            {activeFilters > 0 && (
              <button onClick={clearFilters} className="btn-ghost btn-sm">
                <X className="h-3 w-3" /> Clear filters ({activeFilters})
              </button>
            )}
          </div>
        </div>

        {tab === "listings" && (
          <>
            {/* Search + filters */}
            <div className="surface-card p-3 mb-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  <input
                    aria-label="Search listings"
                    value={q}
                    onChange={(e) => setParam("q", e.target.value || null, true)}
                    placeholder="Search title, part, maker, or seller…"
                    className="input-bare pl-6"
                  />
                </div>
                <select aria-label="Category" className="input-bare w-[140px]" value={cat} onChange={(e) => setParam("cat", e.target.value || null)}>
                  <option value="">All categories</option>
                  <option value="actuator">actuator</option>
                  <option value="hand">hand</option>
                  <option value="sensor">sensor</option>
                  <option value="compute">compute</option>
                  <option value="driver">driver</option>
                  <option value="reducer">reducer</option>
                </select>
                <select aria-label="Region" className="input-bare w-[110px]" value={region} onChange={(e) => setParam("region", e.target.value || null)}>
                  <option value="">All regions</option>
                  {regions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <select aria-label="Sort" className="input-bare w-[190px]" value={sort} onChange={(e) => setParam("sort", e.target.value === "newest" ? null : e.target.value)}>
                  <option value="newest">Sort: newest</option>
                  <option value="price_asc">Lowest price</option>
                  <option value="discount_desc">Highest discount vs new</option>
                  <option value="trust_desc">Strongest trust score</option>
                  <option value="response_asc">Fastest seller response</option>
                </select>
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={() => setView("table")} className={`btn-ghost btn-sm ${view === "table" ? "bg-muted" : ""}`} title="Table"><Rows3 className="h-3 w-3" /></button>
                  <button onClick={() => setView("cards")} className={`btn-ghost btn-sm ${view === "cards" ? "bg-muted" : ""}`} title="Cards"><LayoutGrid className="h-3 w-3" /></button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {grades.map(g => (
                  <button key={g} onClick={() => setParam("grade", g === "all" ? null : g)} className={`pill ${grade === g ? "pill-yellow" : ""}`} aria-pressed={grade === g}>
                    {g === "all" ? "any grade" : `Grade ${g}`}
                  </button>
                ))}
                <div className="mx-2 h-4 w-px bg-border" />
                <label className="flex items-center gap-1.5 text-[12px]">
                  <input type="checkbox" checked={verifiedOnly} onChange={(e) => setParam("verified", e.target.checked ? "1" : null)} />
                  ID + S/N verified
                </label>
                <label className="flex items-center gap-1.5 text-[12px]">
                  <input type="checkbox" checked={withReport} onChange={(e) => setParam("report", e.target.checked ? "1" : null)} />
                  has test report
                </label>
                <label className="flex items-center gap-1.5 text-[12px]">
                  <input type="checkbox" checked={escrowOnly} onChange={(e) => setParam("escrow", e.target.checked ? "1" : null)} />
                  seller marked escrow-eligible
                </label>
                <div className="mx-2 h-4 w-px bg-border" />
                <label className="flex items-center gap-1 text-[12px]">
                  <span className="text-muted-foreground">Price</span>
                  <input aria-label="Min price" type="number" className="input-bare w-[80px] mono" placeholder="min" value={minPrice ?? ""}
                    onChange={(e) => setParam("min", e.target.value || null, true)} />
                  <span className="text-muted-foreground">–</span>
                  <input aria-label="Max price" type="number" className="input-bare w-[80px] mono" placeholder="max" value={maxPrice ?? ""}
                    onChange={(e) => setParam("max", e.target.value || null, true)} />
                </label>
                <div className="ml-auto text-[12px] text-muted-foreground">
                  <span className="mono text-foreground">{filtered.length}</span> of {listings.length} results
                </div>
              </div>
            </div>

            {/* Local drafts */}
            {drafts.listings.length > 0 && (
              <LocalListingDrafts drafts={drafts.listings} onDelete={(id) => { deleteListingDraft(id); refreshDrafts(); toast("Draft removed"); }} />
            )}

            {/* Results */}
            {filtered.length === 0 ? (
              <EmptyState onClear={clearFilters} hasFilters={activeFilters > 0} />
            ) : view === "table" ? (
              <div className="surface-card overflow-x-auto">
                <table className="data-table">
                  <thead><tr>
                    <th></th><th>Title</th><th>Part</th><th>Grade</th><th>Region</th>
                    <th>Hours</th><th>Price</th><th>vs new</th><th>Seller</th>
                    <th>Response</th><th>Posted</th><th>Trust</th><th>Flags</th><th></th>
                  </tr></thead>
                  <tbody>
                    {filtered.map(l => {
                      const p = partById(l.partId)!;
                      const s = sellers[l.sellerId];
                      const g = gallery("listing", l.id, 3);
                      const ts = trustScore(l);
                      return (
                        <tr key={l.id}>
                          <td><ExpandableImage src={g.hero} alt={l.title} thumbs={g.thumbs} caption={l.title} className="h-9 w-12" /></td>
                          <td><Link to={`/marketplace/${l.id}`} className="font-medium hover:text-primary">{l.title}</Link>
                            <div className="text-[10px] text-muted-foreground">{p.maker}</div>
                          </td>
                          <td className="text-[11px]"><Link to={`/parts/${p.category}/${p.slug}`} className="hover:text-primary">{p.name}</Link></td>
                          <td><span className={`pill ${l.grade === "A" ? "pill-good" : l.grade === "ForParts" ? "pill-bad" : l.grade === "Untested" ? "pill-warn" : ""}`}>{l.grade}</span></td>
                          <td>{l.region}</td>
                          <td className="mono">{l.runtimeHours ?? "—"}</td>
                          <td className="mono font-semibold">${l.price.toLocaleString()}</td>
                          <td className="mono">{l.priceVsNewPct}%</td>
                          <td className="text-[11px]">{s.name}<div className="text-[10px] text-muted-foreground">★ {s.rating} · {s.sales}</div></td>
                          <td className="mono text-[11px]">{s.responseHr}h</td>
                          <td className="mono text-[11px]">{relAge(l.postedDaysAgo)}</td>
                          <td>
                            <TrustBadge score={ts} />
                          </td>
                          <td className="text-[10px]">
                            {l.identityVerified && <span className="pill pill-good">ID</span>}{" "}
                            {l.serialVerified && <span className="pill pill-good">S/N</span>}{" "}
                            {l.hasTestReport && <span className="pill">test</span>}{" "}
                            {l.returnsAccepted && <span className="pill">returns</span>}{" "}
                            {l.escrowEligible && <span className="pill">escrow ok</span>}
                          </td>
                          <td><Link to={`/marketplace/${l.id}`} className="btn-ghost btn-sm">View</Link></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map(l => {
                  const p = partById(l.partId)!;
                  const s = sellers[l.sellerId];
                  const ts = trustScore(l);
                  const newPrice = lowestPrice(p);
                  return (
                    <Link key={l.id} to={`/marketplace/${l.id}`} className="surface-card surface-card-hover p-2.5">
                      <img src={thumb("listing", l.id, 600, 360)} alt={l.title} loading="lazy"
                        className="mb-2 aspect-[5/3] w-full rounded object-cover border border-border" />
                      <div className="flex items-center gap-1 mb-1">
                        <span className={`pill ${l.grade === "A" ? "pill-good" : l.grade === "ForParts" ? "pill-bad" : l.grade === "Untested" ? "pill-warn" : ""}`}>Grade {l.grade}</span>
                        <span className="pill">{l.region}</span>
                        <span className="pill">{relAge(l.postedDaysAgo)}</span>
                        <span className="ml-auto"><TrustBadge score={ts} /></span>
                      </div>
                      <div className="font-semibold leading-tight text-[12.5px]">{l.title}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{p.name} · {p.maker}</div>
                      <div className="mt-2 flex items-end justify-between">
                        <div>
                          <div className="mono text-[15px] font-bold">${l.price.toLocaleString()}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {l.priceVsNewPct}% vs new (${newPrice.toLocaleString()}) · {l.runtimeHours !== null ? `${l.runtimeHours}h` : "untested"}
                          </div>
                        </div>
                        <div className="text-right text-[11px] text-muted-foreground">
                          <div>{s.name}</div>
                          <div>★ {s.rating} · {s.responseHr}h reply</div>
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
                        {l.identityVerified && <span className="pill pill-good">ID</span>}
                        {l.serialVerified && <span className="pill pill-good">S/N</span>}
                        {l.hasTestReport && <span className="pill">test report</span>}
                        {l.hasVideo && <span className="pill">video reported</span>}
                        {l.returnsAccepted && <span className="pill">returns</span>}
                        {l.escrowEligible && <span className="pill">escrow ok</span>}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === "wanted" && (
          <>
            <div className="surface-card p-3 mb-3 text-[12px] text-muted-foreground">
              Wanted requests reflect active buyer demand. Use <span className="text-foreground font-medium">Copy seller reply</span> to draft a
              structured response you can paste into your own email. Nothing is sent from this page.
            </div>

            {drafts.wanted.length > 0 && (
              <LocalWantedDrafts drafts={drafts.wanted} onDelete={(id) => { deleteWantedDraft(id); refreshDrafts(); toast("Draft removed"); }} />
            )}

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {wanted.map(w => {
                const perUnit = w.maxBudget / w.qty;
                return (
                  <div key={w.id} className="surface-card p-4 flex flex-col">
                    <div className="flex flex-wrap items-center gap-1 mb-1">
                      <span className="pill pill-yellow">wanted</span>
                      <span className="pill">{w.partCategory}</span>
                      <span className="pill">{w.region}</span>
                      <span className="pill">{relAge(w.postedDaysAgo)}</span>
                    </div>
                    <div className="font-semibold">{w.partName}</div>
                    {w.notes && <div className="text-[12px] text-muted-foreground mt-1">{w.notes}</div>}
                    <div className="mt-3 grid grid-cols-4 gap-2 text-[12px]">
                      <div><div className="text-muted-foreground text-[10px] uppercase tracking-wider">Qty</div><div className="mono">{w.qty}</div></div>
                      <div><div className="text-muted-foreground text-[10px] uppercase tracking-wider">Total</div><div className="mono font-semibold">${w.maxBudget.toLocaleString()}</div></div>
                      <div><div className="text-muted-foreground text-[10px] uppercase tracking-wider">/ unit</div><div className="mono">${perUnit.toFixed(0)}</div></div>
                      <div><div className="text-muted-foreground text-[10px] uppercase tracking-wider">Region</div><div className="mono">{w.region}</div></div>
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">Buyer: {w.buyer}</div>
                    <div className="mt-3 flex gap-2">
                      <button className="btn-primary btn-sm flex-1" onClick={() => copyWantedReply(w)}>
                        <Copy className="h-3 w-3" /> Copy seller reply
                      </button>
                      <Link
                        to={`/parts/${w.partCategory === "hand" ? "hand" : w.partCategory}`}
                        className="btn-ghost btn-sm"
                      >Browse {w.partCategory}s</Link>
                    </div>
                    <div className="mt-2 text-[10px] text-muted-foreground">
                      Copy only fills your clipboard — no message is sent.
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}

const Stat = ({ k, v }: { k: string; v: string }) => (
  <div className="stat-tile">
    <div className="k">{k}</div>
    <div className="v mono">{v}</div>
  </div>
);

const TrustBadge = ({ score }: { score: number }) => {
  const tone = score >= 75 ? "pill-good" : score >= 50 ? "pill-yellow" : score >= 30 ? "pill-warn" : "pill-bad";
  const label = score >= 75 ? "high" : score >= 50 ? "medium" : score >= 30 ? "low" : "unrated";
  return (
    <span
      className={`pill ${tone} mono`}
      title="Derived only from existing listing flags: identity/serial verification, test report, video, returns, escrow, seller rating, prior sales, and dispute rate."
    >
      {score} · {label}
    </span>
  );
};

const EmptyState = ({ onClear, hasFilters }: { onClear: () => void; hasFilters: boolean }) => (
  <div className="surface-card p-8 text-center">
    <div className="section-title mb-1">No matching listings</div>
    <div className="text-[13px] text-muted-foreground mb-3">
      {hasFilters ? "Try loosening a filter or clearing the search." : "The sample market is empty right now."}
    </div>
    {hasFilters && <button onClick={onClear} className="btn-primary btn-sm">Clear filters</button>}
  </div>
);

const LocalListingDrafts = ({ drafts, onDelete }: { drafts: ListingDraft[]; onDelete: (id: string) => void }) => (
  <section className="surface-card p-3 mb-3">
    <div className="flex items-center gap-2 mb-2">
      <div className="section-title">Your local drafts</div>
      <span className="pill pill-warn">saved only in this browser · not published</span>
    </div>
    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
      {drafts.map(d => {
        const p = partById(d.partId);
        return (
          <div key={d.id} className="surface-card p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-[12.5px] leading-tight">{d.title || "Untitled draft"}</div>
                <div className="text-[11px] text-muted-foreground">{p ? `${p.name} · ${p.maker}` : d.partId} · Grade {d.grade}</div>
              </div>
              <button onClick={() => onDelete(d.id)} aria-label="Delete draft" className="btn-ghost btn-sm"><Trash2 className="h-3 w-3" /></button>
            </div>
            <div className="mt-2 flex items-baseline justify-between text-[12px]">
              <div className="mono font-semibold">${d.price.toLocaleString()}</div>
              <div className="text-[11px] text-muted-foreground">
                {d.region} · {d.runtimeHours !== null ? `${d.runtimeHours}h` : "—"}
              </div>
            </div>
            <Link to={`/marketplace/new?draft=${d.id}`} className="btn-ghost btn-sm mt-2 w-full">Edit local draft</Link>
          </div>
        );
      })}
    </div>
  </section>
);

const LocalWantedDrafts = ({ drafts, onDelete }: { drafts: WantedDraft[]; onDelete: (id: string) => void }) => (
  <section className="surface-card p-3 mb-3">
    <div className="flex items-center gap-2 mb-2">
      <div className="section-title">Your local wanted drafts</div>
      <span className="pill pill-warn">saved only in this browser · not published</span>
    </div>
    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
      {drafts.map(d => (
        <div key={d.id} className="surface-card p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-[12.5px] leading-tight">{d.partName || "Untitled wanted draft"}</div>
              <div className="text-[11px] text-muted-foreground">{d.partCategory} · {d.region} · qty {d.qty}</div>
            </div>
            <button onClick={() => onDelete(d.id)} aria-label="Delete draft" className="btn-ghost btn-sm"><Trash2 className="h-3 w-3" /></button>
          </div>
          <div className="mt-2 text-[12px] mono font-semibold">${d.maxBudget.toLocaleString()}</div>
          <Link to={`/marketplace/wanted/new?draft=${d.id}`} className="btn-ghost btn-sm mt-2 w-full">Edit local draft</Link>
        </div>
      ))}
    </div>
  </section>
);
