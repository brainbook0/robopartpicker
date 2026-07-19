import { useMemo, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import {
  categoryLabel, lowestPrice,
  type PartCategory, type Actuator, type Hand, type Sensor, type Compute, type Driver, type Reducer, type Part,
} from "@/shared/catalog";
import { useComponents } from "@/lib/api/catalog";
import { PartsTable } from "@/components/parts/PartsTable";
import { PageHeader } from "@/components/common/PageHeader";
import { CatalogDataNotice } from "@/components/parts/CatalogDataNotice";
import { CompareTray } from "@/components/parts/CompareTray";

const allCats: PartCategory[] = ["actuator","hand","sensor","compute","driver","reducer"];
const joints = ["shoulder","elbow","wrist","hip","knee","ankle","neck","gripper"];
const regions = ["US","EU","CN","JP","KR"];

type SortKey =
  | "price-asc" | "price-desc" | "name"
  | "weight-asc" | "torque-desc" | "failures-asc" | "lead-asc";

const ALL_SORTS: SortKey[] = ["price-asc","price-desc","name","weight-asc","torque-desc","failures-asc","lead-asc"];

const Chip = ({ on, children, onClick }: { on?: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button onClick={onClick} className={`pill ${on ? "pill-yellow" : ""}`}>{children}</button>
);

const Section = ({ title, children, defaultOpen = true, count }: { title: string; children: React.ReactNode; defaultOpen?: boolean; count?: number }) => (
  <details className="filter-group" open={defaultOpen}>
    <summary>
      <span>{title}{count !== undefined && count > 0 && <span className="ml-1 pill pill-yellow">{count}</span>}</span>
    </summary>
    <div className="pt-1">{children}</div>
  </details>
);

const median = (nums: number[]): number | null => {
  if (!nums.length) return null;
  const s = [...nums].sort((a,b) => a-b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m-1] + s[m]) / 2);
};

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="p-2">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mono text-[13px] text-foreground">{value}</div>
  </div>
);

