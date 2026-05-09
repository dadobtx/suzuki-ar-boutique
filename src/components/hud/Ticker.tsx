import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface TickerProps {
  items: string[];
  className?: string;
  /** Speed in pixels per second */
  speed?: number;
}

/**
 * Scrolling ticker tape with monospaced telemetry text.
 * Racing-style HUD data ribbon.
 */
export function Ticker({ items, className, speed = 60 }: TickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const text = items.join('  ·  ');
    const duration = (text.length * 8) / speed;

    el.style.setProperty('--ticker-duration', `${duration}s`);
  }, [items, speed]);

  const text = items.join('  ·  ');

  return (
    <div
      className={cn(
        'overflow-hidden whitespace-nowrap font-mono text-hud-xs text-accent-cyan/60 select-none',
        className,
      )}
      aria-hidden="true"
    >
      <div
        ref={containerRef}
        className="inline-block animate-[ticker_var(--ticker-duration,20s)_linear_infinite]"
        style={{
          // @ts-expect-error CSS custom properties
          '--ticker-duration': '20s',
        }}
      >
        {text}
        {'  ·  '}
        {text}
      </div>
    </div>
  );
}
