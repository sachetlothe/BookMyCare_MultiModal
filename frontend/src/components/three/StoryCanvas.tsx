import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, PerformanceMonitor, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { LANGUAGES, langPack, type LangCode } from "../../lib/languages";
import Boy3D, { type Mood3D } from "./Boy3D";
import { drawDoc, drawGlow, drawHolo, drawLabel, drawReport, drawXRay, toTexture, type HoloKind, type ReportFace } from "./textures";

/* Scenes: 0 hero · 1 confusion · 2 upload · 3 analysis · 4 understand · 5 insights · 6 care · 7 language */
const FACES: ReportFace[] = ["hero", "complex", "upload", "analysis", "simple", "screening", "plan", "language"];
const MOODS: Mood3D[] = ["point", "confused", "uploading", "curious", "point", "curious", "happy", "wave"];

type V3 = [number, number, number];
type KF = { p: V3; r?: V3; s?: number } | null;

const damp = THREE.MathUtils.damp;
type Pointer = MutableRefObject<{ x: number; y: number }>;

/* ------------------------------------------------------------------ helpers */

/** Moves its children towards the key-frame for the current scene. `null` hides the object (scales to zero). */
function Rig({ states, scene, children, float = 0.06, speed = 1, phase = 0, lambda = 2.6, spin = 0, pointer, depth = 0 }: {
  states: KF[]; scene: number; children: ReactNode; float?: number; speed?: number; phase?: number; lambda?: number; spin?: number; pointer?: Pointer; depth?: number;
}) {
  const g = useRef<THREE.Group>(null);
  const last = useRef<KF>(states.find(Boolean) ?? null);
  // Objects that are hidden in the current scene are not created (no geometry, textures or
  // shaders) until the first scene that shows them.
  const [mounted, setMounted] = useState(() => scene < states.length && !!states[scene]);
  useEffect(() => { if (!mounted && scene < states.length && states[scene]) setMounted(true); }, [mounted, scene, states]);
  useFrame((state, dt) => {
    const o = g.current;
    if (!o) return;
    const kf = scene < states.length ? states[scene] : null;
    if (kf) last.current = kf;
    const k = last.current;
    if (!k) return;
    const t = state.clock.elapsedTime * speed + phase;
    const px = pointer ? pointer.current.x * depth : 0;
    const py = pointer ? pointer.current.y * depth : 0;
    o.position.x = damp(o.position.x, k.p[0] + px, lambda, dt);
    o.position.y = damp(o.position.y, k.p[1] + py + Math.sin(t) * float, lambda, dt);
    o.position.z = damp(o.position.z, k.p[2], lambda, dt);
    const r = k.r ?? [0, 0, 0];
    o.rotation.x = damp(o.rotation.x, r[0] + Math.sin(t * 0.7) * float * 0.6, lambda, dt);
    o.rotation.y = spin ? o.rotation.y + dt * spin : damp(o.rotation.y, r[1] + Math.cos(t * 0.6) * float * 0.8, lambda, dt);
    o.rotation.z = damp(o.rotation.z, r[2], lambda, dt);
    const target = kf ? (k.s ?? 1) : 0.0001;
    const s = damp(o.scale.x, target, lambda + 1, dt);
    o.scale.setScalar(s);
    o.visible = s > 0.002;
  });
  const first = states.find(Boolean);
  return <group ref={g} position={first?.p} scale={scene < states.length && states[scene] ? first?.s ?? 1 : 0.0001}>{mounted ? children : null}</group>;
}

function useFontsVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => alive && setV((x) => x + 1));
    return () => { alive = false; };
  }, []);
  return v;
}

