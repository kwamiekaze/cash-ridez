import CashRidezCar3D from "@/components/CashRidezCar3D";

/** Temporary preview route for inspecting the 3D car hero. Not linked in nav. */
export default function CarPreview() {
  const q = new URLSearchParams(window.location.search);
  const cam = q.get("cam");
  const rot = q.get("rot");
  const camPos = cam ? (cam.split(",").map(Number) as [number, number, number]) : undefined;
  return (
    <main className="fixed inset-0 bg-black">
      <h1 className="sr-only">CashRidez 3D car preview</h1>
      <CashRidezCar3D __cam={camPos} __rotY={rot ? Number(rot) : undefined} />
    </main>
  );
}
