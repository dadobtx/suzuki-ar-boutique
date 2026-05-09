# Suzuki AR Boutique

[![Deploy](https://github.com/dadobtx/suzuki-ar-boutique/actions/workflows/deploy.yml/badge.svg)](https://github.com/dadobtx/suzuki-ar-boutique/actions/workflows/deploy.yml)

**Probador virtual AR de prendas Suzuki** — modo Kiosko y desarrollo local.

🔗 **URL pública**: https://dadobtx.github.io/suzuki-ar-boutique/

## Características

- 🎯 **Try-On en tiempo real** con MediaPipe Pose + Segmentation
- 🏁 **Estética HUD Racing** — telemetría, esquinas diagonales, neon glow
- 📱 **Layout dual** — landscape (laptop) / portrait (kiosko)
- 🔒 **100% client-side** — ningún frame sale del dispositivo
- 🌐 **Offline-first** — Service Worker con precache completo
- 🌍 **i18n** — Español (default) + English

## Setup Local

```bash
# Clonar
git clone https://github.com/dadobtx/suzuki-ar-boutique.git
cd suzuki-ar-boutique

# Instalar
npm install

# Desarrollo
npm run dev

# Build (local)
npm run build

# Build (GitHub Pages)
VITE_TARGET=ghpages npm run build

# Storybook
npm run storybook

# Tests
npm test
```

## Flags de URL

| Flag               | Efecto                                             |
| ------------------ | -------------------------------------------------- |
| `?kiosk=1`         | Modo kiosko: fullscreen, sin cursor, auto-recovery |
| `?layout=portrait` | Layout portrait con center-crop                    |
| `?pro=1`           | Panel de ajustes avanzados de cámara               |
| `/#/diag`          | Página de diagnóstico                              |

## Stack

React 18 · TypeScript · Vite · Tailwind CSS · Framer Motion · Zustand · MediaPipe Tasks Vision · react-i18next

## Licencia

Uso interno Suzuki Ecuador. Todos los derechos reservados.
