export interface HelpArticle {
  slug: string;
  title: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  order: number;
}

export interface HelpCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  order: number;
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'getting-started',
    name: 'Getting Started',
    description: 'Learn the basics of Sproutify Micro',
    icon: 'Rocket',
    order: 1,
  },
  {
    id: 'orders-customers',
    name: 'Orders & Customers',
    description: 'Manage standing orders, deliveries, and customers',
    icon: 'ShoppingCart',
    order: 2,
  },
  {
    id: 'daily-operations',
    name: 'Daily Operations',
    description: 'Daily flow, calendar view, and task management',
    icon: 'CalendarCheck',
    order: 3,
  },
  {
    id: 'tray-management',
    name: 'Tray Management',
    description: 'Seeding, grow steps, and tray tracking',
    icon: 'LayoutGrid',
    order: 4,
  },
  {
    id: 'inventory',
    name: 'Inventory & Supplies',
    description: 'Seed batches, varieties, supplies, and vendors',
    icon: 'Package',
    order: 5,
  },
  {
    id: 'products-recipes',
    name: 'Products & Recipes',
    description: 'Products, recipes, and planting schedules',
    icon: 'BookOpen',
    order: 6,
  },
  {
    id: 'reports',
    name: 'Reports & Analytics',
    description: 'Harvest, delivery, sales, and seed usage reports',
    icon: 'BarChart3',
    order: 7,
  },
  {
    id: 'settings-team',
    name: 'Settings & Team',
    description: 'Farm settings, team management, and subscriptions',
    icon: 'Settings',
    order: 8,
  },
];
