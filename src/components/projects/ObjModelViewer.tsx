import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Grid, OrbitControls } from "@react-three/drei";
import { Box3, Color, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { Box, ExternalLink, Rotate3D } from "lucide-react";
import { disposeThreeObject } from "@/lib/occtMesh";

type ObjFile = { contentUrl: string; name: string };
type Props = { file: ObjFile; sourceUrl?: string; title?: string };

export default function ObjModelViewer({ file, sourceUrl, title = "Interactive OBJ model" }: Props) {
  const { group, error } = useObjModel(file);
  return (
    <section className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div>
          <div className="flex items-center gap-1.5 text-[12px] font-semibold"><Box className="h-3.5 w-3.5 text-primary" /> {title}</div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Rendered from the source OBJ mesh; drag to orbit, scroll to zoom.</p>
        </div>
        {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">Official model source <ExternalLink className="h-3 w-3" /></a>}
      </div>
      <div className="relative h-[420px] bg-gradient-to-b from-muted/15 to-muted/50" data-testid="obj-model-viewer">
        {!group && !error && <div className="absolute inset-0 z-10 grid place-items-center text-center text-[11px] text-muted-foreground"><div><Rotate3D className="mx-auto mb-2 h-6 w-6 animate-pulse text-primary" />Loading source mesh…</div></div>}
        {error ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-[11px] text-muted-foreground"><div><Box className="mx-auto mb-2 h-6 w-6 opacity-60" /><p>3D preview unavailable.</p><p className="mt-1 max-w-md">{error}</p><a href={file.contentUrl} className="btn-ghost btn-sm mt-3 inline-flex">Open {file.name}</a></div></div>
        ) : (
          <Canvas camera={{ position: [1.8, 1.4, 2.2], fov: 42 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
            <color attach="background" args={["#f5f4ef"]} />
            <ambientLight intensity={1.25} />
            <directionalLight position={[4, 6, 5]} intensity={2} castShadow />
            <directionalLight position={[-3, 2, -2]} intensity={0.65} />
            {group && <Bounds fit clip observe margin={1.25}><primitive object={group} /></Bounds>}
            <Grid position={[0, -0.01, 0]} args={[10, 10]} cellSize={0.1} cellThickness={0.35} cellColor="#9b9585" sectionSize={0.5} sectionThickness={0.7} sectionColor="#d6a900" fadeDistance={8} infiniteGrid />
            <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={0.1} maxDistance={50} />
          </Canvas>
        )}
      </div>
      <div className="border-t border-border px-3 py-2 text-[9.5px] text-muted-foreground">Preview is visual only. Authoritative dimensions and geometry remain in <a href={file.contentUrl} className="text-primary hover:underline">{file.name}</a>.</div>
    </section>
  );
}

function useObjModel(file: ObjFile) {
  const [group, setGroup] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let loadedGroup: Group | null = null;
    setGroup(null);
    setError(null);
    (async () => {
      const response = await fetch(file.contentUrl, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`Source mesh returned HTTP ${response.status}.`);
      const parsed = new OBJLoader().parse(await response.text());
      if (parsed.children.length === 0) throw new Error("The OBJ source contains no renderable meshes.");
      parsed.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        child.geometry.computeVertexNormals();
        const prior = Array.isArray(child.material) ? child.material : [child.material];
        prior.forEach((material) => material.dispose());
        child.material = new MeshStandardMaterial({ color: new Color("#8aa6c0"), roughness: 0.62, metalness: 0.12 });
      });
      const box = new Box3().setFromObject(parsed);
      if (box.isEmpty()) throw new Error("The OBJ source has empty geometry bounds.");
      parsed.position.sub(box.getCenter(new Vector3()));
      parsed.name = file.name;
      loadedGroup = parsed;
      if (active) setGroup(parsed);
      else disposeThreeObject(parsed);
    })().catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "The OBJ source could not be loaded.");
    });
    return () => {
      active = false;
      if (loadedGroup) disposeThreeObject(loadedGroup);
    };
  }, [file.contentUrl, file.name]);

  return { group, error };
}
