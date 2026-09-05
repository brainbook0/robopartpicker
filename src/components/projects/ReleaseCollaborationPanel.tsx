import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Download, GitCompare, GitPullRequest, Loader2, Play, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { AiFormDraft } from "@/components/ai/AiFormDraft";
import {
  createReleaseBuildPassport,
  createReleaseProposal,
  getPortableRelease,
  getReleaseCollaboration,
  getReleaseDiff,
  publishPortableRelease,
  reviewReleaseProposal,
  submitReleaseOutcome,
  type PortableRppsReleaseSummary,
  type RppsProposalType,
  type RppsReleaseCollaboration,
  type RppsSemanticDiff,
} from "@/lib/rpps/client";

type Props = {
  projectId: string;
  release: PortableRppsReleaseSummary;
  releases: PortableRppsReleaseSummary[];
  userId?: string;
  canManage: boolean;
  buildActionsEnabled: boolean;
  onReleaseChanged: () => Promise<void>;
};

const evidenceLabels = {
  structured: "Structured",
  tested: "Tested",
  reproduced: "Reproduced",
  repeated: "Repeated",
} as const;

const proposalLabels: Partial<Record<RppsProposalType, string>> = {
  correct_component_identity: "Correct component identity",
  substitute_component: "Substitute component",
  add_assembly_step: "Add assembly step",
  change_configuration: "Change configuration",
  add_compatibility_condition: "Add compatibility condition",
  withdraw_claim: "Withdraw outdated claim",
};

