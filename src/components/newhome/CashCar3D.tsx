/**
 * CashCar3D — isolated cinematic car showcase for the /newhome mockup.
 *
 * The model is centered and scaled from its native bounding box, uses the
 * desktop/mobile CDN asset by device, and pauses rendering when off-screen.
 */
import React, {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Lightformer,
  OrbitControls,
  useGLTF,
} from "@react-three/drei";
import { Car } from "lucide-react";
import * as THREE from "three";
import {
  AUTOROTATE_RESUME_MS,
  CAR_MODEL_URL,
  CAR_MODEL_URL_MOBILE,
  CAR_TARGET_SIZE,
  PARTICLE_COLOR_GOLD,
  PARTICLE_COLOR_GREEN,
  PARTICLE_COUNT,
} from "@/lib/newHomeConfig";

function isMobileDevice() {
  if (typeof window === "undefined") return false;
  return (
    window.innerWidth < 768 ||
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(hover: none)").matches
  );
}

function hasWebGL() {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

class CarErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[CashCar3D] 3D scene failed, showing placeholder:", error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function Placeholder() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl border border-primary/25 bg-gradient-to-b from-primary/10 to-transparent px-8 py-14 backdrop-blur-sm">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-primary/40 bg-primary/10">
          <Car className="h-10 w-10 text-primary" />
        </div>
        <p className="text-center text-sm font-medium text-foreground/60">
          3D vehicle preview coming soon
        </p>
      </div>
    </div>
  );
}

function Spinner({ visible }: { visible: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-700 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function CarModel({
  url,
  reducedMotion,
  onReady,
}: {
  url: string;
  reducedMotion: boolean;
  onReady: () => void;
}) {
  const { scene } = useGLTF(url, true);
  const modelRef = useRef<THREE.Group>(null);
  const entrance = useRef(0);

  const { model, scale, nativeSize } = useMemo(() => {
    const clone = scene.clone(true);
    const bounds = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);

    clone.position.sub(center);
    clone.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const materials = Array.isArray(mesh.material)
        ? mesh.material.map((material) => material.clone())
        : mesh.material.clone();
      mesh.material = materials;
    });

    return {
      model: clone,
      scale: CAR_TARGET_SIZE / (Math.max(size.x, size.y, size.z) || 1),
      nativeSize: size,
    };
  }, [scene]);

  useEffect(() => {
    console.log("[CashCar3D] native size:", nativeSize.toArray(), "auto scale:", scale);
    onReady();
  }, [nativeSize, onReady, scale]);

  useFrame((_, rawDelta) => {
    const modelGroup = modelRef.current;
    if (!modelGroup) return;
    if (reducedMotion) {
      modelGroup.position.y = 0;
      modelGroup.rotation.y = 0;
      return;
    }

    const delta = Math.min(rawDelta, 0.05);
    entrance.current = Math.min(entrance.current + delta, 1.6);
    const progress = entrance.current / 1.6;
    const eased = 1 - Math.pow(1 - progress, 3);
    modelGroup.position.y = -0.3 * (1 - eased);
    modelGroup.rotation.y = -0.12 * (1 - eased);

    modelGroup.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        material.transparent = progress < 1;
        material.opacity = eased;
      });
    });
  });

  return (
    <group ref={modelRef} scale={scale}>
      <primitive object={model} />
    </group>
  );
}

