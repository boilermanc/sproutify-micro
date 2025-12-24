import { getSupabaseClient } from '@/lib/supabaseClient';

export interface AssignableTray {
  tray_id: number;
  recipe_id: number;
  recipe_name: string;
  sow_date?: string | null;
  days_grown: number;
  days_until_ready: number;
}

export async function fetchAssignableTrays(farmUuid: string, productId: number): Promise<AssignableTray[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const readyDateMin = new Date(today);
  readyDateMin.setDate(readyDateMin.getDate() - 11);
  const readyDateMax = new Date(today);
  readyDateMax.setDate(readyDateMax.getDate() - 10);
  const readyDateMinStr = readyDateMin.toISOString().split('T')[0];
  const readyDateMaxStr = readyDateMax.toISOString().split('T')[0];

  const { data, error } = await getSupabaseClient()
    .from('trays')
    .select(`
      tray_id,
      sow_date,
      recipe_id,
      recipes!inner (
        recipe_name,
        product_recipe_mapping!inner (
          product_id
        )
      )
    `)
    .eq('farm_uuid', farmUuid)
    .eq('recipes.product_recipe_mapping.product_id', productId)
    .is('customer_id', null)
    .eq('status', 'active')
    .is('harvest_date', null)
    .gte('sow_date', readyDateMinStr)
    .lte('sow_date', readyDateMaxStr)
    .order('sow_date', { ascending: true });

  if (error) {
    console.error('[fetchAssignableTrays] Error fetching trays:', error);
    return [];
  }

  return (data || [])
    .map((tray: any) => {
      const recipe = Array.isArray(tray.recipes) ? tray.recipes[0] : tray.recipes;
      return {
        tray_id: tray.tray_id,
        recipe_id: tray.recipe_id,
        recipe_name: recipe?.recipe_name || 'Unknown',
        sow_date: tray.sow_date,
        days_grown: tray.sow_date
          ? Math.max(
              0,
              Math.floor((today.getTime() - new Date(tray.sow_date).getTime()) / (1000 * 60 * 60 * 24))
            )
          : 0,
        days_until_ready: Math.max(
          0,
          12 -
            (tray.sow_date
              ? Math.floor((today.getTime() - new Date(tray.sow_date).getTime()) / (1000 * 60 * 60 * 24))
              : 0)
        ),
      };
    });
}

export async function assignTrayToCustomer(trayId: number, customerId: number): Promise<boolean> {
  const { error } = await getSupabaseClient()
    .from('trays')
    .update({ customer_id: customerId })
    .eq('tray_id', trayId);

  if (error) {
    console.error('[assignTrayToCustomer] Error assigning tray:', error);
  }
  return !error;
}

export async function fetchNearestAssignedTray(
  farmUuid: string,
  customerId: number,
  productId: number,
  productName?: string
): Promise<AssignableTray | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error('[fetchNearestAssignedTray] missing supabase client');
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: productRecipes, error: productError } = await supabase
    .from('product_recipe_mapping')
    .select('recipe_id')
    .eq('product_id', productId);

  if (productError) {
    console.error('[fetchNearestAssignedTray] Error loading product maps:', productError);
    return null;
  }

  const recipeIds = (productRecipes || []).map((pr: any) => pr.recipe_id).filter(Boolean);
  if (recipeIds.length === 0) {
    return null;
  }

  const { data: recipeDays, error: recipeDaysError } = await supabase
    .from('recipe_total_days')
    .select('recipe_id, total_days')
    .in('recipe_id', recipeIds);

  if (recipeDaysError) {
    console.error('[fetchNearestAssignedTray] Error loading recipe total days:', recipeDaysError);
    return null;
  }

  const totalDaysMap = new Map<number, number>(
    (recipeDays || []).map((r: any) => [r.recipe_id, r.total_days])
  );

  const { data: trays, error: traysError } = await supabase
    .from('trays')
    .select(`
      tray_id,
      sow_date,
      recipe_id,
      recipes!inner (
        recipe_name
      )
    `)
    .eq('farm_uuid', farmUuid)
    .eq('customer_id', customerId)
    .in('recipe_id', recipeIds)
    .eq('status', 'active')
    .is('harvest_date', null)
    .order('sow_date', { ascending: true });

  if (traysError) {
    console.error('[fetchNearestAssignedTray] Error loading trays:', traysError);
    return null;
  }

  const candidates = (trays || [])
    .map((tray: any) => {
      const recipe = Array.isArray(tray.recipes) ? tray.recipes[0] : tray.recipes;
      const sowDate = tray.sow_date ? new Date(tray.sow_date) : null;
      const daysGrown = sowDate
        ? Math.max(
            0,
            Math.floor((today.getTime() - sowDate.getTime()) / (1000 * 60 * 60 * 24))
          )
        : 0;
      const totalDays = totalDaysMap.get(tray.recipe_id) ?? 12;
      const daysUntilReady = totalDays - daysGrown;
      return {
        ...tray,
        recipe,
        daysGrown,
        totalDays,
        daysUntilReady,
      };
    })
    .filter((tray) => tray.daysUntilReady > 0 && tray.daysUntilReady <= 2);

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => {
    if (a.daysUntilReady !== b.daysUntilReady) return a.daysUntilReady - b.daysUntilReady;
    if (a.sow_date && b.sow_date) return a.sow_date.localeCompare(b.sow_date);
    return 0;
  });

  const winner = candidates[0];
  const normalizedProductName = (productName || '').toLowerCase().trim();
  const productMatchedTray = normalizedProductName
    ? candidates.find((candidate) => {
        const recipeName = (candidate.recipe?.recipe_name || '').toLowerCase();
        return recipeName.includes(normalizedProductName);
      })
    : null;
  const selectedTray = productMatchedTray || winner;
  return {
    tray_id: selectedTray.tray_id,
    recipe_id: selectedTray.recipe_id,
    recipe_name: selectedTray.recipe?.recipe_name || 'Unknown',
    sow_date: selectedTray.sow_date,
    days_grown: selectedTray.daysGrown,
    days_until_ready: selectedTray.daysUntilReady,
  };
}

/**
 * Harvest a tray immediately by updating harvest_date and status.
 */
export async function harvestTrayNow(trayId: number): Promise<boolean> {
  const { data, error } = await getSupabaseClient()
    .from('trays')
    .update({
      harvest_date: new Date().toISOString(),
      status: 'harvested',
    })
    .eq('tray_id', trayId);

  if (error) {
    console.error('[harvestTrayNow] Error marking tray as harvested:', error);
    return false;
  }

  return true;
}

