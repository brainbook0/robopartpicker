import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Grid, OrbitControls } from "@react-three/drei";
import { BufferGeometry, MeshStandardMaterial, Mesh, Color, LoadingManager, type Object3D } from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { Box, ExternalLink, Rotate3D } from "lucide-react";

type Props = {
  stlUrl: string;
  sourceUrl?: string;
  title?: string;
};

function StlMesh({ geometry }: { geometry: BufferGeometry }) {
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={new Color("#8aa6c0")} roughness={0.6} metalness={0.15} />
    </mesh>
  );
}

export default function StlModelViewer({ stlUrl, sourceUrl, title = "Interactive 3D model" }: Props) {
  const [model, setModel] = useState<Object3D | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ loaded: 0, total: 1 });

  useEffect(() => {
    let active = true;
    const manager = new LoadingManager();
    manager.onProgress = (_url, loaded, total) => { if (active) setProgress({ loaded, total: Math.max(total, 1) }); };
    const loader = new STLLoader(manager);
    loader.load(stlUrl, (geometry) => {
      if (!active) return;
      geometry.computeVertexNormals();
      const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: new Color("#8aa6c0"), roughness: 0.6, metalness: 0.15 }));
      mesh.name = "stl-model";
      setModel(mesh);
    }, undefined, (reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "The STL model could not be loaded.");
    });
    return () => {
      active = false;
      if (model) {
        model.traverse((child) => {
          const anyChild = child as unknown as { geometry?: { dispose?: () => void }; material?: { dispose?: () => void } };
          anyChild.geometry?.dispose?.();
          anyChild.material?.dispose?.();
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stlUrl]);

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div>
          <div className="flex items-center gap-1.5 text-[12px] font-semibold"><Box className="h-3.5 w-3.5 text-primary" /> {title}</div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Rendered from the referenced STL mesh; drag to orbit, scroll to zoom.</p>
        </div>
        {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">Official model source <ExternalLink className="h-3 w-3" /></a>}
      </div>
      <div className="relative h-[360px] bg-gradient-to-b from-muted/15 to-muted/50" data-testid="stl-model-viewer">
        {!model && !error && (
          <div className="absolute inset-0 z-10 grid place-items-center text-center text-[11px] text-muted-foreground">
            <div><Rotate3D className="mx-auto mb-2 h-6 w-6 animate-pulse text-primary" />Loading model…<div className="mt-1 font-mono">{progress.loaded}/{progress.total}</div></div>
          </div>
        )}
        {error ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-[11px] text-muted-foreground">
            <div><Box className="mx-auto mb-2 h-6 w-6 opacity-60" /><p>3D preview unavailable.</p><p className="mt-1 max-w-md">{error}</p>{sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm mt-3 inline-flex">Open the official model</a>}</div>
          </div>
        ) : (
          <Canvas camera={{ position: [0, 0, 4], fov: 45 }} shadows>
            <ambientLight intensity={0.7} />
            <directionalLight position={[6, 8, 5]} intensity={1.1} castShadow />
            <directionalLight position={[-4, 2, -3]} intensity={0.4} />
            {model && (
              <Bounds fit clip observe margin={1.2}>
                <StlMesh geometry={(model as Mesh).geometry as BufferGeometry} />
              </Bounds>
            )}
            <Grid infiniteGrid cellSize={0.5} sectionSize={2} fadeDistance={25} position={[0, -1, 0]} />
            <OrbitControls makeDefault />
          </Canvas>
        )}
      </div>
    </section>
  );
}
