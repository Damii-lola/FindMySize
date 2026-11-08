/**
 * Talking to a size_charts table whose shape is not exactly the one this code was written for.
 *
 * The table has grown column by column (popup, popup_uses, fit_style, brand, ...), each added by
 * a hand-run migration, and a project that is missing one of them used to break whole screens:
 * a list query that names a column the table lacks is answered with an error, not with the rows.
 * So the optional columns are asked for, and when the database says one is not there it is
 * dropped from the query and the query is asked again. The required ones are never dropped:
 * without them there is nothing to show.
 *
 * The same goes for writes: a key the table does not have is removed from the row and the write
 * is tried again, and what was left out is logged once so the fix (run supabase.sql) is findable.
 */
import { HttpError } from './errors.js';

/** The column the database says it does not have, from either of its wordings, or ''. */
export function missingColumn(error) {
  const text = String(error?.message || '');
  // Postgres:  column size_charts.brand does not exist   /   column "brand" of relation "size_charts" does not exist
  const pg = /column\s+"?(?:\w+"?\s*\.\s*"?)?(\w+)"?\s+(?:of relation\s+"?\w+"?\s+)?does not exist/i.exec(text);
  if (pg) return pg[1];
  // PostgREST: Could not find the 'brand' column of 'size_charts' in the schema cache
  const rest = /Could not find the '(\w+)' column/i.exec(text);
  return rest ? rest[1] : '';
}

const told = new Set();
function note(table, dropped) {
  const fresh = dropped.filter((c) => !told.has(`${table}.${c}`));
  if (!fresh.length) return;
  fresh.forEach((c) => told.add(`${table}.${c}`));
  console.warn(`[schema] ${table} has no column(s): ${fresh.join(', ')} — carrying on without them. Run supabase.sql to add them.`);
}

/** A database error as an HttpError whose message is safe and useful to show (it is plumbing, not a secret). */
export function dbError(error, what) {
  return new HttpError(500, `${what}: ${error?.message || 'database error'}`, undefined, { expose: true });
}

/**
 * Run a select, dropping any optional column the table turns out not to have.
 * @param {(columns: string) => PromiseLike<{data: any, error: any}>} run  builds and runs the query for a column list
 * @param {string[]} columns  everything we would like back
 * @param {{ required?: string[], table?: string }} options
 */
export async function selectTolerant(run, columns, { required = [], table = 'size_charts' } = {}) {
  let cols = [...columns];
  const dropped = [];
  for (let attempt = 0; attempt <= columns.length; attempt += 1) {
    const { data, error } = await run(cols.join(', '));
    if (!error) {
      note(table, dropped);
      return { data, dropped };
    }
    const missing = missingColumn(error);
    if (!missing || !cols.includes(missing) || required.includes(missing)) throw dbError(error, `Could not read ${table}`);
    cols = cols.filter((c) => c !== missing);
    dropped.push(missing);
  }
  throw new HttpError(500, `Could not read ${table}`, undefined, { expose: true });
}

/**
 * Run a write, dropping any key of the row that the table does not have.
 * @param {(row: object) => PromiseLike<{data: any, error: any}>} run  writes the row it is given
 * @returns {Promise<{data: any, error: any, dropped: string[]}>}  the last result; error is set if it still failed
 */
export async function writeTolerant(run, row, { required = [], table = 'size_charts' } = {}) {
  const current = { ...row };
  const dropped = [];
  let result = { data: null, error: null };
  for (let attempt = 0; attempt <= Object.keys(row).length; attempt += 1) {
    result = await run(current);
    const missing = result.error ? missingColumn(result.error) : '';
    if (!missing || !(missing in current) || required.includes(missing)) break;
    delete current[missing];
    dropped.push(missing);
  }
  if (!result.error) note(table, dropped);
  return { ...result, dropped };
}
