import { expect, it } from 'vitest';
import { workspaceNavigation } from './workspaceNavigation';

it('puts everyday work before setup for owners and editors', () => {
  for (const role of ['Owner', 'Editor']) {
    expect(workspaceNavigation(role).map(item => item.label)).toEqual(['Today', 'Growing', 'Orders', 'Farm']);
  }
});
it('keeps owner order tools out of the Farm Hand and unknown navigation', () => {
  for (const role of ['Farm Hand', undefined, '']) {
    expect(workspaceNavigation(role).map(item => item.to)).toEqual(['/today', '/growing', '/farm']);
  }
});
