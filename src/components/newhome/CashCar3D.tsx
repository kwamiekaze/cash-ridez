/**
 * CashCar3D — cinematic car showcase for the /newhome mockup.
 *
 * Mirrors the DrivingKlass `CarShowcase` composition: the component fills its
 * parent box and the canvas wrapper expands to 145% of it, so the rendered car
 * overflows the layout slot the way the reference does.
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
import { Canvas, useFrame, useThree } from "@react-three/fiber";
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

class SafeBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[CashCar3D] subtree failed, using fallback:", error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function LocalEnvironment() {
  return (
    <Environment resolution={256}>
      <Lightformer intensity={2} position={[0, 5, 0]} scale={[10, 10, 1]} />
      <Lightformer
        intensity={1}
        color={PARTICLE_COLOR_GREEN}
        position={[-5, 1, -1]}
        rotation-y={Math.PI / 2}
        scale={[20, 1, 1]}
      />
      <Lightformer
        intensity={1}
        color={PARTICLE_COLOR_GOLD}
        position={[5, 1, 1]}
        rotation-y={-Math.PI / 2}
        scale={[20, 1, 1]}
      />
    </Environment>
  );
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
      <div
        className="animate-spin rounded-full border-2 border-primary border-t-transparent"
        style={{ width: 42, height: 42 }}
      />
    </div>
  );
}

function CarModel({
  url,
  reducedMotion,
  onReady,
  onCameraFit,
}: {
  url: string;
  reducedMotion: boolean;
  onReady: () => void;
  onCameraFit?: (target: THREE.Vector3, dist: number) => void;
}) {
  const { scene } = useGLTF(url, true);
  const modelRef = useRef<THREE.Group>(null);
  const entrance = useRef(0);
  const { camera, size: viewport } = useThree();

  const { model, nativeSize } = useMemo(() => {
    const clone = scene.clone(true);
    const bounds = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);

    clone.position.sub(center);
    clone.position.y += size.y / 2;

    clone.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const clone1 = (material: THREE.Material) => {
        const next = material.clone() as THREE.MeshStandardMaterial;
        if ("envMapIntensity" in next) next.envMapIntensity = 1.35;
        return next;
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(clone1)
        : clone1(mesh.material);
    });

    return { model: clone, nativeSize: size };
  }, [scene]);

  // Fit-to-frame camera: single source of truth for the camera distance.
  // The car's rendered length is a fraction of the canvas width, by breakpoint.
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (!viewport.width || !viewport.height) return;
    const aspect = viewport.width / viewport.height;
    cam.aspect = aspect;
    const vFov = THREE.MathUtils.degToRad(cam.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const halfLen = Math.max(nativeSize.x, nativeSize.z) / 2;

    // Target is expressed against the VIEWPORT width (the canvas is a few px
    // narrower because of the page gutter).
    const vw = typeof window !== "undefined" ? window.innerWidth : viewport.width;
    const frac = vw >= 1024 ? 0.62 : vw >= 768 ? 0.7 : 0.75;
    const targetPx = vw * frac;
    // Perspective gain: the near flank of the car sits closer than the look-at
    // plane, so it projects ~15% longer than the flat frame maths predicts.
    const PERSPECTIVE_GAIN = 1.15;
    const fill = targetPx / (PERSPECTIVE_GAIN * viewport.width);
    const dist = halfLen / fill / Math.tan(hFov / 2);


    const dir = new THREE.Vector3(3.2, 1.6, 3.2).normalize();
    const target = new THREE.Vector3(0, nativeSize.y / 2, 0);
    cam.position.copy(target).addScaledVector(dir, dist);
    cam.lookAt(target);

    cam.near = Math.max(0.01, dist / 100);
    cam.far = dist * 20;
    cam.updateProjectionMatrix();
    console.log('FIT', JSON.stringify({vw:viewport.width,vh:viewport.height,frac,targetPx,dist,nat:[nativeSize.x,nativeSize.y,nativeSize.z],fov:cam.fov}));
    onCameraFit?.(target, dist);

  }, [camera, viewport.width, viewport.height, nativeSize, onCameraFit]);

  useEffect(() => {
    onReady();
  }, [nativeSize, onReady]);

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
    modelGroup.position.y = -0.35 * (1 - eased);
    modelGroup.rotation.y = (-25 * Math.PI) / 180 * (1 - eased);

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
    <group ref={modelRef} name="carRoot">
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
  const [fit, setFit] = useState<{ target: [number, number, number]; dist: number }>({
    target: [0, 0.5, 0],
    dist: 4,
  });

  const handleCameraFit = useCallback((target: THREE.Vector3, dist: number) => {
    setFit({ target: [target.x, target.y, target.z], dist });
    // Push the fitted distance through OrbitControls after its own clamping /
    // damping has settled, otherwise the previous min/maxDistance wins.
    const apply = () => {
      const controls = controlsRef.current;
      if (!controls) return;
      const dir = new THREE.Vector3(3.2, 1.6, 3.2).normalize();
      controls.minDistance = dist * 0.7;
      controls.maxDistance = dist * 1.4;
      controls.target.copy(target);
      controls.object.position.copy(target).addScaledVector(dir, dist);
      controls.object.lookAt(target);
      controls.update();
    };
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
  }, []);


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
      onCreated={({ camera }) => camera.lookAt(0, 0.5, 0)}
    >
      {/* Five-light rig */}
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
      <pointLight position={[0, 3, -4]} intensity={6} color="#ffffff" />

      {/* Env map is mandatory for the metallic body; fall back to Lightformers. */}
      <SafeBoundary fallback={<LocalEnvironment />}>
        <Suspense fallback={<LocalEnvironment />}>
          <Environment preset="city" />
        </Suspense>
      </SafeBoundary>

      <Suspense fallback={null}>
        <CarModel url={modelUrl} reducedMotion={reducedMotion} onReady={onReady} onCameraFit={handleCameraFit} />
        <ContactShadows
          position={[0, -0.02, 0]}
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
        target={fit.target}
        autoRotate={!reducedMotion}
        autoRotateSpeed={-2.778}
        enablePan={false}
        enableZoom={allowZoom}
        enableDamping
        dampingFactor={0.08}
        minDistance={fit.dist * 0.7}
        maxDistance={fit.dist * 1.4}
        onStart={pauseRotation}
        onEnd={resumeRotation}
      />
    </Canvas>
  );
}

export interface CashCar3DProps {
  className?: string;
  style?: React.CSSProperties;
}

export default function CashCar3D({ className, style }: CashCar3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
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

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-visible ${className ?? ""}`}
      style={style}
    >
      {/* Canvas wrapper fills the car-shaped slot. */}
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: "100%",
          height: "100%",
          transform: "translate(-50%, -50%)",
        }}
      >
        {webgl === false ? (
          <Placeholder />
        ) : webgl === true ? (
          <SafeBoundary fallback={<Placeholder />}>
            <CarScene
              modelUrl={modelUrl}
              frameloop={visible ? "always" : "never"}
              allowZoom={!mobile}
              reducedMotion={reducedMotion}
              onReady={onReady}
            />
            <Spinner visible={!ready} />
          </SafeBoundary>
        ) : (
          <Spinner visible />
        )}
      </div>
    </div>
  );
}
