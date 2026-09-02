/**
 * CashCar3D — cinematic 3D hero centerpiece for the /newhome mockup.
 *
 * - three.js is code-split via React.lazy so it stays out of the main bundle.
 * - IntersectionObserver gates the frameloop ("always" visible / "never" offscreen).
 * - Device-based LOD picks the mobile GLB on small / coarse-pointer devices.
 * - Error boundary + WebGL detection render a styled placeholder instead of
 *   white-screening when the GLB is missing or WebGL is unavailable.
 */
import React, {
  Component,
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Car } from "lucide-react";
import { CAR_MODEL_URL, CAR_MODEL_URL_MOBILE } from "@/lib/newHomeConfig";

const CarScene = lazy(() => import("./CashCarScene"));

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
    return !!(
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

export interface CashCar3DProps {
  className?: string;
}

function useContainerSize() {
  const [size, setSize] = useState(320);
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      setSize(w >= 1024 ? 600 : w >= 768 ? 500 : w >= 640 ? 400 : 320);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  return size;
}

export default function CashCar3D({ className }: CashCar3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const containerSize = useContainerSize();

  const mobile = useMemo(() => isMobileDevice(), []);
  const modelUrl = mobile ? CAR_MODEL_URL_MOBILE : CAR_MODEL_URL;

  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  useEffect(() => {
    setWebgl(hasWebGL());
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.05 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const layerSize = containerSize * 0.58;
  const canvasSize = layerSize * 1.45;

  return (
    <div
      ref={containerRef}
      className={className ?? "relative mx-auto"}
      style={{ width: containerSize, height: containerSize }}
    >
      {/* Ambient glow behind the car */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div
          className="rounded-full bg-primary/20 blur-[80px]"
          style={{ width: layerSize, height: layerSize }}
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
            <Suspense fallback={<Spinner visible />}>
              <CarScene
                modelUrl={modelUrl}
                frameloop={visible ? "always" : "never"}
                allowZoom={!mobile}
                reducedMotion={reducedMotion}
                onReady={() => setReady(true)}
              />
              <Spinner visible={!ready} />
            </Suspense>
          </CarErrorBoundary>
        ) : null}
      </div>
    </div>
  );
}

