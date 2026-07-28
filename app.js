(() => {
  "use strict";

  const TAU = Math.PI * 2;
  const COLORS = {
    ink: "#17231d",
    inkSoft: "#536158",
    teal: "#087f73",
    tealDark: "#075e57",
    coral: "#e7674f",
    gold: "#d89b27",
    blue: "#3f6dd8",
  };

  const state = {
    paused: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    time: performance.now(),
    lastTime: performance.now(),
    camera: { yaw: -0.62, pitch: 0.42 },
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);
  const formatInteger = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const formatDecimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
  const hsla = (h, s, l, a) => "hsla(" + h + "," + s + "%," + l + "%," + a + ")";
  const rgba = (r, g, b, a) => "rgba(" + r + "," + g + "," + b + "," + a + ")";

  function fitCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx, width, height };
  }

  function radicalInverse(value, base) {
    let result = 0;
    let fraction = 1 / base;
    let n = value;
    while (n > 0) {
      result += (n % base) * fraction;
      n = Math.floor(n / base);
      fraction /= base;
    }
    return result;
  }

  // A nested low-discrepancy sample of the upper half of the direction sphere.
  // A line has no orientation, so the opposite half represents the same directions.
  const directions = Array.from({ length: 400 }, (_, index) => {
    const i = index + 1;
    const y = 0.025 + radicalInverse(i, 2) * 0.95;
    const phi = TAU * radicalInverse(i, 3);
    const radial = Math.sqrt(Math.max(0, 1 - y * y));
    return {
      x: radial * Math.cos(phi),
      y,
      z: radial * Math.sin(phi),
      phi,
      color: hsla(9 + (index / 399) * 200, 69, index % 2 ? 50 : 57, 1),
    };
  });

  function packedCenter(index) {
    const direction = directions[index];
    const branch = Math.floor(((direction.phi + Math.PI) / TAU) * 6) % 6;
    const branchAngle = branch * TAU / 6;
    const tremor = Math.sin(index * 2.41) * 0.025;
    return {
      x: 0.11 * Math.cos(branchAngle) + tremor * direction.y,
      y: 0.07 * (direction.y - 0.5) + Math.cos(index * 1.73) * 0.018,
      z: 0.11 * Math.sin(branchAngle) + tremor * direction.x,
    };
  }

  function separatedCenter(index) {
    const column = index % 5;
    const row = Math.floor(index / 5) % 5;
    const layer = Math.floor(index / 25) % 4;
    return {
      x: (column - 2) * 0.36,
      y: (row - 2) * 0.28,
      z: (layer - 1.5) * 0.39,
    };
  }

  function tubeFor(index) {
    const direction = directions[index];
    return {
      direction: direction,
      start: { x: -direction.x * 0.5, y: -direction.y * 0.5, z: -direction.z * 0.5 },
      end: { x: direction.x * 0.5, y: direction.y * 0.5, z: direction.z * 0.5 },
      separated: separatedCenter(index),
      packed: packedCenter(index),
      color: direction.color,
      index: index,
    };
  }

  const packTubes = Array.from({ length: 100 }, (_, index) => tubeFor(index));
  const cubeLevels = Array.from({ length: 10 }, (_, index) => {
    const denominator = (index + 1) * 2;
    return {
      label: "1/" + denominator,
      denominator: denominator,
      delta: 1 / denominator,
      directions: denominator * denominator,
      grid: Math.round(1.5 * denominator),
    };
  });

  function vectorAdd(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }

  function rotatePoint(point) {
    const cosYaw = Math.cos(state.camera.yaw);
    const sinYaw = Math.sin(state.camera.yaw);
    const cosPitch = Math.cos(state.camera.pitch);
    const sinPitch = Math.sin(state.camera.pitch);
    const x1 = point.x * cosYaw - point.z * sinYaw;
    const z1 = point.x * sinYaw + point.z * cosYaw;
    return { x: x1, y: point.y * cosPitch - z1 * sinPitch, z: point.y * sinPitch + z1 * cosPitch };
  }

  function projectPoint(point, width, height) {
    const cameraDistance = 4.25;
    const depth = Math.max(0.55, cameraDistance + point.z);
    const scale = Math.min(width, height) * 1.54 / depth;
    return { x: width / 2 + point.x * scale, y: height / 2 - point.y * scale, depth: depth, scale: scale };
  }

  function interpolateTube(tube, progress) {
    const center = {
      x: lerp(tube.separated.x, tube.packed.x, progress),
      y: lerp(tube.separated.y, tube.packed.y, progress),
      z: lerp(tube.separated.z, tube.packed.z, progress),
    };
    return {
      start: vectorAdd(center, tube.start),
      end: vectorAdd(center, tube.end),
      center: center,
      direction: tube.direction,
      color: tube.color,
      index: tube.index,
      radius: 0.046,
    };
  }

  function drawWireCube(ctx, width, height, min, max, alpha) {
    const corners = [
      { x: min, y: min, z: min }, { x: max, y: min, z: min },
      { x: max, y: max, z: min }, { x: min, y: max, z: min },
      { x: min, y: min, z: max }, { x: max, y: min, z: max },
      { x: max, y: max, z: max }, { x: min, y: max, z: max },
    ].map((corner) => projectPoint(rotatePoint(corner), width, height));
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    ctx.strokeStyle = rgba(23, 35, 29, alpha);
    ctx.lineWidth = 1;
    for (const edge of edges) {
      ctx.beginPath();
      ctx.moveTo(corners[edge[0]].x, corners[edge[0]].y);
      ctx.lineTo(corners[edge[1]].x, corners[edge[1]].y);
      ctx.stroke();
    }
  }

  function drawFloor(ctx, width, height) {
    const lines = [-1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2];
    ctx.strokeStyle = rgba(23, 35, 29, 0.08);
    ctx.lineWidth = 1;
    for (const value of lines) {
      const a = projectPoint(rotatePoint({ x: value, y: -0.73, z: -1.2 }), width, height);
      const b = projectPoint(rotatePoint({ x: value, y: -0.73, z: 1.2 }), width, height);
      const c = projectPoint(rotatePoint({ x: -1.2, y: -0.73, z: value }), width, height);
      const d = projectPoint(rotatePoint({ x: 1.2, y: -0.73, z: value }), width, height);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
    }
  }

  function drawTubes(ctx, width, height, tubes, alpha, lineScale) {
    const projected = tubes.map((tube) => {
      const start = projectPoint(rotatePoint(tube.start), width, height);
      const end = projectPoint(rotatePoint(tube.end), width, height);
      const midpoint = tube.center || {
        x: (tube.start.x + tube.end.x) / 2,
        y: (tube.start.y + tube.end.y) / 2,
        z: (tube.start.z + tube.end.z) / 2,
      };
      const center = projectPoint(rotatePoint(midpoint), width, height);
      return { tube: tube, start: start, end: end, center: center };
    }).sort((a, b) => b.center.depth - a.center.depth);

    for (const item of projected) {
      const radiusWorld = item.tube.radius || 0.048;
      const radius = (item.start.scale + item.end.scale) * 0.5 * radiusWorld * lineScale;
      ctx.save();
      ctx.globalAlpha = alpha * 0.18;
      ctx.strokeStyle = item.tube.color;
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(3, radius * 3.3);
      ctx.beginPath(); ctx.moveTo(item.start.x, item.start.y); ctx.lineTo(item.end.x, item.end.y); ctx.stroke();
      ctx.globalAlpha = alpha * 0.93;
      ctx.lineWidth = Math.max(1.2, radius * 1.2);
      ctx.beginPath(); ctx.moveTo(item.start.x, item.start.y); ctx.lineTo(item.end.x, item.end.y); ctx.stroke();
      ctx.fillStyle = item.tube.color;
      ctx.beginPath(); ctx.arc(item.start.x, item.start.y, Math.max(1.8, radius * 0.62), 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(item.end.x, item.end.y, Math.max(1.8, radius * 0.62), 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Part 1: the thick tubes move; their directions do not.
  // ---------------------------------------------------------------------------
  const packCanvas = document.querySelector("#packCanvas");
  const packSlider = document.querySelector("#packSlider");
  const packOutput = document.querySelector("#packOutput");
  const packStageLabel = document.querySelector("#packStageLabel");
  const packCaption = document.querySelector("#packCaption");
  const playPacking = document.querySelector("#playPacking");
  let packingPlaying = false;
  let packingStarted = 0;
  let packingFrom = 0;
  const packingDuration = 3200;

  function stopPacking(label) {
    packingPlaying = false;
    playPacking.textContent = label || "Pack the tubes together";
  }

  function updatePackingLabels() {
    const progress = Number(packSlider.value) / 100;
    if (progress < 0.08) {
      packOutput.value = "separated";
      packStageLabel.textContent = "Separated positions";
      packCaption.textContent = "The tubes have many tilts, but little shared space.";
    } else if (progress < 0.92) {
      packOutput.value = "overlapping";
      packStageLabel.textContent = "Sliding without rotating";
      packCaption.textContent = "Every tube keeps its tilt while neighboring tubes begin to reuse the same regions.";
    } else {
      packOutput.value = "packed";
      packStageLabel.textContent = "Compact overlapping arrangement";
      packCaption.textContent = "The same 100 direction samples now share a much smaller union of space.";
    }
  }

  packSlider.addEventListener("input", () => { stopPacking(); updatePackingLabels(); });
  playPacking.addEventListener("click", () => {
    if (packingPlaying) { stopPacking(); return; }
    if (state.paused) { state.paused = false; updateMotionButton(); }
    if (Number(packSlider.value) >= 100) packSlider.value = "0";
    packingFrom = Number(packSlider.value);
    packingStarted = performance.now();
    packingPlaying = true;
    playPacking.textContent = "Pause the packing";
  });

  function drawPackingScene() {
    const fitted = fitCanvas(packCanvas);
    const ctx = fitted.ctx;
    const width = fitted.width;
    const height = fitted.height;
    ctx.clearRect(0, 0, width, height);
    drawFloor(ctx, width, height);
    drawWireCube(ctx, width, height, -1.25, 1.25, 0.13);
    const progress = ease(Number(packSlider.value) / 100);
    const tubes = packTubes.map((tube) => interpolateTube(tube, progress));
    drawTubes(ctx, width, height, tubes, 1, 1);
    if (progress > 0.72) {
      const center = projectPoint(rotatePoint({ x: 0, y: 0, z: 0 }), width, height);
      const glow = 12 + progress * 16;
      const gradient = ctx.createRadialGradient(center.x, center.y, 1, center.x, center.y, glow);
      gradient.addColorStop(0, rgba(216, 155, 39, 0.24));
      gradient.addColorStop(1, rgba(216, 155, 39, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath(); ctx.arc(center.x, center.y, glow, 0, TAU); ctx.fill();
    }
  }

  // ---------------------------------------------------------------------------
  // Part 2: count the cubes that touch those packed tubes.
  // ---------------------------------------------------------------------------
  const countCanvas = document.querySelector("#countCanvas");
  const countCaption = document.querySelector("#countCaption");
  const cubeSide = document.querySelector("#cubeSide");
  const directionCount = document.querySelector("#directionCount");
  const occupiedCount = document.querySelector("#occupiedCount");
  const availableCount = document.querySelector("#availableCount");
  const occupiedFraction = document.querySelector("#occupiedFraction");
  const volumeProxy = document.querySelector("#volumeProxy");
  const snapshotSentence = document.querySelector("#snapshotSentence");
  const resolutionButtons = document.querySelector("#resolutionButtons");
  const viewButtons = document.querySelector("#viewButtons");
  const miniRuler = document.querySelector("#miniRuler");
  const rulerDivisionCount = document.querySelector("#rulerDivisionCount");
  const directionDotField = document.querySelector("#directionDotField");
  const directionEquation = document.querySelector("#directionEquation");
  const fractionMosaic = document.querySelector("#fractionMosaic");
  const fractionTouched = document.querySelector("#fractionTouched");
  const fractionAvailable = document.querySelector("#fractionAvailable");
  const fractionPercent = document.querySelector("#fractionPercent");
  const volumeEquation = document.querySelector("#volumeEquation");
  const snapshotIcon = document.querySelector(".snapshot-icon");
  let selectedLevel = 4;
  let selectedView = "both";
  const voxelCache = new Map();

  const fractionTiles = Array.from({ length: 100 }, () => {
    const tile = document.createElement("i");
    fractionMosaic.append(tile);
    return tile;
  });

  function updateRulerDirectionVisual(level) {
    rulerDivisionCount.textContent = formatInteger.format(level.denominator);
    directionEquation.textContent = level.denominator + " × " + level.denominator + " = " + formatInteger.format(level.directions);
    miniRuler.replaceChildren();
    for (let index = 0; index <= level.denominator; index += 1) {
      const tick = document.createElement("i");
      tick.style.left = (index / level.denominator * 100) + "%";
      miniRuler.append(tick);
    }
    directionDotField.replaceChildren();
    for (let index = 0; index < level.directions; index += 1) {
      const dot = document.createElement("i");
      dot.style.left = (50 + directions[index].x * 43) + "%";
      dot.style.top = (50 + directions[index].z * 43) + "%";
      directionDotField.append(dot);
    }
  }

  function pointBoxDistanceSquared(point, boxMin, boxMax) {
    let result = 0;
    for (const axis of ["x", "y", "z"]) {
      if (point[axis] < boxMin[axis]) result += (boxMin[axis] - point[axis]) ** 2;
      else if (point[axis] > boxMax[axis]) result += (point[axis] - boxMax[axis]) ** 2;
    }
    return result;
  }

  // The squared distance from a segment to a cube is minimized numerically over the
  // segment parameter. This tests cubes as cubes, not as isolated dots.
  function segmentBoxDistanceSquared(start, end, boxMin, boxMax) {
    const evaluate = (t) => pointBoxDistanceSquared({
      x: lerp(start.x, end.x, t),
      y: lerp(start.y, end.y, t),
      z: lerp(start.z, end.z, t),
    }, boxMin, boxMax);
    let left = 0;
    let right = 1;
    for (let iteration = 0; iteration < 18; iteration += 1) {
      const first = left + (right - left) / 3;
      const second = right - (right - left) / 3;
      if (evaluate(first) < evaluate(second)) right = second;
      else left = first;
    }
    return Math.min(evaluate(0), evaluate(1), evaluate((left + right) * 0.5));
  }

  function packedTubeForLevel(index, level) {
    const direction = directions[index];
    const center = packedCenter(index);
    return {
      start: { x: center.x - direction.x * 0.5, y: center.y - direction.y * 0.5, z: center.z - direction.z * 0.5 },
      end: { x: center.x + direction.x * 0.5, y: center.y + direction.y * 0.5, z: center.z + direction.z * 0.5 },
      center: center,
      direction: direction,
      color: direction.color,
      radius: level.delta * 0.46,
      index: index,
    };
  }

  function computeVoxelCover(levelIndex) {
    const level = cubeLevels[levelIndex];
    const min = -0.75;
    const n = level.grid;
    const cells = new Map();
    const tubes = Array.from({ length: level.directions }, (_, index) => packedTubeForLevel(index, level));

    for (const tube of tubes) {
      const reach = tube.radius;
      const low = {
        x: Math.min(tube.start.x, tube.end.x) - reach,
        y: Math.min(tube.start.y, tube.end.y) - reach,
        z: Math.min(tube.start.z, tube.end.z) - reach,
      };
      const high = {
        x: Math.max(tube.start.x, tube.end.x) + reach,
        y: Math.max(tube.start.y, tube.end.y) + reach,
        z: Math.max(tube.start.z, tube.end.z) + reach,
      };
      const x0 = clamp(Math.floor((low.x - min) / level.delta), 0, n - 1);
      const x1 = clamp(Math.floor((high.x - min) / level.delta), 0, n - 1);
      const y0 = clamp(Math.floor((low.y - min) / level.delta), 0, n - 1);
      const y1 = clamp(Math.floor((high.y - min) / level.delta), 0, n - 1);
      const z0 = clamp(Math.floor((low.z - min) / level.delta), 0, n - 1);
      const z1 = clamp(Math.floor((high.z - min) / level.delta), 0, n - 1);
      for (let x = x0; x <= x1; x += 1) {
        for (let y = y0; y <= y1; y += 1) {
          for (let z = z0; z <= z1; z += 1) {
            const boxMin = { x: min + x * level.delta, y: min + y * level.delta, z: min + z * level.delta };
            const boxMax = { x: boxMin.x + level.delta, y: boxMin.y + level.delta, z: boxMin.z + level.delta };
            if (segmentBoxDistanceSquared(tube.start, tube.end, boxMin, boxMax) <= tube.radius * tube.radius + 1e-8) {
              cells.set(x + "," + y + "," + z, { x: x, y: y, z: z });
            }
          }
        }
      }
    }

    const surface = [];
    const neighborOffsets = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    for (const cell of cells.values()) {
      if (neighborOffsets.some((offset) => !cells.has((cell.x + offset[0]) + "," + (cell.y + offset[1]) + "," + (cell.z + offset[2])))) surface.push(cell);
    }
    return { level: level, cells: cells, surface: surface, tubes: tubes };
  }

  function drawProjectedCube(ctx, cell, cover, width, height, alpha) {
    const level = cover.level;
    const min = -0.75;
    const center = {
      x: min + (cell.x + 0.5) * level.delta,
      y: min + (cell.y + 0.5) * level.delta,
      z: min + (cell.z + 0.5) * level.delta,
    };
    const half = level.delta * 0.49;
    const offsets = [
      { x: -half, y: -half, z: -half }, { x: half, y: -half, z: -half },
      { x: half, y: half, z: -half }, { x: -half, y: half, z: -half },
      { x: -half, y: -half, z: half }, { x: half, y: -half, z: half },
      { x: half, y: half, z: half }, { x: -half, y: half, z: half },
    ];
    const corners = offsets.map((offset) => projectPoint(rotatePoint(vectorAdd(center, offset)), width, height));
    const faces = [
      { indices: [4, 5, 6, 7], fill: rgba(8, 127, 115, alpha * 0.86) },
      { indices: [1, 5, 6, 2], fill: rgba(8, 127, 115, alpha * 0.62) },
      { indices: [3, 2, 6, 7], fill: rgba(8, 127, 115, alpha * 0.42) },
    ];
    for (const face of faces) {
      ctx.beginPath();
      face.indices.forEach((index, pointIndex) => {
        const point = corners[index];
        if (pointIndex === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.fillStyle = face.fill;
      ctx.fill();
      ctx.strokeStyle = rgba(8, 127, 115, Math.min(0.46, alpha + 0.08));
      ctx.lineWidth = 0.45;
      ctx.stroke();
    }
  }

  function drawCountScene() {
    const fitted = fitCanvas(countCanvas);
    const ctx = fitted.ctx;
    const width = fitted.width;
    const height = fitted.height;
    ctx.clearRect(0, 0, width, height);
    drawFloor(ctx, width, height);
    drawWireCube(ctx, width, height, -0.75, 0.75, 0.15);
    const cover = voxelCache.get(selectedLevel);
    if (cover && selectedView !== "tubes") {
      const projected = cover.surface.map((cell) => {
        const center = { x: -0.75 + (cell.x + 0.5) * cover.level.delta, y: -0.75 + (cell.y + 0.5) * cover.level.delta, z: -0.75 + (cell.z + 0.5) * cover.level.delta };
        return { cell: cell, depth: projectPoint(rotatePoint(center), width, height).depth };
      }).sort((a, b) => b.depth - a.depth);
      for (const item of projected) drawProjectedCube(ctx, item.cell, cover, width, height, selectedView === "both" ? 0.30 : 0.67);
    }
    if (cover && selectedView !== "cubes") drawTubes(ctx, width, height, cover.tubes, selectedView === "both" ? 0.96 : 1, 0.82);
  }

  function updateCountReadout() {
    const level = cubeLevels[selectedLevel];
    const cover = voxelCache.get(selectedLevel);
    cubeSide.textContent = level.label;
    directionCount.textContent = formatInteger.format(level.directions);
    availableCount.textContent = formatInteger.format(level.grid ** 3);
    updateRulerDirectionVisual(level);
    if (!cover) {
      occupiedCount.textContent = "…";
      occupiedFraction.textContent = "counting…";
      volumeProxy.textContent = "…";
      volumeEquation.textContent = "Counting N(δ)…";
      snapshotSentence.textContent = "Counting the cubes touched by " + level.label + "-scale tubes…";
      countCaption.textContent = "The cube cover is being counted from the displayed tube geometry.";
      return;
    }
    const count = cover.cells.size;
    const total = level.grid ** 3;
    const fraction = count / total;
    const proxy = count * level.delta ** 3;
    occupiedCount.textContent = formatInteger.format(count);
    occupiedFraction.textContent = formatDecimal.format(fraction * 100) + "%";
    volumeProxy.textContent = formatDecimal.format(proxy);
    const percent = fraction * 100;
    const filledTiles = Math.round(percent);
    fractionTiles.forEach((tile, index) => tile.classList.toggle("filled", index < filledTiles));
    fractionTouched.textContent = formatInteger.format(count) + " touched";
    fractionAvailable.textContent = formatInteger.format(total) + " available";
    fractionPercent.textContent = formatDecimal.format(percent) + "%";
    volumeEquation.textContent = "N(δ) × δ³ ≈ " + formatDecimal.format(proxy);
    snapshotIcon.style.setProperty("--fraction-fill", clamp(percent, 0, 100) + "%");
    snapshotSentence.textContent = formatInteger.format(count) + " of " + formatInteger.format(total) + " frame cubes touch the " + level.label + "-scale tube sample.";
    countCaption.textContent = selectedView === "tubes"
      ? "The tubes are visible; the counted cube cover is hidden."
      : selectedView === "cubes"
        ? "Only the outer faces of the counted cubes are shown; hidden cubes are included in the counter."
        : "Every translucent cube intersects a displayed tube; overlaps still count once.";
  }

  function setSelectedLevel(levelIndex) {
    selectedLevel = levelIndex;
    resolutionButtons.querySelectorAll("button").forEach((button) => {
      const active = Number(button.dataset.level) === levelIndex;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (!voxelCache.has(levelIndex)) {
      updateCountReadout();
      window.setTimeout(() => {
        voxelCache.set(levelIndex, computeVoxelCover(levelIndex));
        updateCountReadout();
      }, 20);
    } else updateCountReadout();
  }

  resolutionButtons.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-level]");
    if (button) setSelectedLevel(Number(button.dataset.level));
  });

  function updateViewButtonStates() {
    viewButtons.querySelectorAll("button").forEach((item) => {
      const active = item.dataset.view === selectedView;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
  }

  viewButtons.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-view]");
    if (!button) return;
    selectedView = button.dataset.view;
    updateViewButtonStates();
    updateCountReadout();
  });

  // ---------------------------------------------------------------------------
  // Dimension rate model: N_n = 10^(3n) / n.
  // The 1/n loss tends to zero, but is too slow to change the exponent.
  // ---------------------------------------------------------------------------
  const decadeSlider = document.querySelector("#decadeSlider");
  const decadeOutput = document.querySelector("#decadeOutput");
  const modelFraction = document.querySelector("#modelFraction");
  const modelMultiplier = document.querySelector("#modelMultiplier");
  const modelDimension = document.querySelector("#modelDimension");
  const modelExplanation = document.querySelector("#modelExplanation");

  function updateRateModel() {
    const n = Number(decadeSlider.value);
    const fraction = 1 / n;
    const multiplier = 1000 * n / (n + 1);
    const dimension = 3 - Math.log10(n) / n;
    decadeOutput.value = "n = " + formatInteger.format(n);
    modelFraction.textContent = n <= 100
      ? "1/" + n + " = " + formatDecimal.format(fraction * 100) + "%"
      : "1/" + n + " ≈ " + formatDecimal.format(fraction * 100) + "%";
    modelMultiplier.textContent = "×" + formatInteger.format(multiplier);
    modelDimension.textContent = dimension.toFixed(3);
    modelExplanation.textContent = n === 1
      ? "At the first ruler size the model uses the whole frame. Later it discards a slowly increasing share, while its count power stays close to 3."
      : "After " + formatInteger.format(n) + " tenfold refinements, only " + (n <= 100 ? "1/" + n : "about 1/" + n) + " of the available cubes remain. The next count multiplier is still about " + formatInteger.format(multiplier) + "—and it tends to 1,000.";
  }

  decadeSlider.addEventListener("input", updateRateModel);

  // ---------------------------------------------------------------------------
  // Shared interaction and animation loop.
  // ---------------------------------------------------------------------------
  const motionToggle = document.querySelector("#motionToggle");
  let dragging = null;
  let lastPointer = { x: 0, y: 0 };

  function updateMotionButton() {
    motionToggle.textContent = state.paused ? "Resume motion" : "Pause motion";
    motionToggle.setAttribute("aria-pressed", String(state.paused));
  }

  motionToggle.addEventListener("click", () => {
    state.paused = !state.paused;
    if (state.paused) stopPacking();
    updateMotionButton();
  });

  [packCanvas, countCanvas].forEach((canvas) => {
    canvas.addEventListener("pointerdown", (event) => {
      dragging = canvas;
      lastPointer = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (dragging !== canvas) return;
      state.camera.yaw += (event.clientX - lastPointer.x) * 0.008;
      state.camera.pitch = clamp(state.camera.pitch + (event.clientY - lastPointer.y) * 0.006, -1.22, 1.22);
      lastPointer = { x: event.clientX, y: event.clientY };
    });
    const endDrag = (event) => {
      if (dragging === canvas) dragging = null;
      if (event.pointerId !== undefined && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
  });

  function render(now) {
    const dt = Math.min(50, now - state.lastTime);
    state.lastTime = now;
    state.time = now;
    if (!state.paused && !dragging) state.camera.yaw += dt * 0.000055;
    if (packingPlaying && !state.paused) {
      const elapsed = clamp((now - packingStarted) / packingDuration, 0, 1);
      packSlider.value = String(lerp(packingFrom, 100, ease(elapsed)).toFixed(1));
      updatePackingLabels();
      if (elapsed >= 1) stopPacking("Replay the packing");
    }
    drawPackingScene();
    drawCountScene();
    window.requestAnimationFrame(render);
  }

  updatePackingLabels();
  setSelectedLevel(4);
  updateViewButtonStates();
  updateRateModel();
  updateMotionButton();
  window.requestAnimationFrame(render);
})();
