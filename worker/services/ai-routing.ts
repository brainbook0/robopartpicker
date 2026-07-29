import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { Env } from "../env";
import { AppError } from "../http";

export const AI_TASK_TYPES = [
  "formatting",
  "extraction",
  "rewriting",
  "classification",
  "tagging",
  "search_refinement",
  "form_draft",
  "quality_review",
  "evidence_summary",
  "project_question",
  "troubleshooting",
  "cross_document_reconciliation",
  "engineering_tradeoff",
  "substitution_recommendation",
  "marketplace_pricing",
  "compatibility_claim",
  "structured_report",
  "friction_classification",
] as const;

export type AiTaskType = (typeof AI_TASK_TYPES)[number];
export type AiSensitivity = "public" | "private" | "restricted";
export type AiReasoningLevel = "minimal" | "standard" | "strong" | "expert";

export type AiTaskRequirements = {
  taskType: AiTaskType;
  reasoningLevel: AiReasoningLevel;
  structuredOutput: boolean;
  minimumStructuredReliability: number;
  contextTokens: number;
  latencyTargetMs?: number;
  costTargetMicrounits?: number;
  sensitivity: AiSensitivity;
  userPlan?: string;
};

export type RoutedModel = {
  providerId?: string;
  providerKey: string;
  adapterType: "openai_compatible" | "workers_ai" | "anthropic" | "google" | "custom";
  baseUrl: string;
  modelId?: string;
  modelKey: string;
  displayName: string;
  promptVersionId?: string;
  promptSystem?: string;
  promptTemplate?: string;
  routingRuleId?: string;
  timeoutMs: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostMicrounits: number;
  cacheTtlSeconds: number;
  inputCostMicrounitsPerMillion?: number;
  outputCostMicrounitsPerMillion?: number;
  routeReason: Record<string, unknown>;
};

export type AiRoute = {
  task: AiTaskRequirements;
  candidates: RoutedModel[];
};

export function classifyAiTask(input: { text?: string; surface?: string; structuredOutput?: boolean; highImpact?: boolean }): AiTaskType {
  const value = `${input.surface ?? ""} ${input.text ?? ""}`.toLowerCase();
  if (/troubleshoot|debug|failure|failed|not working|root cause/iu.test(value)) return "troubleshooting";
  if (/substitut|replacement|drop[- ]?in|alternative part/iu.test(value)) return "substitution_recommendation";
  if (/compatib|interface match/iu.test(value)) return "compatibility_claim";
  if (/price|pricing|market value|part[- ]?out/iu.test(value)) return "marketplace_pricing";
  if (/trade[- ]?off|compare options|engineering decision/iu.test(value)) return "engineering_tradeoff";
  if (/reconcile|conflict|inconsisten|cross[- ]document/iu.test(value)) return "cross_document_reconciliation";
  if (/citation|evidence|summari[sz]e (?:the )?(?:records|sources)/iu.test(value)) return "evidence_summary";
  if (/search|query|filter/iu.test(value)) return "search_refinement";
  if (/rewrite|improve writing|edit text/iu.test(value)) return "rewriting";
  if (/extract|parse|convert|structure/iu.test(value)) return "extraction";
  if (input.structuredOutput) return input.highImpact ? "structured_report" : "form_draft";
  return "project_question";
}

type RoutingRow = {
  rule_id: string;
  task_type: string;
  priority: number;
  required_reasoning: AiReasoningLevel;
  requires_structured_output: number;
  minimum_structured_reliability: number;
  maximum_context_tokens: number | null;
  latency_target_ms: number | null;
  cost_target_microunits: number | null;
  user_plan: string | null;
  sensitivity_policy: AiSensitivity;
  fallback_model_ids_json: string;
  prompt_version_id: string | null;
  timeout_ms: number;
  max_input_tokens: number;
  max_output_tokens: number;
  max_cost_microunits: number;
  cache_ttl_seconds: number;
  minimum_evaluation_score: number | null;
  model_id: string | null;
  model_key: string | null;
  display_name: string | null;
  reasoning_level: AiReasoningLevel | null;
  structured_output_reliability: number | null;
  context_window_tokens: number | null;
  target_latency_ms: number | null;
  input_cost: number | null;
  output_cost: number | null;
  supported_sensitivity_json: string | null;
  evaluation_score: number | null;
  provider_id: string | null;
  provider_key: string | null;
  adapter_type: RoutedModel["adapterType"] | null;
  base_url: string | null;
  supports_sensitive_data: number | null;
  health_status: string | null;
  prompt_system: string | null;
  prompt_template: string | null;
};

