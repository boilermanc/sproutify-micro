import { getSupabaseClient } from '../lib/supabaseClient';

interface NotificationPreferences {
  lowStock?: boolean;
  harvestReminders?: boolean;
  orderUpdates?: boolean;
  notifications?: {
    lowStock?: boolean;
    harvestReminders?: boolean;
    orderUpdates?: boolean;
  };
}

/**
 * Check a specific supply for low stock and create notification if needed
 */
export const checkSupplyStock = async (supplyId: number) => {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) return;

    const { farmUuid, userId } = JSON.parse(sessionData);

    // Get user preferences
    const prefs = localStorage.getItem('sproutify_preferences');
    const preferences: NotificationPreferences = prefs
      ? JSON.parse(prefs)
      : { lowStock: true, harvestReminders: true, orderUpdates: true };

    const lowStockEnabled = preferences.notifications?.lowStock ?? preferences.lowStock ?? true;
    if (!lowStockEnabled) return;

    // Fetch the specific supply
    const { data: supply, error } = await getSupabaseClient()
      .from('supplies')
      .select('*')
      .eq('supply_id', supplyId)
      .eq('farm_uuid', farmUuid)
      .single();

    if (error || !supply) return;

    const stock = Number(supply.stock || 0);
    const threshold = Number(supply.low_stock_threshold || 10);
    const supplyName = supply.supply_name || supply.name || 'Unknown';

    // Check if it's now low stock or out of stock
    if (stock === 0) {
      // Check if we already have a recent notification for this item
      const { data: existing } = await supabase
        .from('notifications')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .eq('type', 'low_stock')
        .ilike('message', `%${supplyName}%`)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Only create if we don't have a recent unread notification
      if (!existing || new Date(existing.created_at).getTime() < Date.now() - 3600000) {
        await getSupabaseClient().from('notifications').insert({
          farm_uuid: farmUuid,
          user_id: userId,
          type: 'low_stock',
          title: 'Out of Stock Alert',
          message: `${supplyName} is out of stock`,
          link: '/supplies',
          is_read: false,
        });
      }
    } else if (stock > 0 && stock <= threshold) {
      // Check if we already have a recent notification for this item
      const { data: existing } = await supabase
        .from('notifications')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .eq('type', 'low_stock')
        .ilike('message', `%${supplyName}%`)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Only create if we don't have a recent unread notification
      if (!existing || new Date(existing.created_at).getTime() < Date.now() - 3600000) {
        await getSupabaseClient().from('notifications').insert({
          farm_uuid: farmUuid,
          user_id: userId,
          type: 'low_stock',
          title: 'Low Stock Alert',
          message: `${supplyName} is running low (${stock} ${supply.unit || 'units'} remaining)`,
          link: '/supplies',
          is_read: false,
        });
      }
    }
  } catch (error) {
    console.error('Error checking supply stock:', error);
  }
};

/**
 * Check for low stock items and create notifications
 */
