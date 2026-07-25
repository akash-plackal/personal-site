/* Signed-distance-field displacement maps for the liquid-glass lens.
 *
 * A port of the SDF technique Aave documented in "Building glass for the web"
 * (https://aave.com/design/building-glass-for-the-web) and that
 * samasante/liquid-glass implements — reduced to what a static site needs.
 *
 * Each pixel of a rounded-rect lens is encoded as:
 *   R — X displacement (128 = neutral)
 *   G — Y displacement (128 = neutral)
 *   B — specular / glow mask (128 = none, 255 = full)
 * An SVG `feDisplacementMap` then refracts the source through R/G, and the B
 * channel is lifted into the rim sheen. Unlike `feTurbulence`, the field is a
 * real lens: the bend follows the shape's distance field, so it reads as glass
 * instead of noise.
 *
 * The upstream library rebuilds this map in a canvas on every shape change,
 * which costs runtime JS. Our lens shapes are known at build time, so we
 * rasterize the maps into PNGs here and ship zero JS for them. That is the
 * whole reason this lives in `scripts/` and not in `assets/`.
 */

/* erf(x) ≈ tanh(√π · x) — a cheap, smooth, monotone approximation, good enough
   for the edge feather. */
const ERF_K = Math.sqrt(Math.PI);
const erf = (x) => Math.tanh(ERF_K * x);

/* Mean of the dome gradient x/√(R²−x²) over [0, halfExtent]. The integral has a
   closed form — ∫₀ᴴ x/√(R²−x²) dx = R − √(R²−H²) — so the mean is that over H,
   no quadrature. Normalizes the spherical-cap profile so the average
   displacement lands at 0.5. */
const domeGradientMean = (radius, halfExtent) => (
  halfExtent > 0
    ? (radius - Math.sqrt(radius * radius - halfExtent * halfExtent)) / halfExtent
    : 0
);

/* Spherical-cap radius from chord half-width `a` and cap height `h`:
   R = (a² + h²) / 2h. The cap height is clamped inside the lens. */
function computeDomeConstants(capDepth, halfW, halfH) {
  const cap = Math.max(0.01, Math.min(capDepth, Math.min(halfW, halfH) - 1));
  const Rx = (halfW * halfW + cap * cap) / (2 * cap);
  const Ry = (halfH * halfH + cap * cap) / (2 * cap);
  const meanX = domeGradientMean(Rx, halfW);
  const meanY = domeGradientMean(Ry, halfH);
  return {
    Rx,
    Ry,
    scaleX: meanX > 0 ? 0.5 / meanX : 1,
    scaleY: meanY > 0 ? 0.5 / meanY : 1,
  };
}

function domeGradient(distance, radius, scale) {
  // Hold the sample just inside the radius so the √ stays real at the rim.
  const inside = Math.min(distance, radius * (1 - 1e-3));
  return (inside / Math.sqrt(radius * radius - inside * inside)) * scale;
}

// 8-bit encode: displacement is signed around 128, specular lifts 0 → 128,
// 1 → 255. `| 0` truncates after the +0.5 round bias.
const encodeAxis = (signed) => ((0.5 + signed) * 255 + 0.5) | 0;
const encodeSpec = (spec) => (127 * spec + 128 + 0.5) | 0;

/**
 * Rasterize one lens field into a `size × size` RGBA buffer.
 *
 * `lensHalfWidth` / `lensHalfHeight` are in the units the optics are quoted in
 * — for us, CSS px of the on-screen lens. They set the coordinate space rather
 * than the raster size, so `size` is pure supersampling: a 48px button rendered
 * from a 192px map is a 4× map. That matters because a few optics (`sheenWidth`)
 * are absolute widths, and they must mean the same thing on screen regardless of
 * how finely we rasterize.
 *
 * Only the top-left quadrant is computed; the other three are written by
 * reflecting the displacement signs. The specular axis flips with each mirror,
 * so it is tracked as two values (`specMain` on the TL↔BR diagonal, `specCross`
 * on TR↔BL) instead of one.
 */
