-- Shared cross-product foundations: contextual AI, routing/evaluation/friction,
-- asynchronous project ingestion, verification, technical records,
-- collaboration, messaging safety, analytics, and Marketplace part-out.

ALTER TABLE import_jobs ADD COLUMN progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100);
ALTER TABLE import_jobs ADD COLUMN current_stage TEXT;
ALTER TABLE import_jobs ADD COLUMN cancellation_requested INTEGER NOT NULL DEFAULT 0 CHECK (cancellation_requested IN (0, 1));
ALTER TABLE import_jobs ADD COLUMN queued_at TEXT;
ALTER TABLE import_jobs ADD COLUMN started_at TEXT;
ALTER TABLE import_jobs ADD COLUMN source_context_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(source_context_json));
ALTER TABLE import_jobs ADD COLUMN result_summary_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(result_summary_json));
ALTER TABLE import_jobs ADD COLUMN processor_kind TEXT NOT NULL DEFAULT 'worker' CHECK (processor_kind IN ('worker', 'sandbox', 'mixed'));
ALTER TABLE import_jobs ADD COLUMN parent_job_id TEXT REFERENCES import_jobs(id) ON DELETE SET NULL;

ALTER TABLE notification_preferences ADD COLUMN delivery_schedule TEXT NOT NULL DEFAULT 'individual'
  CHECK (delivery_schedule IN ('individual', 'batched', 'daily_digest', 'weekly_digest', 'off'));
ALTER TABLE notification_preferences ADD COLUMN push_enabled INTEGER NOT NULL DEFAULT 0 CHECK (push_enabled IN (0, 1));

ALTER TABLE user_preferences ADD COLUMN improvement_consent INTEGER NOT NULL DEFAULT 0 CHECK (improvement_consent IN (0, 1));
ALTER TABLE user_preferences ADD COLUMN messaging_policy TEXT NOT NULL DEFAULT 'requests'
  CHECK (messaging_policy IN ('nobody', 'requests', 'project_collaborators', 'everyone'));
ALTER TABLE user_preferences ADD COLUMN analytics_opt_out INTEGER NOT NULL DEFAULT 0 CHECK (analytics_opt_out IN (0, 1));

CREATE TABLE content_drafts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  surface TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  draft_key TEXT NOT NULL,
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT,
  UNIQUE (user_id, surface, draft_key)
);

CREATE TABLE ai_provider_registry (
  id TEXT PRIMARY KEY,
  provider_key TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  adapter_type TEXT NOT NULL CHECK (adapter_type IN ('openai_compatible', 'workers_ai', 'anthropic', 'google', 'custom')),
  base_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  supports_sensitive_data INTEGER NOT NULL DEFAULT 0 CHECK (supports_sensitive_data IN (0, 1)),
  data_policy_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data_policy_json)),
  health_status TEXT NOT NULL DEFAULT 'unknown' CHECK (health_status IN ('unknown', 'healthy', 'degraded', 'unavailable')),
  last_health_check_at TEXT,
  created_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ai_model_registry (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES ai_provider_registry(id) ON DELETE CASCADE,
  model_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  reasoning_level TEXT NOT NULL DEFAULT 'standard' CHECK (reasoning_level IN ('minimal', 'standard', 'strong', 'expert')),
  structured_output_reliability REAL NOT NULL DEFAULT 0.5 CHECK (structured_output_reliability BETWEEN 0 AND 1),
  context_window_tokens INTEGER CHECK (context_window_tokens IS NULL OR context_window_tokens > 0),
  target_latency_ms INTEGER CHECK (target_latency_ms IS NULL OR target_latency_ms > 0),
  input_cost_microunits_per_million INTEGER CHECK (input_cost_microunits_per_million IS NULL OR input_cost_microunits_per_million >= 0),
  output_cost_microunits_per_million INTEGER CHECK (output_cost_microunits_per_million IS NULL OR output_cost_microunits_per_million >= 0),
  capabilities_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(capabilities_json)),
  supported_sensitivity_json TEXT NOT NULL DEFAULT '["public"]' CHECK (json_valid(supported_sensitivity_json)),
  evaluation_score REAL CHECK (evaluation_score IS NULL OR evaluation_score BETWEEN 0 AND 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (provider_id, model_key)
);

