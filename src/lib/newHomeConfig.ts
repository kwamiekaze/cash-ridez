// Config for the /newhome work-in-progress homepage.
import car from "@/assets/cashridez-car-v5.glb.asset.json";

export const CAR_MODEL_URL = car.url;
export const CAR_MODEL_URL_MOBILE = car.url;

// Header lockup (placeholder — swap for the real uploaded asset)
export const HEADER_LOGO_URL = "/branding/cashridez-topper.webp";

// Particle field
export const PARTICLE_COUNT = 60;
export const PARTICLE_COLOR_GREEN = "#4ADE80";
export const PARTICLE_COLOR_GOLD = "#F5D142";

// Auto-scale target: longest bounding-box dimension in world units
export const CAR_TARGET_SIZE = 4.9;

// Delay before autoRotate resumes after user interaction (ms)
export const AUTOROTATE_RESUME_MS = 3000;
