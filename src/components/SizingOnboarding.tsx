import { useState } from 'react';
import { useSizingStore } from '../store/sizing';

export function SizingOnboardingModal() {
  const { hasProfile, setProfile } = useSizingStore();
  const [talla, setTalla] = useState<string | null>(null);
  const [fit, setFit] = useState<'ajustado' | 'regular' | 'holgado'>('regular');
  const [submitting, setSubmitting] = useState(false);

  if (hasProfile) return null;

  const handleSubmit = async () => {
    if (!talla) return;
    setSubmitting(true);
    await setProfile(talla, fit);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-2xl w-full text-white shadow-2xl relative overflow-hidden">
        {/* Decoración superior */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-blue-500 to-cyan-400"></div>

        <h2 className="text-4xl font-black mb-8 text-center mt-4">
          Personaliza tu Prueba
        </h2>

        <div className="space-y-8">
          <div>
            <h3 className="text-xl font-bold mb-4">¿Qué talla usas normalmente?</h3>
            <div className="flex flex-wrap gap-3">
              {['XS', 'S', 'M', 'L', 'XL', 'No sé'].map((s) => (
                <button
                  key={s}
                  onClick={() => setTalla(s)}
                  className={`flex-1 min-w-[80px] py-4 rounded-xl border-2 font-bold transition-all text-lg
                    ${
                      talla === s
                        ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)] scale-105'
                        : 'border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:bg-zinc-800'
                    }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xl font-bold mb-4">
              ¿Cómo prefieres que te quede la ropa?
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'ajustado', label: 'Ajustado' },
                { id: 'regular', label: 'Regular' },
                { id: 'holgado', label: 'Holgado' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFit(f.id as 'ajustado' | 'regular' | 'holgado')}
                  className={`py-4 rounded-xl border-2 font-bold transition-all text-lg
                    ${
                      fit === f.id
                        ? 'bg-cyan-600 border-cyan-500 text-white shadow-[0_0_15px_rgba(8,145,178,0.5)] scale-105'
                        : 'border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:bg-zinc-800'
                    }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10">
          <button
            onClick={handleSubmit}
            disabled={!talla || submitting}
            className="w-full py-5 rounded-2xl bg-white text-black text-2xl font-black uppercase tracking-widest hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:bg-zinc-700 disabled:text-zinc-500"
          >
            {submitting ? 'Iniciando...' : 'Comenzar'}
          </button>
        </div>

        <p className="text-center text-zinc-500 text-sm mt-6">
          Tus datos son 100% anónimos.
        </p>
      </div>
    </div>
  );
}
