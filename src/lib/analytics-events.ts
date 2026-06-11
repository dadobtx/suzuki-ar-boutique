/**
 * Analytics event taxonomy. Every interaction the user has with the kiosk
 * that's interesting for behavior analysis emits one of these. Keep payloads
 * small — we serialize a lot of them and storage is bounded by localStorage
 * (~5 MB on most browsers).
 *
 * Event IDs are generated client-side with `crypto.randomUUID()` if available,
 * falling back to a timestamp+random combo for older browsers. Session IDs
 * group events from the same user visit and reset on COOLDOWN→ATTRACT.
 */

export type ErrorCategory = 'pose' | 'content' | 'timeout' | 'network' | 'other';
export type SessionOutcome = 'photo_downloaded' | 'photo_taken' | 'abandoned' | 'error';
export type FilterType = 'size' | 'color' | 'line' | 'category';

interface BaseEvent {
  /** Unique identifier for this event. */
  id: string;
  /** Unix epoch ms when the event was emitted. */
  timestamp: number;
  /** Groups events from the same kiosk session (one user visit). */
  sessionId: string;
  /** Discriminator. */
  type: string;
}

export interface SessionStartedEvent extends BaseEvent {
  type: 'session_started';
}

export interface SessionEndedEvent extends BaseEvent {
  type: 'session_ended';
  durationMs: number;
  outcome: SessionOutcome;
}

export interface StateTransitionEvent extends BaseEvent {
  type: 'state_transition';
  from: string;
  to: string;
  durationInPrevMs: number;
}

export interface GarmentSelectedEvent extends BaseEvent {
  type: 'garment_selected';
  sku: string;
  line: string;
  category?: string;
}

export interface GarmentWishlistEvent extends BaseEvent {
  type: 'garment_wishlisted' | 'garment_unwishlisted';
  sku: string;
}

export interface FilterAppliedEvent extends BaseEvent {
  type: 'filter_applied';
  filterType: FilterType;
  /** Current selected values for this filter type AFTER the change. */
  values: string[];
}

export interface PhotoInitiatedEvent extends BaseEvent {
  type: 'photo_initiated';
  sku: string;
  /**
   * The 6-char code shown to the user that they dictate to the asesor.
   * Captured on every photo event so that when an asesor closes a sale we can
   * trace the code back to: which kiosk session, which SKU, which line, which
   * filters were applied. Optional because legacy events (pre-this-feature)
   * won't have it.
   */
  wishlistCode?: string;
}

export interface PhotoGeneratedEvent extends BaseEvent {
  type: 'photo_generated';
  sku: string;
  durationMs: number;
  attempts: number;
  wishlistCode?: string;
}

export interface PhotoFailedEvent extends BaseEvent {
  type: 'photo_failed';
  sku: string;
  errorCategory: ErrorCategory;
  durationMs: number;
  wishlistCode?: string;
}

export interface PhotoDownloadedEvent extends BaseEvent {
  type: 'photo_downloaded';
  sku: string;
  isAI: boolean;
  wishlistCode?: string;
}

export interface StyleGeneratedEvent extends BaseEvent {
  type: 'style_generated';
  styleId: string;
  sku: string;
  durationMs: number;
  success: boolean;
}

export interface StyleSelectedEvent extends BaseEvent {
  type: 'style_selected';
  styleId: string;
  sku: string;
}

export interface StyleDownloadedEvent extends BaseEvent {
  type: 'style_downloaded';
  styleId: string;
  sku: string;
  wishlistCode?: string;
}

export type AnalyticsEvent =
  | SessionStartedEvent
  | SessionEndedEvent
  | StateTransitionEvent
  | GarmentSelectedEvent
  | GarmentWishlistEvent
  | FilterAppliedEvent
  | PhotoInitiatedEvent
  | PhotoGeneratedEvent
  | PhotoFailedEvent
  | PhotoDownloadedEvent
  | StyleGeneratedEvent
  | StyleSelectedEvent
  | StyleDownloadedEvent;

export type AnalyticsEventType = AnalyticsEvent['type'];

/**
 * Generates a unique event id. Prefers crypto.randomUUID when available
 * (Chrome 92+, Safari 15.4+, Firefox 95+) — otherwise falls back to a
 * timestamp+random combo that's good enough for our scale.
 */
export function generateEventId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function generateSessionId(): string {
  return generateEventId();
}

/**
 * Maps a FASHN error message to one of our coarse categories. Used so the
 * analytics dashboard can show "X% PoseError, Y% timeout" without us having
 * to do regex parsing on the dashboard side.
 */
export function categorizeError(errorMessage: string | undefined): ErrorCategory {
  if (!errorMessage) return 'other';
  if (/pose/i.test(errorMessage)) return 'pose';
  if (/(nsfw|content|moderation)/i.test(errorMessage)) return 'content';
  if (/(timed.?out|timeout)/i.test(errorMessage)) return 'timeout';
  if (/(network|fetch|connection)/i.test(errorMessage)) return 'network';
  return 'other';
}
