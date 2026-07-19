export function isSafeInternalPath(value: string): boolean {
  if (!value || value.length > 301 || value[0] !== "/" || value[1] === "/") return false;
  if (/[\\\u0000-\u001f\u007f]/u.test(value)) return false;
  return /^\/[A-Za-z0-9/_%?=&.#-]{0,300}$/u.test(value);
}
