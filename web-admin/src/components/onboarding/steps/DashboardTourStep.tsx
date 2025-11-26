import { ShoppingBasket, Sprout, ClipboardList, Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import './steps.css';

interface DashboardTourStepProps {
  onNext: () => void;
  onBack: () => void;
}

const DashboardTourStep = ({ onNext, onBack }: DashboardTourStepProps) => {
  const features = [
    {
      icon: <ShoppingBasket size={32} color="#5B7C99" />,
      title: 'Active Trays',
      description: 'Track all your growing trays in one place',
    },
    {
      icon: <Sprout size={32} color="#5B7C99" />,
      title: 'Varieties',
      description: 'Manage your microgreen catalog',
    },
    {
      icon: <ClipboardList size={32} color="#5B7C99" />,
      title: 'Orders',
      description: 'Track customer orders and deliveries',
    },
    {
      icon: <Scissors size={32} color="#5B7C99" />,
      title: 'Harvests',
      description: 'Monitor upcoming and recent harvests',
    },
  ];

  return (
    <div className="dashboard-tour-step">
      <p style={{ color: '#5A6673', marginBottom: '2rem' }}>
        Your dashboard is the command center for your farm. Here's what you can do:
      </p>

      <div className="education-content">
        {features.map((feature, index) => (
          <div key={index} className="info-card" style={{ animationDelay: `${index * 0.1}s` }}>
            <div style={{ marginBottom: '0.75rem' }}>{feature.icon}</div>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </div>
        ))}
      </div>

      <div style={{ background: '#F7F9FA', borderRadius: '12px', padding: '1.5rem', marginTop: '2rem' }}>
        <h4 style={{ color: '#2A3744', marginBottom: '0.75rem' }}>Quick Actions</h4>
        <p style={{ color: '#5A6673', fontSize: '0.9rem', lineHeight: 1.6 }}>
          Use the quick action buttons on your dashboard to quickly create trays, batches, orders, and add users.
          The sidebar navigation gives you access to all sections of the system.
        </p>
      </div>

      <div style={{ background: '#E8F0F7', borderRadius: '12px', padding: '1.5rem', marginTop: '1.5rem' }}>
        <h4 style={{ color: '#2A3744', marginBottom: '0.75rem' }}>📊 Charts & Analytics</h4>
        <p style={{ color: '#5A6673', fontSize: '0.9rem', lineHeight: 1.6 }}>
          As you harvest trays, your dashboard will automatically populate with charts showing your weekly yields
          and variety distribution. This helps you track your farm's performance over time.
        </p>
      </div>

      <div className="flex gap-4 mt-6">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="flex-1"
        >
          ← Back
        </Button>
        <Button
          type="button"
          onClick={onNext}
          className="flex-[2]"
        >
          Continue →
        </Button>
      </div>
    </div>
  );
};

export default DashboardTourStep;

