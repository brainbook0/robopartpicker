import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { parts, lowestPrice, type Actuator, type Hand } from "@/data/parts";

type Mode = "actuator" | "hand";

export default function Finder() {
  const { type = "actuator" } = useParams<{ type: Mode }>();
  const mode = (type === "hand" ? "hand" : "actuator") as Mode;

  const [joint, setJoint] = useState("knee");
  const [peakNm, setPeakNm] = useState(60);
  const [contNm, setContNm] = useState(20);
  const [weightCapKg, setWeightCapKg] = useState(2.0);
  const [voltage, setVoltage] = useState(48);
  const [protocol, setProtocol] = useState("CAN");
  const [rosReq, setRosReq] = useState(true);
  const [budget, setBudget] = useState(900);
  const [dof, setDof] = useState(6);
  const [payloadKg, setPayloadKg] = useState(5);
  const [tactileReq, setTactileReq] = useState(false);

  const results = useMemo(() => {
    const candidates = parts.filter(p => p.category === mode);
    type Scored = { p: typeof candidates[number]; perf: number; comp: number; doc: number; supplier: number; price: number; avail: number; total: number; warnings: string[] };
    const scored: Scored[] = candidates.map(p => {
      const warnings: string[] = [];
      let perf = 0, comp = 0, doc = 0, supplier = 0, price = 0, avail = 0;
      const low = lowestPrice(p);
      const minLead = p.offers.reduce((m, o) => Math.min(m, o.leadDays), 999);
      if (mode === "actuator") {
        const a = p as Actuator;
        perf = Math.min(100, (Math.min(a.peakNm / peakNm, 2) * 50) + (Math.min(a.contNm / contNm, 2) * 25));
        if (a.weightKg > weightCapKg) { perf -= 20; warnings.push("over weight cap"); }
        if (a.voltageV !== voltage) { comp -= 15; warnings.push(`${a.voltageV}V vs ${voltage}V`); }
        comp += a.protocol === protocol ? 100 : 40;
        comp += a.compatibility.some(c => c.includes(joint)) ? 0 : -30;
      } else {
        const h = p as Hand;
        perf = Math.min(100, (Math.min(h.actuatedDof / dof, 2) * 40) + (Math.min(h.payloadKg / payloadKg, 2) * 40));
        if (tactileReq && !h.tactile) { perf -= 30; warnings.push("no tactile"); }
        comp = 80;
      }
      doc = (p.cadAvailable ? 40 : 0) + (p.rosSupport === "native" ? 60 : p.rosSupport === "community" ? 35 : 0);
      if (rosReq && p.rosSupport === "none") { doc -= 50; warnings.push("no ROS support"); }
      supplier = Math.min(100, p.offers.length * 30) - p.failures * 4;
      price = low <= budget ? 100 - ((low / budget) * 30) : 30 - ((low - budget) / budget) * 50;
      if (low > budget) warnings.push(`over budget by $${(low - budget).toFixed(0)}`);
      avail = minLead <= 14 ? 100 : minLead <= 30 ? 70 : 40;
      const total = perf * 0.30 + comp * 0.20 + doc * 0.10 + supplier * 0.15 + price * 0.15 + avail * 0.10;
      return { p, perf, comp, doc, supplier, price, avail, total, warnings };
    }).sort((a, b) => b.total - a.total);
    return scored.slice(0, 8);
  }, [mode, joint, peakNm, contNm, weightCapKg, voltage, protocol, rosReq, budget, dof, payloadKg, tactileReq]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="text-[12px] text-muted-foreground mb-1">Finder</div>
      <h1 className="text-[22px] font-bold tracking-tight">{mode === "actuator" ? "Actuator finder" : "Hand finder"}</h1>
      <p className="text-[13px] text-muted-foreground mt-1">Guided ranking. Score weights are visible — no black box.</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="surface-card p-4 h-fit space-y-3 text-[13px]">
          {mode === "actuator" && <>
            <div>
              <div className="section-title mb-1">Joint</div>
              <select className="input-bare" value={joint} onChange={(e) => setJoint(e.target.value)}>
                {["shoulder","elbow","wrist","hip","knee","ankle","neck","gripper"].map(j => <option key={j}>{j}</option>)}
              </select>
            </div>
            <Slider label={`Peak torque ≥ ${peakNm} Nm`} min={5} max={400} value={peakNm} onChange={setPeakNm} />
            <Slider label={`Continuous ≥ ${contNm} Nm`} min={1} max={150} value={contNm} onChange={setContNm} />
            <Slider label={`Weight cap ${weightCapKg.toFixed(1)} kg`} min={0.1} max={6} step={0.1} value={weightCapKg} onChange={setWeightCapKg} />
            <div>
              <div className="section-title mb-1">Voltage</div>
              <select className="input-bare" value={voltage} onChange={(e) => setVoltage(+e.target.value)}>
                {[24,36,48,58,80].map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <div className="section-title mb-1">Protocol</div>
              <select className="input-bare" value={protocol} onChange={(e) => setProtocol(e.target.value)}>
                {["CAN","CAN-FD","RS485","EtherCAT"].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </>}
          {mode === "hand" && <>
            <Slider label={`Actuated DoF ≥ ${dof}`} min={1} max={20} value={dof} onChange={setDof} />
            <Slider label={`Payload ≥ ${payloadKg} kg`} min={0.5} max={15} step={0.5} value={payloadKg} onChange={setPayloadKg} />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={tactileReq} onChange={(e) => setTactileReq(e.target.checked)} />
              Tactile required
            </label>
          </>}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={rosReq} onChange={(e) => setRosReq(e.target.checked)} /> ROS required
          </label>
          <Slider label={`Budget ≤ $${budget.toLocaleString()}`} min={100} max={20000} step={50} value={budget} onChange={setBudget} />
          <div className="mt-2 rounded border border-border bg-surface p-2 text-[11px] text-muted-foreground">
            Score = 0.30 perf + 0.20 compat + 0.15 supplier + 0.15 price + 0.10 docs + 0.10 availability
          </div>
        </aside>

        <section className="surface-card overflow-x-auto">
          <table className="data-table">
            <thead><tr>
              <th>Rank</th><th>Part</th><th>Score</th>
              <th>Perf</th><th>Compat</th><th>Supplier</th><th>Price</th><th>Avail</th>
              <th>Warnings</th><th></th>
            </tr></thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={r.p.id}>
                  <td className="mono font-semibold">#{i+1}</td>
                  <td><Link to={`/parts/${r.p.category}/${r.p.slug}`} className="font-medium hover:text-primary">{r.p.name}</Link><div className="text-[11px] text-muted-foreground">{r.p.maker}</div></td>
                  <td className="mono font-bold">{r.total.toFixed(0)}</td>
                  <td className="mono">{r.perf.toFixed(0)}</td>
                  <td className="mono">{r.comp.toFixed(0)}</td>
                  <td className="mono">{r.supplier.toFixed(0)}</td>
                  <td className="mono">{r.price.toFixed(0)}</td>
                  <td className="mono">{r.avail.toFixed(0)}</td>
                  <td className="text-[11px]">{r.warnings.length ? r.warnings.map(w => <span key={w} className="pill pill-warn mr-1">{w}</span>) : <span className="text-muted-foreground">—</span>}</td>
                  <td><Link to={`/parts/${r.p.category}/${r.p.slug}`} className="btn-ghost btn-sm">View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function Slider({ label, min, max, value, onChange, step = 1 }: { label: string; min: number; max: number; value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <div>
      <div className="section-title mb-1">{label}</div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-primary" />
    </div>
  );
}
