import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { RecipeStep } from '../types/recipe';
import RecipeBuilder from './RecipeBuilder';

const fixtures = vi.hoisted(() => ({
  steps: [
    { description_id: 2, description_name: 'Growing', sequence_order: 2, duration: 7, duration_unit: 'Days', water_type: 'water', water_method: 'bottom', water_frequency: '2x daily' },
    { description_id: 1, description_name: 'Seeding', sequence_order: 1, duration: 1, duration_unit: 'Hours' },
  ],
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams()],
  useLocation: () => ({ state: { globalRecipe: { recipe_name: 'Radish', variety_name: 'Rambo Radish' }, globalSteps: fixtures.steps } }),
}));
vi.mock('../lib/supabaseClient', () => ({ getSupabaseClient: () => ({
  from: (table: string) => ({ select: () => ({ order: async () => ({ data: table === 'varieties'
    ? [{ varietyid: 9, name: 'Rambo Radish' }]
    : [{ description_id: 1, description_name: 'Seeding' }, { description_id: 2, description_name: 'Growing' }] }) }) }),
}) }));
vi.mock('../components/recipes/builder/RecipeStack', () => ({ RecipeStack: ({ steps }: { steps: RecipeStep[] }) => <output data-testid="copied-steps">{JSON.stringify(steps)}</output> }));
vi.mock('../components/recipes/builder/StepComposer', () => ({ StepComposer: () => null }));
vi.mock('../components/ui/ErrorModal', () => ({ ErrorModal: () => null }));
afterEach(cleanup);

it('copies global steps in sequence and retains watering instructions without mutating the template', async () => {
  render(<RecipeBuilder />);
  const output = await screen.findByTestId('copied-steps');
  const steps = JSON.parse(output.textContent || '[]');
  expect(steps.map((step: RecipeStep) => step.description_name)).toEqual(['Seeding', 'Growing']);
  expect(steps[1]).toMatchObject({ water_type: 'water', water_method: 'bottom', water_frequency: '2x daily' });
  expect(fixtures.steps.map(step => step.description_name)).toEqual(['Growing', 'Seeding']);
});
