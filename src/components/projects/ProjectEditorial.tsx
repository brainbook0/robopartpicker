import type { EditorialInline, EditorialSection } from "@/lib/project-editorial";

// Renders the curated, source-backed build notes for a project. The same structured data drives the
// worker's crawler prerender (worker/services/seo.ts), so a visitor and a crawler read identical
// content — a note only the crawler could see would be both a ranking risk and useless to a builder.
export function ProjectEditorial({ sections }: { sections: EditorialSection[] }) {
  if (!sections.length) return null;
  return (
    <div className="space-y-3 px-3 py-2 text-[12px] leading-5">
      {sections.map((section) => (
        <div key={section.heading}>
          <h3 className="mb-1 text-[11px] font-semibold">{section.heading}</h3>
          {section.blocks.map((block, blockIndex) =>
            block.type === "p" ? (
              <p key={blockIndex} className="mb-1 text-muted-foreground">
                <Inline segments={block.segments} />
              </p>
            ) : (
              <ul key={blockIndex} className="ml-4 list-disc space-y-0.5 text-muted-foreground">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Inline segments={item} />
                  </li>
                ))}
              </ul>
            ),
          )}
        </div>
      ))}
    </div>
  );
}

function Inline({ segments }: { segments: EditorialInline[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.href ? (
          <a
            key={index}
            href={segment.href}
            target="_blank"
            rel="noreferrer"
            className="text-link hover:underline"
          >
            {segment.text}
          </a>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
