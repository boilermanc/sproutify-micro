import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabaseClient';
import { runNotificationChecks } from '../services/notificationService';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  Sprout, 
  Scissors, 
  Package, 
  Users, 
  ClipboardList, 
  ShoppingBasket, 
  RefreshCcw,
  TrendingUp,
  AlertCircle,
  X,
  ArrowRight,
  AlertTriangle,
  Sparkles,
  ChevronDown
} from 'lucide-react';
import { useOnboarding } from '../hooks/useOnboarding';
import WelcomeModal from '../components/onboarding/WelcomeModal';
import OnboardingWizard from '../components/onboarding/OnboardingWizard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// --- Custom Icon Component for that "Material" feel ---
const DashboardIcon = ({ icon: Icon, colorClass, bgClass }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>, colorClass: string, bgClass: string }) => (
  <div className={`p-3 rounded-xl ${bgClass} shadow-sm transition-all duration-300 group-hover:scale-110`}>
    <Icon className={`h-6 w-6 ${colorClass}`} strokeWidth={2.5} />
  </div>
);

// --- SAGE MORNING BRIEFING COMPONENT ---
// In a real app, this data would fetch from 'daily_insights' table
interface InsightData {
  opportunity?: { title: string; message: string; action: string; actionUrl?: string };
  risk?: { title: string; message: string; action: string; actionUrl?: string };
  inventory?: { title: string; message: string; action: string; actionUrl?: string };
}

type InsightType = 'opportunity' | 'risk' | 'inventory';

