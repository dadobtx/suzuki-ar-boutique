# Medidas de las 11 ilustraciones recortables — referencia para calibrar el resto

Medido el 2026-09-16 sobre los PNG originales del paquete `Suzuki_Recortables_AR_v1`
(máscara alpha > 128, coordenadas nativas 1254×1254). Mismo método automático que produjo
los anchors de 990F0-BKTM1 y 990F0-BKBW5, que coincidieron exactamente con los que se
calibraron a mano: línea de hombros = fila donde termina la subida brusca del ancho (fin
del cuello), bordes de esa fila con 4% de inset.

Son un PUNTO DE PARTIDA fiable, no un reemplazo de mirar el dibujo.

## Tabla

| Prenda                | Silueta y[top:bot] | Hombros y | shoulderL x | shoulderR x | Span | Sobre hombros | Ratio | Veredicto                           |
| --------------------- | ------------------ | --------- | ----------- | ----------- | ---- | ------------- | ----- | ----------------------------------- |
| 990F0-BKTM1           | 69:1192            | 189       | 290         | 957         | 667  | 120           | 0.18  | OK — solo cuello                    |
| 990F0-BKPM5           | 60:1194            | 223       | 298         | 957         | 659  | 163           | 0.25  | Vigilar — cuello de polo            |
| 990F0-BKHM0           | 36:1189            | 275       | 322         | 933         | 611  | 239           | 0.39  | Exclusión obligatoria — capucha     |
| 990F0-BKBW5           | 10:1242            | 245       | 321         | 921         | 600  | 235           | 0.39  | Exclusión obligatoria — capucha     |
| 990F0-BKQJ5 (roja)    | 37:1220            | 264       | 318         | 929         | 611  | 227           | 0.37  | Exclusión obligatoria — capucha     |
| 990F0-BKQJ5_2 (negra) | 29:1223            | 270       | 306         | 944         | 638  | 241           | 0.38  | Exclusión obligatoria — capucha     |
| 990F0-BLMJ4           | 36:1220            | 307       | 303         | 938         | 635  | 271           | 0.43  | Exclusión obligatoria — la más alta |
| 990F0-BLPK0           | 56:1208            | 274       | 365         | 886         | 521  | 218           | 0.42  | Exclusión obligatoria — capucha     |
| 990F0-RSSM0           | 19:1216            | 212       | 313         | 926         | 613  | 193           | 0.31  | Vigilar — cuello alto sin capucha   |
| 990F0-JYFJ1           | 56:1197            | 233       | 298         | 953         | 655  | 177           | 0.27  | Vigilar — cuello alto sin capucha   |
| 990F0-FCHJ0           | 26:1203            | 216       | 287         | 965         | 678  | 190           | 0.28  | Vigilar — tiene capucha pero baja   |

"Sobre hombros" = píxeles de prenda por encima de la línea de hombros.
"Ratio" = sobre hombros / span. Es lo que se proyecta por encima de la línea de hombros
del usuario, medido en anchos de hombro.

## Cómo leer el ratio

Proporciones humanas medidas desde la línea de hombros, en anchos de hombro:
mentón ≈ 0.30, boca ≈ 0.40, ojos ≈ 0.55, coronilla ≈ 0.75.

Verificación empírica en cámara (2026-09-15):

- BKTM1, ratio 0.18 → se ve bien sin ninguna exclusión.
- BKBW5, ratio 0.39 → la capucha caía sobre la boca. Coincide con la predicción.

Umbrales que salen de ahí:

- < 0.24 → seguro, no necesita exclusión.
- 0.24 a 0.33 → cuello alto; puede rozar el mentón. Probar con exclusión suave.
- > 0.33 → la prenda llega a la altura de la boca. Exclusión obligatoria.

Seis de las once ilustraciones caen en el tramo obligatorio: el hoodie, el chaleco, las dos
caras de la reversible, la rain jacket y la parka. Las cuatro de "vigilar" son cuellos altos
(polo, softshell GSX-R, fleece Jimny) más la FCHJ0, que sí tiene capucha pero dibujada más
baja y plana.

## Lo que falta por prenda

Con la transformación de similitud, calibrar una prenda es mucho menos trabajo que antes:

- `shoulderL` / `shoulderR` — de la tabla de arriba (verificar a ojo sobre el dibujo).
- `headExclusion` (rx / ryUp / ryDown en múltiplos de la distancia entre orejas) — solo
  para las de exclusión obligatoria y, si hace falta, las de vigilar.
- `hipL` / `hipR`, `topClipY`, `bottomClipY` — NO se usan en modo ilustración. Se dejan por
  compatibilidad con el camino fotográfico.

## Peso de los assets

Las once ilustraciones suman ~11.6 MB. El navegador solo descarga la de la prenda activa
(~1 MB), más los thumbs de 512px del catálogo, que siguen siendo las fotos reales. Antes de
publicar conviene decidir si se generan derivados optimizados para web (documentados como
derivados, conservando los originales) o si 1 MB por prenda es aceptable en la red del
evento.
