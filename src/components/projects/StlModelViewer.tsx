import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Grid, OrbitControls } from "@react-three/drei";
import { BufferGeometry, Box3, Color, Group, LoadingManager, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { Box, ChevronLeft, ChevronRight, ExternalLink, Rotate3D } from "lucide-react";

type Props = {
  files?: Array<{ contentUrl: string; name: string }>;
  stlUrls?: string[];
  sourceUrl?: string;
  title?: string;
  completeAssembly?: boolean;
  onUnavailable?: (reason: string) => void;
};

type LayoutMode = "parts" | "assembly";
type StlFile = { contentUrl: string; name: string };

function useStlAssembly(files: StlFile[], layout: LayoutMode, onUnavailable?: (reason: string) => void) {
  const [group, setGroup] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ loaded: 0, total: Math.max(files.length, 1) });


  useEffect(() => {
    let active = true;
    let loadedGroup: Group | null = null;
    setGroup(null);
    setError(null);
    setProgress({ loaded: 0, total: Math.max(files.length, 1) });
    const manager = new LoadingManager();
    manager.onProgress = (_url, loaded, total) => { if (active) setProgress({ loaded, total: Math.max(total, 1) }); };
    const loader = new STLLoader(manager);
    let failed = 0;

    Promise.all(files.map((file) => new Promise<{ file: StlFile; geometry: BufferGeometry | null }>((resolve) => {
      loader.load(file.contentUrl, (geometry) => resolve({ file, geometry }), undefined, () => { failed += 1; resolve({ file, geometry: null }); });
    }))).then((results) => {
      if (!active) return;
      const valid = results.filter((entry): entry is { file: StlFile; geometry: BufferGeometry } => entry.geometry != null);
      if (valid.length === 0) {
        const reason = "No STL parts could be loaded.";
        setError(reason);
        onUnavailable?.(reason);
        return;
      }
      const group = new Group();
      group.name = "stl-assembly";

      const columns = Math.ceil(Math.sqrt(valid.length));
      const rows = Math.ceil(valid.length / columns);
      for (const [index, entry] of valid.entries()) {
        const { file, geometry } = entry;
        geometry.computeBoundingBox();
        const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: new Color(index % 2 === 0 ? "#71879a" : "#d6a900"), roughness: 0.58, metalness: 0.16 }));
        mesh.name = file.name;
        if (layout === "parts") {
          geometry.center();
          const size = geometry.boundingBox?.getSize(new Vector3()) ?? new Vector3(1, 1, 1);
          const longest = Math.max(size.x, size.y, size.z, Number.EPSILON);
          mesh.scale.setScalar(1.15 / longest);
          mesh.rotation.x = -Math.PI / 2;
          const column = index % columns;
          const row = Math.floor(index / columns);
          mesh.position.set((column - (columns - 1) / 2) * 1.7, 0, (row - (rows - 1) / 2) * 1.7);
        }
        group.add(mesh);
      }
      const box = new Box3().setFromObject(group);
      const center = box.getCenter(new Vector3());
      group.position.x -= center.x;
      group.position.y -= center.y;
      group.position.z -= center.z;
      loadedGroup = group;
      setGroup(group);
      if (failed > 0) setError(`${failed} of ${files.length} parts failed to load; showing the rest.`);
    });

    return () => {
      active = false;
      if (loadedGroup) {
        loadedGroup.traverse((child) => {
          const anyChild = child as unknown as { geometry?: { dispose?: () => void }; material?: { dispose?: () => void } };
          anyChild.geometry?.dispose?.();
          anyChild.material?.dispose?.();
        });
      }
    };
  }, [files, layout, onUnavailable]);

  return { group, error, progress };
}

