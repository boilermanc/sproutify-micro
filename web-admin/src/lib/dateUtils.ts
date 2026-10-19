/** A farm calendar day follows the grower's local clock, not the UTC day. */
export function localDateString(date = new Date()): string {
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid calendar date');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** PostgreSQL DATE values have no timezone; preserve their day when displaying. */
export function formatCalendarDate(value: string, locale?: string): string {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  return date.toLocaleDateString(locale);
}