CREATE TABLE ai_prompt_versions (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  version_label TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  prompt_template TEXT NOT NULL,
  response_schema_json TEXT CHECK (response_schema_json IS NULL OR json_valid(response_schema_json)),
  tool_policy_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(tool_policy_json)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'candidate', 'active', 'retired')),
  evaluation_run_id TEXT,
  created_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  activated_at TEXT,
  UNIQUE (task_type, version_label)
);

CREATE TABLE ai_routing_rules (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  required_reasoning TEXT NOT NULL DEFAULT 'minimal' CHECK (required_reasoning IN ('minimal', 'standard', 'strong', 'expert')),
  requires_structured_output INTEGER NOT NULL DEFAULT 0 CHECK (requires_structured_output IN (0, 1)),
  minimum_structured_reliability REAL NOT NULL DEFAULT 0 CHECK (minimum_structured_reliability BETWEEN 0 AND 1),
  maximum_context_tokens INTEGER CHECK (maximum_context_tokens IS NULL OR maximum_context_tokens > 0),
  latency_target_ms INTEGER CHECK (latency_target_ms IS NULL OR latency_target_ms > 0),
  cost_target_microunits INTEGER CHECK (cost_target_microunits IS NULL OR cost_target_microunits >= 0),
  user_plan TEXT,
  sensitivity_policy TEXT NOT NULL DEFAULT 'public' CHECK (sensitivity_policy IN ('public', 'private', 'restricted')),
  primary_model_id TEXT REFERENCES ai_model_registry(id) ON DELETE SET NULL,
  fallback_model_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(fallback_model_ids_json)),
  prompt_version_id TEXT REFERENCES ai_prompt_versions(id) ON DELETE SET NULL,
  timeout_ms INTEGER NOT NULL DEFAULT 20000 CHECK (timeout_ms BETWEEN 1000 AND 120000),
  max_input_tokens INTEGER NOT NULL DEFAULT 32000 CHECK (max_input_tokens > 0),
  max_output_tokens INTEGER NOT NULL DEFAULT 2048 CHECK (max_output_tokens BETWEEN 64 AND 16384),
  max_cost_microunits INTEGER NOT NULL DEFAULT 100000 CHECK (max_cost_microunits >= 0),
  cache_ttl_seconds INTEGER NOT NULL DEFAULT 0 CHECK (cache_ttl_seconds BETWEEN 0 AND 2592000),
  minimum_evaluation_score REAL CHECK (minimum_evaluation_score IS NULL OR minimum_evaluation_score BETWEEN 0 AND 1),
  created_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ai_task_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  build_id TEXT REFERENCES builds(id) ON DELETE SET NULL,
  conversation_id TEXT REFERENCES ai_conversations(id) ON DELETE SET NULL,
  action_id TEXT,
  task_type TEXT NOT NULL,
  provider_id TEXT REFERENCES ai_provider_registry(id) ON DELETE SET NULL,
  model_id TEXT REFERENCES ai_model_registry(id) ON DELETE SET NULL,
  provider_key TEXT NOT NULL,
  model_key TEXT NOT NULL,
  prompt_version_id TEXT REFERENCES ai_prompt_versions(id) ON DELETE SET NULL,
  routing_rule_id TEXT REFERENCES ai_routing_rules(id) ON DELETE SET NULL,
  route_reason_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(route_reason_json)),
  tool_calls_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tool_calls_json)),
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'timed_out', 'cancelled', 'cached')),
  cache_hit INTEGER NOT NULL DEFAULT 0 CHECK (cache_hit IN (0, 1)),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  estimated_cost_microunits INTEGER NOT NULL DEFAULT 0 CHECK (estimated_cost_microunits >= 0),
  request_id TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE ai_action_proposals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  build_id TEXT REFERENCES builds(id) ON DELETE SET NULL,
  conversation_id TEXT REFERENCES ai_conversations(id) ON DELETE SET NULL,
  task_run_id TEXT REFERENCES ai_task_runs(id) ON DELETE SET NULL,
  surface TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_entity_type TEXT,
  target_entity_id TEXT,
  status TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'edited', 'applied', 'rejected', 'undone', 'expired')),
  high_impact INTEGER NOT NULL DEFAULT 0 CHECK (high_impact IN (0, 1)),
  explicit_confirmation_required INTEGER NOT NULL DEFAULT 0 CHECK (explicit_confirmation_required IN (0, 1)),
  current_values_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(current_values_json)),
  proposed_values_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(proposed_values_json)),
  fields_changed_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(fields_changed_json)),
  sources_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(sources_json)),
  context_used_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(context_used_json)),
  fact_inference_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(fact_inference_json)),
  missing_information_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(missing_information_json)),
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  undo_payload_json TEXT CHECK (undo_payload_json IS NULL OR json_valid(undo_payload_json)),
  privacy_state TEXT NOT NULL DEFAULT 'private' CHECK (privacy_state IN ('public', 'private', 'restricted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  applied_at TEXT,
  rejected_at TEXT,
  undone_at TEXT,
  expires_at TEXT
);

CREATE TABLE ai_action_events (
  id TEXT PRIMARY KEY,
  action_id TEXT NOT NULL REFERENCES ai_action_proposals(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'previewed', 'edited', 'confirmed', 'applied', 'rejected', 'undone', 'failed', 'expired')),
  before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
  created_at TEXT NOT NULL
);

