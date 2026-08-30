/**
 * CashRidezCar3D — standalone 3D hero for the CashRidez money car.
 *
 * - Loads the car GLB from CAR_MODEL_URL (single merged mesh "Mesh_0").
 * - Auto-centers the model at the origin and auto-scales it so its longest
 *   dimension equals 4 units (scale is derived, never hardcoded).
 * - Slow Y auto-rotation + damped pointer parallax (parallax off on touch).
 * - RoofSign overlays a runtime canvas wordmark ("CASHRIDEZ") over the
 *   garbled baked roof-sign texture, backed by an opaque matte-black box.
 * - debug prop (or ?debug=1) shows OrbitControls + sliders to dial the sign in.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { CAR_MODEL_URL } from "@/lib/config";

useGLTF.preload(CAR_MODEL_URL);

const TARGET_SIZE = 4;

export interface RoofSignTransform {
  x: number;
  y: number;
  z: number;
  rotY: number;
  width: number;
  height: number;
}

const DEFAULT_SIGN: RoofSignTransform = {
  x: 0,
  y: 1.1,
  z: 0.2,
  rotY: 0,
  width: 1.2,
  height: 0.3,
};

function useWordmarkTexture() {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0A0A0A";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const text = "CASHRIDEZ";
    const letterSpacing = 18;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#FACC15";

    // Fit the font size so the spaced text fills ~90% of the canvas width.
    let fontSize = 200;
    const measure = (size: number) => {
      ctx.font = `900 ${size}px "Arial Narrow", "Helvetica Neue", Impact, sans-serif`;
      let w = 0;
      for (const ch of text) w += ctx.measureText(ch).width + letterSpacing;
      return w - letterSpacing;
    };
    while (fontSize > 10 && measure(fontSize) > canvas.width * 0.9) fontSize -= 2;

    const total = measure(fontSize);
    let x = (canvas.width - total) / 2;
    const y = canvas.height / 2;
    for (const ch of text) {
      ctx.fillText(ch, x, y);
      x += ctx.measureText(ch).width + letterSpacing;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 16;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, []);
}

function RoofSign({ transform }: { transform: RoofSignTransform }) {
  const texture = useWordmarkTexture();
  const { width, height } = transform;

  return (
    <group
      position={[transform.x, transform.y, transform.z]}
      rotation={[0, transform.rotY, 0]}
    >
      {/* Opaque matte-black blocker: slightly larger than the text planes */}
      <mesh>
        <boxGeometry args={[width * 1.08, height * 1.18, 0.06]} />
        <meshStandardMaterial color="#0A0A0A" roughness={0.9} metalness={0} />
      </mesh>

      {/* Front-facing wordmark */}
      <mesh position={[0, 0, 0.032]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          map={texture}
          emissive={new THREE.Color("#FACC15")}
          emissiveMap={texture}
          emissiveIntensity={0.8}
          toneMapped={false}
          roughness={0.6}
        />
      </mesh>

      {/* Back-facing wordmark */}
      <mesh position={[0, 0, -0.032]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          map={texture}
          emissive={new THREE.Color("#FACC15")}
          emissiveMap={texture}
          emissiveIntensity={0.8}
          toneMapped={false}
          roughness={0.6}
        />
      </mesh>
    </group>
  );
}

function CarModel({
  sign,
  autoRotate,
  parallax,
  onMeasured,
}: {
  sign: RoofSignTransform;
  autoRotate: boolean;
  parallax: boolean;
  onMeasured?: (info: { size: THREE.Vector3; scale: number; meshes: string[] }) => void;
}) {
  const { scene } = useGLTF(CAR_MODEL_URL);
  const groupRef = useRef<THREE.Group>(null);
  const tiltRef = useRef<THREE.Group>(null);
  const { pointer } = useThree();

  const { model, scale } = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const longest = Math.max(size.x, size.y, size.z) || 1;
    const s = TARGET_SIZE / longest;
    clone.position.sub(center);
    const meshes: string[] = [];
    clone.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        meshes.push(o.name || "(unnamed)");
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    onMeasured?.({ size, scale: s, meshes });
    return { model: clone, scale: s };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    if (autoRotate && groupRef.current) groupRef.current.rotation.y += 0.15 * dt;
    if (parallax && tiltRef.current) {
      const k = 1 - Math.exp(-5 * dt);
      tiltRef.current.rotation.x +=
        (-pointer.y * 0.12 - tiltRef.current.rotation.x) * k;
      tiltRef.current.rotation.z +=
        (pointer.x * 0.06 - tiltRef.current.rotation.z) * k;
    }
  });

  return (
    <group ref={tiltRef}>
      <group ref={groupRef} scale={scale}>
        <primitive object={model} />
        <RoofSign transform={sign} />
      </group>
    </group>
  );
}

