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
    description: 'Manage standing orders, one-time orders, and customers',
    icon: 'ShoppingCart',
    order: 2,
  },
  {
    id: 'harvest-workflow',
    name: 'Harvest Workflow',
    description: 'Daily flow, task completion, and batch harvesting',
    icon: 'Scissors',
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
    name: 'Inventory',
    description: 'Seed inventory and batch tracking',
    icon: 'Package',
    order: 5,
  },
  {
    id: 'recipes',
    name: 'Recipes',
    description: 'Creating recipes and grow schedules',
    icon: 'BookOpen',
    order: 6,
  },
];
