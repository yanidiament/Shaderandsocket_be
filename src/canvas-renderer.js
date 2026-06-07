/**
 * Helper to interpolate two numbers
 */
export function lerp(start, end, amt) {
  return (1 - amt) * start + amt * end;
}

/**
 * Converts a hex color string (#rrggbb) to an RGB object
 */
export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 255, g: 255, b: 255 };
}

/**
 * Converts an RGB object to a hex color string
 */
export function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/**
 * Interpolates two hex colors
 */
export function lerpColor(c1, c2, amt) {
  const rgb1 = hexToRgb(c1);
  const rgb2 = hexToRgb(c2);

  const r = Math.round(lerp(rgb1.r, rgb2.r, amt));
  const g = Math.round(lerp(rgb1.g, rgb2.g, amt));
  const b = Math.round(lerp(rgb1.b, rgb2.b, amt));

  return rgbToHex(r, g, b);
}

/**
 * Interpolates numeric parameters between a current and a target state
 */
export function lerpState(current, target, factor) {
  const result = { ...current };

  // Interpolate numeric properties
  const numericKeys = [
    'count', 'opacity', 'speed', 'scale', 'rotation', 'noise', 
    'gradientAngle', 'repeatCount'
  ];
  numericKeys.forEach((key) => {
    if (current[key] !== undefined && target[key] !== undefined) {
      result[key] = lerp(current[key], target[key], factor);
    }
  });

  // Interpolate color properties
  const colorKeys = ['primaryColor', 'secondaryColor', 'tertiaryColor', 'bgColor1', 'bgColor2'];
  colorKeys.forEach((key) => {
    if (current[key] && target[key]) {
      result[key] = lerpColor(current[key], target[key], factor);
    }
  });

  // Structural properties jump immediately
  result.shapes = target.shapes || [target.shape || 'rose'];
  result.renderMode = target.renderMode || 'stroke';
  result.bgType = target.bgType || 'solid';
  result.gradientMode = target.gradientMode !== undefined ? target.gradientMode : true;
  result.repeatMode = target.repeatMode !== undefined ? target.repeatMode : false;

  return result;
}

/**
 * Applies fills, lines, or both based on renderMode with alpha normalization
 * to prevent over-glow (burn-in) when many elements overlap.
 */
function applyStyle(ctx, renderMode, count) {
  const baseAlpha = ctx.globalAlpha;

  if (renderMode === 'fill' || renderMode === 'both') {
    // Normalization: more elements = softer individual fills
    const fillAlphaFactor = Math.min(0.25, 7 / count);
    ctx.globalAlpha = baseAlpha * fillAlphaFactor;
    ctx.fill();
    ctx.globalAlpha = baseAlpha; // Restore original alpha
  }
  if (renderMode === 'stroke' || renderMode === 'both') {
    // Normalization: more elements = slightly finer/softer lines
    const strokeAlphaFactor = Math.min(1.0, 35 / count);
    ctx.globalAlpha = baseAlpha * strokeAlphaFactor;
    ctx.stroke();
    ctx.globalAlpha = baseAlpha;
  }
}

/**
 * Main function to render the shades on the Canvas
 */
