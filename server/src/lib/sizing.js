/**
 * Garment-first sizing.
 *
 * Every chart a brand enters is a FLAT GARMENT chart: numbers taken with the
 * garment laid on a table, measured across (pit-to-pit, half-chest). That is
 * the industry default, it is what 95 % of brand product pages print, and it
 * is what FindMySize supports — exclusively.
 *
 * The conversion from flat to body is:
 *
 *   body circumference window = (flat × 2 + ease_lo) to (flat × 2 + ease_hi)
 *
 * "flat × 2" is the circumference of the garment itself. The ease window is the
 * range of bodies that garment is designed to fit — it is never a point, because
 * a garment cut for a 40″ chest fits anyone from roughly 38 to 42″, depending on
 * the fit style. The window is what gets compared with the body the scanner read.
 *
 * Fit style drives the ease window. A "fitted" piece is cut close; a "relaxed"
 * piece sits away from the body; "oversized" is designed to dwarf the wearer.
 * Each style maps to (ease_lo, ease_hi) per body part. These numbers come from
 * industry grading tables and from measuring real garments.
 *
 *   fitted:    chest  2 – 4   waist  1 – 3   hips  2 – 4
 *   regular:   chest  3 – 6   waist  2 – 4   hips  3 – 6
 *   relaxed:   chest  5 – 9   waist  4 – 7   hips  5 – 9
 *   oversized: chest  8 – 14  waist  6 – 12  hips  8 – 14
 *
 * Detection: when a brand enters numbers, the engine reads the column labels and
 * the values to decide whether the chart looks flat (the default) or already
 * round. It stores that result on the chart and the brand can override it. For a
 * round garment chart the flat flag is false and the values are used as-is for
 * the circumference; ease is still applied. Body-measurement entry is gone.
 *
 * The fallback built-in charts (CHARTS) are REMOVED. If a scan has no store
 * chart it says so and returns no size; it does not fall back to a generic
 * reference, because a generic reference is an opinion, not a fit.
 */

import { measureField } from '../shared/measures.js';

// ---------------------------------------------------------------------------
// Ease windows by fit style and body part (inches).
// Each entry is [lo, hi] — how much extra room, beyond the garment's own
// circumference, a body in this style window is expected to have.
// ---------------------------------------------------------------------------
export const FIT_STYLES = {
  fitted:    { chest: [2, 4],  waist: [1, 3],  hips: [2, 4],  shoulder: [0, 1], neck: [0.1, 0.5], arm: [0.5, 1.5] },
  regular:   { chest: [3, 6],  waist: [2, 4],  hips: [3, 6],  shoulder: [0, 1], neck: [0.1, 0.5], arm: [0.5, 2]   },
  relaxed:   { chest: [5, 9],  waist: [4, 7],  hips: [5, 9],  shoulder: [0, 2], neck: [0.1, 0.5], arm: [1, 3]     },
  oversized: { chest: [8, 14], waist: [6, 12], hips: [8, 14], shoulder: [1, 4], neck: [0.1, 0.5], arm: [1.5, 4]   },
};

export const FIT_STYLE_LABELS = {
  fitted:    'Fitted',
  regular:   'Regular',
  relaxed:   'Relaxed',
  oversized: 'Oversized',
};

/** Default fit style when the brand has not set one. */
export const DEFAULT_FIT_STYLE = 'regular';

