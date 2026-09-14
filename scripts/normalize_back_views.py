#!/usr/bin/env python3
"""
Normaliza las fotos de la VISTA POSTERIOR de las prendas contra la foto frontal
que ya está en el catálogo, y decide si el par aguanta la animación de volteo.

Por qué existe
--------------
La tarjeta del catálogo voltea la prenda en 3D para enseñar la espalda. El ojo no
juzga el movimiento (a 90 grados la cara está de canto y el cambio es invisible):
juzga los dos estados en reposo. Si la prenda aterriza más grande, más chica o
corrida, la animación se siente barata. Y el ojo ancla en los HOMBROS, no en el
ruedo: ahí están el cuello, el logo y la parte estable de la silueta.

De ahí las dos reglas del script:
  1. escalar y posicionar la espalda por ANCHO DE HOMBROS, no por alto de prenda;
     lo que sobre se va a mangas y ruedo, abajo, donde nadie mira al voltear.
  2. si aun así el par no pega, NO forzar el volteo: se marca `flip: false` y esa
     tarjeta hace un fundido. La bandera se calcula, no se pone a ojo.

Qué espera de entrada
---------------------
Fotos crudas de la espalda, SIN retocar, una por prenda, nombradas con el número
de parte tal como está en public/garments/:
    990F0-BKHM0.jpg      -> espalda de la sudadera
    990F0-BKQJ5_2.jpg    -> espalda de la cara negra de la reversible
Cuanto más resolución, mejor. No hay que recortarlas, ni centrarlas, ni igualar
nada: de eso se encarga este script, y si vienen pre-procesadas por otra
herramienta el resultado suele ser peor, no mejor.

Uso
---
    pip install pillow numpy
    python normalize_back_views.py --raw <carpeta_fotos_crudas> \
                                   --garments <repo>/public/garments \
                                   --out <carpeta_salida>

Salida
------
    <PN>.back.png          2048x2048, fondo blanco, alineada por hombros
    <PN>.back.thumb.png    512x512
    back_views_report.json  métricas y veredicto por prenda
    back_views_check.jpg    hoja de control: frente y espalda superpuestos
    catalog_patch.json      fragmento listo para revisar y fusionar en catalog.json

Veredictos
----------
    flip     el par aguanta el volteo 3D
    fundido  sirve como segunda vista, pero cambiando por fundido
    detalle  no son comparables (otra pose / otra luz): mostrarla como
             "detalle trasero", nunca como la misma prenda girando
"""

import argparse, json, os, sys
from pathlib import Path

import numpy as np
from PIL import Image

LIENZO = 2048
THUMB = 512
EXTS = ('.png', '.jpg', '.jpeg', '.webp')

# Umbrales del veredicto. CALIBRADOS SOBRE UN SOLO PAR REAL: el de la
# 990F0-BKHM0 (frente del catálogo + espalda de la tienda Suzuki España, dos
# cadenas de procesamiento distintas), que da núcleo 0.87 / total 0.76 y que
# revisado a ojo voltea bien. Al procesar el lote completo hay que mirar la
# hoja de control y mover el corte UNA vez, con varios pares a la vista.
#
# El núcleo pesa más que el total a propósito: medido sobre ese par, el solape
# de la mitad superior es 0.88 y el de la inferior 0.65. La diferencia entre
# dos fotos de la misma prenda se concentra en mangas y ruedo, justo donde el
# ojo no ancla durante el volteo.
IOU_NUCLEO_FLIP = 0.84   # solape del torso (hombros -> 1.05x ancho de hombros)
IOU_TOTAL_FLIP = 0.70    # solape de toda la silueta
IOU_NUCLEO_FUNDIDO = 0.70
PROP_FLIP = 0.12         # diferencia de proporción alto/hombros
TONO_MAX = 28            # tope de corrección de luminancia, en niveles


# ─────────────────────────── análisis de silueta ───────────────────────────

def _mascara(rgb, thr):
    return rgb.min(axis=2) < thr


