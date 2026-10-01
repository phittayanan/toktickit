// The id columns are 32-bit integers.
const MAX_ROW_ID = 2147483647

// The row a path's `:id` can name, or null: a malformed or out-of-range id
// can never resolve to a row, so it is answered as a missing one (ADR-0004).
export function rowIdOf(param: unknown): number | null {
  const id = Number(param)

  return Number.isInteger(id) && id > 0 && id <= MAX_ROW_ID ? id : null
}
