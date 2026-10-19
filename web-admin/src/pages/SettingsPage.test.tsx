import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SettingsPage from './SettingsPage';

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  refresh: vi.fn(),
  openPortal: vi.fn(),
}));

vi.mock('../lib/supabaseClient', () => ({
  getSupabaseClient: () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  }),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ addToast: mocks.addToast }),
}));

vi.mock('@/hooks/useSubscription', () => ({
  TIER_INFO: {},
  useSubscription: () => ({
    subscription: { status: 'active', tier: null },
    isLoading: false,
    openPortal: mocks.openPortal,
    getUsagePercentage: () => 0,
    refresh: mocks.refresh,
  }),
}));

const initialFarm = {
  farm_uuid: 'farm-a',
  farmname: 'Demo Farm',
  seeding_days: ['Monday'],
};

const initialProfile = {
  id: 'owner-a',
  email: 'owner@example.test',
  firstname: 'Alex',
  lastname: 'Grower',
  farm_uuid: 'farm-a',
  role: 'Owner',
  is_active: true,
};

let profile = { ...initialProfile };
let farmResult: { data: unknown; error: unknown };
let profileResult: { data: unknown; error: unknown };
let updates: { table: string; payload: Record<string, unknown> }[];
let queries: { table: string; filters: [string, unknown][] }[];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('sproutify_session', JSON.stringify({
    userId: 'owner-a', farmUuid: 'farm-a', farmName: 'Demo Farm', role: 'Owner',
  }));
  profile = { ...initialProfile };
  farmResult = { data: { ...initialFarm, farmname: 'Updated Farm' }, error: null };
  profileResult = { data: { id: 'owner-a' }, error: null };
  updates = [];
  queries = [];
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner-a' } }, error: null });
  mocks.from.mockImplementation((table: string) => {
    let isUpdate = false;
    const query = { table, filters: [] as [string, unknown][] };
    queries.push(query);
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        query.filters.push([column, value]);
        return builder;
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        isUpdate = true;
        updates.push({ table, payload });
        return builder;
      }),
      single: vi.fn(async () => {
        if (isUpdate) return table === 'farms' ? farmResult : profileResult;
        return { data: table === 'profile' ? { ...profile } : { ...initialFarm }, error: null };
      }),
    };
    return builder;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function openSettings() {
  render(<MemoryRouter><SettingsPage /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Settings' });
}

async function saveFarm() {
  fireEvent.change(screen.getByLabelText('Farm Name'), { target: { value: 'Updated Farm' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Farm Information' }));
  await waitFor(() => expect(mocks.addToast).toHaveBeenCalled());
}

function expectNoSuccess() {
  expect(mocks.addToast).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
}

describe('Settings farm permissions', () => {
  it('offers a Farm Hand a personal-only page without farm or billing controls', async () => {
    profile.role = 'Farm Hand';
    render(<MemoryRouter><SettingsPage profileOnly /></MemoryRouter>);
    await screen.findByRole('heading', {name:'My Profile'});
    expect(screen.getByLabelText('First Name')).toBeEnabled();
    expect(screen.getByRole('button', {name:'Save Profile'})).toBeEnabled();
    expect(screen.queryByLabelText('Farm Name')).not.toBeInTheDocument();
    expect(screen.queryByText('Account & Subscription')).not.toBeInTheDocument();
  });
  it('allows an active Owner to edit farm name and seeding days', async () => {
    await openSettings();
    expect(screen.getByLabelText('Farm Name')).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'Monday' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save Farm Information' })).toBeEnabled();
  });

  it.each(['Farm Hand', 'Editor', 'Viewer', 'Admin', 'unknown'])(
    'keeps farm controls read-only for %s despite a cached Owner role', async (role) => {
      profile.role = role;
      await openSettings();
      expect(screen.getByLabelText('Farm Name')).toBeDisabled();
      expect(screen.getByRole('checkbox', { name: 'Monday' })).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Save Farm Information' })).not.toBeInTheDocument();
      expect(updates).toEqual([]);
      expect(screen.getByRole('button', { name: 'Save Profile' })).toBeEnabled();
    },
  );

  it('keeps an inactive Owner from editing farm settings', async () => {
    profile.is_active = false;
    await openSettings();
    expect(screen.getByLabelText('Farm Name')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save Farm Information' })).not.toBeInTheDocument();
  });

  it('uses the authenticated identity and profile farm instead of cached identity and farm', async () => {
    localStorage.setItem('sproutify_session', JSON.stringify({
      userId: 'someone-else', farmUuid: 'another-farm', role: 'Owner',
    }));
    await openSettings();
    expect(queries.find((query) => query.table === 'profile')?.filters).toContainEqual(['id', 'owner-a']);
    expect(queries.find((query) => query.table === 'farms')?.filters).toContainEqual(['farm_uuid', 'farm-a']);
  });

  it.each(['role', 'active', 'farm', 'identity'])(
    'rechecks %s before saving and refuses a changed authorization', async (change) => {
      await openSettings();
      if (change === 'role') profile.role = 'Farm Hand';
      if (change === 'active') profile.is_active = false;
      if (change === 'farm') profile.farm_uuid = 'another-farm';
      if (change === 'identity') {
        mocks.getUser.mockResolvedValue({ data: { user: { id: 'another-user' } }, error: null });
      }
      await saveFarm();
      expect(updates).toEqual([]);
      expectNoSuccess();
      expect(JSON.parse(localStorage.getItem('sproutify_session')!).farmName).toBe('Demo Farm');
    },
  );
});

describe('Settings save confirmation', () => {
  it('does not write or claim an update when farm settings have not changed', async () => {
    await openSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Save Farm Information' }));
    await waitFor(() => expect(mocks.addToast).toHaveBeenCalled());
    expect(updates).toEqual([]);
    expectNoSuccess();
  });

  it('does not write or claim an update when the personal profile has not changed', async () => {
    await openSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }));
    await waitFor(() => expect(mocks.addToast).toHaveBeenCalled());
    expect(updates).toEqual([]);
    expectNoSuccess();
  });

  it.each([
    { data: null, error: null },
    { data: null, error: { message: 'No row returned', code: 'PGRST116' } },
    { data: null, error: { message: 'permission denied', code: '42501' } },
  ])('does not claim success or change cached farm name on an unconfirmed update: %j', async (result) => {
    farmResult = result;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await openSettings();
    await saveFarm();
    expect(updates).toHaveLength(1);
    expectNoSuccess();
    expect(mocks.addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    expect(JSON.parse(localStorage.getItem('sproutify_session')!).farmName).toBe('Demo Farm');
  });

  it('updates cached farm name only after the server confirms the saved row', async () => {
    farmResult = { data: { ...initialFarm, farmname: 'Server Confirmed Farm' }, error: null };
    await openSettings();
    await saveFarm();
    expect(updates).toEqual([{ table: 'farms', payload: { farmname: 'Updated Farm', seeding_days: ['Monday'] } }]);
    expect(JSON.parse(localStorage.getItem('sproutify_session')!).farmName).toBe('Server Confirmed Farm');
    expect(mocks.addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('does not repeat a farm update when Save is clicked again after success', async () => {
    await openSettings();
    await saveFarm();
    mocks.addToast.mockClear();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Farm Information' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Save Farm Information' }));
    await waitFor(() => expect(mocks.addToast).toHaveBeenCalled());
    expect(updates).toHaveLength(1);
    expectNoSuccess();
  });

  it('does not claim success when a profile update returns no row', async () => {
    profileResult = { data: null, error: null };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await openSettings();
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }));
    await waitFor(() => expect(mocks.addToast).toHaveBeenCalled());
    expect(updates[0]?.table).toBe('profile');
    expectNoSuccess();
  });

  it('allows a farm hand to save their personal profile with a confirmed row', async () => {
    profile.role = 'Farm Hand';
    await openSettings();
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }));
    await waitFor(() => expect(mocks.addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' })));
    expect(updates).toHaveLength(1);
    expect(updates[0]?.table).toBe('profile');
    expect(updates[0]?.payload).not.toHaveProperty('role');
    expect(updates[0]?.payload).not.toHaveProperty('farm_uuid');
  });
});
