import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { verifyJwsAccessToken } from "better-auth/oauth2";
import { z } from "zod";
import packageJson from "../package.json";
import type { Env } from "./env";
import { createAuth } from "./auth";
import { BuildsRepository } from "./db/repositories/builds";
import { assertScopedRead, assertScopedWrite } from "./middleware/authorization";
import { confirmAiProposal } from "./routes/ai";
import { recordAuditEvent } from "./services/audit";

type McpClaims = {
  sub?: string;
  sid?: string;
  scope?: string;
  [key: string]: unknown;
};

const READ_SCOPE = "rpp:read";
const WRITE_SCOPE = "rpp:write";

export function privateMcpAudience(env: Env): string {
  return `${new URL(env.BETTER_AUTH_URL).origin}/mcp/private`;
}

export function privateMcpIssuer(env: Env): string {
  return `${new URL(env.BETTER_AUTH_URL).origin}/api/auth`;
}

export async function handlePrivateMcpRequest(request: Request, env: Env): Promise<Response> {
  const issuer = privateMcpIssuer(env);
  const audience = privateMcpAudience(env);
  const token = bearerToken(request);
  if (!token) return oauthError(env, 401, "invalid_token", "A bearer access token is required.");
  let claims: McpClaims;
  try {
    const auth = createAuth(env);
    claims = await verifyJwsAccessToken(token, {
      jwksFetch: async () => auth.api.getJwks(),
      jwksCacheKey: env.DB,
      verifyOptions: { issuer, audience },
    }) as McpClaims;
  } catch {
    return oauthError(env, 401, "invalid_token", "The bearer access token is invalid or expired.");
  }
  if (!scopesOf(claims).includes(READ_SCOPE)) {
    return oauthError(env, 403, "insufficient_scope", `OAuth scope ${READ_SCOPE} is required.`, READ_SCOPE);
  }
  try {
    const userId = await assertActiveSession(env.DB, claims);
    const server = createPrivateMcpServer(env, userId, claims);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(request);
  } catch (error) {
    if (error instanceof Error && (error.message.includes("session") || error.message.includes("revoked"))) {
      return oauthError(env, 401, "invalid_token", error.message);
    }
    throw error;
  }
}