export function drawCanvas(ctx, width, height, state, time) {
  const cx = width / 2;
  const cy = height / 2;
  const minDim = Math.min(width, height);

  // 1. RENDER BACKGROUNDS
  const bgType = state.bgType || 'solid';
  const bg1 = state.bgColor1 || '#050508';
  const bg2 = state.bgColor2 || '#161625';

  if (bgType === 'solid') {
    ctx.fillStyle = bg1;
    ctx.fillRect(0, 0, width, height);
  } else if (bgType === 'gradient') {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, bg1);
    bgGrad.addColorStop(1, bg2);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);
  } else if (bgType === 'shader') {
    const t = time * 0.0003;
    const gx = cx + Math.sin(t) * (width * 0.25);
    const gy = cy + Math.cos(t * 0.8) * (height * 0.25);
    
    const shaderGrad = ctx.createRadialGradient(gx, gy, minDim * 0.05, cx, cy, minDim * 0.9);
    shaderGrad.addColorStop(0, bg1);
    shaderGrad.addColorStop(1, bg2);
    ctx.fillStyle = shaderGrad;
    ctx.fillRect(0, 0, width, height);
  }

  // 2. CONFIGURE STROKE & FILL COLOR (Solid vs 3-Stop Gradient)
  let shapeStyle;
  const pCol = state.primaryColor || '#00ffcc';
  const sCol = state.secondaryColor || '#ff0055';
  const tCol = state.tertiaryColor || '#ffcc00';

  if (state.gradientMode) {
    const angleRad = ((state.gradientAngle || 45) * Math.PI) / 180;
    const r = minDim / 2;
    const x0 = cx - Math.cos(angleRad) * r;
    const y0 = cy - Math.sin(angleRad) * r;
    const x1 = cx + Math.cos(angleRad) * r;
    const y1 = cy + Math.sin(angleRad) * r;

    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, pCol);
    grad.addColorStop(0.5, tCol);
    grad.addColorStop(1, sCol);
    shapeStyle = grad;
  } else {
    shapeStyle = pCol;
  }

  ctx.strokeStyle = shapeStyle;
  ctx.fillStyle = shapeStyle;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = state.opacity !== undefined ? state.opacity : 0.6;

  // 3. DRAW COMBINED SHAPES (EITHER CENTERED OR REPEATED IN GRID)
  const activeShapes = state.shapes || ['rose'];
  const count = Math.max(5, Math.floor(state.count || 150));
  const scale = (state.scale || 1.0) * (minDim / 600);
  const speed = state.speed !== undefined ? state.speed : 1.0;
  const rotationRad = ((state.rotation || 0) * Math.PI) / 180;
  const noise = state.noise !== undefined ? state.noise : 20;
  const renderMode = state.renderMode || 'stroke';

  const repeatMode = state.repeatMode || false;
  const repeatCount = Math.max(1, Math.floor(state.repeatCount || 2));

  if (repeatMode && repeatCount > 1) {
    // Repeated pattern grid
    const cellW = width / repeatCount;
    const cellH = height / repeatCount;

    for (let r = 0; r < repeatCount; r++) {
      for (let c = 0; c < repeatCount; c++) {
        // Find cell center
        const cellCx = cellW * (c + 0.5);
        const cellCy = cellH * (r + 0.5);

        ctx.save();
        ctx.translate(cellCx, cellCy);
        ctx.rotate(rotationRad);

        // Scale down drawings proportionally based on matrix count
        const subScale = scale / repeatCount;

        activeShapes.forEach((shapeType) => {
          renderShape(ctx, shapeType, count, subScale, speed, noise, time, renderMode);
        });

        ctx.restore();
      }
    }
  } else {
    // Single centered canvas drawing
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotationRad);

    activeShapes.forEach((shapeType) => {
      renderShape(ctx, shapeType, count, scale, speed, noise, time, renderMode);
    });

    ctx.restore();
  }
}

/**
 * Shared dispatcher to draw specific shapes
 */
function renderShape(ctx, shapeType, count, scale, speed, noise, time, renderMode) {
  switch (shapeType) {
    case 'circle':
      drawCircles(ctx, count, scale, speed, noise, time, renderMode);
      break;
    case 'line':
      drawLines(ctx, count, scale, speed, noise, time, renderMode);
      break;
    case 'polygon':
      drawPolygons(ctx, count, scale, speed, noise, time, renderMode);
      break;
    case 'bezier':
      drawBezier(ctx, count, scale, speed, noise, time, renderMode);
      break;
    case 'spiral':
      drawSpirals(ctx, count, scale, speed, noise, time, renderMode);
      break;
    case 'rose':
      drawRoses(ctx, count, scale, speed, noise, time, renderMode);
      break;
    case 'particles':
      drawParticles(ctx, count, scale, speed, noise, time, renderMode);
      break;
    case 'star':
      drawStars(ctx, count, scale, speed, noise, time, renderMode);
      break;
  }
}

