import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { GetQuoteForm } from "./GetQuoteForm";
import type { CustomerQuoteReceipt, CustomerQuoteRequestInput } from "@/lib/api/customer-quotes";

const receipt: CustomerQuoteReceipt = {
  id: "quote-1", status: "submitted", currency: "USD", materialsEstimateMinor: 10000,
  shippingEstimateMinor: 2500, totalEstimateMinor: 12500, shippingConfidence: "low",
  humanReviewRequired: true, createdAt: "2026-08-25T00:00:00Z", retentionExpiresAt: "2026-11-23T00:00:00Z",
};

describe("GetQuoteForm", () => {
  it("collects the contact and destination data required for human-reviewed shipping", () => {
    render(<MemoryRouter><GetQuoteForm bomId="bom-1" signedIn defaultEmail="luca@example.com" submit={vi.fn()} /></MemoryRouter>);
    for (const label of ["First name", "Last name", "Email", "Phone (optional)", "Address line 1", "Address line 2 (optional)", "City", "State / province / region", "Postal code", "Country", "Delivery notes (optional)"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Get a quote" })).toBeInTheDocument();
    expect(screen.getByText(/preliminary materials and shipping estimate/iu)).toBeInTheDocument();
    expect(screen.getByText(/duties and taxes are excluded/iu)).toBeInTheDocument();
  });

  it("requires sign-in before collecting private shipping data", () => {
    render(<MemoryRouter><GetQuoteForm projectId="project-1" signedIn={false} submit={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Sign in to get a quote" })).toHaveAttribute("href", expect.stringContaining("/auth"));
    expect(screen.queryByLabelText("Address line 1")).not.toBeInTheDocument();
  });

  it("submits consented data and shows the frozen preliminary estimate", async () => {
    const submit = vi.fn(async (_input: CustomerQuoteRequestInput) => receipt);
    render(<MemoryRouter><GetQuoteForm bomId="bom-1" signedIn defaultEmail="luca@example.com" submit={submit} /></MemoryRouter>);
    const values: Record<string, string> = {
      "First name": "Luca", "Last name": "Builder", "Address line 1": "100 Robotics Way", City: "Toronto",
      "State / province / region": "ON", "Postal code": "M5V 2T6", Country: "CA",
    };
    for (const [label, value] of Object.entries(values)) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByLabelText(/I consent to RoboPartPicker storing/iu));
    fireEvent.click(screen.getByRole("button", { name: "Get a quote" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ bomId: "bom-1", email: "luca@example.com", consent: true })));
    expect(await screen.findByText("Quote request submitted")).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("$25.00")).toBeInTheDocument();
    expect(screen.getByText("$125.00")).toBeInTheDocument();
  });
});