def silueta(im):
    """Devuelve máscara, bbox, línea de hombros y ancho de hombros.

    El umbral se relaja si la prenda casi no se despega del fondo (el caso de
    la sudadera blanca sobre blanco), y se reporta cuál se usó.
    """
    rgb = np.asarray(im.convert('RGB')).astype(np.int16)
    for thr in (250, 252, 253, 254):
        m = _mascara(rgb, thr)
        if m.mean() > 0.03:
            break
    filas = np.where(m.sum(axis=1) > 6)[0]
    cols = np.where(m.sum(axis=0) > 6)[0]
    if len(filas) == 0 or len(cols) == 0:
        raise ValueError('no se encontró prenda sobre el fondo')
    top, bot, left, right = filas[0], filas[-1], cols[0], cols[-1]
    alto = bot - top + 1

    perfil = np.zeros(alto)
    borde_i = np.zeros(alto, int)
    borde_d = np.zeros(alto, int)
    for i, y in enumerate(range(top, bot + 1)):
        xs = np.where(m[y])[0]
        if len(xs) > 3:
            borde_i[i], borde_d[i] = xs[0], xs[-1]
            perfil[i] = xs[-1] - xs[0]

    # La línea de hombros es donde termina la subida brusca del ancho, es decir
    # donde el cuello deja paso a los hombros.
    k = max(9, int(alto * 0.012)) | 1
    suave = np.convolve(perfil, np.ones(k) / k, mode='same')
    deriv = np.diff(suave, prepend=suave[0])
    lo, hi = int(alto * 0.03), int(alto * 0.35)
    pico = lo + int(np.argmax(deriv[lo:hi]))
    y_sh = hi
    for y in range(pico, hi):
        if deriv[y] < 0.20 * deriv[lo:hi].max():
            y_sh = y
            break

    return dict(
        mask=m, thr=thr,
        bbox=(int(left), int(top), int(right), int(bot)),
        alto=int(alto),
        y_hombros=int(top + y_sh),
        x_hombros=float((borde_i[y_sh] + borde_d[y_sh]) / 2),
        ancho_hombros=int(borde_d[y_sh] - borde_i[y_sh]),
        lum_tela=float(np.median(rgb.mean(axis=2)[m])),
        lum_fondo=float(np.median(rgb.mean(axis=2)[~m])),
        pureza_fondo=float((rgb.min(axis=2)[~m] >= 250).mean()),
    )


def recortar_marco(im):
    """Recorta a la zona de foto de producto, descartando marcos (capturas con
    letterbox, bordes de visor, franjas de color).

    Se busca la región donde DOMINA el fondo claro del catálogo. Es tolerante a
    ruido de JPEG a propósito: exigir un marco perfectamente uniforme falla con
    cualquier imagen recomprimida. Si la foto no tiene fondo claro dominante
    (estudio gris, por ejemplo) se devuelve tal cual y sigue el pipeline normal.
    """
    a = np.asarray(im.convert('RGB')).astype(np.int16)
    claro = a.min(axis=2) > 232
    if claro.mean() < 0.08:
        return im
    # Umbral relativo al máximo de cada eje: un marco lateral ancho hace que
    # NINGUNA fila llegue a un umbral absoluto, y el recorte no se haría nunca.
    fc, ff = claro.mean(axis=0), claro.mean(axis=1)
    cols = np.where(fc > 0.35 * fc.max())[0]
    filas = np.where(ff > 0.35 * ff.max())[0]
    if len(cols) < 8 or len(filas) < 8:
        return im
    return im.crop((int(cols[0]), int(filas[0]), int(cols[-1]) + 1, int(filas[-1]) + 1))


# ─────────────────────────── normalización ───────────────────────────

