import type { CatalogPart } from "./catalog";

export type RankableSpecification = {
  key: string;
  value: unknown;
  unit: string | null;
};

export type RankableComponent = {
  id: string;
  name: string;
  category: string;
  maker: string;
  mpn: string | null | undefined;
  lifecycleStatus: string | undefined;
  compatibility: string[];
  technicalSpecifications: RankableSpecification[];
  managedImageCount: number;
  hasSource: boolean;
  isDemo: boolean;
};

export type RankedComponentAlternative<T extends RankableComponent = RankableComponent> = {
  candidate: T;
  score: number;
  reasons: string[];
  compatibilityStatus: "unverified";
};

export type ComponentAlternativeRecommendation = {
  item: CatalogPart;
  score: number;
  reasons: string[];
  compatibilityStatus: "unverified";
};

function normalized(value: unknown): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.map(normalized).sort().join("|");
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-US") : "";
}

function matchingSpecificationCount(target: RankableComponent, candidate: RankableComponent): number {
  const candidateValues = new Set(candidate.technicalSpecifications.map((spec) => (
    `${spec.key.trim().toLocaleLowerCase("en-US")}\u0000${normalized(spec.value)}\u0000${normalized(spec.unit)}`
  )));
  return target.technicalSpecifications.filter((spec) => candidateValues.has(
    `${spec.key.trim().toLocaleLowerCase("en-US")}\u0000${normalized(spec.value)}\u0000${normalized(spec.unit)}`,
  )).length;
}

function sharedCompatibilityCount(target: RankableComponent, candidate: RankableComponent): number {
  const tags = new Set(candidate.compatibility.map(normalized).filter(Boolean));
  return new Set(target.compatibility.map(normalized).filter((tag) => tag && tags.has(tag))).size;
}

export function rankComponentAlternatives<T extends RankableComponent>(
  target: RankableComponent,
  candidates: readonly T[],
  requestedLimit = 5,
): RankedComponentAlternative<T>[] {
  const limit = Math.min(20, Math.max(1, Math.trunc(requestedLimit) || 1));
  const targetMaker = normalized(target.maker);

  return candidates
    .filter((candidate) => !candidate.isDemo && candidate.id !== target.id && candidate.category === target.category)
    .map((candidate): RankedComponentAlternative<T> => {
      const sharedCompatibility = sharedCompatibilityCount(target, candidate);
      const matchingSpecifications = matchingSpecificationCount(target, candidate);
      const sameManufacturer = Boolean(targetMaker && targetMaker === normalized(candidate.maker));
      const active = candidate.lifecycleStatus === "active";
      const exactIdentity = Boolean(candidate.maker.trim() && candidate.mpn?.trim());
      const hasImage = candidate.managedImageCount > 0;
      const reasons = ["Same component category"];

      if (sharedCompatibility) reasons.push(`${sharedCompatibility} shared compatibility ${sharedCompatibility === 1 ? "tag" : "tags"}`);
      if (matchingSpecifications) reasons.push(`${matchingSpecifications} matching technical ${matchingSpecifications === 1 ? "specification" : "specifications"}`);
      if (sameManufacturer) reasons.push("Same manufacturer");
      if (active) reasons.push("Active lifecycle");
      if (hasImage) reasons.push("Source-backed product image");

      return {
        candidate,
        score: sharedCompatibility * 20
          + matchingSpecifications * 8
          + (sameManufacturer ? 3 : 0)
          + (active ? 2 : 0)
          + (exactIdentity ? 2 : 0)
          + (hasImage ? 1 : 0)
          + (candidate.hasSource ? 1 : 0),
        reasons,
        compatibilityStatus: "unverified",
      };
    })
    .sort((left, right) => right.score - left.score
      || left.candidate.name.localeCompare(right.candidate.name, "en-US")
      || left.candidate.id.localeCompare(right.candidate.id, "en-US"))
    .slice(0, limit);
}