CREATE TABLE ai_response_cache (
  cache_key TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('public', 'user', 'organization', 'project')),
  scope_id TEXT,
  model_id TEXT REFERENCES ai_model_registry(id) ON DELETE SET NULL,
  prompt_version_id TEXT REFERENCES ai_prompt_versions(id) ON DELETE SET NULL,
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE ai_evaluation_suites (
  id TEXT PRIMARY KEY,
  suite_key TEXT NOT NULL,
  version_label TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
  created_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  UNIQUE (suite_key, version_label)
);

CREATE TABLE ai_evaluation_cases (
  id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL REFERENCES ai_evaluation_suites(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  case_key TEXT NOT NULL,
  input_json TEXT NOT NULL CHECK (json_valid(input_json)),
  expected_json TEXT CHECK (expected_json IS NULL OR json_valid(expected_json)),
  rubric_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(rubric_json)),
  sensitivity_policy TEXT NOT NULL DEFAULT 'public' CHECK (sensitivity_policy IN ('public', 'private', 'restricted')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (suite_id, case_key)
);

CREATE TABLE ai_evaluation_runs (
  id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL REFERENCES ai_evaluation_suites(id) ON DELETE CASCADE,
  candidate_prompt_version_id TEXT REFERENCES ai_prompt_versions(id) ON DELETE SET NULL,
  candidate_routing_rule_id TEXT REFERENCES ai_routing_rules(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'passed', 'failed', 'cancelled')),
  aggregate_metrics_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(aggregate_metrics_json)),
  regression_detected INTEGER NOT NULL DEFAULT 0 CHECK (regression_detected IN (0, 1)),
  created_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE ai_evaluation_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES ai_evaluation_runs(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL REFERENCES ai_evaluation_cases(id) ON DELETE CASCADE,
  task_run_id TEXT REFERENCES ai_task_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'error', 'skipped')),
  accuracy REAL CHECK (accuracy IS NULL OR accuracy BETWEEN 0 AND 1),
  unsupported_claims INTEGER NOT NULL DEFAULT 0 CHECK (unsupported_claims >= 0),
  citation_validity REAL CHECK (citation_validity IS NULL OR citation_validity BETWEEN 0 AND 1),
  structured_output_valid INTEGER CHECK (structured_output_valid IS NULL OR structured_output_valid IN (0, 1)),
  tool_selection_score REAL CHECK (tool_selection_score IS NULL OR tool_selection_score BETWEEN 0 AND 1),
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  cost_microunits INTEGER NOT NULL DEFAULT 0 CHECK (cost_microunits >= 0),
  acceptance_score REAL CHECK (acceptance_score IS NULL OR acceptance_score BETWEEN 0 AND 1),
  correction_rate REAL CHECK (correction_rate IS NULL OR correction_rate BETWEEN 0 AND 1),
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json)),
  created_at TEXT NOT NULL,
  UNIQUE (run_id, case_id)
);

