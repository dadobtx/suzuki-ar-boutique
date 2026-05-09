import { cn } from '@/lib/utils';

interface HudCornersProps {
  variant?: 'cyan' | 'red' | 'muted';
}

const CORNER_SIZE = 16;

/**
 * Animated corner accents for HUD frames.
 * Pulse glow on idle, solid on active.
 */
export function HudCorners({ variant = 'cyan' }: HudCornersProps) {
  const color = {
    cyan: 'bg-accent-cyan',
    red: 'bg-brand-red',
    muted: 'bg-fg-muted',
  }[variant];

  const corners = [
    'top-0 left-0',
    'top-0 right-0 rotate-90',
    'bottom-0 right-0 rotate-180',
    'bottom-0 left-0 -rotate-90',
  ] as const;

  return (
    <>
      {corners.map((pos) => (
        <div
          key={pos}
          className={cn('absolute animate-pulse-glow pointer-events-none', pos)}
          aria-hidden="true"
        >
          {/* Horizontal bar */}
          <div
            className={cn('absolute top-0 left-0', color)}
            style={{ width: CORNER_SIZE, height: 2 }}
          />
          {/* Vertical bar */}
          <div
            className={cn('absolute top-0 left-0', color)}
            style={{ width: 2, height: CORNER_SIZE }}
          />
        </div>
      ))}
    </>
  );
}