function useCanvasTexture(draw: () => HTMLCanvasElement, deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tex = useMemo(() => toTexture(draw()), deps);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/* ------------------------------------------------------------------ blood cells */

function rbcGeometry() {
  const R = 0.32;
  const pts: THREE.Vector2[] = [];
  const n = 24;
  const h = (x: number) => {
    const q = Math.min(1, x / R);
    return 0.5 * R * Math.sqrt(Math.max(0, 1 - q * q)) * (0.207 + 2.003 * q * q - 1.123 * q ** 4);
  };
  for (let i = 0; i <= n; i++) { const x = (i / n) * R; pts.push(new THREE.Vector2(x, h(x) + 0.012)); }
  for (let i = n; i >= 0; i--) { const x = (i / n) * R; pts.push(new THREE.Vector2(x, -h(x) - 0.012)); }
  const g = new THREE.LatheGeometry(pts, 48);
  g.computeVertexNormals();
  return g;
}

const CELL_COUNT = 26;

function BloodCells({ scene, pointer, calm }: { scene: number; pointer: Pointer; calm?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(rbcGeometry, []);
  const mat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: "#d62839", roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25, sheen: 0.8, sheenColor: new THREE.Color("#ff9aa2"),
  }), []);
  const seeds = useMemo(() => Array.from({ length: CELL_COUNT }, (_, i) => {
    const r = (n: number) => { const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453; return x - Math.floor(x); };
    return { x: -0.8 + r(1) * 5.6, y: -2.4 + r(2) * 4.8, z: -3.4 + r(3) * 3.7, s: 0.55 + r(4) * 0.75, sp: 0.3 + r(5) * 0.6, ph: r(6) * 6.28, ax: r(7), ay: r(8) };
  }), []);
  const flow = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((state, dt) => {
    const m = ref.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    flow.current = damp(flow.current, scene === 3 ? 1 : 0, 2, dt);
    const amp = calm ? 0.2 : 1;
    seeds.forEach((c, i) => {
      const drift = flow.current * ((t * 0.9 * c.sp + c.ph) % 6.2);
      let x = c.x + Math.sin(t * c.sp * 0.5 + c.ph) * 0.25 * amp - drift;
      if (flow.current > 0.01) x = ((x + 1.5) % 6.2 + 6.2) % 6.2 - 1.5;
      const depth = (c.z + 3.5) * 0.12;
      dummy.position.set(x + pointer.current.x * depth, c.y + Math.cos(t * c.sp * 0.6 + c.ph) * 0.3 * amp + pointer.current.y * depth * 0.6, c.z);
      dummy.rotation.set(c.ax * 6 + t * 0.3 * c.sp * amp, c.ay * 6 + t * 0.25 * amp, 0);
      dummy.scale.setScalar(c.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, CELL_COUNT]} frustumCulled={false} />;
}

let whiteCellGeo: THREE.BufferGeometry | null = null;
function getWhiteCellGeometry() {
  if (whiteCellGeo) return whiteCellGeo;
  {
    const g = new THREE.IcosahedronGeometry(0.34, 5);
    const p = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = Math.sin(v.x * 18) * Math.sin(v.y * 16) * Math.sin(v.z * 20);
      v.multiplyScalar(1 + n * 0.06);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    whiteCellGeo = g;
    return g;
  }
}

function WhiteCell({ position, scale = 1 }: { position: V3; scale?: number }) {
  const geo = getWhiteCellGeometry();
  const mat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#eef2ff", roughness: 0.55, sheen: 1, sheenColor: new THREE.Color("#c4b5fd"), clearcoat: 0.3 }), []);
  const nucleus = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#a78bfa", roughness: 0.4, transparent: true, opacity: 0.55 }), []);
  const g = useRef<THREE.Group>(null);
  useFrame((_s, dt) => { if (g.current) { g.current.rotation.y += dt * 0.25; g.current.rotation.x += dt * 0.1; } });
  return (
    <group ref={g} position={position} scale={scale}>
      <mesh geometry={geo} material={mat} />
      <mesh material={nucleus} position={[0.06, 0.04, 0.12]} scale={[1, 0.7, 0.7]}><sphereGeometry args={[0.16, 24, 24]} /></mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ report, x-ray, holograms */

function ReportPanel({ face, lang, scanning }: { face: ReportFace; lang: LangCode; scanning: boolean }) {
  const fv = useFontsVersion();
  const tex = useCanvasTexture(() => drawReport(face, lang), [face, lang, fv]);
  const [hover, setHover] = useState(false);
  const tilt = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Mesh>(null);
  const flip = useRef(0);
  const shown = useRef(face);
  useFrame((state, dt) => {
    if (shown.current !== face) { shown.current = face; flip.current = 1; }
    flip.current = damp(flip.current, 0, 5, dt);
    if (tilt.current) {
      tilt.current.rotation.y = damp(tilt.current.rotation.y, (hover ? -0.22 : 0) + flip.current * 0.6, 5, dt);
      tilt.current.rotation.x = damp(tilt.current.rotation.x, hover ? 0.08 : 0, 5, dt);
      const s = damp(tilt.current.scale.x, hover ? 1.04 : 1, 6, dt);
      tilt.current.scale.setScalar(s);
    }
    if (beam.current) {
      const t = state.clock.elapsedTime;
      beam.current.position.y = 1.35 - ((t * 0.9) % 2.7);
      const m = beam.current.material as THREE.MeshBasicMaterial;
      m.opacity = damp(m.opacity, scanning ? 0.75 : 0, 6, dt);
    }
  });
  return (
    <group ref={tilt} onPointerOver={(e) => { e.stopPropagation(); setHover(true); }} onPointerOut={() => setHover(false)}>
      <RoundedBox args={[2.24, 2.94, 0.09]} radius={0.07} smoothness={4}>
        <meshPhysicalMaterial color="#f8fdff" roughness={0.25} clearcoat={1} clearcoatRoughness={0.15} />
      </RoundedBox>
      <mesh position={[0, 0, 0.047]}>
        <planeGeometry args={[2.12, 2.8]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <mesh ref={beam} position={[0, 0, 0.06]}>
        <planeGeometry args={[2.16, 0.14]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* stacked pages behind */}
      <mesh position={[0.1, -0.08, -0.09]} rotation={[0, 0, 0.03]}>
        <boxGeometry args={[2.18, 2.86, 0.02]} />
        <meshStandardMaterial color="#d6f3f7" roughness={0.6} />
      </mesh>
      <mesh position={[0.2, -0.15, -0.16]} rotation={[0, 0, 0.06]}>
        <boxGeometry args={[2.14, 2.8, 0.02]} />
        <meshStandardMaterial color="#b9e7ee" roughness={0.6} />
      </mesh>
    </group>
  );
}

function XRayPanel({ scanning }: { scanning: boolean }) {
  const tex = useCanvasTexture(drawXRay, []);
  const beam = useRef<THREE.Mesh>(null);
  const spin = useRef<THREE.Group>(null);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (spin.current) spin.current.rotation.y = Math.sin(t * 0.5) * 0.35;
    if (beam.current) {
      beam.current.position.y = 0.72 - ((t * 0.7) % 1.44);
      const m = beam.current.material as THREE.MeshBasicMaterial;
      m.opacity = damp(m.opacity, scanning ? 0.9 : 0.25, 4, dt);
    }
  });
  return (
    <group ref={spin}>
      <RoundedBox args={[1.32, 1.62, 0.06]} radius={0.06}>
        <meshPhysicalMaterial color="#0b1324" roughness={0.3} metalness={0.4} clearcoat={1} />
      </RoundedBox>
      <mesh position={[0, 0, 0.032]}>
        <planeGeometry args={[1.2, 1.5]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <mesh ref={beam} position={[0, 0, 0.04]}>
        <planeGeometry args={[1.22, 0.07]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.25} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.035]}>
        <planeGeometry args={[1.26, 1.56]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.06} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Holo({ kind, glyph }: { kind: HoloKind; glyph?: string }) {
  const fv = useFontsVersion();
  const tex = useCanvasTexture(() => drawHolo(kind, glyph), [kind, glyph, fv]);
  return (
    <mesh>
      <planeGeometry args={[0.95, 0.71]} />
      <meshBasicMaterial map={tex} transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
}

function Label({ text }: { text: string }) {
  const fv = useFontsVersion();
  const tex = useCanvasTexture(() => drawLabel(text), [text, fv]);
  return (
    <mesh>
      <planeGeometry args={[1.2, 0.3]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ documents and upload portal */

function Docs({ scene }: { scene: number }) {
  const tex = useCanvasTexture(drawDoc, []);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const scatter: V3[] = [[-0.3, 1.7, -0.6], [3.6, -0.4, -1.2], [2.2, 2.0, -1.4]];
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    refs.current.forEach((g, i) => {
      if (!g) return;
      let target: V3;
      let s = 0.0001;
      let rz = 0.2 * (i - 1);
      if (scene === 2) {
        const u = (t * 0.32 + i / 3) % 1;
        const from = new THREE.Vector3(1.2, 0.7, 0.8);
        const to = new THREE.Vector3(2.3, -1.25, 1.0);
        const p = from.lerp(to, u);
        p.y += Math.sin(u * Math.PI) * 0.6;
        target = [p.x, p.y, p.z];
        s = u < 0.85 ? 0.75 : 0.75 * (1 - (u - 0.85) / 0.15);
        rz = -0.6 * u;
        g.position.set(...target);
        g.rotation.set(-0.4 * u, 0.3, rz);
        g.scale.setScalar(Math.max(0.0001, s));
        g.visible = true;
        return;
      }
      if (scene === 1 || scene === 0) { target = scatter[i]; s = scene === 1 ? 0.85 : 0.6; } else target = scatter[i];
      g.position.x = damp(g.position.x, target[0], 2.5, dt);
      g.position.y = damp(g.position.y, target[1] + Math.sin(t + i) * 0.08, 2.5, dt);
      g.position.z = damp(g.position.z, target[2], 2.5, dt);
      g.rotation.z = damp(g.rotation.z, rz + Math.sin(t * 0.5 + i) * 0.1, 2.5, dt);
      g.rotation.x = damp(g.rotation.x, 0, 2.5, dt);
      const sc = damp(g.scale.x, s, 3.5, dt);
      g.scale.setScalar(sc);
      g.visible = sc > 0.002;
    });
  });
  return (
    <>
      {[0, 1, 2].map((i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }} scale={0.0001}>
          <RoundedBox args={[0.62, 0.8, 0.02]} radius={0.01}>
            <meshPhysicalMaterial color="#ffffff" roughness={0.4} clearcoat={0.5} />
          </RoundedBox>
          <mesh position={[0, 0, 0.012]}>
            <planeGeometry args={[0.58, 0.76]} />
            <meshStandardMaterial map={tex} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function UploadPortal() {
  const ring = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  useFrame((_s, dt) => {
    if (ring.current) ring.current.rotation.z += dt * 0.8;
    if (ring2.current) ring2.current.rotation.z -= dt * 0.5;
  });
  return (
    <group rotation={[-Math.PI / 2.4, 0, 0]}>
      <mesh ref={ring}>
        <torusGeometry args={[0.62, 0.025, 12, 96, Math.PI * 1.6]} />
        <meshBasicMaterial color="#5eead4" toneMapped={false} />
      </mesh>
      <mesh ref={ring2}>
        <torusGeometry args={[0.46, 0.014, 12, 96, Math.PI * 1.2]} />
        <meshBasicMaterial color="#7dd3fc" toneMapped={false} />
      </mesh>
      <mesh>
        <circleGeometry args={[0.6, 64]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, 0.6]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.55, 0.62, 1.2, 48, 1, true]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ care scene: companion and food */

function HeartCompanion() {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.55);
    s.bezierCurveTo(-0.15, -0.4, -0.62, -0.12, -0.62, 0.2);
    s.bezierCurveTo(-0.62, 0.48, -0.38, 0.6, -0.2, 0.6);
    s.bezierCurveTo(-0.08, 0.6, 0, 0.5, 0, 0.42);
    s.bezierCurveTo(0, 0.5, 0.08, 0.6, 0.2, 0.6);
    s.bezierCurveTo(0.38, 0.6, 0.62, 0.48, 0.62, 0.2);
    s.bezierCurveTo(0.62, -0.12, 0.15, -0.4, 0, -0.55);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.1, bevelSegments: 10, curveSegments: 32 });
    g.center();
    return g;
  }, []);
  const arm = useRef<THREE.Mesh>(null);
  useFrame((st) => { if (arm.current) arm.current.rotation.z = 0.6 + Math.sin(st.clock.elapsedTime * 5) * 0.35; });
  return (
    <group>
      <mesh geometry={geo}>
        <meshPhysicalMaterial color="#14b8a6" roughness={0.25} clearcoat={1} sheen={0.5} sheenColor="#99f6e4" />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.2, 0.12, 0.27]}>
          <mesh scale={[1, 1.2, 0.6]}><sphereGeometry args={[0.075, 16, 16]} /><meshPhysicalMaterial color="#0f172a" clearcoat={1} roughness={0.1} /></mesh>
          <mesh position={[0.02, 0.03, 0.04]}><sphereGeometry args={[0.022, 8, 8]} /><meshBasicMaterial color="#fff" /></mesh>
          <mesh position={[s * 0.1, -0.13, -0.01]} scale={[1, 0.6, 0.3]}><sphereGeometry args={[0.06, 12, 12]} /><meshBasicMaterial color="#fb7185" transparent opacity={0.5} /></mesh>
        </group>
      ))}
      <mesh position={[0, -0.05, 0.27]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.08, 0.02, 8, 24, Math.PI]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh ref={arm} position={[0.62, 0.05, 0.05]}>
        <capsuleGeometry args={[0.05, 0.28, 4, 12]} />
        <meshPhysicalMaterial color="#0f766e" roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.3, 0.25]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.16, 0.018, 8, 32, Math.PI]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