CREATE TABLE ai_friction_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  feature TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  build_id TEXT REFERENCES builds(id) ON DELETE SET NULL,
  conversation_id TEXT REFERENCES ai_conversations(id) ON DELETE SET NULL,
  task_run_id TEXT REFERENCES ai_task_runs(id) ON DELETE SET NULL,
  action_id TEXT REFERENCES ai_action_proposals(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('repeated_request', 'user_correction', 'action_failed', 'tool_failed', 'scope_misunderstanding', 'false_action_claim', 'immediate_undo', 'abandoned_form', 'information_unavailable', 'unnecessary_clarification', 'wrong_answer', 'other')),
  sanitized_context_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(sanitized_context_json)),
  user_correction TEXT,
  model_key TEXT,
  prompt_version_id TEXT REFERENCES ai_prompt_versions(id) ON DELETE SET NULL,
  tool_calls_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tool_calls_json)),
  result_disposition TEXT CHECK (result_disposition IS NULL OR result_disposition IN ('accepted', 'edited', 'rejected', 'undone', 'abandoned')),
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  cost_microunits INTEGER NOT NULL DEFAULT 0 CHECK (cost_microunits >= 0),
  error_code TEXT,
  error_message TEXT,
  resolution_status TEXT NOT NULL DEFAULT 'open' CHECK (resolution_status IN ('open', 'triaged', 'assigned', 'resolved', 'wont_fix', 'deleted')),
  privacy_state TEXT NOT NULL DEFAULT 'private' CHECK (privacy_state IN ('public', 'private', 'restricted')),
  consent_state TEXT NOT NULL DEFAULT 'operational_only' CHECK (consent_state IN ('operational_only', 'improvement_opt_in', 'withdrawn')),
  assigned_to_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  deleted_at TEXT
);

CREATE TABLE ai_friction_clusters (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  feature TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'planned', 'resolved', 'wont_fix')),
  assigned_to_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE ai_friction_cluster_members (
  cluster_id TEXT NOT NULL REFERENCES ai_friction_clusters(id) ON DELETE CASCADE,
  friction_event_id TEXT NOT NULL REFERENCES ai_friction_events(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (cluster_id, friction_event_id)
);

CREATE TABLE import_job_files (
  id TEXT PRIMARY KEY,
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  source_url TEXT,
  source_path TEXT NOT NULL,
  source_revision TEXT,
  media_type TEXT,
  format_key TEXT NOT NULL,
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  checksum_sha256 TEXT,
  processor_kind TEXT NOT NULL DEFAULT 'worker' CHECK (processor_kind IN ('worker', 'sandbox', 'unsupported')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'complete', 'warning', 'unsupported', 'failed', 'cancelled')),
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  warnings_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(warnings_json)),
  missing_dependencies_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(missing_dependencies_json)),
  result_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(result_json)),
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (import_job_id, source_path)
);

CREATE TABLE import_job_events (
  id TEXT PRIMARY KEY,
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  import_job_file_id TEXT REFERENCES import_job_files(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  progress_percent INTEGER CHECK (progress_percent IS NULL OR progress_percent BETWEEN 0 AND 100),
  message TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(detail_json)),
  created_at TEXT NOT NULL
);

CREATE TABLE sandbox_processing_runs (
  id TEXT PRIMARY KEY,
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  import_job_file_id TEXT REFERENCES import_job_files(id) ON DELETE CASCADE,
  sandbox_id TEXT NOT NULL,
  parser_image_version TEXT NOT NULL,
  command_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('starting', 'running', 'succeeded', 'failed', 'timed_out', 'cancelled')),
  exit_code INTEGER,
  sanitized_stdout TEXT,
  sanitized_stderr TEXT,
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE robot_structure_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  project_version_id TEXT REFERENCES project_versions(id) ON DELETE CASCADE,
  import_job_id TEXT REFERENCES import_jobs(id) ON DELETE SET NULL,
  source_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  source_path TEXT NOT NULL,
  format_key TEXT NOT NULL CHECK (format_key IN ('urdf', 'xacro', 'sdf', 'srdf', 'mjcf', 'usd', 'usdz')),
  source_revision TEXT,
  checksum_sha256 TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(summary_json)),
  warnings_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(warnings_json)),
  created_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE robot_structure_links (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES robot_structure_snapshots(id) ON DELETE CASCADE,
  stable_key TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_link_key TEXT,
  material_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(material_json)),
  inertial_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(inertial_json)),
  visual_geometry_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(visual_geometry_json)),
  collision_geometry_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(collision_geometry_json)),
  mesh_references_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(mesh_references_json)),
  missing_assets_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(missing_assets_json)),
  annotations_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(annotations_json)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (snapshot_id, stable_key)
);