/**
 * 1. CIRCLES
 */
function drawCircles(ctx, count, scale, speed, noise, time, renderMode) {
  const startIndex = renderMode === 'fill' || renderMode === 'both' ? count - 1 : 0;
  const step = renderMode === 'fill' || renderMode === 'both' ? -1 : 1;

  for (let i = startIndex; i >= 0 && i < count; i += step) {
    const progress = i / count;
    const baseRadius = progress * 250 * scale;
    
    const t = time * speed * 0.002;
    const wave = Math.sin(t + i * 0.1) * noise * 0.5 * scale;
    const radius = Math.max(2, baseRadius + wave);

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    applyStyle(ctx, renderMode, count);
  }
}

/**
 * 2. LINES
 */
function drawLines(ctx, count, scale, speed, noise, time, renderMode) {
  const t = time * speed * 0.001;
  for (let i = 0; i < count; i++) {
    const angle1 = (i * Math.PI * 2) / count + t;
    const angle2 = ((i * 3) * Math.PI * 2) / count - t * 0.5;

    const r1 = 200 * scale + Math.sin(t + i) * noise * scale;
    const r2 = 100 * scale + Math.cos(t - i) * noise * scale;

    const x1 = Math.cos(angle1) * r1;
    const y1 = Math.sin(angle1) * r1;
    const x2 = Math.cos(angle2) * r2;
    const y2 = Math.sin(angle2) * r2;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    applyStyle(ctx, renderMode, count);
  }
}

/**
 * 3. POLYGONS
 */
function drawPolygons(ctx, count, scale, speed, noise, time, renderMode) {
  const t = time * speed * 0.0015;
  const sides = Math.max(3, Math.min(12, Math.floor(3 + noise / 10)));
  const startIndex = renderMode === 'fill' || renderMode === 'both' ? count - 1 : 0;
  const step = renderMode === 'fill' || renderMode === 'both' ? -1 : 1;

  for (let i = startIndex; i >= 0 && i < count; i += step) {
    const progress = i / count;
    const r = progress * 240 * scale;
    const polygonRot = i * 0.05 + t;

    ctx.beginPath();
    for (let s = 0; s <= sides; s++) {
      const angle = (s * Math.PI * 2) / sides + polygonRot;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    applyStyle(ctx, renderMode, count);
  }
}

/**
 * 4. BEZIER
 */
function drawBezier(ctx, count, scale, speed, noise, time, renderMode) {
  const t = time * speed * 0.001;

  for (let i = 0; i < count; i++) {
    const progress = i / count;
    const yOffset = (progress - 0.5) * 400 * scale;

    const cp1x = -150 * scale + Math.sin(t + i * 0.15) * noise * 2 * scale;
    const cp1y = yOffset + Math.cos(t + i * 0.1) * 100 * scale;
    const cp2x = 150 * scale + Math.cos(t - i * 0.15) * noise * 2 * scale;
    const cp2y = yOffset + Math.sin(t - i * 0.1) * 100 * scale;

    ctx.beginPath();
    ctx.moveTo(-250 * scale, yOffset);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, 250 * scale, yOffset);
    
    if (renderMode === 'fill' || renderMode === 'both') {
      ctx.lineTo(250 * scale, yOffset + 20 * scale);
      ctx.bezierCurveTo(cp2x, cp2y + 20 * scale, cp1x, cp1y + 20 * scale, -250 * scale, yOffset + 20 * scale);
      ctx.closePath();
    }
    applyStyle(ctx, renderMode, count);
  }
}

/**
 * 5. SPIRALS
 */