export function ReleaseCollaborationPanel({ projectId, release, releases, userId, canManage, buildActionsEnabled, onReleaseChanged }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [collaboration, setCollaboration] = useState<RppsReleaseCollaboration | null>(null);
  const [diffBase, setDiffBase] = useState("");
  const [diff, setDiff] = useState<RppsSemanticDiff | null>(null);
  const [outcomeBuild, setOutcomeBuild] = useState("");
  const [outcome, setOutcome] = useState<"succeeded" | "partially_succeeded" | "failed" | "abandoned">("succeeded");
  const [outcomeSummary, setOutcomeSummary] = useState("");
  const [outcomeConditions, setOutcomeConditions] = useState("");
  const [proposalType, setProposalType] = useState<keyof typeof proposalLabels>("correct_component_identity");
  const [proposalTarget, setProposalTarget] = useState("");
  const [proposalSecondary, setProposalSecondary] = useState("");
  const [proposalManufacturer, setProposalManufacturer] = useState("");
  const [proposalMpn, setProposalMpn] = useState("");
  const [proposalDetails, setProposalDetails] = useState("");
  const [proposalRationale, setProposalRationale] = useState("");

  const loadCollaboration = async () => {
    setBusy("load");
    try {
      const next = await getReleaseCollaboration(projectId, release.id);
      setCollaboration(next);
      setOutcomeBuild((current) => current || next.eligibleBuilds[0]?.id || "");
    } catch (error) {
      toast({ title: "Release collaboration unavailable", description: message(error), variant: "destructive" });
    } finally { setBusy(null); }
  };

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !collaboration) void loadCollaboration();
  };

  const download = async (kind: "manifest" | "lockfile") => {
    setBusy(kind);
    try {
      const full = await getPortableRelease(projectId, release.id);
      const content = kind === "manifest" ? full.manifest : full.lockfile;
      if (!content) throw new Error("This release has no lockfile.");
      downloadText(`rpps-${release.version}${kind === "lockfile" ? ".lock" : ""}.yaml`, content);
    } catch (error) {
      toast({ title: "Release download failed", description: message(error), variant: "destructive" });
    } finally { setBusy(null); }
  };

  const startBuild = async () => {
    if (!userId) {
      navigate(`/auth?redirect=${encodeURIComponent(location.pathname)}`);
      return;
    }
    setBusy("build");
    try {
      const result = await createReleaseBuildPassport(projectId, release.id, { visibility: "private" });
      toast({ title: "Exact-release build started", description: `The build passport is pinned to immutable release ${release.version}.` });
      navigate(`/builder?build=${encodeURIComponent(result.item.id)}`);
    } catch (error) {
      toast({ title: "Could not start build", description: message(error), variant: "destructive" });
    } finally { setBusy(null); }
  };

  const publish = async () => {
    setBusy("publish");
    try {
      await publishPortableRelease(projectId, release.id);
      await onReleaseChanged();
      toast({ title: "Immutable release published", description: "Its manifest and package hash can no longer be edited; corrections create a new release." });
    } catch (error) {
      toast({ title: "Could not publish release", description: message(error), variant: "destructive" });
    } finally { setBusy(null); }
  };

  const compare = async () => {
    if (!diffBase) return;
    setBusy("diff");
    try { setDiff(await getReleaseDiff(projectId, release.id, diffBase)); }
    catch (error) { toast({ title: "Semantic diff unavailable", description: message(error), variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const submitOutcome = async () => {
    if (!outcomeBuild || outcomeSummary.trim().length < 20) return;
    setBusy("outcome");
    try {
      await submitReleaseOutcome(projectId, release.id, { buildId: outcomeBuild, outcome,
        summary: outcomeSummary.trim(), conditions: outcomeConditions.trim() ? { notes: outcomeConditions.trim() } : {} });
      setOutcomeSummary(""); setOutcomeConditions("");
      await loadCollaboration();
      toast({ title: "Build outcome recorded", description: "The evidence is tied to this exact immutable release." });
    } catch (error) { toast({ title: "Could not record outcome", description: message(error), variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const submitProposal = async () => {
    let payload: Record<string, unknown> & { type: RppsProposalType };
    if (proposalType === "correct_component_identity") payload = { type: proposalType, targetComponentId: proposalTarget, manufacturer: proposalManufacturer, mpn: proposalMpn, rationale: proposalRationale };
    else if (proposalType === "substitute_component") payload = { type: proposalType, targetComponentId: proposalTarget,
      replacement: { name: proposalSecondary, manufacturer: proposalManufacturer || undefined, mpn: proposalMpn || undefined }, rationale: proposalRationale, evidenceRefs: [] };
    else if (proposalType === "add_assembly_step") payload = { type: proposalType, procedureId: proposalTarget,
      step: { id: proposalSecondary, instruction: proposalDetails }, rationale: proposalRationale };
    else if (proposalType === "change_configuration") payload = { type: proposalType, targetObjectId: proposalTarget,
      parameter: proposalSecondary, proposedValue: proposalDetails, rationale: proposalRationale };
    else if (proposalType === "add_compatibility_condition") payload = { type: proposalType, interfaceId: proposalTarget,
      condition: proposalDetails, evidenceRefs: [], rationale: proposalRationale };
    else payload = { type: "withdraw_claim", evidenceId: proposalTarget, rationale: proposalRationale };
    setBusy("proposal");
    try {
      await createReleaseProposal(projectId, release.id, payload);
      setProposalTarget(""); setProposalSecondary(""); setProposalManufacturer(""); setProposalMpn(""); setProposalDetails(""); setProposalRationale("");
      await loadCollaboration();
      toast({ title: "Structured change proposed", description: "The immutable release is unchanged until a maintainer incorporates the accepted proposal into a new release." });
    } catch (error) { toast({ title: "Could not create proposal", description: message(error), variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const review = async (proposalId: string, action: "accept" | "reject" | "withdraw") => {
    setBusy(proposalId);
    try { await reviewReleaseProposal(projectId, release.id, proposalId, action); await loadCollaboration(); }
    catch (error) { toast({ title: "Could not update proposal", description: message(error), variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const applyAiProposalDraft = (draft: Record<string, unknown>) => {
    if (typeof draft.proposalType === "string" && draft.proposalType in proposalLabels) setProposalType(draft.proposalType as keyof typeof proposalLabels);
    if (typeof draft.targetId === "string") setProposalTarget(draft.targetId);
    if (typeof draft.secondary === "string") setProposalSecondary(draft.secondary);
    if (typeof draft.manufacturer === "string") setProposalManufacturer(draft.manufacturer);
    if (typeof draft.mpn === "string") setProposalMpn(draft.mpn);
    if (typeof draft.details === "string") setProposalDetails(draft.details);
    if (typeof draft.rationale === "string") setProposalRationale(draft.rationale);
  };

  return (
    <div className="rounded border border-border p-2">
      <div className="flex items-center justify-between gap-2"><span className="mono text-[10px] font-semibold">{release.version}</span><span className="pill text-[8px]">{release.status}</span></div>
      <div className="mt-1 flex justify-between text-[9.5px] text-muted-foreground"><span>Core {release.report.profiles.core.score}%</span><span>{buildActionsEnabled ? `Buildable ${release.report.profiles.buildable.score}%` : "Reference package"}</span></div>
      {collaboration && <div className="mt-2 flex flex-wrap gap-1">
        {collaboration.evidence.achieved.map((level) => <span key={level} className="rounded bg-primary/10 px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-primary">{evidenceLabels[level]}</span>)}
        {!collaboration.evidence.current && <span className="rounded bg-muted px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-muted-foreground">Freshness not revalidated</span>}
      </div>}
      <div className="mt-2 grid grid-cols-2 gap-1">
        <button type="button" className="btn-ghost btn-sm justify-center" disabled={busy === "manifest"} onClick={() => void download("manifest")}><Download className="h-3 w-3" /> manifest</button>
        {release.hasLockfile && <button type="button" className="btn-ghost btn-sm justify-center" disabled={busy === "lockfile"} onClick={() => void download("lockfile")}><Download className="h-3 w-3" /> lock</button>}
        {buildActionsEnabled && release.status === "published" && <button type="button" className="btn-primary btn-sm justify-center" disabled={busy === "build"} onClick={() => void startBuild()}><Play className="h-3 w-3" /> Build this release</button>}
        {release.status === "draft" && canManage && <button type="button" className="btn-primary btn-sm justify-center" disabled={busy === "publish"} onClick={() => void publish()}><ShieldCheck className="h-3 w-3" /> Publish</button>}
        <button type="button" className="btn-ghost btn-sm justify-center" onClick={toggle}>{expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} Collaboration</button>
      </div>
      <div className="mt-1 text-[9px] text-muted-foreground">Integrity verified · immutable release</div>

      {expanded && <div className="mt-3 space-y-3 border-t border-border pt-3">
        {busy === "load" && !collaboration ? <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading release evidence…</div> : collaboration && <>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded bg-muted/40 p-2"><span className="font-semibold">{collaboration.evidence.succeededIndependent}</span><br /><span className="text-muted-foreground">independent successes</span></div>
            <div className="rounded bg-muted/40 p-2"><span className="font-semibold">{collaboration.proposals.filter((item) => item.status === "open").length}</span><br /><span className="text-muted-foreground">open proposals</span></div>
          </div>

          {releases.length > 1 && <div>
            <div className="section-title mb-1 flex items-center gap-1"><GitCompare className="h-3 w-3" /> Semantic diff</div>
            <div className="flex gap-1"><select value={diffBase} onChange={(event) => setDiffBase(event.target.value)} className="input-bare h-8 min-w-0 flex-1 text-[10px]"><option value="">Compare against…</option>{releases.filter((item) => item.id !== release.id).map((item) => <option key={item.id} value={item.id}>{item.version}</option>)}</select><button type="button" className="btn-ghost btn-sm" disabled={!diffBase || busy === "diff"} onClick={() => void compare()}>Compare</button></div>
            {diff && <DiffSummary diff={diff} />}
          </div>}

          {buildActionsEnabled && userId && collaboration.eligibleBuilds.length > 0 && <div className="space-y-1.5">
            <div className="section-title">Report exact-release outcome</div>
            <select value={outcomeBuild} onChange={(event) => setOutcomeBuild(event.target.value)} className="input-bare h-8 w-full text-[10px]">{collaboration.eligibleBuilds.map((build) => <option key={build.id} value={build.id}>{build.name} · {build.status}</option>)}</select>
            <select value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)} className="input-bare h-8 w-full text-[10px]"><option value="succeeded">Succeeded</option><option value="partially_succeeded">Partially succeeded</option><option value="failed">Failed</option><option value="abandoned">Abandoned</option></select>
            <textarea rows={3} value={outcomeSummary} onChange={(event) => setOutcomeSummary(event.target.value)} placeholder="What happened? Include the observed result and evidence." className="input-bare w-full text-[10px]" />
            <input value={outcomeConditions} onChange={(event) => setOutcomeConditions(event.target.value)} placeholder="Relevant conditions (environment, load, voltage…)" className="input-bare h-8 w-full text-[10px]" />
            <button type="button" className="btn-primary btn-sm w-full justify-center" disabled={outcomeSummary.trim().length < 20 || busy === "outcome"} onClick={() => void submitOutcome()}>Record outcome</button>
            <p className="text-[9px] text-muted-foreground">A non-abandoned outcome requires a test, problem, or file already recorded in the build. Independence is derived by the Worker.</p>
          </div>}

          {userId && release.status === "published" && <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2"><div className="section-title flex items-center gap-1"><GitPullRequest className="h-3 w-3" /> Structured change proposal</div><AiFormDraft form="release_proposal" current={{ proposalType, targetId: proposalTarget, secondary: proposalSecondary, manufacturer: proposalManufacturer, mpn: proposalMpn, details: proposalDetails, rationale: proposalRationale }} onApply={applyAiProposalDraft} label="AI draft" hint="Describe the observed issue or improvement. The assistant only drafts structured fields; it does not submit or modify the immutable release." /></div>
            <select value={proposalType} onChange={(event) => setProposalType(event.target.value as keyof typeof proposalLabels)} className="input-bare h-8 w-full text-[10px]">{Object.entries(proposalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <input value={proposalTarget} onChange={(event) => setProposalTarget(event.target.value)} placeholder={targetPlaceholder(proposalType)} className="input-bare h-8 w-full text-[10px] mono" />
            {proposalType === "correct_component_identity" && <><input value={proposalManufacturer} onChange={(event) => setProposalManufacturer(event.target.value)} placeholder="Manufacturer" className="input-bare h-8 w-full text-[10px]" /><input value={proposalMpn} onChange={(event) => setProposalMpn(event.target.value)} placeholder="Manufacturer part number" className="input-bare h-8 w-full text-[10px] mono" /></>}
            {proposalType === "substitute_component" && <><input value={proposalSecondary} onChange={(event) => setProposalSecondary(event.target.value)} placeholder="Replacement component name" className="input-bare h-8 w-full text-[10px]" /><div className="grid grid-cols-2 gap-1"><input value={proposalManufacturer} onChange={(event) => setProposalManufacturer(event.target.value)} placeholder="Manufacturer" className="input-bare h-8 w-full text-[10px]" /><input value={proposalMpn} onChange={(event) => setProposalMpn(event.target.value)} placeholder="MPN" className="input-bare h-8 w-full text-[10px] mono" /></div></>}
            {["add_assembly_step", "change_configuration"].includes(proposalType) && <input value={proposalSecondary} onChange={(event) => setProposalSecondary(event.target.value)} placeholder={proposalType === "add_assembly_step" ? "New stable step ID" : "Configuration parameter"} className="input-bare h-8 w-full text-[10px] mono" />}
            {["add_assembly_step", "change_configuration", "add_compatibility_condition"].includes(proposalType) && <textarea rows={2} value={proposalDetails} onChange={(event) => setProposalDetails(event.target.value)} placeholder={proposalType === "add_assembly_step" ? "Step instruction" : proposalType === "change_configuration" ? "Proposed value" : "Compatibility condition"} className="input-bare w-full text-[10px]" />}
            {proposalType !== "withdraw_claim" || <p className="text-[9px] text-muted-foreground">Withdrawing a claim marks it for removal in a future release; the published package remains immutable.</p>}
            <textarea rows={2} value={proposalRationale} onChange={(event) => setProposalRationale(event.target.value)} placeholder="Rationale and supporting observation" className="input-bare w-full text-[10px]" />
            <button type="button" className="btn-primary btn-sm w-full justify-center" disabled={!proposalTarget.trim() || proposalRationale.trim().length < 10 || busy === "proposal"} onClick={() => void submitProposal()}>Propose change</button>
          </div>}

          <div>
            <div className="section-title mb-1">Outcomes & proposals</div>
            {collaboration.outcomes.length === 0 && collaboration.proposals.length === 0 ? <p className="text-[10px] text-muted-foreground">No outcomes or proposals yet.</p> : <div className="space-y-1.5">
              {collaboration.outcomes.map((item) => <div key={item.id} className="rounded border border-border p-2 text-[9.5px]"><div className="flex justify-between gap-2"><span className="font-medium">{item.outcome.replaceAll("_", " ")}</span><span className="text-muted-foreground">{item.independence}</span></div><p className="mt-1 text-muted-foreground">{item.summary}</p></div>)}
              {collaboration.proposals.map((item) => <div key={item.id} className="rounded border border-border p-2 text-[9.5px]"><div className="flex justify-between gap-2"><span className="font-medium">{proposalLabels[item.type] ?? item.type.replaceAll("_", " ")}</span><span className="pill text-[8px]">{item.status}</span></div>{item.status === "open" && <div className="mt-1 flex gap-1">{collaboration.canManage && <><button type="button" className="btn-ghost btn-sm" disabled={busy === item.id} onClick={() => void review(item.id, "accept")}>Accept for next release</button><button type="button" className="btn-ghost btn-sm text-destructive" disabled={busy === item.id} onClick={() => void review(item.id, "reject")}>Reject</button></>}{item.createdByUserId === userId && <button type="button" className="btn-ghost btn-sm" disabled={busy === item.id} onClick={() => void review(item.id, "withdraw")}>Withdraw</button>}</div>}{item.reviewNote && <p className="mt-1 text-muted-foreground">{item.reviewNote}</p>}</div>)}
            </div>}
          </div>
        </>}
      </div>}
    </div>
  );
}

function DiffSummary({ diff }: { diff: RppsSemanticDiff }) {
  const changed = Object.entries(diff.collections).filter(([, value]) => value.added.length || value.removed.length || value.changed.length);
  return changed.length === 0 ? <p className="mt-1 text-[9.5px] text-muted-foreground">No semantic object changes.</p> : <div className="mt-1 space-y-1">{changed.map(([name, value]) => <div key={name} className="rounded bg-muted/40 p-1.5 text-[9px]"><span className="font-medium capitalize">{name}</span> <span className="text-muted-foreground">+{value.added.length} −{value.removed.length} Δ{value.changed.length}</span>{value.changed.map((item) => <div key={item.id} className="mono truncate text-muted-foreground" title={`${item.id}: ${item.fields.join(", ")}`}>{item.id}: {item.fields.join(", ")}</div>)}</div>)}</div>;
}

function targetPlaceholder(type: keyof typeof proposalLabels): string {
  if (type === "correct_component_identity" || type === "substitute_component") return "Target component stable ID";
  if (type === "add_assembly_step") return "Target procedure stable ID";
  if (type === "change_configuration") return "Target configuration/artifact stable ID";
  if (type === "add_compatibility_condition") return "Target interface stable ID";
  return "Evidence claim stable ID";
}

function downloadText(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/yaml;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}

function message(error: unknown): string { return error instanceof Error ? error.message : "Unknown error"; }
