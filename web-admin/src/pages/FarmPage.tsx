import { Link } from 'react-router-dom';
import { ArrowUpRight, BookOpen, ClipboardList, Settings, Users, Package, CalendarDays } from 'lucide-react';
import { canManageFarm } from '@/lib/workspaceNavigation';
import { Card } from '@/components/ui/card';

type FarmLink = { to: string; title: string; description: string; icon: typeof BookOpen };

const setup: FarmLink[] = [
  { to: '/recipes', title: 'Crops & recipes', description: 'How you grow each crop, from seed to harvest.', icon: BookOpen },
  { to: '/batches', title: 'Seed inventory', description: 'Seed lots, remaining stock and purchasing records.', icon: Package },
  { to: '/standing-orders', title: 'Standing orders', description: 'Recurring customer commitments and delivery dates.', icon: CalendarDays },
  { to: '/customers', title: 'Customers', description: 'People and businesses you grow for.', icon: Users },
  { to: '/settings', title: 'Farm settings', description: 'Farm details, growing days and your profile.', icon: Settings },
  { to: '/planting-schedule', title: 'Planting plan', description: 'Review planned seeding and upcoming demand.', icon: ClipboardList },
];
const worker: FarmLink[] = [
  { to: '/catalog', title: 'Crop catalog', description: 'Look up the crops and recipes on your farm.', icon: BookOpen },
  { to: '/customers', title: 'Customers', description: 'Customer information available to your farm team.', icon: Users },
  { to: '/labels', title: 'Tray labels', description: 'Find and print labels for your trays.', icon: ClipboardList },
  { to: '/profile', title: 'Your profile', description: 'Update your own name and contact information.', icon: Settings },
];
const tools = [
  ['/trays', 'Tray records'], ['/products', 'Products & mixes'], ['/supplies', 'Supplies'],
  ['/varieties', 'Varieties'], ['/global-recipes', 'Reference recipes'], ['/calendar', 'Calendar'],
  ['/weekly-tasks', 'Weekly tasks'], ['/reports', 'Reports'], ['/users', 'Farm team'],
  ['/vendors', 'Vendors'], ['/mix-calculator', 'Mix calculator'], ['/activity', 'Activity history'],
  ['/dashboard', 'Farm overview'], ['/flow', 'Detailed daily flow'], ['/pricing', 'Plans & billing'],
];

export default function FarmPage() {
  let role: string | undefined;
  try { role = JSON.parse(localStorage.getItem('sproutify_session') || '{}').role; } catch { /* Unverified session is handled by App. */ }
  const manager = canManageFarm(role);
  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-8">
      <header>
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">Set up once. Come back when you need it.</p>
        <h1 className="text-3xl font-semibold tracking-tight">Your farm</h1>
        <p className="mt-2 text-muted-foreground">{manager ? 'Your crops, customers and farm setup. Everyday work lives in Today and Growing.' : 'Farm reference tools and your profile. Find daily work in Today and Growing.'}</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {(manager ? setup : worker).map(item => (
          <Link key={item.to} to={item.to} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="h-full p-5 transition-colors hover:bg-secondary/40">
              <div className="mb-3 flex items-center justify-between text-primary"><item.icon className="h-5 w-5" /><ArrowUpRight className="h-4 w-4" /></div>
              <h2 className="font-semibold">{item.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
            </Card>
          </Link>
        ))}
      </div>
      {manager && <details className="rounded-lg border border-border bg-card p-5">
        <summary className="cursor-pointer font-medium">Records & more tools</summary>
        <p className="mt-3 text-sm text-muted-foreground">Detailed records and planning tools are still available here.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">{tools.map(([to, label]) => <Link className="rounded-md p-2 text-sm text-primary underline-offset-4 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring" key={to} to={to}>{label}</Link>)}</div>
      </details>}
      {manager && <Link to="/help" className="inline-block text-sm text-primary underline underline-offset-4">Help with farm tools</Link>}
    </div>
  );
}
