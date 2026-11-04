/**
 * Size charts, and how one is chosen.
 *
 * US retail size charts in inches; men are sized on the chest and women on the
 * bust. But a chart is a table of girths per size, and a body is under no
 * obligation to agree with all of them at once: a 6'1" man with a 32" waist reads
 * S at the waist and M at the hips, because a chart like this assumes girth and
 * height rise together. Sizing off the chest alone throws away the rest of what
 * the clip actually measured - which is exactly what happened on a real live clip,
 * where a 38" chest sitting precisely on the 36/40 boundary resolved to S while
 * his hips were saying M.
 *
 * Which columns a chart is scored on is the chart's business, not ours. A store
 * types its own table: chest and waist for a shirt, waist and inseam for trousers,
 * plus whatever else it prints (a sleeve length, a body length) that this app can
 * show but cannot read off a body. The FIRST column this app can measure is the
 * one a size is decided on; every other measured column joins the same worst-case
 * comparison; a column with no measurement behind it is never scored, because
 * holding a number this app did not read against one it did would be an opinion,
 * not a fit.
 *
 * The chart's height column is deliberately not what decides. Height and girth do
 * not move together in the direction the column implies, and the honest thing for
 * a tall slim man is to be told the girths, not to be handed an XXL.
 *
 * The charts below are the fallback. A store that has typed its own chart gets
 * sized against that instead (chartFromInput, below), and the same rules apply
 * either way: a chart is still a table of numbers, and the size is still the row
 * with the smallest worst disagreement.
 */
import { measureField } from '../shared/measures.js';

/** A cell is a number, or a range { min, max } written as "from this to this". */
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

/** Distance from a body measurement to a chart cell. Inside a range is a perfect fit. */
function distanceTo(measured, cell) {
  if (typeof cell === 'number') return Math.abs(measured - cell);
  if (measured >= cell.min && measured <= cell.max) return 0;
  return measured < cell.min ? cell.min - measured : measured - cell.max;
}

function cellSortKey(cell) {
  return typeof cell === 'number' ? cell : cell.max;
}

export const CHARTS = {
  male: {
    XS: { chest: 32, waist: 26, hips: 34, height: 66 },
    S: { chest: 36, waist: 30, hips: 38, height: 68 },
    M: { chest: 40, waist: 34, hips: 40, height: 70 },
    L: { chest: 44, waist: 38, hips: 44, height: 71 },
    XL: { chest: 48, waist: 42, hips: 48, height: 72 },
    XXL: { chest: 52, waist: 46, hips: 52, height: 73 },
  },
  female: {
    XS: { bust: 32, waist: 24, hips: 34, height: 62 },
    S: { bust: 34, waist: 26, hips: 36, height: 64 },
    M: { bust: 36, waist: 28, hips: 38, height: 65 },
    L: { bust: 38, waist: 30, hips: 40, height: 66 },
    XL: { bust: 40, waist: 33, hips: 43, height: 67 },
    XXL: { bust: 42, waist: 36, hips: 46, height: 68 },
  },
};

/**
 * The chest-or-bust column of a chart: the one every row actually has.
 *
 * A store's chart may carry a chest column, a bust column, or neither. It follows
 * the table, not the sex, so a men's shirt chart that the store typed as "chest"
 * is not read as a bust chart just because the shopper picked "a woman". Null
 * means the chart has no torso column at all and cannot size anybody.
 */
export function chartKey(chart) {
  const rows = Object.values(chart || {});
  if (!rows.length) return null;
  const every = (key) => rows.every((row) => Number.isFinite(row?.[key]));
  if (every('chest')) return 'chest';
  if (every('bust')) return 'bust';
  return null;
}

/**
 * The columns of a chart saved as rows only — before stores could name their own.
 *
 * Every column a row carries is a column the chart has; the torso one comes
 * first, because that is what decides a size, and waist and hips follow in the
 * order a tape would go round. This is what the built-in charts are read as too,
 * which is why there is only ever one scoring rule in this file.
 */
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

