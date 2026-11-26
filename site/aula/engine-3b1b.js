export const RENDERERS = [
  'vector_space',
  'calculus_curve',
  'neural_network',
  'probability_dist',
  'compound_growth',
  'system_flow',
];

const PALETTE = {
  bg: '#090D16',
  bgPanel: 'rgba(11, 17, 30, 0.88)',
  gridMinor: '#162238',
  gridMajor: '#1F304D',
  axis: '#35507A',
  cyan: '#58C4DD',
  gold: '#F7C948',
  emerald: '#83C167',
  coral: '#FC6255',
  violet: '#9A72AC',
  text: '#EEF4FF',
  muted: '#93A6C8',
  dim: '#5C7299',
};

const FONT_SANS = 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const FONT_MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const CANONICAL_PARAMS = {
  vector_space: {
    a: { id: 'a', label: 'a (îₓ)', min: -3, max: 3, step: 0.1, default: 1.5, unit: '' },
    b: { id: 'b', label: 'b (ĵₓ)', min: -3, max: 3, step: 0.1, default: 0.5, unit: '' },
    c: { id: 'c', label: 'c (îᵧ)', min: -3, max: 3, step: 0.1, default: 0.2, unit: '' },
    d: { id: 'd', label: 'd (ĵᵧ)', min: -3, max: 3, step: 0.1, default: 1.2, unit: '' },
  },
  calculus_curve: {
    x0: { id: 'x0', label: 'x₀', min: -2.8, max: 2.8, step: 0.05, default: 1.0, unit: '' },
    h: { id: 'h', label: 'Δx (h)', min: 0.02, max: 2.0, step: 0.02, default: 0.9, unit: '' },
    n: { id: 'n', label: 'n (particiones)', min: 1, max: 32, step: 1, default: 8, unit: '' },
    lr: { id: 'lr', label: 'Tasa lr', min: 0.02, max: 0.5, step: 0.02, default: 0.18, unit: '' },
  },
  neural_network: {
    w1: { id: 'w1', label: 'Peso w₁', min: -3, max: 3, step: 0.1, default: 1.2, unit: '' },
    w2: { id: 'w2', label: 'Peso w₂', min: -3, max: 3, step: 0.1, default: -0.9, unit: '' },
    bias: { id: 'bias', label: 'Sesgo b', min: -3, max: 3, step: 0.1, default: 0.2, unit: '' },
    inputA: { id: 'inputA', label: 'Entrada x₁', min: -1, max: 1, step: 0.05, default: 0.7, unit: '' },
  },
  probability_dist: {
    prior: { id: 'prior', label: 'Prior P(H)', min: 0.01, max: 0.95, step: 0.01, default: 0.15, unit: '' },
    sensitivity: { id: 'sensitivity', label: 'Sensibilidad', min: 0.1, max: 0.99, step: 0.01, default: 0.9, unit: '' },
    falsePos: { id: 'falsePos', label: 'Falso Positivo', min: 0.01, max: 0.8, step: 0.01, default: 0.08, unit: '' },
    mu: { id: 'mu', label: 'Media μ', min: -2.5, max: 2.5, step: 0.1, default: 0.0, unit: '' },
    sigma: { id: 'sigma', label: 'Desviación σ', min: 0.25, max: 2.5, step: 0.05, default: 1.0, unit: '' },
  },
  compound_growth: {
    capital: { id: 'capital', label: 'Capital', min: 1000, max: 100000, step: 500, default: 10000, unit: '$' },
    rate: { id: 'rate', label: 'Tasa r', min: 0.01, max: 0.4, step: 0.01, default: 0.12, unit: '' },
    years: { id: 'years', label: 'Años t', min: 1, max: 40, step: 1, default: 15, unit: 'años' },
  },
  system_flow: {
    throughput: { id: 'throughput', label: 'Flujo', min: 10, max: 100, step: 1, default: 72, unit: '%' },
    defense: { id: 'defense', label: 'Defensa', min: 0, max: 100, step: 1, default: 80, unit: '%' },
    latency: { id: 'latency', label: 'Latencia', min: 5, max: 200, step: 5, default: 25, unit: 'ms' },
  },
};