type ModelRow = {
  model_id: string;
  model_key: string;
  display_name: string;
  reasoning_level: AiReasoningLevel;
  structured_output_reliability: number;
  context_window_tokens: number | null;
  target_latency_ms: number | null;
  input_cost: number | null;
  output_cost: number | null;
  supported_sensitivity_json: string;
  evaluation_score: number | null;
  provider_id: string;
  provider_key: string;
  adapter_type: RoutedModel["adapterType"];
  base_url: string | null;
  supports_sensitive_data: number;
  health_status: string;
};

const reasoningRank: Record<AiReasoningLevel, number> = { minimal: 0, standard: 1, strong: 2, expert: 3 };

export function requirementsForTask(taskType: AiTaskType, input: Partial<Omit<AiTaskRequirements, "taskType">> = {}): AiTaskRequirements {
  const strong = ["troubleshooting", "cross_document_reconciliation", "engineering_tradeoff", "substitution_recommendation", "marketplace_pricing", "compatibility_claim"].includes(taskType);
  const structured = ["extraction", "classification", "tagging", "form_draft", "quality_review", "substitution_recommendation", "marketplace_pricing", "structured_report", "friction_classification"].includes(taskType);
  return {
    taskType,
    reasoningLevel: input.reasoningLevel ?? (strong ? "strong" : taskType === "project_question" || taskType === "evidence_summary" ? "standard" : "minimal"),
    structuredOutput: input.structuredOutput ?? structured,
    minimumStructuredReliability: input.minimumStructuredReliability ?? (structured ? 0.65 : 0),
    contextTokens: Math.max(0, Math.floor(input.contextTokens ?? 8_000)),
    latencyTargetMs: input.latencyTargetMs ?? (strong ? 30_000 : 12_000),
    costTargetMicrounits: input.costTargetMicrounits ?? (strong ? 250_000 : 40_000),
    sensitivity: input.sensitivity ?? "private",
    userPlan: input.userPlan,
  };
}

export async function resolveAiRoute(db: D1Database, env: Env, requirements: AiTaskRequirements): Promise<AiRoute> {
  const result = await db.prepare(`SELECT
      r.id AS rule_id, r.task_type, r.priority, r.required_reasoning, r.requires_structured_output,
      r.minimum_structured_reliability, r.maximum_context_tokens, r.latency_target_ms, r.cost_target_microunits,
      r.user_plan, r.sensitivity_policy, r.fallback_model_ids_json, r.prompt_version_id, r.timeout_ms,
      r.max_input_tokens, r.max_output_tokens, r.max_cost_microunits, r.cache_ttl_seconds,
      r.minimum_evaluation_score, m.id AS model_id, m.model_key, m.display_name, m.reasoning_level,
      m.structured_output_reliability, m.context_window_tokens, m.target_latency_ms,
      m.input_cost_microunits_per_million AS input_cost,
      m.output_cost_microunits_per_million AS output_cost,
      m.supported_sensitivity_json, m.evaluation_score, p.id AS provider_id, p.provider_key,
      p.adapter_type, p.base_url, p.supports_sensitive_data, p.health_status,
      pv.system_prompt AS prompt_system, pv.prompt_template AS prompt_template
    FROM ai_routing_rules r
    LEFT JOIN ai_model_registry m ON m.id = r.primary_model_id AND m.enabled = 1
    LEFT JOIN ai_provider_registry p ON p.id = m.provider_id AND p.enabled = 1
    LEFT JOIN ai_prompt_versions pv ON pv.id = r.prompt_version_id AND pv.status IN ('candidate', 'active')
    WHERE r.enabled = 1 AND r.task_type IN (?1, '*')
    ORDER BY CASE WHEN r.task_type = ?1 THEN 0 ELSE 1 END, r.priority, r.created_at`)
    .bind(requirements.taskType).all<RoutingRow>();

  for (const row of result.results) {
    if (!ruleMatches(row, requirements) || !row.model_id || !row.model_key || !row.provider_key || !row.adapter_type) continue;
    const primary = routedFromRule(row, requirements);
    const fallbackIds = parseStringArray(row.fallback_model_ids_json).filter((id) => id !== row.model_id);
    const fallbacks = fallbackIds.length > 0
      ? await loadFallbackModels(db, fallbackIds, row, requirements)
      : [];
    return { task: requirements, candidates: [primary, ...fallbacks] };
  }

  return { task: requirements, candidates: [configuredFallback(env, requirements)] };
}

