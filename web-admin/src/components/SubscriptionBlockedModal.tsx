import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SubscriptionBlockedModalProps {
  status: 'expired' | 'cancelled' | 'trial_ended';
  onLogout: () => void;
}

const SubscriptionBlockedModal = ({ status, onLogout }: SubscriptionBlockedModalProps) => {
  const navigate = useNavigate();

  const getMessage = () => {
    switch (status) {
      case 'trial_ended':
        return {
          title: 'Your Free Trial Has Ended',
          description: 'To continue using Sproutify and access all your farm data, please subscribe to a plan.',
        };
      case 'cancelled':
        return {
          title: 'Your Subscription Was Cancelled',
          description: 'Your subscription has been cancelled. Subscribe again to regain access to your farm.',
        };
      case 'expired':
      default:
        return {
          title: 'Your Subscription Has Expired',
          description: 'Your subscription has expired. Please renew to continue managing your farm.',
        };
    }
  };

  const { title, description } = getMessage();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-8 text-center">
        <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-3">
          {title}
        </h2>

        <p className="text-gray-600 mb-8">
          {description}
        </p>

        <div className="space-y-3">
          <Button
            className="w-full"
            size="lg"
            onClick={() => navigate('/pricing')}
          >
            View Plans
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            className="w-full text-gray-500 hover:text-gray-700"
            onClick={onLogout}
          >
            Log Out
          </Button>
        </div>

        <p className="mt-6 text-xs text-gray-400">
          Questions? Contact support@sproutify.app
        </p>
      </div>
    </div>
  );
};

export default SubscriptionBlockedModal;