function Apple() {
  return (
    <group>
      <mesh scale={[1, 0.92, 1]}><sphereGeometry args={[0.24, 32, 32]} /><meshPhysicalMaterial color="#ef4444" roughness={0.25} clearcoat={1} /></mesh>
      <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[0.015, 0.02, 0.12, 8]} /><meshStandardMaterial color="#713f12" /></mesh>
      <mesh position={[0.07, 0.28, 0]} rotation={[0, 0, -0.8]} scale={[1, 0.4, 0.15]}><sphereGeometry args={[0.08, 12, 12]} /><meshStandardMaterial color="#22c55e" /></mesh>
    </group>
  );
}

function Broccoli() {
  const florets: V3[] = [[0, 0.22, 0], [0.12, 0.17, 0.05], [-0.12, 0.17, 0.04], [0.05, 0.16, -0.11], [-0.06, 0.28, -0.05], [0.07, 0.29, 0.06]];
  return (
    <group>
      <mesh position={[0, -0.02, 0]}><cylinderGeometry args={[0.05, 0.07, 0.3, 12]} /><meshStandardMaterial color="#86efac" roughness={0.6} /></mesh>
      {florets.map((p, i) => <mesh key={i} position={p}><sphereGeometry args={[0.1, 16, 16]} /><meshStandardMaterial color="#15803d" roughness={0.8} /></mesh>)}
    </group>
  );
}