function ruleMatches(row: RoutingRow, requirements: AiTaskRequirements): boolean {
  if (row.user_plan && row.user_plan !== requirements.userPlan) return false;
  if (reasoningRank[row.required_reasoning] > reasoningRank[requirements.reasoningLevel]) return false;
  if (row.reasoning_level && reasoningRank[row.reasoning_level] < reasoningRank[requirements.reasoningLevel]) return false;
  if (requirements.structuredOutput && !row.requires_structured_output) return false;
  if (row.maximum_context_tokens && requirements.contextTokens > row.maximum_context_tokens) return false;
  if (row.latency_target_ms && requirements.latencyTargetMs && row.latency_target_ms > requirements.latencyTargetMs) return false;
  if (row.cost_target_microunits && requirements.costTargetMicrounits && row.cost_target_microunits > requirements.costTargetMicrounits) return false;
  if (!sensitivityAllows(row.sensitivity_policy, requirements.sensitivity)) return false;
  if ((row.structured_output_reliability ?? 0) < Math.max(row.minimum_structured_reliability, requirements.minimumStructuredReliability)) return false;
  if (row.context_window_tokens && requirements.contextTokens > row.context_window_tokens) return false;
  if (row.minimum_evaluation_score !== null && (row.evaluation_score ?? 0) < row.minimum_evaluation_score) return false;
  if (row.health_status === "unavailable") return false;
  const supported = parseStringArray(row.supported_sensitivity_json ?? "[]");
  if (!supported.includes(requirements.sensitivity)) return false;
  if (requirements.sensitivity !== "public" && !row.supports_sensitive_data) return false;
  return true;
}

