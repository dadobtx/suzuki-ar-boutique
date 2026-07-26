import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BarChart3, Activity, Star } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_AI_BACKEND_URL || 'http://localhost:8787';

interface ReportsData {
  ranking: { sku: string; talla_elegida: string; count: number }[];
  distribucion: { sku: string; pecho_ar: number; cintura_ar: number }[];
  favoritos: { sku: string; count: number }[];
  calibracion: {
    tabla_origen_id: string;
    talla_elegida: string;
    avg_pecho: number;
    avg_cintura: number;
    count: number;
  }[];
  live?: {
    sesiones_hoy: number;
    segundos_hoy: number;
    costo_estimado_usd: number;
  };
}

export function KioskReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Basic hardcoded token for now, would typically come from login/auth context
    const token = 'suzuki-kiosk-2026';
    fetch(`${BACKEND_URL}/kiosk/reports?token=${token}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.status === 'success') {
          setData(res);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white">
        Cargando reportes...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-red-500">
        Error al cargar reportes.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link
            to="/"
            className="p-2 bg-white dark:bg-zinc-900 rounded-full shadow hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <ArrowLeft size={24} />
          </Link>
          <h1 className="text-4xl font-bold">Panel de Compras (Kiosko)</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Demanda Ranking */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <BarChart3 className="text-blue-500" /> Demanda por Talla
            </h2>
            {data.ranking.length === 0 ? (
              <p className="text-zinc-500">No hay datos suficientes.</p>
            ) : (
              <ul className="space-y-4">
                {data.ranking.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-800 p-3 rounded-lg"
                  >
                    <div>
                      <span className="font-bold">{item.sku}</span>
                      <span className="ml-2 text-zinc-500 text-sm">
                        Talla: {item.talla_elegida}
                      </span>
                    </div>
                    <div className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 font-bold px-3 py-1 rounded-full text-sm">
                      {item.count} pruebas
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Favoritos */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Star className="text-yellow-500" /> Top Favoritos
            </h2>
            {data.favoritos.length === 0 ? (
              <p className="text-zinc-500">No hay datos suficientes.</p>
            ) : (
              <ul className="space-y-4">
                {data.favoritos.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-800 p-3 rounded-lg"
                  >
                    <span className="font-bold">{item.sku}</span>
                    <div className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 font-bold px-3 py-1 rounded-full text-sm flex items-center gap-1">
                      <Star size={14} fill="currentColor" /> {item.count}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Calibración */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 md:col-span-2">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Activity className="text-green-500" /> Calibración AR vs Talla Elegida
              (Confianza &gt; 80%)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="p-3 rounded-tl-lg">Tabla Origen</th>
                    <th className="p-3">Talla Elegida</th>
                    <th className="p-3">Promedio Pecho AR (cm)</th>
                    <th className="p-3">Promedio Cintura AR (cm)</th>
                    <th className="p-3 rounded-tr-lg">Muestra</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {data.calibracion.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-zinc-500">
                        No hay datos de AR validados.
                      </td>
                    </tr>
                  )}
                  {data.calibracion.map((item, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <td className="p-3 font-medium">{item.tabla_origen_id}</td>
                      <td className="p-3 font-bold">{item.talla_elegida}</td>
                      <td className="p-3">{Math.round(item.avg_pecho * 10) / 10}</td>
                      <td className="p-3">{Math.round(item.avg_cintura * 10) / 10}</td>
                      <td className="p-3">{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Live Try-On Stats */}
          {data.live && (
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 md:col-span-2">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <Activity className="text-purple-500" /> Pruebas en Vivo (Hoy)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-zinc-50 dark:bg-zinc-800 p-4 rounded-lg text-center">
                  <p className="text-sm text-zinc-500 uppercase tracking-wider mb-1">
                    Sesiones
                  </p>
                  <p className="text-3xl font-bold">{data.live.sesiones_hoy}</p>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800 p-4 rounded-lg text-center">
                  <p className="text-sm text-zinc-500 uppercase tracking-wider mb-1">
                    Tiempo (seg)
                  </p>
                  <p className="text-3xl font-bold">{data.live.segundos_hoy}</p>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800 p-4 rounded-lg text-center">
                  <p className="text-sm text-zinc-500 uppercase tracking-wider mb-1">
                    Costo Est. USD
                  </p>
                  <p className="text-3xl font-bold text-red-500">
                    ${data.live.costo_estimado_usd.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