CREATE TABLE robot_structure_joints (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES robot_structure_snapshots(id) ON DELETE CASCADE,
  stable_key TEXT NOT NULL,
  name TEXT NOT NULL,
  joint_type TEXT NOT NULL,
  parent_link_key TEXT,
  child_link_key TEXT,
  origin_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(origin_json)),
  axis_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(axis_json)),
  limits_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(limits_json)),
  dynamics_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(dynamics_json)),
  mimic_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(mimic_json)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (snapshot_id, stable_key)
);

CREATE TABLE robot_component_candidates (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES robot_structure_snapshots(id) ON DELETE CASCADE,
  source_link_key TEXT,
  source_path TEXT NOT NULL,
  name TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('purchasable', 'fabricated', 'assembly', 'unresolved')),
  identity_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(identity_json)),
  evidence_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(evidence_json)),
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'confirmed', 'rejected', 'merged', 'split')),
  reviewed_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE robot_component_candidate_events (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES robot_component_candidates(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('confirmed', 'rejected', 'merged', 'split', 'annotated')),
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL
);

CREATE TABLE missing_information_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  project_version_id TEXT REFERENCES project_versions(id) ON DELETE SET NULL,
  build_id TEXT REFERENCES builds(id) ON DELETE CASCADE,
  requested_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  source_task_run_id TEXT REFERENCES ai_task_runs(id) ON DELETE SET NULL,
  friction_event_id TEXT REFERENCES ai_friction_events(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  missing_fields_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(missing_fields_json)),
  reliability_reason TEXT NOT NULL,
  suggested_sources_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(suggested_sources_json)),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'under_review', 'resolved', 'closed')),
  visibility TEXT NOT NULL DEFAULT 'project' CHECK (visibility IN ('private', 'project', 'public')),
  accepted_response_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE missing_information_responses (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES missing_information_requests(id) ON DELETE CASCADE,
  responder_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  response_text TEXT NOT NULL,
  sources_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(sources_json)),
  file_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(file_ids_json)),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected', 'superseded')),
  reviewed_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE missing_information_subscriptions (
  request_id TEXT NOT NULL REFERENCES missing_information_requests(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (request_id, user_id)
);

CREATE TABLE bom_verifications (
  id TEXT PRIMARY KEY,
  bom_id TEXT REFERENCES boms(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  submitter_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ai_extracted', 'user_confirmed', 'submitted', 'under_review', 'verified', 'disputed', 'rejected', 'superseded')),
  source_type TEXT NOT NULL CHECK (source_type IN ('upload', 'repository', 'manual', 'ai_extraction')),
  source_reference_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(source_reference_json)),
  current_version_id TEXT,
  assigned_to_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE TABLE bom_verification_versions (
  id TEXT PRIMARY KEY,
  verification_id TEXT NOT NULL REFERENCES bom_verifications(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  change_description TEXT,
  created_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  UNIQUE (verification_id, version_number)
);

CREATE TABLE bom_verification_lines (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES bom_verification_versions(id) ON DELETE CASCADE,
  line_key TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  component_id TEXT REFERENCES components(id) ON DELETE SET NULL,
  identity_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(identity_json)),
  quantity REAL CHECK (quantity IS NULL OR quantity > 0),
  status TEXT NOT NULL DEFAULT 'unresolved' CHECK (status IN ('resolved', 'unresolved', 'fabricated', 'rejected')),
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  notes TEXT,
  UNIQUE (version_id, line_key)
);

CREATE TABLE bom_verification_reviews (
  id TEXT PRIMARY KEY,
  verification_id TEXT NOT NULL REFERENCES bom_verifications(id) ON DELETE CASCADE,
  reviewer_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  decision TEXT NOT NULL CHECK (decision IN ('request_changes', 'verify', 'dispute', 'reject')),
  notes TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE record_versions (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('integration', 'substitution', 'software_configuration', 'firmware', 'technical_record')),
  entity_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  version_label TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'superseded', 'rolled_back')),
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  change_description TEXT,
  created_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  published_at TEXT,
  superseded_by_version_id TEXT REFERENCES record_versions(id) ON DELETE SET NULL,
  UNIQUE (entity_type, entity_id, version_number)
);

