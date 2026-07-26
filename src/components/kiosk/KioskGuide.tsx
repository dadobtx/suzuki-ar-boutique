import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ArrowDown, Camera, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useKioskStore } from '@/store/kiosk';
import { useGarmentStore } from '@/store/garment';
import type { PresenceState } from '@/hooks/usePresence';

interface KioskGuideProps {
  presence: PresenceState;
  layout: 'landscape' | 'portrait';
}

/**
 * Context-aware instruction banner that tells the user what to do next.
 * Placed at the top of the video area; auto-hides during countdowns/processing.
 *
 * The kiosk has lots of implicit steps (stand here, pick garment, hit red
 * button) that aren't obvious to a stranger walking up. This banner removes
 * that guesswork by always showing exactly one next action.
 */
export function KioskGuide({ presence, layout }: KioskGuideProps) {
  const kioskState = useKioskStore((s) => s.state);
  const activeGarmentId = useGarmentStore((s) => s.activeGarmentId);

  // Only show during the interactive try-on phase. Other states have their
  // own dedicated UIs (attract loop, calibration guide, countdown, etc.).
  if (kioskState !== 'TRYON') return null;

  let message = '';
  let icon: LucideIcon | null = null;
  let showArrow: 'right' | 'down' | null = null;
  let pulse = false;

  if (presence === 'absent' || presence === 'arriving') {
    message = 'PARATE FRENTE A LA CÁMARA';
    icon = Users;
    pulse = true;
  } else if (presence === 'present' && !activeGarmentId) {
    message = 'ELEGÍ UNA PRENDA';
    showArrow = layout === 'portrait' ? 'down' : 'right';
    pulse = true;
  } else if (presence === 'present' && activeGarmentId) {
    message = 'ELIGE TOMAR UNA FOTO O PRUEBA EN VIVO';
    icon = Camera;
    showArrow = 'down';
  }

  if (!message) return null;

  const ArrowIcon = showArrow === 'right' ? ArrowRight : ArrowDown;
  const IconComponent = icon;

  return (
    <div
      className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none"
      style={{ zIndex: 35 }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={message}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className={`
            flex items-center gap-3 px-6 py-4
            bg-bg/85 backdrop-blur-md
            border border-accent-cyan/40
            clip-hud
            ${pulse ? 'animate-pulse' : ''}
          `}
        >
          {IconComponent && <IconComponent className="w-7 h-7 text-accent-cyan" />}

          <span className="font-display text-2xl tracking-widest text-white uppercase whitespace-nowrap">
            {message}
          </span>

          {showArrow && (
            <motion.div
              animate={showArrow === 'right' ? { x: [0, 8, 0] } : { y: [0, 8, 0] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              <ArrowIcon className="w-8 h-8 text-brand-red" strokeWidth={2.5} />
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