function DebugPanel({
  sign,
  setSign,
}: {
  sign: RoofSignTransform;
  setSign: (s: RoofSignTransform) => void;
}) {
  const rows: Array<[keyof RoofSignTransform, number, number, number]> = [
    ["x", -3, 3, 0.01],
    ["y", -3, 3, 0.01],
    ["z", -3, 3, 0.01],
    ["rotY", -Math.PI, Math.PI, 0.01],
    ["width", 0.1, 3, 0.01],
    ["height", 0.1, 3, 0.01],
  ];

  return (
    <div className="absolute left-4 top-4 z-20 w-72 rounded-lg border border-yellow-400/40 bg-black/80 p-3 text-xs text-yellow-400 backdrop-blur">
      <div className="mb-2 font-bold tracking-wide">ROOF SIGN DEBUG</div>
      {rows.map(([key, min, max, step]) => (
        <label key={key} className="mb-2 flex items-center gap-2">
          <span className="w-12 shrink-0">{key}</span>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={sign[key]}
            onChange={(e) => setSign({ ...sign, [key]: parseFloat(e.target.value) })}
            className="flex-1 accent-yellow-400"
          />
          <span className="w-12 shrink-0 text-right tabular-nums">
            {sign[key].toFixed(2)}
          </span>
        </label>
      ))}
      <button
        type="button"
        onClick={() =>
          navigator.clipboard?.writeText(JSON.stringify(sign, null, 2))
        }
        className="mt-1 w-full rounded bg-yellow-400 py-1 font-semibold text-black"
      >
        Copy values
      </button>
    </div>
  );
}

export interface CashRidezCar3DProps {
  debug?: boolean;
  className?: string;
}

export default function CashRidezCar3D({ debug = false, className }: CashRidezCar3DProps) {
  const [sign, setSign] = useState<RoofSignTransform>(DEFAULT_SIGN);
  const [loading, setLoading] = useState(true);
  const [isTouch, setIsTouch] = useState(false);

  const debugOn = useMemo(() => {
    if (debug) return true;
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("debug") === "1";
  }, [debug]);

  useEffect(() => {
    setIsTouch(window.matchMedia("(hover: none)").matches);
  }, []);

  return (
    <div className={className ?? "relative h-full w-full bg-black"}>
      {loading && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />
        </div>
      )}

      {debugOn && <DebugPanel sign={sign} setSign={setSign} />}

      <Canvas
        dpr={[1, 2]}
        shadows
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [4, 1.8, 5], fov: 35 }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      >
        <ambientLight intensity={0.3} />
        <directionalLight
          position={[-6, 7, 6]}
          intensity={2}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <spotLight
          position={[5, 4, -6]}
          angle={0.6}
          penumbra={0.8}
          intensity={20}
          color="#FACC15"
        />
        <directionalLight position={[0, -4, 2]} intensity={0.25} color="#8899aa" />

        <Suspense fallback={null}>
          <CarModel
            sign={sign}
            autoRotate={!debugOn}
            parallax={!debugOn && !isTouch}
            onMeasured={(info) => {
              console.log("[CashRidezCar3D] meshes:", info.meshes);
              console.log(
                "[CashRidezCar3D] native size:",
                info.size.toArray(),
                "auto scale:",
                info.scale
              );
              setLoading(false);
            }}
          />
          <ContactShadows
            position={[0, -1.05, 0]}
            opacity={0.6}
            scale={12}
            blur={2.6}
            far={4}
            color="#000000"
          />
        </Suspense>

        {debugOn && <OrbitControls makeDefault enableDamping />}
      </Canvas>
    </div>
  );
}
