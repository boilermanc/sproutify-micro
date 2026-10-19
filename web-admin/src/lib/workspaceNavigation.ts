import { CalendarDays, Sprout, ShoppingBasket, Warehouse } from 'lucide-react';

export function canManageFarm(role?: string | null): boolean {
  return role === 'Owner' || role === 'Editor';
}

export function workspaceNavigation(role?: string | null) {
  return [
    { to: '/today', label: 'Today', icon: CalendarDays },
    { to: '/growing', label: 'Growing', icon: Sprout },
    ...(canManageFarm(role) ? [{ to: '/orders', label: 'Orders', icon: ShoppingBasket }] : []),
    { to: '/farm', label: 'Farm', icon: Warehouse },
  ];
}
