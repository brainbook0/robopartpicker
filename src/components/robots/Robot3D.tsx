import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, ContactShadows, Environment } from "@react-three/drei";
import * as THREE from "three";
import type { Robot } from "@/data/robots";

// Procedural 3D robot built from primitives. Acts as a placeholder for real
// GLTF models. The proportions key off the robot's actual height / DoF /
// category so each unit reads distinctly.
export const Robot3D = ({ robot, height = 420 }: { robot: Robot; height?: number }) => {
  return (
    <div className="relative w-full" style={{ height }}>
      <Canvas shadows camera={{ position: [2.4, 1.8, 3.2], fov: 35 }} dpr={[1, 2]}>
        <color attach="background" args={["#0b0d10"]} />
        <fog attach="fog" args={["#0b0d10", 8, 18]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[5, 6, 4]} intensity={1.1} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-4, 3, -2]} intensity={0.5} color={`hsl(${robot.accentHsl})`} />
        <Suspense fallback={null}>
          <Environment preset="city" />
          <Spin>
            <RobotMesh robot={robot} />
          </Spin>
          <ContactShadows position={[0, -0.001, 0]} opacity={0.55} scale={6} blur={2.4} far={3} />
          <Grid
            args={[20, 20]}
            cellSize={0.25}
            cellThickness={0.6}
            cellColor="#1f2937"
            sectionSize={1}
            sectionThickness={1}
            sectionColor={`hsl(${robot.accentHsl})`}
            fadeDistance={10}
            fadeStrength={1.2}
            infiniteGrid
            position={[0, 0, 0]}
          />
        </Suspense>
        <OrbitControls
          enablePan={false}
          minDistance={2}
          maxDistance={7}
          minPolarAngle={0.2}
          maxPolarAngle={Math.PI / 2.05}
          target={[0, 0.9, 0]}
        />
      </Canvas>
      <div className="pointer-events-none absolute left-3 top-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        drag to orbit · scroll to zoom
      </div>
      <div className="pointer-events-none absolute right-3 top-2 font-mono text-[10px] uppercase tracking-wider" style={{ color: `hsl(${robot.accentHsl})` }}>
        {robot.heightCm} cm · {robot.weightKg} kg · {robot.dof} DoF
      </div>
    </div>
  );
};

const Spin = ({ children }: { children: React.ReactNode }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.25;
  });
  return <group ref={ref}>{children}</group>;
};

const RobotMesh = ({ robot }: { robot: Robot }) => {
  // Scale: 1 unit = 1 meter. Height in cm.
  const h = robot.heightCm / 100;
  if (robot.category === "wheeled-humanoid") return <WheeledHumanoid robot={robot} h={h} />;
  if (robot.category === "biped") return <Biped robot={robot} h={h} />;
  if (robot.category === "quadruped") return <Quadruped robot={robot} h={h} />;
  return <Humanoid robot={robot} h={h} />;
};

const useMats = (accentHsl: string) => {
  const accent = new THREE.Color(`hsl(${accentHsl})`);
  const shell = new THREE.MeshStandardMaterial({ color: "#e7eaf0", metalness: 0.45, roughness: 0.42 });
  const dark = new THREE.MeshStandardMaterial({ color: "#1c1f24", metalness: 0.7, roughness: 0.35 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.6, roughness: 0.25, emissive: accent, emissiveIntensity: 0.35 });
  const joint = new THREE.MeshStandardMaterial({ color: "#3a3f47", metalness: 0.9, roughness: 0.25 });
  const rubber = new THREE.MeshStandardMaterial({ color: "#111418", metalness: 0.1, roughness: 0.95 });
  return { shell, dark, accentMat, joint, rubber };
};

const J = ({ position, r = 0.05, m }: { position: [number, number, number]; r?: number; m: THREE.Material }) => (
  <mesh position={position} material={m} castShadow>
    <sphereGeometry args={[r, 24, 24]} />
  </mesh>
);

