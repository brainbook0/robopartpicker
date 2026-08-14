export function fileContentUrl(fileId: string): string {
  return `/api/v1/files/content?id=${encodeURIComponent(fileId)}`;
}
