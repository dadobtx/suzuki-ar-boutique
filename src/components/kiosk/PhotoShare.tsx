import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { useKioskStore } from '@/store/kiosk';
import { usePhotoStore } from '@/store/photo';
import { useAnalyticsStore } from '@/store/analytics';

export function PhotoShare() {
  const { t } = useTranslation();
  const transition = useKioskStore((s) => s.transition);
  const kioskState = useKioskStore((s) => s.state);

  const photoComposed = usePhotoStore((s) => s.currentPhotoComposed);
  const wishlistCode = usePhotoStore((s) => s.currentWishlistCode);
  const aiGeneratedUrl = usePhotoStore((s) => s.aiGeneratedUrl);
  const aiDurationMs = usePhotoStore((s) => s.aiDurationMs);

  const displayImage = aiGeneratedUrl ?? photoComposed;
  const qrUrl =
    aiGeneratedUrl && /^https?:\/\//.test(aiGeneratedUrl) ? aiGeneratedUrl : null;

  // Auto-timeout
  useEffect(() => {
    const timer = setTimeout(() => {
      transition('ATTRACT');
    }, 60000);
    return () => clearTimeout(timer);
  }, [transition]);

  if (!displayImage) {
    return null;
  }

  const handleDownload = () => {
    // Analytics: download is the strongest "I love this look" signal.
    // Track whether they downloaded the real AI-generated photo or the
    // local demo composite (different conversion meaning).
    const currentSku = usePhotoStore.getState().currentGarmentSku;
    if (currentSku) {
      useAnalyticsStore.getState().track({
        type: 'photo_downloaded',
        sku: currentSku,
        isAI: kioskState === 'SHARE_QR' && !!aiGeneratedUrl,
        wishlistCode: wishlistCode || undefined,
      });
    }

    const a = document.createElement('a');
    a.href = displayImage;
    a.download = `suzuki-look-${wishlistCode}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="absolute inset-0 z-50 bg-bg text-fg flex flex-col">
      {/* Top 60%: Photo */}
      <div className="h-[60%] w-full flex items-center justify-center p-8 bg-black relative">
        <div className="relative h-full aspect-square border border-accent-cyan/50 p-2 clip-hud">
          <img
            src={displayImage}
            alt="Tu look"
            className="w-full h-full object-cover"
            onError={(e) => {
              // If the FASHN URL expired or the blob was revoked, hide the
              // broken image and show a friendly placeholder instead.
              const target = e.currentTarget;
              target.style.display = 'none';
              const placeholder = target.nextElementSibling as HTMLElement | null;
              if (placeholder) placeholder.style.display = 'flex';
            }}
          />
          {/* Shown only when the img fails to load */}
          <div
            className="hidden w-full h-full items-center justify-center flex-col gap-3 bg-surface"
            style={{ display: 'none' }}
          >
            <span className="text-fg-muted/40 text-6xl">📷</span>
            <p className="font-mono text-xs text-fg-muted uppercase tracking-widest text-center px-4">
              Imagen no disponible
              <br />
              La foto generada expiró · descargala antes de cerrar
            </p>
          </div>
          {kioskState === 'SHARE_QR_FALLBACK' && (
            <div className="absolute top-4 left-4 bg-black/70 text-white font-mono text-xs px-2 py-1 rounded border border-white/20">
              {t('photo.share.fallback_badge', 'VISTA PREVIA DEMO')}
            </div>
          )}
          {aiDurationMs && (
            <div className="absolute bottom-4 left-4 bg-black/70 text-white font-mono text-xs px-2 py-1 rounded border border-white/20">
              ⏱ {(aiDurationMs / 1000).toFixed(1)}s
            </div>
          )}
        </div>
      </div>

      {/* Bottom 40%: Controls */}
      <div className="h-[40%] w-full flex flex-col items-center justify-center p-8 gap-6 bg-surface">
        <div className="text-center">
          <h2 className="font-display text-4xl text-white mb-2 tracking-wide">
            {t('photo.share.title', 'TU LOOK ESTÁ LISTO')}
          </h2>
          <p className="font-mono text-sm text-fg-muted">
            {qrUrl
              ? t('photo.share.subtitle', 'Escaneá el QR para llevártela al móvil')
              : t(
                  'photo.share.subtitleFallback',
                  'Vista previa demo · escaneá QR no disponible',
                )}
          </p>
        </div>

        <div className="flex items-center gap-12">
          {/* QR Code */}
          <div className="bg-white p-4 rounded-lg shadow-[0_0_20px_rgba(230,0,18,0.3)] w-[192px] h-[192px] flex items-center justify-center">
            {qrUrl ? (
              <QRCodeSVG
                value={qrUrl}
                size={160}
                level="H"
                fgColor="#E60012"
                bgColor="#ffffff"
              />
            ) : (
              <div className="text-center text-fg-muted p-2">
                <p className="font-mono text-xs mb-2 text-brand-red">
                  {t('photo.share.noQrFallback', 'QR no disponible en modo demo')}
                </p>
                <p className="font-mono text-[10px]">
                  {t('photo.share.useDownload', 'Usá el botón Descargar')}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="bg-surface-2 p-4 border border-white/10 text-center">
              <div className="font-mono text-4xl text-brand-red tracking-widest font-bold">
                {wishlistCode}
              </div>
              <div className="font-mono text-[10px] text-fg-muted mt-2 uppercase">
                {t('photo.share.wishlistHint', 'Código wishlist · dictalo al asesor')}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleDownload}
                className="w-full py-3 bg-brand-red text-white font-display text-xl tracking-widest clip-hud hover:brightness-110 active:scale-95 transition-all"
              >
                {t('photo.share.download', 'DESCARGAR PNG')}
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => transition('TRYON')}
                  className="flex-1 py-3 bg-surface-3 text-white font-display text-lg tracking-wide border border-white/10 hover:bg-surface-4 active:scale-95 transition-all"
                >
                  {t('photo.share.again', 'OTRA PRENDA')}
                </button>
                <button
                  onClick={() => transition('ATTRACT')}
                  className="flex-1 py-3 bg-surface-3 text-white font-display text-lg tracking-wide border border-white/10 hover:bg-surface-4 active:scale-95 transition-all"
                >
                  {t('photo.share.finish', 'FINALIZAR')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
