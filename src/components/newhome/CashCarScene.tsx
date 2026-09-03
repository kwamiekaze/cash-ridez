/**
 * CashCarScene — the actual three.js scene for CashCar3D.
 * Lazily imported so three.js never lands in the main bundle.
 */
import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  AUTOROTATE_RESUME_MS,
  CAR_TARGET_SIZE,
  PARTICLE_COLOR_GOLD,
  PARTICLE_COLOR_GREEN,
  PARTICLE_COUNT,
} from "@/lib/newHomeConfig";

function CarModel({
  url,
  onReady,
  reducedMotion,
}: {
  url: string;
  onReady: () => void;
  reducedMotion: boolean;
}) {
  const { scene } = useGLTF(url, true);
  const groupRef = useRef<THREE.Group>(null);
  const elapsed = useRef(0);

  const { model, scale } = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const footprint = Math.max(size.x, size.z) || 1;
    clone.position.sub(center);
    clone.position.y += size.y / 2;
    clone.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return { model: clone, scale: CAR_TARGET_SIZE / footprint };
  }, [scene]);

  useEffect(() => {
    onReady();
  }, [onReady]);

  // Cinematic entrance: fade in + slight rise + rotation settle over ~1.6s
  useFrame((_, rawDelta) => {
    const g = groupRef.current;
    if (!g) return;
    if (reducedMotion) {
      g.position.y = 0;
      g.rotation.y = 0;
      return;
    }
    const dt = Math.min(rawDelta, 0.05);
    elapsed.current = Math.min(elapsed.current + dt, 1.6);
    const t = elapsed.current / 1.6;
    const eased = 1 - Math.pow(1 - t, 3);
    g.position.y = -0.45 * (1 - eased);
    g.rotation.y = -0.55 * (1 - eased);
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        if (!m) return;
        m.transparent = t < 1;
        (m as THREE.Material).opacity = eased;
      });
    });
  });

  return (
    <group ref={groupRef}>
      <primitive object={model} scale={scale} />
    </group>
  );
}

function Particles({ animate }: { animate: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const col = new Float32Array(PARTICLE_COUNT * 3);
    const green = new THREE.Color(PARTICLE_COLOR_GREEN);
    const gold = new THREE.Color(PARTICLE_COLOR_GOLD);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 1] = Math.random() * 3.5 - 0.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
      const c = Math.random() > 0.5 ? green : gold;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    return { positions: pos, colors: col };
  }, []);

  useFrame((state, rawDelta) => {
    if (!animate || !pointsRef.current) return;
    const dt = Math.min(rawDelta, 0.05);
    const attr = pointsRef.current.geometry.getAttribute(
      "position"
    ) as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i * 3 + 1] += dt * 0.12;
      if (arr[i * 3 + 1] > 3) arr[i * 3 + 1] = -0.5;
    }
    attr.needsUpdate = true;
    pointsRef.current.rotation.y = state.clock.elapsedTime * 0.02;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        vertexColors
        transparent
        opacity={0.7}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

export interface CashCarSceneProps {
  modelUrl: string;
  frameloop: "always" | "never";
  allowZoom: boolean;
  reducedMotion: boolean;
  onReady: () => void;
}

export default function CashCarScene({
  modelUrl,
  frameloop,
  allowZoom,
  reducedMotion,
  onReady,
}: CashCarSceneProps) {
  const controlsRef = useRef<any>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    useGLTF.preload(modelUrl, true);
  }, [modelUrl]);

  useEffect(
    () => () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    },
    []
  );

  const handleStart = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    if (controlsRef.current) controlsRef.current.autoRotate = false;
  };

  const handleEnd = () => {
    if (reducedMotion) return;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      if (controlsRef.current) controlsRef.current.autoRotate = true;
    }, AUTOROTATE_RESUME_MS);
  };

  return (
    <Canvas
      className="!absolute inset-0"
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
      shadows
      frameloop={frameloop}
      camera={{ fov: 34, position: [3.2, 1.6, 3.2] }}
    >
      <ambientLight intensity={0.45} />
      <directionalLight
        position={[-5, 6, 5]}
        intensity={2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <spotLight
        position={[5, 4, -5]}
        angle={0.6}
        penumbra={0.9}
        intensity={18}
        color="#F5D142"
      />
      <directionalLight position={[0, -3, 2]} intensity={0.2} color="#4ADE80" />

      <Suspense fallback={null}>
        <CarModel url={modelUrl} onReady={onReady} reducedMotion={reducedMotion} />
        <ContactShadows
          position={[0, -1.2, 0]}
          opacity={0.55}
          scale={12}
          blur={2.6}
          far={4}
          color="#000000"
        />
      </Suspense>

      <Particles animate={!reducedMotion} />

      <OrbitControls
        ref={controlsRef}
        target={[0, 0.5, 0]}
        autoRotate={!reducedMotion}
        autoRotateSpeed={-2.778}
        enablePan={false}
        enableZoom={allowZoom}
        enableDamping
        dampingFactor={0.08}
        minDistance={1.5}
        maxDistance={8}
        onStart={handleStart}
        onEnd={handleEnd}
      />
    </Canvas>
  );
}