/**
 * The size whose WORST disagreement with any measured column is the smallest.
 *
 * Worst case rather than average, because the garment that can be worn is the one
 * that is loose somewhere; the one that is snug somewhere is the one that does not
 * close. An exact tie therefore goes to the LARGER size - 38" of chest is as far
 * from a 36" row as from a 40" one, and the 40" garment is the one that closes.
 * (It used to keep the smaller, which read as "size down when unsure".)
 *
 * A column only counts when EVERY row carries it and this body has that
 * measurement. A blank cell must not become an advantage: without that rule, a
 * row with its waist left out would be judged on its chest alone and could win
 * against a row that was honest about both.
 *
 * `diff` stays the difference on the deciding column: it is what the
 * uncertain-gender path compares between the two charts, and what the snug/loose
 * note is written from.
 */
export function bestSize(sex, girths, chart = CHARTS[sex], columns = null) {
  const rows = chart || {};
  const entries = Object.entries(rows);
  if (!entries.length) return null;
  const cols = (columns?.length ? columns : columnsFromRows(rows))
    .map((c) => ({ ...c, field: measureField(c.measure) }));
  const primary = cols.find((c) => c.field);
  if (!primary) return null;
  const usable = cols.filter((c) => c.field
    && Number.isFinite(girths?.[c.field])
    && entries.every(([, row]) => hasCell(row?.[c.id])));
  // The column a size is decided on has to be this body's own tape. Without it
  // there is no anchor to lay the table against, and no size beats a guessed one.
  if (!usable.includes(primary)) return null;
  // A chart measured with the garment laid flat ("pit to pit") states half a
  // circumference. The tape went round the body, so it is the body's half that
  // gets compared with a flat column, never the full girth - which otherwise sits
  // above every row and pins the answer to the largest size.
  const onChart = (c) => (c.flat ? girths[c.field] / 2 : girths[c.field]);
  let best = null;
  for (const [sizeKey, row] of entries) {
    const primaryCell = readCell(row?.[primary.id]);
    if (!primaryCell) continue;
    const anchor = distanceTo(onChart(primary), primaryCell);
    const worst = usable.reduce((m, c) => {
      const cell = readCell(row?.[c.id]);
      return cell ? Math.max(m, distanceTo(onChart(c), cell)) : m;
    }, anchor);
    if (!best || worst < best.misfit
      || (worst === best.misfit && cellSortKey(primaryCell) > cellSortKey(readCell(best.row[primary.id])))) {
      best = { sizeKey, row, key: primary.id, field: primary.field, label: primary.label, diff: anchor, misfit: worst, flat: Boolean(primary.flat) };
    }
  }
  return best;
}

/** A column id a row can be keyed by, and a label a shopper can read. */
function readColumns(raw, id) {
  if (!raw || typeof raw !== 'object') return null;
  const next = typeof raw.id === 'string' && /^[a-z][a-z0-9]{0,15}$/.test(raw.id) ? raw.id : id;
  const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, 24) : '';
  if (!label) return null;
  return { id: next, label, measure: measureField(raw.measure) };
}

/**
 * A store's own chart, as it was typed, in the shape the sizing above wants:
 * inches, one entry per size keyed by the label the store gave that size, and the
 * columns in the order the store put them.
 *
 * The unit belongs to the chart, not to the reader: a chart typed in centimetres
 * is converted here, once, rather than in every place that reads a chart. The
 * plausibility bounds are wide — anything from a 5" cuff to a 120" length — and a
 * row that cannot be scored is dropped rather than guessed at, so one broken row
 * does not lose the other five.
 *
 * A column is dropped when no row carries a number for it, because a column with
 * no numbers is not part of the table. A column carried by only SOME rows is kept
 * (it is still the garment's number, and the shopper sees it beside their size)
 * but bestSize will not score on it, since that would favour the rows missing it.
 *
 * Returns null when nothing usable is left, and the caller falls back to the
 * built-in chart rather than sizing a body against an empty table.
 */