function Orange() {
  return (
    <group>
      <mesh><sphereGeometry args={[0.2, 32, 32]} /><meshPhysicalMaterial color="#fb923c" roughness={0.55} clearcoat={0.4} /></mesh>
      <mesh position={[0, 0.2, 0]} rotation={[0, 0, 0.6]} scale={[1, 0.35, 0.2]}><sphereGeometry args={[0.07, 12, 12]} /><meshStandardMaterial color="#16a34a" /></mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ particles */

function Particles({ count = 260 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const tex = useMemo(() => new THREE.CanvasTexture(drawGlow()), []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 14;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 8;
      arr[i * 3 + 2] = -5 + Math.random() * 6;
    }
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, [count]);
  useFrame((_s, dt) => {
    const p = ref.current?.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!p) return;
    for (let i = 0; i < count; i++) {
      let y = p.getY(i) + dt * (0.08 + (i % 7) * 0.02);
      if (y > 4) y = -4;
      p.setY(i, y);
    }
    p.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial map={tex} size={0.09} sizeAttenuation transparent depthWrite={false} blending={THREE.AdditiveBlending} color="#99f6e4" opacity={0.8} />
    </points>
  );
}

/* ------------------------------------------------------------------ camera + layout */

function CameraRig({ pointer }: { pointer: Pointer }) {
  useFrame((state, dt) => {
    const c = state.camera;
    c.position.x = damp(c.position.x, pointer.current.x * 0.35, 2.5, dt);
    c.position.y = damp(c.position.y, 0.25 + pointer.current.y * 0.2, 2.5, dt);
    c.lookAt(0, 0, 0);
  });
  return null;
}

/** Positions the whole composition for the viewport: right half on desktop, top area on phones, left on the auth page. */
function Stage({ mode, children }: { mode: "story" | "auth"; children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const { size } = useThree();
  const aspect = size.width / size.height;
  const halfW = 2.52 * aspect;
  const narrow = aspect < 0.95;
  const auth = mode === "auth";
  const s = narrow ? Math.min(0.62, (halfW * 2) / 4.9) : THREE.MathUtils.clamp(aspect / 1.75, 0.62, 1) * (auth ? 0.72 : 0.8);
  const centre = 1.9 * s;
  const x = narrow ? -centre : auth ? -halfW * 0.15 - centre : halfW * 0.42 - centre;
  const y = narrow ? 1.05 : auth ? 0.85 : 0;
  return <group ref={g} position={[x, y, 0]} scale={s}>{children}</group>;
}

/* ------------------------------------------------------------------ scene */

const R = (p: V3, r?: V3, s?: number): KF => ({ p, r, s });

function Scene({ scene, lang, mode, pointer, calm, stage }: { scene: number; lang: LangCode; mode: "story" | "auth"; pointer: Pointer; calm: boolean; stage: number }) {
  const face = mode === "auth" ? "hero" : FACES[scene];
  const mood = mode === "auth" ? "wave" : MOODS[scene];
  const sc = mode === "auth" ? 0 : scene;
  const pack = langPack(lang);
  const glyphs = [pack.glyph, ...LANGUAGES.filter((l) => l.code !== lang && l.code !== "en").slice(0, 2).map((l) => l.glyph)];

  const report: KF[] = [
    R([1.0, 0.1, 0.4], [-0.06, 0.38, 0.05]),
    R([1.05, 0.15, 1.1], [0.02, 0.08, -0.04], 1.02),
    R([1.25, 0.35, 0.5], [-0.32, 0.32, 0.12], 0.78),
    R([1.05, 0.15, 0.35], [0, 0.12, 0], 1.0),
    R([0.95, 0.15, 0.6], [0, 0.26, 0], 1.04),
    R([0.95, 0.15, 0.5], [0, 0.26, 0], 1.0),
    R([0.9, 0.0, 0.4], [0, 0.3, 0], 0.95),
    R([0.95, 0.15, 0.6], [0, 0.26, 0], 1.04),
  ];
  const xray: KF[] = [R([3.35, 1.55, -0.7], [0, -0.3, 0.06], 0.9), R([3.45, 1.6, -1.0], [0, -0.3, 0.08], 0.8), null, R([3.0, 1.3, 0.3], [0, -0.25, 0], 1.05), null, null, null, null];
  const holoA: KF[] = [R([-0.35, 1.55, -0.4], [0, 0.4, 0]), null, null, R([-0.3, 1.45, 0.4], [0, 0.45, 0]), null, R([2.65, 1.65, 0.1], [0, -0.35, 0]), null, R([-0.3, 1.55, 0.2], [0, 0.4, 0])];
  const holoB: KF[] = [R([2.5, 2.0, -1.6], [0, -0.3, 0], 0.8), null, null, R([-0.4, -1.2, 0.8], [0, 0.5, 0]), null, R([3.4, 0.9, -0.4], [0, -0.4, 0], 0.85), null, R([3.3, 1.7, -0.4], [0, -0.4, 0])];
  const holoC: KF[] = [R([4.1, 0.3, -1.4], [0, -0.5, 0], 0.7), null, null, R([3.5, -0.2, -0.6], [0, -0.4, 0], 0.8), null, R([-0.35, -1.25, 0.6], [0, 0.5, 0], 0.8), null, R([-0.35, -1.2, 0.7], [0, 0.5, 0], 0.9)];
  const holoKinds: Record<number, [HoloKind, HoloKind, HoloKind]> = { 0: ["ring", "pulse", "bars"], 3: ["bars", "pulse", "ring"], 5: ["ring", "bars", "pulse"], 7: ["glyph", "glyph", "glyph"] };
  const kinds = holoKinds[sc] ?? ["ring", "pulse", "bars"];
  const jargon = ["MCHC 30.1 L", "RDW-CV 16.8 H", "×10³/µL", "Reference interval?", "Leukocytes"];
  const jargonPos: V3[] = [[-0.5, 1.7, 1.2], [2.2, 2.05, 0.4], [-0.45, -1.1, 1.5], [1.6, -1.65, 1.6], [3.7, 0.7, 0.2]];

  return (
    <>
      <CameraRig pointer={pointer} />
      {stage >= 2 && <Particles count={calm ? 120 : 260} />}
      <Stage mode={mode}>
        {stage >= 2 && <>
        <BloodCells scene={sc} pointer={pointer} calm={calm} />
        <Rig scene={sc} states={[R([3.9, -0.9, -0.8]), null, null, R([3.75, -0.9, 0.6], undefined, 0.9), null, null, null, null]} float={0.12} pointer={pointer} depth={0.25}><WhiteCell position={[0, 0, 0]} /></Rig>
        <Rig scene={sc} states={[R([-0.6, -1.6, -1.6], undefined, 0.8), null, null, R([0.0, -1.7, 1.3], undefined, 0.7), null, null, null, null]} float={0.1} phase={2} pointer={pointer} depth={0.3}><WhiteCell position={[0, 0, 0]} /></Rig>
        </>}

        <Rig scene={sc} states={report} float={calm ? 0.02 : 0.07} pointer={pointer} depth={0.15}>
          <ReportPanel face={face} lang={lang} scanning={sc === 3} />
        </Rig>
        <Rig scene={sc} states={xray} float={0.08} phase={1.3} pointer={pointer} depth={0.3}><XRayPanel scanning={sc === 3} /></Rig>

        {stage >= 2 && <>
        <Rig scene={sc} states={holoA} float={0.1} phase={0.5} pointer={pointer} depth={0.35}><Holo kind={kinds[0]} glyph={glyphs[0]} /></Rig>
        <Rig scene={sc} states={holoB} float={0.1} phase={1.9} pointer={pointer} depth={0.4}><Holo kind={kinds[1]} glyph={glyphs[1]} /></Rig>
        <Rig scene={sc} states={holoC} float={0.1} phase={3.1} pointer={pointer} depth={0.3}><Holo kind={kinds[2]} glyph={glyphs[2]} /></Rig>

        {jargon.map((j, i) => (
          <Rig key={j} scene={sc} states={[null, R(jargonPos[i], [0, 0.2 - i * 0.08, (i - 2) * 0.05], 0.85)]} float={0.09} phase={i} pointer={pointer} depth={0.3}>
            <Label text={j} />
          </Rig>
        ))}

        <Docs scene={sc} />
        <Rig scene={sc} states={[null, null, R([2.3, -1.35, 1.0])]} float={0.02}><UploadPortal /></Rig>

        <Rig scene={sc} states={[null, null, null, null, null, null, R([2.5, 1.55, 0.2], [0, -0.3, 0], 0.85)]} float={0.12}><HeartCompanion /></Rig>
        <Rig scene={sc} states={[null, null, null, null, null, null, R([-0.35, -1.25, 1.2])]} float={0.08} phase={0.7}><Apple /></Rig>
        <Rig scene={sc} states={[null, null, null, null, null, null, R([-0.4, 1.55, 0.6], [0.3, 0, 0.2])]} float={0.08} phase={1.7}><Broccoli /></Rig>
        <Rig scene={sc} states={[null, null, null, null, null, null, R([3.9, -0.2, 0.3])]} float={0.08} phase={2.7}><Orange /></Rig>
        </>}

        {stage >= 1 && <Rig scene={sc} states={[R([3.05, -1.6, 0.6]), R([3.1, -1.6, 0.7]), R([3.25, -1.6, 0.4]), R([3.15, -1.6, 0.7]), R([3.05, -1.6, 0.7]), R([3.1, -1.6, 0.6]), R([3.15, -1.6, 0.6]), R([3.05, -1.6, 0.7])]} float={0} lambda={2}>
          <Boy3D mood={mood} pointer={pointer} calm={calm} />
          <ContactShadows position={[0, 0.005, 0]} opacity={0.5} scale={3.2} blur={2.6} far={2.5} resolution={256} color="#022c22" frames={1} />
        </Rig>}
      </Stage>
    </>
  );
}

/**
 * Compiles every shader with KHR_parallel_shader_compile (off the main thread where the browser
 * supports it) before the first frame is drawn. Without this, the first frame compiles ~20
 * programs synchronously and freezes the page for several hundred milliseconds.
 */
function ShaderWarmup({ onReady }: { onReady: () => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let done = false;
    const finish = () => { if (!done) { done = true; onReady(); } };
    const r = gl as THREE.WebGLRenderer & { compileAsync?: (s: THREE.Object3D, c: THREE.Camera) => Promise<unknown> };
    const t = window.setTimeout(finish, 4000); // never keep the scene hidden for long
    const upload = () => {
      // Upload textures in a separate task so the first rendered frame stays short.
      setTimeout(() => {
        scene.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
            const map = (mat as THREE.MeshBasicMaterial).map;
            if (map) gl.initTexture(map);
          }
        });
        finish();
      }, 0);
    };
    if (r.compileAsync) r.compileAsync(scene, camera).then(upload, finish);
    else finish();
    return () => window.clearTimeout(t);
  }, [gl, scene, camera, onReady]);
  return null;
}

