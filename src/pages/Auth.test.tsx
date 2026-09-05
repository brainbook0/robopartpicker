import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Auth from "./Auth";

const mocks = vi.hoisted(() => ({
  healthGet: vi.fn(),
  socialSignIn: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

vi.mock("@/lib/api/health", () => ({
  healthApi: { get: mocks.healthGet },
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: { email: vi.fn(), social: mocks.socialSignIn },
    signUp: { email: vi.fn() },
    requestPasswordReset: vi.fn(),
  },
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

function renderAuth(path = "/auth") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}><Auth /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Google authentication UI", () => {
  beforeEach(() => {
    mocks.healthGet.mockReset();
    mocks.socialSignIn.mockReset();
  });

  it("shows Google sign-in only when the Worker reports it configured", async () => {
    mocks.healthGet.mockResolvedValue({ capabilities: { googleAuthentication: true } });
    renderAuth();
    expect(await screen.findByRole("button", { name: "Continue with Google" })).toBeVisible();
  });

  it("keeps Google sign-in hidden when credentials are absent", async () => {
    mocks.healthGet.mockResolvedValue({ capabilities: { googleAuthentication: false } });
    renderAuth();
    await waitFor(() => expect(mocks.healthGet).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
  });

  it("preserves a validated internal callback URL", async () => {
    mocks.healthGet.mockResolvedValue({ capabilities: { googleAuthentication: true } });
    mocks.socialSignIn.mockResolvedValue({ data: {}, error: null });
    renderAuth("/auth?redirect=%2Fbuilder%3Fbuild%3Done");
    fireEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(mocks.socialSignIn).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/builder?build=one",
    }));
  });
});
