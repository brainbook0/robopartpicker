import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Grid, OrbitControls } from "@react-three/drei";
import { BufferGeometry, Box3, Color, Group, LoadingManager, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { Box, ExternalLink, Rotate3D } from "lucide-react";

type Props = {
  stlUrls: string[];
  sourceUrl?: string;
  title?: string;
  onUnavailable?: (reason: string) => void;
};

function useStlAssembly(urls: string[], onUnavailable?: (reason: string) => void) {
  const [group, setGroup] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ loaded: 0, total: 1 });

  useEffect(() => {
    let active = true;
    const manager = new LoadingManager();
    manager.onProgress = (_url, loaded, total) => { if (active) setProgress({ loaded, total: Math.max(total, 1) }); };
    const loader = new STLLoader(manager);
    const geometries: BufferGeometry[] = [];
    let failed = 0;

    Promise.all(urls.map((url) => new Promise<BufferGeometry | null>((resolve) => {
      loader.load(url, (geometry) => resolve(geometry), undefined, () => { failed += 1; resolve(null); });
    }))).then((results) => {
      if (!active) return;
      const valid = results.filter((geometry): geometry is BufferGeometry => geometry != null);
      if (valid.length === 0) {
        const reason = "No STL parts could be loaded.";
        setError(reason);
        onUnavailable?.(reason);
        return;
      }
      const group = new Group();
      group.name = "stl-assembly";

      // Keep each part at its native STL coordinates so parts exported from a shared
      // CAD assembly origin line up. Then center the combined bounds on the origin.
      for (const geometry of valid) {
        geometry.computeBoundingBox();
        const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: new Color("#8aa6c0"), roughness: 0.6, metalness: 0.15 }));
        group.add(mesh);
      }
      const box = new Box3().setFromObject(group);
      const center = box.getCenter(new Vector3());
      group.position.x -= center.x;
      group.position.y -= center.y;
      group.position.z -= center.z;
      setGroup(group);
      if (failed > 0) setError(`${failed} of ${urls.length} parts failed to load; showing the rest.`);
    });

    return () => {
      active = false;
      if (group) {
        group.traverse((child) => {
          const anyChild = child as unknown as { geometry?: { dispose?: () => void }; material?: { dispose?: () => void } };
          anyChild.geometry?.dispose?.();
          anyChild.material?.dispose?.();
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls.join("\n"), onUnavailable]);

  return { group, error, progress };
}

export default function StlModelViewer({ stlUrls, sourceUrl, title = "Interactive 3D model", onUnavailable }: Props) {
  const { group, error, progress } = useStlAssembly(stlUrls, onUnavailable);

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div>
          <div className="flex items-center gap-1.5 text-[12px] font-semibold"><Box className="h-3.5 w-3.5 text-primary" /> {title}</div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">All STL parts rendered at their native coordinates; drag to orbit, scroll to zoom.</p>
        </div>
        {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">Official model source <ExternalLink className="h-3 w-3" /></a>}
      </div>
      <div className="relative h-[420px] bg-gradient-to-b from-muted/15 to-muted/50" data-testid="stl-model-viewer">
        {!group && !error && (
          <div className="absolute inset-0 z-10 grid place-items-center text-center text-[11px] text-muted-foreground">
            <div><Rotate3D className="mx-auto mb-2 h-6 w-6 animate-pulse text-primary" />Loading model parts…<div className="mt-1 font-mono">{progress.loaded}/{progress.total}</div></div>
          </div>
        )}
        {error && !group ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-[11px] text-muted-foreground">
            <div><Box className="mx-auto mb-2 h-6 w-6 opacity-60" /><p>3D preview unavailable.</p><p className="mt-1 max-w-md">{error}</p>{sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm mt-3 inline-flex">Open the official model</a>}</div>
          </div>
        ) : (
          <Canvas camera={{ position: [0, 0, 6], fov: 45 }} shadows>
            <ambientLight intensity={0.7} />
            <directionalLight position={[6, 8, 5]} intensity={1.1} castShadow />
            <directionalLight position={[-4, 2, -3]} intensity={0.4} />
            {group && (
              <Bounds fit clip observe margin={1.4}>
                <primitive object={group} />
              </Bounds>
            )}
            <Grid infiniteGrid cellSize={0.5} sectionSize={2} fadeDistance={30} position={[0, -1, 0]} />
            <OrbitControls makeDefault />
          </Canvas>
        )}
        {error && group && <div className="border-t border-border px-3 py-1 text-[10px] text-muted-foreground">{error}</div>}
      </div>
    </section>
  );
}
