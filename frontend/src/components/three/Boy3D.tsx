import { useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";

export type Mood3D = "hero" | "confused" | "uploading" | "curious" | "happy" | "point" | "wave";

/** Target pose per mood. Arms rotate around their shoulder: z swings sideways, x swings forward. */
const POSES: Record<Mood3D, { rz: number; rx: number; lz: number; lx: number; tilt: number; turn: number; brow: number; mouth: "smile" | "open" | "o" | "flat"; elbow: number }> = {
  hero: { rz: -1.25, rx: -0.6, lz: 0.25, lx: 0, tilt: 0.05, turn: -0.25, brow: 0, mouth: "smile", elbow: 0.3 },
  point: { rz: -1.45, rx: -0.5, lz: 0.2, lx: 0, tilt: 0.08, turn: -0.35, brow: 0.05, mouth: "open", elbow: 0.15 },
  confused: { rz: -0.2, rx: 0, lz: 2.5, lx: -0.3, tilt: 0.22, turn: -0.3, brow: -0.25, mouth: "flat", elbow: 1.6 },
  uploading: { rz: -0.9, rx: -1.0, lz: 0.9, lx: -1.0, tilt: 0, turn: -0.2, brow: 0.1, mouth: "smile", elbow: 0.5 },
  curious: { rz: -0.35, rx: -0.2, lz: 0.3, lx: 0, tilt: -0.14, turn: -0.4, brow: 0.2, mouth: "o", elbow: 0.2 },
  happy: { rz: -2.5, rx: 0, lz: 2.5, lx: 0, tilt: 0, turn: -0.1, brow: 0.15, mouth: "open", elbow: 0.25 },
  wave: { rz: -0.25, rx: 0, lz: 2.6, lx: 0, tilt: -0.06, turn: 0, brow: 0.1, mouth: "smile", elbow: 0.6 },
};

const damp = THREE.MathUtils.damp;

function Arm({ side, armRef, elbowRef, mat, skin }: {
  side: 1 | -1; armRef: MutableRefObject<THREE.Group | null>; elbowRef: MutableRefObject<THREE.Group | null>;
  mat: THREE.Material; skin: THREE.Material;
}) {
  return (
    <group ref={armRef} position={[side * 0.43, 1.28, 0]}>
      <mesh material={mat} position={[0, -0.2, 0]}>
        <capsuleGeometry args={[0.11, 0.26, 8, 16]} />
      </mesh>
      <group ref={elbowRef} position={[0, -0.4, 0]}>
        <mesh material={mat} position={[0, -0.16, 0]}>
          <capsuleGeometry args={[0.1, 0.2, 8, 16]} />
        </mesh>
        <mesh material={skin} position={[0, -0.38, 0]}>
          <sphereGeometry args={[0.1, 24, 24]} />
        </mesh>
      </group>
    </group>
  );
}

export default function Boy3D({ mood, pointer, calm }: { mood: Mood3D; pointer: MutableRefObject<{ x: number; y: number }>; calm?: boolean }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const elbowR = useRef<THREE.Group>(null);
  const elbowL = useRef<THREE.Group>(null);
  const browR = useRef<THREE.Mesh>(null);
  const browL = useRef<THREE.Mesh>(null);
  const mouthSmile = useRef<THREE.Mesh>(null);
  const mouthOpen = useRef<THREE.Group>(null);
  const mouthO = useRef<THREE.Mesh>(null);
  const mouthFlat = useRef<THREE.Mesh>(null);
  const blink = useRef({ next: 2, t: 0 });

  const m = useMemo(() => ({
    skin: new THREE.MeshPhysicalMaterial({ color: "#f6c7a1", roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color("#ffb8a0") }),
    hair: new THREE.MeshPhysicalMaterial({ color: "#4a2a17", roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.4 }),
    hoodie: new THREE.MeshPhysicalMaterial({ color: "#38a3ee", roughness: 0.75, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color("#bae6fd") }),
    hoodieDark: new THREE.MeshPhysicalMaterial({ color: "#2f95e0", roughness: 0.8 }),
    pants: new THREE.MeshPhysicalMaterial({ color: "#1e3a8a", roughness: 0.7 }),
    shoe: new THREE.MeshPhysicalMaterial({ color: "#f8fafc", roughness: 0.4, clearcoat: 0.6 }),
    stripe: new THREE.MeshStandardMaterial({ color: "#14b8a6", roughness: 0.4 }),
    white: new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.15, clearcoat: 1 }),
    pupil: new THREE.MeshPhysicalMaterial({ color: "#1f130b", roughness: 0.1, clearcoat: 1 }),
    shine: new THREE.MeshBasicMaterial({ color: "#ffffff" }),
    cheek: new THREE.MeshBasicMaterial({ color: "#fb7185", transparent: true, opacity: 0.35 }),
    mouth: new THREE.MeshStandardMaterial({ color: "#7f1d1d", roughness: 0.6 }),
    tongue: new THREE.MeshStandardMaterial({ color: "#fb7185", roughness: 0.6 }),
    red: new THREE.MeshStandardMaterial({ color: "#ef4444", roughness: 0.4 }),
    badge: new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.3, clearcoat: 0.8 }),
    string: new THREE.MeshStandardMaterial({ color: "#e0f2fe", roughness: 0.5 }),
  }), []);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const p = POSES[mood];
    const k = calm ? 4 : 6;
    const wobble = calm ? 0 : 1;

    if (body.current) {
      body.current.position.y = Math.sin(t * 1.6) * 0.015 * wobble;
      body.current.scale.y = 1 + Math.sin(t * 1.6) * 0.008 * wobble;
    }
    if (root.current) root.current.rotation.y = damp(root.current.rotation.y, p.turn * 0.6 + pointer.current.x * 0.12, 3, dt);

    if (head.current) {
      head.current.rotation.z = damp(head.current.rotation.z, p.tilt + Math.sin(t * 0.9) * 0.025 * wobble, k, dt);
      head.current.rotation.y = damp(head.current.rotation.y, p.turn * 0.5 + pointer.current.x * 0.35, 4, dt);
      head.current.rotation.x = damp(head.current.rotation.x, -pointer.current.y * 0.18, 4, dt);
    }

    const waveT = mood === "wave" || mood === "happy" ? Math.sin(t * 6) * 0.25 * wobble : 0;
    if (armR.current) {
      armR.current.rotation.z = damp(armR.current.rotation.z, p.rz + (mood === "happy" ? -waveT : 0) + Math.sin(t * 1.3) * 0.03 * wobble, k, dt);
      armR.current.rotation.x = damp(armR.current.rotation.x, p.rx, k, dt);
    }
    if (armL.current) {
      armL.current.rotation.z = damp(armL.current.rotation.z, p.lz + waveT - Math.sin(t * 1.3) * 0.03 * wobble, k, dt);
      armL.current.rotation.x = damp(armL.current.rotation.x, p.lx, k, dt);
    }
    if (elbowR.current) elbowR.current.rotation.z = damp(elbowR.current.rotation.z, mood === "uploading" ? -0.5 : -p.elbow * 0.3, k, dt);
    if (elbowL.current) elbowL.current.rotation.z = damp(elbowL.current.rotation.z, p.elbow, k, dt);

    for (const [ref, s] of [[browR, -1], [browL, 1]] as const) {
      if (!ref.current) continue;
      ref.current.position.y = damp(ref.current.position.y, 0.2 + p.brow * 0.12, k, dt);
      ref.current.rotation.z = damp(ref.current.rotation.z, s * (mood === "confused" ? (s > 0 ? 0.35 : -0.1) : -p.brow * 0.6), k, dt);
    }

    const show = (ref: { current: THREE.Object3D | null }, on: boolean) => {
      if (!ref.current) return;
      const v = damp(ref.current.scale.x, on ? 1 : 0.001, 10, dt);
      ref.current.scale.setScalar(v);
    };
    show(mouthSmile, p.mouth === "smile");
    show(mouthOpen, p.mouth === "open");
    show(mouthO, p.mouth === "o");
    show(mouthFlat, p.mouth === "flat");

    const b = blink.current;
    if (t > b.next) { b.t = t; b.next = t + 2.5 + Math.random() * 3; }
    const phase = (t - b.t) / 0.16;
    const lid = phase >= 0 && phase < 1 ? Math.abs(Math.cos(phase * Math.PI)) : 1;
    if (eyes.current) {
      eyes.current.scale.y = Math.max(0.08, lid);
      eyes.current.position.x = damp(eyes.current.position.x, pointer.current.x * 0.025, 6, dt);
    }
  });

  return (
    <group ref={root}>
      <group ref={body}>
        {/* legs + shoes */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.17, 0, 0]}>
            <mesh material={m.pants} position={[0, 0.42, 0]}>
              <capsuleGeometry args={[0.13, 0.42, 8, 16]} />
            </mesh>
            <RoundedBox args={[0.26, 0.14, 0.42]} radius={0.06} position={[0, 0.07, 0.06]} material={m.shoe} />
            <mesh material={m.stripe} position={[0, 0.07, 0.06]}>
              <boxGeometry args={[0.27, 0.035, 0.36]} />
            </mesh>
          </group>
        ))}
        {/* hoodie body */}
        <mesh material={m.hoodie} position={[0, 1.05, 0]} scale={[1, 1, 0.82]}>
          <capsuleGeometry args={[0.4, 0.42, 12, 32]} />
        </mesh>
        <mesh material={m.hoodieDark} position={[0, 0.8, 0.31]} scale={[1, 0.45, 0.18]}>
          <sphereGeometry args={[0.2, 24, 16]} />
        </mesh>
        <mesh material={m.hoodieDark} position={[0, 1.45, -0.08]} rotation={[0.3, 0, 0]}>
          <torusGeometry args={[0.27, 0.07, 12, 32]} />
        </mesh>
        {/* drawstrings */}
        {[-1, 1].map((s) => (
          <mesh key={s} material={m.string} position={[s * 0.08, 1.3, 0.33]}>
            <capsuleGeometry args={[0.014, 0.14, 4, 8]} />
          </mesh>
        ))}
        {/* badge with red cross */}
        <group position={[0.17, 1.12, 0.33]} rotation={[0, 0.2, 0]}>
          <mesh material={m.badge}><cylinderGeometry args={[0.08, 0.08, 0.025, 24]} /></mesh>
          <mesh material={m.red} position={[0, 0.014, 0]}><boxGeometry args={[0.09, 0.01, 0.028]} /></mesh>
          <mesh material={m.red} position={[0, 0.014, 0]}><boxGeometry args={[0.028, 0.01, 0.09]} /></mesh>
        </group>

        <Arm side={-1} armRef={armR} elbowRef={elbowR} mat={m.hoodie} skin={m.skin} />
        <Arm side={1} armRef={armL} elbowRef={elbowL} mat={m.hoodie} skin={m.skin} />

        {/* head */}
        <group ref={head} position={[0, 1.6, 0]}>
          <group position={[0, 0.38, 0]}>
            <mesh material={m.skin} scale={[1, 0.95, 0.95]}>
              <sphereGeometry args={[0.5, 48, 48]} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} material={m.skin} position={[s * 0.49, -0.02, 0]} scale={[0.5, 1, 0.8]}>
                <sphereGeometry args={[0.11, 16, 16]} />
              </mesh>
            ))}
            {/* hair cap + tufts */}
            <mesh material={m.hair} position={[0, 0.04, -0.02]} rotation={[-0.35, 0, 0]}>
              <sphereGeometry args={[0.53, 48, 24, 0, Math.PI * 2, 0, 1.25]} />
            </mesh>
            {[[-0.22, 0.33, 0.3, 0.5], [0.0, 0.38, 0.34, 0.2], [0.2, 0.34, 0.3, -0.4], [0.05, 0.5, 0.05, 0]].map(([x, y, z, r], i) => (
              <mesh key={i} material={m.hair} position={[x, y, z]} rotation={[0.9, 0, r]} scale={[1, 1.4, 0.8]}>
                <sphereGeometry args={[0.13, 16, 16]} />
              </mesh>
            ))}
            <mesh material={m.hair} position={[0.02, 0.6, -0.05]} rotation={[0.4, 0, -0.3]}>
              <coneGeometry args={[0.07, 0.22, 12]} />
            </mesh>
            {/* eyes */}
            <group ref={eyes}>
              {[-1, 1].map((s) => (
                <group key={s} position={[s * 0.17, 0.0, 0.42]}>
                  <mesh material={m.white} scale={[1, 1.15, 0.55]}><sphereGeometry args={[0.105, 24, 24]} /></mesh>
                  <mesh material={m.pupil} position={[0, -0.01, 0.045]} scale={[1, 1.1, 0.6]}><sphereGeometry args={[0.068, 24, 24]} /></mesh>
                  <mesh material={m.shine} position={[0.025, 0.025, 0.09]}><sphereGeometry args={[0.02, 12, 12]} /></mesh>
                </group>
              ))}
            </group>
            {/* brows */}
            <mesh ref={browR} material={m.hair} position={[-0.17, 0.2, 0.44]} rotation={[0, 0, 0]}>
              <capsuleGeometry args={[0.018, 0.1, 4, 8]} />
            </mesh>
            <mesh ref={browL} material={m.hair} position={[0.17, 0.2, 0.44]} rotation={[0, 0, 0]}>
              <capsuleGeometry args={[0.018, 0.1, 4, 8]} />
            </mesh>
            {/* cheeks */}
            {[-1, 1].map((s) => (
              <mesh key={s} material={m.cheek} position={[s * 0.3, -0.13, 0.39]} scale={[1, 0.6, 0.3]}><sphereGeometry args={[0.08, 16, 16]} /></mesh>
            ))}
            {/* nose */}
            <mesh material={m.skin} position={[0, -0.09, 0.47]}><sphereGeometry args={[0.045, 16, 16]} /></mesh>
            {/* mouths */}
            <mesh ref={mouthSmile} material={m.mouth} position={[0, -0.2, 0.44]} rotation={[0, 0, Math.PI]}>
              <torusGeometry args={[0.075, 0.017, 8, 24, Math.PI]} />
            </mesh>
            <group ref={mouthOpen} position={[0, -0.2, 0.43]} scale={0.001}>
              <mesh material={m.mouth} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.4, 1]}>
                <sphereGeometry args={[0.09, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
              </mesh>
              <mesh material={m.tongue} position={[0, -0.035, 0.012]} scale={[1, 0.5, 0.4]}><sphereGeometry args={[0.045, 16, 16]} /></mesh>
            </group>
            <mesh ref={mouthO} material={m.mouth} position={[0, -0.21, 0.45]} scale={0.001}>
              <torusGeometry args={[0.035, 0.016, 8, 24]} />
            </mesh>
            <mesh ref={mouthFlat} material={m.mouth} position={[0.02, -0.21, 0.45]} rotation={[0, 0, Math.PI / 2 - 0.15]} scale={0.001}>
              <capsuleGeometry args={[0.014, 0.08, 4, 8]} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}