async function loadFallbackModels(db: D1Database, ids: string[], rule: RoutingRow, requirements: AiTaskRequirements): Promise<RoutedModel[]> {
  const rows = await db.prepare(`SELECT m.id AS model_id, m.model_key, m.display_name, m.reasoning_level,
      m.structured_output_reliability, m.context_window_tokens, m.target_latency_ms,
      m.input_cost_microunits_per_million AS input_cost,
      m.output_cost_microunits_per_million AS output_cost,
      m.supported_sensitivity_json, m.evaluation_score, p.id AS provider_id, p.provider_key,
      p.adapter_type, p.base_url, p.supports_sensitive_data, p.health_status
    FROM ai_model_registry m JOIN ai_provider_registry p ON p.id = m.provider_id
    WHERE m.enabled = 1 AND p.enabled = 1 AND m.id IN (SELECT value FROM json_each(?1))`)
    .bind(JSON.stringify(ids)).all<ModelRow>();
  const byId = new Map(rows.results.map((row) => [row.model_id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    if (!row || !modelMatches(row, requirements)) return [];
    return [{
      providerId: row.provider_id,
      providerKey: row.provider_key,
      adapterType: row.adapter_type,
      baseUrl: row.base_url ?? "",
      modelId: row.model_id,
      modelKey: row.model_key,
      displayName: row.display_name,
      promptVersionId: rule.prompt_version_id ?? undefined,
      promptSystem: rule.prompt_system ?? undefined,
      promptTemplate: rule.prompt_template ?? undefined,
      routingRuleId: rule.rule_id,
      timeoutMs: rule.timeout_ms,
      maxInputTokens: rule.max_input_tokens,
      maxOutputTokens: rule.max_output_tokens,
      maxCostMicrounits: rule.max_cost_microunits,
      cacheTtlSeconds: rule.cache_ttl_seconds,
      inputCostMicrounitsPerMillion: row.input_cost ?? undefined,
      outputCostMicrounitsPerMillion: row.output_cost ?? undefined,
      routeReason: { taskType: requirements.taskType, role: "fallback", ruleId: rule.rule_id, configurable: true },
    }];
  });
}

function modelMatches(row: ModelRow, requirements: AiTaskRequirements): boolean {
  if (reasoningRank[row.reasoning_level] < reasoningRank[requirements.reasoningLevel]) return false;
  if (requirements.structuredOutput && row.structured_output_reliability < requirements.minimumStructuredReliability) return false;
  if (row.context_window_tokens && row.context_window_tokens < requirements.contextTokens) return false;
  if (row.health_status === "unavailable") return false;
  if (requirements.sensitivity !== "public" && !row.supports_sensitive_data) return false;
  return parseStringArray(row.supported_sensitivity_json).includes(requirements.sensitivity);
}

function routedFromRule(row: RoutingRow, requirements: AiTaskRequirements): RoutedModel {
  return {
    providerId: row.provider_id ?? undefined,
    providerKey: row.provider_key!,
    adapterType: row.adapter_type!,
    baseUrl: row.base_url ?? "",
    modelId: row.model_id ?? undefined,
    modelKey: row.model_key!,
    displayName: row.display_name ?? row.model_key!,
    promptVersionId: row.prompt_version_id ?? undefined,
    promptSystem: row.prompt_system ?? undefined,
    promptTemplate: row.prompt_template ?? undefined,
    routingRuleId: row.rule_id,
    timeoutMs: row.timeout_ms,
    maxInputTokens: row.max_input_tokens,
    maxOutputTokens: row.max_output_tokens,
    maxCostMicrounits: row.max_cost_microunits,
    cacheTtlSeconds: row.cache_ttl_seconds,
    inputCostMicrounitsPerMillion: row.input_cost ?? undefined,
    outputCostMicrounitsPerMillion: row.output_cost ?? undefined,
    routeReason: {
      taskType: requirements.taskType,
      ruleId: row.rule_id,
      priority: row.priority,
      requiredReasoning: requirements.reasoningLevel,
      structuredOutput: requirements.structuredOutput,
      contextTokens: requirements.contextTokens,
      sensitivity: requirements.sensitivity,
      configurable: true,
    },
  };
}

function configuredFallback(env: Env, requirements: AiTaskRequirements): RoutedModel {
  if (!env.AI_PROVIDER_URL || !env.AI_PROVIDER_KEY || !env.AI_MODEL) {
    throw new AppError(503, "AI_PROVIDER_NOT_CONFIGURED", "Configure an enabled AI route or AI_PROVIDER_URL, AI_PROVIDER_KEY, and AI_MODEL on the Worker.");
  }
  const allowedSensitivity = new Set((env.AI_DATA_SENSITIVITY_POLICY ?? "public,private").split(",").map((value) => value.trim()).filter(Boolean));
  if (!allowedSensitivity.has(requirements.sensitivity)) {
    throw new AppError(403, "AI_DATA_POLICY_DENIED", `The configured AI provider is not approved for ${requirements.sensitivity} data.`);
  }
  return {
    providerKey: env.AI_PROVIDER_NAME ?? "configured-openai-compatible",
    adapterType: "openai_compatible",
    baseUrl: env.AI_PROVIDER_URL,
    modelKey: env.AI_MODEL,
    displayName: env.AI_MODEL,
    timeoutMs: requirements.latencyTargetMs ?? 20_000,
    maxInputTokens: Math.max(requirements.contextTokens, 8_000),
    maxOutputTokens: positiveInteger(env.AI_MAX_OUTPUT_TOKENS, 2_048, 64, 16_384),
    maxCostMicrounits: requirements.costTargetMicrounits ?? 100_000,
    cacheTtlSeconds: 0,
    routeReason: { taskType: requirements.taskType, fallback: "environment", configurable: true, sensitivity: requirements.sensitivity },
  };
}

export function createRoutedProvider(env: Env, model: RoutedModel) {
  if (model.adapterType !== "openai_compatible") {
    throw new AppError(503, "AI_PROVIDER_ADAPTER_UNAVAILABLE", `The ${model.adapterType} provider adapter is registered but not enabled in this Worker build.`);
  }
  const baseUrl = new URL(model.baseUrl || env.AI_PROVIDER_URL || "");
  if (env.APP_ENV === "production" && baseUrl.protocol !== "https:") {
    throw new AppError(503, "AI_PROVIDER_URL_UNSAFE", "Production AI providers must use HTTPS.");
  }
  const apiKey = providerKey(env, model.providerKey);
  if (!apiKey) throw new AppError(503, "AI_PROVIDER_CREDENTIAL_MISSING", `No server-side credential is configured for provider ${model.providerKey}.`);
  return createOpenAICompatible({
    name: model.providerKey,
    baseURL: baseUrl.toString().replace(/\/$/u, ""),
    apiKey,
    includeUsage: true,
    supportsStructuredOutputs: true,
    headers: { "HTTP-Referer": env.BETTER_AUTH_URL, "X-OpenRouter-Title": env.APP_NAME },
  });
}

function providerKey(env: Env, provider: string): string | undefined {
  if (env.AI_PROVIDER_KEYS_JSON) {
    try {
      const values = JSON.parse(env.AI_PROVIDER_KEYS_JSON) as Record<string, unknown>;
      const value = values[provider];
      if (typeof value === "string" && value) return value;
    } catch {
      throw new AppError(503, "AI_PROVIDER_KEYS_INVALID", "The server-side AI provider credential map is invalid JSON.");
    }
  }
  return env.AI_PROVIDER_KEY;
}

export async function startAiTaskRun(db: D1Database, input: {
  userId?: string;
  organizationId?: string;
  projectId?: string;
  buildId?: string;
  conversationId?: string;
  actionId?: string;
  route: AiRoute;
  candidate: RoutedModel;
  requestId?: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO ai_task_runs
    (id, user_id, organization_id, project_id, build_id, conversation_id, action_id, task_type,
     provider_id, model_id, provider_key, model_key, prompt_version_id, routing_rule_id,
     route_reason_json, status, request_id, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 'running', ?16, ?17)`)
    .bind(id, input.userId ?? null, input.organizationId ?? null, input.projectId ?? null, input.buildId ?? null,
      input.conversationId ?? null, input.actionId ?? null, input.route.task.taskType, input.candidate.providerId ?? null,
      input.candidate.modelId ?? null, input.candidate.providerKey, input.candidate.modelKey,
      input.candidate.promptVersionId ?? null, input.candidate.routingRuleId ?? null,
      JSON.stringify(input.candidate.routeReason), input.requestId ?? null, new Date().toISOString()).run();
  return id;
}

export async function finishAiTaskRun(db: D1Database, input: {
  id: string;
  status: "succeeded" | "failed" | "timed_out" | "cancelled" | "cached";
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  estimatedCostMicrounits?: number;
  toolCalls?: unknown[];
  errorCode?: string;
  errorMessage?: string;
}): Promise<void> {
  await db.prepare(`UPDATE ai_task_runs SET status = ?1, input_tokens = ?2, output_tokens = ?3,
      latency_ms = ?4, estimated_cost_microunits = ?5, tool_calls_json = ?6,
      error_code = ?7, error_message = ?8, completed_at = ?9 WHERE id = ?10`)
    .bind(input.status, input.inputTokens ?? 0, input.outputTokens ?? 0, input.latencyMs,
      input.estimatedCostMicrounits ?? 0, JSON.stringify(input.toolCalls ?? []), input.errorCode ?? null,
      input.errorMessage?.slice(0, 2_000) ?? null, new Date().toISOString(), input.id).run();
}

export function estimateAiCost(model: RoutedModel, inputTokens: number, outputTokens: number): number {
  if (model.inputCostMicrounitsPerMillion === undefined || model.outputCostMicrounitsPerMillion === undefined) return 0;
  return Math.round((inputTokens * model.inputCostMicrounitsPerMillion + outputTokens * model.outputCostMicrounitsPerMillion) / 1_000_000);
}

export async function aiCacheKey(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sensitivityAllows(rule: AiSensitivity, requested: AiSensitivity): boolean {
  const rank: Record<AiSensitivity, number> = { public: 0, private: 1, restricted: 2 };
  return rank[rule] >= rank[requested];
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}

function positiveInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}