export const checkLowStockNotifications = async () => {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) return;

    const { farmUuid, userId } = JSON.parse(sessionData);

    // Get user preferences
    const prefs = localStorage.getItem('sproutify_preferences');
    const preferences: NotificationPreferences = prefs
      ? JSON.parse(prefs)
      : { lowStock: true, harvestReminders: true, orderUpdates: true };

    const lowStockEnabled = preferences.notifications?.lowStock ?? preferences.lowStock ?? true;
    if (!lowStockEnabled) return;

    // Fetch supplies with low stock
    interface Supply {
      stock?: number | string;
      low_stock_threshold?: number | string;
      supply_name?: string;
      name?: string;
    }

    const { data: supplies, error } = await supabase
      .from('supplies')
      .select('*')
      .eq('farm_uuid', farmUuid)
      .eq('is_active', true);

    if (error) throw error;

    const lowStockItems = (supplies || []).filter((supply: Supply) => {
      const stock = Number(supply.stock || 0);
      const threshold = Number(supply.low_stock_threshold || 10);
      return stock > 0 && stock <= threshold;
    });

    const outOfStockItems = (supplies || []).filter((supply: Supply) => {
      const stock = Number(supply.stock || 0);
      return stock === 0;
    });

    // Create notifications for low stock items (only if we don't have recent ones)
    if (lowStockItems.length > 0) {
      const itemsList = lowStockItems
        .slice(0, 5)
        .map((s: Supply) => s.supply_name || s.name || 'Unknown')
        .join(', ');
      const moreText = lowStockItems.length > 5 ? ` and ${lowStockItems.length - 5} more` : '';

      // Check if we already have a recent low stock notification
      const { data: existing } = await supabase
        .from('notifications')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .eq('type', 'low_stock')
        .eq('title', 'Low Stock Alert')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!existing || new Date(existing.created_at).getTime() < Date.now() - 86400000) {
        await getSupabaseClient().from('notifications').insert({
          farm_uuid: farmUuid,
          user_id: userId,
          type: 'low_stock',
          title: 'Low Stock Alert',
          message: `${lowStockItems.length} item${lowStockItems.length > 1 ? 's' : ''} ${lowStockItems.length > 1 ? 'are' : 'is'} running low: ${itemsList}${moreText}`,
          link: '/supplies',
          is_read: false,
        });
      }
    }

    // Create notification for out of stock items
    if (outOfStockItems.length > 0) {
      const itemsList = outOfStockItems
        .slice(0, 5)
        .map((s: Supply) => s.supply_name || s.name || 'Unknown')
        .join(', ');
      const moreText = outOfStockItems.length > 5 ? ` and ${outOfStockItems.length - 5} more` : '';

      // Check if we already have a recent out of stock notification
      const { data: existing } = await supabase
        .from('notifications')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .eq('type', 'low_stock')
        .eq('title', 'Out of Stock Alert')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!existing || new Date(existing.created_at).getTime() < Date.now() - 86400000) {
        await getSupabaseClient().from('notifications').insert({
          farm_uuid: farmUuid,
          user_id: userId,
          type: 'low_stock',
          title: 'Out of Stock Alert',
          message: `${outOfStockItems.length} item${outOfStockItems.length > 1 ? 's' : ''} ${outOfStockItems.length > 1 ? 'are' : 'is'} out of stock: ${itemsList}${moreText}`,
          link: '/supplies',
          is_read: false,
        });
      }
    }
  } catch (error) {
    console.error('Error checking low stock notifications:', error);
  }
};

/**
 * Check for upcoming harvests and create reminder notifications
 */
export const checkHarvestReminders = async () => {
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) return;

    const { farmUuid, userId } = JSON.parse(sessionData);

    // Get user preferences
    const prefs = localStorage.getItem('sproutify_preferences');
    const preferences: NotificationPreferences = prefs
      ? JSON.parse(prefs)
      : { lowStock: true, harvestReminders: true, orderUpdates: true };

    const harvestRemindersEnabled = preferences.notifications?.harvestReminders ?? preferences.harvestReminders ?? true;
    if (!harvestRemindersEnabled) return;

    // Fetch active trays (not harvested yet)
    interface Tray {
      tray_id: number;
      recipe_id: number;
      sow_date: string;
      tray_unique_id: string;
    }

    const { data: trays, error } = await supabase
      .from('trays')
      .select('*, recipes(*)')
      .eq('farm_uuid', farmUuid)
      .is('harvest_date', null);

    if (error) throw error;

    // Calculate harvest dates based on recipe steps
    const today = new Date();
    const upcomingHarvests: Array<{ tray: Tray; harvestDate: Date }> = [];

    for (const tray of trays || []) {
      // Get recipe steps to calculate harvest date
      const { data: steps } = await getSupabaseClient()
        .from('steps')
        .select('*')
        .eq('recipe_id', tray.recipe_id);
      
      // Sort by step_order in JavaScript (fallback if ordering fails)
      const sortedSteps = steps ? [...steps].sort((a, b) => (a.step_order || 0) - (b.step_order || 0)) : null;

      if (sortedSteps && sortedSteps.length > 0) {
        const sowDate = new Date(tray.sow_date);
        // Calculate total days, accounting for duration_unit
        const totalDays = sortedSteps.reduce((sum: number, step: { duration?: number; duration_days?: number; duration_unit?: string }) => {
          const duration = step.duration || step.duration_days || 0;
          const unit = (step.duration_unit || 'Days').toUpperCase();
          
          if (unit === 'DAYS') {
            return sum + duration;
          } else if (unit === 'HOURS') {
            // Hours >= 12 counts as 1 day, otherwise 0
            return sum + (duration >= 12 ? 1 : 0);
          }
          return sum + duration; // default: treat as days
        }, 0);
        const harvestDate = new Date(sowDate);
        harvestDate.setDate(harvestDate.getDate() + totalDays);

        // Check if harvest is within next 2 days
        const daysUntilHarvest = Math.ceil(
          (harvestDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysUntilHarvest >= 0 && daysUntilHarvest <= 2) {
          upcomingHarvests.push({ tray, harvestDate });
        }
      }
    }

    if (upcomingHarvests.length > 0) {
      const message =
        upcomingHarvests.length === 1
          ? `1 tray is ready for harvest: ${upcomingHarvests[0].tray.tray_unique_id}`
          : `${upcomingHarvests.length} trays are ready for harvest`;

      // Check if we already have a recent harvest reminder
      const { data: existing } = await supabase
        .from('notifications')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .eq('type', 'harvest_reminder')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!existing || new Date(existing.created_at).getTime() < Date.now() - 43200000) {
        await getSupabaseClient().from('notifications').insert({
          farm_uuid: farmUuid,
          user_id: userId,
          type: 'harvest_reminder',
          title: 'Harvest Reminder',
          message,
          link: '/trays',
          is_read: false,
        });
      }
    }
  } catch (error) {
    console.error('Error checking harvest reminders:', error);
  }
};

