import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Grid, OrbitControls } from "@react-three/drei";
import { LoadingManager, type Object3D } from "three";
import URDFLoader from "urdf-loader";
import { Box, ExternalLink, Rotate3D } from "lucide-react";
import { resolveManagedUrdfMeshUrl } from "@/lib/urdfMeshResolution";

type Props = {
  urdfUrl: string;
  urdfPath?: string | null;
  files?: Array<{ relativePath: string | null; contentUrl: string; originalName: string }>;
  sourceUrl?: string;
  title?: string;
  onUnavailable?: (reason: string) => void;
};

export default function UrdfModelViewer({ urdfUrl, urdfPath, files = [], sourceUrl, title = "Interactive 3D model", onUnavailable }: Props) {
  const [robot, setRobot] = useState<Object3D | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ loaded: 0, total: 1 });
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setRobot(null);
    setError(null);
    setProgress({ loaded: 0, total: 1 });
    setResolvedUrl(null);
    resolveUrdfMeshes(urdfUrl, urdfPath ?? null, files)
      .then((rewritten) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(new Blob([rewritten], { type: "application/xml" }));
        setResolvedUrl(objectUrl);
      })
      .catch((reason) => {
        // Fall back to loading the raw URDF so the skeleton still renders.
        if (active) setResolvedUrl(urdfUrl);
        if (active) setError(reason instanceof Error ? reason.message : "Mesh resolution failed; loading raw URDF.");
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [urdfUrl, urdfPath, files]);

  useEffect(() => {
    if (!resolvedUrl) return;
    let active = true;
    let parsedRobot: Object3D | null = null;
    let reportedFailure = false;
    const reportFailure = (reason: string) => {
      if (!active || reportedFailure) return;
      reportedFailure = true;
      setError(reason);
      onUnavailable?.(reason);
    };
    const manager = new LoadingManager();
    manager.onProgress = (_url, loaded, total) => { if (active) setProgress({ loaded, total: Math.max(total, 1) }); };
    manager.onError = (url) => reportFailure(`URDF asset failed to load: ${shortUrl(url)}`);
    manager.onLoad = () => {
      if (!active || !parsedRobot) return;
      parsedRobot.rotation.x = -Math.PI / 2;
      setRobot(parsedRobot);
    };
    const loader = new URDFLoader(manager);
    loader.packages = () => "";
    loader.parseCollision = false;
    loader.load(resolvedUrl, (loaded) => { parsedRobot = loaded; }, undefined, () => reportFailure("The URDF could not be parsed or loaded."));
    return () => {
      active = false;
      if (parsedRobot) disposeObject(parsedRobot);
    };
  }, [resolvedUrl, onUnavailable]);

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div>
          <div className="flex items-center gap-1.5 text-[12px] font-semibold"><Box className="h-3.5 w-3.5 text-primary" /> {title}</div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Rendered from the referenced URDF and mesh assets; drag to orbit, scroll to zoom.</p>
        </div>
        {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">Official model source <ExternalLink className="h-3 w-3" /></a>}
      </div>
      <div className="relative h-[420px] bg-gradient-to-b from-muted/15 to-muted/50" data-testid="urdf-model-viewer">
        {!robot && !error && (
          <div className="absolute inset-0 z-10 grid place-items-center text-center text-[11px] text-muted-foreground">
            <div><Rotate3D className="mx-auto mb-2 h-6 w-6 animate-pulse text-primary" />Loading model assets…<div className="mt-1 font-mono">{progress.loaded}/{progress.total}</div></div>
          </div>
        )}
        {error && !robot ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-[11px] text-muted-foreground">
            <div><Box className="mx-auto mb-2 h-6 w-6 opacity-60" /><p>3D preview unavailable.</p><p className="mt-1 max-w-md">{error}</p>{sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm mt-3 inline-flex">Open the official model</a>}</div>
          </div>
        ) : (
          <Canvas camera={{ position: [1.4, 1.1, 1.8], fov: 38 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
            <color attach="background" args={["#f5f4ef"]} />
            <ambientLight intensity={1.5} />
            <directionalLight position={[3, 5, 4]} intensity={2.4} castShadow />
            <directionalLight position={[-3, 2, -2]} intensity={0.8} />
            {robot && <Bounds fit clip observe margin={1.15}><primitive object={robot} /></Bounds>}
            <Grid position={[0, -0.01, 0]} args={[10, 10]} cellSize={0.1} cellThickness={0.35} cellColor="#9b9585" sectionSize={0.5} sectionThickness={0.7} sectionColor="#d6a900" fadeDistance={6} infiniteGrid />
            <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={0.25} maxDistance={8} />
          </Canvas>
        )}
      </div>
      <div className="border-t border-border px-3 py-2 text-[9.5px] text-muted-foreground">Preview is visual only. Dimensions, interfaces, collision geometry, and compatibility must be checked against the source artifacts.</div>
      {error && robot && <div className="border-t border-warning/30 bg-warning/5 px-3 py-1.5 text-[10px] text-muted-foreground">{error}</div>}
    </section>
  );
}

async function resolveUrdfMeshes(urdfUrl: string, urdfPath: string | null, files: Props["files"]): Promise<string> {
  const response = await fetch(urdfUrl, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`URDF fetch failed with ${response.status}`);
  const text = await response.text();

  const rewritten = text.replace(/<mesh\b[^>]*filename\s*=\s*"([^"]+)"([^>]*)>/giu, (match, filename, rest) => {
    const resolved = resolveManagedUrdfMeshUrl(filename, urdfPath, files ?? []);
    if (!resolved) return match;
    const absolute = new URL(resolved, window.location.origin).toString();
    return `<mesh filename="${absolute}"${rest}>`;
  });

  return rewritten;
}

function shortUrl(url: string): string {
  try { const parsed = new URL(url); return `${parsed.host}${parsed.pathname}`.slice(0, 160); }
  catch { return url.slice(0, 160); }
}

function disposeObject(object: Object3D) {
  object.traverse((child) => {
    const candidate = child as Object3D & { geometry?: { dispose: () => void }; material?: { dispose: () => void } | Array<{ dispose: () => void }> };
    candidate.geometry?.dispose();
    if (Array.isArray(candidate.material)) candidate.material.forEach((material) => material.dispose());
    else candidate.material?.dispose();
  });
}