function drawSpirals(ctx, count, scale, speed, noise, time, renderMode) {
  const t = time * speed * 0.002;
  const turns = 4 + (noise / 15);
  const totalPoints = count * 3;

  ctx.beginPath();
  for (let i = 0; i < totalPoints; i++) {
    const progress = i / totalPoints;
    const theta = progress * Math.PI * 2 * turns + t;
    const r = Math.pow(progress, 0.8) * 250 * scale;

    const wave = Math.sin(theta * 5 - t) * (noise * 0.2) * scale * progress;
    const x = Math.cos(theta) * (r + wave);
    const y = Math.sin(theta) * (r + wave);

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  
  if (renderMode === 'fill' || renderMode === 'both') {
    ctx.lineTo(0, 0);
    ctx.closePath();
  }
  applyStyle(ctx, renderMode, count);
}

/**
 * 6. ROSES: corrected mathematical periodic polar curves (always complete closed flowers)
 */
function drawRoses(ctx, count, scale, speed, noise, time, renderMode) {
  const t = time * speed * 0.0008;
  const n = Math.floor(3 + noise / 10);
  const d = Math.floor(1 + (noise % 10) / 2);
  const k = n / d;
  
  // Dynamic period calculation: ensures closed flower curves (d odd = d*PI, d even = 2*d*PI)
  const period = (d % 2 === 0 ? 2 * d : d) * Math.PI;
  const totalSteps = Math.max(120, count * 3);
  
  ctx.beginPath();
  for (let i = 0; i <= totalSteps; i++) {
    const theta = (i / totalSteps) * period;
    const r = Math.cos(k * theta + t) * 220 * scale;
    
    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);
    
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  if (renderMode === 'fill' || renderMode === 'both') {
    ctx.closePath();
  }
  applyStyle(ctx, renderMode, count);
}

/**
 * 7. PARTICLE TRAILS
 */
function drawParticles(ctx, count, scale, speed, noise, time, renderMode) {
  const t = time * speed * 0.001;
  const tailLength = 8;

  for (let i = 0; i < count; i++) {
    const seed = i * 153.25;
    const baseAngle = (i * Math.PI * 2) / count;
    
    ctx.beginPath();
    for (let j = 0; j < tailLength; j++) {
      const jt = t - j * 0.015;
      const flowVal = Math.sin(jt * 2 + seed) * noise * 0.8;
      const r = (50 + Math.cos(jt * 1.5 + seed) * 150) * scale;
      const angle = baseAngle + flowVal * 0.05 + jt * 0.2;
      
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;

      if (j === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    if (renderMode === 'fill' || renderMode === 'both') {
      const headJt = t;
      const headFlow = Math.sin(headJt * 2 + seed) * noise * 0.8;
      const headR = (50 + Math.cos(headJt * 1.5 + seed) * 150) * scale;
      const headAngle = baseAngle + headFlow * 0.05 + headJt * 0.2;
      const hx = Math.cos(headAngle) * headR;
      const hy = Math.sin(headAngle) * headR;
      
      ctx.arc(hx, hy, 4 * scale, 0, Math.PI * 2);
    }
    applyStyle(ctx, renderMode, count);
  }
}

/**
 * 8. STARS
 */
function drawStars(ctx, count, scale, speed, noise, time, renderMode) {
  const t = time * speed * 0.001;
  const arms = Math.max(3, Math.min(16, Math.floor(4 + noise / 8)));
  const startIndex = renderMode === 'fill' || renderMode === 'both' ? count - 1 : 0;
  const step = renderMode === 'fill' || renderMode === 'both' ? -1 : 1;

  for (let i = startIndex; i >= 0 && i < count; i += step) {
    const progress = i / count;
    const rOuter = progress * 240 * scale;
    const rInner = rOuter * 0.4 * (1 + Math.sin(t + i * 0.1) * 0.1);
    const starRot = i * 0.04 - t * 0.3;

    ctx.beginPath();
    for (let a = 0; a <= arms * 2; a++) {
      const angle = (a * Math.PI) / arms + starRot;
      const r = a % 2 === 0 ? rOuter : rInner;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    applyStyle(ctx, renderMode, count);
  }
}
