import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PageMeta } from "./PageMeta";

const originalHead = document.head.innerHTML;

describe("PageMeta", () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <title>Default title</title>
      <meta name="description" content="Default description" />
      <meta property="og:title" content="Default title" />
      <meta property="og:description" content="Default description" />
      <meta name="twitter:title" content="Default title" />
      <meta name="twitter:description" content="Default description" />
      <link rel="canonical" href="https://example.com/" />
    `;
    window.history.replaceState({}, "", "/about");
  });

  afterEach(() => {
    document.head.innerHTML = originalHead;
    window.history.replaceState({}, "", "/");
  });

  it("sets route metadata and restores the previous document values on unmount", async () => {
    const view = render(<PageMeta title="About RoboPartPicker" description="About description" path="/about" />);

    await waitFor(() => expect(document.title).toBe("About RoboPartPicker"));
    expect(document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content).toBe("About description");
    expect(document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content).toBe("About RoboPartPicker");
    expect(document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]')?.content).toBe("About description");
    expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe("http://localhost:3000/about");

    view.unmount();

    expect(document.title).toBe("Default title");
    expect(document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content).toBe("Default description");
    expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe("https://example.com/");
  });
});