CREATE TABLE record_forks (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  source_version_id TEXT,
  fork_entity_id TEXT NOT NULL,
  fork_version_id TEXT,
  forked_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  attribution_text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE technical_records (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL CHECK (record_type IN ('test_result', 'calibration', 'measurement', 'integration_result', 'substitution_result', 'failure', 'resolution', 'configuration_snapshot', 'firmware_snapshot', 'assembly_checkpoint', 'supplier_outcome', 'safety_check')),
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  project_version_id TEXT REFERENCES project_versions(id) ON DELETE SET NULL,
  build_id TEXT REFERENCES builds(id) ON DELETE CASCADE,
  build_version_id TEXT REFERENCES build_versions(id) ON DELETE SET NULL,
  component_id TEXT REFERENCES components(id) ON DELETE SET NULL,
  applicable_version TEXT,
  title TEXT NOT NULL,
  method TEXT,
  conditions_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(conditions_json)),
  result_text TEXT NOT NULL,
  measurements_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(measurements_json)),
  evidence_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(evidence_json)),
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  reproduction_count INTEGER NOT NULL DEFAULT 0 CHECK (reproduction_count >= 0),
  verification_state TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_state IN ('unverified', 'self_reported', 'evidence_backed', 'maintainer_reviewed', 'disputed', 'superseded')),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'organization', 'unlisted', 'public')),
  author_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  occurred_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (project_id IS NOT NULL OR build_id IS NOT NULL OR component_id IS NOT NULL)
);

CREATE TABLE technical_record_files (
  technical_record_id TEXT NOT NULL REFERENCES technical_records(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (technical_record_id, file_id)
);

CREATE TABLE contribution_proposals (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  build_id TEXT REFERENCES builds(id) ON DELETE CASCADE,
  target_entity_type TEXT NOT NULL,
  target_entity_id TEXT,
  target_version_id TEXT,
  proposal_type TEXT NOT NULL,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  change_json TEXT NOT NULL CHECK (json_valid(change_json)),
  evidence_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(evidence_json)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'under_review', 'changes_requested', 'accepted', 'rejected', 'withdrawn', 'superseded')),
  author_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  assigned_reviewer_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  decided_at TEXT,
  CHECK (project_id IS NOT NULL OR build_id IS NOT NULL)
);

CREATE TABLE contribution_reviews (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES contribution_proposals(id) ON DELETE CASCADE,
  reviewer_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  decision TEXT NOT NULL CHECK (decision IN ('comment', 'request_changes', 'approve', 'reject')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE project_collaborators (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'maintainer', 'editor', 'reviewer', 'builder', 'viewer')),
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'declined', 'removed')),
  invited_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  invited_at TEXT NOT NULL,
  responded_at TEXT,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE reproductions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_version_id TEXT NOT NULL REFERENCES project_versions(id) ON DELETE RESTRICT,
  bom_version_id TEXT NOT NULL REFERENCES bom_versions(id) ON DELETE RESTRICT,
  build_id TEXT NOT NULL UNIQUE REFERENCES builds(id) ON DELETE CASCADE,
  builder_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'self_reported_complete', 'evidence_backed', 'maintainer_reviewed', 'failed', 'abandoned')),
  evidence_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(evidence_json)),
  photo_file_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(photo_file_ids_json)),
  build_time_minutes INTEGER CHECK (build_time_minutes IS NULL OR build_time_minutes >= 0),
  cost_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(cost_json)),
  substitutions_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(substitutions_json)),
  problems_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(problems_json)),
  tests_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tests_json)),
  measured_performance_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(measured_performance_json)),
  verification_state TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_state IN ('unverified', 'self_reported', 'evidence_backed', 'maintainer_reviewed', 'disputed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  reviewed_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  reviewed_at TEXT
);

CREATE TABLE record_comments (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  parent_comment_id TEXT REFERENCES record_comments(id) ON DELETE CASCADE,
  author_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  body_markdown TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'edited', 'deleted', 'moderated')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE mentions (
  id TEXT PRIMARY KEY,
  mentioned_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  comment_id TEXT REFERENCES record_comments(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (mentioned_user_id, entity_type, entity_id, comment_id)
);

CREATE TABLE direct_conversations (
  id TEXT PRIMARY KEY,
  context_type TEXT CHECK (context_type IS NULL OR context_type IN ('marketplace', 'project', 'build', 'general')),
  context_id TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'active', 'declined', 'blocked', 'closed')),
  requested_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE direct_conversation_members (
  conversation_id TEXT NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('requester', 'recipient', 'member', 'moderator')),
  request_status TEXT NOT NULL DEFAULT 'pending' CHECK (request_status IN ('pending', 'accepted', 'declined', 'blocked')),
  last_read_at TEXT,
  notification_enabled INTEGER NOT NULL DEFAULT 1 CHECK (notification_enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE direct_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
  sender_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  body_markdown TEXT NOT NULL,
  attachment_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'edited', 'deleted', 'quarantined', 'moderated')),
  spam_score REAL NOT NULL DEFAULT 0 CHECK (spam_score BETWEEN 0 AND 1),
  created_at TEXT NOT NULL,
  edited_at TEXT
);