def normalizar(back_raw, frente, s_frente):
    """Escala y posiciona la espalda para que sus hombros caigan sobre los del
    frente, y acerca su punto de negro al del frente."""
    back = recortar_marco(back_raw)
    s_back = silueta(back)

    escala = s_frente['ancho_hombros'] / s_back['ancho_hombros']
    nw, nh = max(1, int(back.width * escala)), max(1, int(back.height * escala))
    g = back.convert('RGB').resize((nw, nh), Image.LANCZOS)
    s_g = silueta(g)

    dx = int(round(s_frente['x_hombros'] - s_g['x_hombros']))
    dy = int(round(s_frente['y_hombros'] - s_g['y_hombros']))

    lienzo = Image.new('RGB', (LIENZO, LIENZO), 'white')
    lienzo.paste(g, (dx, dy))

    # ¿se sale del lienzo?
    bx0, by0, bx1, by1 = s_g['bbox']
    desborde = not (0 <= bx0 + dx and bx1 + dx < LIENZO and 0 <= by0 + dy and by1 + dy < LIENZO)

    # tono: acercar la mediana de la tela a la del frente, con tope, y blanquear
    # el fondo para que la tarjeta no parpadee de gris a blanco al voltear.
    a = np.asarray(lienzo).astype(np.float32)
    s_l = silueta(lienzo)
    delta = s_frente['lum_tela'] - s_l['lum_tela']
    delta = float(np.clip(delta, -TONO_MAX, TONO_MAX))
    if abs(delta) > 1:
        a[s_l['mask']] = np.clip(a[s_l['mask']] + delta, 0, 255)
    a[~s_l['mask']] = 255.0
    lienzo = Image.fromarray(a.astype(np.uint8))

    return lienzo, s_back, desborde, delta


def iou(m1, m2):
    inter = np.logical_and(m1, m2).sum()
    union = np.logical_or(m1, m2).sum()
    return float(inter / union) if union else 0.0


def iou_nucleo(m1, m2, s_ref):
    """Solape del torso: de la línea de hombros hacia abajo, 1.05 veces el ancho
    de hombros, y ±0.62 de ese ancho a los lados. Es la zona donde están cuello,
    logo y estampado, y donde el ojo compara los dos estados en reposo."""
    y0 = s_ref['y_hombros']
    span = s_ref['ancho_hombros']
    y1 = min(m1.shape[0], int(y0 + span * 1.05))
    x0 = max(0, int(s_ref['x_hombros'] - span * 0.62))
    x1 = min(m1.shape[1], int(s_ref['x_hombros'] + span * 0.62))
    sub = (slice(y0, y1), slice(x0, x1))
    return iou(m1[sub], m2[sub])


def veredicto(met):
    if met['desborde']:
        return 'detalle'
    if (met['iou_nucleo'] >= IOU_NUCLEO_FLIP
            and met['iou'] >= IOU_TOTAL_FLIP
            and met['prop_delta'] <= PROP_FLIP):
        return 'flip'
    if met['iou_nucleo'] >= IOU_NUCLEO_FUNDIDO:
        return 'fundido'
    return 'detalle'


# ─────────────────────────── hoja de control ───────────────────────────

