import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BomPublicationNotice } from "./BomPublicationNotice";

const cases = [
  ["manufacturer_unavailable", "Manufacturer BOM unavailable", "has not published a model-specific BOM"],
  ["unavailable", "Source BOM unavailable", "does not publish an explicit source BOM"],
  ["not_applicable", "Hardware BOM not applicable", "software project"],
  ["classification_required", "Project classification required", "classified as a physical model or software project"],
  ["draft", "BOM validation in progress", "still being validated"],
  ["rejected", "BOM source rejected", "failed validation"],
] as const;

describe("BomPublicationNotice", () => {
  it.each(cases)("renders %s as a concrete public state", (state, heading, message) => {
    render(<BomPublicationNotice state={state} />);
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(message, "iu"))).toBeInTheDocument();
    expect(screen.queryByText(/fail closed/iu)).not.toBeInTheDocument();
  });

  it("names known omissions for a partial source BOM", () => {
    render(<BomPublicationNotice
      state="partial"
      coverageNote="The electronics BOM is explicit; mechanical fasteners are omitted upstream."
      omissions={[{ sourceObjectId: "bom.csv#row9", reason: "quantity_missing" }]}
    />);
    expect(screen.getByRole("heading", { name: "Partial source BOM" })).toBeInTheDocument();
    expect(screen.getByText(/mechanical fasteners are omitted upstream/iu)).toBeInTheDocument();
    expect(screen.getByText(/bom.csv#row9.*quantity missing/iu)).toBeInTheDocument();
  });

  it("renders verified provenance without blocking copy", () => {
    render(<BomPublicationNotice state="verified" coverageNote="Every explicit source row was accounted for." />);
    expect(screen.getByRole("heading", { name: "Verified source BOM" })).toBeInTheDocument();
    expect(screen.getByText("Every explicit source row was accounted for.")).toBeInTheDocument();
  });
});
