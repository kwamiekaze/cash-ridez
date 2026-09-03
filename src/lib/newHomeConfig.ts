// Config for the /newhome work-in-progress homepage.
import desktopCar from "@/assets/cashridez-car-desktop.glb.asset.json";
import mobileCar from "@/assets/cashridez-car-mobile.glb.asset.json";

export const CAR_MODEL_URL = desktopCar.url;
export const CAR_MODEL_URL_MOBILE = mobileCar.url;

// Header lockup (placeholder — swap for the real uploaded asset)
export const HEADER_LOGO_URL = "/branding/cashridez-topper.webp";

// Particle field
export const PARTICLE_COUNT = 60;
export const PARTICLE_COLOR_GREEN = "#4ADE80";
export const PARTICLE_COLOR_GOLD = "#F5D142";

// Auto-scale target: longest bounding-box dimension in world units
export const CAR_TARGET_SIZE = 2.1;

// Delay before autoRotate resumes after user interaction (ms)
export const AUTOROTATE_RESUME_MS = 3000;
