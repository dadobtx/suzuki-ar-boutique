import { forwardRef, useCallback, useRef, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface BigTouchButtonProps {
  variant?: 'cyan' | 'red';
  children?: ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  id?: string;
}

/**
 * Large touch-friendly button (min 80×80px) with cyan ripple effect.
 * Designed for kiosk touchscreen interaction.
 */
export const BigTouchButton = forwardRef<HTMLButtonElement, BigTouchButtonProps>(
  ({ className, variant = 'cyan', children, onClick, disabled, id }, ref) => {
    const rippleRef = useRef<HTMLSpanElement>(null);

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        const btn = e.currentTarget;
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const ripple = rippleRef.current;
        if (ripple) {
          ripple.style.left = `${x - 30}px`;
          ripple.style.top = `${y - 30}px`;
          ripple.classList.remove('animate-ripple');
          void ripple.offsetWidth;
          ripple.classList.add('animate-ripple');
        }

        onClick?.(e);
      },
      [onClick],
    );

    const colors = {
      cyan: 'bg-accent-cyan/10 border-accent-cyan text-accent-cyan active:bg-accent-cyan/20',
      red: 'bg-brand-red/10 border-brand-red text-brand-red active:bg-brand-red/20',
    }[variant];

    return (
      <motion.button
        ref={ref}
        type="button"
        id={id}
        disabled={disabled}
        whileTap={{ scale: 0.93 }}
        transition={{ type: 'spring', stiffness: 500, damping: 20 }}
        className={cn(
          'relative overflow-hidden',
          'min-w-[80px] min-h-[80px]',
          'flex items-center justify-center',
          'border-2 rounded-lg',
          'font-display text-xl uppercase tracking-wide',
          'transition-colors duration-150',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-cyan',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          colors,
          className,
        )}
        onClick={handleClick}
      >
        {children}
        <span
          ref={rippleRef}
          className="absolute w-[60px] h-[60px] rounded-full bg-accent-cyan/30 pointer-events-none opacity-0"
          aria-hidden="true"
        />
      </motion.button>
    );
  },
);

BigTouchButton.displayName = 'BigTouchButton';