export default function StlModelViewer({ files, stlUrls = [], sourceUrl, title = "Interactive 3D model", completeAssembly = false, onUnavailable }: Props) {
  const modelFiles = useMemo<StlFile[]>(() => files ?? stlUrls.map((contentUrl, index) => ({ contentUrl, name: `STL part ${index + 1}` })), [files, stlUrls]);
  const modelFilesKey = useMemo(() => modelFiles.map((file) => `${file.name}:${file.contentUrl}`).join("\n"), [modelFiles]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedFile = modelFiles[Math.min(selectedIndex, Math.max(modelFiles.length - 1, 0))];
  const visibleFiles = useMemo(() => completeAssembly ? modelFiles : selectedFile ? [selectedFile] : [], [completeAssembly, modelFiles, selectedFile]);
  const layout: LayoutMode = completeAssembly ? "assembly" : "parts";
  const { group, error, progress } = useStlAssembly(visibleFiles, layout, onUnavailable);

  useEffect(() => { setSelectedIndex(0); }, [modelFilesKey]);

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold"><Box className="h-3.5 w-3.5 text-primary" /> {title}<span className={`pill ${completeAssembly ? "pill-good" : "pill-yellow"}`}>{completeAssembly ? "complete assembly" : "partial model coverage"}</span></div>
          <p className="mt-1 max-w-2xl text-[10.5px] leading-4 text-muted-foreground">{completeAssembly ? "A source-named complete assembly is available in its authored coordinate frame." : `${modelFiles.length} loose STL source part${modelFiles.length === 1 ? " is" : "s are"} available without verified assembly transforms. Each part is shown individually and is not presented as the complete robot.`} Drag to orbit and scroll to zoom.</p>
        </div>
        <div className="flex flex-wrap gap-2">{!completeAssembly && modelFiles.length > 1 && <div className="inline-flex max-w-full items-center rounded border border-border p-0.5" aria-label="3D source part"><button type="button" aria-label="Previous source part" disabled={selectedIndex <= 0} onClick={() => setSelectedIndex((index) => Math.max(0, index - 1))} className="rounded-sm p-1.5 hover:bg-muted disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5" /></button><select aria-label="Rendered source part" className="max-w-[260px] bg-transparent px-1 text-[10.5px]" value={selectedIndex} onChange={(event) => setSelectedIndex(Number(event.target.value))}>{modelFiles.map((file, index) => <option key={file.contentUrl} value={index}>{index + 1}. {file.name}</option>)}</select><button type="button" aria-label="Next source part" disabled={selectedIndex >= modelFiles.length - 1} onClick={() => setSelectedIndex((index) => Math.min(modelFiles.length - 1, index + 1))} className="rounded-sm p-1.5 hover:bg-muted disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5" /></button></div>}{sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">Official model source <ExternalLink className="h-3 w-3" /></a>}</div>
      </div>
      <div className="relative h-[360px] bg-[#f5f4ef] md:h-[460px]" data-testid="stl-model-viewer" data-layout={completeAssembly ? "assembly" : "source-part"} data-coverage={completeAssembly ? "complete" : "partial"} data-source-part={completeAssembly ? undefined : selectedIndex + 1}>
        {!group && !error && (
          <div className="absolute inset-0 z-10 grid place-items-center text-center text-[11px] text-muted-foreground">
            <div><Rotate3D className="mx-auto mb-2 h-6 w-6 animate-pulse text-primary" />Loading {completeAssembly ? "assembly" : `source part ${selectedIndex + 1} of ${modelFiles.length}`}…<div className="mt-1 font-mono">{progress.loaded}/{progress.total}</div></div>
          </div>
        )}
        {error && !group ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-[11px] text-muted-foreground">
            <div><Box className="mx-auto mb-2 h-6 w-6 opacity-60" /><p>3D preview unavailable.</p><p className="mt-1 max-w-md">{error}</p>{sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm mt-3 inline-flex">Open the official model</a>}</div>
          </div>
        ) : (
          <Canvas camera={{ position: [3.2, 2.4, 4.2], fov: 42 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: false }} shadows>
            <color attach="background" args={["#f5f4ef"]} />
            <ambientLight intensity={1.25} />
            <directionalLight position={[6, 8, 5]} intensity={2} castShadow />
            <directionalLight position={[-4, 2, -3]} intensity={0.65} />
            {group && (
              <Bounds fit clip observe margin={1.4}>
                <primitive object={group} />
              </Bounds>
            )}
            <Grid infiniteGrid cellSize={0.25} cellColor="#aaa496" sectionSize={1} sectionColor="#d6a900" fadeDistance={16} position={[0, -0.9, 0]} />
            <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
          </Canvas>
        )}
        {error && group && <div className="border-t border-border px-3 py-1 text-[10px] text-muted-foreground">{error}</div>}
      </div>
      <div className="border-t border-border bg-muted/10 px-4 py-2.5"><div className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">Rendered source files</div><div className="flex flex-wrap gap-1.5">{modelFiles.map((file) => <a key={file.contentUrl} href={file.contentUrl} className="pill max-w-full hover:border-primary/60 hover:text-foreground"><span className="max-w-[260px] truncate">{file.name}</span><ExternalLink className="h-2.5 w-2.5 shrink-0" /></a>)}</div></div>
    </section>
  );
}
