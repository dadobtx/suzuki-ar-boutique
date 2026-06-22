import type { Garment } from '../types/garment';

export interface Medidas {
  pecho: number;
  cintura: number;
}

export interface FilaTabla {
  talla: string;
  pecho_min: number;
  pecho_max: number;
  cintura_min: number;
  cintura_max: number;
}

export interface TablaTallas {
  tabla_id: string;
  origen: string;
  version: string;
  provisional: boolean;
  filas: FilaTabla[];
}

export interface Prenda {
  sku: string;
  nombre: string;
  tipo: string;
  genero: 'hombre' | 'mujer' | 'unisex';
  tabla_origen_id: string;
  tallas_disponibles: string[];
  asset_ar?: string;
  activo: boolean;
}

export const SIZE_TABLES: Record<string, TablaTallas> = {
  tt_eu_std: {
    tabla_id: 'tt_eu_std',
    origen: 'EU_Standard_Unisex',
    version: '1.0',
    provisional: true,
    filas: [
      { talla: 'S', pecho_min: 88, pecho_max: 96, cintura_min: 73, cintura_max: 81 },
      { talla: 'M', pecho_min: 96, pecho_max: 104, cintura_min: 81, cintura_max: 89 },
      { talla: 'L', pecho_min: 104, pecho_max: 112, cintura_min: 89, cintura_max: 97 },
      { talla: 'XL', pecho_min: 112, pecho_max: 124, cintura_min: 97, cintura_max: 109 },
    ],
  },
};

export const LINE_TO_TABLE: Record<string, string> = {
  'GSX-R': 'tt_eu_std',
  Ecstar: 'tt_eu_std',
  Hayabusa: 'tt_eu_std',
  'Swift Sport': 'tt_eu_std',
  Jimny: 'tt_eu_std',
  Marine: 'tt_eu_std',
  Lifestyle: 'tt_eu_std',
};

export interface SesionKiosko {
  session_id: string;
  talla_habitual?: string | null;
  preferencia_fit?: 'ajustado' | 'regular' | 'holgado' | null;
  pecho_ar?: number | null;
  cintura_ar?: number | null;
  ar_confianza?: number | null;
}

const AR_CONFIDENCE_THRESHOLD = 0.8;

// Tablas genéricas provisionales (Estándar Europeo) para conversión de talla_habitual -> cm
// Valores ajustados al PUNTO MEDIO de los rangos para evitar colisiones en los bordes.
const GENERIC_TABLES: Record<string, Record<string, Medidas>> = {
  hombre: {
    XS: { pecho: 84, cintura: 69 },
    S: { pecho: 92, cintura: 77 },
    M: { pecho: 100, cintura: 85 },
    L: { pecho: 108, cintura: 93 },
    XL: { pecho: 118, cintura: 103 },
    XXL: { pecho: 130, cintura: 115 },
  },
  mujer: {
    XS: { pecho: 79, cintura: 61 },
    S: { pecho: 86, cintura: 68 },
    M: { pecho: 94, cintura: 76 },
    L: { pecho: 102.5, cintura: 84.5 },
    XL: { pecho: 113, cintura: 95 },
    XXL: { pecho: 125, cintura: 107 },
  },
  unisex: {
    // Promedio entre hombre y mujer
    XS: { pecho: 81.5, cintura: 65 },
    S: { pecho: 89, cintura: 72.5 },
    M: { pecho: 97, cintura: 80.5 },
    L: { pecho: 105.25, cintura: 88.75 },
    XL: { pecho: 115.5, cintura: 99 },
    XXL: { pecho: 127.5, cintura: 111 },
  },
};

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

