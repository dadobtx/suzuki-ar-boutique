# Plan de Implementación Fase 7: Foto + QR (Preparación F9)

## Objetivo

Implementar la captura de foto dual (con overlay y limpia) durante la sesión AR, generar un código de wishlist único y mostrar una pantalla de escaneo QR para que el usuario pueda llevarse su look al móvil, dejando el terreno preparado para la futura generación de IA (F9).

## Decisiones Técnicas y Arquitectura

- **Doble Captura**: Para facilitar la integración posterior con IDM-VTON en la F9, la cámara capturará dos imágenes:
  1. `photoComposed`: Frame del video + HUD + watermark + prenda 2D + metadatos.
  2. `photoClean`: Frame crudo de la cámara.
- **Privacidad**: Las imágenes se mantienen efímeras como `Data URL` en el store `photo.ts`. Se limpiarán en cada transición a `ATTRACT`.

## Entregables

### 1. Compositor de Imágenes (`src/lib/photo-composer.ts`)

- **Función:** `composePhoto(videoEl, overlayCanvas, garment, meta)`
- **Salida:** Objeto con `photoComposed` y `photoClean` (ambos Data URL, JPEG 0.92).
- **Características:** Renderización 1080×1920 (portrait), soporte DPR, inyección de watermark y metadatos.

### 2. Generador de Código Wishlist (`src/lib/wishlist-code.ts`)

- **Función:** `generateWishlistCode(): string`
- **Formato:** 6 caracteres alfanuméricos (A-Z0-9) seguros (`crypto.getRandomValues`).

### 3. Nuevos Componentes del Kiosko

- **[NEW] `src/components/kiosk/PhotoCountdown.tsx`**
  - Estado `PHOTO_COUNTDOWN`.
  - Animación 3-2-1 con Framer Motion, sonido beep (opcional), flash blanco final.
  - Al terminar, dispara `composePhoto` y avanza a `SHARE_QR`.
  - Vuelve a `TRYON` si el usuario desaparece.
- **[NEW] `src/components/kiosk/PhotoShare.tsx`**
  - Estado `SHARE_QR`.
  - Muestra la foto compuesta, código QR (vía `qrcode.react`) y el código wishlist.
  - Controles: "Otra prenda", "Descargar PNG", "Finalizar".
  - Auto-timeout de 60s hacia `ATTRACT`.

### 4. Gestión de Estado (`src/store/photo.ts` & `src/store/kiosk.ts`)

- **[NEW] `photo.ts`**: Store efímero sin persistencia para las imágenes y metadatos actuales.
- **[MODIFY] `kiosk.ts`**: Integrar los nuevos estados (`PHOTO_COUNTDOWN`, `SHARE_QR`) y gestionar las transiciones de timeout.

### 5. Integración en UI Actual

- **[MODIFY] `src/components/camera/CameraStage.tsx`**: Botón flotante prominente de "Disparar foto" visible solo si hay presencia y una prenda seleccionada.
- **[MODIFY] `src/App.tsx`**: Registrar los nuevos componentes sobre el layout.
- **[MODIFY] `src/pages/DiagPage.tsx`**: Nueva sección "FOTO" con registro de la sesión y metadata.
- **[MODIFY] `src/i18n/*.json`**: Cadenas de texto para los nuevos flujos.

### 6. Pruebas Unitarias

- **[NEW] `tests/unit/photo-composer.test.ts`**: Verificación de dimensiones y presencias en canvas.
- **[NEW] `tests/unit/wishlist-code.test.ts`**: Verificación de aleatoriedad, longitud y colisiones en 10k generaciones.

## Verificación Planificada

- Flujo interactivo: Verificar el viaje completo de TRYON → Countdown → QR → Vuelta a estado.
- Pruebas manuales escaneando el código QR generado.
- Validar las dimensiones 1080x1920 de las imágenes generadas.
