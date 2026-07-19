import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { boms, bomCost, bomMass, type Bom } from "@/data/boms";
import { parts, partById, lowestPrice, categoryLabel, type Part, type PartCategory } from "@/data/parts";
import { toast } from "@/hooks/use-toast";
import { RotateCcw, Download, Copy, Plus, X, Repeat2, Copy as CopyIcon, Search, Info } from "lucide-react";

type SlotRow = { rid: string; slot: string; partId: string; qty: number };
type Risk = "low" | "med" | "high";

const rid = () => Math.random().toString(36).slice(2, 10);
const withRid = (slots: Bom["slots"]): SlotRow[] => slots.map(s => ({ rid: rid(), ...s }));

const money = (n: number | null) => n == null ? "—" : `$${Math.round(n).toLocaleString()}`;
const num = (n: number | null, unit = "") => n == null ? "—" : `${n}${unit}`;
const kg = (n: number | null) => n == null ? "—" : `${n.toFixed(2)} kg`;

type RowMetrics = {
  part: Part | undefined;
  unit: number | null;
  ext: number | null;
  mass: number | null;
  lead: number | null;
  suppliers: number;
  failures: number;
  risk: Risk;
  reasons: string[];
};

function metricsFor(s: SlotRow): RowMetrics {
  const p = partById(s.partId);
  if (!p) {
    return { part: undefined, unit: null, ext: null, mass: null, lead: null, suppliers: 0, failures: 0, risk: "high", reasons: ["part not found"] };
  }
  const suppliers = p.offers.length;
  const unit = suppliers > 0 ? Math.min(...p.offers.map(o => o.price)) : null;
  const lead = suppliers > 0 ? Math.min(...p.offers.map(o => o.leadDays)) : null;
  const ext = unit == null ? null : unit * s.qty;
  const mass = "weightKg" in p && typeof (p as any).weightKg === "number" ? (p as any).weightKg * s.qty : null;
  const reasons: string[] = [];
  if (suppliers === 0) reasons.push("no offers");
  if (suppliers === 1) reasons.push("single supplier");
  if (lead != null && lead >= 30) reasons.push(`long lead (${lead}d)`);
  else if (lead != null && lead >= 21) reasons.push(`lead ${lead}d`);
  if (p.failures > 10) reasons.push(`${p.failures} failure reports`);
  else if (p.failures > 5) reasons.push(`${p.failures} failures`);
  let risk: Risk = "low";
  const supplyConcern = suppliers <= 1;
  const leadConcern = lead != null && lead >= 21;
  const relConcern = p.failures > 10;
  if (suppliers === 0 || (supplyConcern && (leadConcern || relConcern))) risk = "high";
  else if (supplyConcern || leadConcern || relConcern || p.failures > 5) risk = "med";
  return { part: p, unit, ext, mass, lead, suppliers, failures: p.failures, risk, reasons };
}