const SageBriefing = ({ data, isVisible, onClose, navigate }: { data: InsightData | null, isVisible: boolean, onClose: () => void, navigate: (path: string) => void }) => {
  const MESSAGE_PREVIEW_LENGTH = 200;
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [detailModal, setDetailModal] = useState<{ type: InsightType; title: string; message: string } | null>(null);
  
  // Debug: Log the data being received (only when data actually changes)
  useEffect(() => {
    if (data) {
      console.log('[DEBUG] SageBriefing received data:', data);
    }
  }, [data]);
  
  // Use real data or show empty state
  const insights = {
    date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    opportunity: data?.opportunity || {
      title: 'No insights yet',
      message: 'Daily insights will appear here once you start tracking trays and harvests.',
      action: 'Create your first tray'
    },
    risk: data?.risk || {
      title: 'No insights yet',
      message: 'Daily insights will appear here once you start tracking trays and harvests.',
      action: 'Create your first tray'
    },
    inventory: data?.inventory || {
      title: 'No insights yet',
      message: 'Daily insights will appear here once you start tracking trays and harvests.',
      action: 'Create your first tray'
    }
  };

  const handleOpenDetail = useCallback((type: InsightType, title: string, message: string) => {
    setDetailModal({ type, title, message });
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailModal(null);
  }, []);

  const renderInsightMessage = (type: InsightType, title: string, message: string) => {
    const shouldTruncate = message.length > MESSAGE_PREVIEW_LENGTH;
    const previewText = shouldTruncate
      ? `${message.slice(0, MESSAGE_PREVIEW_LENGTH).trimEnd()}...`
      : message;

    return (
      <p className="text-sm text-slate-400 mb-6 leading-relaxed min-h-[40px]">
        {previewText}
        {shouldTruncate && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              handleOpenDetail(type, title, message);
            }}
            className="ml-2 text-xs font-semibold text-emerald-300 hover:text-emerald-200 focus:outline-none"
          >
            more...
          </button>
        )}
      </p>
    );
  };

  // Expandable Action Button Component with Popup Modal
  const ExpandableActionButton = ({ 
    action, 
    actionUrl, 
    type, 
    colorClasses,
    onTakeAction
  }: { 
    action: string; 
    actionUrl?: string; 
    type: 'opportunity' | 'risk' | 'inventory';
    colorClasses: {
      bg: string;
      border: string;
      text: string;
      hoverBg: string;
      hoverText: string;
    };
    onTakeAction?: () => void;
  }) => {
    const isExpanded = expandedAction === type;

    const handleClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setExpandedAction(prev => prev === type ? null : type);
    }, [type]);

    const handleClose = useCallback((e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      setExpandedAction(prev => prev === type ? null : prev);
    }, [type]);

    return (
      <>
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.2 }}
        >
          <Button 
            variant="outline" 
            className={`w-full justify-center ${colorClasses.bg} ${colorClasses.border} ${colorClasses.text} ${colorClasses.hoverBg} ${colorClasses.hoverText} border-dashed py-2 px-3 cursor-pointer transition-all duration-300`}
            size="sm"
            onClick={handleClick}
          >
            <span className="font-medium">Action</span>
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              className="ml-2"
            >
              <ChevronDown size={14} />
            </motion.div>
          </Button>
        </motion.div>

        {/* Popup Modal - styled like Daily Briefing, positioned over the briefing */}
        <AnimatePresence mode="wait">
          {isExpanded && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
                onClick={handleClose}
                onMouseDown={(e) => e.stopPropagation()}
              />
              
              {/* Modal - positioned over daily briefing */}
              <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  transition={{ 
                    duration: 0.35,
                    ease: [0.4, 0, 0.2, 1],
                    type: "spring",
                    stiffness: 300,
                    damping: 30
                  }}
                  className="w-full max-w-2xl pointer-events-auto"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: 0.1 }}
                    className="relative rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden"
                  >
                    {/* Background Decor - matching Daily Briefing */}
                    <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />

                    {/* Header - matching Daily Briefing style */}
                    <div className="p-6 border-b border-white/5 flex justify-between items-start bg-white/5">
                      <div className="flex gap-4">
                        <div className={`h-12 w-12 rounded-2xl ${colorClasses.bg} flex items-center justify-center shadow-lg`}>
                          <Sparkles className={`${colorClasses.text} h-6 w-6`} />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-white tracking-tight">Action Required</h2>
                          <div className="flex items-center gap-2 text-sm text-slate-400 mt-0.5">
                            <span>Click to take action</span>
                          </div>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={handleClose}
                        className="text-slate-400 hover:text-white hover:bg-white/10 rounded-full"
                      >
                        <X size={20} />
                      </Button>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                      <p className={`${colorClasses.text} text-sm leading-relaxed mb-6`}>
                        {action}
                      </p>
                      
                      {actionUrl && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 }}
                        >
                          <Button
                            variant="outline"
                            size="lg"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClose();
                              onTakeAction?.();
                              navigate(actionUrl);
                            }}
                            className={`w-full ${colorClasses.bg} ${colorClasses.border} ${colorClasses.text} ${colorClasses.hoverBg} ${colorClasses.hoverText} border-solid`}
                          >
                            Take Action
                            <ArrowRight size={16} className="ml-2" />
                          </Button>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>
      </>
    );
  };

  if (!isVisible) return (
    <div className="flex justify-end mb-6 animate-in fade-in slide-in-from-top-2">
      <Button 
        variant="ghost" 
        size="sm"
        onClick={onClose} // Actually re-opens it in this logic context
        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 gap-2"
      >
        <Sprout size={16} /> Show Daily Briefing
      </Button>
    </div>
  );

  return (
    <>
      <AnimatePresence>
        {detailModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[101]"
              onClick={handleCloseDetail}
            />
            <div className="fixed inset-0 z-[102] flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                className="pointer-events-auto w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden"
              >
                <div className="p-6 border-b border-white/5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Daily Insight</p>
                      <h3 className="text-xl font-bold text-white mt-1">{detailModal.title}</h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCloseDetail}
                      className="text-slate-400 hover:text-white hover:bg-white/10 rounded-full"
                    >
                      <X size={20} />
                    </Button>
                  </div>
                </div>
                <div className="p-6">
                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                    {detailModal.message}
                  </p>
                  <div className="mt-6 flex justify-end">
                    <Button variant="outline" size="sm" onClick={handleCloseDetail}>
                      Close
                    </Button>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      <motion.div 
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="mb-8 relative overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl"
      >
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />

      {/* Header */}
      <div className="p-6 border-b border-white/5 flex justify-between items-start bg-white/5">
        <div className="flex gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-900/20">
            <Sparkles className="text-white h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Daily Briefing</h2>
            <div className="flex items-center gap-2 text-sm text-slate-400 mt-0.5">
              <span>{insights.date}</span>
              <span className="w-1 h-1 rounded-full bg-slate-600" />
              <span className="text-emerald-400 font-medium flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                System Optimal
              </span>
            </div>
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="icon"
          onClick={onClose}
          className="text-slate-400 hover:text-white hover:bg-white/10 rounded-full"
        >
          <X size={20} />
        </Button>
      </div>

      {/* Insights Grid - Always show the three cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/5">
          
          {/* 1. Opportunity */}
          <div className="p-6 group hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                <TrendingUp size={16} />
              </div>
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Opportunity</span>
            </div>
            <h3 className="font-semibold text-slate-200 mb-2">{insights.opportunity.title}</h3>
            {renderInsightMessage('opportunity', insights.opportunity.title, insights.opportunity.message)}
            <ExpandableActionButton
              action={insights.opportunity.action}
              actionUrl={insights.opportunity.actionUrl || '/reports'}
              type="opportunity"
            onTakeAction={onClose}
              colorClasses={{
                bg: 'bg-emerald-500/10',
                border: 'border-emerald-500/20',
                text: 'text-emerald-300',
                hoverBg: 'hover:bg-emerald-500/20',
                hoverText: 'hover:text-emerald-200'
              }}
            />
          </div>

          {/* 2. Risk */}
          <div className="p-6 group hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                <AlertTriangle size={16} />
              </div>
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Attention Needed</span>
            </div>
            <h3 className="font-semibold text-slate-200 mb-2">{insights.risk.title}</h3>
            {renderInsightMessage('risk', insights.risk.title, insights.risk.message)}
            <ExpandableActionButton
              action={insights.risk.action}
              actionUrl={insights.risk.actionUrl || '/trays'}
              type="risk"
            onTakeAction={onClose}
              colorClasses={{
                bg: 'bg-amber-500/10',
                border: 'border-amber-500/20',
                text: 'text-amber-300',
                hoverBg: 'hover:bg-amber-500/20',
                hoverText: 'hover:text-amber-200'
              }}
            />
          </div>

          {/* 3. Inventory */}
          <div className="p-6 group hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
                <Package size={16} />
              </div>
              <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Inventory</span>
            </div>
            <h3 className="font-semibold text-slate-200 mb-2">{insights.inventory.title}</h3>
            {renderInsightMessage('inventory', insights.inventory.title, insights.inventory.message)}
            <ExpandableActionButton
              action={insights.inventory.action}
              actionUrl={insights.inventory.actionUrl || '/supplies'}
              type="inventory"
            onTakeAction={onClose}
              colorClasses={{
                bg: 'bg-blue-500/10',
                border: 'border-blue-500/20',
                text: 'text-blue-300',
                hoverBg: 'hover:bg-blue-500/20',
                hoverText: 'hover:text-blue-200'
              }}
            />
          </div>

        </div>
      </motion.div>
    </>
  );
};

