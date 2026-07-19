import type { Robot } from "@/data/robots";

// Stylized technical illustration. Renders a category-specific silhouette
// with the robot's accent color and key dims overlaid as engineering callouts.
// Acts as a consistent "photo" until real product photography is uploaded.
export const RobotSilhouette = ({ robot, height = 220, showCallouts = true }: { robot: Robot; height?: number; showCallouts?: boolean }) => {
  const accent = `hsl(${robot.accentHsl})`;
  const stroke = `hsl(${robot.accentHsl} / 0.85)`;
  const fill = `hsl(${robot.accentHsl} / 0.08)`;
  const grid = `hsl(var(--border))`;

  return (
    <div className="relative w-full overflow-hidden bg-background" style={{ height }}>
      {/* engineering grid */}
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <defs>
          <pattern id={`grid-${robot.slug}`} width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M16 0H0V16" fill="none" stroke={grid} strokeOpacity="0.35" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#grid-${robot.slug})`} />
      </svg>

      <svg viewBox="0 0 200 220" className="relative h-full w-full" preserveAspectRatio="xMidYMid meet">
        <Body robot={robot} stroke={stroke} fill={fill} />
        {showCallouts && (
          <g fontFamily="Space Mono, monospace" fontSize="6" fill="hsl(var(--muted-foreground))">
            <line x1="178" y1="20" x2="178" y2="200" stroke={stroke} strokeOpacity="0.4" strokeDasharray="2 2"/>
            <text x="182" y="22">{robot.heightCm} cm</text>
            <text x="182" y="32" fill={accent}>{robot.weightKg} kg</text>
            <text x="182" y="42">{robot.dof} DoF</text>
            <text x="6" y="14" fill={accent} fontWeight="bold">{robot.maker.toUpperCase()}</text>
            <text x="6" y="22">{robot.name}</text>
            <text x="6" y="210" textAnchor="start">{robot.engineering.actuatorType.split(",")[0]}</text>
          </g>
        )}
      </svg>

      {/* corner crosshairs (Eve-online HUD) */}
      <Crosshairs />
    </div>
  );
};

const Body = ({ robot, stroke, fill }: { robot: Robot; stroke: string; fill: string }) => {
  const sw = 1.2;
  if (robot.category === "wheeled-humanoid") {
    return (
      <g stroke={stroke} fill={fill} strokeWidth={sw}>
        <circle cx="100" cy="40" r="14"/>
        <rect x="86" y="56" width="28" height="42" rx="3"/>
        {/* arms */}
        <line x1="86" y1="62" x2="62" y2="100"/><line x1="62" y1="100" x2="58" y2="130"/>
        <line x1="114" y1="62" x2="138" y2="100"/><line x1="138" y1="100" x2="142" y2="130"/>
        {/* mobile base */}
        <path d="M70 100 L130 100 L140 170 L60 170 Z" />
        <circle cx="74" cy="178" r="10"/>
        <circle cx="126" cy="178" r="10"/>
      </g>
    );
  }
  if (robot.category === "biped") {
    return (
      <g stroke={stroke} fill={fill} strokeWidth={sw}>
        <circle cx="100" cy="34" r="10"/>
        <rect x="84" y="46" width="32" height="44" rx="3"/>
        <line x1="84" y1="52" x2="64" y2="92"/><line x1="116" y1="52" x2="136" y2="92"/>
        {/* backwards-knee biped */}
        <line x1="92" y1="90" x2="80" y2="130"/><line x1="80" y1="130" x2="92" y2="170"/><line x1="92" y1="170" x2="86" y2="200"/>
        <line x1="108" y1="90" x2="120" y2="130"/><line x1="120" y1="130" x2="108" y2="170"/><line x1="108" y1="170" x2="114" y2="200"/>
      </g>
    );
  }
  // humanoid (default)
  return (
    <g stroke={stroke} fill={fill} strokeWidth={sw}>
      <circle cx="100" cy="32" r="12"/>
      {/* torso */}
      <path d="M82 46 L118 46 L122 96 L78 96 Z"/>
      {/* arms */}
      <line x1="82" y1="50" x2="60" y2="92"/><line x1="60" y1="92" x2="56" y2="130"/>
      <line x1="118" y1="50" x2="140" y2="92"/><line x1="140" y1="92" x2="144" y2="130"/>
      {/* hips */}
      <rect x="82" y="96" width="36" height="14" rx="2"/>
      {/* legs */}
      <line x1="90" y1="110" x2="84" y2="160"/><line x1="84" y1="160" x2="86" y2="200"/>
      <line x1="110" y1="110" x2="116" y2="160"/><line x1="116" y1="160" x2="114" y2="200"/>
      {/* joint dots */}
      <g fill={stroke}>
        <circle r="1.6" cx="82" cy="50"/><circle r="1.6" cx="118" cy="50"/>
        <circle r="1.6" cx="60" cy="92"/><circle r="1.6" cx="140" cy="92"/>
        <circle r="1.6" cx="90" cy="110"/><circle r="1.6" cx="110" cy="110"/>
        <circle r="1.6" cx="84" cy="160"/><circle r="1.6" cx="116" cy="160"/>
      </g>
    </g>
  );
};

const Crosshairs = () => (
  <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
    <g stroke="hsl(var(--muted-foreground))" strokeOpacity="0.5" strokeWidth="0.6">
      <path d="M0 6 H10 M6 0 V10" />
      <path d="M100% 6 h-10 M-6 0 v10" transform="translate(-6,0)"/>
    </g>
  </svg>
);