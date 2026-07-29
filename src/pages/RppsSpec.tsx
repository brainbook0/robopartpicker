import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Download, FileCode2, LockKeyhole, Save, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { listMyProjects } from "@/lib/projects";
import { createPortableRelease, validatePortablePackage, type PortableRppsRelease, type PortableRppsValidation } from "@/lib/rpps/client";
import { PORTABLE_RPPS_STATUS, type ConformanceProfile, type ScoreDimension } from "@/lib/rpps/portable";

const manifestExample = `rpps: "0.1"
project:
  id: project:example-robot
  name: Example Robot
  slug: example-robot
release:
  id: release:example-robot:0.1.0
  version: 0.1.0
authors:
  - id: author:maintainer
    name: Maintainer
licenses:
  hardware: CERN-OHL-S-2.0
  software: Apache-2.0
  documentation: CC-BY-4.0
artifacts:
  - id: artifact:readme
    path: README.md
    kind: documentation
    sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
components:
  - id: component:motor
    name: Example motor
    quantity: 2
    manufacturer: Example Robotics
    mpn: MOTOR-1
extensions:
  org.rpps.root-lineage: true
`;

const lockExample = `rppsLock: "0.1"
release:
  id: release:example-robot:0.1.0
  version: 0.1.0
artifacts:
  - id: artifact:readme
    sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
components:
  - id: component:motor
    manufacturer: Example Robotics
    mpn: MOTOR-1
    revision: A
    quantity: 2
`;

const profileLabels: Record<ConformanceProfile, string> = { core: "Core", buildable: "Buildable", reproducible: "Reproducible", collaborative: "Collaborative" };
const dimensionLabels: Record<ScoreDimension, string> = {
  "artifact-completeness": "Artifacts",
  "bom-resolution": "BOM resolution",
  "mechanical-interfaces": "Mechanical interfaces",
  "electrical-interfaces": "Electrical interfaces",
  "firmware-reproducibility": "Firmware",
  "configuration-calibration": "Configuration & calibration",
  "assembly-instructions": "Assembly instructions",
  "test-coverage": "Test coverage",
  "licensing-clarity": "Licensing",
  "evidence-quality": "Evidence",
  "collaboration-readiness": "Collaboration",
};

