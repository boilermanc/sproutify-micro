import { describe, expect, it } from 'vitest';
import { formatCalendarDate, localDateString } from './dateUtils';

describe('farm calendar dates', () => {
  it('keeps the local evening on its calendar day', () => {
    expect(localDateString(new Date(2026, 9, 17, 22, 30))).toBe('2026-10-17');
  });
  it('keeps the local early morning on its calendar day', () => {
    expect(localDateString(new Date(2026, 9, 18, 0, 15))).toBe('2026-10-18');
  });
  it('pads dates and handles the year boundary without mutating the input', () => {
    const date = new Date(2027, 0, 1, 0, 1);
    const timestamp = date.getTime();
    expect(localDateString(date)).toBe('2027-01-01');
    expect(date.getTime()).toBe(timestamp);
  });
  it('refuses an invalid date rather than producing a malformed database date', () => {
    expect(() => localDateString(new Date('invalid'))).toThrow(RangeError);
  });
  it('displays a stored calendar date without shifting it to the previous evening', () => {
    expect(formatCalendarDate('2026-10-18', 'en-US')).toBe('10/18/2026');
    expect(formatCalendarDate('2027-01-01', 'en-US')).toBe('1/1/2027');
  });
  it('retains timezone conversion for true event timestamps', () => {
    const timestamp = '2026-10-18T02:30:00Z';
    expect(formatCalendarDate(timestamp, 'en-US')).toBe(new Date(timestamp).toLocaleDateString('en-US'));
  });
});
