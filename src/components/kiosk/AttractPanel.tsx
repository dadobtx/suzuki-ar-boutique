import { useState, useEffect, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useGarmentStore } from '@/store/garment';
import { buildShowcaseSlides } from './showcase/buildShowcaseSlides';
import { ShowcaseSlide } from './showcase/ShowcaseSlide';
import { ShowcaseSummary } from './showcase/ShowcaseSummary';
import { ShowcaseProgress } from './showcase/ShowcaseProgress';

const SLIDE_MS = 5500;

export function AttractPanel() {
  const catalog = useGarmentStore((s) => s.catalog);
  const slides = useMemo(() => buildShowcaseSlides(catalog), [catalog]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Safety clamp if slides length changes
  const activeIndex = slides.length > 0 ? currentIndex % slides.length : 0;

  // Preload next slide images
  useEffect(() => {
    if (slides.length <= 1) return;
    const nextIdx = (activeIndex + 1) % slides.length;
    const nextSlide = slides[nextIdx];
    if (!nextSlide) return;

    const urlsToPreload: string[] = [];
    if (nextSlide.kind === 'garment') {
      urlsToPreload.push(...nextSlide.illustrations);
      nextSlide.photos.forEach((p) => {
        if (p.thumb) urlsToPreload.push(p.thumb);
      });
    } else if (nextSlide.kind === 'summary') {
      urlsToPreload.push(...nextSlide.illustrations);
    }

    urlsToPreload.forEach((url) => {
      try {
        const img = new Image();
        img.src = url;
        img.decode?.().catch(() => {});
      } catch {
        // Ignore preload errors
      }
    });
  }, [activeIndex, slides]);

  // Timer orchestration with document visibility check
  useEffect(() => {
    if (slides.length <= 1) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const startTimer = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (!document.hidden) {
          setCurrentIndex((prev) => (prev + 1) % slides.length);
        }
      }, SLIDE_MS);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      } else {
        startTimer();
      }
    };

    startTimer();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [slides.length]);

  if (slides.length === 0) {
    return null;
  }

  const currentSlide = slides[activeIndex];
  if (!currentSlide) {
    return null;
  }

  return (
    <section
      role="region"
      aria-roledescription="carrusel"
      aria-label="Colección Suzuki"
      className="relative w-full h-full bg-surface text-fg select-none overflow-hidden"
    >
      {/* Active Slide Stage (Crossfade via AnimatePresence without mode='wait') */}
      <div className="absolute inset-0 w-full h-full">
        <AnimatePresence>
          {currentSlide.kind === 'garment' ? (
            <ShowcaseSlide
              key={`slide-${currentSlide.garment.id}-${activeIndex}`}
              slide={currentSlide}
            />
          ) : (
            <ShowcaseSummary key={`slide-summary-${activeIndex}`} slide={currentSlide} />
          )}
        </AnimatePresence>
      </div>

      {/* Segmented Progress Bar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 w-full max-w-md px-6 flex justify-center pointer-events-none">
        <ShowcaseProgress
          total={slides.length}
          currentIndex={activeIndex}
          slideDurationMs={SLIDE_MS}
        />
      </div>
    </section>
  );
}