function Particles({ animate }: { animate: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const { positions, colors } = useMemo(() => {
    const positionValues = new Float32Array(PARTICLE_COUNT * 3);
    const colorValues = new Float32Array(PARTICLE_COUNT * 3);
    const green = new THREE.Color(PARTICLE_COLOR_GREEN);
    const gold = new THREE.Color(PARTICLE_COLOR_GOLD);

    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      positionValues[index * 3] = (Math.random() - 0.5) * 7;
      positionValues[index * 3 + 1] = Math.random() * 3.2 - 0.6;
      positionValues[index * 3 + 2] = (Math.random() - 0.5) * 7;
      const color = index % 2 === 0 ? green : gold;
      colorValues[index * 3] = color.r;
      colorValues[index * 3 + 1] = color.g;
      colorValues[index * 3 + 2] = color.b;
    }

    return { positions: positionValues, colors: colorValues };
  }, []);

  useFrame((state, rawDelta) => {
    if (!animate || !pointsRef.current) return;
    const delta = Math.min(rawDelta, 0.05);
    const attribute = pointsRef.current.geometry.getAttribute("position") as THREE.BufferAttribute;
    const values = attribute.array as Float32Array;
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      values[index * 3 + 1] += delta * 0.12;
      if (values[index * 3 + 1] > 2.8) values[index * 3 + 1] = -0.6;
    }
    attribute.needsUpdate = true;
    pointsRef.current.rotation.y = state.clock.elapsedTime * 0.02;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.045}
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

function CarScene({
  modelUrl,
  frameloop,
  allowZoom,
  reducedMotion,
  onReady,
}: {
  modelUrl: string;
  frameloop: "always" | "never";
  allowZoom: boolean;
  reducedMotion: boolean;
  onReady: () => void;
}) {
  const controlsRef = useRef<any>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    useGLTF.preload(modelUrl, true);
    return () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, [modelUrl]);

  const pauseRotation = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    if (controlsRef.current) controlsRef.current.autoRotate = false;
  };

  const resumeRotation = () => {
    if (reducedMotion) return;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      if (controlsRef.current) controlsRef.current.autoRotate = true;
    }, AUTOROTATE_RESUME_MS);
  };

  return (
    <Canvas
      className="!absolute inset-0"
      dpr={[1, 2]}
      shadows
      frameloop={frameloop}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: 34, position: [3.2, 1.6, 3.2] }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
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
        color={PARTICLE_COLOR_GOLD}
      />
      <directionalLight position={[0, -3, 2]} intensity={0.2} color={PARTICLE_COLOR_GREEN} />
      <Environment resolution={256}>
        <Lightformer intensity={2} position={[0, 5, 0]} scale={[10, 10, 1]} />
        <Lightformer
          intensity={1}
          color={PARTICLE_COLOR_GREEN}
          position={[-5, 1, -1]}
          rotation-y={Math.PI / 2}
          scale={[20, 1, 1]}
        />
      </Environment>

      <Suspense fallback={null}>
        <CarModel url={modelUrl} reducedMotion={reducedMotion} onReady={onReady} />
        <ContactShadows
          position={[0, -1.15, 0]}
          opacity={0.55}
          scale={12}
          blur={2.6}
          far={4}
          color="black"
        />
      </Suspense>
      <Particles animate={!reducedMotion} />
      <OrbitControls
        ref={controlsRef}
        target={[0, 0, 0]}
        autoRotate={!reducedMotion}
        autoRotateSpeed={-2.4}
        enablePan={false}
        enableZoom={allowZoom}
        enableDamping
        dampingFactor={0.08}
        minDistance={1.5}
        maxDistance={8}
        onStart={pauseRotation}
        onEnd={resumeRotation}
      />
    </Canvas>
  );
}

export interface CashCar3DProps {
  className?: string;
}

export default function CashCar3D({ className }: CashCar3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [containerSize, setContainerSize] = useState(320);
  const mobile = useMemo(() => isMobileDevice(), []);
  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );
  const modelUrl = mobile ? CAR_MODEL_URL_MOBILE : CAR_MODEL_URL;
  const onReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    setWebgl(hasWebGL());
    const updateSize = () => {
      const width = window.innerWidth;
      setContainerSize(width >= 1024 ? 600 : width >= 768 ? 500 : width >= 640 ? 400 : 320);
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.05 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const glowSize = containerSize * 0.64;
  const canvasSize = containerSize * 0.84;

  return (
    <div
      ref={containerRef}
      className={className ?? "relative mx-auto"}
      style={{ width: containerSize, height: containerSize }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className="rounded-full bg-primary/20 blur-[90px]"
          style={{ width: glowSize, height: glowSize }}
        />
      </div>
      <div
        className="absolute"
        style={{
          width: canvasSize,
          height: canvasSize,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      >
        {webgl === false ? (
          <Placeholder />
        ) : webgl === true ? (
          <CarErrorBoundary fallback={<Placeholder />}>
            <CarScene
              modelUrl={modelUrl}
              frameloop={visible ? "always" : "never"}
              allowZoom={!mobile}
              reducedMotion={reducedMotion}
              onReady={onReady}
            />
            <Spinner visible={!ready} />
          </CarErrorBoundary>
        ) : (
          <Spinner visible />
        )}
      </div>
    </div>
  );
}
