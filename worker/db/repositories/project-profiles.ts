import { projectPriceFreshness, type ProjectPriceEstimate, type ProjectSpec, type ProjectTrendSnapshot } from "../../../src/shared/projectProfiles";

export type ProjectProfileDto = {
  project_id: string;
  specs: ProjectSpec[];
  active_price_estimate: (ProjectPriceEstimate & { freshness: "current" | "refresh_required" }) | null;
  active_trend_snapshot: ProjectTrendSnapshot | null;
};

type SpecRow = Omit<ProjectSpec, "is_current"> & { is_current: number };
type TrendRow = Omit<ProjectTrendSnapshot, "traffic_sample_sufficient" | "active"> & { traffic_sample_sufficient: number; active: number };

export class ProjectProfilesRepository {
  constructor(private readonly db: D1Database) {}

  async get(projectId: string, asOf = new Date()): Promise<ProjectProfileDto> {
    const [specResult, priceResult, trendResult] = await this.db.batch([
      this.db.prepare(`SELECT id, project_id, spec_key, label, value_text, value_number, unit, confidence, observed_at,
        evidence_id, is_current, sort_order, created_at, updated_at
        FROM project_specs WHERE project_id = ?1 AND is_current = 1 ORDER BY sort_order, label, id`).bind(projectId),
      this.db.prepare(`SELECT id, project_id, estimate_type, currency, min_minor, max_minor, representative_minor, confidence,
        method_version, summary, valued_at, expires_at, status, created_at, updated_at
        FROM project_price_estimates WHERE project_id = ?1 AND status = 'active' ORDER BY valued_at DESC LIMIT 1`).bind(projectId),
      this.db.prepare(`SELECT id, project_id, methodology_version, window_start, window_end, search_score, news_score, video_score,
        official_score, first_party_traffic_score, traffic_sample_sufficient, composite_score, rank, active, captured_at, created_at
        FROM project_trend_snapshots WHERE project_id = ?1 AND active = 1 ORDER BY captured_at DESC LIMIT 1`).bind(projectId),
    ]);

    const specs = (specResult.results as unknown as SpecRow[]).map((row) => ({ ...row, is_current: row.is_current === 1 }));
    const price = priceResult.results[0] as unknown as ProjectPriceEstimate | undefined;
    const trend = trendResult.results[0] as unknown as TrendRow | undefined;
    return {
      project_id: projectId,
      specs,
      active_price_estimate: price ? { ...price, freshness: projectPriceFreshness(price, asOf).freshness } : null,
      active_trend_snapshot: trend ? { ...trend, traffic_sample_sufficient: trend.traffic_sample_sufficient === 1, active: trend.active === 1 } : null,
    };
  }
}
