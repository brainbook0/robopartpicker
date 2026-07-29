import { getSandbox } from "@cloudflare/sandbox";
import type { Env, ImportQueueMessage } from "../env";
import { analyzeStoredProjectFiles, type ProjectImportAnalysis } from "./project-import";
import { assertQueueMessageMatchesQueue } from "./scrape-ingestion-jobs";

const SANDBOX_FORMATS = new Set(["xlsx", "pdf", "zip", "tar", "tgz", "tar_gz", "step", "stp", "iges", "igs", "stl", "obj", "gltf", "glb", "dae", "usd", "usdz"]);
const WORKER_FORMATS = new Set([
  "urdf", "xacro", "sdf", "srdf", "mjcf", "package_xml", "ros_launch", "yaml", "json", "xml", "csv", "tsv", "markdown",
  "kicad_bom", "kicad_netlist", "kicad_schematic", "dockerfile", "python_manifest", "javascript_manifest", "cmake", "firmware_config", "install_script", "text",
]);
const ROBOT_FORMATS = new Set(["urdf", "xacro", "sdf", "srdf", "mjcf", "usd", "usdz"]);

type ImportJobRow = {
  id: string; source_id: string; status: string; requested_by_user_id: string | null; cancellation_requested: number;
  attempt_count: number; source_context_json: string;
};
type ImportFileRow = {
  id: string; import_job_id: string; file_id: string | null; source_path: string; media_type: string | null; format_key: string;
  processor_kind: "worker" | "sandbox" | "unsupported"; status: string; retry_count: number;
};

export type ImportFormat = { formatKey: string; processorKind: "worker" | "sandbox" | "unsupported" };

export function classifyImportFormat(name: string, mediaType = ""): ImportFormat {
  const lower = name.toLowerCase().replace(/\\/gu, "/");
  let formatKey = lower.endsWith(".urdf.xacro") ? "xacro" : lower.split(".").at(-1) ?? "";
  if (/(^|\/)package\.xml$/u.test(lower)) formatKey = "package_xml";
  else if (/(^|\/)package\.json$/u.test(lower)) formatKey = "javascript_manifest";
  else if (/(^|\/)(?:pyproject\.toml|requirements(?:[-_.][^/]*)?\.txt)$/u.test(lower)) formatKey = "python_manifest";
  else if (/(^|\/)cmakelists\.txt$/u.test(lower)) formatKey = "cmake";
  else if (/(^|\/)dockerfile$/u.test(lower)) formatKey = "dockerfile";
  else if (/(?:^|\/)[^/]*(?:install|setup)[^/]*\.sh$/u.test(lower)) formatKey = "install_script";
  else if (/\.launch(?:\.xml|\.py)?$/u.test(lower)) formatKey = "ros_launch";
  else if (/\.kicad_sch$/u.test(lower)) formatKey = "kicad_schematic";
  else if (/\.(?:net|netlist)$/u.test(lower)) formatKey = "kicad_netlist";
  else if (/bom|bill[-_ ]?of[-_ ]?materials|parts?/u.test(lower) && /\.(?:csv|tsv)$/u.test(lower)) formatKey = "kicad_bom";
  else if (/\.(?:ya?ml)$/u.test(lower)) formatKey = "yaml";
  else if (/\.md$/u.test(lower)) formatKey = "markdown";
  else if (/\.(?:ini|cfg|config|toml)$/u.test(lower)) formatKey = "firmware_config";
  else if (/\.(?:txt|log)$/u.test(lower)) formatKey = "text";
  else if (/\.(?:tar\.gz|tgz)$/u.test(lower)) formatKey = lower.endsWith(".tgz") ? "tgz" : "tar_gz";
  else if (mediaType === "application/pdf") formatKey = "pdf";
  if (SANDBOX_FORMATS.has(formatKey)) return { formatKey, processorKind: "sandbox" };
  if (WORKER_FORMATS.has(formatKey)) return { formatKey, processorKind: "worker" };
  return { formatKey: formatKey || "unknown", processorKind: "unsupported" };
}