CREATE TABLE user_blocks (
  blocker_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  blocked_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_user_id, blocked_user_id),
  CHECK (blocker_user_id <> blocked_user_id)
);

CREATE TABLE messaging_reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  reported_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  conversation_id TEXT REFERENCES direct_conversations(id) ON DELETE SET NULL,
  message_id TEXT REFERENCES direct_messages(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed', 'appealed')),
  assigned_to_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE saved_searches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  search_type TEXT NOT NULL,
  query_json TEXT NOT NULL CHECK (json_valid(query_json)),
  notifications_enabled INTEGER NOT NULL DEFAULT 1 CHECK (notifications_enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE project_analytics_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'save', 'fork', 'build_start', 'build_complete', 'verified_reproduction', 'bom_export', 'rpps_export', 'marketplace_referral', 'question', 'missing_information_request', 'version_adoption', 'substitution')),
  actor_user_hash TEXT,
  session_hash TEXT,
  source_category TEXT,
  geography_code TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  occurred_at TEXT NOT NULL
);

CREATE TABLE project_analytics_daily (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  event_type TEXT NOT NULL,
  total_count INTEGER NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  unique_count INTEGER NOT NULL DEFAULT 0 CHECK (unique_count >= 0),
  returning_count INTEGER NOT NULL DEFAULT 0 CHECK (returning_count >= 0),
  source_summary_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(source_summary_json)),
  geography_summary_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(geography_summary_json)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, day, event_type)
);

CREATE TABLE marketplace_part_outs (
  id TEXT PRIMARY KEY,
  seller_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  source_listing_id TEXT REFERENCES marketplace_listings(id) ON DELETE SET NULL,
  source_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  source_build_id TEXT REFERENCES builds(id) ON DELETE SET NULL,
  source_bom_version_id TEXT REFERENCES bom_versions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'inventory_review', 'priced', 'published', 'partial', 'complete', 'cancelled')),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (length(currency) = 3),
  complete_robot_estimate_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(complete_robot_estimate_json)),
  part_out_estimate_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(part_out_estimate_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE marketplace_part_out_items (
  id TEXT PRIMARY KEY,
  part_out_id TEXT NOT NULL REFERENCES marketplace_part_outs(id) ON DELETE CASCADE,
  source_bom_item_id TEXT REFERENCES bom_items(id) ON DELETE SET NULL,
  source_build_item_id TEXT REFERENCES build_items(id) ON DELETE SET NULL,
  component_id TEXT REFERENCES components(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  presence_status TEXT NOT NULL DEFAULT 'unconfirmed' CHECK (presence_status IN ('unconfirmed', 'present', 'missing', 'modified', 'damaged', 'fabricated', 'unidentifiable', 'sold', 'excluded')),
  condition_grade TEXT,
  test_evidence_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(test_evidence_json)),
  pricing_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(pricing_json)),
  draft_listing_id TEXT REFERENCES marketplace_listings(id) ON DELETE SET NULL,
  sold_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE marketplace_part_out_bundles (
  id TEXT PRIMARY KEY,
  part_out_id TEXT NOT NULL REFERENCES marketplace_part_outs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rationale TEXT,
  pricing_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(pricing_json)),
  draft_listing_id TEXT REFERENCES marketplace_listings(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE marketplace_part_out_bundle_items (
  bundle_id TEXT NOT NULL REFERENCES marketplace_part_out_bundles(id) ON DELETE CASCADE,
  part_out_item_id TEXT NOT NULL REFERENCES marketplace_part_out_items(id) ON DELETE CASCADE,
  quantity REAL NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (bundle_id, part_out_item_id)
);

CREATE TABLE marketplace_price_estimates (
  id TEXT PRIMARY KEY,
  part_out_id TEXT REFERENCES marketplace_part_outs(id) ON DELETE CASCADE,
  part_out_item_id TEXT REFERENCES marketplace_part_out_items(id) ON DELETE CASCADE,
  estimate_type TEXT NOT NULL CHECK (estimate_type IN ('complete_robot', 'part_out_total', 'bundle', 'individual')),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  low_minor INTEGER NOT NULL CHECK (low_minor >= 0),
  expected_minor INTEGER NOT NULL CHECK (expected_minor >= 0),
  high_minor INTEGER NOT NULL CHECK (high_minor >= 0),
  assumptions_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(assumptions_json)),
  comparable_records_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(comparable_records_json)),
  source_freshness_at TEXT,
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  disclaimer TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (part_out_id IS NOT NULL OR part_out_item_id IS NOT NULL),
  CHECK (low_minor <= expected_minor AND expected_minor <= high_minor)
);