function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function Builder() {
  const [template, setTemplate] = useState<Bom>(boms[0]);
  const [slots, setSlots] = useState<SlotRow[]>(withRid(boms[0].slots));
  const [swapRid, setSwapRid] = useState<string | null>(null);
  const [swapQuery, setSwapQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addCat, setAddCat] = useState<PartCategory | "all">("all");
  const [sp, setSp] = useSearchParams();

  // Read optional ?add=<partId> once per query change: append component as a new local
  // slot, toast honestly, then strip the param so refresh does not duplicate.
  useEffect(() => {
    const addId = sp.get("add");
    if (!addId) return;
    const p = partById(addId);
    const next = new URLSearchParams(sp);
    next.delete("add");
    setSp(next, { replace: true });
    if (p) {
      setSlots(prev => [...prev, { rid: rid(), slot: `Custom · ${categoryLabel[p.category]}`, partId: p.id, qty: 1 }]);
      toast({ title: "Component added to local BOM", description: `${p.name} added as a new slot. Changes stay in this browser only.` });
    } else {
      toast({ title: "Unknown component id", description: `"${addId}" was not found in the catalog.`, variant: "destructive" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.get("add")]);

  const loadTemplate = (b: Bom) => {
    setTemplate(b);
    setSlots(withRid(b.slots));
    setSwapRid(null);
    setShowAdd(false);
  };
  const resetTemplate = () => {
    setSlots(withRid(template.slots));
    setSwapRid(null);
    toast({ title: "Reset", description: `Restored ${template.name} to its baseline slots.` });
  };

  const rowMetrics = useMemo(() => slots.map(s => ({ s, m: metricsFor(s) })), [slots]);

  const totals = useMemo(() => {
    let cost = 0, mass = 0, power = 0, lead = 0;
    let unitQty = 0, multiSource = 0, missingOffers = 0;
    const unique = new Set<string>();
    const byCat: Record<string, { cost: number; qty: number }> = {};
    const risks: Record<Risk, number> = { low: 0, med: 0, high: 0 };
    const supply: string[] = [], long: string[] = [], rel: string[] = [];
    rowMetrics.forEach(({ s, m }) => {
      unitQty += s.qty;
      if (m.part) unique.add(m.part.id);
      if (m.ext != null) cost += m.ext;
      if (m.mass != null) mass += m.mass;
      if (m.part && m.part.category === "compute") power += (m.part as any).powerW * s.qty;
      if (m.lead != null) lead = Math.max(lead, m.lead);
      if (m.suppliers >= 2) multiSource += 1;
      if (m.suppliers === 0) missingOffers += 1;
      risks[m.risk] += 1;
      if (m.part) {
        const key = m.part.category;
        byCat[key] = byCat[key] ?? { cost: 0, qty: 0 };
        byCat[key].cost += m.ext ?? 0;
        byCat[key].qty += s.qty;
        if (m.suppliers <= 1) supply.push(`${s.slot}: ${m.part.name} — ${m.suppliers === 0 ? "no offers" : "single supplier"}`);
        if (m.lead != null && m.lead >= 21) long.push(`${s.slot}: ${m.part.name} — ${m.lead}d lead`);
        if (m.part.failures > 5) rel.push(`${s.slot}: ${m.part.name} — ${m.part.failures} failure reports`);
      }
    });
    const coverage = slots.length > 0 ? multiSource / slots.length : 0;
    return {
      cost, mass, power, lead: lead || null, unitQty,
      unique: unique.size, coverage, missingOffers,
      byCat, risks, supply, long, rel,
      warnings: risks.high + risks.med,
    };
  }, [rowMetrics, slots.length]);

  const swapRow = swapRid ? rowMetrics.find(r => r.s.rid === swapRid) ?? null : null;

  const swapOptions = useMemo(() => {
    if (!swapRow?.m.part) return [];
    const cat = swapRow.m.part.category;
    const q = swapQuery.trim().toLowerCase();
    return parts
      .filter(p => p.category === cat && p.id !== swapRow.m.part!.id)
      .filter(p => !q || p.name.toLowerCase().includes(q) || p.maker.toLowerCase().includes(q) || p.tags.some(t => t.toLowerCase().includes(q)))
      .sort((a, b) => lowestPrice(a) - lowestPrice(b));
  }, [swapRow, swapQuery]);

  const addOptions = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    return parts
      .filter(p => addCat === "all" || p.category === addCat)
      .filter(p => !q || p.name.toLowerCase().includes(q) || p.maker.toLowerCase().includes(q) || p.tags.some(t => t.toLowerCase().includes(q)))
      .slice(0, 40);
  }, [addQuery, addCat]);

  const updateQty = (rowId: string, qty: number) =>
    setSlots(prev => prev.map(x => x.rid === rowId ? { ...x, qty: Math.max(1, Math.floor(qty || 1)) } : x));
  const duplicateRow = (rowId: string) => setSlots(prev => {
    const i = prev.findIndex(x => x.rid === rowId); if (i < 0) return prev;
    const copy = { ...prev[i], rid: rid(), slot: `${prev[i].slot} (copy)` };
    return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
  });
  const removeRow = (rowId: string) => setSlots(prev => prev.filter(x => x.rid !== rowId));
  const applySwap = (rowId: string, p: Part) => {
    setSlots(prev => prev.map(x => x.rid === rowId ? { ...x, partId: p.id } : x));
    setSwapRid(null); setSwapQuery("");
  };
  const addPart = (p: Part) => {
    setSlots(prev => [...prev, { rid: rid(), slot: `Custom · ${categoryLabel[p.category]}`, partId: p.id, qty: 1 }]);
    setShowAdd(false); setAddQuery("");
    toast({ title: "Added", description: `${p.name} added as a new slot.` });
  };

  const exportCsv = () => {
    const header = ["Slot","Part","Maker","Category","Qty","Unit USD","Extended USD","Mass kg","Lead days","Suppliers","Failures","Risk","Reasons"];
    const rows = rowMetrics.map(({ s, m }) => [
      s.slot,
      m.part?.name ?? "(missing)",
      m.part?.maker ?? "",
      m.part?.category ?? "",
      s.qty,
      m.unit ?? "",
      m.ext ?? "",
      m.mass != null ? m.mass.toFixed(3) : "",
      m.lead ?? "",
      m.suppliers,
      m.failures,
      m.risk,
      m.reasons.join("; "),
    ]);
    const totalsRow = ["TOTAL","","","", totals.unitQty, "", Math.round(totals.cost), totals.mass.toFixed(3), totals.lead ?? "", "", "", "", `high:${totals.risks.high} med:${totals.risks.med}`];
    const csv = [header, ...rows, totalsRow].map(r => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${template.slug}-bom.csv`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported", description: `${template.slug}-bom.csv` });
  };

  const copySummary = async () => {
    const lines = [
      `BOM: ${template.name} (${template.subsystem})`,
      `Slots: ${slots.length} · Units: ${totals.unitQty} · Unique parts: ${totals.unique}`,
      `Total cost: ${money(totals.cost)} · Mass: ${kg(totals.mass)} · Compute: ${totals.power} W · Slowest lead: ${num(totals.lead, "d")}`,
      `Supplier coverage (multi-source): ${Math.round(totals.coverage * 100)}% · Risk: ${totals.risks.high} high / ${totals.risks.med} med / ${totals.risks.low} low`,
      "",
      ...rowMetrics.map(({ s, m }) => `- ${s.slot} × ${s.qty} — ${m.part?.name ?? "(missing)"} — ${money(m.ext)} — ${m.risk}${m.reasons.length ? ` (${m.reasons.join(", ")})` : ""}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast({ title: "Copied", description: "BOM summary copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Clipboard not available.", variant: "destructive" });
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-title mb-1">Tools · BOM builder</div>
          <h1 className="text-[22px] font-bold tracking-tight">{template.name}</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <Info className="h-3 w-3" /> Local configuration only — changes stay in this browser and reset on refresh.
            <span className="mx-1">·</span>
            <span className="uppercase tracking-wide">{template.subsystem}</span>
            <span className="mx-1">·</span>
            <span className="mono">{slots.length} slots · {totals.unitQty} units</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={resetTemplate} className="btn-ghost btn-sm inline-flex items-center gap-1"><RotateCcw className="h-3.5 w-3.5" /> Reset to template</button>
          <button onClick={copySummary} className="btn-ghost btn-sm inline-flex items-center gap-1"><Copy className="h-3.5 w-3.5" /> Copy summary</button>
          <button onClick={exportCsv} className="btn-primary btn-sm inline-flex items-center gap-1"><Download className="h-3.5 w-3.5" /> Export CSV</button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mt-4 surface-card grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 divide-x divide-border overflow-hidden">
        <Kpi label="Total cost" value={money(totals.cost)} strong />
        <Kpi label="Mass" value={kg(totals.mass)} />
        <Kpi label="Compute" value={`${totals.power} W`} />
        <Kpi label="Slowest lead" value={num(totals.lead, "d")} />
        <Kpi label="Units" value={String(totals.unitQty)} />
        <Kpi label="Unique parts" value={String(totals.unique)} />
        <Kpi label="Multi-source" value={`${Math.round(totals.coverage * 100)}%`}
          tone={totals.coverage >= 0.5 ? "good" : totals.coverage >= 0.25 ? "warn" : "bad"} />
        <Kpi label="Warnings" value={String(totals.warnings)} tone={totals.risks.high > 0 ? "bad" : totals.warnings > 0 ? "warn" : "good"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[260px_1fr_320px]">
        {/* Template rail */}
        <aside className="surface-card p-3 h-fit">
          <div className="section-title mb-2">Templates</div>
          <ul className="space-y-1">
            {boms.map(b => {
              const active = template.id === b.id;
              const baseCost = bomCost(b);
              const baseMass = bomMass(b);
              const unitQty = b.slots.reduce((n, s) => n + s.qty, 0);
              return (
                <li key={b.id}>
                  <button onClick={() => loadTemplate(b)} aria-pressed={active}
                    className={`w-full text-left rounded px-2 py-1.5 text-[13px] border ${active ? "bg-primary/15 border-primary/40" : "border-transparent hover:bg-muted"}`}>
                    <div className="font-medium leading-tight">{b.name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      <span className="uppercase tracking-wide">{b.subsystem}</span>
                      <span> · {b.slots.length} slots · {unitQty} units</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mono mt-0.5">
                      {money(baseCost)} · {kg(baseMass)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Main table */}
        <section className="space-y-3 min-w-0">
          <div className="surface-card overflow-x-auto">
            <table className="data-table min-w-[900px]">
              <thead><tr>
                <th>Slot</th><th>Part / Maker</th><th>Category</th><th className="text-right">Qty</th>
                <th className="text-right">Unit</th><th className="text-right">Ext</th><th className="text-right">Mass</th>
                <th className="text-right">Lead</th><th className="text-right">Suppl.</th><th className="text-right">Fails</th>
                <th>Risk</th><th className="text-right">Actions</th>
              </tr></thead>
              <tbody>
                {rowMetrics.length === 0 && (
                  <tr><td colSpan={12} className="text-center text-muted-foreground text-[12px] py-6">No slots. Add a catalog part below.</td></tr>
                )}
                {rowMetrics.map(({ s, m }) => {
                  const p = m.part;
                  return (
                    <tr key={s.rid} className={swapRid === s.rid ? "bg-primary/5" : ""}>
                      <td className="text-[12px] text-muted-foreground">{s.slot}</td>
                      <td>
                        {p ? (
                          <>
                            <Link to={`/parts/${p.category}/${p.slug}`} className="font-medium hover:text-primary">{p.name}</Link>
                            <div className="text-[11px] text-muted-foreground">{p.maker}</div>
                          </>
                        ) : <span className="text-[11px] text-negative">missing part {s.partId}</span>}
                      </td>
                      <td className="text-[11px] text-muted-foreground uppercase">{p?.category ?? "—"}</td>
                      <td className="text-right">
                        <input type="number" min={1} value={s.qty}
                          aria-label={`Quantity for ${s.slot}`}
                          onChange={e => updateQty(s.rid, +e.target.value)}
                          className="input-bare h-7 w-16 mono text-right" />
                      </td>
                      <td className="mono text-right">{money(m.unit)}</td>
                      <td className="mono text-right font-semibold">{money(m.ext)}</td>
                      <td className="mono text-right">{kg(m.mass)}</td>
                      <td className="mono text-right">{num(m.lead, "d")}</td>
                      <td className="mono text-right">{m.suppliers}</td>
                      <td className="mono text-right">{m.failures}</td>
                      <td>
                        <span className={`pill ${m.risk === "low" ? "pill-good" : m.risk === "med" ? "pill-warn" : "pill-bad"}`}>{m.risk}</span>
                        {m.reasons.length > 0 && (
                          <div className="text-[10.5px] text-muted-foreground mt-0.5 leading-tight max-w-[180px]">
                            {m.reasons.join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <button onClick={() => { setSwapRid(swapRid === s.rid ? null : s.rid); setSwapQuery(""); }}
                          className="btn-ghost btn-sm inline-flex items-center gap-1" aria-label={`Swap ${s.slot}`}>
                          <Repeat2 className="h-3.5 w-3.5" /> {swapRid === s.rid ? "Close" : "Swap"}
                        </button>
                        <button onClick={() => duplicateRow(s.rid)} className="btn-ghost btn-sm inline-flex items-center gap-1 ml-1" aria-label={`Duplicate ${s.slot}`}>
                          <CopyIcon className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => removeRow(s.rid)} className="btn-ghost btn-sm inline-flex items-center gap-1 ml-1 text-negative" aria-label={`Remove ${s.slot}`}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add catalog part */}
          <div className="surface-card">
            <div className="flex items-center justify-between p-3">
              <div>
                <div className="section-title">Add catalog part</div>
                <div className="text-[11px] text-muted-foreground">Creates a new local slot with quantity 1.</div>
              </div>
              <button onClick={() => setShowAdd(v => !v)} aria-expanded={showAdd} className="btn-primary btn-sm inline-flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> {showAdd ? "Close" : "Add part"}
              </button>
            </div>
            {showAdd && (
              <div className="border-t border-border p-3 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <label className="flex-1 min-w-[200px] relative">
                    <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input value={addQuery} onChange={e => setAddQuery(e.target.value)}
                      placeholder="Search parts, makers, tags…"
                      className="input-bare w-full h-8 pl-7" />
                  </label>
                  <select value={addCat} onChange={e => setAddCat(e.target.value as any)} className="input-bare h-8">
                    <option value="all">All categories</option>
                    {(Object.keys(categoryLabel) as PartCategory[]).map(c => <option key={c} value={c}>{categoryLabel[c]}</option>)}
                  </select>
                </div>
                <div className="max-h-[280px] overflow-y-auto border border-border rounded">
                  <table className="data-table">
                    <thead><tr><th>Part</th><th>Maker</th><th>Category</th><th className="text-right">Unit</th><th className="text-right">Suppl.</th><th></th></tr></thead>
                    <tbody>
                      {addOptions.length === 0 && <tr><td colSpan={6} className="text-center text-muted-foreground text-[12px] py-4">No matching parts.</td></tr>}
                      {addOptions.map(p => (
                        <tr key={p.id}>
                          <td><Link to={`/parts/${p.category}/${p.slug}`} className="hover:text-primary">{p.name}</Link></td>
                          <td className="text-[11px] text-muted-foreground">{p.maker}</td>
                          <td className="text-[11px] uppercase text-muted-foreground">{p.category}</td>
                          <td className="mono text-right">{money(p.offers.length ? lowestPrice(p) : null)}</td>
                          <td className="mono text-right">{p.offers.length}</td>
                          <td className="text-right"><button onClick={() => addPart(p)} className="btn-primary btn-sm">Add</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Swap panel */}
          {swapRow && swapRow.m.part && (
            <div className="surface-card">
              <div className="p-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="section-title">Swap · {swapRow.s.slot}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Alternatives in <span className="uppercase">{swapRow.m.part.category}</span>, sorted by unit price.
                  </div>
                </div>
                <label className="relative w-64 max-w-full">
                  <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={swapQuery} onChange={e => setSwapQuery(e.target.value)}
                    placeholder="Filter alternatives" className="input-bare w-full h-8 pl-7" />
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table min-w-[820px]">
                  <thead><tr>
                    <th>Part / Maker</th><th>Key specs</th>
                    <th className="text-right">Unit</th><th className="text-right">ΔPrice</th>
                    <th className="text-right">Mass</th><th className="text-right">ΔMass</th>
                    <th className="text-right">Suppl.</th><th className="text-right">Lead</th>
                    <th className="text-right">Fails</th><th className="text-right"></th>
                  </tr></thead>
                  <tbody>
                    {swapOptions.length === 0 && <tr><td colSpan={10} className="text-center text-muted-foreground text-[12px] py-4">No alternatives match.</td></tr>}
                    {swapOptions.map(opt => {
                      const cur = swapRow.m.part!;
                      const curUnit = swapRow.m.unit;
                      const optUnit = opt.offers.length ? lowestPrice(opt) : null;
                      const dPrice = optUnit != null && curUnit != null ? optUnit - curUnit : null;
                      const curMass = ("weightKg" in cur ? (cur as any).weightKg : null) as number | null;
                      const optMass = ("weightKg" in opt ? (opt as any).weightKg : null) as number | null;
                      const dMass = optMass != null && curMass != null ? +(optMass - curMass).toFixed(3) : null;
                      const optLead = opt.offers.length ? Math.min(...opt.offers.map(o => o.leadDays)) : null;
                      return (
                        <tr key={opt.id}>
                          <td>
                            <Link to={`/parts/${opt.category}/${opt.slug}`} className="font-medium hover:text-primary">{opt.name}</Link>
                            <div className="text-[11px] text-muted-foreground">{opt.maker}</div>
                          </td>
                          <td className="text-[11px] text-muted-foreground">{keySpecs(opt)}</td>
                          <td className="mono text-right">{money(optUnit)}</td>
                          <td className={`mono text-right ${dPrice == null ? "" : dPrice < 0 ? "text-positive" : dPrice > 0 ? "text-negative" : ""}`}>
                            {dPrice == null ? "—" : `${dPrice > 0 ? "+" : ""}${money(dPrice).replace("$","$")}`}
                          </td>
                          <td className="mono text-right">{optMass == null ? "—" : `${optMass.toFixed(2)} kg`}</td>
                          <td className={`mono text-right ${dMass == null ? "" : dMass < 0 ? "text-positive" : dMass > 0 ? "text-negative" : ""}`}>
                            {dMass == null ? "—" : `${dMass > 0 ? "+" : ""}${dMass} kg`}
                          </td>
                          <td className="mono text-right">{opt.offers.length}</td>
                          <td className="mono text-right">{num(optLead, "d")}</td>
                          <td className="mono text-right">{opt.failures}</td>
                          <td className="text-right"><button className="btn-primary btn-sm" onClick={() => applySwap(swapRow.s.rid, opt)}>Use</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Right rail */}
        <aside className="space-y-3 lg:sticky lg:top-20 h-fit">
          <div className="surface-card p-3">
            <div className="section-title mb-2">Cost composition</div>
            {Object.keys(totals.byCat).length === 0 ? (
              <div className="text-[12px] text-muted-foreground">No priced items.</div>
            ) : (
              <ul className="space-y-1.5">
                {Object.entries(totals.byCat)
                  .sort((a, b) => b[1].cost - a[1].cost)
                  .map(([cat, v]) => {
                    const pct = totals.cost > 0 ? (v.cost / totals.cost) * 100 : 0;
                    return (
                      <li key={cat}>
                        <div className="flex justify-between text-[12px]">
                          <span>{categoryLabel[cat as PartCategory] ?? cat}</span>
                          <span className="mono text-muted-foreground">{money(v.cost)} · {Math.round(pct)}%</span>
                        </div>
                        <div className="h-1 bg-muted rounded overflow-hidden mt-1" aria-hidden>
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>

          <div className="surface-card p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="section-title">Supply & risk</div>
              <div className="flex gap-1 text-[10.5px] mono">
                <span className="pill pill-bad">{totals.risks.high} high</span>
                <span className="pill pill-warn">{totals.risks.med} med</span>
                <span className="pill pill-good">{totals.risks.low} low</span>
              </div>
            </div>
            <RiskGroup title="Supply concentration" items={totals.supply} />
            <RiskGroup title="Long lead times" items={totals.long} />
            <RiskGroup title="Reliability reports" items={totals.rel} />
            {totals.missingOffers > 0 && (
              <div className="text-[11px] text-negative mt-2">{totals.missingOffers} row(s) with no known offers — cost/lead shown as —.</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function keySpecs(p: Part): string {
  switch (p.category) {
    case "actuator": return `${p.peakNm} Nm peak · ${p.contNm} Nm cont · ${p.weightKg} kg`;
    case "hand": return `${p.dof} DOF · ${p.actuatedDof} act · ${p.gripForceN} N`;
    case "sensor": return `${p.type} · ${p.hz} Hz · ${p.rangeM} m`;
    case "compute": return `${p.tops} TOPS · ${p.ramGb} GB · ${p.powerW} W`;
    case "driver": return `${p.maxCurrentA} A · ${p.voltageV} V`;
    case "reducer": return `${p.ratio}:1 · ${p.ratedTorqueNm} Nm rated · ${p.type}`;
  }
}

const Kpi = ({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "good"|"warn"|"bad" }) => (
  <div className="p-2.5">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className={`mono ${strong ? "text-[15px] font-bold" : "text-[13px]"} ${tone === "good" ? "text-positive" : tone === "warn" ? "text-warning" : tone === "bad" ? "text-negative" : ""}`}>
      {value}
    </div>
  </div>
);

const RiskGroup = ({ title, items }: { title: string; items: string[] }) => (
  <div className="mt-2 first:mt-0">
    <div className="text-[11px] font-medium">{title} <span className="text-muted-foreground mono">({items.length})</span></div>
    {items.length === 0 ? (
      <div className="text-[11px] text-muted-foreground">None detected.</div>
    ) : (
      <ul className="text-[11px] text-muted-foreground space-y-0.5 mt-1">
        {items.slice(0, 6).map((s, i) => <li key={i}>• {s}</li>)}
        {items.length > 6 && <li>+ {items.length - 6} more</li>}
      </ul>
    )}
  </div>
);
