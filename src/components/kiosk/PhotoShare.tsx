import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2 } from 'lucide-react';
import { useKioskStore } from '@/store/kiosk';
import { usePhotoStore } from '@/store/photo';
import { useAnalyticsStore } from '@/store/analytics';
import { cancelStylizeRequests } from '@/lib/ai-stylize-client';
import { STYLE_CATALOG } from '@/lib/style-catalog';

export function PhotoShare() {
  const { t } = useTranslation();
  const transition = useKioskStore((s) => s.transition);
  const kioskState = useKioskStore((s) => s.state);

  const photoComposed = usePhotoStore((s) => s.currentPhotoComposed);
  const wishlistCode = usePhotoStore((s) => s.currentWishlistCode);
  const aiGeneratedUrl = usePhotoStore((s) => s.aiGeneratedUrl);
  const aiDurationMs = usePhotoStore((s) => s.aiDurationMs);
  const stylizedImages = usePhotoStore((s) => s.stylizedImages);

  const [selectedStyleId, setSelectedStyleId] = useState<string>('original');

  const selectedStyleImg = stylizedImages.find((img) => img.styleId === selectedStyleId);
  const displayImage =
    selectedStyleId !== 'original' && selectedStyleImg?.url
      ? selectedStyleImg.url
      : (aiGeneratedUrl ?? photoComposed);

  const qrUrl = displayImage && /^https?:\/\//.test(displayImage) ? displayImage : null;

  const showThumbnails =
    stylizedImages &&
    stylizedImages.some((img) => img.status === 'success' || img.status === 'pending');

  // Auto-timeout
  useEffect(() => {
    const timer = setTimeout(() => {
      cancelStylizeRequests();
      transition('ATTRACT');
    }, 60000);
    return () => clearTimeout(timer);
  }, [transition]);

  if (!displayImage) {
    return null;
  }

  const handleSelectStyle = (styleId: string) => {
    setSelectedStyleId(styleId);
    if (styleId !== 'original') {
      const currentSku = usePhotoStore.getState().currentGarmentSku;
      if (currentSku) {
        useAnalyticsStore.getState().track({
          type: 'style_selected',
          styleId,
          sku: currentSku,
        });
      }
    }
  };

  const handleDownload = () => {
    // Analytics: download is the strongest "I love this look" signal.
    const currentSku = usePhotoStore.getState().currentGarmentSku;

    if (selectedStyleId !== 'original') {
      if (currentSku) {
        useAnalyticsStore.getState().track({
          type: 'style_downloaded',
          styleId: selectedStyleId,
          sku: currentSku,
          wishlistCode: wishlistCode || undefined,
        });
      }
    } else {
      if (currentSku) {
        useAnalyticsStore.getState().track({
          type: 'photo_downloaded',
          sku: currentSku,
          isAI: kioskState === 'SHARE_QR' && !!aiGeneratedUrl,
          wishlistCode: wishlistCode || undefined,
        });
      }
    }

    const a = document.createElement('a');
    a.href = displayImage;
    if (selectedStyleId === 'original') {
      a.download = `suzuki-look-${wishlistCode}.jpg`;
    } else {
      a.download = `suzuki-look-${wishlistCode}-${selectedStyleId}.jpg`;
    }
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="absolute inset-0 z-50 bg-bg text-fg flex flex-col">
      {/* Top Section: Photo & Thumbnails Rail */}
      <div className="flex-1 w-full flex flex-col items-center justify-center p-6 bg-black gap-4 relative min-h-0">
        <div
          className={`relative flex-1 aspect-square ${
            showThumbnails ? 'max-h-[70%]' : 'max-h-[85%]'
          } border border-accent-cyan/50 p-2 clip-hud`}
        >
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
          {aiDurationMs && selectedStyleId === 'original' && (
            <div className="absolute bottom-4 left-4 bg-black/70 text-white font-mono text-xs px-2 py-1 rounded border border-white/20">
              ⏱ {(aiDurationMs / 1000).toFixed(1)}s
            </div>
          )}
        </div>

        {/* Thumbnails rail */}
        {showThumbnails && (
          <div className="flex gap-4 justify-center items-center py-2 z-10 w-full shrink-0">
            {/* Original Look */}
            <button
              onClick={() => handleSelectStyle('original')}
              className={`relative w-16 h-16 border transition-all duration-200 clip-hud overflow-hidden bg-surface flex flex-col items-center justify-center shrink-0 ${
                selectedStyleId === 'original'
                  ? 'border-accent-cyan shadow-[0_0_10px_rgba(0,255,244,0.4)] scale-105'
                  : 'border-white/20 hover:border-white/50 hover:scale-102'
              }`}
            >
              <img
                src={aiGeneratedUrl ?? photoComposed ?? ''}
                alt="Original"
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] font-mono text-center text-white py-0.5 uppercase tracking-wider">
                Original
              </div>
            </button>

            {/* Stylized Options */}
            {STYLE_CATALOG.map((catItem) => {
              const styleImg = stylizedImages.find((img) => img.styleId === catItem.id);
              if (!styleImg || styleImg.status === 'error') return null;

              const isPending = styleImg.status === 'pending';
              const isSelected = selectedStyleId === catItem.id;

              return (
                <button
                  key={catItem.id}
                  disabled={isPending}
                  onClick={() => handleSelectStyle(catItem.id)}
                  className={`relative w-16 h-16 border transition-all duration-200 clip-hud overflow-hidden bg-surface flex flex-col items-center justify-center shrink-0 ${
                    isPending ? 'opacity-70 cursor-wait border-white/10' : ''
                  } ${
                    isSelected
                      ? 'border-accent-cyan shadow-[0_0_10px_rgba(0,255,244,0.4)] scale-105'
                      : 'border-white/20 hover:border-white/50 hover:scale-102'
                  }`}
                >
                  {isPending ? (
                    <div className="flex items-center justify-center w-full h-full">
                      <Loader2 className="w-5 h-5 text-accent-cyan animate-spin" />
                    </div>
                  ) : (
                    <img
                      src={styleImg.url ?? ''}
                      alt={catItem.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] font-mono text-center text-white py-0.5 uppercase tracking-wider truncate px-0.5">
                    {catItem.name}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Section: Controls */}
      <div className="w-full flex flex-col items-center justify-center p-8 gap-6 bg-surface border-t border-white/5 shrink-0">
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
                  onClick={() => {
                    cancelStylizeRequests();
                    transition('TRYON');
                  }}
                  className="flex-1 py-3 bg-surface-3 text-white font-display text-lg tracking-wide border border-white/10 hover:bg-surface-4 active:scale-95 transition-all"
                >
                  {t('photo.share.again', 'OTRA PRENDA')}
                </button>
                <button
                  onClick={() => {
                    cancelStylizeRequests();
                    transition('ATTRACT');
                  }}
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