const Humanoid = ({ robot, h }: { robot: Robot; h: number }) => {
  const m = useMats(robot.accentHsl);
  // proportions
  const legH = h * 0.5;
  const torsoH = h * 0.32;
  const headR = h * 0.07;
  const shoulderW = h * 0.24;
  return (
    <group position={[0, 0, 0]}>
      {/* legs */}
      {[-0.07, 0.07].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          <mesh position={[0, legH * 0.25, 0]} material={m.dark} castShadow>
            <cylinderGeometry args={[0.06, 0.05, legH * 0.5, 18]} />
          </mesh>
          <J position={[0, legH * 0.5, 0]} m={m.joint} r={0.055} />
          <mesh position={[0, legH * 0.75, 0]} material={m.shell} castShadow>
            <cylinderGeometry args={[0.07, 0.06, legH * 0.5, 18]} />
          </mesh>
          <mesh position={[0, 0.015, 0.03]} material={m.rubber} castShadow>
            <boxGeometry args={[0.1, 0.03, 0.18]} />
          </mesh>
          <J position={[0, 0.04, 0]} m={m.joint} r={0.045} />
        </group>
      ))}
      {/* hips */}
      <mesh position={[0, legH + 0.02, 0]} material={m.dark} castShadow>
        <boxGeometry args={[0.22, 0.08, 0.16]} />
      </mesh>
      {/* torso */}
      <mesh position={[0, legH + 0.05 + torsoH / 2, 0]} material={m.shell} castShadow>
        <boxGeometry args={[0.28, torsoH, 0.18]} />
      </mesh>
      {/* chest accent plate */}
      <mesh position={[0, legH + 0.05 + torsoH * 0.55, 0.095]} material={m.accentMat} castShadow>
        <boxGeometry args={[0.16, torsoH * 0.35, 0.012]} />
      </mesh>
      {/* shoulders */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (shoulderW / 2), legH + torsoH, 0]}>
          <J position={[0, 0, 0]} m={m.joint} r={0.06} />
          <mesh position={[0, -torsoH * 0.35, 0]} material={m.dark} castShadow>
            <cylinderGeometry args={[0.045, 0.04, torsoH * 0.7, 16]} />
          </mesh>
          <J position={[0, -torsoH * 0.7, 0]} m={m.joint} r={0.05} />
          <mesh position={[0, -torsoH * 1.05, 0]} material={m.shell} castShadow>
            <cylinderGeometry args={[0.04, 0.035, torsoH * 0.65, 16]} />
          </mesh>
          {/* hand */}
          <mesh position={[0, -torsoH * 1.42, 0]} material={m.accentMat} castShadow>
            <boxGeometry args={[0.06, 0.1, 0.04]} />
          </mesh>
        </group>
      ))}
      {/* neck + head */}
      <mesh position={[0, legH + torsoH + 0.09, 0]} material={m.joint} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 0.05, 16]} />
      </mesh>
      <mesh position={[0, legH + torsoH + 0.12 + headR, 0]} material={m.shell} castShadow>
        <boxGeometry args={[headR * 1.7, headR * 2, headR * 1.6]} />
      </mesh>
      {/* visor */}
      <mesh position={[0, legH + torsoH + 0.12 + headR + 0.005, headR * 0.81]} material={m.accentMat} castShadow>
        <boxGeometry args={[headR * 1.5, headR * 0.55, 0.01]} />
      </mesh>
    </group>
  );
};

const WheeledHumanoid = ({ robot, h }: { robot: Robot; h: number }) => {
  const m = useMats(robot.accentHsl);
  const baseH = h * 0.35;
  const torsoH = h * 0.32;
  const headR = h * 0.07;
  return (
    <group>
      {/* trapezoidal base */}
      <mesh position={[0, baseH / 2 + 0.05, 0]} material={m.dark} castShadow>
        <cylinderGeometry args={[0.16, 0.26, baseH, 8]} />
      </mesh>
      {/* wheels */}
      {[
        [0.24, 0, 0], [-0.24, 0, 0], [0, 0, 0.24], [0, 0, -0.24],
      ].map((p, i) => (
        <mesh key={i} position={[p[0], 0.06, p[2]]} material={m.rubber} castShadow rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.055, 0.025, 12, 24]} />
        </mesh>
      ))}
      {/* torso */}
      <mesh position={[0, baseH + 0.05 + torsoH / 2, 0]} material={m.shell} castShadow>
        <boxGeometry args={[0.28, torsoH, 0.2]} />
      </mesh>
      <mesh position={[0, baseH + 0.05 + torsoH * 0.6, 0.105]} material={m.accentMat} castShadow>
        <boxGeometry args={[0.18, torsoH * 0.4, 0.012]} />
      </mesh>
      {/* arms */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.16, baseH + torsoH, 0]}>
          <J position={[0, 0, 0]} m={m.joint} r={0.055} />
          <mesh position={[0, -torsoH * 0.4, 0]} material={m.dark} castShadow>
            <cylinderGeometry args={[0.04, 0.035, torsoH * 0.8, 16]} />
          </mesh>
          <mesh position={[0, -torsoH * 0.9, 0]} material={m.accentMat} castShadow>
            <boxGeometry args={[0.05, 0.08, 0.04]} />
          </mesh>
        </group>
      ))}
      {/* head */}
      <mesh position={[0, baseH + torsoH + 0.13 + headR, 0]} material={m.shell} castShadow>
        <sphereGeometry args={[headR, 24, 24]} />
      </mesh>
      <mesh position={[0, baseH + torsoH + 0.13 + headR, headR * 0.85]} material={m.accentMat}>
        <boxGeometry args={[headR * 1.3, headR * 0.5, 0.008]} />
      </mesh>
    </group>
  );
};

