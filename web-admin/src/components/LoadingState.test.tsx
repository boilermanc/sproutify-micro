import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import LoadingState from './LoadingState';
import FarmBrand from './FarmBrand';

afterEach(cleanup);

it('announces loading without requiring an animated illustration', () => {
  render(<LoadingState />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading your farm…');
  expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
});

it('announces a specific task while loading within a screen', () => {
  render(<LoadingState compact message="Loading daily tasks…" />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading daily tasks…');
});

it('keeps the farm brand identifiable in expanded navigation', () => {
  render(<FarmBrand />);
  expect(screen.getByLabelText('Sproutify Micro')).toHaveTextContent('Sproutify');
  expect(screen.getByLabelText('Sproutify Micro')).toHaveTextContent('Micro');
});
