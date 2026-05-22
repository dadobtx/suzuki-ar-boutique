import type { AnalyticsEvent } from './analytics-events';

/**
 * Converts a list of analytics events to CSV. The output is one row per event
 * with a uniform set of columns; type-specific fields go into a single JSON
 * blob column so the schema doesn't explode as we add new event types.
 *
 * Excel and Google Sheets both handle this format fine: the type column lets
 * the analyst filter to one event type at a time, and the json_data column
 * can be expanded via formulas or Power Query if needed.
 */
export function eventsToCSV(events: AnalyticsEvent[]): string {
  const headers = [
    'id',
    'timestamp_ms',
    'timestamp_iso',
    'session_id',
    'type',
    // Most-used dimensions promoted to top-level columns for convenience.
    'sku',
    'line',
    'category',
    // The wishlist code shown to the user is the master key the asesor uses
    // when closing a sale. Promote it to a top-level column so the sales team
    // can VLOOKUP from their CRM against this CSV.
    'wishlist_code',
    'error_category',
    'outcome',
    'duration_ms',
    'attempts',
    'is_ai',
    'filter_type',
    'filter_values',
    'from_state',
    'to_state',
    'duration_in_prev_ms',
    'raw_json',
  ];

  const rows = events.map((e) => {
    const ev = e as AnalyticsEvent & Record<string, unknown>;
    const get = (k: string): string => {
      const v = ev[k];
      if (v === undefined || v === null) return '';
      if (Array.isArray(v)) return v.join('|');
      return String(v);
    };

    return [
      e.id,
      e.timestamp,
      new Date(e.timestamp).toISOString(),
      e.sessionId,
      e.type,
      get('sku'),
      get('line'),
      get('category'),
      get('wishlistCode'),
      get('errorCategory'),
      get('outcome'),
      get('durationMs'),
      get('attempts'),
      get('isAI'),
      get('filterType'),
      get('values'),
      get('from'),
      get('to'),
      get('durationInPrevMs'),
      JSON.stringify(e).replace(/"/g, '""'),
    ];
  });

  const escape = (cell: unknown): string => {
    const str = String(cell ?? '');
    // Escape if it contains comma, quote, or newline
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvLines = [headers, ...rows].map((row) => row.map(escape).join(','));
  return csvLines.join('\n');
}

/**
 * Triggers a browser download of the events as a CSV file.
 * Filename includes the current date so multiple exports don't overwrite.
 */
export function downloadEventsCSV(events: AnalyticsEvent[], filename?: string): void {
  const csv = eventsToCSV(events);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const datestamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `suzuki-analytics-${datestamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
