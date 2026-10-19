import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it } from 'vitest';
import FarmPage from './FarmPage';

afterEach(() => { cleanup(); localStorage.clear(); });
it('keeps detailed records reachable from the owner farm hub', () => {
  localStorage.setItem('sproutify_session', JSON.stringify({role:'Owner'}));
  render(<MemoryRouter><FarmPage /></MemoryRouter>);
  expect(screen.getByText('Crops & recipes').closest('a')).toHaveAttribute('href','/recipes');
  fireEvent.click(screen.getByText('Records & more tools'));
  expect(screen.getByText('Tray records').closest('a')).toHaveAttribute('href','/trays');
  expect(screen.getByText('Records & more tools')).toBeInTheDocument();
});
it('gives a Farm Hand reference and profile links without owner setup controls', () => {
  localStorage.setItem('sproutify_session', JSON.stringify({role:'Farm Hand'}));
  render(<MemoryRouter><FarmPage /></MemoryRouter>);
  expect(screen.getByRole('link', {name:/Your profile/})).toHaveAttribute('href','/profile');
  expect(screen.queryByText('Farm settings')).not.toBeInTheDocument();
  expect(screen.queryByText('Records & more tools')).not.toBeInTheDocument();
});