export function chartFromInput(input) {
  if (!input || typeof input !== 'object') return null;
  const cm = input.unit === 'cm';
  const rawCols = Array.isArray(input.columns) ? input.columns : [];
  const rowsIn = Array.isArray(input.rows) ? input.rows : [];

  const columns = [];
  rawCols.forEach((raw, i) => {
    const col = readColumns(raw, `c${i + 1}`);
    if (!col || columns.some((c) => c.id === col.id)) return;
    columns.push(col);
  });
  if (!columns.length) return null;

  const out = {};
  for (const row of rowsIn) {
    const fromKey = typeof row?.key === 'string' ? row.key.trim() : '';
    const fromSize = typeof row?.size === 'string' ? row.size.trim() : '';
    const label = (fromKey || fromSize).slice(0, 14);
    // Two rows with the same label are the same size; the first one wins, because
    // that is the order the store typed them in.
    if (!label || out[label]) continue;
    const r = {};
    for (const c of columns) {
      const cell = readCell(row?.[c.id]);
      if (!cell) continue;
      const toInch = (n) => {
        const inch = cm ? n / 2.54 : n;
        return inch >= 5 && inch <= 120 ? Math.round(inch * 10) / 10 : null;
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
  // A size with no number in the deciding column cannot be laid against anything.
  for (const [label, r] of Object.entries(out)) {
    if (!hasCell(r[anchor.id])) delete out[label];
  }
  if (!Object.keys(out).length) return null;
  markFlatColumns(kept, out);
  return { rows: out, columns: kept };
}

/**
 * Garment charts are printed two ways: girths taken round a body, and widths taken
 * across a garment lying flat ("chest width", "pit to pit", "1/2 chest"). The two
 * cannot be told apart by the label, but they can by the numbers: a chest column
 * whose LARGEST size is under 28" is not describing an adult body, because no
 * adult chest is 27" round. Waist and hips get the same treatment, with the floor
 * moved to where a body stops being a body.
 *
 * Nothing is flagged when a column has no measure attached: a merchant's own
 * unlabelled column (a length, a cuff) is not ours to reinterpret.
 */
const FLAT_BELOW = { chest: 28, bust: 28, waist: 24, hips: 30 };

function markFlatColumns(columns, rows) {
  const list = Object.values(rows || {});
  for (const c of columns) {
    const field = measureField(c.measure);
    const floor = FLAT_BELOW[field];
    if (!floor) continue;
    const nums = list.map((r) => r[c.id]).filter((n) => Number.isFinite(n));
    if (!nums.length) continue;
    if (Math.max(...nums) < floor) c.flat = true;
  }
}

/**
 * A chart cannot list every body. Chest can say M while the shoulders are cut
 * for L. After the chart picks a row, look at proportions the chart did not
 * ask about and move one size when they would make that row too small.
 *
 * Shoulder width over chest girth. A typical body sits near 0.44. Past 0.50,
 * or more than 1.75 inches above what that chest implies, the shoulders are
 * the limiting part and the next size up is the honest answer.
 */
const SHOULDER_PER_CHEST = 0.44;
const SHOULDER_BROAD = 0.50;
const SHOULDER_OVER_IN = 1.75;

export function adjustForProportions(size, girths, columns, rows) {
  if (!size || !girths) return { size, reason: null };
  const cols = columns || [];
  const scoredShoulder = cols.some((c) => c.measure === 'shoulder' || c.field === 'shoulder');
  // The chart already compared shoulders. Do not second-guess a number it listed.
  if (scoredShoulder) return { size, reason: null };

  const chest = Number(girths.chest);
  const shoulder = Number(girths.shoulder);
  if (!Number.isFinite(chest) || !Number.isFinite(shoulder) || chest < 20) {
    return { size, reason: null };
  }
  const expected = chest * SHOULDER_PER_CHEST;
  const ratio = shoulder / chest;
  const broad = ratio >= SHOULDER_BROAD || shoulder >= expected + SHOULDER_OVER_IN;
  if (!broad) return { size, reason: null };

  const order = Object.keys(rows || {});
  const i = order.indexOf(size.sizeKey);
  if (i < 0 || i >= order.length - 1) return { size, reason: null };
  const nextKey = order[i + 1];
  const nextRow = rows[nextKey];
  if (!nextRow) return { size, reason: null };

  const bumped = { ...size, sizeKey: nextKey, row: nextRow };
  const reason = `Your ${size.label || 'chest'} fits ${size.sizeKey}, but your shoulders are wide for that size, so ${nextKey} will sit better across the back.`;
  return { size: bumped, reason };
}