export default function RppsSpec() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [manifest, setManifest] = useState(manifestExample);
  const [lockfile, setLockfile] = useState(lockExample);
  const [validation, setValidation] = useState<PortableRppsValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [releaseStatus, setReleaseStatus] = useState<"draft" | "published">("draft");
  const [saved, setSaved] = useState<PortableRppsRelease | null>(null);
  const projects = useQuery({ queryKey: ["my-projects", user?.id], queryFn: () => listMyProjects(user!.id), enabled: Boolean(user) });
  const profiles = useMemo(() => validation ? Object.entries(validation.report.profiles) as Array<[ConformanceProfile, { score: number; conformant: boolean }]> : [], [validation]);

  async function validate() {
    setBusy(true); setError(null); setSaved(null);
    try { setValidation(await validatePortablePackage(manifest, lockfile)); }
    catch (reason) { setValidation(null); setError(reason instanceof Error ? reason.message : "Validation failed."); }
    finally { setBusy(false); }
  }

  async function saveRelease() {
    if (!projectId) return;
    setBusy(true); setError(null);
    try {
      const item = await createPortableRelease(projectId, { manifest, lockfile, status: releaseStatus });
      setSaved(item);
      toast({ title: "Immutable RPPS release saved", description: `${item.stableReleaseId} · ${item.packageSha256.slice(0, 12)}…` });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The release could not be saved."); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><div className="section-title">Portable robotics releases</div><h1 className="text-[22px] font-bold tracking-tight">RoboPartPicker Project Standard <span className="mono text-primary">RPPS 0.1 Draft</span></h1><p className="mt-1 max-w-3xl text-[12.5px] leading-5 text-muted-foreground">RPPS is RoboPartPicker’s open, vendor-neutral manifest and lockfile format for exchanging buildable robotics releases. It coordinates native CAD, firmware, configuration, BOMs, instructions, tests, and evidence without replacing those formats or requiring this website.</p></div>
        <button className="btn-ghost btn-sm" onClick={() => download("rpps.yaml", manifestExample)}><Download className="h-3.5 w-3.5" /> Example package</button>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        {(["Core", "Buildable", "Reproducible", "Collaborative"] as const).map((label, index) => <div key={label} className="surface-card p-3"><div className="mono text-[10px] text-muted-foreground">PROFILE {index + 1}</div><div className="mt-1 text-sm font-semibold">RPPS {label}</div><div className="mt-1 text-[10.5px] text-muted-foreground">{["Identity, licenses, artifacts, BOM", "Procedures and declared interfaces", "Exact lock, tests and evidence", "Reusable assemblies and lineage"][index]}</div></div>)}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <section className="space-y-3">
          <div className="surface-card overflow-hidden"><div className="flex items-center justify-between border-b border-border px-3 py-2"><div className="flex items-center gap-2 text-xs font-semibold"><FileCode2 className="h-3.5 w-3.5 text-primary" /> rpps.yaml</div><span className="mono text-[9px] text-muted-foreground">human-edited intent</span></div><textarea aria-label="RPPS manifest" value={manifest} onChange={(event) => { setManifest(event.target.value); setValidation(null); }} spellCheck={false} className="mono min-h-[430px] w-full resize-y bg-transparent p-3 text-[11px] leading-5 outline-none" /></div>
          <div className="surface-card overflow-hidden"><div className="flex items-center justify-between border-b border-border px-3 py-2"><div className="flex items-center gap-2 text-xs font-semibold"><LockKeyhole className="h-3.5 w-3.5 text-primary" /> rpps.lock.yaml</div><span className="mono text-[9px] text-muted-foreground">exact release resolution · optional while drafting</span></div><textarea aria-label="RPPS lockfile" value={lockfile} onChange={(event) => { setLockfile(event.target.value); setValidation(null); }} spellCheck={false} className="mono min-h-[220px] w-full resize-y bg-transparent p-3 text-[11px] leading-5 outline-none" /></div>
          <div className="flex flex-wrap gap-2"><button onClick={() => void validate()} disabled={busy} className="btn-primary"><ShieldCheck className="h-3.5 w-3.5" /> {busy ? "Checking…" : "Validate deterministically"}</button><button onClick={() => download("rpps.yaml", manifest)} className="btn-ghost"><Download className="h-3.5 w-3.5" /> Manifest</button><button onClick={() => download("rpps.lock.yaml", lockfile)} className="btn-ghost"><Download className="h-3.5 w-3.5" /> Lockfile</button></div>
          {error && <div role="alert" className="border border-negative/30 bg-negative/5 p-3 text-xs text-negative">{error}</div>}
        </section>

        <aside className="space-y-3">
          <div className="surface-card p-3"><div className="section-title mb-2">Conformance report</div>{!validation ? <p className="text-xs leading-5 text-muted-foreground">Run the validator to see deterministic profile scores, affected objects and stable rule IDs. AI suggestions never decide conformance.</p> : <div className="space-y-2">{profiles.map(([profile, value]) => <div key={profile} className="flex items-center justify-between border-b border-border/70 pb-2 last:border-0 last:pb-0"><div className="flex items-center gap-2">{value.conformant ? <CheckCircle2 className="h-3.5 w-3.5 text-positive" /> : <AlertTriangle className="h-3.5 w-3.5 text-warning" />}<span className="text-xs font-medium">{profileLabels[profile]}</span></div><span className="mono text-xs font-semibold">{value.score}%</span></div>)}</div>}</div>

          {validation && <><div className="surface-card p-3"><div className="section-title mb-2">Scorecard</div><div className="space-y-1.5">{(Object.entries(validation.report.dimensions) as Array<[ScoreDimension, number]>).map(([dimension, score]) => <div key={dimension} className="grid grid-cols-[1fr_34px] items-center gap-2 text-[10.5px]"><div><div className="mb-1 flex justify-between"><span>{dimensionLabels[dimension]}</span></div><div className="h-1.5 bg-muted"><div className="h-full bg-primary" style={{ width: `${score}%` }} /></div></div><span className="mono text-right">{score}%</span></div>)}</div></div>
          <div className="surface-card p-3"><div className="section-title mb-2">Findings · {validation.report.findings.length}</div><div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">{validation.report.findings.map((finding) => <div key={finding.ruleId} className="border-l-2 border-warning pl-2"><div className="flex justify-between gap-2"><span className="mono text-[9.5px] font-semibold">{finding.ruleId}</span><span className="pill text-[8px]">{finding.severity}</span></div><p className="mt-1 text-[10.5px] leading-4">{finding.message}</p><p className="mt-1 text-[9.5px] leading-4 text-muted-foreground">{finding.suggestion}</p></div>)}</div></div></>}

          <div className="surface-card p-3"><div className="section-title mb-2">Save immutable release</div>{!user ? <p className="text-xs text-muted-foreground"><Link to="/auth" className="text-primary hover:underline">Sign in</Link> only when you are ready to save or publish. Validation and export remain anonymous.</p> : <div className="space-y-2"><select aria-label="Target project" value={projectId} onChange={(event) => setProjectId(event.target.value)} className="input-bare h-9 w-full text-xs"><option value="">Choose a project…</option>{projects.data?.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><select aria-label="Release status" value={releaseStatus} onChange={(event) => setReleaseStatus(event.target.value as "draft" | "published")} className="input-bare h-9 w-full text-xs"><option value="draft">Private draft release</option><option value="published">Publish release</option></select><button disabled={!validation || !projectId || busy} onClick={() => void saveRelease()} className="btn-primary w-full justify-center"><Save className="h-3.5 w-3.5" /> Save content-addressed release</button>{saved && <div className="border border-positive/30 bg-positive/5 p-2 text-[10px]"><div className="font-semibold text-positive">Release saved</div><div className="mono mt-1 break-all text-muted-foreground">sha256:{saved.packageSha256}</div></div>}</div>}</div>
        </aside>
      </div>

      <section className="mt-5 surface-card p-4"><h2 className="text-sm font-semibold">Composition, not reinvention</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">RPPS references native engineering artifacts and composes Open Know-How, CycloneDX, SPDX identifiers and ROS REP-103 conventions where applicable. Reproduced and Repeated describe independent outcome evidence; Current is tracked separately as freshness. RPPS does not claim certification.</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px]"><a className="text-primary hover:underline" href="https://www.internetofproduction.org/openknowhow" target="_blank" rel="noreferrer">Open Know-How</a><a className="text-primary hover:underline" href="https://cyclonedx.org/capabilities/hbom/" target="_blank" rel="noreferrer">CycloneDX HBOM</a><a className="text-primary hover:underline" href="https://spdx.dev/use/specifications/" target="_blank" rel="noreferrer">SPDX</a><a className="text-primary hover:underline" href="https://reps.openrobotics.org/rep-0103/" target="_blank" rel="noreferrer">ROS REP-103</a><a className="text-primary hover:underline" href="https://oshwa.org/definition/" target="_blank" rel="noreferrer">OSHWA definition</a></div><p className="mt-3 mono text-[9.5px] text-muted-foreground">{PORTABLE_RPPS_STATUS} · schema is intentionally versioned as a draft while interoperability fixtures and governance mature.</p></section>
    </div>
  );
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/yaml;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}
