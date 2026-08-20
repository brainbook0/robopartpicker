import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Grid, OrbitControls } from "@react-three/drei";
import { Box3, Group, Vector3 } from "three";
import { Box, ExternalLink, Rotate3D } from "lucide-react";
import occtWasmUrl from "occt-import-js/dist/occt-import-js.wasm?url";
import { buildOcctMeshGroup, disposeThreeObject } from "@/lib/occtMesh";

type CadFile = { contentUrl: string; name: string };
type Props = { files: CadFile[]; sourceUrl?: string; title?: string };

let importerPromise: ReturnType<typeof loadImporter> | null = null;

export default function StepModelViewer({ files, sourceUrl, title = "Interactive STEP/IGES model" }: Props) {
  const { group, error, warning, progress } = useCadAssembly(files);
  return (
    <section className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div>
          <div className="flex items-center gap-1.5 text-[12px] font-semibold"><Box className="h-3.5 w-3.5 text-primary" /> {title}</div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Rendered locally from the native OpenCascade geometry; drag to orbit, scroll to zoom.</p>
        </div>
        {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">Official model source <ExternalLink className="h-3 w-3" /></a>}
      </div>
      <div className="relative h-[420px] bg-gradient-to-b from-muted/15 to-muted/50" data-testid="step-model-viewer">
        {!group && !error && <div className="absolute inset-0 z-10 grid place-items-center text-center text-[11px] text-muted-foreground"><div><Rotate3D className="mx-auto mb-2 h-6 w-6 animate-pulse text-primary" />Converting native CAD geometry…<div className="mt-1 font-mono">{progress.loaded}/{progress.total} files</div></div></div>}
        {error && !group ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-[11px] text-muted-foreground"><div><Box className="mx-auto mb-2 h-6 w-6 opacity-60" /><p>3D preview unavailable.</p><p className="mt-1 max-w-md">{error}</p><div className="mt-3 flex flex-wrap justify-center gap-2">{files.map((file) => <a key={file.contentUrl} href={file.contentUrl} className="btn-ghost btn-sm">Open {file.name}</a>)}</div></div></div>
        ) : (
          <Canvas camera={{ position: [1.8, 1.4, 2.2], fov: 42 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
            <color attach="background" args={["#f5f4ef"]} />
            <ambientLight intensity={1.35} />
            <directionalLight position={[4, 6, 5]} intensity={2.1} castShadow />
            <directionalLight position={[-3, 2, -2]} intensity={0.7} />
            {group && <Bounds fit clip observe margin={1.2}><primitive object={group} /></Bounds>}
            <Grid position={[0, -0.01, 0]} args={[10, 10]} cellSize={0.1} cellThickness={0.35} cellColor="#9b9585" sectionSize={0.5} sectionThickness={0.7} sectionColor="#d6a900" fadeDistance={8} infiniteGrid />
            <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={0.1} maxDistance={20} />
          </Canvas>
        )}
      </div>
      {warning && group && <div className="border-t border-warning/30 bg-warning/5 px-3 py-1.5 text-[10px] text-muted-foreground">{warning}</div>}
      <div className="border-t border-border px-3 py-2 text-[9.5px] text-muted-foreground">Geometry conversion runs entirely in your browser using <a href="https://github.com/kovacsv/occt-import-js" target="_blank" rel="noreferrer" className="text-primary hover:underline">occt-import-js</a> (<a href="/licenses/occt-import-js-LGPL-2.1.txt" className="text-primary hover:underline">license notices</a>). Preview is visual only; authoritative dimensions remain in the source CAD files.</div>
    </section>
  );
}

function useCadAssembly(files: CadFile[]) {
  const [group, setGroup] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [progress, setProgress] = useState({ loaded: 0, total: files.length });
  const key = files.map((file) => `${file.name}:${file.contentUrl}`).join("\n");

  useEffect(() => {
    let active = true;
    let loadedGroup: Group | null = null;
    setGroup(null);
    setError(null);
    setWarning(null);
    setProgress({ loaded: 0, total: files.length });
    (async () => {
      const importer = await getImporter();
      const combined = new Group();
      let failed = 0;
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        try {
          const response = await fetch(file.contentUrl, { credentials: "same-origin" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const bytes = new Uint8Array(await response.arrayBuffer());
          await new Promise((resolve) => setTimeout(resolve, 0));
          const isIges = /\.(iges|igs)(?:[?#]|$)/iu.test(file.name);
          const result = isIges ? importer.ReadIgesFile(bytes, null) : importer.ReadStepFile(bytes, null);
          if (!result.success) throw new Error("conversion failed");
          const fileGroup = buildOcctMeshGroup(result.meshes);
          if (fileGroup.children.length === 0) throw new Error("no renderable meshes");
          fileGroup.name = file.name;
          combined.add(fileGroup);
        } catch {
          failed += 1;
        }
        if (active) setProgress({ loaded: index + 1, total: files.length });
      }
      if (!active) { disposeThreeObject(combined); return; }
      if (combined.children.length === 0) {
        disposeThreeObject(combined);
        setError("None of the source CAD files could be converted.");
        return;
      }
      combined.rotation.x = -Math.PI / 2;
      combined.scale.setScalar(0.001);
      const box = new Box3().setFromObject(combined);
      const center = box.getCenter(new Vector3());
      combined.position.sub(center);
      loadedGroup = combined;
      setGroup(combined);
      if (failed > 0) setWarning(`${failed} of ${files.length} source CAD files could not be converted; showing the remaining geometry.`);
    })().catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "The CAD converter could not start.");
    });
    return () => {
      active = false;
      if (loadedGroup) disposeThreeObject(loadedGroup);
    };
  // The stable file key intentionally controls conversion lifecycle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { group, error, warning, progress };
}

function getImporter() {
  importerPromise ??= loadImporter();
  return importerPromise;
}

async function loadImporter() {
  const { default: createOcct } = await import("occt-import-js");
  return createOcct({ locateFile: (path) => path.endsWith(".wasm") ? occtWasmUrl : path });
}
