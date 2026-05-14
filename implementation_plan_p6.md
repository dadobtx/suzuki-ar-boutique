# Plan de Implementación Fase 6: Kiosk Shell & State Machine

## Objetivo

Implementar la interfaz completa del Kiosko con su flujo de estados (`ATTRACT`, `AWAKENING`, `CALIBRATING`, `TRYON`, `COOLDOWN`) guiado por la detección de presencia, añadiendo salvaguardas de producción (fullscreen, bloqueo táctil, auto-recovery).

## Cambios Propuestos

### 1. Kiosk Store (`src/store/kiosk.ts`)

- [NEW] Crear store con Zustand para manejar el `KioskState` y las transiciones.
- [NEW] Acciones `transition()`, `wakeUp()`, `startCooldown()`, `cancelCooldown()`, `reset()`.

### 2. Sincronización de Presencia (`src/hooks/useKioskPresenceSync.ts`)

- [NEW] Hook que escucha los cambios de `usePresence` y llama a las acciones del Kiosk Store para avanzar el flujo (ej. Absent a Present en `ATTRACT` -> `AWAKENING`).

### 3. Vistas de Transición (Kiosk Components)

- [NEW] `AttractLoop.tsx`: Loop atractor inicial.
- [NEW] `AwakeningSplash.tsx`: Splash "TE VEO" rápido.
- [NEW] `CalibrationGuide.tsx`: Retícula de enfoque y cuenta regresiva.
- [NEW] `CooldownCountdown.tsx`: Pantalla de alerta de inactividad "¿Sigues ahí?".
- [NEW] `index.ts`: Barrel export.

### 4. Modo Kiosko & Restricciones (`src/hooks/useKioskFlag.ts`)

- [NEW] Hook que detecta `?kiosk=1`.
- [NEW] Implementar `requestFullscreen` optimizado al primer toque.
- [NEW] Bloquear click derecho, selección y zoom (`kiosk-mode` CSS).

### 5. Auto-Recovery (`src/lib/auto-recovery.ts`)

- [NEW] Sistema de captura global de errores (`error`, `unhandledrejection`).
- [NEW] Lógica para recargar automáticamente si hay crasheos, y prevenir bucles infinitos (>3 fallos en 5 mins).

### 6. Integración en Flujo Principal

- [MODIFY] `src/App.tsx`: Incorporar `useKioskFlag` y `setupAutoRecovery()`.
- [MODIFY] `src/pages/HomePage.tsx`: Modificar para renderizar el componente de kiosko según el estado actual, manteniendo `CameraStage` en el fondo.
- [MODIFY] `src/components/camera/CameraStage.tsx`: Ocultar la UI del catálogo si no estamos en `TRYON`.
- [MODIFY] `src/pages/DiagPage.tsx`: Añadir sección de diagnóstico KIOSKO.
- [MODIFY] `src/i18n/*.json`: Añadir strings de la F6.

## Verificación

- Tests unitarios de la máquina de estados.
- Linting y Typechecking.
- Construcción y pruebas manuales usando `?kiosk=1`.
