import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Download,
  Trash2,
  BarChart3,
  TrendingUp,
  Users,
  Clock,
  Search,
  Lock,
} from 'lucide-react';
import { useAnalyticsStore } from '@/store/analytics';
import { useGarmentStore } from '@/store/garment';
import { downloadEventsCSV } from '@/lib/analytics-export';
import type { AnalyticsEvent } from '@/lib/analytics-events';

type TimeRange = 'all' | 'today' | 'week' | 'month';

const RANGE_TO_MS: Record<Exclude<TimeRange, 'all'>, number> = {
  today: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}min`;
}

function pct(num: number, denom: number): string {
  if (denom === 0) return '—';
  return `${((num / denom) * 100).toFixed(1)}%`;
}

interface BarRowProps {
  label: string;
  value: number;
  max: number;
  meta?: string;
}

function BarRow({ label, value, max, meta }: BarRowProps) {
  const widthPct = max === 0 ? 0 : Math.max(2, (value / max) * 100);
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="font-mono text-xs text-fg-muted w-32 truncate uppercase tracking-wider">
        {label}
      </span>
      <div className="flex-1 relative h-6 bg-surface rounded-sm overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-brand-red"
          style={{ width: `${widthPct}%` }}
        />
        <span className="absolute inset-0 flex items-center px-2 font-mono text-xs text-white">
          {value}
          {meta && <span className="ml-2 text-fg-muted">· {meta}</span>}
        </span>
      </div>
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
}

function KpiCard({ label, value, sub, icon }: KpiCardProps) {
  return (
    <div className="bg-surface border border-surface-hover p-5 clip-hud">
      <div className="flex items-start justify-between mb-2">
        <span className="font-mono text-xs text-fg-muted uppercase tracking-widest">
          {label}
        </span>
        <span className="text-accent-cyan">{icon}</span>
      </div>
      <div className="font-display text-4xl text-white">{value}</div>
      {sub && <div className="font-mono text-xs text-fg-muted mt-1">{sub}</div>}
    </div>
  );
}

/**
 * Renders a deliberately bland "not found" screen when the dashboard is
 * accessed without the ?admin=1 gate. We don't want to advertise that this
 * route exists to random kiosk visitors who happen to type in URLs, so the
 * page mimics a generic 404 rather than saying "permission denied".
 */
function NotAuthorized() {
  return (
    <div className="min-h-screen bg-bg text-fg flex flex-col items-center justify-center p-8">
      <Lock className="w-12 h-12 text-fg-muted/40 mb-4" />
      <h1 className="font-display text-3xl tracking-widest text-white uppercase">404</h1>
      <p className="font-mono text-xs text-fg-muted mt-2 tracking-widest uppercase">
        Página no encontrada
      </p>
    </div>
  );
}

/**
 * Public route wrapper that gates the actual dashboard behind ?admin=1.
 * Without the flag, we render a generic 404 — no hint that the dashboard
 * exists, no Reset button exposed, no event data leaked into the DOM.
 * Access via:  https://<host>/#/analytics?admin=1
 *
 * We do the gate at this layer (rather than inside AnalyticsDashboard) so the
 * dashboard's hooks (useMemo, useState) don't run for unauthorized visitors —
 * which also avoids the Rules-of-Hooks problem of an early-return-before-hooks.
 */
export function AnalyticsPage() {
  const [searchParams] = useSearchParams();
  const isAdmin = searchParams.get('admin') === '1';

  if (!isAdmin) {
    return <NotAuthorized />;
  }
  return <AnalyticsDashboard />;
}

function AnalyticsDashboard() {
  const events = useAnalyticsStore((s) => s.events);
  const clearAll = useAnalyticsStore((s) => s.clearAll);
  const catalog = useGarmentStore((s) => s.catalog);
  const [range, setRange] = useState<TimeRange>('all');
  const [codeSearch, setCodeSearch] = useState('');

  const filtered = useMemo<AnalyticsEvent[]>(() => {
    if (range === 'all') return events;
    const since = Date.now() - RANGE_TO_MS[range];
    return events.filter((e) => e.timestamp >= since);
  }, [events, range]);

  // ── Wishlist code ledger ────────────────────────────────────────────────
  // Builds a per-code record from photo_* events so the sales team can take a
  // code a customer dictates them and look up: which SKU/line, when it was
  // generated, whether the customer ended up downloading the photo (strongest
  // "I want to buy this" signal). One row per unique wishlist code.
  const codeLedger = useMemo(() => {
    type Record = {
      code: string;
      sku: string;
      timestamp: number;
      downloaded: boolean;
      generated: boolean;
      failed: boolean;
      sessionId: string;
    };
    const byCode = new Map<string, Record>();
    for (const e of filtered) {
      // Only photo events carry wishlistCode
      if (
        e.type !== 'photo_initiated' &&
        e.type !== 'photo_generated' &&
        e.type !== 'photo_failed' &&
        e.type !== 'photo_downloaded'
      )
        continue;
      const code = e.wishlistCode;
      if (!code) continue;
      const existing = byCode.get(code);
      if (!existing) {
        byCode.set(code, {
          code,
          sku: e.sku,
          timestamp: e.timestamp,
          downloaded: e.type === 'photo_downloaded',
          generated: e.type === 'photo_generated',
          failed: e.type === 'photo_failed',
          sessionId: e.sessionId,
        });
      } else {
        // Keep the earliest timestamp (when the code was first issued) but
        // OR-in the lifecycle flags.
        existing.timestamp = Math.min(existing.timestamp, e.timestamp);
        if (e.type === 'photo_downloaded') existing.downloaded = true;
        if (e.type === 'photo_generated') existing.generated = true;
        if (e.type === 'photo_failed') existing.failed = true;
      }
    }
    return Array.from(byCode.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [filtered]);

  // ── Aggregations ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const byType = new Map<string, number>();
    const garmentSelections = new Map<string, number>();
    const garmentWishlists = new Map<string, number>();
    const garmentPhotos = new Map<string, number>();
    const garmentDownloads = new Map<string, number>();
    const lineSelections = new Map<string, number>();
    const errorCategories = new Map<string, number>();
    const sessions = new Set<string>();
    const sessionDurations: number[] = [];
    const photoDurations: number[] = [];
    const filterValues = new Map<string, Map<string, number>>();

    const outcomes = { photo_downloaded: 0, photo_taken: 0, abandoned: 0, error: 0 };

    for (const e of filtered) {
      byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
      sessions.add(e.sessionId);

      if (e.type === 'garment_selected') {
        garmentSelections.set(e.sku, (garmentSelections.get(e.sku) ?? 0) + 1);
        lineSelections.set(e.line, (lineSelections.get(e.line) ?? 0) + 1);
      } else if (e.type === 'garment_wishlisted') {
        garmentWishlists.set(e.sku, (garmentWishlists.get(e.sku) ?? 0) + 1);
      } else if (e.type === 'photo_generated') {
        garmentPhotos.set(e.sku, (garmentPhotos.get(e.sku) ?? 0) + 1);
        photoDurations.push(e.durationMs);
      } else if (e.type === 'photo_downloaded') {
        garmentDownloads.set(e.sku, (garmentDownloads.get(e.sku) ?? 0) + 1);
      } else if (e.type === 'photo_failed') {
        errorCategories.set(
          e.errorCategory,
          (errorCategories.get(e.errorCategory) ?? 0) + 1,
        );
      } else if (e.type === 'session_ended') {
        sessionDurations.push(e.durationMs);
        outcomes[e.outcome] = (outcomes[e.outcome] ?? 0) + 1;
      } else if (e.type === 'filter_applied') {
        let m = filterValues.get(e.filterType);
        if (!m) {
          m = new Map();
          filterValues.set(e.filterType, m);
        }
        for (const v of e.values) {
          m.set(v, (m.get(v) ?? 0) + 1);
        }
      }
    }

    const photosInitiated = byType.get('photo_initiated') ?? 0;
    const photosGenerated = byType.get('photo_generated') ?? 0;
    const photosFailed = byType.get('photo_failed') ?? 0;
    const photosDownloaded = byType.get('photo_downloaded') ?? 0;

    const avgSessionMs =
      sessionDurations.length > 0
        ? sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length
        : 0;
    const avgPhotoMs =
      photoDurations.length > 0
        ? photoDurations.reduce((a, b) => a + b, 0) / photoDurations.length
        : 0;

    return {
      totalEvents: filtered.length,
      totalSessions: sessions.size,
      photosInitiated,
      photosGenerated,
      photosFailed,
      photosDownloaded,
      successRate: pct(photosGenerated, photosInitiated),
      avgSessionMs,
      avgPhotoMs,
      garmentSelections,
      garmentWishlists,
      garmentPhotos,
      garmentDownloads,
      lineSelections,
      errorCategories,
      outcomes,
      filterValues,
    };
  }, [filtered]);

  const skuToName = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of catalog) {
      m.set(g.sku, `${g.line} · ${g.name}`);
    }
    return m;
  }, [catalog]);

  const labelFor = (sku: string) => skuToName.get(sku) ?? sku;

  // Apply the search box filter on top of the date-range-filtered ledger.
  // Case-insensitive substring match across code AND sku so the sales team can
  // search by either dimension.
  const filteredCodeLedger = useMemo(() => {
    if (!codeSearch.trim()) return codeLedger;
    const q = codeSearch.trim().toLowerCase();
    return codeLedger.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        labelFor(r.sku).toLowerCase().includes(q),
    );
  }, [codeLedger, codeSearch, skuToName]); // eslint-disable-line react-hooks/exhaustive-deps

  const topBy = (
    map: Map<string, number>,
    n: number,
  ): { label: string; value: number }[] => {
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([sku, value]) => ({ label: labelFor(sku), value }));
  };

  const handleExport = () => {
    downloadEventsCSV(filtered);
  };

  const handleClear = () => {
    if (
      window.confirm(
        '¿Borrar TODOS los eventos de analytics? Esta acción no se puede deshacer.',
      )
    ) {
      clearAll();
    }
  };

  const maxSelections = Math.max(...Array.from(stats.garmentSelections.values()), 1);
  const maxWishlists = Math.max(...Array.from(stats.garmentWishlists.values()), 1);
  const maxDownloads = Math.max(...Array.from(stats.garmentDownloads.values()), 1);
  const maxLineSelections = Math.max(...Array.from(stats.lineSelections.values()), 1);

  return (
    <div className="min-h-screen bg-bg text-fg p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="font-display text-5xl tracking-widest text-white uppercase">
              Analytics
            </h1>
            <p className="font-mono text-xs text-fg-muted mt-1 tracking-widest uppercase">
              Patrones de uso · Perfil de visitantes
            </p>
          </div>
          <div className="flex items-center gap-3">
            {(['today', 'week', 'month', 'all'] as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`font-mono text-xs px-3 py-2 border tracking-widest uppercase transition-colors ${
                  range === r
                    ? 'border-accent-cyan text-accent-cyan bg-accent-cyan/10'
                    : 'border-surface-hover text-fg-muted hover:border-fg-muted hover:text-white'
                }`}
              >
                {r === 'today'
                  ? 'Hoy'
                  : r === 'week'
                    ? '7 días'
                    : r === 'month'
                      ? '30 días'
                      : 'Todo'}
              </button>
            ))}
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-brand-red text-white font-mono text-xs tracking-widest uppercase hover:brightness-110 clip-hud"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
            <button
              onClick={handleClear}
              className="flex items-center gap-2 px-4 py-2 border border-surface-hover text-fg-muted hover:text-brand-red hover:border-brand-red font-mono text-xs tracking-widest uppercase"
              title="Borrar todos los eventos"
            >
              <Trash2 className="w-4 h-4" />
              Reset
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <KpiCard
            label="Sesiones"
            value={String(stats.totalSessions)}
            icon={<Users className="w-5 h-5" />}
            sub={`${stats.totalEvents} eventos totales`}
          />
          <KpiCard
            label="Fotos generadas"
            value={String(stats.photosGenerated)}
            sub={`Tasa éxito: ${stats.successRate}`}
            icon={<BarChart3 className="w-5 h-5" />}
          />
          <KpiCard
            label="Descargas"
            value={String(stats.photosDownloaded)}
            sub={`${pct(stats.photosDownloaded, stats.photosGenerated)} de generadas`}
            icon={<TrendingUp className="w-5 h-5" />}
          />
          <KpiCard
            label="Duración prom. sesión"
            value={formatDuration(stats.avgSessionMs)}
            sub={`Foto AI prom.: ${formatDuration(stats.avgPhotoMs)}`}
            icon={<Clock className="w-5 h-5" />}
          />
        </div>

        {/* Funnel */}
        <div className="bg-surface border border-surface-hover p-6 mb-8 clip-hud">
          <h2 className="font-display text-2xl tracking-widest text-white uppercase mb-4">
            Funnel de conversión
          </h2>
          <div className="space-y-2">
            <BarRow
              label="Sesiones"
              value={stats.totalSessions}
              max={stats.totalSessions || 1}
            />
            <BarRow
              label="Foto iniciada"
              value={stats.photosInitiated}
              max={stats.totalSessions || 1}
              meta={pct(stats.photosInitiated, stats.totalSessions)}
            />
            <BarRow
              label="Foto generada"
              value={stats.photosGenerated}
              max={stats.totalSessions || 1}
              meta={pct(stats.photosGenerated, stats.totalSessions)}
            />
            <BarRow
              label="Foto descargada"
              value={stats.photosDownloaded}
              max={stats.totalSessions || 1}
              meta={pct(stats.photosDownloaded, stats.totalSessions)}
            />
          </div>
        </div>

        {/* Top garments: 3 columns side by side */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* Selecciones */}
          <div className="bg-surface border border-surface-hover p-6 clip-hud">
            <h3 className="font-display text-xl tracking-widest text-white uppercase mb-4">
              Top selecciones
            </h3>
            <div>
              {topBy(stats.garmentSelections, 10).map(({ label, value }) => (
                <BarRow key={label} label={label} value={value} max={maxSelections} />
              ))}
              {stats.garmentSelections.size === 0 && (
                <p className="font-mono text-xs text-fg-muted">Sin datos aún</p>
              )}
            </div>
          </div>

          {/* Wishlist */}
          <div className="bg-surface border border-surface-hover p-6 clip-hud">
            <h3 className="font-display text-xl tracking-widest text-white uppercase mb-4">
              Top wishlist ♥
            </h3>
            <div>
              {topBy(stats.garmentWishlists, 10).map(({ label, value }) => (
                <BarRow key={label} label={label} value={value} max={maxWishlists} />
              ))}
              {stats.garmentWishlists.size === 0 && (
                <p className="font-mono text-xs text-fg-muted">Sin datos aún</p>
              )}
            </div>
          </div>

          {/* Descargas */}
          <div className="bg-surface border border-surface-hover p-6 clip-hud">
            <h3 className="font-display text-xl tracking-widest text-white uppercase mb-4">
              Top descargas
            </h3>
            <div>
              {topBy(stats.garmentDownloads, 10).map(({ label, value }) => (
                <BarRow key={label} label={label} value={value} max={maxDownloads} />
              ))}
              {stats.garmentDownloads.size === 0 && (
                <p className="font-mono text-xs text-fg-muted">Sin datos aún</p>
              )}
            </div>
          </div>
        </div>

        {/* Lines + errors row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-surface border border-surface-hover p-6 clip-hud">
            <h3 className="font-display text-xl tracking-widest text-white uppercase mb-4">
              Líneas más elegidas
            </h3>
            <div>
              {Array.from(stats.lineSelections.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([line, value]) => (
                  <BarRow key={line} label={line} value={value} max={maxLineSelections} />
                ))}
              {stats.lineSelections.size === 0 && (
                <p className="font-mono text-xs text-fg-muted">Sin datos aún</p>
              )}
            </div>
          </div>

          <div className="bg-surface border border-surface-hover p-6 clip-hud">
            <h3 className="font-display text-xl tracking-widest text-white uppercase mb-4">
              Categoría de errores FASHN
            </h3>
            <div>
              {Array.from(stats.errorCategories.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([cat, value]) => (
                  <BarRow
                    key={cat}
                    label={cat}
                    value={value}
                    max={stats.photosFailed || 1}
                  />
                ))}
              {stats.errorCategories.size === 0 && (
                <p className="font-mono text-xs text-fg-muted">
                  Sin errores aún (buenas noticias)
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Filters used */}
        {stats.filterValues.size > 0 && (
          <div className="bg-surface border border-surface-hover p-6 mb-8 clip-hud">
            <h3 className="font-display text-xl tracking-widest text-white uppercase mb-4">
              Filtros aplicados
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {Array.from(stats.filterValues.entries()).map(([type, m]) => {
                const maxV = Math.max(...Array.from(m.values()), 1);
                return (
                  <div key={type}>
                    <h4 className="font-mono text-xs text-accent-cyan uppercase tracking-widest mb-2">
                      {type}
                    </h4>
                    {Array.from(m.entries())
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 8)
                      .map(([value, count]) => (
                        <BarRow key={value} label={value} value={count} max={maxV} />
                      ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Wishlist code ledger — for sales-side reconciliation */}
        <div className="bg-surface border border-surface-hover p-6 mb-8 clip-hud">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h2 className="font-display text-2xl tracking-widest text-white uppercase">
                Códigos de wishlist
              </h2>
              <p className="font-mono text-xs text-fg-muted mt-1">
                Match con asesores: buscá el código que te dictó el cliente para ver qué
                prenda eligió
              </p>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
              <input
                type="text"
                value={codeSearch}
                onChange={(e) => setCodeSearch(e.target.value.toUpperCase())}
                placeholder="Buscar código o SKU…"
                className="bg-bg border border-surface-hover pl-9 pr-3 py-2 font-mono text-sm text-white placeholder:text-fg-muted/50 focus:outline-none focus:border-accent-cyan w-64 uppercase tracking-widest"
              />
            </div>
          </div>

          {filteredCodeLedger.length === 0 ? (
            <p className="font-mono text-xs text-fg-muted py-6 text-center">
              {codeSearch
                ? `Ningún código coincide con "${codeSearch}"`
                : 'Sin códigos generados todavía'}
            </p>
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm font-mono">
                <thead>
                  <tr className="text-fg-muted uppercase text-xs tracking-widest border-b border-surface-hover">
                    <th className="text-left py-2 px-3">Código</th>
                    <th className="text-left py-2 px-3">Prenda</th>
                    <th className="text-left py-2 px-3">SKU</th>
                    <th className="text-left py-2 px-3">Fecha</th>
                    <th className="text-center py-2 px-3">Generada</th>
                    <th className="text-center py-2 px-3">Descargada</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCodeLedger.slice(0, 200).map((r) => (
                    <tr
                      key={r.code + r.sessionId}
                      className="border-b border-surface-hover/30 hover:bg-bg/40"
                    >
                      <td className="py-2 px-3 text-brand-red font-bold tracking-widest">
                        {r.code}
                      </td>
                      <td className="py-2 px-3 text-white">{labelFor(r.sku)}</td>
                      <td className="py-2 px-3 text-fg-muted text-xs">{r.sku}</td>
                      <td className="py-2 px-3 text-fg-muted text-xs">
                        {new Date(r.timestamp).toLocaleString('es-EC', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {r.generated ? (
                          <span className="text-accent-cyan">✓</span>
                        ) : r.failed ? (
                          <span className="text-brand-red">✗</span>
                        ) : (
                          <span className="text-fg-muted/30">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {r.downloaded ? (
                          <span className="text-accent-cyan">✓</span>
                        ) : (
                          <span className="text-fg-muted/30">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredCodeLedger.length > 200 && (
                <p className="font-mono text-xs text-fg-muted mt-3 text-center">
                  Mostrando los 200 más recientes de {filteredCodeLedger.length} — exportá
                  a CSV para ver todo
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer note */}
        <p className="font-mono text-xs text-fg-muted/50 mt-12 text-center tracking-wider">
          Los datos se almacenan localmente en este navegador · Exportá a CSV para
          análisis externo
        </p>
      </div>
    </div>
  );
}
