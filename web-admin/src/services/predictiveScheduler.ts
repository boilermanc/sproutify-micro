interface Recipe {
  recipe_id: number;
  recipe_name: string;
  total_days: number; // Total growing days
}

interface DeliveryRequirement {
  delivery_date: Date;
  recipe_id: number;
  quantity: number; // Number of trays needed
}

interface SowSchedule {
  recipe_id: number;
  recipe_name: string;
  sow_date: Date;
  delivery_date: Date;
  quantity: number;
  days_before_delivery: number;
}

/**
 * Calculate optimal sow dates based on delivery dates and recipe durations
 */
export const calculateSowDates = (
  deliveryRequirements: DeliveryRequirement[],
  recipes: Recipe[]
): SowSchedule[] => {
  const schedules: SowSchedule[] = [];

  for (const requirement of deliveryRequirements) {
    const recipe = recipes.find(r => r.recipe_id === requirement.recipe_id);
    if (!recipe) continue;

    // Calculate sow date: delivery date - total growing days
    const sowDate = new Date(requirement.delivery_date);
    sowDate.setDate(sowDate.getDate() - recipe.total_days);

    schedules.push({
      recipe_id: requirement.recipe_id,
      recipe_name: recipe.recipe_name,
      sow_date: sowDate,
      delivery_date: requirement.delivery_date,
      quantity: requirement.quantity,
      days_before_delivery: recipe.total_days,
    });
  }

  // Sort by sow date
  return schedules.sort((a, b) => a.sow_date.getTime() - b.sow_date.getTime());
};

/**
 * Match delivery days with optimal sow dates
 * Groups sow dates by day of week to optimize scheduling
 */
export const optimizeSowSchedule = (
  schedules: SowSchedule[],
  preferredSowDays: string[] = [] // e.g., ['Monday', 'Wednesday']
): SowSchedule[] => {
  if (preferredSowDays.length === 0) {
    return schedules; // No optimization needed
  }

  const dayMap: Record<string, number> = {
    'Monday': 1,
    'Tuesday': 2,
    'Wednesday': 3,
    'Thursday': 4,
    'Friday': 5,
    'Saturday': 6,
    'Sunday': 0,
  };

  const preferredDays = preferredSowDays.map(day => dayMap[day] || -1);

  return schedules.map(schedule => {
    const sowDay = schedule.sow_date.getDay();
    
    // If sow date is already on a preferred day, keep it
    if (preferredDays.includes(sowDay)) {
      return schedule;
    }

    // Find the closest preferred day
    const adjustedDate = new Date(schedule.sow_date);
    let daysDiff = 0;
    let minDiff = Infinity;
    let bestDay = sowDay;

    for (const preferredDay of preferredDays) {
      let diff = (preferredDay - sowDay + 7) % 7;
      if (diff === 0) diff = 7; // Prefer next week if same day
      if (diff < minDiff) {
        minDiff = diff;
        bestDay = preferredDay;
      }
    }

    // Adjust to the closest preferred day (move forward)
    const currentDay = schedule.sow_date.getDay();
    const targetDay = bestDay;
    daysDiff = (targetDay - currentDay + 7) % 7;
    if (daysDiff === 0) daysDiff = 7; // Move to next week if same day

    adjustedDate.setDate(adjustedDate.getDate() + daysDiff);

    // Recalculate delivery date based on adjusted sow date
    const newDeliveryDate = new Date(adjustedDate);
    newDeliveryDate.setDate(newDeliveryDate.getDate() + schedule.days_before_delivery);

    return {
      ...schedule,
      sow_date: adjustedDate,
      delivery_date: newDeliveryDate,
    };
  });
};

/**
 * Generate weekly task schedule from sow dates
 */
export const generateWeeklyTasks = (
  schedules: SowSchedule[],
  weekStart: Date
): Map<string, SowSchedule[]> => {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const tasksByDay = new Map<string, SowSchedule[]>();

  schedules.forEach(schedule => {
    if (schedule.sow_date >= weekStart && schedule.sow_date <= weekEnd) {
      const dayKey = schedule.sow_date.toISOString().split('T')[0];
      if (!tasksByDay.has(dayKey)) {
        tasksByDay.set(dayKey, []);
      }
      tasksByDay.get(dayKey)!.push(schedule);
    }
  });

  return tasksByDay;
};

/**
 * Calculate required sow dates for standing orders
 */
export const calculateStandingOrderSowDates = (
  standingOrder: {
    frequency: 'weekly' | 'bi-weekly';
    delivery_days: string[];
    start_date: Date;
    end_date: Date | null;
    items: Array<{ recipe_id: number; quantity: number }>;
  },
  recipes: Recipe[],
  seedingDays: string[] | null = null
): SowSchedule[] => {
  const schedules: SowSchedule[] = [];
  const dayMap: Record<string, number> = {
    'Monday': 1,
    'Tuesday': 2,
    'Wednesday': 3,
    'Thursday': 4,
    'Friday': 5,
    'Saturday': 6,
    'Sunday': 0,
  };

  const deliveryDayNumbers = standingOrder.delivery_days.map(day => dayMap[day] ?? -1).filter(d => d >= 0);
  const allowedSeedingDayNumbers = (seedingDays ?? [])
    .map(day => dayMap[day])
    .filter((day): day is number => typeof day === 'number' && day >= 0);

  const alignToSeedingDays = (date: Date) => {
    if (allowedSeedingDayNumbers.length === 0) {
      return date;
    }

    const adjusted = new Date(date);
    for (let offset = 0; offset <= 6; offset++) {
      if (allowedSeedingDayNumbers.includes(adjusted.getDay())) {
        return adjusted;
      }
      adjusted.setDate(adjusted.getDate() - 1);
    }

    return adjusted;
  };
  if (deliveryDayNumbers.length === 0) return schedules;

  const currentDate = new Date(standingOrder.start_date);
  const endDate = standingOrder.end_date || new Date('2099-12-31');

  while (currentDate <= endDate) {
    // Find next delivery date(s) based on frequency
    const weekDeliveryDates: Date[] = [];

    for (const dayNum of deliveryDayNumbers) {
      const date = new Date(currentDate);
      const currentDay = date.getDay();
      let daysToAdd = (dayNum - currentDay + 7) % 7;
      if (daysToAdd === 0 && date <= currentDate) daysToAdd = 7;
      
      date.setDate(date.getDate() + daysToAdd);
      
      if (date <= endDate) {
        weekDeliveryDates.push(date);
      }
    }

    // Calculate sow dates for each delivery date
    for (const deliveryDate of weekDeliveryDates) {
      for (const item of standingOrder.items) {
        const recipe = recipes.find(r => r.recipe_id === item.recipe_id);
        if (!recipe) continue;

        const sowDate = new Date(deliveryDate);
        sowDate.setDate(sowDate.getDate() - recipe.total_days);
        const adjustedSowDate = alignToSeedingDays(sowDate);

        schedules.push({
          recipe_id: item.recipe_id,
          recipe_name: recipe.recipe_name,
          sow_date: adjustedSowDate,
          delivery_date: deliveryDate,
          quantity: item.quantity,
          days_before_delivery: recipe.total_days,
        });
      }
    }

    // Move to next period
    if (standingOrder.frequency === 'weekly') {
      currentDate.setDate(currentDate.getDate() + 7);
    } else {
      currentDate.setDate(currentDate.getDate() + 14);
    }
  }

  return schedules.sort((a, b) => a.sow_date.getTime() - b.sow_date.getTime());
};