export function rasterizeLensField(shape, size) {
  const {
    lensHalfWidth: halfW,
    lensHalfHeight: halfH,
    borderRadius,
    depth,
    clipToShape = true,
    softEdge = true,
    sheenAngle = 45,
    glow = 0,
    glowSpread = 1,
    glowFalloff = 1.5,
    sheen = 0,
    sheenWidth = 3,
    sheenFalloff = 1.5,
    curvature = 0,
    splay = 0,
    bend = 0,
    bendWidth = 0.16,
  } = shape;

  if (size % 2 !== 0) {
    throw new Error(`Lens map size must be even (quadrant mirroring); got ${size}`);
  }

  const data = Buffer.alloc(size * size * 4);
  const half = size >> 1;
  const radius = Math.min(borderRadius, Math.min(halfW, halfH));

  // `depth` is a 0..1 fraction of the lens — how far the refraction reaches
  // inward from the edge. As a fraction it auto-scales with size and, near 1,
  // fills the whole shape instead of leaving a neutral centre.
  const minHalf = Math.min(halfW, halfH);
  const depthPx = Math.min(depth * minHalf, minHalf - 1);
  const innerHalfW = Math.max(0, halfW - depthPx);
  const innerHalfH = Math.max(0, halfH - depthPx);
  const innerRadius = Math.max(0, Math.min(borderRadius, Math.min(innerHalfW, innerHalfH)));
  // erf width: the feather spans ~`depthPx`; 1/√2 absorbs the erf scale.
  const falloff = depthPx > 0 ? Math.SQRT1_2 / depthPx : 1e6;

  const hasSpecular = glow > 0 || sheen > 0;
  const angle = (sheenAngle * Math.PI) / 180;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const edgeInv = sheenWidth > 0 ? 1 / sheenWidth : 0;
  // How far the glow reaches inward from the edge — a soft, all-around inner
  // glow, not a directional band.
  const glowReachInv = 1 / Math.max(2, glowSpread * Math.min(halfW, halfH));

  const stepX = (2 * halfW) / size;
  const stepY = (2 * halfH) / size;
  const invW = 1 / halfW;
  const invH = 1 / halfH;

  const hasDome = curvature > 0;
  // `curvature` is a 0..1 fraction of the lens; the spherical-cap height is that
  // fraction of the half-extent, so the dome auto-scales with size.
  const dome = hasDome ? computeDomeConstants(curvature * Math.min(halfW, halfH), halfW, halfH) : null;

  const hasSplay = splay > 0;
  const splayHalf = 0.5 * Math.min(halfW, halfH);
  const splayInv = splayHalf > 0 ? 1 / splayHalf : 0;

  // Inner-edge meniscus: amplify the inward bend in a thin band hugging the
  // rim. `erInv` maps the SDF to a 0..1 ramp across the band.
  const hasEdgeRefract = bend > 0;
  const erInv = 1 / Math.max(2, bendWidth * Math.min(halfW, halfH));

  const sheenNorm = Math.SQRT1_2; // 1/√2 normalizes the diagonal projection

  // Distance from a point to the rounded corner arc — shared by the outer SDF
  // and (with the inset extents) the soft-edge feather.
  const cornerDistance = (ox, oy) => (ox > 0 || oy > 0 ? Math.sqrt(ox * ox + oy * oy) : 0);

  for (let row = 0; row < half; row += 1) {
    const mirrorRow = size - 1 - row;
    const py = -((row + 0.5) * stepY - halfH);
    const edgeY = py - halfH + radius;
    const innerEdgeY = softEdge ? py - innerHalfH + innerRadius : 0;
    const dirYBase = hasDome
      ? domeGradient(py, dome.Ry, dome.scaleY)
      : (py * invH > 1 ? 1 : py * invH);
    const normY = py * invH > 1 ? 1 : py * invH;
    const splayY = hasSplay ? Math.max(0, 1 - (halfH - py) * splayInv) : 0;
    const rowBase = row * size;
    const mirrorRowBase = mirrorRow * size;

    for (let col = 0; col < half; col += 1) {
      const mirrorCol = size - 1 - col;
      const px = -((col + 0.5) * stepX - halfW);
      const edgeX = px - halfW + radius;
      const sdf =
        cornerDistance(edgeX > 0 ? edgeX : 0, edgeY > 0 ? edgeY : 0) +
        (edgeX > edgeY ? (edgeX > 0 ? 0 : edgeX) : edgeY > 0 ? 0 : edgeY) -
        radius;

      // The four mirror targets for this quadrant pixel.
      const i00 = (rowBase + col) * 4; // top-left (canonical)
      const i01 = (rowBase + mirrorCol) * 4; // top-right (mirror X)
      const i10 = (mirrorRowBase + col) * 4; // bottom-left (mirror Y)
      const i11 = (mirrorRowBase + mirrorCol) * 4; // bottom-right (mirror XY)

      if (clipToShape && sdf >= 0) {
        // Outside the shape: neutral grey, no displacement, no specular.
        for (const idx of [i00, i01, i10, i11]) {
          data[idx] = 128;
          data[idx + 1] = 128;
          data[idx + 2] = 128;
          data[idx + 3] = 255;
        }
        continue;
      }

      let dirX = hasDome ? domeGradient(px, dome.Rx, dome.scaleX) : (px * invW > 1 ? 1 : px * invW);
      let dirY = dirYBase;

      if (hasSplay) {
        const yAtt = splayY * splay;
        const xAtt = Math.max(0, 1 - (halfW - px) * splayInv) * splay;
        if (yAtt > 0.001 || xAtt > 0.001) {
          const prevX = dirX;
          const prevY = dirY;
          dirX = prevX * (1 - yAtt);
          dirY = prevY * (1 - xAtt);
          const prevLen = Math.sqrt(prevX * prevX + prevY * prevY);
          const nextLen = Math.sqrt(dirX * dirX + dirY * dirY);
          if (nextLen > 0.001) {
            const restore = prevLen / nextLen;
            dirX *= restore;
            dirY *= restore;
          }
        }
      }

      let edgeOpacity = 1;
      if (softEdge) {
        const ix = px - innerHalfW + innerRadius;
        const innerSdf =
          cornerDistance(ix > 0 ? ix : 0, innerEdgeY > 0 ? innerEdgeY : 0) +
          (ix > innerEdgeY ? (ix > 0 ? 0 : ix) : innerEdgeY > 0 ? 0 : innerEdgeY) -
          innerRadius;
        edgeOpacity = 0.5 * (1 + erf(innerSdf * falloff));
      }

      let dx = 0.5 * dirX * edgeOpacity;
      let dy = 0.5 * dirY * edgeOpacity;

      if (hasEdgeRefract) {
        // `s`: 1 at the outer rim (sdf=0) → 0 a band-width inward. The meniscus
        // is a soft bump that fades to 0 at BOTH ends and peaks ~1/3 of the band
        // inside the contour (6.75 = 27/4 normalises s²(1−s) to peak 1 at
        // s=2/3). It hits 0 at the very rim, so the extra bend lives just inside
        // the edge and never pushes hard AT the contour — the background wraps
        // inside the lip, not on the clip line.
        const s = sdf < 0 ? Math.max(0, 1 + sdf * erInv) : 0;
        if (s > 0) {
          const len = Math.sqrt(dirX * dirX + dirY * dirY);
          if (len > 1e-4) {
            const m = 6.75 * s * s * (1 - s);
            const a = (0.5 * bend * m * edgeOpacity) / len;
            dx += dirX * a;
            dy += dirY * a;
          }
        }
      }

      let specMain = 0;
      let specCross = 0;
      if (hasSpecular) {
        const normX = px * invW > 1 ? 1 : px * invW;
        // Projection onto the specular axis (`sheenAngle`) and its perpendicular,
        // normalized to 0..1 — this makes the highlight DIRECTIONAL, so it pools
        // on the corners facing the light instead of ringing the whole edge.
        const axisMain = Math.min(1, Math.abs(normX * cosA + normY * sinA) * sheenNorm);
        const axisCross = Math.min(1, Math.abs(normX * cosA - normY * sinA) * sheenNorm);

        if (sheen > 0) {
          // A bright edge band that pools toward the light. The 0.16 floor keeps
          // a faint edge all the way around so it still reads as glass.
          const band = sdf < 0 ? Math.max(0, 1 + sdf * edgeInv) : 0;
          const b = sheen * Math.pow(band, sheenFalloff);
          specMain += b * (0.16 + 0.84 * Math.pow(axisMain, 1.6));
          specCross += b * (0.16 + 0.84 * Math.pow(axisCross, 1.6));
        }

        if (glow > 0) {
          // Soft inner glow: a smoothstep on the distance in from the edge, so it
          // fades with zero slope at BOTH the edge and the reach (no hard ring),
          // reaching deep into the lens rather than hugging the rim.
          const reach = sdf < 0 ? Math.min(1, -sdf * glowReachInv) : 1;
          const t = 1 - reach;
          const g = glow * Math.pow(t * t * (3 - 2 * t), glowFalloff) * edgeOpacity;
          specMain += g * (0.6 + 0.4 * axisMain);
          specCross += g * (0.6 + 0.4 * axisCross);
        }

        if (specMain > 1) specMain = 1;
        else if (specMain < -1) specMain = -1;
        if (specCross > 1) specCross = 1;
        else if (specCross < -1) specCross = -1;
      }

      const rPos = encodeAxis(dx);
      const rNeg = encodeAxis(-dx);
      const gPos = encodeAxis(dy);
      const gNeg = encodeAxis(-dy);
      const bMain = encodeSpec(specMain);
      const bCross = encodeSpec(specCross);

      data[i00] = rPos; data[i00 + 1] = gPos; data[i00 + 2] = bMain; data[i00 + 3] = 255;
      data[i01] = rNeg; data[i01 + 1] = gPos; data[i01 + 2] = bCross; data[i01 + 3] = 255;
      data[i10] = rPos; data[i10 + 1] = gNeg; data[i10 + 2] = bCross; data[i10 + 3] = 255;
      data[i11] = rNeg; data[i11 + 1] = gNeg; data[i11 + 2] = bMain; data[i11 + 3] = 255;
    }
  }

  return data;
}

