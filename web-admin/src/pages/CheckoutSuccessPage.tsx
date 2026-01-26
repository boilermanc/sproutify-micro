import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, Sprout, Mail, HelpCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TIER_INFO } from '@/hooks/useSubscription';
import confetti from 'canvas-confetti';

const CheckoutSuccessPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tier = searchParams.get('tier') || 'starter';
  const tierInfo = TIER_INFO[tier];
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    // Trigger confetti animation
    const duration = 3000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0']
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    frame();

    // Fade in content after a short delay
    setTimeout(() => setShowContent(true), 300);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center p-4">
      <div className={`max-w-2xl w-full transition-all duration-700 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {/* Success Icon */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-100 rounded-full mb-6">
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Welcome to the Farmily!
          </h1>
          <p className="text-lg text-gray-600">
            Thank you for subscribing to Sproutify Micro
          </p>
        </div>

        {/* Plan Card */}
        <Card className="mb-8 border-emerald-200 bg-white/80 backdrop-blur">
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center">
                <Sprout className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {tierInfo?.displayName || 'Starter'} Plan
                </h2>
                <p className="text-gray-500">
                  ${tierInfo?.price || '12.99'}/month
                </p>
              </div>
            </div>
            <p className="text-gray-600">
              You now have access to {tierInfo?.trayLimit ? `up to ${tierInfo.trayLimit} active trays` : 'unlimited trays'} and all the features included in your plan.
            </p>
          </CardContent>
        </Card>

        {/* Welcome Message */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 mb-8">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">
            Your Growing Journey Starts Now
          </h3>
          <p className="text-gray-600 mb-6 leading-relaxed">
            We're thrilled to have you join our community of microgreen farmers! Whether you're growing for yourself,
            your family, or building a thriving business, Sproutify Micro is here to help you succeed every step of the way.
          </p>
          <p className="text-gray-600 mb-6 leading-relaxed">
            Your farm dashboard is ready and waiting. Start by setting up your varieties, creating your first trays,
            and let Sproutify guide you through your planting schedule.
          </p>

          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
            <p className="text-emerald-800 font-medium mb-1">
              Pro Tip from Sage
            </p>
            <p className="text-emerald-700 text-sm">
              Head to your Daily Flow page each morning to see exactly what needs attention.
              Sage will keep you on track with intelligent reminders and suggestions!
            </p>
          </div>
        </div>

        {/* Contact Info */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-xl p-5 border border-gray-100 flex items-start gap-4">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-1">Email Support</h4>
              <a href="mailto:team@sproutify.app" className="text-blue-600 hover:underline text-sm">
                team@sproutify.app
              </a>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-100 flex items-start gap-4">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <HelpCircle className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-1">Help Center</h4>
              <p className="text-gray-500 text-sm">
                Guides, tutorials, and FAQs
              </p>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <div className="text-center">
          <Button
            size="lg"
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-6 text-lg"
            onClick={() => navigate('/')}
          >
            Go to My Farm
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
          <p className="text-gray-400 text-sm mt-4">
            Happy growing!
          </p>
        </div>
      </div>
    </div>
  );
};

export default CheckoutSuccessPage;
