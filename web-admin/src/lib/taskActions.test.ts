import {expect,it} from 'vitest';
import {isHarvestAction} from './taskActions';
it.each(['Harvest','Harvest Rambo Radish','Harvesting','HARVEST pea shoots'])('recognizes the actionable crop harvest label %s',action=>expect(isHarvestAction(action)).toBe(true));
it.each(['At Risk Harvest','Seed','Ready to Harvest','Harvestable inventory'])('does not complete the informational label %s as harvest',action=>expect(isHarvestAction(action)).toBe(false));
