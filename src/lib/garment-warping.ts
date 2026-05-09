import Delaunator from 'delaunator';

export interface Point {
  x: number;
  y: number;
}

/**
 * Computes the affine transformation matrix (a, b, c, d, e, f) that maps
 * a source triangle to a destination triangle.
 *
 * The transformation maps:
 *   [a c e] * [x] = [u]
 *   [b d f]   [y]   [v]
 *   [0 0 1]   [1]   [1]
 */
export function computeAffineTransform(
  src: [Point, Point, Point],
  dst: [Point, Point, Point],
): [number, number, number, number, number, number] | null {
  const [s0, s1, s2] = src;
  const [d0, d1, d2] = dst;

  // Determinant of the source triangle matrix
  const det = s0.x * (s1.y - s2.y) - s0.y * (s1.x - s2.x) + (s1.x * s2.y - s1.y * s2.x);

  // If the points are collinear or identical, the matrix cannot be inverted
  if (Math.abs(det) < 1e-6) return null;

  const a =
    (d0.x * (s1.y - s2.y) - s0.y * (d1.x - d2.x) + (d1.x * s2.y - s1.y * d2.x)) / det;
  const c =
    (s0.x * (d1.x - d2.x) - d0.x * (s1.x - s2.x) + (s1.x * d2.x - d1.x * s2.x)) / det;
  const e =
    (s0.x * (s1.y * d2.x - d1.x * s2.y) -
      s0.y * (s1.x * d2.x - d1.x * s2.x) +
      d0.x * (s1.x * s2.y - s1.y * s2.x)) /
    det;

  const b =
    (d0.y * (s1.y - s2.y) - s0.y * (d1.y - d2.y) + (d1.y * s2.y - s1.y * d2.y)) / det;
  const d =
    (s0.x * (d1.y - d2.y) - d0.y * (s1.x - s2.x) + (s1.x * d2.y - d1.y * s2.x)) / det;
  const f =
    (s0.x * (s1.y * d2.y - d1.y * s2.y) -
      s0.y * (s1.x * d2.y - d1.y * s2.x) +
      d0.y * (s1.x * s2.y - s1.y * s2.x)) /
    det;

  return [a, b, c, d, e, f];
}

/**
 * Warps a 2D garment image to fit the destination landmarks using Delaunay triangulation.
 */
export function warpGarment(
  ctx: CanvasRenderingContext2D,
  garmentImg: CanvasImageSource,
  anchorsSrc: Point[],
  anchorsDst: Point[],
) {
  if (anchorsSrc.length < 3 || anchorsSrc.length !== anchorsDst.length) {
    return;
  }

  // 1. Generate Delaunay triangulation based on the stable SOURCE coordinates
  const flatSrc = new Float64Array(anchorsSrc.length * 2);
  for (let i = 0; i < anchorsSrc.length; i++) {
    flatSrc[i * 2] = anchorsSrc[i].x;
    flatSrc[i * 2 + 1] = anchorsSrc[i].y;
  }

  const delaunay = new Delaunator(flatSrc);
  const triangles = delaunay.triangles;

  ctx.save();

  // 2. Iterate through each triangle
  for (let i = 0; i < triangles.length; i += 3) {
    const i0 = triangles[i];
    const i1 = triangles[i + 1];
    const i2 = triangles[i + 2];

    const srcTri: [Point, Point, Point] = [
      anchorsSrc[i0],
      anchorsSrc[i1],
      anchorsSrc[i2],
    ];
    const dstTri: [Point, Point, Point] = [
      anchorsDst[i0],
      anchorsDst[i1],
      anchorsDst[i2],
    ];

    const transform = computeAffineTransform(srcTri, dstTri);
    if (!transform) continue;

    ctx.save();

    // 3. Create clipping path for the DESTINATION triangle
    ctx.beginPath();
    ctx.moveTo(dstTri[0].x, dstTri[0].y);
    ctx.lineTo(dstTri[1].x, dstTri[1].y);
    ctx.lineTo(dstTri[2].x, dstTri[2].y);
    ctx.closePath();
    ctx.clip();

    // 4. Apply affine transformation
    ctx.transform(...transform);

    // 5. Draw the entire image (it will be masked by the clip path)
    ctx.drawImage(garmentImg, 0, 0);

    ctx.restore();
  }

  ctx.restore();
}