// ---------------------------------------------------------------------------
// Cell helpers (unchanged from original — a cell is a number or {min,max})
// ---------------------------------------------------------------------------
function readCell(value) {
  if (value && Number.isFinite(value.min) && Number.isFinite(value.max)) {
    return { min: Math.min(value.min, value.max), max: Math.max(value.min, value.max) };
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hasCell(value) {
  return readCell(value) !== null;
}

function cellMid(cell) {
  if (cell == null) return null;
  if (typeof cell === 'number') return cell;
  if (Number.isFinite(cell.min) && Number.isFinite(cell.max)) return (cell.min + cell.max) / 2;
  return null;
}

// ---------------------------------------------------------------------------
// Garment-to-body window
//
// Given a flat garment half-width `flatVal` (or a full circumference when
// `isFlat` is false) and a fit style, return the body circumference window
// [lo, hi] that this size is designed to fit.
// ---------------------------------------------------------------------------
export function garmentToBodyWindow(flatVal, isFlat, field, fitStyle = DEFAULT_FIT_STYLE) {
  const style = FIT_STYLES[fitStyle] || FIT_STYLES[DEFAULT_FIT_STYLE];
  const easeWindow = style[field] || style.chest;
  // If flat, the garment circumference is flatVal × 2.
  // If already round (isFlat=false), use flatVal directly.
  const circumference = isFlat ? flatVal * 2 : flatVal;
  // The body window: a body from (circumference - ease_hi) to (circumference - ease_lo)
  // would wear this size comfortably in this fit style.
  // Equivalently: the garment needs a body of at least (circ - ease_hi) and at most (circ - ease_lo).
  return {
    lo: circumference - easeWindow[1],
    hi: circumference - easeWindow[0],
    circumference,
  };
}

// ---------------------------------------------------------------------------
// chartKey: which column in a store chart is the torso anchor
// (kept for compatibility with callers that need to know the deciding column)
// ---------------------------------------------------------------------------
export function chartKey(chart) {
  const rows = Object.values(chart || {});
  if (!rows.length) return null;
  const every = (key) => rows.every((row) => Number.isFinite(row?.[key]));
  if (every('chest')) return 'chest';
  if (every('bust')) return 'bust';
  return null;
}

export function columnsFromRows(chart) {
  const rows = Object.values(chart || {});
  if (!rows.length) return [];
  const every = (k) => rows.every((row) => Number.isFinite(row?.[k]));
  const torso = chartKey(chart);
  const cols = [];
  if (torso) cols.push({ id: torso, label: torso === 'bust' ? 'Bust' : 'Chest', measure: torso });
  for (const k of ['waist', 'hips']) {
    if (every(k)) cols.push({ id: k, label: k === 'hips' ? 'Hips' : 'Waist', measure: k });
  }
  return cols;
}

// ---------------------------------------------------------------------------
// Flat-column detection
//
// Decides whether each measurable column holds flat (half-width) numbers or
// full circumferences. Strategy (multiple signals):
//
//  1. Column label contains a flat keyword ("width", "flat", "1/2", "half",
//     "pit", "across", "garment") → definitely flat.
//  2. Column label contains a body keyword ("body", "around", "circum",
//     "girth") → definitely round.
//  3. Numbers: for each body part, there is a floor below which no adult
//     body is that many inches in circumference. If the max value in the
//     column is below the floor, it must be flat.
//  4. Step size: flat charts step ~1″ per size; body charts step ~2–4″.
//     If the median step is ≤ 1.5″ it is a strong flat signal.
//
// All signals are scored. A column is flat when flat signals > round signals.
// When no signal fires at all, it defaults to flat (industry default).
// ---------------------------------------------------------------------------
const BODY_FLOOR = {
  chest: 28, bust: 28, waist: 22, hips: 28,
  shoulder: 12, neck: 10, arm: 7,
};

// Keywords that strongly imply a flat measurement
const FLAT_KEYWORDS = /\b(width|flat|1\/2|half|pit[- ]to[- ]pit|across|pit|garment|lay|laid)\b/i;
// Keywords that strongly imply a body/circumference measurement
const ROUND_KEYWORDS = /\b(body|around|circum|girth|round|bust|circumference)\b/i;

function detectFlatColumn(colLabel, colId, values, field) {
  if (!field) return false; // non-measurable columns are never scored

  let flatScore = 0;
  let roundScore = 0;
  const label = `${colLabel || ''} ${colId || ''}`;

  if (FLAT_KEYWORDS.test(label)) flatScore += 3;
  if (ROUND_KEYWORDS.test(label)) roundScore += 3;

  const nums = values.filter((n) => Number.isFinite(n));
  if (nums.length) {
    const floor = BODY_FLOOR[field];
    const max = Math.max(...nums);
    if (floor && max < floor) flatScore += 3; // too small to be a full girth

    // Step-size signal (sort ascending, check median step)
    const sorted = [...nums].sort((a, b) => a - b);
    const steps = sorted.slice(1).map((v, i) => v - sorted[i]).filter((s) => s > 0);
    if (steps.length) {
      const median = steps.sort((a, b) => a - b)[Math.floor(steps.length / 2)];
      if (median <= 1.5) flatScore += 2;   // small steps → flat
      if (median >= 3)   roundScore += 2;  // big steps → round
    }
  }

  // Default: flat if tied or no signals
  return flatScore >= roundScore;
}

// ---------------------------------------------------------------------------
// chartFromInput  (replaces the old version)
//
// Parses a brand's raw chart object into a normalised form. All columns that
// are girth-measurable are tagged `flat: true|false` based on the detection
// above. The brand's `fitStyle` override is carried through; it defaults to
// 'regular'. A `kind` field is set: 'flat_garment' or 'round_garment'.
// ---------------------------------------------------------------------------
function readColumnDef(raw, id) {
  if (!raw || typeof raw !== 'object') return null;
  const next = typeof raw.id === 'string' && /^[a-z][a-z0-9]{0,15}$/.test(raw.id) ? raw.id : id;
  const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, 24) : '';
  if (!label) return null;
  return {
    id: next,
    label,
    measure: measureField(raw.measure),
    // If the brand explicitly flagged the column, honour it. null = auto-detect.
    flatOverride: typeof raw.flat === 'boolean' ? raw.flat : null,
  };
}

export function chartFromInput(input) {
  if (!input || typeof input !== 'object') return null;
  const cm = input.unit === 'cm';
  const rawCols = Array.isArray(input.columns) ? input.columns : [];
  const rowsIn = Array.isArray(input.rows) ? input.rows : [];
  const fitStyle = FIT_STYLES[input.fitStyle] ? input.fitStyle : DEFAULT_FIT_STYLE;

  const columns = [];
  rawCols.forEach((raw, i) => {
    const col = readColumnDef(raw, `c${i + 1}`);
    if (!col || columns.some((c) => c.id === col.id)) return;
    columns.push(col);
  });
  if (!columns.length) return null;

  // Parse rows
  const out = {};
  for (const row of rowsIn) {
    const fromKey = typeof row?.key === 'string' ? row.key.trim() : '';
    const fromSize = typeof row?.size === 'string' ? row.size.trim() : '';
    const label = (fromKey || fromSize).slice(0, 14);
    if (!label || out[label]) continue;
    const r = {};
    for (const c of columns) {
      const cell = readCell(row?.[c.id]);
      if (!cell) continue;
      const toInch = (n) => {
        const inch = cm ? n / 2.54 : n;
        return inch >= 2 && inch <= 120 ? Math.round(inch * 10) / 10 : null;
      };
      if (typeof cell === 'number') {
        const inch = toInch(cell);
        if (inch !== null) r[c.id] = inch;
      } else {
        const min = toInch(cell.min);
        const max = toInch(cell.max);
        if (min !== null && max !== null) r[c.id] = { min, max };
      }
    }
    out[label] = r;
  }

  const kept = columns.filter((c) => Object.values(out).some((r) => hasCell(r?.[c.id])));
  const anchor = kept.find((c) => c.measure);
  if (!anchor) return null;

  // Drop rows missing the anchor column
  for (const [label, r] of Object.entries(out)) {
    if (!hasCell(r[anchor.id])) delete out[label];
  }
  if (!Object.keys(out).length) return null;

  // Detect flat/round for each measurable column
  for (const c of kept) {
    if (!c.measure) continue;
    if (c.flatOverride !== null) {
      c.flat = c.flatOverride;
    } else {
      const vals = Object.values(out)
        .map((r) => cellMid(r[c.id]))
        .filter((n) => Number.isFinite(n));
      c.flat = detectFlatColumn(c.label, c.id, vals, c.measure);
    }
  }

  // Chart-level kind: flat_garment if any measurable column is flat
  const anyFlat = kept.some((c) => c.measure && c.flat);
  const kind = anyFlat ? 'flat_garment' : 'round_garment';

  return { rows: out, columns: kept, fitStyle, kind };
}

// ---------------------------------------------------------------------------
// bestSize  (completely rewritten)
//
// Works in garment space: each chart cell is the garment's measurement.
// For flat columns, garment circumference = cell × 2.
// For round columns, garment circumference = cell.
//
// The body circumference window for each size is derived via garmentToBodyWindow.
// A size FITS a body when every scoreable column's body window contains the
// body's measurement.
//
// Selection rule:
//   1. Find all sizes whose PRIMARY column window contains the body.
//   2. Among those, pick the one whose OTHER columns have the smallest
//      total miss (how far outside any window the body measurements sit).
//   3. If no size fully contains the body on the primary column, pick the
//      smallest size that is at or above the body (the garment still closes).
//   4. If still nothing, return the largest size.
//
// Returns the same shape as the old bestSize for compatibility:
//   { sizeKey, row, key, field, label, diff, misfit, flat, fitStyle,
//     bodyWindow: { lo, hi }, circumference }
// ---------------------------------------------------------------------------
export function bestSize(sex, girths, chart = null, columns = null, fitStyle = DEFAULT_FIT_STYLE) {
  // No built-in fallback any more. A scan without a store chart returns null.
  if (!chart) return null;

  const rows = chart || {};
  const entries = Object.entries(rows);
  if (!entries.length) return null;

  const cols = (columns?.length ? columns : columnsFromRows(rows))
    .map((c) => ({ ...c, field: c.field || measureField(c.measure) }));

  const primary = cols.find((c) => c.field);
  if (!primary) return null;

  // Only score columns where EVERY row has a number AND the body has that measurement
  const usable = cols.filter((c) => {
    if (!c.field) return false;
    if (!Number.isFinite(girths?.[c.field])) return false;
    return entries.every(([, row]) => hasCell(row?.[c.id]));
  });

  if (!usable.includes(primary) && !usable.some((c) => c.id === primary.id)) return null;

  const style = fitStyle || DEFAULT_FIT_STYLE;

  // Build a scored list
  const scored = entries.map(([sizeKey, row]) => {
    const pCell = readCell(row?.[primary.id]);
    if (!pCell) return null;

    const pMid = cellMid(pCell);
    const pWin = garmentToBodyWindow(
      typeof pCell === 'number' ? pCell : pMid,
      Boolean(primary.flat),
      primary.field,
      style,
    );

    const bodyVal = girths[primary.field];
    const primaryFits = bodyVal >= pWin.lo && bodyVal <= pWin.hi;
    const primaryMiss = primaryFits ? 0
      : bodyVal < pWin.lo ? pWin.lo - bodyVal
      : bodyVal - pWin.hi;

    // Secondary column misses
    let secondaryMiss = 0;
    for (const c of usable) {
      if (c.id === primary.id) continue;
      const cell = readCell(row?.[c.id]);
      if (!cell) continue;
      const mid = cellMid(cell);
      const win = garmentToBodyWindow(
        typeof cell === 'number' ? cell : mid,
        Boolean(c.flat),
        c.field,
        style,
      );
      const bv = girths[c.field];
      if (!Number.isFinite(bv)) continue;
      const miss = bv >= win.lo && bv <= win.hi ? 0
        : bv < win.lo ? win.lo - bv
        : bv - win.hi;
      secondaryMiss += miss;
    }

    return {
      sizeKey,
      row,
      primaryFits,
      primaryMiss,
      secondaryMiss,
      totalMiss: primaryMiss + secondaryMiss * 0.5,
      pWin,
      pMid,
    };
  }).filter(Boolean);

  if (!scored.length) return null;

  // Sort: sizes that fit the primary first (by totalMiss), then overflow sizes
  const fitting = scored.filter((s) => s.primaryFits).sort((a, b) => a.totalMiss - b.totalMiss);
  const candidate = fitting.length ? fitting[0]
    : scored.filter((s) => s.primaryMiss > 0).sort((a, b) => a.pWin.lo - b.pWin.lo)[0]
    ?? scored[scored.length - 1];

  const pCell = readCell(candidate.row?.[primary.id]);
  return {
    sizeKey: candidate.sizeKey,
    row: candidate.row,
    key: primary.id,
    field: primary.field,
    label: primary.label,
    diff: candidate.primaryMiss,
    misfit: candidate.totalMiss,
    flat: Boolean(primary.flat),
    fitStyle: style,
    bodyWindow: candidate.pWin,
    circumference: candidate.pWin.circumference,
  };
}

// ---------------------------------------------------------------------------
// adjustForProportions  (rewritten on the same garment-window logic)
//
// Accepts a first-pass size and re-scores every size using the full body
// catalogue (all measurements the scan returned) against the garment windows.
// Falls back to the input size if nothing can be re-scored.
// ---------------------------------------------------------------------------
export function adjustForProportions(size, girths, columns, rows, all = null) {
  if (!size || !rows) return { size, reason: null };

  const body = { ...(girths || {}), ...(all || {}) };
  const cols = columns || [];
  const fitStyle = size.fitStyle || DEFAULT_FIT_STYLE;

  const byId = new Map(cols.map((c) => [c.id, c]));
  const entries = Object.entries(rows);
  if (!entries.length) return { size, reason: null };

  // Build a cost for each candidate size using garment-window logic
  const scored = entries.map(([key, row]) => {
    let cost = 0;
    let n = 0;
    for (const c of cols) {
      const field = c.field || measureField(c.measure);
      if (!field) continue;
      const measured = Number.isFinite(body[field]) ? body[field] : null;
      if (measured === null) continue;
      const cell = readCell(row[c.id]);
      if (!cell) continue;
      const mid = cellMid(cell);
      const win = garmentToBodyWindow(
        typeof cell === 'number' ? cell : mid,
        Boolean(c.flat),
        field,
        fitStyle,
      );
      // Cost: 0 if inside window, penalised proportionally outside
      const miss = measured >= win.lo && measured <= win.hi ? 0
        : measured < win.lo ? (win.lo - measured) * 4   // too small: penalise hard
        : (measured - win.hi) * 0.6;                    // too big: penalise lightly
      cost += miss;
      n += 1;
    }
    return { key, row, cost: n ? cost / n : 99, n };
  });

  const usable = scored.filter((s) => s.n > 0).sort((a, b) => a.cost - b.cost);
  if (!usable.length) return { size, reason: null };

  const best = usable[0];

  // Recompute the body window for the returned size using the primary column
  const primary = cols.find((c) => (c.field || measureField(c.measure)) === size.field);
  let bodyWindow = size.bodyWindow || null;
  if (primary) {
    const cell = readCell(best.row[primary.id]);
    if (cell) {
      const mid = cellMid(cell);
      bodyWindow = garmentToBodyWindow(
        typeof cell === 'number' ? cell : mid,
        Boolean(primary.flat),
        size.field,
        fitStyle,
      );
    }
  }

  return {
    size: {
      ...size,
      sizeKey: best.key,
      row: best.row,
      bodyWindow: bodyWindow || size.bodyWindow,
    },
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Convenience: given a size result, build a human-readable body-window string
// for the response (e.g. "38 – 42 in chest").
// ---------------------------------------------------------------------------
export function bodyWindowLabel(size, unit = 'in') {
  if (!size?.bodyWindow) return null;
  const { lo, hi } = size.bodyWindow;
  const r = unit === 'cm'
    ? `${Math.round(lo * 2.54)} – ${Math.round(hi * 2.54)} cm`
    : `${Math.round(lo * 10) / 10} – ${Math.round(hi * 10) / 10} in`;
  return r;
}