/**
 * Surround a lens field with `margin` px of neutral grey.
 *
 * The SVG filter region is deliberately larger than the element (so the
 * displacement can sample real content just outside the box, instead of
 * transparent black — that is what produces a dark contorted rim). The upstream
 * library covers the surplus with an `feFlood` and gives the `feImage` an
 * explicit pixel subregion. We can't know the pixel size in a static
 * stylesheet, so we bake the surplus into the map instead and let the `feImage`
 * stretch across the whole region: the lens then lands exactly on the element
 * box for ANY element size, with no per-element filter and no JS.
 *
 * The ratio is what ties the two together — a map whose lens occupies the middle
 * `inner / (inner + 2 · margin)` must be paired with a filter region of exactly
 * that reciprocal. `lensMapRegion()` below derives one from the other so they
 * cannot drift apart.
 */
export function padWithNeutral(field, size, margin) {
  const outSize = size + 2 * margin;
  const out = Buffer.alloc(outSize * outSize * 4);
  // Neutral grey, fully opaque: zero displacement, zero specular.
  for (let i = 0; i < out.length; i += 4) {
    out[i] = 128;
    out[i + 1] = 128;
    out[i + 2] = 128;
    out[i + 3] = 255;
  }
  for (let row = 0; row < size; row += 1) {
    const src = row * size * 4;
    const dst = ((row + margin) * outSize + margin) * 4;
    field.copy(out, dst, src, src + size * 4);
  }
  return { data: out, size: outSize };
}

/** The `filter` region that a padded map must be stretched across, as the
 *  percentages an SVG `<filter x y width height>` wants. */
export function lensMapRegion(size, margin) {
  const scale = (size + 2 * margin) / size;
  const inset = ((scale - 1) / 2) * 100;
  return {
    x: `${-inset}%`,
    y: `${-inset}%`,
    width: `${scale * 100}%`,
    height: `${scale * 100}%`,
  };
}
