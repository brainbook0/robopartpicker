import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { analyzeProjectArchive, analyzeProjectSource, analyzeStoredProjectFiles, createProject, type ProjectImportAnalysis } from "@/lib/projects";
import { attachFile, uploadFile, type FileKind } from "@/lib/api/files";
import { describeProjectImportRetrieval } from "@/lib/projectImportRetrieval";
import { createPortableRelease } from "@/lib/rpps/client";
import { organizationsApi } from "@/lib/api/organizations";
import { slugify, validateRpps, RPPS_VERSION, type RppsPackage } from "@/lib/rpps/schema";
import { Github, FileJson, FileArchive, Loader2, Pencil, ChevronDown, ChevronRight, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { AiNarrativeComposer } from "@/components/ai/AiNarrativeComposer";
import { SubmissionQualityCard } from "@/components/ai/SubmissionQualityCard";
import { reviewSubmission, type SubmissionQualityReview } from "@/lib/assistant";

type Mode = "manual" | "github" | "file" | "paste";
type Difficulty = "beginner" | "intermediate" | "advanced" | "expert" | "";
type RosSupport = "native" | "community" | "none" | "";
type Fabrication = "3d-print" | "cnc" | "laser" | "waterjet" | "manual" | "pcb";

const FABRICATION_OPTIONS: Fabrication[] = ["3d-print", "cnc", "laser", "waterjet", "manual", "pcb"];

const isHttpUrl = (v: string) => {
  if (!v) return true;
  try { const u = new URL(v); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; }
};
const toList = (s: string) =>
  Array.from(new Set(s.split(",").map(x => x.trim()).filter(Boolean)));
const numOrUndef = (s: string) => (s === "" ? undefined : Number(s));
const SAVED_IMPORT_KEY = "rpp-project-import-analysis";

const saveImport = (analysis: ProjectImportAnalysis) => {
  try { sessionStorage.setItem(SAVED_IMPORT_KEY, JSON.stringify(analysis)); } catch { /* A blocked/full session store must not block the import. */ }
};

const loadSavedImport = (): ProjectImportAnalysis | null => {
  try {
    const raw = sessionStorage.getItem(SAVED_IMPORT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ProjectImportAnalysis>;
    if (value.schemaVersion !== "project-import-analysis/3" || value.deterministic !== true || value.aiUsed !== false
      || !value.draft || !value.inventory || !value.manifest || !value.report || !value.extracted?.repository || !value.extracted.configuration || typeof value.manifestYaml !== "string") {
      sessionStorage.removeItem(SAVED_IMPORT_KEY);
      return null;
    }
    return value as ProjectImportAnalysis;
  } catch {
    sessionStorage.removeItem(SAVED_IMPORT_KEY);
    return null;
  }
};

export default function ProjectNew() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [initialImport] = useState<ProjectImportAnalysis | null>(() => loadSavedImport());

  const [mode, setMode] = useState<Mode>("manual");
  const [busy, setBusy] = useState(false);
  const [qualityReview, setQualityReview] = useState<SubmissionQualityReview | null>(null);
  const [reviewedFingerprint, setReviewedFingerprint] = useState<string | null>(null);
  const [reviewUnavailable, setReviewUnavailable] = useState(false);
  const [importedFiles, setImportedFiles] = useState<Array<{ id: string; name: string }>>([]);

  // Identity
  const [name, setName] = useState(initialImport?.draft.name ?? "");
  const [version, setVersion] = useState("0.1.0");
  const [summary, setSummary] = useState(initialImport?.draft.summary ?? "");
  const [description, setDescription] = useState(initialImport?.draft.description ?? "");
  const [tags, setTags] = useState(initialImport?.draft.tags.join(", ") ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState("");

  // Build profile
  const [difficulty, setDifficulty] = useState<Difficulty>("");
  const [costUsd, setCostUsd] = useState<string>("");
  const [timeHours, setTimeHours] = useState<string>("");
  const [requiredTools, setRequiredTools] = useState("");
  const [requiredSkills, setRequiredSkills] = useState("");
  const [fabrication, setFabrication] = useState<Fabrication[]>([]);

  // Hardware
  const [dof, setDof] = useState<string>("");
  const [payloadKg, setPayloadKg] = useState<string>("");
  const [weightKg, setWeightKg] = useState<string>("");
  const [heightCm, setHeightCm] = useState<string>("");
  const [compute, setCompute] = useState("");

  // Software
  const [os, setOs] = useState("");
  const [middleware, setMiddleware] = useState("");
  const [languages, setLanguages] = useState("");
  const [rosSupport, setRosSupport] = useState<RosSupport>("");
  const [simulators, setSimulators] = useState("");

  // Publishing
  const [license, setLicense] = useState(initialImport?.draft.license ?? "");
  const [repoUrl, setRepoUrl] = useState(initialImport?.draft.repo_url ?? "");
  const [docsUrl, setDocsUrl] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [organizationId, setOrganizationId] = useState("");

  const organizations = useQuery({
    queryKey: ["organizations", user?.id],
    queryFn: ({ signal }) => organizationsApi.list(signal),
    enabled: Boolean(user),
  });
  const projectOrganizations = (organizations.data?.items ?? []).filter((organization) =>
    ["owner", "admin", "engineer"].includes(organization.member_role),
  );

  // Section open state
  const [openBuild, setOpenBuild] = useState(false);
  const [openHw, setOpenHw] = useState(false);
  const [openSw, setOpenSw] = useState(false);

  // Import indicator
  const [importedFields, setImportedFields] = useState<Set<string>>(new Set());

  // GitHub / Paste
  const [ghUrl, setGhUrl] = useState("");
  const [ghBusy, setGhBusy] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [analysis, setAnalysis] = useState<ProjectImportAnalysis | null>(initialImport);
  const [pasted, setPasted] = useState("");

  // Live validation
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Required";
    else if (name.trim().length > 500) e.name = "Too long";
    if (!version.trim()) e.version = "Required";
    else if (version.length > 40) e.version = "Max 40 chars";
    if (summary.length > 280) e.summary = "Max 280 chars";
    if (!isHttpUrl(repoUrl.trim())) e.repoUrl = "Must be http(s) URL";
    if (!isHttpUrl(docsUrl.trim())) e.docsUrl = "Must be http(s) URL";
    if (!isHttpUrl(coverImageUrl.trim())) e.coverImageUrl = "Must be http(s) URL";
    for (const [k, v] of Object.entries({ costUsd, timeHours, dof, payloadKg, weightKg, heightCm })) {
      if (v !== "" && (isNaN(Number(v)) || Number(v) < 0)) e[k] = "Nonnegative number";
    }
    if (dof !== "" && !/^\d+$/.test(dof.trim())) e.dof = "Nonnegative integer";
    return e;
  }, [name, version, summary, repoUrl, docsUrl, coverImageUrl, costUsd, timeHours, dof, payloadKg, weightKg, heightCm]);
  const hasErrors = Object.keys(errors).length > 0;

  // Live paste validation
  const pasteState = useMemo(() => {
    if (!pasted.trim()) return { status: "empty" as const };
    let parsed: unknown;
    try { parsed = JSON.parse(pasted); } catch (err: any) { return { status: "invalid-json" as const, message: err?.message ?? "Invalid JSON" }; }
    const check = validateRpps(parsed);
    if (check.ok === false) return { status: "invalid-schema" as const, errors: check.errors };
    return { status: "valid" as const, pkg: check.data };
  }, [pasted]);

  const tagList = useMemo(() => toList(tags), [tags]);

  // Completeness (not persisted)
  const readiness = useMemo(() => {
    const checks: { label: string; ok: boolean }[] = [
      { label: "Name", ok: !!name.trim() },
      { label: "Summary", ok: !!summary.trim() },
      { label: "Description", ok: description.trim().length >= 40 },
      { label: "License", ok: !!license.trim() },
      { label: "Repository or docs URL", ok: !!repoUrl.trim() || !!docsUrl.trim() },
      { label: "Cover image", ok: !!coverImageUrl.trim() },
      { label: "Difficulty", ok: !!difficulty },
      { label: "Cost or build time", ok: !!costUsd || !!timeHours },
      { label: "Technical stack (OS / middleware / compute)", ok: !!os.trim() || !!middleware.trim() || !!compute.trim() },
      { label: "Tags", ok: tagList.length > 0 },
    ];
    const done = checks.filter(c => c.ok).length;
    return { checks, done, total: checks.length, pct: Math.round((done / checks.length) * 100) };
  }, [name, summary, description, license, repoUrl, docsUrl, coverImageUrl, difficulty, costUsd, timeHours, os, middleware, compute, tagList]);

  const markImported = (keys: string[]) => setImportedFields(prev => {
    const next = new Set(prev); keys.forEach(k => next.add(k)); return next;
  });
  const clearImported = (key: string) => setImportedFields(prev => {
    if (!prev.has(key)) return prev;
    const next = new Set(prev); next.delete(key); return next;
  });

  const importFromGithub = async () => {
    if (!ghUrl.trim()) return;
    setGhBusy(true);
    try {
      const imported = await analyzeProjectSource({ sourceType: "github", repositoryUrl: ghUrl.trim() });
      const d = imported.draft;
      setName(d.name); setSummary(d.summary); setDescription(d.description);
      setLicense(d.license ?? ""); setRepoUrl(d.repo_url ?? ""); setTags(d.tags.join(", "));
      setAnalysis(imported);
      saveImport(imported);
      markImported(["name","summary","description","license","repoUrl","tags"]);
      setMode("manual");
      toast({ title: "Buildability analysis ready", description: `${imported.inventory.relevantFiles} relevant files inventoried. Review the scorecard and highlighted fields.` });
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message ?? String(e), variant: "destructive" });
    } finally { setGhBusy(false); }
  };

  const importProjectFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setFileBusy(true);
    try {
      const file = files[0];
      const extension = file.name.split(".").at(-1)?.toLowerCase();
      let imported: ProjectImportAnalysis;
      if (files.length === 1 && extension === "zip") {
        if (!user) {
          sessionStorage.setItem("rpp-import-return", "/projects/new");
          nav("/auth?redirect=%2Fprojects%2Fnew");
          toast({ title: "Sign in to inspect archives", description: "ZIP archives are stored privately in R2 before the Worker analyzes them." });
          return;
        }
        const uploaded = await uploadFile(file, "attachment", organizationId ? "organization" : "private", organizationId || null);
        imported = await analyzeProjectArchive(uploaded.fileId);
        setImportedFiles([{ id: uploaded.fileId, name: file.name }]);
      } else if (files.length > 1 || file.size > 1_048_576 || !isDirectProjectText(file.name)) {
        if (!user) {
          sessionStorage.setItem("rpp-import-return", "/projects/new");
          nav("/auth?redirect=%2Fprojects%2Fnew");
          toast({ title: "Sign in to inspect uploaded files", description: "Project files are stored privately in R2 before the Worker analyzes them together." });
          return;
        }
        if (files.length > 100) throw new Error("Select no more than 100 project files at once.");
        if (files.reduce((sum, item) => sum + item.size, 0) > 100 * 1024 * 1024) throw new Error("Selected project files must total 100 MiB or less.");
        const uploaded: Array<{ id: string; name: string }> = [];
        for (const selected of files) {
          const result = await uploadFile(selected, projectUploadKind(selected.name), organizationId ? "organization" : "private", organizationId || null);
          uploaded.push({ id: result.fileId, name: selected.name });
        }
        imported = await analyzeStoredProjectFiles(uploaded.map((item) => item.id));
        setImportedFiles(uploaded);
      } else {
        if (file.size > 1_048_576) throw new Error("Direct RPPS, BOM, and URDF imports are limited to 1 MiB. Use a ZIP archive for larger packages.");
        const sourceType = /\.urdf(?:\.xacro)?$/iu.test(file.name) ? "urdf"
          : /(^|[-_.])(bom|parts?)([-_.]|$)|\.csv$/iu.test(file.name) ? "bom" : "rpps";
        imported = await analyzeProjectSource({ sourceType, fileName: file.name, content: await file.text() });
        setImportedFiles([]);
      }
      const d = imported.draft;
      setName(d.name); setSummary(d.summary); setDescription(d.description);
      setLicense(d.license ?? ""); setRepoUrl(d.repo_url ?? ""); setTags(d.tags.join(", "));
      setAnalysis(imported);
      saveImport(imported);
      markImported(["name", "summary", "description", "license", "repoUrl", "tags"]);
      setMode("manual");
      toast({ title: "Project package analyzed", description: `${imported.inventory.relevantFiles} relevant files mapped without AI inference.` });
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setFileBusy(false);
    }
  };

  const applyAiDraft = (draft: Record<string, unknown>) => {
    const text = (key: string) => typeof draft[key] === "string" ? draft[key] : undefined;
    const numberText = (key: string) => typeof draft[key] === "number" && Number.isFinite(draft[key]) ? String(draft[key]) : undefined;
    const list = (key: string) => Array.isArray(draft[key]) ? draft[key].filter((item): item is string => typeof item === "string").join(", ") : undefined;
    const applied: string[] = [];
    const setText = (key: string, setter: (value: string) => void) => { const value = text(key); if (value !== undefined) { setter(value); applied.push(key); } };
    setText("name", setName); setText("summary", setSummary); setText("description", setDescription);
    setText("compute", setCompute); setText("os", setOs); setText("middleware", setMiddleware);
    setText("license", setLicense); setText("repositoryUrl", setRepoUrl); setText("documentationUrl", setDocsUrl);
    const mappedLists: Array<[string, (value: string) => void]> = [["tags", setTags], ["requiredTools", setRequiredTools], ["requiredSkills", setRequiredSkills], ["languages", setLanguages], ["simulators", setSimulators]];
    for (const [key, setter] of mappedLists) { const value = list(key); if (value !== undefined) { setter(value); applied.push(key); } }
    const mappedNumbers: Array<[string, (value: string) => void]> = [["costUsd", setCostUsd], ["timeHours", setTimeHours], ["dof", setDof], ["payloadKg", setPayloadKg], ["weightKg", setWeightKg], ["heightCm", setHeightCm]];
    for (const [key, setter] of mappedNumbers) { const value = numberText(key); if (value !== undefined) { setter(value); applied.push(key); } }
    if (["beginner", "intermediate", "advanced", "expert"].includes(String(draft.difficulty))) setDifficulty(String(draft.difficulty) as Difficulty);
    if (["native", "community", "none"].includes(String(draft.rosSupport))) setRosSupport(String(draft.rosSupport) as RosSupport);
    if (Array.isArray(draft.fabrication)) setFabrication(draft.fabrication.filter((item): item is Fabrication => typeof item === "string" && FABRICATION_OPTIONS.includes(item as Fabrication)));
    markImported(applied.map((key) => ({ repositoryUrl: "repoUrl", documentationUrl: "docsUrl" })[key] ?? key));
    setMode("manual");
  };

  const buildRpps = (): Partial<RppsPackage> => ({
    hardware: {
      dof: numOrUndef(dof) as any,
      payload_kg: numOrUndef(payloadKg),
      weight_kg: numOrUndef(weightKg),
      height_cm: numOrUndef(heightCm),
      compute: compute.trim() || undefined,
    },
    software: {
      os: os.trim() || undefined,
      middleware: middleware.trim() || undefined,
      languages: toList(languages),
      ros_support: rosSupport || undefined,
      simulators: toList(simulators),
    },
    build: {
      difficulty: (difficulty || undefined) as any,
      estimated_time_hours: numOrUndef(timeHours),
      estimated_cost_usd: numOrUndef(costUsd),
      required_tools: toList(requiredTools),
      required_skills: toList(requiredSkills),
      fabrication,
    },
    cover_image_url: coverImageUrl.trim() || undefined,
  });

  const persistProject = async () => {
    if (!user) {
      if (analysis) saveImport(analysis);
      nav("/auth?redirect=%2Fprojects%2Fnew");
      return;
    }
    setBusy(true);
    try {
      if (mode === "paste") {
        if (pasteState.status !== "valid") throw new Error("Package is not valid RPPS yet");
        const pkg = pasteState.pkg;
        const row = await createProject(user.id, {
          name: pkg.name, slug: pkg.slug, summary: pkg.summary, description: pkg.description,
          license: pkg.license, version: pkg.version, repo_url: pkg.repo_url, docs_url: pkg.docs_url,
          cover_image_url: pkg.cover_image_url, tags: pkg.tags,
          difficulty: pkg.build?.difficulty ?? null,
          estimated_cost_usd: pkg.build?.estimated_cost_usd ?? null,
          visibility, organizationId: organizationId || null, rpps: pkg,
        });
        nav(`/projects/${row.slug}`); return;
      }
      if (hasErrors) throw new Error("Fix highlighted fields before creating");
      const row = await createProject(user.id, {
        name: name.trim(),
        summary: summary.trim() || undefined,
        description: description.trim() || undefined,
        license: license.trim() || undefined,
        version: version.trim() || "0.1.0",
        repo_url: repoUrl.trim() || undefined,
        docs_url: docsUrl.trim() || undefined,
        cover_image_url: coverImageUrl.trim() || undefined,
        tags: tagList,
        difficulty: (difficulty || null) as any,
        estimated_cost_usd: numOrUndef(costUsd) ?? null,
        visibility,
        organizationId: organizationId || null,
        rpps: buildRpps(),
      });
      if (analysis) await createPortableRelease(row.id, { manifest: analysis.manifestYaml, status: "draft" });
      if (importedFiles.length > 0) {
        const results = await Promise.allSettled(importedFiles.map((file) => attachFile(file.id, {
          entityType: "project",
          entityId: row.id,
          purpose: projectUploadKind(file.name),
          relativePath: file.name,
        })));
        const failed = results.filter((result) => result.status === "rejected").length;
        if (failed) toast({ title: "Some source files were not attached", description: `${failed} of ${importedFiles.length} uploads remain in your private file library.`, variant: "destructive" });
      }
      sessionStorage.removeItem("rpp-project-import-analysis");
      nav(`/projects/${row.slug}`);
    } catch (e: any) {
      toast({ title: "Could not create project", description: e.message ?? String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const reviewPayload = () => ({
    name, version, summary, description, tags: tagList, coverImageUrl, difficulty,
    estimatedCostUsd: numOrUndef(costUsd), estimatedTimeHours: numOrUndef(timeHours),
    requiredTools: toList(requiredTools), requiredSkills: toList(requiredSkills), fabrication,
    hardware: { dof: numOrUndef(dof), payloadKg: numOrUndef(payloadKg), weightKg: numOrUndef(weightKg), heightCm: numOrUndef(heightCm), compute },
    software: { os, middleware, languages: toList(languages), rosSupport, simulators: toList(simulators) },
    license, repositoryUrl: repoUrl, documentationUrl: docsUrl, visibility,
  });
  const currentFingerprint = JSON.stringify(reviewPayload());
  const reviewIsCurrent = reviewedFingerprint === currentFingerprint && (qualityReview !== null || reviewUnavailable);

  const reviewBeforeCreate = async () => {
    if (!user || mode === "paste") { await persistProject(); return; }
    if (hasErrors) {
      toast({ title: "Fix highlighted fields", description: "The quality review starts after the basic validation errors are resolved.", variant: "destructive" });
      return;
    }
    setBusy(true);
    setReviewUnavailable(false);
    try {
      const result = await reviewSubmission("project", description.trim(), reviewPayload());
      setQualityReview(result);
      setReviewedFingerprint(currentFingerprint);
      toast({ title: result.decision === "meets_standard" ? "Quality standard met" : "AI suggested changes", description: "Review the report before creating the project." });
    } catch (error) {
      setQualityReview(null);
      setReviewUnavailable(true);
      setReviewedFingerprint(currentFingerprint);
      toast({ title: "AI review unavailable", description: `${error instanceof Error ? error.message : String(error)} You can still create the project without an AI review.`, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const derivedSlug = slugify(name || "project");
  const canCreate = mode === "paste" ? pasteState.status === "valid" && !busy
    : !hasErrors && !busy;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <div className="section-title mb-1">Publish</div>
          <h1 className="text-[20px] font-bold tracking-tight">New project</h1>
          <p className="text-[12px] text-muted-foreground">
            Publish a standardized RPPS <span className="mono">v{RPPS_VERSION}</span> project.{" "}
            <Link to="/rpps" className="text-primary hover:underline">Read the spec</Link>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!user && <Link to="/auth?redirect=%2Fprojects%2Fnew" className="btn-secondary btn-sm">Sign in to save</Link>}
          <Link to="/projects" className="btn-ghost btn-sm">Cancel</Link>
        </div>
      </div>

      {/* Method cards */}
      <fieldset className="mb-4" aria-label="Creation method">
        <legend className="sr-only">Creation method</legend>
        <div role="tablist" aria-label="Creation method" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
          <MethodCard mode={mode} value="manual" onSelect={setMode} icon={<Pencil className="h-3.5 w-3.5" />}
            title="Manual" desc="Start from a blank form. Best when you know your build details firsthand." />
          <MethodCard mode={mode} value="github" onSelect={setMode} icon={<Github className="h-3.5 w-3.5" />}
            title="From GitHub" desc="Reference a public repo, selectively read relevant files, and review every extracted field." />
          <MethodCard mode={mode} value="file" onSelect={setMode} icon={<FileArchive className="h-3.5 w-3.5" />}
            title="Project files" desc="Analyze BOMs, robot descriptions, code metadata, documentation, CAD inventory, or a bounded ZIP package." />
          <MethodCard mode={mode} value="paste" onSelect={setMode} icon={<FileJson className="h-3.5 w-3.5" />}
            title="Paste RPPS JSON" desc="Import an existing RPPS package produced elsewhere. Validated against the schema." />
        </div>
      </fieldset>

      {analysis && <ImportScorecard analysis={analysis} onClear={() => { setAnalysis(null); sessionStorage.removeItem("rpp-project-import-analysis"); }} />}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <div className="min-w-0 space-y-4">
          {mode === "github" && (
            <div className="surface-card p-4 space-y-2">
              <label className="text-[11px] text-muted-foreground flex items-center gap-1"><Github className="h-3 w-3" /> Public GitHub repository URL</label>
              <div className="flex gap-2">
                <input value={ghUrl} onChange={e => setGhUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo" className="input-bare flex-1" />
                <button onClick={importFromGithub} disabled={ghBusy || !ghUrl.trim()} className="btn-primary btn-sm">
                  {ghBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Extract"}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                References the public GitHub repo directly, fetches only bounded relevant files for analysis, and mirrors no repository files unless you later upload or save files yourself. All content is untrusted data only.
              </p>
              {importedFields.size > 0 && (
                <div className="text-[11px] flex items-center gap-1 text-primary"><Info className="h-3 w-3" /> Imported fields are highlighted below — review before publishing.</div>
              )}
            </div>
          )}

          {mode === "file" && (
            <div className="surface-card p-4 space-y-3">
              <div>
                <div className="flex items-center gap-1.5 text-[13px] font-semibold"><FileArchive className="h-4 w-4" /> Analyze project files</div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Import a portable <span className="mono">rpps.yaml</span>, BOM, robot description, project file set, or ZIP package. The deterministic pass inventories artifacts, preserves provenance, and reports missing build information without executing imported content.
                </p>
              </div>
              <label className={`flex min-h-28 cursor-pointer flex-col items-center justify-center rounded border border-dashed p-5 text-center transition-colors ${fileBusy ? "pointer-events-none opacity-60" : "hover:border-primary hover:bg-primary/5"}`}>
                {fileBusy ? <Loader2 className="mb-2 h-5 w-5 animate-spin text-primary" /> : <FileArchive className="mb-2 h-5 w-5 text-muted-foreground" />}
                <span className="text-[12px] font-medium">{fileBusy ? "Analyzing project package…" : "Choose project files or a ZIP package"}</span>
                <span className="mt-1 text-[10.5px] text-muted-foreground">Multiple files: 100 files / 100 MiB total. Extracted text is capped at 5 MiB. ZIP files are capped at 10 MiB compressed.</span>
                <input
                  type="file"
                  multiple
                  className="sr-only"
                  accept=".yaml,.yml,.json,.csv,.tsv,.urdf,.xacro,.xml,.md,.txt,.toml,.zip,.step,.stp,.stl,.obj,.gltf,.glb,.mjcf,.sdf,.py,.js,.ts,.cpp,.c,.h,.ino,application/zip,text/csv,application/json"
                  disabled={fileBusy}
                  onChange={(event) => {
                    const files = Array.from(event.currentTarget.files ?? []);
                    event.currentTarget.value = "";
                    if (files.length) void importProjectFiles(files);
                  }}
                />
              </label>
              <div className="grid gap-2 md:grid-cols-3 text-[10.5px] text-muted-foreground">
                <div className="rounded border border-border p-2"><span className="font-medium text-foreground">Portable</span><br />Exports stay independent of RoboPartPicker.</div>
                <div className="rounded border border-border p-2"><span className="font-medium text-foreground">Reviewable</span><br />Original values and source paths remain visible.</div>
                <div className="rounded border border-border p-2"><span className="font-medium text-foreground">Private by default</span><br />Nothing is published during analysis.</div>
              </div>
            </div>
          )}

          {mode === "paste" ? (
            <div className="surface-card p-4 space-y-2">
              <label className="text-[11px] text-muted-foreground flex items-center gap-1"><FileJson className="h-3 w-3" /> RPPS package JSON</label>
              <textarea value={pasted} onChange={e => setPasted(e.target.value)} rows={18}
                className="input-bare h-auto min-h-[24rem] w-full resize-y font-mono text-[11px]"
                placeholder='{"rpps_version":"1.0.0","name":"…","slug":"…","version":"0.1.0","bom":[]}' />
              <PasteFeedback state={pasteState} />
              <div className="pt-2">
                <Field label="Organization owner">
                  <select value={organizationId} onChange={e => {
                    const next = e.target.value;
                    setOrganizationId(next);
                    if (!next && visibility === "organization") setVisibility("private");
                  }} className="input-bare w-full">
                    <option value="">Personal project</option>
                    {projectOrganizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name} · {organization.member_role}</option>)}
                  </select>
                </Field>
                <VisibilitySelector value={visibility} organizationSelected={Boolean(organizationId)} onChange={setVisibility} />
              </div>
            </div>
          ) : mode === "file" ? null : (
            <>
              <AiNarrativeComposer
                form="project"
                value={description}
                onChange={setDescription}
                current={reviewPayload()}
                onApply={applyAiDraft}
                hint="Start with a free-form description. Keep your voice and level of detail; the structured sections below are optional until a fact is useful for buildability."
                placeholder="Example: I am publishing a 12-DOF walking robot based on release 0.4. The frame is printed in PETG, firmware is in the linked repository, and the motor-controller revision is still uncertain…"
              />
              <Section title="Identity" desc="What this project is called and how it’s described.">
                <Grid>
                  <Field label="Name *" error={errors.name} imported={importedFields.has("name")} onEdit={() => clearImported("name")}>
                    <input value={name} onChange={e => { setName(e.target.value); clearImported("name"); }} className="input-bare w-full" />
                  </Field>
                  <Field label="Slug (auto)">
                    <input value={derivedSlug} disabled className="input-bare w-full opacity-60 mono" />
                  </Field>
                  <Field label="Version *" error={errors.version}>
                    <input value={version} onChange={e => setVersion(e.target.value)} className="input-bare w-full mono" />
                  </Field>
                  <Field label="Cover image URL" error={errors.coverImageUrl} imported={importedFields.has("coverImageUrl")} onEdit={() => clearImported("coverImageUrl")}>
                    <input value={coverImageUrl} onChange={e => { setCoverImageUrl(e.target.value); clearImported("coverImageUrl"); }} placeholder="https://…" className="input-bare w-full" />
                  </Field>
                </Grid>
                <Field label={`Summary (${summary.length}/280)`} error={errors.summary} imported={importedFields.has("summary")} onEdit={() => clearImported("summary")}>
                  <input maxLength={280} value={summary} onChange={e => { setSummary(e.target.value); clearImported("summary"); }} className="input-bare w-full" />
                </Field>
                <Field label="Tags (comma separated)" imported={importedFields.has("tags")} onEdit={() => clearImported("tags")}>
                  <input value={tags} onChange={e => { setTags(e.target.value); clearImported("tags"); }} placeholder="humanoid, arm, ros2" className="input-bare w-full" />
                  {tagList.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {tagList.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground mono">{t}</span>)}
                    </div>
                  )}
                </Field>
              </Section>

              <Collapsible open={openBuild} onToggle={() => setOpenBuild(v => !v)} title="Build profile" desc="Difficulty, cost, time, and what someone needs to attempt it.">
                <Grid>
                  <Field label="Difficulty">
                    <select value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)} className="input-bare w-full">
                      <option value="">—</option><option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
                      <option value="expert">Expert</option>
                    </select>
                  </Field>
                  <Field label="Estimated cost (USD)" error={errors.costUsd}>
                    <input type="number" min={0} value={costUsd} onChange={e => setCostUsd(e.target.value)} className="input-bare w-full mono" />
                  </Field>
                  <Field label="Estimated build time (hours)" error={errors.timeHours}>
                    <input type="number" min={0} value={timeHours} onChange={e => setTimeHours(e.target.value)} className="input-bare w-full mono" />
                  </Field>
                </Grid>
                <Grid>
                  <Field label="Required tools (comma separated)">
                    <input value={requiredTools} onChange={e => setRequiredTools(e.target.value)} placeholder="soldering iron, calipers, torque wrench" className="input-bare w-full" />
                  </Field>
                  <Field label="Required skills (comma separated)">
                    <input value={requiredSkills} onChange={e => setRequiredSkills(e.target.value)} placeholder="soldering, basic CAD, ROS 2" className="input-bare w-full" />
                  </Field>
                </Grid>
                <fieldset>
                  <legend className="text-[11px] text-muted-foreground mb-1">Fabrication methods</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {FABRICATION_OPTIONS.map(f => {
                      const active = fabrication.includes(f);
                      return (
                        <button key={f} type="button" aria-pressed={active}
                          onClick={() => setFabrication(prev => active ? prev.filter(x => x !== f) : [...prev, f])}
                          className={`text-[11px] px-2 py-0.5 rounded border mono ${active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                          {f}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              </Collapsible>

              <Collapsible open={openHw} onToggle={() => setOpenHw(v => !v)} title="Hardware" desc="Physical characteristics and compute.">
                <Grid>
                  <Field label="Degrees of freedom" error={errors.dof}>
                    <input type="number" min={0} value={dof} onChange={e => setDof(e.target.value)} className="input-bare w-full mono" />
                  </Field>
                  <Field label="Payload (kg)" error={errors.payloadKg}>
                    <input type="number" min={0} step="0.01" value={payloadKg} onChange={e => setPayloadKg(e.target.value)} className="input-bare w-full mono" />
                  </Field>
                  <Field label="Weight (kg)" error={errors.weightKg}>
                    <input type="number" min={0} step="0.01" value={weightKg} onChange={e => setWeightKg(e.target.value)} className="input-bare w-full mono" />
                  </Field>
                  <Field label="Height (cm)" error={errors.heightCm}>
                    <input type="number" min={0} step="0.1" value={heightCm} onChange={e => setHeightCm(e.target.value)} className="input-bare w-full mono" />
                  </Field>
                  <Field label="Compute">
                    <input value={compute} onChange={e => setCompute(e.target.value)} placeholder="Jetson Orin Nano, RPi 5…" className="input-bare w-full" />
                  </Field>
                </Grid>
              </Collapsible>

              <Collapsible open={openSw} onToggle={() => setOpenSw(v => !v)} title="Software" desc="OS, middleware, languages, and simulation targets.">
                <Grid>
                  <Field label="OS"><input value={os} onChange={e => setOs(e.target.value)} placeholder="Ubuntu 24.04" className="input-bare w-full" /></Field>
                  <Field label="Middleware"><input value={middleware} onChange={e => setMiddleware(e.target.value)} placeholder="ROS 2 Jazzy" className="input-bare w-full" /></Field>
                  <Field label="ROS support">
                    <select value={rosSupport} onChange={e => setRosSupport(e.target.value as RosSupport)} className="input-bare w-full">
                      <option value="">—</option><option value="native">Native</option>
                      <option value="community">Community</option><option value="none">None</option>
                    </select>
                  </Field>
                  <Field label="Languages (comma separated)">
                    <input value={languages} onChange={e => setLanguages(e.target.value)} placeholder="C++, Python, Rust" className="input-bare w-full" />
                  </Field>
                  <Field label="Simulators (comma separated)">
                    <input value={simulators} onChange={e => setSimulators(e.target.value)} placeholder="Gazebo, MuJoCo, Isaac Sim" className="input-bare w-full" />
                  </Field>
                </Grid>
              </Collapsible>

              <Section title="Publishing" desc="License, source links, and visibility.">
                <Grid>
                  <Field label="License (SPDX)" imported={importedFields.has("license")} onEdit={() => clearImported("license")}>
                    <input value={license} onChange={e => { setLicense(e.target.value); clearImported("license"); }} placeholder="MIT, Apache-2.0, CERN-OHL-S-2.0…" className="input-bare w-full" />
                  </Field>
                  <Field label="Repository URL" error={errors.repoUrl} imported={importedFields.has("repoUrl")} onEdit={() => clearImported("repoUrl")}>
                    <input value={repoUrl} onChange={e => { setRepoUrl(e.target.value); clearImported("repoUrl"); }} placeholder="https://github.com/…" className="input-bare w-full" />
                  </Field>
                  <Field label="Docs URL" error={errors.docsUrl}>
                    <input value={docsUrl} onChange={e => setDocsUrl(e.target.value)} placeholder="https://…" className="input-bare w-full" />
                  </Field>
                </Grid>
                <Field label="Organization owner">
                  <select value={organizationId} onChange={e => {
                    const next = e.target.value;
                    setOrganizationId(next);
                    if (!next && visibility === "organization") setVisibility("private");
                  }} className="input-bare w-full">
                    <option value="">Personal project</option>
                    {projectOrganizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name} · {organization.member_role}</option>)}
                  </select>
                </Field>
                <VisibilitySelector value={visibility} organizationSelected={Boolean(organizationId)} onChange={setVisibility} />
              </Section>
            </>
          )}
        </div>

        {/* Sidebar */}
        <aside className="lg:sticky lg:top-4 lg:self-start space-y-3">
          <div className="surface-card p-3">
            <div className="section-title mb-2">Summary</div>
            <dl className="text-[12px] space-y-1">
              <Row k="Slug" v={<span className="mono">{derivedSlug}</span>} />
              <Row k="Version" v={<span className="mono">{version || "—"}</span>} />
              <Row k="Visibility" v={<span className="capitalize">{visibility}</span>} />
              <Row k="Owner" v={organizationId ? projectOrganizations.find((organization) => organization.id === organizationId)?.name ?? "Organization" : "Personal"} />
              <Row k="RPPS" v={<span className="mono">v{RPPS_VERSION}</span>} />
            </dl>
          </div>

          {mode !== "paste" && (
            <div className="surface-card p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="section-title">Readiness</div>
                <div className="text-[11px] mono text-muted-foreground">{readiness.done}/{readiness.total}</div>
              </div>
              <div className="h-1 w-full bg-muted rounded overflow-hidden mb-2" aria-hidden>
                <div className="h-full bg-primary transition-all" style={{ width: `${readiness.pct}%` }} />
              </div>
              <ul className="space-y-1 text-[11.5px]">
                {readiness.checks.map(c => (
                  <li key={c.label} className="flex items-center gap-1.5">
                    {c.ok ? <CheckCircle2 className="h-3 w-3 text-primary" /> : <AlertCircle className="h-3 w-3 text-muted-foreground" />}
                    <span className={c.ok ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[10.5px] text-muted-foreground mt-2">Local guidance only — not stored on the project.</p>
            </div>
          )}

          {qualityReview && reviewIsCurrent && <SubmissionQualityCard review={qualityReview} />}
          {reviewUnavailable && reviewIsCurrent && <div className="surface-card border-amber-500/40 p-3 text-[10.5px] text-muted-foreground"><span className="font-medium text-foreground">AI review unavailable.</span> You can save without it; no quality claim will be attached.</div>}

          <div className="surface-card p-3 space-y-2">
            <button onClick={() => void (mode === "paste" || reviewIsCurrent ? persistProject() : reviewBeforeCreate())} disabled={!canCreate}
              className="btn-primary btn-sm w-full disabled:opacity-50 disabled:cursor-not-allowed">
              {busy ? (reviewIsCurrent ? "Creating…" : "Reviewing…") : !user ? "Sign in to save" : mode === "paste" ? "Validate & create" : !reviewIsCurrent ? "Review quality with AI" : qualityReview?.decision === "needs_changes" ? "Create with acknowledged changes" : "Create project"}
            </button>
            {mode !== "paste" && reviewIsCurrent && <button type="button" className="btn-ghost btn-sm w-full" onClick={() => { setQualityReview(null); setReviewUnavailable(false); setReviewedFingerprint(null); }}>Revise and review again</button>}
            {mode !== "paste" && hasErrors && (
              <div className="text-[11px] text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Fix highlighted fields to continue.</div>
            )}
            <Link to="/projects" className="btn-ghost btn-sm w-full text-center block">Cancel</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ---------- Subcomponents ---------- */

const MethodCard = ({ mode, value, onSelect, icon, title, desc }: {
  mode: Mode; value: Mode; onSelect: (m: Mode) => void; icon: React.ReactNode; title: string; desc: string;
}) => {
  const active = mode === value;
  return (
    <button role="tab" aria-selected={active} onClick={() => onSelect(value)}
      className={`text-left rounded border p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        active ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40 bg-surface"
      }`}>
      <div className="flex items-center gap-1.5 text-[12px] font-medium">{icon}{title}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{desc}</div>
    </button>
  );
};

const PROFILE_LABELS: Record<keyof ProjectImportAnalysis["report"]["profiles"], string> = {
  core: "Core",
  buildable: "Buildable",
  reproducible: "Reproducible",
  collaborative: "Collaborative",
};

const DIMENSION_LABELS: Record<keyof ProjectImportAnalysis["report"]["dimensions"], string> = {
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

const ImportScorecard = ({ analysis, onClear }: { analysis: ProjectImportAnalysis; onClear: () => void }) => {
  const blockers = analysis.report.findings.filter((finding) => finding.severity === "blocker");
  const retrieval = describeProjectImportRetrieval(analysis.retrieval);
  return (
    <section className="surface-card mb-4 overflow-hidden" aria-labelledby="import-scorecard-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div>
          <div className="section-title">Deterministic import</div>
          <h2 id="import-scorecard-title" className="text-[14px] font-semibold">Buildability scorecard · {analysis.sourceLabel}</h2>
          <p className="mt-1 text-[10.5px] text-muted-foreground">
            {analysis.inventory.relevantFiles} relevant of {analysis.inventory.totalFiles} inventoried · {analysis.sourceMappings.length} provenance mappings · {retrieval.modeLabel} via {retrieval.providerLabel} · no AI used
          </p>
        </div>
        <button type="button" onClick={onClear} className="btn-ghost btn-sm">Clear analysis</button>
      </div>
      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {(Object.entries(analysis.report.profiles) as Array<[keyof typeof PROFILE_LABELS, { score: number; conformant: boolean }]>).map(([profile, result]) => (
              <div key={profile} className={`rounded border p-2 ${result.conformant ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{PROFILE_LABELS[profile]}</div>
                <div className="mt-1 flex items-baseline justify-between gap-2"><span className="mono text-[16px] font-semibold">{result.score}%</span><span className="text-[10px] text-muted-foreground">{result.conformant ? "conformant" : "incomplete"}</span></div>
              </div>
            ))}
          </div>
          <div>
            <div className="section-title mb-2">Score dimensions</div>
            <div className="grid gap-x-4 gap-y-2 md:grid-cols-2">
              {(Object.entries(analysis.report.dimensions) as Array<[keyof typeof DIMENSION_LABELS, number]>).map(([dimension, score]) => (
                <div key={dimension}>
                  <div className="mb-1 flex justify-between gap-2 text-[10.5px]"><span>{DIMENSION_LABELS[dimension]}</span><span className="mono text-muted-foreground">{score}%</span></div>
                  <div className="h-1 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${score}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="section-title mb-2">Extracted project intelligence</div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <ExtractionStat label="Explicit parts" value={analysis.extracted.parts.candidates.length} detail={analysis.extracted.parts.sourcePaths.length ? `from ${analysis.extracted.parts.sourcePaths.length} manifest/BOM file(s)` : "No explicit BOM found"} />
              <ExtractionStat label="Model structure" value={analysis.extracted.model?.linkCount ?? 0} detail={analysis.extracted.model ? `${analysis.extracted.model.movableJointCount} movable joints · ${analysis.extracted.parts.modelCandidates.length} mesh-linked structures` : "No parsed URDF"} />
              <ExtractionStat label="Software packages" value={analysis.extracted.software.packages.length} detail={`${analysis.extracted.software.packages.reduce((sum, item) => sum + item.dependencies.length, 0)} declared dependencies`} />
              <ExtractionStat label="Procedure candidates" value={analysis.extracted.procedureCandidates.length} detail="Heuristic draft steps requiring creator review" />
              <ExtractionStat label="Configuration keys" value={analysis.extracted.configuration.parameters.length} detail="Names and value types only; configuration values are not exposed in the summary" />
              <ExtractionStat label="Engineering artifacts" value={analysis.extracted.repository.nativeCadArtifacts.length + analysis.extracted.repository.manufacturingArtifacts.length + analysis.extracted.repository.firmwareArtifacts.length + analysis.extracted.repository.testArtifacts.length} detail={`${analysis.extracted.repository.ciDefinitions.length} CI · ${analysis.extracted.repository.licenses.length} license · ${analysis.extracted.repository.contributionGuides.length} contribution file(s)`} />
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">Model links and meshes are classified as fabricated parts or assemblies; they are not treated as purchasable catalog components until a BOM or reviewed identity supports that claim.</p>
          </div>
          <div>
            <div className="section-title mb-2">Retrieval and storage boundary</div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <ExtractionStat label="Import mode" value={retrieval.modeLabel} detail={`${retrieval.providerLabel} · ${retrieval.requestLabel}`} />
              <ExtractionStat label="Fetched content" value={retrieval.fileReadLabel} detail={`${retrieval.attemptedLabel} · ${retrieval.byteLabel}`} />
              <ExtractionStat label="Stored copies" value={retrieval.storageLabel} detail={analysis.retrieval.mode === "reference" ? "Repository files remain at their source during analysis" : "Uploaded sources stay private unless published later"} />
              <ExtractionStat label="Fetch health" value={retrieval.failureLabel} detail={retrieval.inventoryLabel} />
            </div>
          </div>
          {analysis.importWarnings.length > 0 && (
            <div className="rounded border border-border bg-muted/30 p-2">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Import notes</div>
              <ul className="space-y-1 text-[10.5px] text-muted-foreground">{analysis.importWarnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul>
            </div>
          )}
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-2"><div className="section-title">Highest-impact findings</div><span className="mono text-[10px] text-muted-foreground">{blockers.length} blockers</span></div>
          {analysis.report.findings.length === 0 ? (
            <div className="rounded border border-primary/40 bg-primary/5 p-3 text-[11px] text-primary">No deterministic findings for this manifest.</div>
          ) : (
            <ol className="max-h-[360px] space-y-2 overflow-auto pr-1">
              {analysis.report.findings.slice(0, 12).map((finding) => (
                <li key={`${finding.ruleId}-${finding.affectedObject ?? "release"}`} className="rounded border border-border p-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mono text-[10px] font-semibold">{finding.ruleId}</span>
                    <span className={`rounded px-1 py-0.5 text-[9px] uppercase tracking-wide ${finding.severity === "blocker" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>{finding.severity}</span>
                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{finding.deterministic ? "deterministic" : "inferred"}</span>
                  </div>
                  <p className="mt-1 text-[10.5px]">{finding.message}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{finding.suggestion}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
};

const ExtractionStat = ({ label, value, detail }: { label: string; value: React.ReactNode; detail: string }) => (
  <div className="rounded border border-border p-2"><div className="text-[9.5px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 font-mono text-[16px] font-semibold">{value}</div><p className="mt-0.5 text-[9.5px] leading-snug text-muted-foreground">{detail}</p></div>
);

const Section = ({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) => (
  <section className="surface-card p-4 space-y-3">
    <div>
      <div className="text-[13px] font-semibold tracking-tight">{title}</div>
      {desc && <div className="text-[11px] text-muted-foreground">{desc}</div>}
    </div>
    {children}
  </section>
);

const Collapsible = ({ open, onToggle, title, desc, children }: {
  open: boolean; onToggle: () => void; title: string; desc?: string; children: React.ReactNode;
}) => (
  <section className="surface-card">
    <button type="button" onClick={onToggle} aria-expanded={open}
      className="w-full flex items-center justify-between gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
      <div>
        <div className="text-[13px] font-semibold tracking-tight">{title}</div>
        {desc && <div className="text-[11px] text-muted-foreground">{desc}</div>}
      </div>
      {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
    </button>
    {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
  </section>
);

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
);

const Field = ({ label, children, error, imported, onEdit }: {
  label: string; children: React.ReactNode; error?: string; imported?: boolean; onEdit?: () => void;
}) => (
  <label className="block">
    <div className="text-[11px] text-muted-foreground mb-0.5 flex items-center gap-1.5">
      <span>{label}</span>
      {imported && (
        <button type="button" onClick={onEdit}
          className="text-[10px] uppercase tracking-wide mono px-1 py-0.5 rounded bg-primary/15 text-primary hover:bg-primary/25"
          title="Imported — click to acknowledge">
          imported
        </button>
      )}
    </div>
    {children}
    {error && <div className="text-[10.5px] text-destructive mt-0.5">{error}</div>}
  </label>
);

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2">
    <dt className="text-muted-foreground text-[11px]">{k}</dt>
    <dd className="text-[12px]">{v}</dd>
  </div>
);

type Visibility = "public" | "organization" | "unlisted" | "private";
const VISIBILITY_OPTIONS: ReadonlyArray<readonly [Visibility, string, string]> = [
  ["public", "Public", "Listed in Discover and search. Anyone can view."],
  ["organization", "Organization", "Only active members of the selected organization can view."],
  ["unlisted", "Unlisted", "Anyone with the link can view. Hidden from Discover."],
  ["private", "Private", "Only you can view. Useful for drafts."],
];
const VisibilitySelector = ({ value, organizationSelected, onChange }: { value: Visibility; organizationSelected: boolean; onChange: (v: Visibility) => void }) => (
  <fieldset>
    <legend className="text-[11px] text-muted-foreground mb-1">Visibility</legend>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
      {VISIBILITY_OPTIONS.map(([v, l, d]) => {
        const active = value === v;
        const disabled = v === "organization" && !organizationSelected;
        return (
          <label key={v} className={`rounded border p-2 text-[12px] ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${active ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}>
            <div className="flex items-center gap-2">
              <input type="radio" name="visibility" className="accent-primary" checked={active} disabled={disabled} onChange={() => onChange(v)} />
              <span className="font-medium">{l}</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">{d}</div>
          </label>
        );
      })}
    </div>
  </fieldset>
);

type PasteState =
  | { status: "empty" }
  | { status: "invalid-json"; message: string }
  | { status: "invalid-schema"; errors: string[] }
  | { status: "valid"; pkg: RppsPackage };

const PasteFeedback = ({ state }: { state: PasteState }) => {
  if (state.status === "empty") return (
    <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Info className="h-3 w-3" /> Paste an RPPS JSON package to validate.</div>
  );
  if (state.status === "invalid-json") return (
    <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive">
      <div className="flex items-center gap-1 font-medium"><AlertCircle className="h-3 w-3" /> Invalid JSON</div>
      <div className="mono mt-1 break-words">{state.message}</div>
    </div>
  );
  if (state.status === "invalid-schema") return (
    <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive">
      <div className="flex items-center gap-1 font-medium mb-1"><AlertCircle className="h-3 w-3" /> Schema validation failed</div>
      <ul className="mono space-y-0.5 max-h-40 overflow-auto">
        {state.errors.slice(0, 20).map((e, i) => <li key={i}>• {e}</li>)}
        {state.errors.length > 20 && <li>… {state.errors.length - 20} more</li>}
      </ul>
    </div>
  );
  const p = state.pkg;
  return (
    <div className="rounded border border-primary/40 bg-primary/5 p-2 text-[11px]">
      <div className="flex items-center gap-1 font-medium text-primary mb-1"><CheckCircle2 className="h-3 w-3" /> Valid RPPS package</div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <Row k="Name" v={p.name} />
        <Row k="Slug" v={<span className="mono">{p.slug}</span>} />
        <Row k="Version" v={<span className="mono">{p.version}</span>} />
        <Row k="License" v={p.license ?? "—"} />
        <Row k="BOM items" v={<span className="mono">{p.bom?.length ?? 0}</span>} />
        <Row k="Assembly steps" v={<span className="mono">{p.assembly?.length ?? 0}</span>} />
      </dl>
    </div>
  );
};

function projectUploadKind(name: string): FileKind {
  const extension = name.split(".").at(-1)?.toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif", "avif"].includes(extension ?? "")) return "image";
  if (["step", "stp", "iges", "igs", "stl", "obj", "gltf", "glb"].includes(extension ?? "")) return "cad";
  if (["urdf", "xacro"].includes(extension ?? "")) return "urdf";
  if (["mjcf", "sdf"].includes(extension ?? "")) return "mjcf";
  if (["csv", "tsv", "xlsx"].includes(extension ?? "") || /(^|[-_.])(bom|parts?)([-_.]|$)/iu.test(name)) return "bom";
  if (["ino", "hex", "bin", "elf", "uf2"].includes(extension ?? "")) return "firmware";
  if (["yaml", "yml", "json", "toml", "ini", "cfg", "conf"].includes(extension ?? "")) return "configuration";
  if (["md", "txt", "pdf", "doc", "docx", "xml"].includes(extension ?? "")) return "document";
  return "attachment";
}

function isDirectProjectText(name: string): boolean {
  return /\.(?:ya?ml|json|csv|tsv|urdf|xacro)$/iu.test(name);
}