export default function PartsCatalog() {
  const { category = "actuator" } = useParams<{ category: PartCategory }>();
  const cat = (allCats.includes(category as PartCategory) ? category : "actuator") as PartCategory;
  const [sp, setSp] = useSearchParams();
  const [wsTick, setWsTick] = useState(0);

  const getStr = (k: string) => sp.get(k) ?? "";
  const getNum = (k: string, opts: { allowNegative?: boolean } = {}) => {
    const v = sp.get(k);
    if (v == null || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    if (!opts.allowNegative && n < 0) return null;
    return n;
  };
  const getBool = (k: string) => sp.get(k) === "true";
  const getList = (k: string) => (sp.get(k) ?? "").split(",").filter(Boolean);

  const q = getStr("q");
  const joint = getStr("joint");
  const protocol = getStr("protocol");
  const ros = getBool("ros");
  const opensrc = getBool("os");
  const cad = getBool("cad");
  const inStock = getBool("stock");
  const region = getList("region");            // Manufacturer region
  const supplyRegion = getList("supregion");   // Supplier region (from fixture offers)
  const makers = getList("maker");
  const priceMin = getNum("pmin");
  const priceMax = getNum("pmax");
  const wMax = getNum("wmax");
  const tMin = getNum("tmin");
  const vMin = getNum("vmin");
  const leadMax = getNum("lmax");
  const warMin = getNum("warmin");

  // Category-specific extras
  const dofMin = getNum("dofmin");
  const payloadMin = getNum("paymin");
  const gripMin = getNum("gripmin");
  const tactileOnly = getBool("tactile");
  const iface = getStr("iface");
  const sensorType = getStr("stype");
  const rangeMin = getNum("rmin");
  const hzMin = getNum("hzmin");
  const topsMin = getNum("topsmin");
  const ramMin = getNum("rammin");
  const powerMax = getNum("pwmax");
  const currMin = getNum("amin");
  const voltMinAll = getNum("voltmin");
  const redType = getStr("redtype");
  const rtMin = getNum("rtmin");
  const backlashMax = getNum("blmax");

  const rawSort = (sp.get("sort") ?? "price-asc") as SortKey;
  const sort: SortKey = ALL_SORTS.includes(rawSort) ? rawSort : "price-asc";

  const facetQuery = useComponents({ category: cat, limit: 100 });
  const componentQuery = useComponents({
    category: cat,
    q,
    manufacturerRegion: region,
    supplierRegion: supplyRegion,
    manufacturer: makers,
    minPrice: priceMin,
    maxPrice: priceMax,
    inStock,
    limit: 100,
  });
  const all = (componentQuery.data?.items ?? []) as Part[];
  const catalogAll = (facetQuery.data?.items ?? []) as Part[];
  const makerOptions = useMemo(() => Array.from(new Set(catalogAll.map(p => p.maker))).sort(), [catalogAll]);
  const supplierRegionOptions = useMemo(() => {
    const set = new Set<string>();
    catalogAll.forEach(p => p.offers.forEach(o => {
      if (o.supplierRegion) set.add(o.supplierRegion);
    }));
    return Array.from(set).sort();
  }, [catalogAll]);

  const filtered = useMemo(() => {
    let list = all.slice();
    if (ros) list = list.filter(p => p.rosSupport !== "none");
    if (opensrc) list = list.filter(p => p.openSource);
    if (cad) list = list.filter(p => p.cadAvailable);
    if (warMin !== null) list = list.filter(p => p.warrantyMonths >= warMin);
    if (leadMax !== null) list = list.filter(p => p.offers.some(o => o.leadDays <= leadMax));
    if (priceMin !== null) list = list.filter(p => lowestPrice(p) >= priceMin);
    if (priceMax !== null) list = list.filter(p => lowestPrice(p) <= priceMax);
    if (joint && cat === "actuator") list = list.filter(p => (p as Actuator).compatibility.some(c => c.includes(joint)));
    if (protocol && cat === "actuator") list = list.filter(p => (p as Actuator).protocol === protocol);
    if (cat === "actuator") {
      if (wMax !== null) list = list.filter(p => (p as Actuator).weightKg <= wMax);
      if (tMin !== null) list = list.filter(p => (p as Actuator).peakNm >= tMin);
      if (vMin !== null) list = list.filter(p => (p as Actuator).voltageV >= vMin);
    }
    if (cat === "hand") {
      if (dofMin !== null) list = list.filter(p => (p as Hand).dof >= dofMin);
      if (payloadMin !== null) list = list.filter(p => (p as Hand).payloadKg >= payloadMin);
      if (gripMin !== null) list = list.filter(p => (p as Hand).gripForceN >= gripMin);
      if (tactileOnly) list = list.filter(p => (p as Hand).tactile);
      if (iface) list = list.filter(p => (p as Hand).interface.toLowerCase().includes(iface.toLowerCase()));
    }
    if (cat === "sensor") {
      if (sensorType) list = list.filter(p => (p as Sensor).type === sensorType);
      if (rangeMin !== null) list = list.filter(p => (p as Sensor).rangeM >= rangeMin);
      if (hzMin !== null) list = list.filter(p => (p as Sensor).hz >= hzMin);
      if (iface) list = list.filter(p => (p as Sensor).interface.toLowerCase().includes(iface.toLowerCase()));
    }
    if (cat === "compute") {
      if (topsMin !== null) list = list.filter(p => (p as Compute).tops >= topsMin);
      if (ramMin !== null) list = list.filter(p => (p as Compute).ramGb >= ramMin);
      if (powerMax !== null) list = list.filter(p => (p as Compute).powerW <= powerMax);
    }
    if (cat === "driver") {
      if (currMin !== null) list = list.filter(p => (p as Driver).maxCurrentA >= currMin);
      if (voltMinAll !== null) list = list.filter(p => (p as Driver).voltageV >= voltMinAll);
      if (protocol) list = list.filter(p => (p as Driver).protocols.includes(protocol));
    }
    if (cat === "reducer") {
      if (redType) list = list.filter(p => (p as Reducer).type === redType);
      if (rtMin !== null) list = list.filter(p => (p as Reducer).ratedTorqueNm >= rtMin);
      if (backlashMax !== null) list = list.filter(p => (p as Reducer).backlashArcmin <= backlashMax);
    }

    const lp = (p: Part) => lowestPrice(p);
    const ml = (p: Part) => p.offers.reduce((m,o) => Math.min(m,o.leadDays), 999);
    if (sort === "price-asc") list.sort((a,b) => lp(a) - lp(b));
    if (sort === "price-desc") list.sort((a,b) => lp(b) - lp(a));
    if (sort === "name") list.sort((a,b) => a.name.localeCompare(b.name));
    if (sort === "failures-asc") list.sort((a,b) => a.failures - b.failures);
    if (sort === "lead-asc") list.sort((a,b) => ml(a) - ml(b));
    if (sort === "weight-asc" && cat === "actuator") list.sort((a,b) => (a as Actuator).weightKg - (b as Actuator).weightKg);
    if (sort === "torque-desc" && cat === "actuator") list.sort((a,b) => (b as Actuator).peakNm - (a as Actuator).peakNm);
    return list;
  }, [all, ros, opensrc, cad, warMin, leadMax, priceMin, priceMax, joint, protocol, wMax, tMin, vMin, sort, cat, dofMin, payloadMin, gripMin, tactileOnly, iface, sensorType, rangeMin, hzMin, topsMin, ramMin, powerMax, currMin, voltMinAll, redType, rtMin, backlashMax]);

  // Category-scoped fixture overview (honest labels — nothing here is a live signal).
  const overview = useMemo(() => {
    const makerCount = new Set(catalogAll.map(p => p.maker)).size;
    const knownOffers = catalogAll.reduce((n, p) => n + p.offers.length, 0);
    const multiSource = catalogAll.filter(p => p.offers.length >= 2).length;
    const stockedOffers = catalogAll.reduce((n, p) => n + p.offers.filter(o => o.stock > 0).length, 0);
    const prices = catalogAll.filter(p => p.offers.length).map(p => lowestPrice(p));
    const shortestLeads = catalogAll.filter(p => p.offers.length).map(p => Math.min(...p.offers.map(o => o.leadDays)));
    return { count: facetQuery.data?.total ?? catalogAll.length, makers: makerCount, knownOffers, multiSource, stockedOffers, medianPrice: median(prices), medianLead: median(shortestLeads) };
  }, [catalogAll, facetQuery.data?.total]);

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v); else next.delete(k);
    setSp(next, { replace: true });
  };
  const toggleList = (k: string, v: string) => {
    const cur = getList(k);
    const has = cur.includes(v);
    const next = has ? cur.filter(x => x !== v) : [...cur, v];
    setParam(k, next.length ? next.join(",") : null);
  };
  const clearAll = () => setSp(new URLSearchParams(), { replace: true });
  const activeCount =
    (q?1:0)+(joint?1:0)+(protocol?1:0)+(ros?1:0)+(opensrc?1:0)+(cad?1:0)+(inStock?1:0)+
    region.length+supplyRegion.length+makers.length+(priceMin!==null?1:0)+(priceMax!==null?1:0)+
    (wMax!==null?1:0)+(tMin!==null?1:0)+(vMin!==null?1:0)+(leadMax!==null?1:0)+(warMin!==null?1:0)+
    (dofMin!==null?1:0)+(payloadMin!==null?1:0)+(gripMin!==null?1:0)+(tactileOnly?1:0)+(iface?1:0)+
    (sensorType?1:0)+(rangeMin!==null?1:0)+(hzMin!==null?1:0)+(topsMin!==null?1:0)+(ramMin!==null?1:0)+
    (powerMax!==null?1:0)+(currMin!==null?1:0)+(voltMinAll!==null?1:0)+(redType?1:0)+(rtMin!==null?1:0)+
    (backlashMax!==null?1:0);

  return (
    <>
      <PageHeader kicker="Catalog" title={categoryLabel[cat]} sub="Spec-by-spec comparison, supplier offers, fixture price history, and reported incidents. All records shown are static fixtures." />
      <div className="mx-auto max-w-[1400px] px-4 py-3">
        <CatalogDataNotice className="mb-3" />

        <div className="surface-card mb-3 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 divide-x divide-border overflow-hidden text-[11px]">
          <Stat label="Components" value={overview.count} />
          <Stat label="Makers" value={overview.makers} />
          <Stat label="Known offers" value={overview.knownOffers} />
          <Stat label="Multi-source" value={`${overview.multiSource}/${overview.count}`} />
          <Stat label="In-stock offers" value={overview.stockedOffers} />
          <Stat label="Median $ (fixture)" value={overview.medianPrice != null ? `$${overview.medianPrice.toLocaleString()}` : "—"} />
          <Stat label="Median lead (fixture)" value={overview.medianLead != null ? `${overview.medianLead}d` : "—"} />
        </div>

        <div className="grid gap-3 lg:grid-cols-[212px_1fr]">
          <aside className="surface-card p-2.5 h-fit lg:sticky lg:top-[112px] max-h-[calc(100vh-120px)] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="section-title">Filters {activeCount > 0 && <span className="ml-1 pill pill-yellow">{activeCount}</span>}</div>
              {activeCount > 0 && <button onClick={clearAll} className="text-[11px] text-muted-foreground hover:text-primary">clear</button>}
            </div>

            <Section title="Search" count={q ? 1 : 0}>
              <input className="input-bare" placeholder="name, maker, tag, blurb…" value={q}
                onChange={(e) => setParam("q", e.target.value || null)} />
            </Section>

            <Section title="Price (USD, fixture)" count={(priceMin!==null?1:0)+(priceMax!==null?1:0)}>
              <div className="grid grid-cols-2 gap-1.5">
                <input type="number" className="input-bare" placeholder="min" value={priceMin ?? ""} onChange={e => setParam("pmin", e.target.value || null)} />
                <input type="number" className="input-bare" placeholder="max" value={priceMax ?? ""} onChange={e => setParam("pmax", e.target.value || null)} />
              </div>
            </Section>

            {cat === "actuator" && (
              <>
                <Section title="Joint compatibility" count={joint?1:0}>
                  <div className="flex flex-wrap gap-1">
                    <Chip on={!joint} onClick={() => setParam("joint", null)}>any</Chip>
                    {joints.map(j => <Chip key={j} on={j===joint} onClick={() => setParam("joint", j===joint?null:j)}>{j}</Chip>)}
                  </div>
                </Section>
                <Section title="Protocol" count={protocol?1:0}>
                  <div className="flex flex-wrap gap-1">
                    {["CAN","CAN-FD","RS485","EtherCAT"].map(pr => (
                      <Chip key={pr} on={pr===protocol} onClick={() => setParam("protocol", pr===protocol?null:pr)}>{pr}</Chip>
                    ))}
                  </div>
                </Section>
                <Section title="Mechanical / electrical" count={(tMin!==null?1:0)+(wMax!==null?1:0)+(vMin!==null?1:0)}>
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="text-[11px] text-muted-foreground">Torque ≥
                      <input type="number" className="input-bare mt-0.5" placeholder="Nm" value={tMin ?? ""} onChange={e => setParam("tmin", e.target.value || null)} />
                    </label>
                    <label className="text-[11px] text-muted-foreground">Weight ≤
                      <input type="number" step="0.1" className="input-bare mt-0.5" placeholder="kg" value={wMax ?? ""} onChange={e => setParam("wmax", e.target.value || null)} />
                    </label>
                    <label className="text-[11px] text-muted-foreground col-span-2">Voltage ≥
                      <input type="number" className="input-bare mt-0.5" placeholder="V" value={vMin ?? ""} onChange={e => setParam("vmin", e.target.value || null)} />
                    </label>
                  </div>
                </Section>
              </>
            )}

            {cat === "hand" && (
              <Section title="Hand specs" count={(dofMin!==null?1:0)+(payloadMin!==null?1:0)+(gripMin!==null?1:0)+(tactileOnly?1:0)+(iface?1:0)}>
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="text-[11px] text-muted-foreground">Min DoF
                    <input type="number" className="input-bare mt-0.5" value={dofMin ?? ""} onChange={e => setParam("dofmin", e.target.value || null)} />
                  </label>
                  <label className="text-[11px] text-muted-foreground">Min payload (kg)
                    <input type="number" step="0.1" className="input-bare mt-0.5" value={payloadMin ?? ""} onChange={e => setParam("paymin", e.target.value || null)} />
                  </label>
                  <label className="text-[11px] text-muted-foreground">Min grip (N)
                    <input type="number" className="input-bare mt-0.5" value={gripMin ?? ""} onChange={e => setParam("gripmin", e.target.value || null)} />
                  </label>
                  <label className="text-[11px] text-muted-foreground">Interface contains
                    <input className="input-bare mt-0.5" placeholder="EtherCAT, CAN…" value={iface} onChange={e => setParam("iface", e.target.value || null)} />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-[12px] py-0.5 mt-1">
                  <input type="checkbox" checked={tactileOnly} onChange={e => setParam("tactile", e.target.checked ? "true" : null)} /> Tactile only
                </label>
              </Section>
            )}

            {cat === "sensor" && (
              <Section title="Sensor specs" count={(sensorType?1:0)+(rangeMin!==null?1:0)+(hzMin!==null?1:0)+(iface?1:0)}>
                <div className="flex flex-wrap gap-1 mb-1">
                  {(["depth","lidar","imu","tactile","rgb"] as const).map(t => (
                    <Chip key={t} on={t===sensorType} onClick={() => setParam("stype", t===sensorType?null:t)}>{t}</Chip>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="text-[11px] text-muted-foreground">Min range (m)
                    <input type="number" step="0.1" className="input-bare mt-0.5" value={rangeMin ?? ""} onChange={e => setParam("rmin", e.target.value || null)} />
                  </label>
                  <label className="text-[11px] text-muted-foreground">Min Hz
                    <input type="number" className="input-bare mt-0.5" value={hzMin ?? ""} onChange={e => setParam("hzmin", e.target.value || null)} />
                  </label>
                  <label className="text-[11px] text-muted-foreground col-span-2">Interface contains
                    <input className="input-bare mt-0.5" placeholder="USB3, Ethernet…" value={iface} onChange={e => setParam("iface", e.target.value || null)} />
                  </label>
                </div>
              </Section>
            )}

            {cat === "compute" && (
              <Section title="Compute specs" count={(topsMin!==null?1:0)+(ramMin!==null?1:0)+(powerMax!==null?1:0)}>
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="text-[11px] text-muted-foreground">Min TOPS
                    <input type="number" className="input-bare mt-0.5" value={topsMin ?? ""} onChange={e => setParam("topsmin", e.target.value || null)} />
                  </label>
                  <label className="text-[11px] text-muted-foreground">Min RAM (GB)
                    <input type="number" className="input-bare mt-0.5" value={ramMin ?? ""} onChange={e => setParam("rammin", e.target.value || null)} />
                  </label>
                  <label className="text-[11px] text-muted-foreground col-span-2">Max power (W)
                    <input type="number" className="input-bare mt-0.5" value={powerMax ?? ""} onChange={e => setParam("pwmax", e.target.value || null)} />
                  </label>
                </div>
              </Section>
            )}

            {cat === "driver" && (
              <Section title="Driver specs" count={(currMin!==null?1:0)+(voltMinAll!==null?1:0)+(protocol?1:0)}>
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="text-[11px] text-muted-foreground">Min current (A)
                    <input type="number" className="input-bare mt-0.5" value={currMin ?? ""} onChange={e => setParam("amin", e.target.value || null)} />
                  </label>
                  <label className="text-[11px] text-muted-foreground">Min voltage (V)
                    <input type="number" className="input-bare mt-0.5" value={voltMinAll ?? ""} onChange={e => setParam("voltmin", e.target.value || null)} />
                  </label>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {["CAN","CAN-FD","RS485","EtherCAT","USB"].map(pr => (
                    <Chip key={pr} on={pr===protocol} onClick={() => setParam("protocol", pr===protocol?null:pr)}>{pr}</Chip>
                  ))}
                </div>
              </Section>
            )}

            {cat === "reducer" && (
              <Section title="Reducer specs" count={(redType?1:0)+(rtMin!==null?1:0)+(backlashMax!==null?1:0)}>
                <div className="flex flex-wrap gap-1 mb-1">
                  {(["harmonic","cycloidal","planetary"] as const).map(t => (
                    <Chip key={t} on={t===redType} onClick={() => setParam("redtype", t===redType?null:t)}>{t}</Chip>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="text-[11px] text-muted-foreground">Min rated (Nm)
                    <input type="number" className="input-bare mt-0.5" value={rtMin ?? ""} onChange={e => setParam("rtmin", e.target.value || null)} />
                  </label>
                  <label className="text-[11px] text-muted-foreground">Max backlash (arcmin)
                    <input type="number" className="input-bare mt-0.5" value={backlashMax ?? ""} onChange={e => setParam("blmax", e.target.value || null)} />
                  </label>
                </div>
              </Section>
            )}

            <Section title="Maker" count={makers.length} defaultOpen={false}>
              <div className="max-h-32 overflow-y-auto flex flex-wrap gap-1">
                {makerOptions.map(m => <Chip key={m} on={makers.includes(m)} onClick={() => toggleList("maker", m)}>{m}</Chip>)}
              </div>
            </Section>

            <Section title="Manufacturer region" count={region.length}>
              <div className="flex flex-wrap gap-1">
                {regions.map(r => <Chip key={r} on={region.includes(r)} onClick={() => toggleList("region", r)}>{r}</Chip>)}
              </div>
            </Section>

            {supplierRegionOptions.length > 0 && (
              <Section title="Supplier region (fixture offers)" count={supplyRegion.length}>
                <div className="flex flex-wrap gap-1">
                  {supplierRegionOptions.map(r => <Chip key={r} on={supplyRegion.includes(r)} onClick={() => toggleList("supregion", r)}>{r}</Chip>)}
                </div>
              </Section>
            )}

            <Section title="Lead / warranty (fixture)" count={(leadMax!==null?1:0)+(warMin!==null?1:0)}>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="text-[11px] text-muted-foreground">Lead ≤
                  <input type="number" className="input-bare mt-0.5" placeholder="days" value={leadMax ?? ""} onChange={e => setParam("lmax", e.target.value || null)} />
                </label>
                <label className="text-[11px] text-muted-foreground">Warr ≥
                  <input type="number" className="input-bare mt-0.5" placeholder="mo" value={warMin ?? ""} onChange={e => setParam("warmin", e.target.value || null)} />
                </label>
              </div>
            </Section>

            <Section title="Attributes" count={(ros?1:0)+(opensrc?1:0)+(cad?1:0)+(inStock?1:0)}>
              <label className="flex items-center gap-2 text-[12px] py-0.5">
                <input type="checkbox" checked={ros} onChange={(e) => setParam("ros", e.target.checked?"true":null)} /> ROS native/community
              </label>
              <label className="flex items-center gap-2 text-[12px] py-0.5">
                <input type="checkbox" checked={opensrc} onChange={(e) => setParam("os", e.target.checked?"true":null)} /> Open source
              </label>
              <label className="flex items-center gap-2 text-[12px] py-0.5">
                <input type="checkbox" checked={cad} onChange={(e) => setParam("cad", e.target.checked?"true":null)} /> CAD available
              </label>
              <label className="flex items-center gap-2 text-[12px] py-0.5">
                <input type="checkbox" checked={inStock} onChange={(e) => setParam("stock", e.target.checked?"true":null)} /> Any fixture offer in stock
              </label>
            </Section>
          </aside>

          <section>
            <div className="surface-card mb-2 flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 text-[12px]">
              <div className="flex flex-wrap items-center gap-1">
                {allCats.map(c => (
                  <Link key={c} to={`/parts/${c}`}
                    className={`pill ${c===cat ? "pill-yellow" : ""}`}>{categoryLabel[c]}</Link>
                ))}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span><span className="mono text-foreground">{filtered.length}</span> / <span className="mono">{facetQuery.data?.total ?? catalogAll.length}</span> matches</span>
                <span className="h-3 w-px bg-border" />
                <label>Sort
                  <select className="ml-1 input-bare inline-block w-auto" value={sort} onChange={(e) => setParam("sort", e.target.value === "price-asc" ? null : e.target.value)}>
                    <option value="price-asc">price ↑</option>
                    <option value="price-desc">price ↓</option>
                    {cat === "actuator" && <option value="torque-desc">peak torque ↓</option>}
                    {cat === "actuator" && <option value="weight-asc">weight ↑</option>}
                    <option value="lead-asc">lead time ↑</option>
                    <option value="failures-asc">fixture reports ↑</option>
                    <option value="name">name A–Z</option>
                  </select>
                </label>
                {cat === "actuator" && <Link to="/finder/actuator" className="hover:text-primary">Guided finder →</Link>}
                {cat === "hand" && <Link to="/finder/hand" className="hover:text-primary">Guided finder →</Link>}
              </div>
            </div>
            {activeCount > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-1 text-[11px]">
                <span className="section-title">active:</span>
                {q && <button className="pill pill-yellow" onClick={() => setParam("q", null)}>q: {q} ×</button>}
                {joint && <button className="pill pill-yellow" onClick={() => setParam("joint", null)}>joint: {joint} ×</button>}
                {protocol && <button className="pill pill-yellow" onClick={() => setParam("protocol", null)}>{protocol} ×</button>}
                {tMin !== null && <button className="pill pill-yellow" onClick={() => setParam("tmin", null)}>≥{tMin}Nm ×</button>}
                {wMax !== null && <button className="pill pill-yellow" onClick={() => setParam("wmax", null)}>≤{wMax}kg ×</button>}
                {vMin !== null && <button className="pill pill-yellow" onClick={() => setParam("vmin", null)}>≥{vMin}V ×</button>}
                {priceMin !== null && <button className="pill pill-yellow" onClick={() => setParam("pmin", null)}>≥${priceMin} ×</button>}
                {priceMax !== null && <button className="pill pill-yellow" onClick={() => setParam("pmax", null)}>≤${priceMax} ×</button>}
                {leadMax !== null && <button className="pill pill-yellow" onClick={() => setParam("lmax", null)}>lead ≤{leadMax}d ×</button>}
                {warMin !== null && <button className="pill pill-yellow" onClick={() => setParam("warmin", null)}>warr ≥{warMin}mo ×</button>}
                {region.map(r => <button key={r} className="pill pill-yellow" onClick={() => toggleList("region", r)}>maker {r} ×</button>)}
                {supplyRegion.map(r => <button key={r} className="pill pill-yellow" onClick={() => toggleList("supregion", r)}>supplier {r} ×</button>)}
                {makers.map(m => <button key={m} className="pill pill-yellow" onClick={() => toggleList("maker", m)}>{m} ×</button>)}
                {ros && <button className="pill pill-yellow" onClick={() => setParam("ros", null)}>ROS ×</button>}
                {opensrc && <button className="pill pill-yellow" onClick={() => setParam("os", null)}>open source ×</button>}
                {cad && <button className="pill pill-yellow" onClick={() => setParam("cad", null)}>CAD ×</button>}
                {inStock && <button className="pill pill-yellow" onClick={() => setParam("stock", null)}>in stock ×</button>}
                {sensorType && <button className="pill pill-yellow" onClick={() => setParam("stype", null)}>{sensorType} ×</button>}
                {redType && <button className="pill pill-yellow" onClick={() => setParam("redtype", null)}>{redType} ×</button>}
                {tactileOnly && <button className="pill pill-yellow" onClick={() => setParam("tactile", null)}>tactile ×</button>}
              </div>
            )}
            {componentQuery.isPending || facetQuery.isPending ? (
              <div className="surface-card p-8 text-center" role="status">
                <div className="text-[13px] font-medium">Loading components from the local API…</div>
                <div className="text-[11.5px] text-muted-foreground mt-1">Querying D1 through the Worker.</div>
              </div>
            ) : componentQuery.isError || facetQuery.isError ? (
              <div className="surface-card p-8 text-center" role="alert">
                <div className="text-[13px] font-medium text-negative">Component data could not be loaded.</div>
                <div className="text-[11.5px] text-muted-foreground mt-1">{(componentQuery.error ?? facetQuery.error)?.message}</div>
                <button onClick={() => { void componentQuery.refetch(); void facetQuery.refetch(); }} className="btn-primary btn-sm mt-2">Retry</button>
              </div>
            ) : filtered.length ? (
              <PartsTable parts={filtered} onWorkspaceChange={() => setWsTick(t => t + 1)} />
            ) : (
              <div className="surface-card p-8 text-center">
                <div className="text-[13px] font-medium">No components match these filters.</div>
                <div className="text-[11.5px] text-muted-foreground mt-1">Try relaxing price, lead, or spec thresholds — or clear all filters.</div>
                <button onClick={clearAll} className="btn-primary btn-sm mt-2">Clear filters</button>
              </div>
            )}
          </section>
        </div>
      </div>
      <CompareTray refreshKey={wsTick} />
    </>
  );
}
