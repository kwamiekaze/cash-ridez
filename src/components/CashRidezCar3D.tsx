/**
 * CashRidezCar3D — standalone 3D hero for the CashRidez money car.
 *
 * - Loads the car GLB from CAR_MODEL_URL (single merged mesh "Mesh_0").
 * - Auto-centers the model at the origin and auto-scales it so its longest
 *   dimension equals 4 units (scale is derived, never hardcoded).
 * - Slow Y auto-rotation + damped pointer parallax (parallax off on touch).
 * - RoofSign is a solid matte-black taxi topper box seated flush on the roof,
 *   fully covering the garbled baked roof-sign texture. Its two long faces
 *   (facing the front and rear of the car) carry a runtime canvas wordmark
 *   reading "CASHRIDEZ". Coordinates are in the model's NATIVE units.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { CAR_MODEL_URL } from "@/lib/config";

useGLTF.preload(CAR_MODEL_URL);

const TARGET_SIZE = 4;

/** Sign transform in the model's NATIVE units (bbox X 1.8988 / Y 0.7177 / Z 0.8988). */
const ROOF_SIGN = {
  x: 0.1,
  y: 0.315,
  z: 0,
  rotY: Math.PI / 2,
  width: 0.4,
  height: 0.14,
  depth: 0.26,
} as const;

function useWordmarkTexture() {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0A0A0A";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const text = "CASHRIDEZ";
    const letterSpacing = 14;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#FACC15";

    let fontSize = 200;
    const measure = (size: number) => {
      ctx.font = `900 ${size}px "Arial Narrow", "Helvetica Neue", Impact, sans-serif`;
      let w = 0;
      for (const ch of text) w += ctx.measureText(ch).width + letterSpacing;
      return w - letterSpacing;
    };
    while (fontSize > 10 && measure(fontSize) > canvas.width * 0.88) fontSize -= 2;

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

function RoofSign() {
  const texture = useWordmarkTexture();
  const { width, height, depth } = ROOF_SIGN;

  return (
    <group
      position={[ROOF_SIGN.x, ROOF_SIGN.y, ROOF_SIGN.z]}
      rotation={[0, ROOF_SIGN.rotY, 0]}
    >
      {/* Single solid topper box. Long faces (+/-Z of this group, which after
          rotY = 90deg point along the car's +/-X) carry the wordmark. */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        {/* face order: +X, -X, +Y, -Y, +Z, -Z */}
        <meshStandardMaterial attach="material-0" color="#0A0A0A" roughness={0.9} metalness={0} />
        <meshStandardMaterial attach="material-1" color="#0A0A0A" roughness={0.9} metalness={0} />
        <meshStandardMaterial attach="material-2" color="#0A0A0A" roughness={0.9} metalness={0} />
        <meshStandardMaterial attach="material-3" color="#0A0A0A" roughness={0.9} metalness={0} />
        <meshStandardMaterial
          attach="material-4"
          map={texture}
          emissive={new THREE.Color("#FACC15")}
          emissiveMap={texture}
          emissiveIntensity={0.8}
          toneMapped={false}
          roughness={0.6}
          metalness={0}
        />
        <meshStandardMaterial
          attach="material-5"
          map={texture}
          emissive={new THREE.Color("#FACC15")}
          emissiveMap={texture}
          emissiveIntensity={0.8}
          toneMapped={false}
          roughness={0.6}
          metalness={0}
        />
      </mesh>
    </group>
  );
}

function CarModel({
  autoRotate,
  fixedRotY,
  parallax,
  onMeasured,
}: {
  autoRotate: boolean;
  fixedRotY?: number;
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
    if (!autoRotate && groupRef.current) groupRef.current.rotation.y = fixedRotY ?? 0;
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
        <RoofSign />
      </group>
    </group>
  );
}

export interface CashRidezCar3DProps {
  className?: string;
  /** TEMP dev-only camera override for visual verification. */
  __cam?: [number, number, number];
  /** TEMP dev-only rotation override. */
  __rotY?: number;
}

export default function CashRidezCar3D({ className, __cam, __rotY }: CashRidezCar3DProps) {
  const [loading, setLoading] = useState(true);
  const [isTouch, setIsTouch] = useState(false);

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

      <Canvas
        dpr={[1, 2]}
        shadows
        gl={{ alpha: true, antialias: true }}
        camera={{ position: __cam ?? [4, 1.8, 5], fov: 35 }}
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
            autoRotate={__cam === undefined}
            fixedRotY={__rotY}
            parallax={__cam === undefined && !isTouch}
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
      </Canvas>
    </div>
  );
}
