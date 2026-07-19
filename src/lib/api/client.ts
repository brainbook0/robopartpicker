export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
    details?: Array<{ path?: string; code?: string; message: string }>;
  };
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: ApiErrorBody["error"] extends infer T
    ? T extends { details?: infer D }
      ? D
      : never
    : never;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error?.message ?? `Request failed with status ${status}.`);
    this.name = "ApiError";
    this.status = status;
    this.code = body.error?.code ?? "REQUEST_FAILED";
    this.requestId = body.error?.requestId;
    this.details = body.error?.details;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  retry?: boolean;
};

const RETRYABLE_STATUSES = new Set([502, 503, 504]);

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const canRetry = options.retry !== false && (method === "GET" || method === "HEAD");
  const attempts = canRetry ? 3 : 1;
  let lastNetworkError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(path, {
        ...options,
        method,
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
          ...options.headers,
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });

      if (response.ok) {
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      }

      let body: ApiErrorBody = {};
      try {
        body = (await response.json()) as ApiErrorBody;
      } catch {
        body = {};
      }

      if (attempt + 1 < attempts && RETRYABLE_STATUSES.has(response.status)) continue;
      throw new ApiError(response.status, body);
    } catch (error) {
      if (error instanceof ApiError || error instanceof DOMException) throw error;
      lastNetworkError = error;
      if (attempt + 1 >= attempts) break;
    }
  }

  throw new Error(lastNetworkError instanceof Error ? lastNetworkError.message : "Network request failed.");
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "POST", body, retry: false }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "PUT", body, retry: false }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "PATCH", body, retry: false }),
  delete: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "DELETE", retry: false }),
};