const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
};

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'tray_created': return Package;
    case 'tray_lost': return AlertTriangle;
    case 'task_completed': return Scissors;
    case 'task_canceled': return X;
    case 'standing_order_created': return ClipboardList;
    case 'order_fulfilled': return ShoppingBasket;
    case 'request_canceled': return X;
    default: return Package;
  }
};

const getActivityStyles = (type: string) => {
  switch (type) {
    case 'tray_created': return { bg: 'bg-amber-100', color: 'text-amber-600' };
    case 'tray_lost': return { bg: 'bg-red-100', color: 'text-red-600' };
    case 'task_completed': return { bg: 'bg-emerald-100', color: 'text-emerald-600' };
    case 'task_canceled': return { bg: 'bg-gray-100', color: 'text-gray-600' };
    case 'standing_order_created': return { bg: 'bg-violet-100', color: 'text-violet-600' };
    case 'order_fulfilled': return { bg: 'bg-blue-100', color: 'text-blue-600' };
    case 'request_canceled': return { bg: 'bg-gray-100', color: 'text-gray-600' };
    default: return { bg: 'bg-gray-100', color: 'text-gray-600' };
  }
};

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, startWizard, completeOnboarding } = useOnboarding();
  
  // UI State
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [chartDimensions, setChartDimensions] = useState({ bar: { width: 0, height: 0 }, pie: { width: 0, height: 0 } });
  
  // Morning Briefing State
  const [showBriefing, setShowBriefing] = useState(true);
  const [briefingData, setBriefingData] = useState<InsightData | null>(null);
  const insightsTableExistsRef = useRef<boolean | null>(null); // null = unknown, true = exists, false = doesn't exist
  const isFetchingRef = useRef<boolean>(false); // Prevent multiple simultaneous fetches
  
  // Refs for chart containers
  const barChartRef = useRef<HTMLDivElement>(null);
  const pieChartRef = useRef<HTMLDivElement>(null);
  
  // Data State
  const [farmInfo, setFarmInfo] = useState({ farmName: '', farmUuid: '' });
  const [trialEndDate, setTrialEndDate] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalTrays: 0,
    activeTrays: 0,
    totalVarieties: 0,
    totalOrders: 0,
    recentHarvests: 0,
    upcomingHarvests: 0,
    totalProducts: 0,
    standingOrders: 0,
    weeklyTasks: 0,
  });

  // Chart Data
  const [harvestData, setHarvestData] = useState<Array<{ name: string; yield: number }>>([]);
  const [varietyData, setVarietyData] = useState<Array<{ name: string; value: number }>>([]);
  const [recentActivity, setRecentActivity] = useState<Array<{
    activity_id: string;
    activity_type: string;
    description: string;
    occurred_at: string;
  }>>([]);

  // Vibrant Material-like colors
  const PIE_COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6'];

  // --- Data Fetching Logic ---
  const fetchDashboardData = useCallback(async (showLoadingState = false) => {
    // Prevent multiple simultaneous fetches
    if (isFetchingRef.current) {
      console.debug('[DEBUG] Fetch already in progress, skipping...');
      return;
    }
    
    isFetchingRef.current = true;
    if (showLoadingState) setIsLoading(true);
    
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) {
        setIsLoading(false);
        isFetchingRef.current = false;
        return;
      }

      const { farmUuid, farmName } = JSON.parse(sessionData);
      if (!farmUuid) return;

      // 1. Basic Farm Info
      const { data: farmRecord } = await getSupabaseClient()
        .from('farms')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .single();

      setFarmInfo({ 
        farmName: farmRecord?.farm_name || farmName || 'My Farm', 
        farmUuid 
      });
      if (farmRecord?.trial_end_date) setTrialEndDate(farmRecord.trial_end_date);

      // 2. Parallel Data Fetching (Much Faster)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const today = new Date();
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const [
        traysTotal,
        traysActive,
        varietiesCount,
        recentHarvestsCount,
        upcomingHarvestsCount,
        productsCount,
        standingOrdersCount,
        ordersCount,
        tasksCount
      ] = await Promise.all([
        // Total Trays
        getSupabaseClient().from('trays').select('*', { count: 'exact', head: true }).eq('farm_uuid', farmUuid),
        // Active Trays
        getSupabaseClient().from('trays').select('*', { count: 'exact', head: true }).eq('farm_uuid', farmUuid).is('harvest_date', null),
        // Varieties (global table, no farm filter)
        getSupabaseClient().from('varieties').select('*', { count: 'exact', head: true }).then(r => {
          console.log('[DEBUG] Varieties query result:', { count: r.count, error: r.error });
          return r;
        }, () => ({ count: 0, error: null })),
        // Recent Harvests
        getSupabaseClient().from('trays').select('*', { count: 'exact', head: true }).eq('farm_uuid', farmUuid).not('harvest_date', 'is', null).gte('harvest_date', sevenDaysAgo.toISOString()),
        // Harvest Soon - use the database view
        getSupabaseClient()
          .from('harvest_soon_view')
          .select('*', { count: 'exact', head: true })
          .eq('farm_uuid', farmUuid)
          .then(r => {
            console.log('[DEBUG] Harvest Soon query result:', { count: r.count, error: r.error });
            return r;
          }),
        // Products
        getSupabaseClient().from('products').select('*', { count: 'exact', head: true }).eq('farm_uuid', farmUuid).eq('is_active', true).then(r => r, () => ({ count: 0, error: null })),
        // Standing Orders
        getSupabaseClient().from('standing_orders').select('*', { count: 'exact', head: true }).eq('farm_uuid', farmUuid).eq('is_active', true).then(r => {
          console.log('[DEBUG] Standing Orders query result:', { count: r.count, error: r.error });
          return r;
        }, () => ({ count: 0, error: null })),
        // Active Orders (standing_orders where is_active = true)
        getSupabaseClient().from('standing_orders').select('*', { count: 'exact', head: true }).eq('farm_uuid', farmUuid).eq('is_active', true).then(r => {
          console.log('[DEBUG] Active Orders query result:', { count: r.count, error: r.error });
          return r;
        }, () => ({ count: 0, error: null })),
        // Today's Tasks (pending tray_steps scheduled for today)
        getSupabaseClient()
          .from('tray_steps')
          .select(`
            tray_step_id,
            trays!tray_steps_tray_id_fkey(farm_uuid)
          `)
          .eq('trays.farm_uuid', farmUuid)
          .eq('scheduled_date', today.toISOString().split('T')[0])
          .eq('status', 'Pending')
          .then(r => {
            const count = r.data?.length || 0;
            console.log('[DEBUG] Today\'s Tasks query result:', { count, errorMessage: r.error?.message, scheduledDate: today.toISOString().split('T')[0] });
            return { ...r, count };
          }, () => ({ count: 0, error: null }))
      ]);

      setStats({
        totalTrays: traysTotal.count || 0,
        activeTrays: traysActive.count || 0,
        totalVarieties: varietiesCount.count || 0,
        totalOrders: ordersCount.count || 0,
        recentHarvests: recentHarvestsCount.count || 0,
        upcomingHarvests: upcomingHarvestsCount.count || 0,
        totalProducts: productsCount.count || 0,
        standingOrders: standingOrdersCount.count || 0,
        weeklyTasks: tasksCount.count || 0,
      });

      // 3. Process Chart Data
      // Harvest Chart
      const { data: harvestRaw } = await getSupabaseClient()
        .from('trays')
        .select('harvest_date, yield')
        .eq('farm_uuid', farmUuid)
        .not('harvest_date', 'is', null)
        .gte('harvest_date', sevenDaysAgo.toISOString())
        .order('harvest_date', { ascending: true });

      if (harvestRaw) {
        const dailyYields: Record<string, number> = {};
        harvestRaw.forEach(t => {
          const d = new Date(t.harvest_date).toLocaleDateString('en-US', { weekday: 'short' });
          dailyYields[d] = (dailyYields[d] || 0) + Number(t.yield || 0);
        });
        setHarvestData(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
          name: day, yield: dailyYields[day] || 0
        })));
      }

      // Variety Distribution
      const { data: varietyRaw } = await getSupabaseClient()
        .from('trays')
        .select(`recipes!inner(varieties!inner(name))`)
        .eq('farm_uuid', farmUuid)
        .is('harvest_date', null);

      if (varietyRaw) {
        const vCounts: Record<string, number> = {};
        varietyRaw.forEach((item: unknown) => {
          const itemTyped = item as { recipes?: { varieties?: { name?: string } | { name?: string }[] } };
          const varieties = itemTyped.recipes?.varieties;
          const name = Array.isArray(varieties) 
            ? (varieties[0]?.name || 'Unknown')
            : ((varieties as { name?: string })?.name || 'Unknown');
          if (name) {
            vCounts[name] = (vCounts[name] || 0) + 1;
          }
        });
        setVarietyData(Object.entries(vCounts)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5));
      }

      // Fetch Recent Activity
      const { data: activityData } = await getSupabaseClient()
        .from('recent_activity')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .order('occurred_at', { ascending: false })
        .limit(5);

      if (activityData) {
        setRecentActivity(activityData);
      }

      // 4. Fetch Daily Insight from daily_insights table (populated by n8n each morning)
      // Skip if we've already determined the table doesn't exist
      if (insightsTableExistsRef.current !== false) {
        const todayStr = new Date().toISOString().split('T')[0];
        console.log('[DEBUG] Querying daily_insights for date:', todayStr, 'farm_uuid:', farmUuid);
        
        // Query for today's insight
        const { data: insightData, error: insightError } = await getSupabaseClient()
          .from('daily_insights')
          .select('content, date')
          .eq('farm_uuid', farmUuid)
          .eq('date', todayStr)
          .maybeSingle();

        // Handle errors gracefully
        if (insightError) {
          const errorMessage = insightError.message || '';
          const errorCode = insightError.code || '';
          const isExpectedError = 
            errorCode === 'PGRST116' ||
            errorMessage.includes('406') ||
            errorMessage.includes('Not Acceptable') ||
            errorMessage.includes('not found') ||
            errorMessage.includes('does not exist');
          
          // Mark table as non-existent if we get a 406-related error
          if (errorMessage.includes('406') || errorMessage.includes('Not Acceptable')) {
            insightsTableExistsRef.current = false;
          }
          
          if (!isExpectedError) {
            console.error('[DEBUG] Daily insights error:', errorMessage, errorCode);
          }
          setBriefingData(null);
        } else {
          // Success - table exists
          insightsTableExistsRef.current = true;
          console.log('[DEBUG] Insight data received:', insightData);
          
          if (insightData && insightData.content) {
            // content is jsonb, so getSupabaseClient() returns it as an object already
            // Just cast it to InsightData type
            const content = insightData.content as InsightData;
            console.log('[DEBUG] Setting briefing data:', content);
            setBriefingData(content);
          } else {
            // No data for today - try to get the most recent insight as fallback
            console.log('[DEBUG] No insight data for today, fetching most recent');
            const { data: recentData, error: _recentError } = await getSupabaseClient()
              .from('daily_insights')
              .select('content, date')
              .eq('farm_uuid', farmUuid)
              .order('date', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            if (recentData && recentData.content) {
              console.log('[DEBUG] Found recent insight from date:', recentData.date);
              setBriefingData(recentData.content as InsightData);
            } else {
              console.log('[DEBUG] No insights found in database');
              setBriefingData(null);
            }
          }
        }
      } else {
        // Table doesn't exist, skip the request to avoid repeated 406 errors
        setBriefingData(null);
      }

    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // --- Effects ---

  // 0. Track chart container dimensions using ResizeObserver
  useEffect(() => {
    if (isLoading) return;

    let barObserver: ResizeObserver | null = null;
    let pieObserver: ResizeObserver | null = null;

    const updateDimensions = () => {
      if (barChartRef.current && pieChartRef.current) {
        const barRect = barChartRef.current.getBoundingClientRect();
        const pieRect = pieChartRef.current.getBoundingClientRect();
        setChartDimensions({
          bar: { width: barRect.width, height: barRect.height },
          pie: { width: pieRect.width, height: pieRect.height }
        });
      }
    };

    // Use ResizeObserver to track dimensions
    if (barChartRef.current) {
      barObserver = new ResizeObserver(updateDimensions);
      barObserver.observe(barChartRef.current);
    }

    if (pieChartRef.current) {
      pieObserver = new ResizeObserver(updateDimensions);
      pieObserver.observe(pieChartRef.current);
    }

    // Initial check
    const timeout = setTimeout(updateDimensions, 100);

    return () => {
      clearTimeout(timeout);
      if (barObserver) barObserver.disconnect();
      if (pieObserver) pieObserver.disconnect();
    };
  }, [isLoading]);

  // 1. Initial Load & Onboarding Check
  useEffect(() => {
    runNotificationChecks();
    fetchDashboardData(true);

    const sessionData = localStorage.getItem('sproutify_session');
    if (sessionData) {
      if (!state.onboarding_completed && !state.wizard_started) setShowWelcomeModal(true);
      else if (state.wizard_started && !state.onboarding_completed) setShowWizard(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.onboarding_completed, state.wizard_started]);

  // 2. Refetch on Focus or Route Change (Fixes the "Refresh Issue")
  useEffect(() => {
    if (location.pathname === '/') {
      fetchDashboardData(false); // Silent update on nav
    }
    
    const handleFocus = () => {
      if (location.pathname === '/') {
        fetchDashboardData(false);
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // --- Handlers ---
  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchDashboardData(false);
  };

  const friendlyGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="p-6 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      {/* Onboarding Modals */}
      {showWelcomeModal && (
        <WelcomeModal 
          farmName={farmInfo.farmName} 
          onStart={() => { setShowWelcomeModal(false); startWizard(); setShowWizard(true); }} 
          onSkip={() => { setShowWelcomeModal(false); completeOnboarding(); }} 
        />
      )}
      {showWizard && (
        <OnboardingWizard onComplete={() => { setShowWizard(false); completeOnboarding(); }} onClose={() => setShowWizard(false)} />
      )}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-gray-100 pb-6">
        <div className="flex items-center gap-5">
          <div className="h-16 w-16 bg-gradient-to-br from-emerald-100 to-green-200 rounded-2xl flex items-center justify-center text-3xl shadow-sm border border-emerald-100">
            🌱
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold text-emerald-600 uppercase tracking-wider bg-emerald-50 px-2 py-0.5 rounded-md">
                {friendlyGreeting()}
              </span>
              {isRefreshing && <span className="text-xs text-gray-400 animate-pulse">Syncing...</span>}
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">{farmInfo.farmName}</h1>
            <p className="text-gray-500 font-medium mt-1">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {trialEndDate && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 px-3 py-1">
              Trial ends {new Date(trialEndDate).toLocaleDateString()}
            </Badge>
          )}
          <Button 
            variant="outline" 
            size="icon"
            onClick={handleManualRefresh}
            className={`rounded-full border-gray-200 hover:bg-gray-50 ${isRefreshing ? 'animate-spin' : ''}`}
            title="Refresh Data"
          >
            <RefreshCcw className="h-4 w-4 text-gray-600" />
          </Button>
        </div>
      </div>

      {/* --- SAGE AI MORNING BRIEFING --- */}
      <AnimatePresence>
        <SageBriefing 
          data={briefingData}
          isVisible={showBriefing} 
          onClose={() => setShowBriefing(!showBriefing)}
          navigate={navigate}
        />
      </AnimatePresence>

      {/* Stats Grid - "Command Center" Style */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        <StatCard 
          title="Active Trays" 
          value={stats.activeTrays} 
          subtitle="Growing now" 
          icon={Sprout} 
          color="text-emerald-600" 
          bg="bg-emerald-100" 
        />
        <StatCard 
          title="Active Orders" 
          value={stats.totalOrders} 
          subtitle="To fulfill" 
          icon={ClipboardList} 
          color="text-blue-600" 
          bg="bg-blue-100" 
        />
        <StatCard 
          title="Harvest Soon" 
          value={stats.upcomingHarvests} 
          subtitle="Next 7 days" 
          icon={Scissors} 
          color="text-amber-600" 
          bg="bg-amber-100" 
        />
        <StatCard 
          title="Today's Tasks" 
          value={stats.weeklyTasks} 
          subtitle="Pending" 
          icon={AlertCircle} 
          color="text-rose-600" 
          bg="bg-rose-100" 
        />
        <StatCard 
          title="Catalog" 
          value={stats.totalVarieties} 
          subtitle="Varieties" 
          icon={Package} 
          color="text-violet-600" 
          bg="bg-violet-100" 
        />
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Charts (2/3 width) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Harvest Chart */}
          <Card className="border-none shadow-md bg-white rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold text-gray-800">Harvest Yield</CardTitle>
                  <CardDescription>Last 7 days output (oz)</CardDescription>
                </div>
                <TrendingUp className="h-5 w-5 text-gray-400" />
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div ref={barChartRef} className="h-[300px] w-full min-h-[300px] min-w-0" style={{ position: 'relative' }}>
                {chartDimensions.bar.width > 0 && chartDimensions.bar.height > 0 ? (
                  <ResponsiveContainer width={chartDimensions.bar.width} height={chartDimensions.bar.height}>
                    <BarChart data={harvestData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} />
                      <Tooltip 
                        cursor={{fill: '#f9fafb'}}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                      />
                      <Bar dataKey="yield" fill="#10B981" radius={[6, 6, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions Bar */}
          <Card className="border-none shadow-md bg-white rounded-2xl p-6">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <QuickActionBtn 
                label="New Tray" 
                icon={Sprout} 
                onClick={() => navigate('/trays')} 
                color="hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200" 
              />
              <QuickActionBtn 
                label="New Order" 
                icon={ShoppingBasket} 
                onClick={() => navigate('/orders')} 
                color="hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200" 
              />
              <QuickActionBtn 
                label="New Batch" 
                icon={Package} 
                onClick={() => navigate('/batches')} 
                color="hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200" 
              />
              <QuickActionBtn 
                label="Add User" 
                icon={Users} 
                onClick={() => navigate('/users')} 
                color="hover:bg-violet-50 hover:text-violet-700 hover:border-violet-200" 
              />
            </div>
          </Card>
        </div>

        {/* Right Column: Mix & Activity (1/3 width) */}
        <div className="space-y-8">
          
          {/* Variety Mix Pie */}
          <Card className="border-none shadow-md bg-white rounded-2xl">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg font-bold text-gray-800">Current Mix</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex gap-4 items-start">
                {/* Chart on the left */}
                <div ref={pieChartRef} className="h-[250px] w-[250px] min-h-[250px] min-w-[250px] flex-shrink-0" style={{ position: 'relative' }}>
                  {chartDimensions.pie.width > 0 && chartDimensions.pie.height > 0 ? (
                    <ResponsiveContainer width={chartDimensions.pie.width} height={chartDimensions.pie.height}>
                      <PieChart>
                        <Pie
                          data={varietyData.length > 0 ? varietyData : [{ name: 'No Data', value: 1 }]}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                          stroke="none"
                        >
                          {(varietyData.length > 0 ? varietyData : [{ name: 'No Data', value: 1 }]).map((_entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : null}
                </div>
                
                {/* Legend on the right */}
                <div className="flex-1 min-w-0">
                  <div className="max-h-[250px] overflow-y-auto pr-2">
                    <div className="space-y-2">
                      {(varietyData.length > 0 ? varietyData : [{ name: 'No Data', value: 1 }]).map((entry, index) => {
                        const color = PIE_COLORS[index % PIE_COLORS.length];
                        const percentage = varietyData.length > 0 
                          ? ((entry.value / varietyData.reduce((sum, item) => sum + item.value, 0)) * 100).toFixed(1)
                          : '0';
                        return (
                          <div key={`legend-${index}`} className="flex items-center gap-2 py-1">
                            <div 
                              className="w-3 h-3 rounded-full flex-shrink-0" 
                              style={{ backgroundColor: color }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-800 truncate">{entry.name}</div>
                              {varietyData.length > 0 && (
                                <div className="text-xs text-gray-500">{percentage}%</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Activity Feed */}
          <Card className="border-none shadow-md bg-white rounded-2xl">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-lg font-bold text-gray-800">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-50">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity) => {
                const Icon = getActivityIcon(activity.activity_type);
                const styles = getActivityStyles(activity.activity_type);
                return (
                  <ActivityItem 
                    key={activity.activity_id}
                    text={activity.description}
                    time={formatTimeAgo(activity.occurred_at)}
                    icon={Icon}
                    bg={styles.bg}
                    color={styles.color}
                  />
                );
              })
            ) : (
              <p className="text-sm text-gray-400 p-4">No recent activity</p>
            )}
              </div>
          <Button 
            variant="ghost" 
            className="w-full text-xs text-gray-400 hover:text-gray-600 mt-2"
            onClick={() => navigate('/activity')}
          >
                View All Activity
              </Button>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
};

// --- Sub-components for Cleaner Code ---

interface StatCardProps {
  title: string;
  value: number;
  subtitle: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  color: string;
  bg: string;
}

const StatCard = ({ title, value, subtitle, icon, color, bg }: StatCardProps) => (
  <Card className="border-none shadow-sm hover:shadow-md transition-shadow duration-200 rounded-2xl overflow-hidden group">
    <CardContent className="p-5 flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <h3 className="text-2xl font-black text-gray-900 tracking-tight">{value}</h3>
        <p className="text-xs font-medium text-gray-400 mt-1">{subtitle}</p>
      </div>
      <DashboardIcon icon={icon} colorClass={color} bgClass={bg} />
    </CardContent>
  </Card>
);

interface QuickActionBtnProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  color: string;
}

const QuickActionBtn = ({ label, icon: Icon, onClick, color }: QuickActionBtnProps) => (
  <Button 
    variant="outline" 
    className={`h-auto py-6 flex flex-col gap-3 rounded-xl border-gray-100 transition-all duration-200 group ${color}`}
    onClick={onClick}
  >
    <Icon className="h-6 w-6 group-hover:scale-110 transition-transform duration-200" />
    <span className="font-semibold">{label}</span>
  </Button>
);

interface ActivityItemProps {
  text: string;
  time: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  bg: string;
  color: string;
}

const ActivityItem = ({ text, time, icon: Icon, bg, color }: ActivityItemProps) => (
  <div className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors">
    <div className={`p-2 rounded-full ${bg}`}>
      <Icon size={14} className={color} strokeWidth={3} />
    </div>
    <div className="flex-1">
      <p className="text-sm font-semibold text-gray-800">{text}</p>
      <p className="text-xs text-gray-400">{time}</p>
    </div>
  </div>
);

const DashboardSkeleton = () => (
  <div className="p-6 space-y-8 max-w-[1600px] mx-auto">
    <div className="flex justify-between items-center pb-6 border-b border-gray-100">
      <div className="flex gap-4">
        <Skeleton className="h-16 w-16 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-64" />
        </div>
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <Skeleton className="h-[400px] lg:col-span-2 rounded-2xl" />
      <Skeleton className="h-[400px] rounded-2xl" />
    </div>
  </div>
);

export default Dashboard;