const Biped = ({ robot, h }: { robot: Robot; h: number }) => {
  const m = useMats(robot.accentHsl);
  const legH = h * 0.55;
  const torsoH = h * 0.3;
  return (
    <group>
      {/* backwards-knee biped legs */}
      {[-0.08, 0.08].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          {/* thigh angled forward */}
          <mesh position={[0, legH * 0.7, 0.04]} rotation={[0.25, 0, 0]} material={m.dark} castShadow>
            <cylinderGeometry args={[0.05, 0.045, legH * 0.45, 18]} />
          </mesh>
          {/* shin angled backward */}
          <mesh position={[0, legH * 0.3, -0.04]} rotation={[-0.4, 0, 0]} material={m.shell} castShadow>
            <cylinderGeometry args={[0.045, 0.04, legH * 0.5, 18]} />
          </mesh>
          {/* foot */}
          <mesh position={[0, 0.02, 0.06]} material={m.rubber} castShadow>
            <boxGeometry args={[0.08, 0.04, 0.16]} />
          </mesh>
        </group>
      ))}
      {/* torso */}
      <mesh position={[0, legH + torsoH / 2, 0]} material={m.shell} castShadow>
        <boxGeometry args={[0.26, torsoH, 0.16]} />
      </mesh>
      <mesh position={[0, legH + torsoH * 0.6, 0.085]} material={m.accentMat}>
        <boxGeometry args={[0.14, torsoH * 0.4, 0.01]} />
      </mesh>
      {/* small sensor head */}
      <mesh position={[0, legH + torsoH + 0.06, 0]} material={m.dark} castShadow>
        <boxGeometry args={[0.12, 0.08, 0.12]} />
      </mesh>
      <mesh position={[0, legH + torsoH + 0.06, 0.061]} material={m.accentMat}>
        <boxGeometry args={[0.1, 0.04, 0.008]} />
      </mesh>
    </group>
  );
};

const Quadruped = ({ robot, h }: { robot: Robot; h: number }) => {
  const m = useMats(robot.accentHsl);
  const bodyY = h * 0.55;
  return (
    <group>
      {/* body */}
      <mesh position={[0, bodyY, 0]} material={m.shell} castShadow>
        <boxGeometry args={[0.5, 0.18, 0.24]} />
      </mesh>
      <mesh position={[0, bodyY + 0.005, 0.121]} material={m.accentMat}>
        <boxGeometry args={[0.3, 0.08, 0.008]} />
      </mesh>
      {/* head */}
      <mesh position={[0.32, bodyY + 0.04, 0]} material={m.dark} castShadow>
        <boxGeometry args={[0.12, 0.1, 0.16]} />
      </mesh>
      {/* legs */}
      {[
        [0.2, 0.1], [0.2, -0.1], [-0.2, 0.1], [-0.2, -0.1],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, bodyY * 0.7, 0]} material={m.dark} castShadow>
            <cylinderGeometry args={[0.025, 0.022, bodyY * 0.45, 14]} />
          </mesh>
          <mesh position={[0, bodyY * 0.3, 0.02]} material={m.shell} castShadow>
            <cylinderGeometry args={[0.022, 0.018, bodyY * 0.5, 14]} />
          </mesh>
          <J position={[0, bodyY * 0.5, 0]} m={m.joint} r={0.03} />
        </group>
      ))}
    </group>
  );
};