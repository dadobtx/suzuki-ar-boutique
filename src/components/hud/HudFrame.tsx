import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { HudCorners } from './HudCorners';

interface HudFrameProps {
  children: ReactNode;
  className?: string;
  /** Show animated corner accents */
  corners?: boolean;
  /** Border color variant */
  variant?: 'cyan' | 'red' | 'muted';
  /** HTML id for testing */
  id?: string;
}

/**
 * Racing-HUD themed frame with diagonal-cut corners.
 * Provides the signature Suzuki pit-lane aesthetic.
 */
export function HudFrame({
  children,
  className,
  corners = true,
  variant = 'cyan',
  id,
}: HudFrameProps) {
  const borderColor = {
    cyan: 'border-accent-cyan/30',
    red: 'border-brand-red/30',
    muted: 'border-fg-muted/20',
  }[variant];

  return (
    <div
      id={id}
      className={cn(
        'relative border clip-hud bg-surface/80 backdrop-blur-sm',
        borderColor,
        className,
      )}
    >
      {corners && <HudCorners variant={variant} />}
      {children}
    </div>
  );
}