CREATE TABLE operations_cases (
  id TEXT PRIMARY KEY,
  case_type TEXT NOT NULL CHECK (case_type IN ('duplicate_component', 'data_conflict', 'canonical_merge', 'project_ownership', 'community_moderation', 'marketplace_moderation', 'user_report', 'messaging_abuse', 'ai_friction', 'failed_job', 'appeal', 'bom_verification')),
  source_entity_type TEXT,
  source_entity_id TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'triaged', 'assigned', 'investigating', 'resolved', 'dismissed', 'appealed')),
  assigned_to_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  opened_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  resolution TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE operations_case_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES operations_cases(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(detail_json)),
  created_at TEXT NOT NULL
);

CREATE INDEX content_drafts_user_updated_idx ON content_drafts(user_id, updated_at DESC);
CREATE INDEX ai_models_enabled_reasoning_idx ON ai_model_registry(enabled, reasoning_level, evaluation_score DESC);
CREATE INDEX ai_routing_task_priority_idx ON ai_routing_rules(task_type, enabled, priority);
CREATE INDEX ai_task_runs_user_created_idx ON ai_task_runs(user_id, created_at DESC);
CREATE INDEX ai_task_runs_task_status_idx ON ai_task_runs(task_type, status, created_at DESC);
CREATE INDEX ai_actions_user_status_idx ON ai_action_proposals(user_id, status, created_at DESC);
CREATE INDEX ai_actions_project_created_idx ON ai_action_proposals(project_id, created_at DESC);
CREATE INDEX ai_friction_user_created_idx ON ai_friction_events(user_id, created_at DESC);
CREATE INDEX ai_friction_admin_idx ON ai_friction_events(resolution_status, category, created_at DESC);
CREATE INDEX import_jobs_status_progress_idx ON import_jobs(status, progress_percent, created_at DESC);
CREATE INDEX import_job_files_job_status_idx ON import_job_files(import_job_id, status, source_path);
CREATE INDEX import_job_events_job_created_idx ON import_job_events(import_job_id, created_at);
CREATE INDEX robot_snapshots_project_created_idx ON robot_structure_snapshots(project_id, created_at DESC);
CREATE INDEX robot_candidates_snapshot_status_idx ON robot_component_candidates(snapshot_id, review_status, confidence DESC);
CREATE INDEX missing_info_project_status_idx ON missing_information_requests(project_id, status, created_at DESC);
CREATE INDEX bom_verification_status_created_idx ON bom_verifications(status, created_at DESC);
CREATE INDEX technical_records_project_type_idx ON technical_records(project_id, record_type, created_at DESC);
CREATE INDEX technical_records_build_type_idx ON technical_records(build_id, record_type, created_at DESC);
CREATE INDEX contribution_project_status_idx ON contribution_proposals(project_id, status, updated_at DESC);
CREATE INDEX project_collaborators_project_status_idx ON project_collaborators(project_id, status, role);
CREATE INDEX reproductions_project_status_idx ON reproductions(project_id, status, created_at DESC);
CREATE INDEX record_comments_entity_created_idx ON record_comments(entity_type, entity_id, created_at);
CREATE INDEX direct_messages_conversation_created_idx ON direct_messages(conversation_id, created_at);
CREATE INDEX messaging_reports_status_created_idx ON messaging_reports(status, created_at DESC);
CREATE INDEX analytics_project_event_time_idx ON project_analytics_events(project_id, event_type, occurred_at DESC);
CREATE INDEX part_out_seller_status_idx ON marketplace_part_outs(seller_user_id, status, updated_at DESC);
CREATE INDEX operations_cases_status_priority_idx ON operations_cases(status, priority, created_at DESC);
