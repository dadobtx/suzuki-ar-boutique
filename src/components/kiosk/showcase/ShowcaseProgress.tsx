import { motion, useReducedMotion } from 'framer-motion';

interface ShowcaseProgressProps {
  total: number;
  currentIndex: number;
  slideDurationMs: number;
}

export function ShowcaseProgress({
  total,
  currentIndex,
  slideDurationMs,
}: ShowcaseProgressProps) {
  const shouldReduceMotion = useReducedMotion();

  if (total <= 1) return null;

  return (
    <div
      aria-hidden="true"
      className="flex gap-1.5 w-full max-w-md h-[3px] items-center pointer-events-none select-none"
    >
      {Array.from({ length: total }).map((_, idx) => {
        const isPast = idx < currentIndex;
        const isActive = idx === currentIndex;

        return (
          <div
            key={idx}
            className="flex-1 h-full bg-line rounded-full overflow-hidden relative"
          >
            {isPast && <div className="w-full h-full bg-fg-muted/50" />}
            {isActive && (
              <motion.div
                key={`progress-${idx}`}
                className="h-full bg-brand-red origin-left w-full"
                initial={shouldReduceMotion ? { scaleX: 1 } : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : {
                        duration: slideDurationMs / 1000,
                        ease: 'linear',
                      }
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