export function recomendarTalla(
  sesion: SesionKiosko,
  prenda: Prenda,
  tablaPrenda: TablaTallas,
): string {
  const genericTable: Record<string, Medidas> =
    GENERIC_TABLES[prenda.genero] ?? GENERIC_TABLES.unisex ?? {};
  const fallbackMedidas: Medidas = genericTable.M ?? { pecho: 100, cintura: 85 };

  // 1. Obtener medidas (AR o Talla Habitual). El puente es siempre el cuerpo en cm.
  let medidasEstimadas: Medidas;
  if (
    sesion.ar_confianza != null &&
    sesion.ar_confianza >= AR_CONFIDENCE_THRESHOLD &&
    sesion.pecho_ar != null &&
    sesion.cintura_ar != null
  ) {
    medidasEstimadas = { pecho: sesion.pecho_ar, cintura: sesion.cintura_ar };
  } else if (sesion.talla_habitual) {
    medidasEstimadas =
      genericTable[sesion.talla_habitual.toUpperCase()] ?? fallbackMedidas;
  } else {
    medidasEstimadas = fallbackMedidas;
  }

  // 2. Mapear medidas a la tabla específica de la prenda (pecho como primario)
  // TODO: Considerar la cintura para prendas con horma de cintura (pantalones, faldas).
  let tallaBase = 'M';
  let minDiff = Infinity;
  for (const fila of tablaPrenda.filas) {
    // Si cae dentro del rango (límite superior EXCLUSIVO), es match perfecto
    if (
      medidasEstimadas.pecho >= fila.pecho_min &&
      medidasEstimadas.pecho < fila.pecho_max
    ) {
      tallaBase = fila.talla;
      break;
    }
    // Sino, buscamos la más cercana
    const diff = Math.min(
      Math.abs(medidasEstimadas.pecho - fila.pecho_min),
      Math.abs(medidasEstimadas.pecho - fila.pecho_max),
    );
    if (diff < minDiff) {
      minDiff = diff;
      tallaBase = fila.talla;
    }
  }

  // 3. Ajuste por preferencia de fit
  let finalSizeIndex = SIZE_ORDER.indexOf(tallaBase.toUpperCase());
  if (finalSizeIndex === -1) finalSizeIndex = 2; // Fallback M
  if (sesion.preferencia_fit === 'holgado') {
    finalSizeIndex = Math.min(finalSizeIndex + 1, SIZE_ORDER.length - 1);
  } else if (sesion.preferencia_fit === 'ajustado') {
    finalSizeIndex = Math.max(finalSizeIndex - 1, 0);
  }

  let recomendacion: string = SIZE_ORDER[finalSizeIndex] ?? 'M';

  // 4. Acotar a tallas_disponibles
  if (prenda.tallas_disponibles && prenda.tallas_disponibles.length > 0) {
    if (!prenda.tallas_disponibles.includes(recomendacion)) {
      let closestAvailable: string = prenda.tallas_disponibles[0] ?? recomendacion;
      let minIdxDiff = Infinity;
      for (const avail of prenda.tallas_disponibles) {
        const idx = SIZE_ORDER.indexOf(avail);
        if (idx !== -1) {
          const diff = Math.abs(idx - finalSizeIndex);
          if (diff < minIdxDiff) {
            minIdxDiff = diff;
            closestAvailable = avail;
          }
        }
      }
      recomendacion = closestAvailable;
    }
  }

  return recomendacion;
}

export function recomendarTallaGarment(
  profile: {
    session_id?: string;
    sessionId?: string | null;
    talla_habitual?: string | null;
    tallaHabitual?: string | null;
    preferencia_fit?: 'ajustado' | 'regular' | 'holgado';
    preferenciaFit?: 'ajustado' | 'regular' | 'holgado';
    ar_confianza?: number | null;
    arConfianza?: number;
  },
  garment: Garment,
): { recomendada: string; tabla_origen_id: string } {
  const tableId = LINE_TO_TABLE[garment.line] || 'tt_eu_std';
  const table = SIZE_TABLES[tableId] || SIZE_TABLES['tt_eu_std']!;

  const prenda: Prenda = {
    sku: garment.sku,
    nombre: garment.name,
    tipo: garment.category,
    genero: 'unisex',
    tabla_origen_id: tableId,
    tallas_disponibles: garment.sizes,
    activo: true,
  };

  const mappedProfile: SesionKiosko = {
    session_id: profile.session_id || profile.sessionId || '',
    talla_habitual: profile.talla_habitual ?? profile.tallaHabitual,
    preferencia_fit: profile.preferencia_fit ?? profile.preferenciaFit,
    ar_confianza: profile.ar_confianza ?? profile.arConfianza ?? null,
  };

  const recomendada = recomendarTalla(mappedProfile, prenda, table);
  return { recomendada, tabla_origen_id: tableId };
}

export function resolverTallaElegida(
  profile: { tallaHabitual: string | null; tallasElegidas: Record<string, string> },
  garment: Prenda | Garment,
  recomendada: string,
): string {
  // 1) Si ya eligió con +/-
  const elegidaManual = profile.tallasElegidas[garment.sku];
  const sizes = ('sizes' in garment ? garment.sizes : garment.tallas_disponibles) || [];
  if (elegidaManual && sizes.includes(elegidaManual)) {
    return elegidaManual;
  }

  // 2) Si declaró en onboarding y está disponible
  if (profile.tallaHabitual && profile.tallaHabitual !== 'No sé') {
    const declared = profile.tallaHabitual.toUpperCase();
    if (sizes.includes(declared)) {
      return declared;
    }

    // Si no está exacta, aproximar
    const wantedIdx = SIZE_ORDER.indexOf(declared);
    if (wantedIdx !== -1) {
      let closest = recomendada;
      let minDiff = Infinity;
      for (const s of sizes) {
        const idx = SIZE_ORDER.indexOf(s as string);
        if (idx !== -1) {
          const diff = Math.abs(idx - wantedIdx);
          if (diff < minDiff) {
            minDiff = diff;
            closest = s as string;
          }
        }
      }
      return closest;
    }
  }

  // 3) Fallback a recomendada
  return recomendada;
}
