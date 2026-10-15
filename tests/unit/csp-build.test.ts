import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Content Security Policy (CSP) build validation', () => {
  it('connect-src en index.html contiene https://*.decart.ai y wss://*.decart.ai', () => {
    const htmlPath = path.resolve(__dirname, '../../index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');
    const match = html.match(/content="([^"]*connect-src[^"]*)"/i);
    expect(match).not.toBeNull();
    const cspContent = match![1];
    expect(cspContent).toContain('wss://*.decart.ai');
    expect(cspContent).toContain('https://*.decart.ai');
    expect(cspContent).toContain('wss://fal.run');
    expect(cspContent).toContain('https://fal.run');
  });

  it('verifica que la CSP generada en el build (dist/index.html) contiene wss://*.decart.ai', () => {
    const distPath = path.resolve(__dirname, '../../dist/index.html');
    if (!fs.existsSync(distPath)) {
      // Fallback si aún no se ha ejecutado el build en un runner limpio
      const htmlPath = path.resolve(__dirname, '../../index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');
      expect(html).toContain('wss://*.decart.ai');
      return;
    }

    const html = fs.readFileSync(distPath, 'utf-8');
    const match = html.match(/content="([^"]*connect-src[^"]*)"/i);
    expect(match).not.toBeNull();
    const cspContent = match![1];
    expect(cspContent).toContain('wss://*.decart.ai');
    expect(cspContent).toContain('https://*.decart.ai');
    expect(cspContent).toContain('wss://fal.run');
    expect(cspContent).toContain('https://fal.run');
  });
});
