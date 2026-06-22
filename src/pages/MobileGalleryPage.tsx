import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function MobileGalleryPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlsParam = params.get('urls');
    if (urlsParam) {
      setUrls(urlsParam.split(',').filter(Boolean));
    }
  }, [location]);

  const handleDownload = async (url: string, index: number) => {
    try {
      // On mobile, cross-origin downloads often open the image instead of saving.
      // We try to fetch the blob to force a download.
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `suzuki-look-${index + 1}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Fallback: open in new tab
      window.open(url, '_blank');
    }
  };

  return (
    <div className="min-h-screen bg-bg text-fg pb-12">
      {/* Header */}
      <div className="bg-surface border-b border-white/5 p-4 sticky top-0 z-10 shadow-md flex items-center justify-center">
        <h1 className="font-display text-xl tracking-widest text-white uppercase text-center">
          {t('gallery.title', 'TU SESIÓN SUZUKI')}
        </h1>
      </div>

      <div className="p-4 space-y-8 max-w-lg mx-auto mt-4">
        {urls.length === 0 ? (
          <div className="text-center text-fg-muted font-mono mt-12">
            No se encontraron imágenes en el enlace.
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <p className="font-mono text-sm text-fg-muted">
                {t(
                  'gallery.instruction',
                  'Mantén presionada la imagen para guardarla en tu dispositivo, o usa el botón descargar.',
                )}
              </p>
            </div>

            {urls.map((url, i) => (
              <div
                key={i}
                className="bg-surface border border-white/10 rounded-lg overflow-hidden shadow-lg"
              >
                <img
                  src={url}
                  alt={`Look ${i + 1}`}
                  className="w-full h-auto object-cover"
                />
                <div className="p-4 flex justify-between items-center bg-zinc-900">
                  <span className="font-mono text-xs text-fg-muted uppercase">
                    {i === 0 ? 'Look Original' : `Estilo Alternativo ${i}`}
                  </span>
                  <button
                    onClick={() => handleDownload(url, i)}
                    className="flex items-center gap-2 bg-brand-red text-white px-4 py-2 rounded font-bold text-sm hover:bg-brand-red/80 active:scale-95 transition-all"
                  >
                    <Download size={16} />
                    <span>Descargar</span>
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
