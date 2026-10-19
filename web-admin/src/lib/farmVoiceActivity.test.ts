import { expect, it } from 'vitest';
import { createFarmVoiceActivity } from './farmVoiceActivity';
it('sends a spoken turn only after sustained sound followed by a natural pause', () => {
  const detect = createFarmVoiceActivity(0);
  for (let now = 80; now <= 800; now += 80) expect(detect(.05, now)).toBe('listen');
  expect(detect(0, 2000)).toBe('listen'); expect(detect(0, 2240)).toBe('send');
});
it('ends silence locally instead of uploading it', () => { const detect = createFarmVoiceActivity(0); expect(detect(0, 20000)).toBe('silent'); });
it('ignores separated brief clicks and low background levels', () => {
  const detect = createFarmVoiceActivity(0);
  for (let now = 80; now < 20000; now += 80) expect(detect(now % 800 === 0 ? .06 : .005, now)).toBe('listen');
  expect(detect(.005, 20000)).toBe('silent');
});
