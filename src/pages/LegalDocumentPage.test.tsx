import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LegalCenter } from "./LegalCenter";
import { LegalDocumentPage } from "./LegalDocumentPage";

const renderRoute = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

describe("legal document pages", () => {
  it("renders a structured policy with dates, anchors, support contact, and related policies", () => {
    renderRoute(<LegalDocumentPage documentId="privacy" />);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
    expect(screen.getByText("Effective August 30, 2026")).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Privacy Policy sections" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Information we process" })).toHaveAttribute("href", "#information-we-process");
    expect(document.getElementById("information-we-process")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "support@robopartpicker.com" })[0]).toHaveAttribute("href", "mailto:support@robopartpicker.com");
    expect(screen.getByRole("link", { name: "Cookies and storage" })).toHaveAttribute("href", "/cookies");
  });

  it("renders the legal center with every approved policy route", () => {
    renderRoute(<LegalCenter />);
    expect(screen.getByRole("heading", { level: 1, name: "Legal center" })).toBeVisible();
    for (const [name, href] of [
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
      ["Cookies and storage", "/cookies"],
      ["Acceptable use", "/acceptable-use"],
      ["Marketplace terms", "/marketplace-terms"],
      ["AI notice", "/ai-notice"],
      ["Intellectual property", "/intellectual-property"],
      ["Accessibility", "/accessibility"],
      ["Contact", "/contact"],
    ]) expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    expect(screen.getByText(/do not replace review by a qualified lawyer/i)).toBeVisible();
  });
});