export default function StoryCanvas({ scene = 0, lang = "en", mode = "story", active = true, calm = false }: {
  scene?: number; lang?: LangCode; mode?: "story" | "auth"; active?: boolean; calm?: boolean;
}) {
  const pointer = useRef({ x: 0, y: 0 });
  // Adaptive resolution: drop to 1x pixels if the frame rate falls, restore when it recovers.
  const [dpr, setDpr] = useState(() => Math.min(1.5, window.devicePixelRatio || 1));
  const [warm, setWarm] = useState(false);
  const onWarm = useCallback(() => setWarm(true), []);
  // Build the scene in stages (report -> boy -> cells and extras), one idle period each, so no
  // single task blocks the page for long. Rendering starts once everything is built and compiled.
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (stage >= 2) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const next = () => setStage((x) => x + 1);
    const id = w.requestIdleCallback ? w.requestIdleCallback(next, { timeout: 400 }) : window.setTimeout(next, 50);
    return () => { if (w.cancelIdleCallback) w.cancelIdleCallback(id); else clearTimeout(id); };
  }, [stage]);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <Canvas
      dpr={dpr}
      frameloop={active && warm ? "always" : "never"}
      camera={{ position: [0, 0.25, 8], fov: 35, near: 0.1, far: 50 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(Math.min(1.5, window.devicePixelRatio || 1))} flipflops={3} onFallback={() => setDpr(1)} />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={["#ccfbf1", "#042f2e", 0.8]} />
      <directionalLight position={[3, 5, 6]} intensity={2.3} color="#fff7ed" />
      <spotLight position={[-3, 3, -4]} intensity={60} angle={0.6} penumbra={1} color="#2dd4bf" />
      <pointLight position={[1, 0.5, 3]} intensity={6} color="#a5f3fc" />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.5} color="#e0fbff" position={[0, 4, 4]} scale={[8, 3, 1]} />
        <Lightformer form="rect" intensity={2} color="#5eead4" position={[-5, 1, -1]} rotation={[0, Math.PI / 2, 0]} scale={[6, 4, 1]} />
        <Lightformer form="ring" intensity={3} color="#ffffff" position={[4, 3, 3]} scale={2} />
      </Environment>
      <Scene scene={scene} lang={lang} mode={mode} pointer={pointer} calm={calm} stage={stage} />
      {stage >= 2 && <ShaderWarmup onReady={onWarm} />}
    </Canvas>
  );
}
