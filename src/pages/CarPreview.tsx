import CashRidezCar3D from "@/components/CashRidezCar3D";

/** Temporary preview route for inspecting the 3D car hero. Not linked in nav. */
export default function CarPreview() {
  return (
    <main className="fixed inset-0 bg-black">
      <h1 className="sr-only">CashRidez 3D car preview</h1>
      <CashRidezCar3D />
    </main>
  );
}