/**
 * Create notification when a new order (tray with customer) is created
 */
export const notifyNewOrder = async (trayId: number, customerName?: string) => {
  if (!supabase) return;
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) return;

    const { farmUuid, userId } = JSON.parse(sessionData);

    // Get user preferences
    const prefs = localStorage.getItem('sproutify_preferences');
    const preferences: NotificationPreferences = prefs
      ? JSON.parse(prefs)
      : { lowStock: true, harvestReminders: true, orderUpdates: true };

    const orderUpdatesEnabled = preferences.notifications?.orderUpdates ?? preferences.orderUpdates ?? true;
    if (!orderUpdatesEnabled) return;

    // Fetch tray details
    const { data: tray, error } = await getSupabaseClient()
      .from('trays')
      .select('*, customers(*)')
      .eq('tray_id', trayId)
      .single();

    if (error || !tray || !tray.customer_id) return;

    const customer = tray.customers as { name?: string } | null;
    const name = customerName || customer?.name || 'Unknown Customer';

    await getSupabaseClient().from('notifications').insert({
      farm_uuid: farmUuid,
      user_id: userId,
      type: 'order_update',
      title: 'New Order',
      message: `New order from ${name} - Tray ${tray.tray_unique_id}`,
      link: '/orders',
      is_read: false,
    });
  } catch (error) {
    console.error('Error creating order notification:', error);
  }
};

/**
 * Check for order updates and create notifications
 */
export const checkOrderUpdates = async () => {
  if (!supabase) return;
  try {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) return;

    const { farmUuid, userId } = JSON.parse(sessionData);

    // Get user preferences
    const prefs = localStorage.getItem('sproutify_preferences');
    const preferences: NotificationPreferences = prefs
      ? JSON.parse(prefs)
      : { lowStock: true, harvestReminders: true, orderUpdates: true };

    const orderUpdatesEnabled = preferences.notifications?.orderUpdates ?? preferences.orderUpdates ?? true;
    if (!orderUpdatesEnabled) return;

    // Check for new orders (trays with customer_id created in last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    interface Order {
      customers?: { name?: string } | null;
    }

    const { data: newOrders, error } = await getSupabaseClient()
      .from('trays')
      .select('*, customers(*)')
      .eq('farm_uuid', farmUuid)
      .not('customer_id', 'is', null)
      .gte('created_at', yesterday.toISOString());

    if (error) throw error;

    if (newOrders && newOrders.length > 0) {
      const customerNames = [...new Set((newOrders as Order[]).map((o) => o.customers?.name || 'Unknown'))];
      const message =
        newOrders.length === 1
          ? `New order from ${customerNames[0]}`
          : `${newOrders.length} new orders from ${customerNames.slice(0, 3).join(', ')}${customerNames.length > 3 ? ' and more' : ''}`;

      // Check if we already have a recent order update notification
      const { data: existing } = await supabase
        .from('notifications')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .eq('type', 'order_update')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!existing || new Date(existing.created_at).getTime() < Date.now() - 3600000) {
        await getSupabaseClient().from('notifications').insert({
          farm_uuid: farmUuid,
          user_id: userId,
          type: 'order_update',
          title: 'New Orders',
          message,
          link: '/orders',
          is_read: false,
        });
      }
    }
  } catch (error) {
    console.error('Error checking order updates:', error);
  }
};

/**
 * Run all notification checks
 */
export const runNotificationChecks = async () => {
  await Promise.all([
    checkLowStockNotifications(),
    checkHarvestReminders(),
    checkOrderUpdates(),
  ]);
};
