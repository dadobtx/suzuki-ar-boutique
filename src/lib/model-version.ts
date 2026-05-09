/**
 * Source of truth for the pose model version.
 * Imported by both:
 *   - pose.worker.ts (browser, must NOT pull Node modules)
 *   - scripts/download-models.ts (Node script, OK to import)
 *
 * Keep this file pure TS with zero dependencies.
 */
export const POSE_MODEL_VERSION = '0.10.18-full-float16';