export function privateMcpResourceMetadata(env: Env): Record<string, unknown> {
  return {
    resource: privateMcpAudience(env),
    authorization_servers: [privateMcpIssuer(env)],
    scopes_supported: [READ_SCOPE, WRITE_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "RoboPartPicker private robotics workspace",
    resource_documentation: `${new URL(env.BETTER_AUTH_URL).origin}/rpps#mcp`,
  };
}

function createPrivateMcpServer(env: Env, userId: string, claims: McpClaims): McpServer {
  const server = new McpServer({ name: "RoboPartPicker Private", version: packageJson.version });

  server.registerTool("whoami", {
    title: "Inspect the authorized RoboPartPicker identity",
    description: "Return the authorized user ID and granted MCP scopes. No email or secret is exposed.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => jsonResult({ userId, scopes: scopesOf(claims) }));

  server.registerTool("list_my_projects", {
    title: "List accessible robotics projects",
    description: "List projects owned by the user or shared through an active organization membership.",
    inputSchema: { limit: z.number().int().min(1).max(100).default(25) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ limit }) => {
    const rows = await env.DB.prepare(`SELECT p.id, p.slug, p.name, p.summary, p.visibility, p.status,
      p.repository_url AS repositoryUrl, p.updated_at AS updatedAt
      FROM projects p WHERE p.deleted_at IS NULL AND (p.owner_user_id = ?1 OR EXISTS (
        SELECT 1 FROM organization_members om WHERE om.organization_id = p.organization_id
        AND om.user_id = ?1 AND om.status = 'active'))
      ORDER BY p.updated_at DESC LIMIT ?2`).bind(userId, limit).all();
    return jsonResult({ items: rows.results });
  });

  server.registerTool("get_my_project", {
    title: "Read an accessible robotics project",
    description: "Read one authorized project and its file metadata. File bytes and private object keys are not returned.",
    inputSchema: { idOrSlug: z.string().trim().min(1).max(200) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ idOrSlug }) => {
    const project = await env.DB.prepare(`SELECT p.id, p.slug, p.name, p.summary, p.description, p.visibility, p.status,
      p.license_spdx AS license, p.repository_url AS repositoryUrl, p.difficulty, p.updated_at AS updatedAt,
      CASE WHEN p.owner_user_id = ?2 OR EXISTS (SELECT 1 FROM organization_members member
        WHERE member.organization_id = p.organization_id AND member.user_id = ?2 AND member.status = 'active')
        THEN 1 ELSE 0 END AS canReadPrivateFiles
      FROM projects p WHERE (p.id = ?1 OR p.slug = ?1) AND p.deleted_at IS NULL AND
      (p.owner_user_id = ?2 OR p.visibility IN ('public', 'unlisted') OR EXISTS (
        SELECT 1 FROM organization_members om WHERE om.organization_id = p.organization_id
        AND om.user_id = ?2 AND om.status = 'active'))`).bind(idOrSlug, userId).first<Record<string, unknown>>();
    if (!project) return toolError("Authorized project not found.");
    const canReadPrivateFiles = numericFlag(project.canReadPrivateFiles);
    const files = await env.DB.prepare(`SELECT f.id, f.original_name AS name, f.media_type AS mediaType,
      f.size_bytes AS sizeBytes, f.kind, f.visibility, f.status, pf.purpose, pf.relative_path AS relativePath
      FROM project_files pf JOIN files f ON f.id = pf.file_id
      WHERE pf.project_id = ?1 AND f.deleted_at IS NULL
        AND (?2 = 1 OR (f.visibility = 'public' AND f.status = 'ready'))
      ORDER BY pf.relative_path, f.original_name`)
      .bind(project.id, canReadPrivateFiles ? 1 : 0).all();
    const { canReadPrivateFiles: _privateFiles, ...publicProject } = project;
    return jsonResult({ project: publicProject, files: files.results });
  });

  server.registerTool("list_project_releases", {
    title: "List exact RPPS releases for an accessible project",
    description: "List immutable release identifiers, hashes, conformance reports, and reproducibility evidence for one authorized project.",
    inputSchema: { projectId: z.string().uuid(), limit: z.number().int().min(1).max(100).default(25) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ projectId, limit }) => {
    const project = await authorizedProject(env.DB, userId, projectId);
    if (!project) return toolError("Authorized project not found.");
    const rows = await env.DB.prepare(`SELECT rr.id, rr.stable_release_id AS stableReleaseId,
      rr.version_label AS version, rr.schema_version AS schemaVersion, rr.package_sha256 AS packageSha256,
      rr.conformance_report_json AS reportJson, rr.status, rr.published_at AS publishedAt,
      (SELECT COUNT(*) FROM rpps_build_outcomes o WHERE o.release_id = rr.id AND o.outcome = 'succeeded' AND o.independence = 'maintainer') AS maintainerSuccesses,
      (SELECT COUNT(*) FROM rpps_build_outcomes o WHERE o.release_id = rr.id AND o.outcome = 'succeeded' AND o.independence = 'independent') AS independentSuccesses
      FROM rpps_releases rr WHERE rr.project_id = ?1 AND (rr.status = 'published' OR ?2 = 1)
      ORDER BY rr.created_at DESC LIMIT ?3`).bind(projectId, project.canReadDrafts ? 1 : 0, limit)
      .all<{ reportJson: string } & Record<string, unknown>>();
    return jsonResult({ project: { id: project.id, name: project.name }, items: rows.results.map((row) => ({
      ...row, report: safeJson(row.reportJson), reportJson: undefined,
    })) });
  });

  server.registerTool("read_release_collaboration", {
    title: "Read RPPS release outcomes and change proposals",
    description: "Read reproducibility outcomes and structured change proposals for one exact authorized release. Private build IDs and file object keys are not returned.",
    inputSchema: { releaseId: z.string().uuid() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ releaseId }) => {
    const release = await env.DB.prepare(`SELECT rr.id, rr.project_id AS projectId, rr.stable_release_id AS stableReleaseId,
      rr.version_label AS version, rr.package_sha256 AS packageSha256, rr.conformance_report_json AS reportJson, rr.status
      FROM rpps_releases rr JOIN projects p ON p.id = rr.project_id
      WHERE rr.id = ?1 AND p.deleted_at IS NULL AND
        (p.owner_user_id = ?2 OR p.visibility IN ('public', 'unlisted') OR EXISTS (
          SELECT 1 FROM organization_members om WHERE om.organization_id = p.organization_id
          AND om.user_id = ?2 AND om.status = 'active')) AND
        (rr.status = 'published' OR p.owner_user_id = ?2 OR EXISTS (
          SELECT 1 FROM organization_members om WHERE om.organization_id = p.organization_id
          AND om.user_id = ?2 AND om.status = 'active'))`)
      .bind(releaseId, userId).first<{ id: string; reportJson: string } & Record<string, unknown>>();
    if (!release) return toolError("Authorized release not found.");
    const [outcomes, proposals] = await env.DB.batch([
      env.DB.prepare(`SELECT id, outcome, independence, conditions_json AS conditionsJson, summary,
        submitted_at AS submittedAt, (SELECT COUNT(*) FROM rpps_build_outcome_evidence e WHERE e.outcome_id = o.id) AS evidenceCount
        FROM rpps_build_outcomes o WHERE release_id = ?1 ORDER BY submitted_at DESC LIMIT 200`).bind(releaseId),
      env.DB.prepare(`SELECT id, proposal_type AS type, status, payload_json AS payloadJson,
        review_note AS reviewNote, created_at AS createdAt, reviewed_at AS reviewedAt
        FROM rpps_change_proposals WHERE target_release_id = ?1 AND
          (status IN ('open', 'accepted') OR created_by_user_id = ?2) ORDER BY created_at DESC LIMIT 200`).bind(releaseId, userId),
    ]);
    return jsonResult({ release: { ...release, report: safeJson(release.reportJson), reportJson: undefined },
      outcomes: (outcomes.results as Array<Record<string, unknown>>).map((row) => ({ ...row,
        conditions: safeJson(String(row.conditionsJson)), conditionsJson: undefined })),
      proposals: (proposals.results as Array<Record<string, unknown>>).map((row) => ({ ...row,
        payload: safeJson(String(row.payloadJson)), payloadJson: undefined })) });
  });

  server.registerTool("list_my_builds", {
    title: "List accessible robot builds",
    description: "List builds owned by the user or shared through build or organization membership.",
    inputSchema: { limit: z.number().int().min(1).max(100).default(25) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ limit }) => {
    const rows = await env.DB.prepare(`SELECT b.id, b.slug, b.name, b.visibility, b.status,
      b.progress_percent AS progressPercent, b.updated_at AS updatedAt
      FROM builds b WHERE b.deleted_at IS NULL AND (b.owner_user_id = ?1 OR EXISTS (
        SELECT 1 FROM build_members bm WHERE bm.build_id = b.id AND bm.user_id = ?1) OR EXISTS (
        SELECT 1 FROM organization_members om WHERE om.organization_id = b.organization_id
        AND om.user_id = ?1 AND om.status = 'active'))
      ORDER BY b.updated_at DESC LIMIT ?2`).bind(userId, limit).all();
    return jsonResult({ items: rows.results });
  });

  server.registerTool("read_build_state", {
    title: "Read an authorized robot build",
    description: "Read the persistent build, BOM items, engineering records, steps, and evidence visible to the authorized user.",
    inputSchema: { buildId: z.string().uuid() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ buildId }) => {
    const detail = await new BuildsRepository(env.DB).detail(buildId);
    if (!detail) return toolError("Build not found.");
    await assertScopedRead(env.DB, userId, detail);
    return jsonResult(detail);
  });

  server.registerTool("propose_build_problem", {
    title: "Propose a build problem record",
    description: "Create a reviewable proposal only. The build is not changed until this proposal is explicitly confirmed.",
    inputSchema: {
      buildId: z.string().uuid(),
      title: z.string().trim().min(2).max(300),
      description: z.string().trim().min(2).max(10_000),
      severity: z.enum(["low", "medium", "high", "critical"]),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (input) => createBuildProposal(env.DB, userId, claims, "propose_build_problem", input));

  server.registerTool("propose_build_decision", {
    title: "Propose an engineering decision",
    description: "Create a reviewable proposal only. The build is not changed until this proposal is explicitly confirmed.",
    inputSchema: {
      buildId: z.string().uuid(),
      title: z.string().trim().min(2).max(300),
      context: z.string().max(10_000).optional(),
      decision: z.string().trim().min(2).max(10_000),
      consequences: z.string().max(10_000).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (input) => createBuildProposal(env.DB, userId, claims, "propose_build_decision", input));

  server.registerTool("list_my_proposals", {
    title: "List AI and MCP change proposals",
    description: "List the user's reviewable proposals and their current status.",
    inputSchema: { status: z.enum(["proposed", "running", "succeeded", "failed", "rejected"]).optional(), limit: z.number().int().min(1).max(100).default(25) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ status, limit }) => {
    const rows = await env.DB.prepare(`SELECT tc.id, tc.tool_name AS toolName, tc.input_json AS inputJson,
      tc.output_json AS outputJson, tc.status, tc.requires_confirmation AS requiresConfirmation,
      tc.created_at AS createdAt, tc.completed_at AS completedAt
      FROM ai_tool_calls tc JOIN ai_conversations ac ON ac.id = tc.conversation_id
      WHERE ac.user_id = ?1 AND (?2 IS NULL OR tc.status = ?2)
      ORDER BY tc.created_at DESC LIMIT ?3`).bind(userId, status ?? null, limit)
      .all<{ inputJson: string; outputJson: string | null } & Record<string, unknown>>();
    return jsonResult({ items: rows.results.map((row) => ({
      ...row,
      input: safeJson(row.inputJson),
      output: row.outputJson ? safeJson(row.outputJson) : null,
      inputJson: undefined,
      outputJson: undefined,
    })) });
  });

  server.registerTool("confirm_proposal", {
    title: "Confirm and apply a pending proposal",
    description: "Apply one owned pending proposal. Requires rpp:write and the literal confirm=true argument.",
    inputSchema: { proposalId: z.string().uuid(), confirm: z.literal(true) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ proposalId }) => {
    const scopeError = requireScope(claims, WRITE_SCOPE);
    if (scopeError) return scopeError;
    const output = await confirmAiProposal(env.DB, userId, proposalId);
    await recordAuditEvent(env.DB, { actorUserId: userId, action: "mcp.proposal.confirm", entityType: "ai_tool_call", entityId: proposalId, after: output });
    return jsonResult({ applied: true, output });
  });

  server.registerTool("reject_proposal", {
    title: "Reject a pending proposal",
    description: "Reject one owned pending proposal. Requires rpp:write and the literal confirm=true argument.",
    inputSchema: { proposalId: z.string().uuid(), confirm: z.literal(true) },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ proposalId }) => {
    const scopeError = requireScope(claims, WRITE_SCOPE);
    if (scopeError) return scopeError;
    const result = await env.DB.prepare(`UPDATE ai_tool_calls SET status = 'rejected', authorized_by_user_id = ?1,
      completed_at = ?2 WHERE id = ?3 AND status = 'proposed' AND conversation_id IN (
        SELECT id FROM ai_conversations WHERE user_id = ?1)`)
      .bind(userId, new Date().toISOString(), proposalId).run();
    if (result.meta.changes !== 1) return toolError("Pending owned proposal not found.");
    await recordAuditEvent(env.DB, { actorUserId: userId, action: "mcp.proposal.reject", entityType: "ai_tool_call", entityId: proposalId });
    return jsonResult({ rejected: true });
  });

  return server;
}

async function createBuildProposal(db: D1Database, userId: string, claims: McpClaims, toolName: string, input: Record<string, unknown>) {
  const scopeError = requireScope(claims, WRITE_SCOPE);
  if (scopeError) return scopeError;
  const build = await new BuildsRepository(db).find(String(input.buildId));
  if (!build) return toolError("Build not found.");
  await assertScopedWrite(db, userId, build, "build");
  const conversationId = await mcpConversation(db, userId);
  const proposalId = crypto.randomUUID();
  await db.prepare(`INSERT INTO ai_tool_calls
    (id, conversation_id, tool_name, input_json, status, requires_confirmation, created_at)
    VALUES (?1, ?2, ?3, ?4, 'proposed', 1, ?5)`)
    .bind(proposalId, conversationId, toolName, JSON.stringify(input), new Date().toISOString()).run();
  return jsonResult({ proposalId, status: "awaiting_user_confirmation", applied: false });
}

async function authorizedProject(db: D1Database, userId: string, projectId: string): Promise<{ id: string; name: string; canReadDrafts: boolean } | null> {
  const row = await db.prepare(`SELECT p.id, p.name, p.owner_user_id AS ownerUserId,
    CASE WHEN p.owner_user_id = ?2 OR EXISTS (SELECT 1 FROM organization_members om
      WHERE om.organization_id = p.organization_id AND om.user_id = ?2 AND om.status = 'active') THEN 1 ELSE 0 END AS canReadDrafts
    FROM projects p WHERE p.id = ?1 AND p.deleted_at IS NULL AND
      (p.owner_user_id = ?2 OR p.visibility IN ('public', 'unlisted') OR EXISTS (
        SELECT 1 FROM organization_members om WHERE om.organization_id = p.organization_id
        AND om.user_id = ?2 AND om.status = 'active'))`).bind(projectId, userId)
    .first<{ id: string; name: string; ownerUserId: string | null; canReadDrafts: number }>();
  return row ? { id: row.id, name: row.name, canReadDrafts: row.canReadDrafts === 1 } : null;
}

async function mcpConversation(db: D1Database, userId: string): Promise<string> {
  const existing = await db.prepare(`SELECT id FROM ai_conversations
    WHERE user_id = ?1 AND title = 'MCP proposals' AND status = 'active' ORDER BY created_at LIMIT 1`)
    .bind(userId).first<{ id: string }>();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO ai_conversations
    (id, user_id, title, status, created_at, updated_at)
    VALUES (?1, ?2, 'MCP proposals', 'active', ?3, ?3)`).bind(id, userId, now).run();
  return id;
}

async function assertActiveSession(db: D1Database, claims: McpClaims): Promise<string> {
  if (typeof claims.sub !== "string" || typeof claims.sid !== "string") throw new Error("OAuth token is not linked to an active user session.");
  const session = await db.prepare(`SELECT s.id FROM "session" s JOIN "user" u ON u.id = s.userId
    WHERE s.id = ?1 AND s.userId = ?2`).bind(claims.sid, claims.sub).first();
  if (!session) throw new Error("OAuth session has been revoked.");
  return claims.sub;
}

function scopesOf(claims: McpClaims): string[] {
  return typeof claims.scope === "string" ? claims.scope.split(/\s+/u).filter(Boolean) : [];
}

function requireScope(claims: McpClaims, scope: string) {
  return scopesOf(claims).includes(scope) ? null : authorizationToolError(`OAuth scope ${scope} is required.`, scope);
}

function numericFlag(value: unknown): boolean {
  return value === 1 || value === true;
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}

function oauthError(env: Env, status: 401 | 403, error: string, description: string, scope?: string): Response {
  const resourceMetadata = `${new URL(env.BETTER_AUTH_URL).origin}/.well-known/oauth-protected-resource/mcp/private`;
  const challenge = [`Bearer resource_metadata="${resourceMetadata}"`, `error="${error}"`, `error_description="${description.replace(/"/gu, "'")}"`];
  if (scope) challenge.push(`scope="${scope}"`);
  return new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: { "Content-Type": "application/json", "WWW-Authenticate": challenge.join(", ") },
  });
}

function safeJson(value: string): unknown {
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

function jsonResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value as Record<string, unknown> };
}

function toolError(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

function authorizationToolError(message: string, requiredScope: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
    structuredContent: { error: { code: "INSUFFICIENT_SCOPE", message, requiredScope } },
  };
}
