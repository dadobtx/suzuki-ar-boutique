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
