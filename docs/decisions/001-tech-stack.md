# ADR-001: React 18 + Vite + TypeScript Strict

## Status

Accepted

## Context

Need a modern, performant frontend stack for an AR try-on kiosk application that runs 100% client-side, deploys to GitHub Pages, and supports offline operation.

## Decision

- **React 18.3.1** over React 19 for stability and ecosystem compatibility (Framer Motion, Radix, i18next all tested against 18).
- **Vite 6** for fast HMR and native ESM.
- **TypeScript 5.7 strict mode** with `noUncheckedIndexedAccess` for maximum type safety.
- **Tailwind CSS 3.4** with custom Suzuki racing palette.
- **Zustand** over Redux for minimal boilerplate state management.
- **HashRouter** instead of BrowserRouter to avoid 404 issues on GitHub Pages.

## Consequences

- Pinned versions in package.json avoid breaking upgrades.
- React 18 means we use the older `createRoot` API (already standard).
- HashRouter URLs have `#/` prefix, acceptable for kiosk use.
