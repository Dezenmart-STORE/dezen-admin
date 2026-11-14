import { parseLiveAreas } from './areas';

const env = import.meta.env as Record<string, string | undefined>;

/** The backend base URL, including /api/v1. */
export const API_URL = env.VITE_API_URL?.replace(/\/$/, '') ?? 'http://localhost:3000/api/v1';

/**
 * Sample-data mode: every request is answered in the browser by src/mocks/backend.ts, so the
 * whole admin can be used and reviewed before the backend endpoints exist. On unless
 * VITE_USE_SAMPLE_DATA=false. Production builds must set it to false.
 */
export const USE_SAMPLE_DATA = env.VITE_USE_SAMPLE_DATA !== 'false';

/** Areas that use the real backend while sample mode is on (see lib/areas.ts). */
export const LIVE_AREAS = parseLiveAreas(env.VITE_LIVE_AREAS);

/** Sign-in is the sample one (pick a role, any code) only while no area is live. */
export const SAMPLE_SIGN_IN = USE_SAMPLE_DATA && !LIVE_AREAS.has('auth');
