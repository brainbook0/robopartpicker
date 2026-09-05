import { Fragment } from "react";

/**
 * Renders plaintext forum body with URLs turned into clickable links.
 * Wrapped in whitespace-pre-wrap by the caller. Keeps newlines intact.
 */
export function AutoLinkBody({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <div className={className}>
      {parts.map((part, i) => {
        if (/^https?:\/\//u.test(part)) {
          const href = part.replace(/[),.;!?]+$/u, "");
          return (
            <a key={i} href={href} target="_blank" rel="noopener noreferrer"
              className="break-all text-primary hover:underline">
              {href}
            </a>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </div>
  );
}