export function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function easeInOutCubic(t) {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeOutCubic(t) {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

export function tween(current, target, rate = 10, dt = 1 / 60) {
  const diff = target - current;
  if (Math.abs(diff) < 1e-4) return target;
  return current + diff * (1 - Math.exp(-rate * Math.max(dt, 0.001)));
}

function snapToDef(value, def) {
  if (!Number.isFinite(value)) return def?.default ?? 0;
  if (!def) return value;
  const min = Number.isFinite(def.min) ? def.min : -Infinity;
  const max = Number.isFinite(def.max) ? def.max : Infinity;
  let next = clamp(value, min, max);
  if (Number.isFinite(def.step) && def.step > 0) {
    const decimals = (String(def.step).split('.')[1] || '').length;
    next = Math.round(next / def.step) * def.step;
    next = Number(next.toFixed(Math.min(6, decimals + 1)));
    next = clamp(next, min, max);
  }
  return next;
}

function drawRoundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function drawBackground(ctx, width, height) {
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, width, height);

  const grad = ctx.createRadialGradient(
    width * 0.5,
    height * 0.45,
    Math.min(width, height) * 0.12,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.78
  );
  grad.addColorStop(0, 'rgba(30, 52, 88, 0.22)');
  grad.addColorStop(0.55, 'rgba(13, 21, 38, 0.15)');
  grad.addColorStop(1, 'rgba(3, 6, 12, 0.72)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

export function drawGrid(ctx, view, opts = {}) {
  const {
    originX,
    originY,
    scaleX,
    scaleY = scaleX,
    width,
    height,
    bounds,
  } = view;
  const {
    step = 1,
    subdivisions = 2,
    showLabels = true,
    minorColor = PALETTE.gridMinor,
    majorColor = PALETTE.gridMajor,
    axisColor = PALETTE.axis,
    alpha = 1,
  } = opts;

  const clipLeft = bounds ? bounds.x : 0;
  const clipTop = bounds ? bounds.y : 0;
  const clipRight = bounds ? bounds.x + bounds.w : width;
  const clipBottom = bounds ? bounds.y + bounds.h : height;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.rect(clipLeft, clipTop, clipRight - clipLeft, clipBottom - clipTop);
  ctx.clip();

  const xMin = Math.floor((clipLeft - originX) / scaleX / step) * step - step;
  const xMax = Math.ceil((clipRight - originX) / scaleX / step) * step + step;
  const yMin = Math.floor((originY - clipBottom) / scaleY / step) * step - step;
  const yMax = Math.ceil((originY - clipTop) / scaleY / step) * step + step;

  if (subdivisions > 1) {
    const subStep = step / subdivisions;
    ctx.strokeStyle = minorColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = xMin; x <= xMax; x += subStep) {
      const sx = originX + x * scaleX;
      ctx.moveTo(sx, clipTop);
      ctx.lineTo(sx, clipBottom);
    }
    for (let y = yMin; y <= yMax; y += subStep) {
      const sy = originY - y * scaleY;
      ctx.moveTo(clipLeft, sy);
      ctx.lineTo(clipRight, sy);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = majorColor;
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  for (let x = xMin; x <= xMax; x += step) {
    if (Math.abs(x) < 1e-6) continue;
    const sx = originX + x * scaleX;
    ctx.moveTo(sx, clipTop);
    ctx.lineTo(sx, clipBottom);
  }
  for (let y = yMin; y <= yMax; y += step) {
    if (Math.abs(y) < 1e-6) continue;
    const sy = originY - y * scaleY;
    ctx.moveTo(clipLeft, sy);
    ctx.lineTo(clipRight, sy);
  }
  ctx.stroke();

  ctx.strokeStyle = axisColor;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (originY >= clipTop && originY <= clipBottom) {
    ctx.moveTo(clipLeft, originY);
    ctx.lineTo(clipRight, originY);
  }
  if (originX >= clipLeft && originX <= clipRight) {
    ctx.moveTo(originX, clipTop);
    ctx.lineTo(originX, clipBottom);
  }
  ctx.stroke();

  if (showLabels) {
    ctx.fillStyle = PALETTE.dim;
    ctx.font = `500 10.5px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const labelY = clamp(originY + 6, clipTop + 4, clipBottom - 16);
    for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x += step) {
      if (Math.abs(x) < 1e-6) continue;
      const sx = originX + x * scaleX;
      if (sx < clipLeft + 16 || sx > clipRight - 16) continue;
      ctx.fillText(Number.isInteger(x) ? String(x) : x.toFixed(1), sx, labelY);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const labelX = clamp(originX - 7, clipLeft + 26, clipRight - 6);
    for (let y = Math.ceil(yMin); y <= Math.floor(yMax); y += step) {
      if (Math.abs(y) < 1e-6) continue;
      const sy = originY - y * scaleY;
      if (sy < clipTop + 12 || sy > clipBottom - 12) continue;
      ctx.fillText(Number.isInteger(y) ? String(y) : y.toFixed(1), labelX, sy);
    }
  }

  ctx.restore();
}

export function drawArrow(ctx, x1, y1, x2, y2, opts = {}) {
  const {
    color = PALETTE.cyan,
    width = 2.6,
    headLen = 11,
    glow = 12,
    alpha = 1,
    dashed = false,
  } = opts;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1.5) return;

  const angle = Math.atan2(dy, dx);
  const actualHead = Math.min(headLen, len * 0.45);
  const shaftEndX = x2 - Math.cos(angle) * (actualHead * 0.72);
  const shaftEndY = y2 - Math.sin(angle) * (actualHead * 0.72);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  if (glow > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  if (dashed) {
    ctx.setLineDash([6, 5]);
  }
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(shaftEndX, shaftEndY);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - actualHead * Math.cos(angle - Math.PI / 6.2),
    y2 - actualHead * Math.sin(angle - Math.PI / 6.2)
  );
  ctx.lineTo(
    x2 - actualHead * Math.cos(angle + Math.PI / 6.2),
    y2 - actualHead * Math.sin(angle + Math.PI / 6.2)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawGlowDot(ctx, x, y, opts = {}) {
  const {
    color = PALETTE.gold,
    radius = 5.5,
    glowRadius = radius * 3.4,
    ring = false,
    alpha = 1,
  } = opts;

  ctx.save();
  ctx.globalAlpha = alpha;
  const grad = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color);
  grad.addColorStop(1, 'rgba(9, 13, 22, 0)');

  ctx.globalAlpha = alpha * 0.42;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = alpha;
  if (ring) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.globalAlpha = alpha * 0.85;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1.5, radius * 0.42), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawBadgeLabel(ctx, text, x, y, opts = {}) {
  const {
    color = PALETTE.text,
    borderColor = 'rgba(88, 196, 221, 0.35)',
    bgColor = PALETTE.bgPanel,
    font = `600 11.5px ${FONT_MONO}`,
    align = 'center',
    baseline = 'middle',
    padX = 9,
    padY = 5,
    alpha = 1,
  } = opts;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const textW = metrics.width;
  const boxW = textW + padX * 2;
  const boxH = 20 + padY;

  let bx = x - boxW / 2;
  if (align === 'left') bx = x;
  else if (align === 'right') bx = x - boxW;

  let by = y - boxH / 2;
  if (baseline === 'top') by = y;
  else if (baseline === 'bottom') by = y - boxH;

  drawRoundedRectPath(ctx, bx, by, boxW, boxH, 7);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = borderColor;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + boxW / 2, by + boxH / 2 + 0.5);
  ctx.restore();
}

function drawHoverCrosshair(ctx, x, y, bounds, label) {
  ctx.save();
  ctx.strokeStyle = 'rgba(147, 166, 200, 0.25)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x, bounds.y);
  ctx.lineTo(x, bounds.y + bounds.h);
  ctx.moveTo(bounds.x, y);
  ctx.lineTo(bounds.x + bounds.w, y);
  ctx.stroke();
  ctx.restore();

  if (label) {
    const rightSide = x > bounds.x + bounds.w - 170;
    const topSide = y < bounds.y + 44;
    drawBadgeLabel(
      ctx,
      label,
      rightSide ? x - 12 : x + 12,
      topSide ? y + 18 : y - 16,
      {
        align: rightSide ? 'right' : 'left',
        color: PALETTE.text,
        borderColor: 'rgba(147, 166, 200, 0.4)',
        font: `500 11px ${FONT_MONO}`,
      }
    );
  }
}

function computeEigenpairs(a, b, c, d) {
  const tr = a + d;
  const det = a * d - b * c;
  const disc = tr * tr - 4 * det;
  if (disc < -1e-6) return [];

  const isScalar = Math.abs(b) < 1e-4 && Math.abs(c) < 1e-4 && Math.abs(a - d) < 1e-4;
  if (isScalar) {
    return [
      { lambda: a, vx: 1, vy: 0 },
      { lambda: d, vx: 0, vy: 1 },
    ];
  }

  const sqrtD = Math.sqrt(Math.max(0, disc));
  const l1 = 0.5 * (tr + sqrtD);
  const l2 = 0.5 * (tr - sqrtD);

  const vecForLambda = (lam) => {
    let vx = 0;
    let vy = 0;
    if (Math.abs(b) > 1e-5) {
      vx = b;
      vy = lam - a;
    } else if (Math.abs(c) > 1e-5) {
      vx = lam - d;
      vy = c;
    } else if (Math.abs(a - lam) < 1e-5) {
      vx = 1;
      vy = 0;
    } else {
      vx = 0;
      vy = 1;
    }
    const norm = Math.hypot(vx, vy) || 1;
    return { lambda: lam, vx: vx / norm, vy: vy / norm };
  };

  if (Math.abs(l1 - l2) < 1e-4) {
    return [vecForLambda(l1)];
  }
  return [vecForLambda(l1), vecForLambda(l2)];
}

function renderVectorSpace(ctx, state, layout) {
  const { width, height, params, pointer, entrance, beatState, simTime } = state;
  const pad = 28;
  const bounds = { x: pad, y: pad, w: width - pad * 2, h: height - pad * 2 };
  const scale = Math.min(bounds.w / 8.4, bounds.h / 5.8);
  const originX = width * 0.5;
  const originY = height * 0.52;
  const view = { originX, originY, scaleX: scale, scaleY: scale, width, height, bounds };

  // Subtle unwarped background grid for reference
  drawGrid(ctx, view, {
    step: 1,
    subdivisions: 2,
    showLabels: true,
    minorColor: 'rgba(22, 34, 56, 0.55)',
    majorColor: 'rgba(31, 48, 77, 0.65)',
    axisColor: 'rgba(53, 80, 122, 0.65)',
  });

  const warpMix = easeInOutCubic(clamp(entrance * 1.15, 0, 1));
  const a = lerp(1, params.a ?? 1.5, warpMix);
  const b = lerp(0, params.b ?? 0.5, warpMix);
  const c = lerp(0, params.c ?? 0.2, warpMix);
  const d = lerp(1, params.d ?? 1.2, warpMix);

  const transform = (vx, vy) => ({
    sx: originX + (a * vx + b * vy) * scale,
    sy: originY - (c * vx + d * vy) * scale,
  });

  // Warped linear transformation grid
  ctx.save();
  ctx.beginPath();
  ctx.rect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.clip();

  const span = 7;
  for (let i = -span; i <= span; i += 0.5) {
    const isMajor = Math.abs(i - Math.round(i)) < 1e-5;
    const isAxis = Math.abs(i) < 1e-5;
    ctx.strokeStyle = isAxis
      ? 'rgba(88, 196, 221, 0.42)'
      : isMajor
        ? 'rgba(56, 118, 168, 0.42)'
        : 'rgba(30, 54, 88, 0.3)';
    ctx.lineWidth = isAxis ? 1.8 : isMajor ? 1.15 : 0.75;

    const p1 = transform(i, -span);
    const p2 = transform(i, span);
    ctx.beginPath();
    ctx.moveTo(p1.sx, p1.sy);
    ctx.lineTo(p2.sx, p2.sy);
    ctx.stroke();

    const q1 = transform(-span, i);
    const q2 = transform(span, i);
    ctx.beginPath();
    ctx.moveTo(q1.sx, q1.sy);
    ctx.lineTo(q2.sx, q2.sy);
    ctx.stroke();
  }

  // Unit square ghost before transform
  ctx.strokeStyle = 'rgba(147, 166, 200, 0.28)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(originX, originY - scale, scale, scale);
  ctx.setLineDash([]);

  // Determinant parallelogram
  const det = a * d - b * c;
  const isSingular = Math.abs(det) < 0.08;
  const p0 = transform(0, 0);
  const pi = transform(1, 0);
  const pij = transform(1, 1);
  const pj = transform(0, 1);

  ctx.beginPath();
  ctx.moveTo(p0.sx, p0.sy);
  ctx.lineTo(pi.sx, pi.sy);
  ctx.lineTo(pij.sx, pij.sy);
  ctx.lineTo(pj.sx, pj.sy);
  ctx.closePath();

  if (isSingular) {
    const pulse = 0.22 + 0.14 * Math.sin(simTime * 5);
    ctx.fillStyle = `rgba(247, 201, 72, ${pulse})`;
    ctx.fill();
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (det >= 0) {
    ctx.fillStyle = 'rgba(88, 196, 221, 0.17)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(88, 196, 221, 0.65)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(252, 98, 85, 0.19)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(252, 98, 85, 0.72)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // Eigenvector spans and arrows
  const eigenpairs = computeEigenpairs(a, b, c, d);
  const eigenColors = [PALETTE.gold, PALETTE.violet];
  eigenpairs.forEach((pair, idx) => {
    const col = eigenColors[idx % eigenColors.length];
    const far = 6;
    const e1 = {
      sx: originX - pair.vx * far * scale,
      sy: originY + pair.vy * far * scale,
    };
    const e2 = {
      sx: originX + pair.vx * far * scale,
      sy: originY - pair.vy * far * scale,
    };
    ctx.save();
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.32;
    ctx.lineWidth = 1.3;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(e1.sx, e1.sy);
    ctx.lineTo(e2.sx, e2.sy);
    ctx.stroke();
    ctx.restore();

    const tipV = {
      sx: originX + pair.vx * 1.15 * scale,
      sy: originY - pair.vy * 1.15 * scale,
    };
    const tipAv = {
      sx: originX + pair.vx * 1.15 * pair.lambda * scale,
      sy: originY - pair.vy * 1.15 * pair.lambda * scale,
    };
    drawArrow(ctx, originX, originY, tipAv.sx, tipAv.sy, {
      color: col,
      width: 2.0,
      headLen: 9,
      glow: 8,
      alpha: 0.6,
      dashed: true,
    });
    drawArrow(ctx, originX, originY, tipV.sx, tipV.sy, {
      color: col,
      width: 2.3,
      headLen: 9,
      glow: 10,
      alpha: 0.95,
    });
    drawBadgeLabel(ctx, `v${idx + 1} (λ=${pair.lambda.toFixed(2)})`, tipV.sx, tipV.sy - 16, {
      color: col,
      borderColor: col,
      font: `600 10.5px ${FONT_MONO}`,
    });
  });

  // Basis vectors î and ĵ
  drawArrow(ctx, originX, originY, pi.sx, pi.sy, {
    color: PALETTE.emerald,
    width: 3.4,
    headLen: 13,
    glow: 14,
  });
  drawArrow(ctx, originX, originY, pj.sx, pj.sy, {
    color: PALETTE.coral,
    width: 3.4,
    headLen: 13,
    glow: 14,
  });

  const hoverI = Math.hypot(pointer.x - pi.sx, pointer.y - pi.sy) < 18;
  const hoverJ = Math.hypot(pointer.x - pj.sx, pointer.y - pj.sy) < 18;
  drawGlowDot(ctx, pi.sx, pi.sy, {
    color: PALETTE.emerald,
    radius: hoverI || layout.dragTarget === 'i_hat' ? 6.5 : 5,
    ring: hoverI || layout.dragTarget === 'i_hat',
  });
  drawGlowDot(ctx, pj.sx, pj.sy, {
    color: PALETTE.coral,
    radius: hoverJ || layout.dragTarget === 'j_hat' ? 6.5 : 5,
    ring: hoverJ || layout.dragTarget === 'j_hat',
  });

  drawBadgeLabel(ctx, `î = (${a.toFixed(1)}, ${c.toFixed(1)})`, pi.sx + 10, pi.sy + 18, {
    color: PALETTE.emerald,
    borderColor: 'rgba(131, 193, 103, 0.55)',
  });
  drawBadgeLabel(ctx, `ĵ = (${b.toFixed(1)}, ${d.toFixed(1)})`, pj.sx - 10, pj.sy - 18, {
    color: PALETTE.coral,
    borderColor: 'rgba(252, 98, 85, 0.55)',
  });

  ctx.restore();

  // Store interactive handles for hit testing
  layout.handles = [
    { id: 'i_hat', x: pi.sx, y: pi.sy, r: 20 },
    { id: 'j_hat', x: pj.sx, y: pj.sy, r: 20 },
  ];
  layout.view = view;

  // HUD card: Matrix & Determinant
  const hudX = bounds.x + 12;
  const hudY = bounds.y + 12;
  drawRoundedRectPath(ctx, hudX, hudY, 214, 82, 10);
  ctx.fillStyle = PALETTE.bgPanel;
  ctx.fill();
  ctx.strokeStyle = isSingular ? PALETTE.gold : 'rgba(88, 196, 221, 0.35)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = PALETTE.muted;
  ctx.font = `600 11px ${FONT_SANS}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('MATRIZ DE TRANSFORMACIÓN', hudX + 12, hudY + 10);

  ctx.font = `600 13.5px ${FONT_MONO}`;
  ctx.fillStyle = PALETTE.emerald;
  ctx.fillText(a.toFixed(2), hudX + 22, hudY + 31);
  ctx.fillText(c.toFixed(2), hudX + 22, hudY + 51);
  ctx.fillStyle = PALETTE.coral;
  ctx.fillText(b.toFixed(2), hudX + 86, hudY + 31);
  ctx.fillText(d.toFixed(2), hudX + 86, hudY + 51);

  ctx.fillStyle = isSingular ? PALETTE.gold : det < 0 ? PALETTE.coral : PALETTE.cyan;
  ctx.font = `700 12.5px ${FONT_MONO}`;
  ctx.fillText(`det = ${det.toFixed(2)}`, hudX + 132, hudY + 41);

  if (isSingular) {
    drawBadgeLabel(ctx, 'Colapso singular (det ≈ 0)', width - pad - 10, bounds.y + 16, {
      align: 'right',
      color: PALETTE.gold,
      borderColor: PALETTE.gold,
    });
  } else if (det < 0) {
    drawBadgeLabel(ctx, 'Orientación invertida (det < 0)', width - pad - 10, bounds.y + 16, {
      align: 'right',
      color: PALETTE.coral,
      borderColor: PALETTE.coral,
    });
  } else if (eigenpairs.length === 0) {
    drawBadgeLabel(ctx, 'Rotación pura (λ ∈ ℂ)', width - pad - 10, bounds.y + 16, {
      align: 'right',
      color: PALETTE.violet,
      borderColor: PALETTE.violet,
    });
  } else if (beatState?.highlight === 'det') {
    drawBadgeLabel(ctx, `Área escalada ×${Math.abs(det).toFixed(2)}`, width - pad - 10, bounds.y + 16, {
      align: 'right',
      color: PALETTE.cyan,
      borderColor: PALETTE.cyan,
    });
  }

  drawBadgeLabel(ctx, 'Arrastra las puntas de î o ĵ', width - pad - 10, height - pad - 14, {
    align: 'right',
    color: PALETTE.muted,
    borderColor: 'rgba(147, 166, 200, 0.25)',
    font: `500 10.5px ${FONT_SANS}`,
  });

  if (pointer.inside) {
    const wx = (pointer.x - originX) / scale;
    const wy = (originY - pointer.y) / scale;
    drawHoverCrosshair(ctx, pointer.x, pointer.y, bounds, `(${wx.toFixed(2)}, ${wy.toFixed(2)})`);
  }
}

function calcFn(x) {
  return 0.22 * x * x + 0.6 * Math.sin(1.5 * x) + 1.15;
}

function calcDeriv(x) {
  return 0.44 * x + 0.9 * Math.cos(1.5 * x);
}

function calcExactIntegral(a, b) {
  const anti = (x) => (0.22 / 3) * x * x * x - (0.6 / 1.5) * Math.cos(1.5 * x) + 1.15 * x;
  return anti(b) - anti(a);
}

function renderCalculusCurve(ctx, state, layout) {
  const { width, height, params, pointer, entrance, beatState, simTime, isPlaying } = state;
  const padL = 50;
  const padR = 28;
  const padT = 36;
  const padB = 40;
  const bounds = { x: padL, y: padT, w: width - padL - padR, h: height - padT - padB };

  const xMin = -3.4;
  const xMax = 3.4;
  const yMin = -0.6;
  const yMax = 4.2;
  const scaleX = bounds.w / (xMax - xMin);
  const scaleY = bounds.h / (yMax - yMin);
  const originX = bounds.x - xMin * scaleX;
  const originY = bounds.y + yMax * scaleY;
  const view = { originX, originY, scaleX, scaleY, width, height, bounds };

  const toScreen = (x, y) => ({
    sx: originX + x * scaleX,
    sy: originY - y * scaleY,
  });

  drawGrid(ctx, view, { step: 1, subdivisions: 2, showLabels: true });

  const mode = beatState?.mode || 'derivative';
  const x0 = clamp(params.x0 ?? 1.0, -2.8, 2.8);
  const h = clamp(params.h ?? 0.9, 0.02, 2.0);
  const n = Math.max(1, Math.round(params.n ?? 8));
  const lr = clamp(params.lr ?? 0.18, 0.02, 0.5);

  ctx.save();
  ctx.beginPath();
  ctx.rect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.clip();

  // Mode-specific shaded regions underneath curve
  if (mode === 'integral') {
    const aInt = -2.2;
    const bInt = Math.max(-1.0, x0);
    const dx = (bInt - aInt) / n;
    let riemannSum = 0;

    // Smooth true integral shadow
    ctx.beginPath();
    const pStart = toScreen(aInt, 0);
    ctx.moveTo(pStart.sx, pStart.sy);
    const samples = 80;
    for (let i = 0; i <= samples; i++) {
      const rx = lerp(aInt, bInt, i / samples);
      const pt = toScreen(rx, calcFn(rx));
      ctx.lineTo(pt.sx, pt.sy);
    }
    const pEnd = toScreen(bInt, 0);
    ctx.lineTo(pEnd.sx, pEnd.sy);
    ctx.closePath();
    ctx.fillStyle = 'rgba(88, 196, 221, 0.12)';
    ctx.fill();

    // Riemann rectangles
    const reveal = easeOutCubic(clamp(entrance * 1.1, 0, 1));
    for (let i = 0; i < n; i++) {
      const rx = aInt + i * dx;
      const midX = rx + dx * 0.5;
      const val = calcFn(midX);
      riemannSum += val * dx;
      const pTopLeft = toScreen(rx, val * reveal);
      const pBotRight = toScreen(rx + dx, 0);
      const rw = Math.max(1, pBotRight.sx - pTopLeft.sx - 1.2);
      const rh = pBotRight.sy - pTopLeft.sy;

      ctx.fillStyle = 'rgba(131, 193, 103, 0.24)';
      ctx.strokeStyle = PALETTE.emerald;
      ctx.lineWidth = 1.2;
      ctx.fillRect(pTopLeft.sx, pTopLeft.sy, rw, rh);
      ctx.strokeRect(pTopLeft.sx, pTopLeft.sy, rw, rh);
    }

    const exact = calcExactIntegral(aInt, bInt);
    drawBadgeLabel(
      ctx,
      `Riemann (n=${n}): ${riemannSum.toFixed(3)} · Exacta: ${exact.toFixed(3)}`,
      bounds.x + 12,
      bounds.y + 18,
      { align: 'left', color: PALETTE.emerald, borderColor: PALETTE.emerald }
    );
  }

  // Animated entrance trace of f(x)
  const drawEnd = lerp(xMin, xMax, easeOutCubic(clamp(entrance * 1.25, 0, 1)));
  ctx.save();
  ctx.strokeStyle = PALETTE.cyan;
  ctx.lineWidth = 3.1;
  ctx.shadowColor = PALETTE.cyan;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  const steps = 160;
  for (let i = 0; i <= steps; i++) {
    const x = lerp(xMin, drawEnd, i / steps);
    const pt = toScreen(x, calcFn(x));
    if (i === 0) ctx.moveTo(pt.sx, pt.sy);
    else ctx.lineTo(pt.sx, pt.sy);
  }
  ctx.stroke();
  ctx.restore();

  const y0 = calcFn(x0);
  const p0 = toScreen(x0, y0);
  const slope0 = calcDeriv(x0);

  if (mode === 'derivative') {
    const x1 = clamp(x0 + h, xMin + 0.1, xMax - 0.1);
    const y1 = calcFn(x1);
    const p1 = toScreen(x1, y1);
    const secantSlope = Math.abs(x1 - x0) > 1e-4 ? (y1 - y0) / (x1 - x0) : slope0;

    // Slope triangle
    const pCorner = toScreen(x1, y0);
    ctx.save();
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(p0.sx, p0.sy);
    ctx.lineTo(pCorner.sx, pCorner.sy);
    ctx.lineTo(p1.sx, p1.sy);
    ctx.stroke();
    ctx.restore();

    // Extended tangent line at x0
    const spanT = 1.6;
    const tA = toScreen(x0 - spanT, y0 - slope0 * spanT);
    const tB = toScreen(x0 + spanT, y0 + slope0 * spanT);
    ctx.save();
    ctx.strokeStyle = PALETTE.coral;
    ctx.lineWidth = 2.2;
    ctx.shadowColor = PALETTE.coral;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(tA.sx, tA.sy);
    ctx.lineTo(tB.sx, tB.sy);
    ctx.stroke();
    ctx.restore();

    // Extended secant line
    const sA = toScreen(x0 - spanT, y0 - secantSlope * spanT);
    const sB = toScreen(x0 + spanT, y0 + secantSlope * spanT);
    ctx.save();
    ctx.strokeStyle = PALETTE.emerald;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(sA.sx, sA.sy);
    ctx.lineTo(sB.sx, sB.sy);
    ctx.stroke();
    ctx.restore();

    drawGlowDot(ctx, p1.sx, p1.sy, { color: PALETTE.emerald, radius: 5 });
    if (Math.abs(pCorner.sx - p0.sx) > 22) {
      drawBadgeLabel(ctx, `Δx=${(x1 - x0).toFixed(2)}`, (p0.sx + pCorner.sx) * 0.5, pCorner.sy + 15, {
        color: PALETTE.gold,
        borderColor: 'rgba(247, 201, 72, 0.4)',
        font: `600 10px ${FONT_MONO}`,
      });
    }

    drawBadgeLabel(
      ctx,
      `Tangente f'(x₀) = ${slope0.toFixed(3)} · Secante = ${secantSlope.toFixed(3)}`,
      bounds.x + 12,
      bounds.y + 18,
      { align: 'left', color: PALETTE.gold, borderColor: 'rgba(247, 201, 72, 0.5)' }
    );
  } else if (mode === 'gradient') {
    // Compute gradient descent trajectory from x0
    const path = [x0];
    let curr = x0;
    for (let step = 0; step < 14; step++) {
      curr = clamp(curr - lr * calcDeriv(curr), xMin + 0.1, xMax - 0.1);
      path.push(curr);
    }

    // Draw trajectory breadcrumbs
    path.forEach((px, idx) => {
      const pt = toScreen(px, calcFn(px));
      ctx.save();
      ctx.fillStyle = PALETTE.violet;
      ctx.globalAlpha = clamp(1 - idx * 0.05, 0.25, 0.9);
      ctx.beginPath();
      ctx.arc(pt.sx, pt.sy, idx === 0 ? 4.5 : 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Animated rolling ball along descent path
    const cycle = isPlaying ? (simTime * 0.55) % 1 : 0;
    const fIdx = cycle * (path.length - 1);
    const i0 = Math.floor(fIdx);
    const i1 = Math.min(path.length - 1, i0 + 1);
    const bx = lerp(path[i0], path[i1], fIdx - i0);
    const by = calcFn(bx);
    const bp = toScreen(bx, by);

    // Downhill gradient vector arrow
    const gradDir = -Math.sign(calcDeriv(bx)) * Math.min(1.1, Math.abs(calcDeriv(bx)) * 0.7);
    if (Math.abs(gradDir) > 0.05) {
      const tip = toScreen(bx + gradDir, by);
      drawArrow(ctx, bp.sx, bp.sy, tip.sx, tip.sy, {
        color: PALETTE.coral,
        width: 2.5,
        headLen: 10,
      });
    }

    drawGlowDot(ctx, bp.sx, bp.sy, { color: PALETTE.gold, radius: 7, ring: true });
    const xMinFound = path[path.length - 1];
    drawBadgeLabel(
      ctx,
      `Descenso del gradiente · x₀=${x0.toFixed(2)} → mínimo x≈${xMinFound.toFixed(2)}`,
      bounds.x + 12,
      bounds.y + 18,
      { align: 'left', color: PALETTE.violet, borderColor: PALETTE.violet }
    );
  }

  // Draggable vertical guide & x0 handle
  ctx.save();
  ctx.strokeStyle = 'rgba(247, 201, 72, 0.38)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(p0.sx, originY);
  ctx.lineTo(p0.sx, p0.sy);
  ctx.stroke();
  ctx.restore();

  const hoverX0 = Math.hypot(pointer.x - p0.sx, pointer.y - p0.sy) < 20;
  drawGlowDot(ctx, p0.sx, p0.sy, {
    color: PALETTE.gold,
    radius: hoverX0 || layout.dragTarget === 'x0' ? 7 : 5.8,
    ring: hoverX0 || layout.dragTarget === 'x0',
  });
  drawBadgeLabel(ctx, `x₀ = ${x0.toFixed(2)}`, p0.sx, originY + 18, {
    color: PALETTE.gold,
    borderColor: 'rgba(247, 201, 72, 0.5)',
    font: `600 10.5px ${FONT_MONO}`,
  });

  ctx.restore();

  layout.handles = [{ id: 'x0', x: p0.sx, y: p0.sy, r: 24, axisDrag: true }];
  layout.view = view;

  drawBadgeLabel(ctx, 'Arrastra x₀ sobre la curva', width - padR - 8, height - padB - 14, {
    align: 'right',
    color: PALETTE.muted,
    borderColor: 'rgba(147, 166, 200, 0.25)',
    font: `500 10.5px ${FONT_SANS}`,
  });

  if (pointer.inside) {
    const wx = clamp((pointer.x - originX) / scaleX, xMin, xMax);
    const wy = calcFn(wx);
    drawHoverCrosshair(
      ctx,
      pointer.x,
      pointer.y,
      bounds,
      `x=${wx.toFixed(2)} · f(x)=${wy.toFixed(2)}`
    );
  }
}

function sigmoid(z) {
  return 1 / (1 + Math.exp(-clamp(z, -12, 12)));
}

function evalNeuralNet(params, x1, x2, x3) {
  const w1 = params.w1 ?? 1.2;
  const w2 = params.w2 ?? -0.9;
  const bias = params.bias ?? 0.2;

  const hWeights = [
    [w1, w2 * 0.6, bias * 0.4],
    [w1 * 0.5, w2, -bias * 0.3],
    [-w1 * 0.7, w2 * 0.8, bias * 0.8],
    [w1 * 0.9, -w2 * 0.5, bias * 0.6],
  ];

  const hidden = hWeights.map(([a, b, c]) => Math.tanh(a * x1 + b * x2 + c * x3));

  const outWeights = [
    [0.85 * Math.sign(w1 || 1), 0.75, -0.65, 0.7],
    [-0.85 * Math.sign(w1 || 1), -0.65, 0.75, -0.5],
  ];

  const logits = outWeights.map((row) =>
    row.reduce((acc, w, idx) => acc + w * hidden[idx], 0) + bias * 0.45
  );
  const exp0 = Math.exp(clamp(logits[0], -10, 10));
  const exp1 = Math.exp(clamp(logits[1], -10, 10));
  const sum = exp0 + exp1 || 1;
  const probs = [exp0 / sum, exp1 / sum];

  return { inputs: [x1, x2, x3], hidden, probs, hWeights, outWeights };
}

function renderNeuralNetwork(ctx, state, layout) {
  const { width, height, params, pointer, simTime, isPlaying, beatState } = state;
  const pad = 26;
  const bounds = { x: pad, y: pad, w: width - pad * 2, h: height - pad * 2 };

  drawGrid(
    ctx,
    {
      originX: width * 0.5,
      originY: height * 0.5,
      scaleX: 48,
      scaleY: 48,
      width,
      height,
      bounds,
    },
    { step: 1, subdivisions: 1, showLabels: false, alpha: 0.45 }
  );

  const x1 = clamp(params.inputA ?? 0.7, -1, 1);
  const x2 = clamp(beatState?.inputB ?? 0.45, -1, 1);
  const x3 = 1.0;

  const net = evalNeuralNet(params, x1, x2, x3);

  const layerX = [
    bounds.x + bounds.w * 0.12,
    bounds.x + bounds.w * 0.37,
    bounds.x + bounds.w * 0.61,
  ];
  const getLayerY = (count, idx) => {
    const usable = bounds.h * 0.68;
    const startY = bounds.y + bounds.h * 0.5 - usable * 0.5;
    return count === 1 ? bounds.y + bounds.h * 0.5 : startY + (usable * idx) / (count - 1);
  };

  const inPos = net.inputs.map((_, i) => ({ x: layerX[0], y: getLayerY(3, i) }));
  const hidPos = net.hidden.map((_, i) => ({ x: layerX[1], y: getLayerY(4, i) }));
  const outPos = net.probs.map((_, i) => ({ x: layerX[2], y: getLayerY(2, i) }));

  // Draw edges: Input -> Hidden
  const pulsePhase = isPlaying ? simTime * 0.75 : 0.35;
  net.hWeights.forEach((row, hIdx) => {
    row.forEach((w, iIdx) => {
      const pA = inPos[iIdx];
      const pB = hidPos[hIdx];
      const col = w >= 0 ? PALETTE.cyan : PALETTE.coral;
      const mag = clamp(Math.abs(w) / 3, 0.12, 1);
      ctx.save();
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.22 + mag * 0.55;
      ctx.lineWidth = 1.0 + mag * 2.6;
      ctx.beginPath();
      ctx.moveTo(pA.x, pA.y);
      ctx.lineTo(pB.x, pB.y);
      ctx.stroke();

      // Traveling signal pulse
      const t = (pulsePhase + iIdx * 0.19 + hIdx * 0.13) % 1;
      const px = lerp(pA.x, pB.x, t);
      const py = lerp(pA.y, pB.y, t);
      ctx.globalAlpha = 0.5 + mag * 0.5;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(px, py, 2.1 + mag * 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  });

  // Draw edges: Hidden -> Output
  net.outWeights.forEach((row, oIdx) => {
    row.forEach((w, hIdx) => {
      const pA = hidPos[hIdx];
      const pB = outPos[oIdx];
      const col = w >= 0 ? PALETTE.cyan : PALETTE.coral;
      const mag = clamp(Math.abs(w), 0.15, 1);
      ctx.save();
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.25 + mag * 0.45;
      ctx.lineWidth = 1.1 + mag * 2.2;
      ctx.beginPath();
      ctx.moveTo(pA.x, pA.y);
      ctx.lineTo(pB.x, pB.y);
      ctx.stroke();

      const t = (pulsePhase + 0.5 + hIdx * 0.16 + oIdx * 0.22) % 1;
      const px = lerp(pA.x, pB.x, t);
      const py = lerp(pA.y, pB.y, t);
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(px, py, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  });

  // Draw neurons
  const drawNeuron = (x, y, val, label, accent) => {
    const intensity = clamp(Math.abs(val), 0.15, 1);
    drawGlowDot(ctx, x, y, {
      color: accent,
      radius: 11 + intensity * 3,
      glowRadius: 24 + intensity * 10,
      alpha: 0.9,
    });
    ctx.save();
    ctx.fillStyle = PALETTE.bg;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 10px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(val.toFixed(2), x, y);
    ctx.restore();

    if (label) {
      drawBadgeLabel(ctx, label, x, y + 23, {
        color: PALETTE.muted,
        borderColor: 'rgba(147, 166, 200, 0.25)',
        font: `500 10px ${FONT_MONO}`,
        padX: 6,
        padY: 2,
      });
    }
  };

  inPos.forEach((p, idx) => {
    const labels = ['x₁ (drag)', 'x₂', 'sesgo (1)'];
    drawNeuron(
      p.x,
      p.y,
      net.inputs[idx],
      labels[idx],
      idx === 0 ? PALETTE.gold : PALETTE.cyan
    );
  });

  hidPos.forEach((p, idx) => {
    const act = net.hidden[idx];
    drawNeuron(p.x, p.y, act, `h${idx + 1}`, act >= 0 ? PALETTE.emerald : PALETTE.coral);
  });

  outPos.forEach((p, idx) => {
    const prob = net.probs[idx];
    const col = idx === 0 ? PALETTE.cyan : PALETTE.violet;
    drawNeuron(p.x, p.y, prob, idx === 0 ? 'P(A)' : 'P(B)', col);

    // Output probability bar
    const barX = p.x + 26;
    const barW = 74;
    const barH = 12;
    drawRoundedRectPath(ctx, barX, p.y - barH / 2, barW, barH, 6);
    ctx.fillStyle = 'rgba(22, 34, 56, 0.9)';
    ctx.fill();
    drawRoundedRectPath(ctx, barX, p.y - barH / 2, Math.max(6, barW * prob), barH, 6);
    ctx.fillStyle = col;
    ctx.fill();

    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 10.5px ${FONT_MONO}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(prob * 100)}%`, barX + barW + 7, p.y);
  });

  // Mini 2D decision-boundary heatmap inset on right
  const hmSize = clamp(Math.min(bounds.w * 0.22, bounds.h * 0.56), 96, 156);
  const hmX = bounds.x + bounds.w - hmSize - 8;
  const hmY = bounds.y + (bounds.h - hmSize) * 0.5;
  const cells = 22;
  const cellW = hmSize / cells;

  drawRoundedRectPath(ctx, hmX - 8, hmY - 26, hmSize + 16, hmSize + 48, 10);
  ctx.fillStyle = PALETTE.bgPanel;
  ctx.fill();
  ctx.strokeStyle = 'rgba(88, 196, 221, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = PALETTE.muted;
  ctx.font = `600 10px ${FONT_SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Frontera de Decisión 2D', hmX + hmSize * 0.5, hmY - 12);

  const w1 = params.w1 ?? 1.2;
  const w2 = params.w2 ?? -0.9;
  const bias = params.bias ?? 0.2;
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      const nx = lerp(-1, 1, (gx + 0.5) / cells);
      const ny = lerp(1, -1, (gy + 0.5) / cells);
      const p = sigmoid(w1 * nx * 2 + w2 * ny * 2 + bias);
      ctx.fillStyle = p >= 0.5
        ? `rgba(88, 196, 221, ${(0.15 + (p - 0.5) * 1.3).toFixed(2)})`
        : `rgba(252, 98, 85, ${(0.15 + (0.5 - p) * 1.3).toFixed(2)})`;
      ctx.fillRect(hmX + gx * cellW, hmY + gy * cellW, cellW + 0.5, cellW + 0.5);
    }
  }
  ctx.strokeStyle = 'rgba(147, 166, 200, 0.35)';
  ctx.strokeRect(hmX, hmY, hmSize, hmSize);

  // Current input point in heatmap
  const dotX = hmX + ((x1 + 1) * 0.5) * hmSize;
  const dotY = hmY + ((1 - x2) * 0.5) * hmSize;
  drawGlowDot(ctx, dotX, dotY, { color: PALETTE.gold, radius: 5, ring: true });

  ctx.fillStyle = PALETTE.dim;
  ctx.font = `500 9.5px ${FONT_MONO}`;
  ctx.textAlign = 'center';
  ctx.fillText(`w₁=${w1.toFixed(1)} w₂=${w2.toFixed(1)} b=${bias.toFixed(1)}`, hmX + hmSize * 0.5, hmY + hmSize + 13);

  layout.heatmapBox = { x: hmX, y: hmY, size: hmSize };
  layout.handles = [
    { id: 'inputA', x: inPos[0].x, y: inPos[0].y, r: 22 },
    { id: 'heatmap', x: dotX, y: dotY, r: 22 },
  ];

  drawBadgeLabel(ctx, 'Capa Entrada (3) → Oculta (4) → Salida (2)', bounds.x + 8, bounds.y + 12, {
    align: 'left',
    color: PALETTE.cyan,
    borderColor: 'rgba(88, 196, 221, 0.35)',
    font: `600 10.5px ${FONT_SANS}`,
  });

  if (pointer.inside) {
    if (
      pointer.x >= hmX &&
      pointer.x <= hmX + hmSize &&
      pointer.y >= hmY &&
      pointer.y <= hmY + hmSize
    ) {
      const hx = lerp(-1, 1, (pointer.x - hmX) / hmSize);
      const hy = lerp(1, -1, (pointer.y - hmY) / hmSize);
      const hp = sigmoid(w1 * hx * 2 + w2 * hy * 2 + bias);
      drawHoverCrosshair(
        ctx,
        pointer.x,
        pointer.y,
        { x: hmX, y: hmY, w: hmSize, h: hmSize },
        `x₁=${hx.toFixed(2)} · σ=${(hp * 100).toFixed(0)}%`
      );
    }
  }
}

function normalPdf(x, mu, sigma) {
  const s = Math.max(0.05, sigma);
  const z = (x - mu) / s;
  return (1 / (s * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
}

function renderProbabilityDist(ctx, state, layout) {
  const { width, height, params, pointer, entrance, beatState, lesson } = state;
  const hasBayesParams = Array.isArray(lesson?.params) && lesson.params.some((p) => p?.id === 'prior');
  const hasGaussParams = Array.isArray(lesson?.params) && lesson.params.some((p) => p?.id === 'mu');
  const mode = beatState?.mode
    ? beatState.mode === 'bayes'
      ? 'bayes'
      : 'gaussian'
    : hasBayesParams && !hasGaussParams
      ? 'bayes'
      : 'gaussian';

  if (mode === 'bayes') {
    const prior = clamp(params.prior ?? 0.15, 0.01, 0.95);
    const sensitivity = clamp(params.sensitivity ?? 0.9, 0.1, 0.99);
    const falsePos = clamp(params.falsePos ?? 0.08, 0.01, 0.8);

    const pad = 34;
    const sqSize = Math.min(width * 0.44, height - pad * 2 - 24);
    const sqX = Math.max(pad + 18, width * 0.09);
    const sqY = (height - sqSize) * 0.5;
    const reveal = easeOutCubic(clamp(entrance * 1.15, 0, 1));

    const splitX = sqX + sqSize * prior * reveal;
    const wLeft = splitX - sqX;
    const wRight = sqX + sqSize - splitX;
    const tpH = sqSize * sensitivity;
    const fpH = sqSize * falsePos;

    // Base square
    ctx.save();
    ctx.fillStyle = 'rgba(22, 34, 56, 0.55)';
    ctx.fillRect(sqX, sqY, sqSize, sqSize);

    // True Positive region (bottom-left)
    ctx.fillStyle = 'rgba(131, 193, 103, 0.34)';
    ctx.fillRect(sqX, sqY + sqSize - tpH, wLeft, tpH);
    ctx.strokeStyle = PALETTE.emerald;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(sqX, sqY + sqSize - tpH, wLeft, tpH);

    // False Negative region (top-left)
    ctx.fillStyle = 'rgba(147, 166, 200, 0.08)';
    ctx.fillRect(sqX, sqY, wLeft, sqSize - tpH);

    // False Positive region (bottom-right)
    ctx.fillStyle = 'rgba(252, 98, 85, 0.34)';
    ctx.fillRect(splitX, sqY + sqSize - fpH, wRight, fpH);
    ctx.strokeStyle = PALETTE.coral;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(splitX, sqY + sqSize - fpH, wRight, fpH);

    // Outer unit square border
    ctx.strokeStyle = PALETTE.cyan;
    ctx.lineWidth = 2;
    ctx.strokeRect(sqX, sqY, sqSize, sqSize);

    // Interactive vertical prior divider
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(splitX, sqY - 8);
    ctx.lineTo(splitX, sqY + sqSize + 8);
    ctx.stroke();
    ctx.restore();

    drawGlowDot(ctx, splitX, sqY + sqSize * 0.5, { color: PALETTE.gold, radius: 5.5, ring: true });

    drawBadgeLabel(ctx, `Prior P(H) = ${(prior * 100).toFixed(0)}%`, splitX, sqY - 18, {
      color: PALETTE.gold,
      borderColor: PALETTE.gold,
      font: `600 10.5px ${FONT_MONO}`,
    });
    if (wLeft > 42) {
      drawBadgeLabel(ctx, 'VP', sqX + wLeft * 0.5, sqY + sqSize - tpH * 0.5, {
        color: PALETTE.emerald,
        borderColor: PALETTE.emerald,
        font: `700 10.5px ${FONT_MONO}`,
      });
    }
    if (wRight > 42) {
      drawBadgeLabel(ctx, 'FP', splitX + wRight * 0.5, sqY + sqSize - Math.max(18, fpH * 0.5), {
        color: PALETTE.coral,
        borderColor: PALETTE.coral,
        font: `700 10.5px ${FONT_MONO}`,
      });
    }

    // Posterior summary panel on the right
    const tp = prior * sensitivity;
    const fp = (1 - prior) * falsePos;
    const posterior = tp / Math.max(1e-6, tp + fp);

    const panelX = sqX + sqSize + 36;
    const panelW = Math.max(180, width - panelX - 28);
    const panelY = sqY;
    drawRoundedRectPath(ctx, panelX, panelY, panelW, sqSize, 12);
    ctx.fillStyle = PALETTE.bgPanel;
    ctx.fill();
    ctx.strokeStyle = 'rgba(88, 196, 221, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = PALETTE.cyan;
    ctx.font = `700 12px ${FONT_SANS}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('TEOREMA DE BAYES · ÁREA UNITARIA', panelX + 16, panelY + 16);

    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 28px ${FONT_MONO}`;
    ctx.fillText(`${(posterior * 100).toFixed(1)}%`, panelX + 16, panelY + 46);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `500 11px ${FONT_SANS}`;
    ctx.fillText('Posterior P(H | E)', panelX + 16, panelY + 80);

    // Stacked ratio bar: VP vs FP
    const barX = panelX + 16;
    const barY = panelY + 108;
    const barW = panelW - 32;
    const barH = 18;
    drawRoundedRectPath(ctx, barX, barY, barW, barH, 8);
    ctx.fillStyle = PALETTE.coral;
    ctx.fill();
    drawRoundedRectPath(ctx, barX, barY, Math.max(6, barW * posterior), barH, 8);
    ctx.fillStyle = PALETTE.emerald;
    ctx.fill();

    ctx.font = `500 11px ${FONT_MONO}`;
    ctx.fillStyle = PALETTE.emerald;
    ctx.fillText(`VP = ${(tp * 100).toFixed(2)}%`, barX, barY + 30);
    ctx.fillStyle = PALETTE.coral;
    ctx.fillText(`FP = ${(fp * 100).toFixed(2)}%`, barX, barY + 50);
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('P(H|E) = VP / (VP + FP)', barX, barY + 76);

    layout.bayesBox = { x: sqX, y: sqY, size: sqSize };
    layout.handles = [{ id: 'prior', x: splitX, y: sqY + sqSize * 0.5, r: 26 }];

    if (pointer.inside && pointer.x >= sqX && pointer.x <= sqX + sqSize && pointer.y >= sqY && pointer.y <= sqY + sqSize) {
      const hoverP = (pointer.x - sqX) / sqSize;
      drawHoverCrosshair(ctx, pointer.x, pointer.y, { x: sqX, y: sqY, w: sqSize, h: sqSize }, `P=${(hoverP * 100).toFixed(0)}%`);
    }
    return;
  }

  // Gaussian Bell Curve mode
  const padL = 48;
  const padR = 28;
  const padT = 36;
  const padB = 42;
  const bounds = { x: padL, y: padT, w: width - padL - padR, h: height - padT - padB };
  const xMin = -5;
  const xMax = 5;
  const yMin = -0.05;
  const yMax = 1.15;
  const scaleX = bounds.w / (xMax - xMin);
  const scaleY = bounds.h / (yMax - yMin);
  const originX = bounds.x - xMin * scaleX;
  const originY = bounds.y + yMax * scaleY;
  const view = { originX, originY, scaleX, scaleY, width, height, bounds };
  const toScreen = (x, y) => ({ sx: originX + x * scaleX, sy: originY - y * scaleY });

  drawGrid(ctx, view, { step: 1, subdivisions: 2, showLabels: true });

  const mu = clamp(params.mu ?? 0, -2.5, 2.5);
  const sigma = clamp(params.sigma ?? 1.0, 0.25, 2.5);
  const reveal = easeOutCubic(clamp(entrance * 1.15, 0, 1));

  ctx.save();
  ctx.beginPath();
  ctx.rect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.clip();

  const fillBand = (a, b, fill) => {
    const sA = clamp(a, xMin, xMax);
    const sB = clamp(b, xMin, xMax);
    if (sB <= sA) return;
    ctx.beginPath();
    const start = toScreen(sA, 0);
    ctx.moveTo(start.sx, start.sy);
    for (let i = 0; i <= 64; i++) {
      const x = lerp(sA, sB, i / 64);
      const pt = toScreen(x, normalPdf(x, mu, sigma) * reveal);
      ctx.lineTo(pt.sx, pt.sy);
    }
    const end = toScreen(sB, 0);
    ctx.lineTo(end.sx, end.sy);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };

  fillBand(mu - 2 * sigma, mu + 2 * sigma, 'rgba(154, 114, 172, 0.20)');
  fillBand(mu - sigma, mu + sigma, 'rgba(88, 196, 221, 0.30)');

  // Bell curve outline
  ctx.save();
  ctx.strokeStyle = PALETTE.cyan;
  ctx.lineWidth = 3;
  ctx.shadowColor = PALETTE.cyan;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  for (let i = 0; i <= 180; i++) {
    const x = lerp(xMin, xMax, i / 180);
    const pt = toScreen(x, normalPdf(x, mu, sigma) * reveal);
    if (i === 0) ctx.moveTo(pt.sx, pt.sy);
    else ctx.lineTo(pt.sx, pt.sy);
  }
  ctx.stroke();
  ctx.restore();

  // Mean marker
  const peak = toScreen(mu, normalPdf(mu, mu, sigma) * reveal);
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 1.8;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(peak.sx, originY);
  ctx.lineTo(peak.sx, peak.sy);
  ctx.stroke();
  ctx.setLineDash([]);

  const sigPt = toScreen(mu + sigma, normalPdf(mu + sigma, mu, sigma) * reveal);
  drawGlowDot(ctx, peak.sx, peak.sy, { color: PALETTE.gold, radius: 6, ring: true });
  drawGlowDot(ctx, sigPt.sx, sigPt.sy, { color: PALETTE.violet, radius: 5.5, ring: true });

  drawBadgeLabel(ctx, `μ = ${mu.toFixed(2)}`, peak.sx, originY + 18, {
    color: PALETTE.gold,
    borderColor: PALETTE.gold,
    font: `600 10.5px ${FONT_MONO}`,
  });
  drawBadgeLabel(ctx, `±1σ (68.2%) · ±2σ (95.4%) · σ=${sigma.toFixed(2)}`, bounds.x + 12, bounds.y + 18, {
    align: 'left',
    color: PALETTE.cyan,
    borderColor: 'rgba(88, 196, 221, 0.45)',
  });

  ctx.restore();

  layout.view = view;
  layout.handles = [
    { id: 'mu', x: peak.sx, y: peak.sy, r: 22 },
    { id: 'sigma', x: sigPt.sx, y: sigPt.sy, r: 22 },
  ];

  if (pointer.inside) {
    const wx = clamp((pointer.x - originX) / scaleX, xMin, xMax);
    const wy = normalPdf(wx, mu, sigma);
    drawHoverCrosshair(ctx, pointer.x, pointer.y, bounds, `x=${wx.toFixed(2)} · p(x)=${wy.toFixed(3)}`);
  }
}

function formatMoney(v) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1000) return `$${Math.round(v).toLocaleString('en-US')}`;
  return `$${Math.round(v)}`;
}

function renderCompoundGrowth(ctx, state, layout) {
  const { width, height, params, pointer, entrance } = state;
  const padL = 68;
  const padR = 32;
  const padT = 40;
  const padB = 46;
  const bounds = { x: padL, y: padT, w: width - padL - padR, h: height - padT - padB };

  const capital = clamp(params.capital ?? 10000, 500, 500000);
  const rawRate = params.rate ?? 0.12;
  const rateDef = state.paramDefs?.get('rate');
  const isPercentRate = rateDef?.unit === '%' || (Number.isFinite(rateDef?.max) && rateDef.max > 1) || rawRate > 1;
  const rate = clamp(isPercentRate ? rawRate / 100 : rawRate, 0.005, 0.6);
  const years = Math.max(1, Math.round(params.years ?? 15));

  const maxYears = Math.max(years, 25);
  const finalCompound = capital * Math.pow(1 + rate, years);
  const finalLinear = capital * (1 + rate * years);
  const maxVal = Math.max(capital * Math.pow(1 + rate, maxYears), finalCompound * 1.12);

  const toScreen = (t, v) => ({
    sx: bounds.x + (t / maxYears) * bounds.w,
    sy: bounds.y + bounds.h - (v / maxVal) * bounds.h,
  });

  // Clean horizontal value grid
  ctx.save();
  ctx.strokeStyle = PALETTE.gridMinor;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const frac = i / 4;
    const y = bounds.y + bounds.h - frac * bounds.h;
    ctx.beginPath();
    ctx.moveTo(bounds.x, y);
    ctx.lineTo(bounds.x + bounds.w, y);
    ctx.stroke();

    ctx.fillStyle = PALETTE.dim;
    ctx.font = `500 10px ${FONT_MONO}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatMoney(maxVal * frac), bounds.x - 8, y);
  }

  for (let yr = 0; yr <= maxYears; yr += 5) {
    const x = bounds.x + (yr / maxYears) * bounds.w;
    ctx.beginPath();
    ctx.moveTo(x, bounds.y);
    ctx.lineTo(x, bounds.y + bounds.h);
    ctx.stroke();

    ctx.fillStyle = PALETTE.dim;
    ctx.font = `500 10px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${yr}a`, x, bounds.y + bounds.h + 8);
  }

  // Axes
  ctx.strokeStyle = PALETTE.axis;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(bounds.x, bounds.y);
  ctx.lineTo(bounds.x, bounds.y + bounds.h);
  ctx.lineTo(bounds.x + bounds.w, bounds.y + bounds.h);
  ctx.stroke();

  const reveal = easeOutCubic(clamp(entrance * 1.2, 0, 1));
  const activeYears = years * reveal;

  // Interactive year bars
  const barStep = years > 22 ? 2 : 1;
  for (let t = 1; t <= Math.floor(activeYears); t += barStep) {
    const val = capital * Math.pow(1 + rate, t);
    const pTop = toScreen(t, val);
    const pBase = toScreen(t, 0);
    const pCap = toScreen(t, capital);
    const bw = Math.max(4, (bounds.w / maxYears) * 0.45);

    ctx.fillStyle = 'rgba(88, 196, 221, 0.22)';
    ctx.fillRect(pTop.sx - bw / 2, pCap.sy, bw, pBase.sy - pCap.sy);

    ctx.fillStyle = 'rgba(247, 201, 72, 0.25)';
    ctx.fillRect(pTop.sx - bw / 2, pTop.sy, bw, pCap.sy - pTop.sy);
  }

  // Shaded delta region between exponential & linear
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const t = lerp(0, activeYears, i / 60);
    const pt = toScreen(t, capital * Math.pow(1 + rate, t));
    if (i === 0) ctx.moveTo(pt.sx, pt.sy);
    else ctx.lineTo(pt.sx, pt.sy);
  }
  for (let i = 60; i >= 0; i--) {
    const t = lerp(0, activeYears, i / 60);
    const pt = toScreen(t, capital * (1 + rate * t));
    ctx.lineTo(pt.sx, pt.sy);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(131, 193, 103, 0.22)';
  ctx.fill();

  // Linear reference curve
  const linStart = toScreen(0, capital);
  const linEnd = toScreen(activeYears, capital * (1 + rate * activeYears));
  ctx.strokeStyle = PALETTE.muted;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(linStart.sx, linStart.sy);
  ctx.lineTo(linEnd.sx, linEnd.sy);
  ctx.stroke();
  ctx.setLineDash([]);

  // Exponential curve
  ctx.save();
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 3.2;
  ctx.shadowColor = PALETTE.gold;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  for (let i = 0; i <= 90; i++) {
    const t = lerp(0, activeYears, i / 90);
    const pt = toScreen(t, capital * Math.pow(1 + rate, t));
    if (i === 0) ctx.moveTo(pt.sx, pt.sy);
    else ctx.lineTo(pt.sx, pt.sy);
  }
  ctx.stroke();
  ctx.restore();

  const endPt = toScreen(activeYears, capital * Math.pow(1 + rate, activeYears));
  drawGlowDot(ctx, endPt.sx, endPt.sy, { color: PALETTE.gold, radius: 6.5, ring: true });

  // Scrubber handle at years
  const scrubX = toScreen(years, 0).sx;
  ctx.strokeStyle = 'rgba(247, 201, 72, 0.45)';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(scrubX, bounds.y);
  ctx.lineTo(scrubX, bounds.y + bounds.h);
  ctx.stroke();
  ctx.setLineDash([]);

  // Final value HUD card
  const delta = finalCompound - finalLinear;
  const mult = finalCompound / capital;
  drawRoundedRectPath(ctx, bounds.x + 14, bounds.y + 10, 232, 82, 10);
  ctx.fillStyle = PALETTE.bgPanel;
  ctx.fill();
  ctx.strokeStyle = 'rgba(247, 201, 72, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = PALETTE.muted;
  ctx.font = `600 10.5px ${FONT_SANS}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`VALOR COMPUESTO (t = ${years} años)`, bounds.x + 26, bounds.y + 20);

  ctx.fillStyle = PALETTE.gold;
  ctx.font = `700 20px ${FONT_MONO}`;
  ctx.fillText(formatMoney(finalCompound), bounds.x + 26, bounds.y + 38);

  ctx.fillStyle = PALETTE.emerald;
  ctx.font = `600 11px ${FONT_MONO}`;
  ctx.fillText(`+${formatMoney(delta)} delta · ×${mult.toFixed(2)}`, bounds.x + 26, bounds.y + 66);

  ctx.restore();

  layout.growthBounds = { ...bounds, maxYears };
  layout.handles = [{ id: 'years', x: endPt.sx, y: endPt.sy, r: 26 }];

  if (pointer.inside && pointer.x >= bounds.x && pointer.x <= bounds.x + bounds.w) {
    const hoverT = clamp(((pointer.x - bounds.x) / bounds.w) * maxYears, 0, maxYears);
    const hoverV = capital * Math.pow(1 + rate, hoverT);
    drawHoverCrosshair(ctx, pointer.x, pointer.y, bounds, `Año ${hoverT.toFixed(1)} · ${formatMoney(hoverV)}`);
  }
}

function renderSystemFlow(ctx, state, layout) {
  const { width, height, params, pointer, simTime, isPlaying, beatState, lesson } = state;
  const pad = 28;
  const bounds = { x: pad, y: pad, w: width - pad * 2, h: height - pad * 2 };

  drawGrid(
    ctx,
    {
      originX: width * 0.5,
      originY: height * 0.5,
      scaleX: 52,
      scaleY: 52,
      width,
      height,
      bounds,
    },
    { step: 1, subdivisions: 1, showLabels: false, alpha: 0.42 }
  );

  const throughput = clamp(params.throughput ?? 72, 10, 100);
  const defense = clamp(params.defense ?? 80, 0, 100);
  const latency = clamp(params.latency ?? 25, 5, 200);
  const focusIdx = Number.isInteger(beatState?.focusNode)
    ? beatState.focusNode
    : Number.isInteger(beatState?.activeNode)
      ? beatState.activeNode
      : -1;
  const attackPulse = Boolean(beatState?.attackPulse);

  const customNodes = Array.isArray(beatState?.nodes) && beatState.nodes.length >= 5
    ? beatState.nodes
    : [
        'Origen / Solicitud',
        'Cifrado TLS / Token',
        'Escudo / Validación',
        'Motor de Procesamiento',
        'Consenso / Auditoría',
        'Destino Seguro',
      ];

  const coords = [
    { rx: 0.14, ry: 0.34, color: PALETTE.cyan },
    { rx: 0.38, ry: 0.24, color: PALETTE.violet },
    { rx: 0.58, ry: 0.42, color: PALETTE.emerald },
    { rx: 0.38, ry: 0.68, color: PALETTE.gold },
    { rx: 0.65, ry: 0.72, color: PALETTE.cyan },
    { rx: 0.86, ry: 0.48, color: PALETTE.emerald },
  ];

  const nodes = coords.map((c, idx) => ({
    idx,
    label: customNodes[idx] || `Nodo ${idx + 1}`,
    x: bounds.x + bounds.w * c.rx,
    y: bounds.y + bounds.h * c.ry,
    color: c.color,
  }));

  const edges = [
    [0, 1],
    [1, 2],
    [0, 3],
    [3, 4],
    [2, 5],
    [4, 5],
    [2, 4],
  ];

  const isBottleneck = throughput > defense + 15 || latency > 110;
  const speed = clamp((throughput / 50) * (60 / Math.max(15, latency)), 0.25, 2.4);
  const packetTime = isPlaying ? simTime * speed : 0.45;

  const evalBezier = (p0, p1, t) => {
    const cx1 = lerp(p0.x, p1.x, 0.48);
    const cy1 = p0.y;
    const cx2 = lerp(p0.x, p1.x, 0.52);
    const cy2 = p1.y;
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * cx1 + 3 * u * t * t * cx2 + t * t * t * p1.x,
      y: u * u * u * p0.y + 3 * u * u * t * cy1 + 3 * u * t * t * cy2 + t * t * t * p1.y,
      cx1,
      cy1,
      cx2,
      cy2,
    };
  };

  edges.forEach(([fromIdx, toIdx], eIdx) => {
    const p0 = nodes[fromIdx];
    const p1 = nodes[toIdx];
    const mid = evalBezier(p0, p1, 0.5);
    const highlighted = focusIdx === fromIdx || focusIdx === toIdx;

    ctx.save();
    ctx.strokeStyle = highlighted ? PALETTE.gold : isBottleneck && toIdx === 2 ? PALETTE.coral : 'rgba(88, 196, 221, 0.35)';
    ctx.lineWidth = highlighted ? 2.6 : 1.8;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.bezierCurveTo(mid.cx1, mid.cy1, mid.cx2, mid.cy2, p1.x, p1.y);
    ctx.stroke();

    // Traveling animated energy packets
    const packetCount = throughput > 65 ? 3 : 2;
    for (let k = 0; k < packetCount; k++) {
      const t = (packetTime * 0.42 + eIdx * 0.17 + k / packetCount) % 1;
      const pos = evalBezier(p0, p1, t);
      const isThreat = k === 0 && eIdx % 2 === 1 && (attackPulse || defense < 70);
      const pktColor = isThreat ? PALETTE.coral : highlighted ? PALETTE.gold : PALETTE.cyan;
      drawGlowDot(ctx, pos.x, pos.y, { color: pktColor, radius: 3.4, glowRadius: 10 });
    }
    ctx.restore();
  });

  // Draw nodes with shield / queue rings
  let hoveredNode = null;
  nodes.forEach((node) => {
    const isFocused = focusIdx === node.idx;
    const isHovered = Math.hypot(pointer.x - node.x, pointer.y - node.y) < 30;
    if (isHovered) hoveredNode = node;

    const ringRadius = node.idx === 2 ? 26 + (defense / 100) * 10 : 24;
    if (node.idx === 2) {
      // Defense shield aura
      ctx.save();
      ctx.strokeStyle = defense >= 60 ? PALETTE.emerald : PALETTE.coral;
      ctx.lineWidth = 2.2;
      ctx.globalAlpha = 0.35 + 0.35 * (defense / 100);
      ctx.beginPath();
      ctx.arc(node.x, node.y, ringRadius, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * (defense / 100));
      ctx.stroke();
      ctx.restore();
    }

    drawGlowDot(ctx, node.x, node.y, {
      color: isFocused ? PALETTE.gold : node.color,
      radius: isFocused || isHovered ? 16 : 14,
      glowRadius: isFocused ? 40 : 28,
      ring: isFocused || isHovered,
    });

    ctx.save();
    ctx.fillStyle = PALETTE.bg;
    ctx.beginPath();
    ctx.arc(node.x, node.y, 12.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isFocused ? PALETTE.gold : node.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 11px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`0${node.idx + 1}`, node.x, node.y);
    ctx.restore();

    drawBadgeLabel(ctx, node.label, node.x, node.y + 27, {
      color: isFocused ? PALETTE.gold : PALETTE.text,
      borderColor: isFocused ? PALETTE.gold : 'rgba(88, 196, 221, 0.3)',
      font: `600 10.5px ${FONT_SANS}`,
      padX: 7,
      padY: 3,
    });
  });

  // Resilience & Telemetry HUD
  const resilience = clamp(defense * 0.72 + (100 - latency * 0.35) * 0.28, 5, 99);
  const hudY = bounds.y + bounds.h - 46;
  drawRoundedRectPath(ctx, bounds.x + 8, hudY, bounds.w - 16, 40, 10);
  ctx.fillStyle = PALETTE.bgPanel;
  ctx.fill();
  ctx.strokeStyle = isBottleneck ? PALETTE.coral : 'rgba(88, 196, 221, 0.35)';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  const metrics = [
    { label: 'Flujo', val: `${Math.round(throughput)}%`, color: PALETTE.cyan },
    { label: 'Defensa', val: `${Math.round(defense)}%`, color: defense >= 60 ? PALETTE.emerald : PALETTE.coral },
    { label: 'Latencia', val: `${Math.round(latency)} ms`, color: latency <= 90 ? PALETTE.gold : PALETTE.coral },
    { label: 'Resiliencia', val: `${Math.round(resilience)}%`, color: resilience >= 65 ? PALETTE.emerald : PALETTE.gold },
  ];
  metrics.forEach((m, i) => {
    const mx = bounds.x + 24 + ((bounds.w - 48) * i) / 4;
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `500 10px ${FONT_SANS}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.label, mx, hudY + 13);
    ctx.fillStyle = m.color;
    ctx.font = `700 12px ${FONT_MONO}`;
    ctx.fillText(m.val, mx, hudY + 28);
  });

  if (lesson?.title) {
    drawBadgeLabel(ctx, lesson.title, bounds.x + 10, bounds.y + 14, {
      align: 'left',
      color: PALETTE.cyan,
      borderColor: 'rgba(88, 196, 221, 0.35)',
      font: `600 11px ${FONT_SANS}`,
    });
  }

  layout.handles = nodes.map((n) => ({ id: `node_${n.idx}`, x: n.x, y: n.y, r: 24 }));
  layout.bounds = bounds;

  if (pointer.inside && hoveredNode) {
    drawBadgeLabel(
      ctx,
      `${hoveredNode.label} · ${isBottleneck ? 'Carga elevada' : 'Estado óptimo'}`,
      hoveredNode.x,
      hoveredNode.y - 32,
      { color: PALETTE.gold, borderColor: PALETTE.gold, font: `600 10.5px ${FONT_SANS}` }
    );
  }
}

const RENDER_FN_MAP = {
  vector_space: renderVectorSpace,
  calculus_curve: renderCalculusCurve,
  neural_network: renderNeuralNetwork,
  probability_dist: renderProbabilityDist,
  compound_growth: renderCompoundGrowth,
  system_flow: renderSystemFlow,
};

export function createThreeBlueEngine(canvasEl, { onParamChange } = {}) {
  const ctx = canvasEl && typeof canvasEl.getContext === 'function' ? canvasEl.getContext('2d') : null;

  const state = {
    renderer: 'vector_space',
    lesson: null,
    beatIndex: 0,
    beatState: {},
    paramDefs: new Map(),
    targetParams: {},
    params: {},
    isPlaying: false,
    simTime: 0,
    entrance: 0,
    beatEase: 1,
    beatProgress: 1,
    width: 800,
    height: 450,
    dpr: 1,
    destroyed: false,
    pointer: { x: 0, y: 0, inside: false, down: false },
  };

  const layout = {
    handles: [],
    dragTarget: null,
    view: null,
    heatmapBox: null,
    bayesBox: null,
    growthBounds: null,
    bounds: null,
  };

  let rafId = 0;
  let lastTs = 0;
  let resizeObserver = null;

  function initRendererDefaults(rendererName, lessonParams) {
    const canonical = CANONICAL_PARAMS[rendererName] || CANONICAL_PARAMS.system_flow;
    state.paramDefs = new Map();

    Object.values(canonical).forEach((def) => {
      state.paramDefs.set(def.id, { ...def });
    });

    if (Array.isArray(lessonParams)) {
      lessonParams.forEach((p) => {
        if (!p || !p.id) return;
        const prev = state.paramDefs.get(p.id) || {};
        state.paramDefs.set(p.id, {
          id: p.id,
          label: p.label ?? prev.label ?? p.id,
          min: Number.isFinite(Number(p.min)) ? Number(p.min) : prev.min ?? -10,
          max: Number.isFinite(Number(p.max)) ? Number(p.max) : prev.max ?? 10,
          step: Number.isFinite(Number(p.step)) ? Number(p.step) : prev.step ?? 0.1,
          default: Number.isFinite(Number(p.default)) ? Number(p.default) : prev.default ?? 0,
          unit: p.unit ?? prev.unit ?? '',
        });
      });
    }

    const nextTargets = {};
    const nextDisplay = {};
    state.paramDefs.forEach((def, id) => {
      const val = snapToDef(def.default, def);
      nextTargets[id] = val;
      nextDisplay[id] = val;
    });

    state.targetParams = nextTargets;
    state.params = nextDisplay;
  }

  function applyParamInternal(id, value, immediate = false) {
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    const def = state.paramDefs.get(id);
    const snapped = snapToDef(num, def);
    if (!def) {
      state.paramDefs.set(id, { id, label: id, min: -1e6, max: 1e6, step: 0.01, default: snapped });
    }
    state.targetParams[id] = snapped;
    if (immediate || !(id in state.params)) {
      state.params[id] = snapped;
    }
  }

  function resize() {
    if (!canvasEl || state.destroyed) return;
    const rect = canvasEl.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || canvasEl.clientWidth || 800));
    const h = Math.max(1, Math.round(rect.height || canvasEl.clientHeight || 450));
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2.5);

    if (canvasEl.width !== Math.round(w * dpr) || canvasEl.height !== Math.round(h * dpr)) {
      canvasEl.width = Math.round(w * dpr);
      canvasEl.height = Math.round(h * dpr);
    }
    state.width = w;
    state.height = h;
    state.dpr = dpr;
  }

  function drawOnce(dt = 1 / 60) {
    if (state.destroyed || !ctx) return;
    ctx.save();
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    drawBackground(ctx, state.width, state.height);
    const drawFn = RENDER_FN_MAP[state.renderer] || renderSystemFlow;
    drawFn(ctx, state, layout, dt);
    ctx.restore();
  }

  function loadLesson(lesson) {
    state.lesson = lesson || null;
    const candidate = lesson?.renderer;
    state.renderer = RENDERERS.includes(candidate) ? candidate : 'system_flow';
    initRendererDefaults(state.renderer, lesson?.params);
    state.entrance = typeof requestAnimationFrame === 'function' ? 0 : 1;
    state.beatProgress = typeof requestAnimationFrame === 'function' ? 0 : 1;
    state.beatEase = typeof requestAnimationFrame === 'function' ? 0 : 1;
    state.beatIndex = 0;
    state.beatState = {};
    layout.dragTarget = null;

    if (Array.isArray(lesson?.beats) && lesson.beats.length > 0) {
      setBeat(lesson.beats[0], 0);
    } else {
      drawOnce();
    }
  }

  function setBeat(beat, beatIndex = 0) {
    state.beatIndex = beatIndex;
    state.beatProgress = 0;
    state.beatEase = 0;
    const sceneState = beat && typeof beat.sceneState === 'object' && beat.sceneState !== null
      ? { ...beat.sceneState }
      : {};
    state.beatState = sceneState;

    const paramOverrides = sceneState.params && typeof sceneState.params === 'object'
      ? sceneState.params
      : sceneState;

    Object.entries(paramOverrides).forEach(([key, val]) => {
      if (state.paramDefs.has(key) && typeof val === 'number' && Number.isFinite(val)) {
        applyParamInternal(key, val, false);
      }
    });
    drawOnce();
  }

  function setParam(id, value) {
    applyParamInternal(id, value, false);
  }

  function getParams() {
    return { ...state.targetParams };
  }

  function setPlaying(bool) {
    state.isPlaying = Boolean(bool);
  }

  function emitParamChange(id, rawValue) {
    const def = state.paramDefs.get(id);
    const val = snapToDef(rawValue, def);
    applyParamInternal(id, val, true);
    if (typeof onParamChange === 'function') {
      onParamChange(id, val);
    }
  }

  function handlePointerDown(ev) {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    state.pointer = { x, y, inside: true, down: true };

    for (const handle of layout.handles) {
      if (Math.hypot(x - handle.x, y - handle.y) <= (handle.r || 20)) {
        layout.dragTarget = handle.id;
        canvasEl.style.cursor = 'grabbing';
        if (typeof canvasEl.setPointerCapture === 'function') {
          try {
            canvasEl.setPointerCapture(ev.pointerId);
          } catch {
            // Ignore synthetic pointer events
          }
        }
        return;
      }
    }

    // Fallback direct click-to-scrub on calculus, growth, neural heatmap, or bayes
    if (state.renderer === 'calculus_curve' && layout.view) {
      layout.dragTarget = 'x0';
      const wx = (x - layout.view.originX) / layout.view.scaleX;
      emitParamChange('x0', wx);
    } else if (state.renderer === 'compound_growth' && layout.growthBounds) {
      const gb = layout.growthBounds;
      if (x >= gb.x && x <= gb.x + gb.w) {
        layout.dragTarget = 'years';
        emitParamChange('years', ((x - gb.x) / gb.w) * gb.maxYears);
      }
    } else if (state.renderer === 'neural_network' && layout.heatmapBox) {
      const hb = layout.heatmapBox;
      if (x >= hb.x && x <= hb.x + hb.size && y >= hb.y && y <= hb.y + hb.size) {
        layout.dragTarget = 'heatmap';
        emitParamChange('inputA', lerp(-1, 1, clamp((x - hb.x) / hb.size, 0, 1)));
      }
    } else if (state.renderer === 'system_flow' && layout.bounds) {
      const hitNode = layout.handles.find((h) => Math.hypot(x - h.x, y - h.y) <= 28);
      if (hitNode) {
        const idx = Number(hitNode.id.replace('node_', ''));
        state.beatState = { ...state.beatState, focusNode: idx };
      }
    }
  }

  function handlePointerMove(ev) {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    state.pointer.x = x;
    state.pointer.y = y;
    state.pointer.inside = true;

    if (layout.dragTarget) {
      if (state.renderer === 'vector_space' && layout.view) {
        const wx = (x - layout.view.originX) / layout.view.scaleX;
        const wy = (layout.view.originY - y) / layout.view.scaleY;
        if (layout.dragTarget === 'i_hat') {
          emitParamChange('a', wx);
          emitParamChange('c', wy);
        } else if (layout.dragTarget === 'j_hat') {
          emitParamChange('b', wx);
          emitParamChange('d', wy);
        }
      } else if (state.renderer === 'calculus_curve' && layout.view && layout.dragTarget === 'x0') {
        const wx = (x - layout.view.originX) / layout.view.scaleX;
        emitParamChange('x0', wx);
      } else if (state.renderer === 'neural_network') {
        if (layout.dragTarget === 'heatmap' && layout.heatmapBox) {
          const hb = layout.heatmapBox;
          emitParamChange('inputA', lerp(-1, 1, clamp((x - hb.x) / hb.size, 0, 1)));
        } else if (layout.dragTarget === 'inputA') {
          const norm = clamp((state.height * 0.5 - y) / (state.height * 0.35), -1, 1);
          emitParamChange('inputA', norm);
        }
      } else if (state.renderer === 'probability_dist') {
        if (layout.dragTarget === 'prior' && layout.bayesBox) {
          const bb = layout.bayesBox;
          emitParamChange('prior', (x - bb.x) / bb.size);
        } else if (layout.view) {
          const wx = (x - layout.view.originX) / layout.view.scaleX;
          if (layout.dragTarget === 'mu') {
            emitParamChange('mu', wx);
          } else if (layout.dragTarget === 'sigma') {
            emitParamChange('sigma', Math.abs(wx - (state.targetParams.mu ?? 0)));
          }
        }
      } else if (state.renderer === 'compound_growth' && layout.growthBounds && layout.dragTarget === 'years') {
        const gb = layout.growthBounds;
        emitParamChange('years', ((x - gb.x) / gb.w) * gb.maxYears);
      }
      return;
    }

    const overHandle = layout.handles.some((h) => Math.hypot(x - h.x, y - h.y) <= (h.r || 20));
    canvasEl.style.cursor = overHandle ? 'grab' : 'crosshair';
  }

  function handlePointerUp() {
    layout.dragTarget = null;
    state.pointer.down = false;
    if (canvasEl) {
      canvasEl.style.cursor = 'crosshair';
    }
  }

  function handlePointerLeave() {
    state.pointer.inside = false;
    if (!state.pointer.down) {
      layout.dragTarget = null;
    }
  }

  function renderFrame(ts) {
    if (state.destroyed) return;
    if (!lastTs) lastTs = ts;
    const dt = clamp((ts - lastTs) / 1000, 0.001, 0.05);
    lastTs = ts;

    if (state.isPlaying) {
      state.simTime += dt;
    }
    state.entrance = Math.min(1, state.entrance + dt * 1.45);
    state.beatProgress = Math.min(1, state.beatProgress + dt * 1.8);
    state.beatEase = easeInOutCubic(state.beatProgress);

    Object.keys(state.targetParams).forEach((key) => {
      const cur = key in state.params ? state.params[key] : state.targetParams[key];
      state.params[key] = tween(cur, state.targetParams[key], 11, dt);
    });

    drawOnce(dt);

    if (typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(renderFrame);
    }
  }

  if (canvasEl) {
    resize();
    canvasEl.addEventListener('pointerdown', handlePointerDown);
    canvasEl.addEventListener('pointermove', handlePointerMove);
    canvasEl.addEventListener('pointerup', handlePointerUp);
    canvasEl.addEventListener('pointercancel', handlePointerUp);
    canvasEl.addEventListener('pointerleave', handlePointerLeave);

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => resize());
      resizeObserver.observe(canvasEl.parentElement || canvasEl);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', resize);
    }
    if (typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(renderFrame);
    }
  }

  function destroy() {
    state.destroyed = true;
    if (rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', resize);
    }
    if (canvasEl) {
      canvasEl.removeEventListener('pointerdown', handlePointerDown);
      canvasEl.removeEventListener('pointermove', handlePointerMove);
      canvasEl.removeEventListener('pointerup', handlePointerUp);
      canvasEl.removeEventListener('pointercancel', handlePointerUp);
      canvasEl.removeEventListener('pointerleave', handlePointerLeave);
    }
  }

  return {
    loadLesson,
    setBeat,
    setParam,
    getParams,
    setPlaying,
    resize,
    destroy,
  };
}
