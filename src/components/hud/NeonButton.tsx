import { forwardRef, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface NeonButtonProps {
  /** Glow color */
  variant?: 'cyan' | 'red' | 'yellow' | 'muted';
  /** Size preset */
  size?: 'sm' | 'md' | 'lg';
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  id?: string;
  type?: 'button' | 'submit' | 'reset';
}

const variantStyles = {
  cyan: 'border-accent-cyan text-accent-cyan hover:bg-accent-cyan/10 glow-cyan',
  red: 'border-brand-red text-brand-red hover:bg-brand-red/10 glow-red',
  yellow: 'border-accent-yellow text-accent-yellow hover:bg-accent-yellow/10',
  muted: 'border-fg-muted/20 text-fg-muted hover:bg-fg-muted/10',
} as const;

const sizeStyles = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-8 py-4 text-base',
} as const;

/**
 * Neon-bordered button with glow hover effect.
 * Racing HUD aesthetic with Framer Motion scale animation.
 */
export const NeonButton = forwardRef<HTMLButtonElement, NeonButtonProps>(
  (
    {
      className,
      variant = 'cyan',
      size = 'md',
      children,
      onClick,
      disabled,
      id,
      type = 'button',
    },
    ref,
  ) => {
    return (
      <motion.button
        ref={ref}
        type={type}
        id={id}
        disabled={disabled}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        className={cn(
          'relative inline-flex items-center justify-center',
          'border font-mono uppercase tracking-wider',
          'clip-hud transition-colors duration-200',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-cyan',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        onClick={onClick}
      >
        {children}
      </motion.button>
    );
  },
);

NeonButton.displayName = 'NeonButton';