export async function processQueueBatch(batch: MessageBatch<ImportQueueMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    try {
      assertQueueMessageMatchesQueue(batch.queue, message.body);
      if (message.body.kind === "project-import" && message.body.jobId) await processProjectImportJob(env, message.body.jobId);
      else if (message.body.kind === "ai-evaluation" && message.body.evaluationRunId) await processEvaluationRun(env.DB, message.body.evaluationRunId);
      message.ack();
    } catch (error) {
      const identifier = message.body.jobId ?? message.body.evaluationRunId;
      const detail = sanitizeError(error);
      if (message.body.kind === "project-import" && identifier) {
        await markJobAttemptFailed(env.DB, identifier, detail, message.attempts >= 3);
      } else if (identifier && message.attempts >= 3) {
        await env.DB.prepare("UPDATE ai_evaluation_runs SET status = 'failed', aggregate_metrics_json = ?1, completed_at = ?2 WHERE id = ?3")
          .bind(JSON.stringify({ error: detail }), new Date().toISOString(), identifier).run();
      }
      if (message.attempts >= 3) message.ack();
      else message.retry({ delaySeconds: Math.min(300, 15 * (2 ** Math.max(0, message.attempts - 1))) });
    }
  }
}

export async function processProjectImportJob(env: Env, jobId: string): Promise<void> {
  const job = await env.DB.prepare("SELECT * FROM import_jobs WHERE id = ?1").bind(jobId).first<ImportJobRow>();
  if (!job || ["complete", "cancelled"].includes(job.status)) return;
  if (!job.requested_by_user_id) throw new Error("Import job has no requesting user.");
  const now = new Date().toISOString();
  if (job.cancellation_requested) {
    await cancelJob(env.DB, job.id, now);
    return;
  }
  await env.DB.batch([
    env.DB.prepare(`UPDATE import_jobs SET status = 'processing', current_stage = 'inventory', progress_percent = 2,
      started_at = COALESCE(started_at, ?1), attempt_count = attempt_count + 1, updated_at = ?1 WHERE id = ?2`).bind(now, job.id),
    eventStatement(env.DB, job.id, null, "job.processing", 2, "Import processing started.", {}, now),
  ]);
  const files = (await env.DB.prepare("SELECT * FROM import_job_files WHERE import_job_id = ?1 ORDER BY created_at").bind(job.id).all<ImportFileRow>()).results;
  const supportedFiles = files.filter((file) => file.processor_kind !== "unsupported" && file.file_id);
  let analysis: ProjectImportAnalysis | null = null;
  if (supportedFiles.length) {
    analysis = await analyzeStoredProjectFiles(env, supportedFiles.map((file) => file.file_id!), job.requested_by_user_id);
  }
  const unsupported = files.filter((file) => file.processor_kind === "unsupported");
  for (const file of unsupported) {
    await updateFileResult(env.DB, file, "unsupported", 100, {}, [`The ${file.format_key} format is inventoried but has no safe parser configured.`], ["compatible safe parser"], now);
  }
  const workerFiles = files.filter((file) => file.processor_kind === "worker");
  for (const file of workerFiles) {
    const artifact = analysis?.inventory.artifacts.find((item) => item.path === file.source_path);
    const model = analysis?.extracted.model?.sourcePath === file.source_path ? analysis.extracted.model : undefined;
    await updateFileResult(env.DB, file, "complete", 100, { artifact, model, provenance: sourceProvenance(file) }, [], model?.missingAssets ?? [], new Date().toISOString());
  }
  const sandboxFiles = files.filter((file) => file.processor_kind === "sandbox");
  for (let index = 0; index < sandboxFiles.length; index += 1) {
    const latest = await env.DB.prepare("SELECT cancellation_requested FROM import_jobs WHERE id = ?1").bind(job.id).first<{ cancellation_requested: number }>();
    if (latest?.cancellation_requested) {
      await cancelJob(env.DB, job.id, new Date().toISOString());
      return;
    }
    const progress = Math.min(92, 10 + Math.round(((index + 1) / Math.max(1, sandboxFiles.length)) * 75));
    await env.DB.batch([
      env.DB.prepare("UPDATE import_jobs SET current_stage = 'native-processing', progress_percent = ?1, updated_at = ?2 WHERE id = ?3").bind(progress, new Date().toISOString(), job.id),
      env.DB.prepare("UPDATE import_job_files SET status = 'processing', progress_percent = 10, updated_at = ?1 WHERE id = ?2").bind(new Date().toISOString(), sandboxFiles[index].id),
    ]);
    try {
      const result = await processInSandbox(env, job, sandboxFiles[index]);
      await updateFileResult(env.DB, sandboxFiles[index], result.warnings.length ? "warning" : "complete", 100, result,
        result.warnings, result.missingDependencies, new Date().toISOString());
    } catch (error) {
      await updateFileResult(env.DB, sandboxFiles[index], "failed", 100, {}, [sanitizeError(error)], [], new Date().toISOString());
    }
  }
  if (analysis) await persistAnalysis(env.DB, job, files, analysis);
  const counts = await env.DB.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status IN ('complete', 'warning') THEN 1 ELSE 0 END) AS accepted,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS rejected,
      SUM(CASE WHEN status = 'unsupported' THEN 1 ELSE 0 END) AS unsupported
    FROM import_job_files WHERE import_job_id = ?1`).bind(job.id).first<{ total: number; accepted: number; rejected: number; unsupported: number }>();
  const accepted = Number(counts?.accepted ?? 0); const rejected = Number(counts?.rejected ?? 0); const unsupportedCount = Number(counts?.unsupported ?? 0);
  const status = rejected || unsupportedCount ? "partial" : "complete";
  const completed = new Date().toISOString();
  const summary = { totalFiles: Number(counts?.total ?? files.length), accepted, rejected, unsupported: unsupportedCount,
    warnings: analysis?.importWarnings ?? [], analysisAvailable: Boolean(analysis), sourceProvenancePreserved: true };
  await env.DB.batch([
    env.DB.prepare(`UPDATE import_jobs SET status = ?1, current_stage = 'complete', progress_percent = 100, accepted_count = ?2,
      rejected_count = ?3, result_summary_json = ?4, updated_at = ?5, completed_at = ?5 WHERE id = ?6`)
      .bind(status, accepted, rejected + unsupportedCount, JSON.stringify(summary), completed, job.id),
    eventStatement(env.DB, job.id, null, `job.${status}`, 100, status === "complete" ? "Import completed." : "Import completed with partial results.", summary, completed),
  ]);
}

async function processInSandbox(env: Env, job: ImportJobRow, file: ImportFileRow): Promise<Record<string, unknown> & { warnings: string[]; missingDependencies: string[] }> {
  if (!env.Sandbox) throw new Error("Sandbox processing is not configured for this environment.");
  if (!file.file_id || !SANDBOX_FORMATS.has(file.format_key)) throw new Error("The file does not have an allowlisted sandbox processor.");
  const stored = await env.DB.prepare("SELECT object_key, status FROM files WHERE id = ?1 AND deleted_at IS NULL").bind(file.file_id).first<{ object_key: string; status: string }>();
  if (!stored || stored.status !== "ready") throw new Error("The source file is unavailable or not cleared for processing.");
  const object = await env.FILES.get(stored.object_key);
  if (!object?.body) throw new Error("The source object is missing from storage.");
  const sandboxId = `import-${job.id}-${file.id}`.toLowerCase();
  const sandbox = getSandbox(env.Sandbox, sandboxId, { enableDefaultSession: false, sleepAfter: "2m", normalizeId: true,
    labels: { workload: "project-import", importJobId: job.id } });
  const runId = crypto.randomUUID(); const startedAt = new Date().toISOString(); const started = Date.now();
  await env.DB.prepare(`INSERT INTO sandbox_processing_runs
    (id, import_job_id, import_job_file_id, sandbox_id, parser_image_version, command_key, status, created_at)
    VALUES (?1, ?2, ?3, ?4, '@cloudflare/sandbox:0.12.4', ?5, 'starting', ?6)`)
    .bind(runId, job.id, file.id, sandboxId, `static-${file.format_key}`, startedAt).run();
  try {
    await sandbox.writeFile("/workspace/input.bin", object.body);
    await env.DB.prepare("UPDATE sandbox_processing_runs SET status = 'running' WHERE id = ?1").bind(runId).run();
    const result = await sandbox.exec(`python3 /opt/robopartpicker/import_processor.py --format ${file.format_key} --input /workspace/input.bin --output /workspace/result.json`, { timeout: 60_000 });
    const completed = new Date().toISOString();
    await env.DB.prepare(`UPDATE sandbox_processing_runs SET status = ?1, exit_code = ?2, sanitized_stdout = ?3,
      sanitized_stderr = ?4, latency_ms = ?5, completed_at = ?6 WHERE id = ?7`)
      .bind(result.success ? "succeeded" : "failed", result.exitCode, sanitizeOutput(result.stdout), sanitizeOutput(result.stderr), Date.now() - started, completed, runId).run();
    if (!result.success) throw new Error(`The ${file.format_key} processor exited with code ${result.exitCode}.`);
    const output = await sandbox.readFile("/workspace/result.json");
    const parsed = JSON.parse(output.content) as Record<string, unknown>;
    return { ...parsed, provenance: sourceProvenance(file), warnings: stringArray(parsed.warnings), missingDependencies: stringArray(parsed.missingDependencies) };
  } finally {
    await Promise.race([sandbox.destroy(), new Promise<void>((resolve) => setTimeout(resolve, 5_000))]);
  }
}

async function persistAnalysis(db: D1Database, job: ImportJobRow, files: ImportFileRow[], analysis: ProjectImportAnalysis): Promise<void> {
  const now = new Date().toISOString(); const recordId = crypto.randomUUID();
  const fingerprint = await sha256(`${job.id}\n${analysis.manifestYaml}`);
  await db.batch([
    db.prepare(`INSERT INTO import_records
      (id, import_job_id, source_id, external_record_id, record_type, confidence, raw_payload_json, parsed_data_json,
       normalized_fingerprint, status, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?2, 'project', 1, ?4, ?5, ?6, 'review', ?7, ?7)
      ON CONFLICT(source_id, record_type, external_record_id, import_job_id) DO UPDATE SET parsed_data_json = excluded.parsed_data_json,
        normalized_fingerprint = excluded.normalized_fingerprint, updated_at = excluded.updated_at`)
      .bind(recordId, job.id, job.source_id, JSON.stringify({ files: files.map(sourceProvenance), analyzedAt: analysis.analyzedAt }), JSON.stringify(analysis), fingerprint, now),
    eventStatement(db, job.id, null, "analysis.persisted", 95, "Deterministic project analysis was persisted for review.", { fingerprint }, now),
  ]);
  if (analysis.extracted.model && ROBOT_FORMATS.has(analysis.extracted.model.format)) await persistRobotSnapshot(db, job, files, analysis, now);
}

async function persistRobotSnapshot(db: D1Database, job: ImportJobRow, files: ImportFileRow[], analysis: ProjectImportAnalysis, now: string): Promise<void> {
  const model = analysis.extracted.model!;
  const source = files.find((file) => file.source_path === model.sourcePath);
  const context = safeJson(job.source_context_json);
  const projectId = typeof context.projectId === "string" ? context.projectId : null;
  const project = projectId ? await db.prepare("SELECT id, current_version_id FROM projects WHERE id = ?1 AND deleted_at IS NULL").bind(projectId).first<{ id: string; current_version_id: string | null }>() : null;
  const snapshotId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [db.prepare(`INSERT INTO robot_structure_snapshots
    (id, project_id, project_version_id, import_job_id, source_file_id, source_path, format_key, checksum_sha256, summary_json, warnings_json, created_by_user_id, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8, ?9, ?10, ?11)`)
    .bind(snapshotId, project?.id ?? null, project?.current_version_id ?? null, job.id, source?.file_id ?? null, model.sourcePath, model.format,
      JSON.stringify({ robotName: model.robotName, linkCount: model.linkCount, jointCount: model.jointCount, transmissions: model.transmissions, sensors: model.sensors, plugins: model.plugins }),
      JSON.stringify(model.missingAssets.map((asset) => `Missing referenced asset: ${asset}`)), job.requested_by_user_id, now)];
  model.links.forEach((link, index) => statements.push(db.prepare(`INSERT INTO robot_structure_links
    (id, snapshot_id, stable_key, name, parent_link_key, material_json, inertial_json, visual_geometry_json, collision_geometry_json,
     mesh_references_json, missing_assets_json, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`)
    .bind(crypto.randomUUID(), snapshotId, link.name, link.name, link.parent ?? null, JSON.stringify({ names: link.materials }),
      JSON.stringify({ mass: link.mass, inertia: link.inertia }), JSON.stringify(link.visualGeometries), JSON.stringify(link.collisionGeometries),
      JSON.stringify(link.meshPaths), JSON.stringify(link.missingAssets), index)));
  model.joints.forEach((joint, index) => statements.push(db.prepare(`INSERT INTO robot_structure_joints
    (id, snapshot_id, stable_key, name, joint_type, parent_link_key, child_link_key, origin_json, axis_json, limits_json, dynamics_json, mimic_json, sort_order)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`)
    .bind(crypto.randomUUID(), snapshotId, joint.name, joint.name, joint.type, joint.parent ?? null, joint.child ?? null, JSON.stringify(joint.origin ?? {}),
      JSON.stringify({ xyz: joint.axis }), JSON.stringify({ lower: joint.lower, upper: joint.upper, effort: joint.effort, velocity: joint.velocity }),
      JSON.stringify(joint.dynamics ?? {}), JSON.stringify(joint.mimic ?? {}), index)));
  analysis.extracted.parts.modelCandidates.slice(0, 2_000).forEach((candidate) => statements.push(db.prepare(`INSERT INTO robot_component_candidates
    (id, snapshot_id, source_link_key, source_path, name, classification, identity_json, evidence_json, confidence, review_status, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, 'assembly', '{}', ?6, ?7, 'pending', ?8)`)
    .bind(crypto.randomUUID(), snapshotId, candidate.linkName, candidate.sourcePath, candidate.name,
      JSON.stringify([{ type: "mesh-reference", path: candidate.meshPath }, { type: "parser-constraint", note: "A robot link is not assumed to be purchasable." }]), candidate.confidence, now)));
  for (let offset = 0; offset < statements.length; offset += 80) await db.batch(statements.slice(offset, offset + 80));
}

async function processEvaluationRun(db: D1Database, runId: string): Promise<void> {
  const run = await db.prepare("SELECT id, suite_id, status FROM ai_evaluation_runs WHERE id = ?1").bind(runId).first<{ id: string; suite_id: string; status: string }>();
  if (!run || ["passed", "failed", "cancelled"].includes(run.status)) return;
  const now = new Date().toISOString();
  await db.prepare("UPDATE ai_evaluation_runs SET status = 'running' WHERE id = ?1").bind(run.id).run();
  const cases = (await db.prepare("SELECT * FROM ai_evaluation_cases WHERE suite_id = ?1 AND enabled = 1 ORDER BY case_key").bind(run.suite_id).all<Record<string, unknown>>()).results;
  if (!cases.length) throw new Error("The evaluation suite has no enabled cases.");
  const statements: D1PreparedStatement[] = [];
  for (const evaluationCase of cases) {
    const expected = safeJson(String(evaluationCase.expected_json ?? "{}"));
    const input = safeJson(String(evaluationCase.input_json ?? "{}"));
    const hasExpected = Object.keys(expected).length > 0;
    const structured = Object.keys(input).length > 0;
    const status = hasExpected && structured ? "passed" : "skipped";
    statements.push(db.prepare(`INSERT INTO ai_evaluation_results
      (id, run_id, case_id, status, accuracy, unsupported_claims, citation_validity, structured_output_valid, tool_selection_score,
       latency_ms, cost_microunits, acceptance_score, correction_rate, details_json, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, 0, ?5, ?6, ?5, 0, 0, NULL, NULL, ?7, ?8)
      ON CONFLICT(run_id, case_id) DO UPDATE SET status = excluded.status, accuracy = excluded.accuracy,
        structured_output_valid = excluded.structured_output_valid, details_json = excluded.details_json`)
      .bind(crypto.randomUUID(), run.id, evaluationCase.id, status, status === "passed" ? 1 : null, structured ? 1 : 0,
        JSON.stringify({ mode: "fixture-contract", note: "Live model scoring must be configured before this result can promote a candidate." }), now));
  }
  await db.batch(statements);
  const fixtureContractsValid = statements.length === cases.length && cases.every((item) => Object.keys(safeJson(String(item.expected_json ?? "{}"))).length > 0);
  await db.prepare(`UPDATE ai_evaluation_runs SET status = ?1, regression_detected = ?2, aggregate_metrics_json = ?3, completed_at = ?4 WHERE id = ?5`)
    .bind("failed", 1, JSON.stringify({ caseCount: cases.length, fixtureContractValidity: fixtureContractsValid ? 1 : 0,
      promotionEligible: false, reason: "Fixture validation completed, but a live candidate-model regression run is required for promotion." }), new Date().toISOString(), run.id).run();
}

async function updateFileResult(db: D1Database, file: ImportFileRow, status: string, progress: number, result: unknown, warnings: string[], missing: string[], now: string): Promise<void> {
  await db.batch([
    db.prepare(`UPDATE import_job_files SET status = ?1, progress_percent = ?2, result_json = ?3, warnings_json = ?4,
      missing_dependencies_json = ?5, updated_at = ?6, completed_at = ?6 WHERE id = ?7`)
      .bind(status, progress, JSON.stringify(result), JSON.stringify(warnings), JSON.stringify(missing), now, file.id),
    eventStatement(db, file.import_job_id, file.id, `file.${status}`, progress, `${file.source_path}: ${status}.`, { warnings, missingDependencies: missing }, now),
  ]);
}

async function cancelJob(db: D1Database, jobId: string, now: string): Promise<void> {
  await db.batch([
    db.prepare("UPDATE import_jobs SET status = 'cancelled', current_stage = 'cancelled', updated_at = ?1, completed_at = ?1 WHERE id = ?2").bind(now, jobId),
    db.prepare("UPDATE import_job_files SET status = 'cancelled', updated_at = ?1, completed_at = ?1 WHERE import_job_id = ?2 AND status IN ('queued', 'processing')").bind(now, jobId),
    eventStatement(db, jobId, null, "job.cancelled", null, "Import was cancelled.", {}, now),
  ]);
}

async function markJobAttemptFailed(db: D1Database, id: string, error: string, terminal: boolean): Promise<void> {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`UPDATE import_jobs SET status = ?1, current_stage = ?2, last_error = ?3, updated_at = ?4,
      completed_at = CASE WHEN ?5 = 1 THEN ?4 ELSE completed_at END WHERE id = ?6`)
      .bind(terminal ? "failed" : "accepted", terminal ? "failed" : "retrying", error, now, terminal ? 1 : 0, id),
    eventStatement(db, id, null, terminal ? "job.failed" : "job.retrying", null, error, {}, now),
  ]);
}

function eventStatement(db: D1Database, jobId: string, fileId: string | null, type: string, progress: number | null, message: string, detail: unknown, now: string): D1PreparedStatement {
  return db.prepare(`INSERT INTO import_job_events
    (id, import_job_id, import_job_file_id, event_type, progress_percent, message, detail_json, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`).bind(crypto.randomUUID(), jobId, fileId, type, progress, message.slice(0, 1_000), JSON.stringify(detail), now);
}

function sourceProvenance(file: ImportFileRow): Record<string, unknown> {
  return { fileId: file.file_id, sourcePath: file.source_path, mediaType: file.media_type, format: file.format_key, processor: file.processor_kind };
}
function safeJson(value: string): Record<string, unknown> { try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 500) : []; }
function sanitizeOutput(value: string): string { return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, "").slice(0, 10_000); }
function sanitizeError(error: unknown): string { return (error instanceof Error ? error.message : "Processing failed.").replace(/[\r\n]+/gu, " ").slice(0, 1_000); }
async function sha256(value: string): Promise<string> { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
