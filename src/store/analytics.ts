import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  type AnalyticsEvent,
  type AnalyticsEventType,
  type SessionOutcome,
  generateEventId,
  generateSessionId,
} from '@/lib/analytics-events';

/**
 * Maximum number of events to keep in localStorage. At ~150 bytes per event,
 * 20k events = ~3 MB which leaves headroom under the typical 5 MB cap.
 * Older events are pruned in FIFO order when this limit is reached.
 */
const MAX_EVENTS = 20_000;

/**
 * Events older than this are pruned on store load. Keeps the dataset focused
 * on recent activity (the last few weeks of events at a kiosk).
 */
const MAX_EVENT_AGE_DAYS = 90;

interface AnalyticsStore {
  events: AnalyticsEvent[];
  currentSessionId: string | null;
  /** Captures when the current session started so session_ended can compute duration. */
  sessionStartTime: number | null;

  /**
   * Records a new event. Auto-fills id, timestamp and the current sessionId
   * (if one is active). Caller only needs to provide the type-specific fields.
   */
  track: (
    event: {
      [K in AnalyticsEvent as K['type']]: Omit<K, 'id' | 'timestamp' | 'sessionId'> & {
        sessionId?: string;
      };
    }[AnalyticsEvent['type']],
  ) => void;

  /** Starts a new session and emits a session_started event. */
  startSession: () => string;

  /** Ends the current session, emitting session_ended with the duration and outcome. */
  endSession: (outcome: SessionOutcome) => void;

  /** Removes all events. Intended for the admin UI; not user-facing. */
  clearAll: () => void;

  /** Returns events filtered by type and/or session for dashboard queries. */
  query: (filter?: {
    type?: AnalyticsEventType;
    sessionId?: string;
    sinceTs?: number;
  }) => AnalyticsEvent[];
}

export const useAnalyticsStore = create<AnalyticsStore>()(
  persist(
    (set, get) => ({
      events: [],
      currentSessionId: null,
      sessionStartTime: null,

      track: (partial) => {
        const sessionId = partial.sessionId ?? get().currentSessionId ?? 'no-session';
        const event = {
          ...partial,
          id: generateEventId(),
          timestamp: Date.now(),
          sessionId,
        } as AnalyticsEvent;

        const events = [...get().events, event];
        // FIFO prune if we crossed the cap
        if (events.length > MAX_EVENTS) {
          events.splice(0, events.length - MAX_EVENTS);
        }
        set({ events });
      },

      startSession: () => {
        const sessionId = generateSessionId();
        const now = Date.now();
        set({ currentSessionId: sessionId, sessionStartTime: now });
        get().track({ type: 'session_started', sessionId });
        return sessionId;
      },

      endSession: (outcome) => {
        const { currentSessionId, sessionStartTime } = get();
        if (!currentSessionId || sessionStartTime === null) return;
        const durationMs = Date.now() - sessionStartTime;
        get().track({
          type: 'session_ended',
          sessionId: currentSessionId,
          durationMs,
          outcome,
        });
        set({ currentSessionId: null, sessionStartTime: null });
      },

      clearAll: () => {
        // Also wipe the kiosk state from sessionStorage. If we don't, the kiosk
        // store rehydrates into whatever mid-flow state it was in (TRYON, etc.)
        // and its transition() logic fires startSession() again — inflating the
        // session count and photo counters even though events[] is empty.
        try {
          sessionStorage.removeItem('suzuki-ar-kiosk');
        } catch {
          // Ignore storage errors
        }
        set({ events: [], currentSessionId: null, sessionStartTime: null });
      },

      query: (filter) => {
        let events = get().events;
        if (filter?.type) {
          events = events.filter((e) => e.type === filter.type);
        }
        if (filter?.sessionId) {
          events = events.filter((e) => e.sessionId === filter.sessionId);
        }
        if (filter?.sinceTs !== undefined) {
          const since = filter.sinceTs;
          events = events.filter((e) => e.timestamp >= since);
        }
        return events;
      },
    }),
    {
      name: 'suzuki-ar-analytics',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ events: state.events }),
      onRehydrateStorage: () => (state) => {
        // Prune events older than MAX_EVENT_AGE_DAYS on app load
        if (!state) return;
        const cutoff = Date.now() - MAX_EVENT_AGE_DAYS * 24 * 60 * 60 * 1000;
        state.events = state.events.filter((e) => e.timestamp >= cutoff);
      },
    },
  ),
);
