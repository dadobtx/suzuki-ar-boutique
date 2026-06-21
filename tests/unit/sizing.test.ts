import { describe, it, expect } from 'vitest';
import { recomendarTalla, Prenda, TablaTallas, SesionKiosko } from '../../src/lib/sizing';

const mockTabla: TablaTallas = {
  tabla_id: 'tt_eu_std_m',
  origen: 'EU_Standard_Hombre',
  version: '1.0',
  provisional: true,
  filas: [
    { talla: 'S', pecho_min: 88, pecho_max: 96, cintura_min: 73, cintura_max: 81 },
    { talla: 'M', pecho_min: 96, pecho_max: 104, cintura_min: 81, cintura_max: 89 },
    { talla: 'L', pecho_min: 104, pecho_max: 112, cintura_min: 89, cintura_max: 97 },
    { talla: 'XL', pecho_min: 112, pecho_max: 124, cintura_min: 97, cintura_max: 109 },
  ],
};

const mockPrenda: Prenda = {
  sku: 'sku-001',
  nombre: 'Camiseta',
  tipo: 't-shirt',
  genero: 'hombre',
  tabla_origen_id: 'tt_eu_std_m',
  tallas_disponibles: ['S', 'M', 'L', 'XL'],
  activo: true,
};

describe('Motor de Tallas - recomendarTalla', () => {
  it('usa medidas de AR si la confianza es >= 0.8', () => {
    const sesion: SesionKiosko = {
      session_id: '1',
      talla_habitual: 'S', // Debería ser ignorado por AR alto
      ar_confianza: 0.9,
      pecho_ar: 108, // Dentro del rango de L (104 - 112)
      cintura_ar: 90,
    };
    const rec = recomendarTalla(sesion, mockPrenda, mockTabla);
    expect(rec).toBe('L');
  });

  it('usa talla habitual si el AR tiene confianza < 0.8', () => {
    const sesion: SesionKiosko = {
      session_id: '2',
      talla_habitual: 'L', // Hombre L -> pecho 108 -> L (104 - 112)
      ar_confianza: 0.7,
      pecho_ar: 90, // Sería S, pero debe ignorarse
      cintura_ar: 78,
    };
    const rec = recomendarTalla(sesion, mockPrenda, mockTabla);
    expect(rec).toBe('L');
  });

  it('usa fallback "M" si no hay talla habitual ni AR confiable ("No sé")', () => {
    const sesion: SesionKiosko = {
      session_id: '3',
      talla_habitual: null, // "No sé"
      ar_confianza: null,
    };
    // Fallback M -> Hombre M = 100 -> M (96 - 104)
    const rec = recomendarTalla(sesion, mockPrenda, mockTabla);
    expect(rec).toBe('M');
  });

  it('resuelve el caso de borde de solapamiento de rangos (bug 2)', () => {
    // Si la talla_habitual era M, en la versión anterior el pecho era 96.
    // 96 caía en S (88-96) por el `<=`. Ahora, pecho M hombre es 100.
    // Incluso si pasamos un AR con pecho exactamente 96, debería ser M, no S.
    const sesion: SesionKiosko = {
      session_id: '4',
      ar_confianza: 0.9,
      pecho_ar: 96, // Borde superior de S, borde inferior de M
      cintura_ar: 85,
    };
    const rec = recomendarTalla(sesion, mockPrenda, mockTabla);
    expect(rec).toBe('M'); // Porque S es pecho < 96, M es >= 96
  });

  it('ajusta la talla si la preferencia de fit es "holgado"', () => {
    const sesion: SesionKiosko = {
      session_id: '5',
      talla_habitual: 'M',
      preferencia_fit: 'holgado',
      ar_confianza: null,
    };
    // Hombre M (100) -> Base M. Holgado -> L.
    const rec = recomendarTalla(sesion, mockPrenda, mockTabla);
    expect(rec).toBe('L');
  });

  it('acota la recomendación a las tallas_disponibles de la prenda', () => {
    const sesion: SesionKiosko = {
      session_id: '6',
      talla_habitual: 'L',
      preferencia_fit: 'holgado', // Querría XL
      ar_confianza: null,
    };

    // Pero la prenda solo llega hasta L
    const prendaAcotada: Prenda = { ...mockPrenda, tallas_disponibles: ['S', 'M', 'L'] };
    const rec = recomendarTalla(sesion, prendaAcotada, mockTabla);
    expect(rec).toBe('L');
  });
});