def tira_control(filas, destino):
    from PIL import ImageDraw
    if not filas:
        return
    celda = 420
    cols = min(3, len(filas))
    ren = (len(filas) + cols - 1) // cols
    hoja = Image.new('RGB', (cols * celda, ren * (celda + 34)), '#e8e6e4')
    d = ImageDraw.Draw(hoja)
    for i, (pn, mf, mb, met) in enumerate(filas):
        out = np.full((LIENZO, LIENZO, 3), 255, np.uint8)
        out[mf] = (214, 60, 70)      # frente
        out[mb] = (40, 110, 200)     # espalda
        out[np.logical_and(mf, mb)] = (92, 92, 100)
        im = Image.fromarray(out).resize((celda - 8, celda - 8), Image.LANCZOS)
        x, y = (i % cols) * celda, (i // cols) * (celda + 34)
        hoja.paste(im, (x + 4, y + 4))
        d.text((x + 8, y + celda + 4),
               f"{pn}   {met['veredicto'].upper()}   nucleo {met['iou_nucleo']:.2f}   "
               f"total {met['iou']:.2f}   prop {met['prop_delta']*100:.1f}%   "
               f"tono {met['tono_delta']:+.0f}",
               fill='black')
    hoja.save(destino, quality=88)


# ─────────────────────────── principal ───────────────────────────

def main():
    p = argparse.ArgumentParser(description='Normaliza vistas posteriores contra el frente del catálogo.')
    p.add_argument('--raw', required=True, help='carpeta con las fotos crudas <PN>.jpg')
    p.add_argument('--garments', required=True, help='public/garments del repo (frentes de referencia)')
    p.add_argument('--out', required=True, help='carpeta de salida')
    args = p.parse_args()

    raw_dir, gar_dir, out_dir = Path(args.raw), Path(args.garments), Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    crudas = sorted(f for f in raw_dir.iterdir() if f.suffix.lower() in EXTS)
    if not crudas:
        sys.exit(f'no hay imágenes en {raw_dir}')

    reporte, parche, filas = [], {}, []

    for f in crudas:
        pn = f.stem
        for suf in ('_posterior', '-posterior', '.back', '_back', '-back', '_trasera'):
            if pn.lower().endswith(suf):
                pn = pn[: -len(suf)]
                break
        frente_path = gar_dir / f'{pn}.png'
        if not frente_path.exists():
            print(f'  ⚠ {pn}: no existe {frente_path.name} en el catálogo — se omite')
            reporte.append(dict(pn=pn, error='sin foto frontal en el catálogo'))
            continue

        try:
            frente = Image.open(frente_path).convert('RGB')
            s_frente = silueta(frente)
            back, s_back, desborde, tono = normalizar(Image.open(f), frente, s_frente)
            s_back_fin = silueta(back)

            met = dict(
                iou=iou(s_frente['mask'], s_back_fin['mask']),
                iou_nucleo=iou_nucleo(s_frente['mask'], s_back_fin['mask'], s_frente),
                prop_delta=abs(
                    s_frente['alto'] / s_frente['ancho_hombros']
                    - s_back['alto'] / s_back['ancho_hombros']
                ) / (s_frente['alto'] / s_frente['ancho_hombros']),
                tono_delta=tono,
                pureza_fondo=s_back_fin['pureza_fondo'],
                desborde=desborde,
                px_origen=min(Image.open(f).size),
            )
            met['veredicto'] = veredicto(met)

            back.save(out_dir / f'{pn}.back.png', optimize=True)
            back.resize((THUMB, THUMB), Image.LANCZOS).save(out_dir / f'{pn}.back.thumb.png', optimize=True)

            parche[pn] = {
                'backImageUrl': f'/garments/{pn}.back.png',
                'backThumbnailUrl': f'/garments/{pn}.back.thumb.png',
                'flip': met['veredicto'] == 'flip',
            }
            filas.append((pn, s_frente['mask'], s_back_fin['mask'], met))
            reporte.append(dict(pn=pn, **{k: (round(v, 4) if isinstance(v, float) else v)
                                          for k, v in met.items()}))
            print(f"  {pn:16} {met['veredicto']:8} nucleo {met['iou_nucleo']:.3f}  "
                  f"total {met['iou']:.3f}  prop {met['prop_delta']*100:5.1f}%  "
                  f"tono {met['tono_delta']:+5.1f}  origen {met['px_origen']}px")
        except Exception as e:                                   # noqa: BLE001
            print(f'  ⚠ {pn}: {e}')
            reporte.append(dict(pn=pn, error=str(e)))

    (out_dir / 'back_views_report.json').write_text(
        json.dumps(reporte, indent=2, ensure_ascii=False), encoding='utf-8')
    (out_dir / 'catalog_patch.json').write_text(
        json.dumps(parche, indent=2, ensure_ascii=False), encoding='utf-8')
    tira_control(filas, out_dir / 'back_views_check.jpg')

    ok = sum(1 for r in reporte if r.get('veredicto') == 'flip')
    print(f'\n{ok} de {len(reporte)} prendas aguantan el volteo. '
          f'Revisá back_views_check.jpg antes de fusionar el parche.')


if __name__ == '__main__':
    main()
