import { useEffect } from "react";

type PageMetaProps = {
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
};

const META_SELECTORS = [
  'meta[name="description"]',
  'meta[property="og:title"]',
  'meta[property="og:description"]',
  'meta[name="twitter:title"]',
  'meta[name="twitter:description"]',
] as const;

export function PageMeta({ title, description, path, noIndex = false }: PageMetaProps) {
  useEffect(() => {
    const canonicalUrl = new URL(path, window.location.origin).toString();
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const previousTitle = document.title;
    const previousCanonical = canonical?.href;
    const previousMeta = new Map<string, string>();
    const existingRobots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previousRobots = existingRobots?.content;
    const robots = noIndex ? existingRobots ?? document.head.appendChild(document.createElement("meta")) : null;

    for (const selector of META_SELECTORS) {
      const element = document.querySelector<HTMLMetaElement>(selector);
      if (element) previousMeta.set(selector, element.content);
    }

    document.title = title;
    canonical?.setAttribute("href", canonicalUrl);
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", description);
    document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.setAttribute("content", title);
    document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.setAttribute("content", description);
    document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.setAttribute("content", title);
    document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]')?.setAttribute("content", description);
    if (robots) {
      robots.setAttribute("name", "robots");
      robots.setAttribute("content", "noindex,nofollow,noarchive");
    }

    return () => {
      document.title = previousTitle;
      if (previousCanonical) canonical?.setAttribute("href", previousCanonical);
      for (const [selector, content] of previousMeta) {
        document.querySelector<HTMLMetaElement>(selector)?.setAttribute("content", content);
      }
      if (robots && previousRobots !== undefined) robots.setAttribute("content", previousRobots);
      else if (robots && !existingRobots) robots.remove();
    };
  }, [description, noIndex, path, title]);

  return null;
}
