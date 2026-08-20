import {
  validateReviewedProjectArtifactWave,
  type ReviewedProjectArtifactWave,
} from "./reviewed-project-artifacts";

export function expandReviewedProjectArtifactCollection(
  collection: ReviewedProjectArtifactWave,
): { waves: ReviewedProjectArtifactWave[]; errors: string[] } {
  const errors: string[] = [];
  if (!collection?.wave) errors.push("wave is required");
  if (collection?.schema_version !== 1) errors.push("schema_version must be 1");
  if (!Array.isArray(collection?.artifacts) || collection.artifacts.length === 0) {
    errors.push("artifacts must not be empty");
    return { waves: [], errors };
  }

  const identities = new Set<string>();
  const width = Math.max(3, String(collection.artifacts.length).length);
  const waves = collection.artifacts.map((artifact, index) => {
    const identity = `${artifact.slug}\0${artifact.path.toLowerCase()}`;
    if (identities.has(identity)) errors.push(`${artifact.slug}: duplicate artifact path ${artifact.path}`);
    identities.add(identity);

    const wave: ReviewedProjectArtifactWave = {
      wave: `${collection.wave}-${String(index + 1).padStart(width, "0")}`,
      schema_version: 1,
      artifacts: [artifact],
    };
    errors.push(...validateReviewedProjectArtifactWave(wave).map((error) => `${wave.wave}: ${error}`));
    return wave;
  });

  return { waves, errors };
}
