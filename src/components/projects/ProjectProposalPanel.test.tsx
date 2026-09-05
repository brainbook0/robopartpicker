import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ProjectProposalPanel } from "./ProjectProposalPanel";
import type { ProjectProposal, ProjectProposalInput } from "@/lib/api/project-proposals";

const pending: ProjectProposal = { id: "proposal-1", projectId: "project-1", proposalType: "assembly_step", title: "Torque the hip fasteners", details: "Add the documented torque verification step after alignment.", sourceUrls: ["https://manufacturer.example/guide"], status: "pending", reviewNote: null, resultingProjectVersionId: null, createdAt: "2026-08-25T00:00:00Z", updatedAt: "2026-08-25T00:00:00Z", reviewedAt: null };

describe("ProjectProposalPanel", () => {
  it("requires sign-in before accepting a proposal", () => {
    render(<MemoryRouter><ProjectProposalPanel projectId="project-1" signedIn={false} canReview={false} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Sign in to propose a change" })).toBeInTheDocument();
  });

  it("submits a source-linked structured proposal into moderation", async () => {
    const create = vi.fn(async (_projectId: string, _input: ProjectProposalInput) => pending);
    render(<MemoryRouter><ProjectProposalPanel projectId="project-1" signedIn canReview={false} create={create} loadApproved={async () => []} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Proposal type"), { target: { value: "assembly_step" } });
    fireEvent.change(screen.getByLabelText("Proposal title"), { target: { value: pending.title } });
    fireEvent.change(screen.getByLabelText("Proposed change"), { target: { value: pending.details } });
    fireEvent.change(screen.getByLabelText("Source links"), { target: { value: pending.sourceUrls[0] } });
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith("project-1", expect.objectContaining({ proposalType: "assembly_step", sourceUrls: pending.sourceUrls })));
    expect(await screen.findByText("Proposal submitted for review")).toBeInTheDocument();
    expect(screen.getByText(/not public until an owner or moderator approves it/iu)).toBeInTheDocument();
  });

  it("lets authorized reviewers approve or reject pending proposals", async () => {
    const review = vi.fn(async () => ({ ...pending, status: "approved" as const, reviewNote: "Verified against the linked manufacturer guide." }));
    render(<MemoryRouter><ProjectProposalPanel projectId="project-1" signedIn canReview loadApproved={async () => []} loadReviewQueue={async () => [pending]} review={review} /></MemoryRouter>);
    expect(await screen.findByText(pending.title)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(`Review note for ${pending.title}`), { target: { value: "Verified against the linked manufacturer guide." } });
    fireEvent.click(screen.getByRole("button", { name: `Approve ${pending.title}` }));
    await waitFor(() => expect(review).toHaveBeenCalledWith("project-1", pending.id, expect.objectContaining({ action: "approve" })));
  });
});
