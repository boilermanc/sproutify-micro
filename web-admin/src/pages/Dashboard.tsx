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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

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

// --- STAT CARD MODAL TYPES ---
type StatModalType = 'trays' | 'orders' | 'harvest' | 'tasks' | 'catalog' | null;

interface ActiveTrayDetail {
  tray_id: number;
  tray_unique_id: string;
  sow_date: string;
  location: string | null;
  recipe_name: string;
  variety_name: string;
}

interface ActiveOrderDetail {
  schedule_id: number;
  order_name: string;
  customer_name: string;
  scheduled_delivery_date: string;
  status: string;
}

interface HarvestSoonDetail {
  tray_step_id: number;
  tray_id: number;
  tray_unique_id: string;
  variety_name: string;
  scheduled_date: string;
  days_until: number;
  location: string | null;
}

interface TaskDetail {
  id: string;
  type: 'tray_step' | 'watering' | 'maintenance';
  name: string;
  description?: string;
  tray_id?: number;
  tray_unique_id?: string;
  variety_name?: string;
}

interface CatalogDetail {
  variety_id: number;
  variety_name: string;
  description: string | null;
  active_trays: number;
  recipe_count: number;
}

type StatModalData =
  | { type: 'trays'; data: ActiveTrayDetail[] }
  | { type: 'orders'; data: ActiveOrderDetail[] }
  | { type: 'harvest'; data: HarvestSoonDetail[] }
  | { type: 'tasks'; data: TaskDetail[] }
  | { type: 'catalog'; data: CatalogDetail[] }
  | null;

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
                <div className="p-6 border-b border-white/5 bg-slate-950/80 backdrop-blur-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-200">Daily Insight</p>
                      <h3 className="text-xl font-bold text-white mt-1">{detailModal.title}</h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCloseDetail}
                      className="text-slate-200 hover:text-white hover:bg-white/10 rounded-full"
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCloseDetail}
                      className="text-white border-white/30 hover:border-white/60 hover:bg-white/10"
                    >
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

const parseLocalDate = (dateStr: string | Date | null | undefined): Date | null => {
  if (!dateStr) return null;
  if (dateStr instanceof Date) {
    const copy = new Date(dateStr);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
  const dateOnly = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const [year, month, day] = dateOnly.split('-').map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

const getActionableTrayStepsCount = async (farmUuid: string, todayStr: string): Promise<number> => {
  try {
    const { count, error } = await getSupabaseClient()
      .from('actionable_tray_steps')
      .select('*', { count: 'exact', head: true })
      .eq('farm_uuid', farmUuid)
      .eq('scheduled_date', todayStr)
      .eq('status', 'Pending');

    if (error) {
      console.error('[Dashboard] Error fetching actionable tray steps:', error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error('[Dashboard] Unexpected error fetching actionable tray steps:', error);
    return 0;
  }
};

const getWateringTrayCount = async (farmUuid: string, today: Date): Promise<number> => {
  try {
    const { data: activeTrays, error: trayError } = await getSupabaseClient()
      .from('trays')
      .select('tray_id, recipe_id')
      .eq('farm_uuid', farmUuid)
      .eq('status', 'active')
      .is('harvest_date', null);

    if (trayError || !activeTrays) {
      if (trayError) console.error('[Dashboard] Error fetching active trays for watering:', trayError);
      return 0;
    }

    const trayIds = (activeTrays || [])
      .map((tray: any) => tray.tray_id)
      .filter(Boolean);
    const trayRecipeMap = new Map<number, number | null>();
    (activeTrays || []).forEach((tray: any) => {
      if (tray.tray_id) {
        trayRecipeMap.set(tray.tray_id, tray.recipe_id ?? null);
      }
    });
    if (trayIds.length === 0) return 0;

    const todayStr = today.toISOString().split('T')[0];

    const { data: trayStepsData, error: stepsError } = await getSupabaseClient()
      .from('tray_steps')
      .select('tray_id, scheduled_date, status, steps!fk_step_id(step_id, water_frequency), trays!fk_tray_id(tray_id, status)')
      .in('tray_id', trayIds)
      .eq('trays.status', 'active')
      .lte('scheduled_date', todayStr);

    if (stepsError || !trayStepsData) {
      if (stepsError) console.error('[Dashboard] Error fetching tray steps for watering:', stepsError);
      return 0;
    }

    const todayNormalized = new Date(today);
    todayNormalized.setHours(0, 0, 0, 0);
    const candidateSteps = new Map<number, any[]>();

    trayStepsData.forEach((row: any) => {
      if (!row.tray_id || !row.steps?.water_frequency) return;
      const scheduled = parseLocalDate(row.scheduled_date);
      if (!scheduled) return;
      if (scheduled.getTime() > todayNormalized.getTime()) return;
      const existing = candidateSteps.get(row.tray_id) || [];
      existing.push(row);
      candidateSteps.set(row.tray_id, existing);
    });

    const traysNeedingWater = new Set<number>();
    candidateSteps.forEach((rows, trayId) => {
      const sorted = [...rows].sort((a, b) => {
        const aDate = parseLocalDate(a.scheduled_date)?.getTime() ?? 0;
        const bDate = parseLocalDate(b.scheduled_date)?.getTime() ?? 0;
        return bDate - aDate;
      });

      const candidate = sorted[0];
      if (!candidate) return;
      traysNeedingWater.add(trayId);
    });

    const potentialTrays = Array.from(traysNeedingWater);

    const { data: harvestSteps } = await getSupabaseClient()
      .from('tray_steps')
      .select('tray_id, scheduled_date, steps!fk_step_id(step_name)')
      .in('tray_id', potentialTrays)
      .eq('steps.step_name', 'Harvest')
      .gt('scheduled_date', todayStr);

    const traysWithFutureHarvest = new Set(
      (harvestSteps || [])
        .filter((step: any) => {
          const scheduled = parseLocalDate(step.scheduled_date);
          return scheduled ? scheduled.getTime() > new Date(todayStr).getTime() : false;
        })
        .map((step: any) => step.tray_id)
        .filter(Boolean)
    );
    const filteredTrays = potentialTrays.filter(trayId => traysWithFutureHarvest.has(trayId));

    const { data: completedRecipes } = await getSupabaseClient()
      .from('task_completions')
      .select('recipe_id')
      .eq('farm_uuid', farmUuid)
      .eq('task_date', todayStr)
      .eq('task_type', 'watering')
      .eq('status', 'completed');

    const completedRecipeIds = new Set(
      (completedRecipes || [])
        .map((rec: any) => rec.recipe_id)
        .filter(Boolean)
    );

    const remainingTrays = filteredTrays.filter((trayId) => {
      const recipeId = trayRecipeMap.get(trayId);
      return recipeId ? !completedRecipeIds.has(recipeId) : true;
    });

    const finalCount = remainingTrays.length;
    const distinctTrays = activeTrays || [];
    const traysWithFutureHarvestList = Array.from(traysWithFutureHarvest || []);

    console.log('[DEBUG] getWateringTrayCount breakdown:', {
      totalTraysFound: distinctTrays.length,
      traysWithFutureHarvest: traysWithFutureHarvestList.length,
      completedRecipes: completedRecipeIds.size,
      finalCount,
      trayIds: distinctTrays.map((t: any) => t.tray_id),
      recipeIds: distinctTrays.map((t: any) => t.recipe_id)
    });

    return finalCount;
  } catch (error) {
    console.error('[Dashboard] Unexpected error while counting watering trays:', error);
    return 0;
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
  const [showBriefing, setShowBriefing] = useState(false);
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

  // Stat Card Modal State
  const [activeModal, setActiveModal] = useState<StatModalType>(null);
  const [modalData, setModalData] = useState<StatModalData>(null);
  const [modalLoading, setModalLoading] = useState(false);

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
      const todayStr = today.toISOString().split('T')[0];
      const todayDow = today.getDay();

      const maintenanceTasksPromise = getSupabaseClient()
        .from('maintenance_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('farm_uuid', farmUuid)
        .eq('is_active', true)
        .or(`task_date.eq.${todayStr},day_of_week.eq.${todayDow}`)
        .then((result) => ({ count: result.count || 0 }), () => ({ count: 0 }));

      const actionableTrayStepsPromise = getActionableTrayStepsCount(farmUuid, todayStr);
      const wateringTrayCountPromise = getWateringTrayCount(farmUuid, today);

      const [
        traysTotal,
        traysActive,
        varietiesCount,
        recentHarvestsCount,
        upcomingHarvestsCount,
        productsCount,
        standingOrdersCount,
        todaysDeliveriesResult,
        actionableTrayStepsCount,
        wateringTrayCount,
        maintenanceTasksCount
      ] = await Promise.all([
        // Total Trays
        getSupabaseClient().from('trays').select('*', { count: 'exact', head: true }).eq('farm_uuid', farmUuid),
        // Active Trays
        getSupabaseClient().from('trays').select('*', { count: 'exact', head: true }).eq('farm_uuid', farmUuid).eq('status', 'active').is('harvest_date', null),
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
        // Active Orders = today's pending order schedules (count unique deliveries)
        getSupabaseClient()
          .from('order_schedules')
          .select('standing_order_id, scheduled_delivery_date, standing_orders!inner(farm_uuid)')
          .eq('standing_orders.farm_uuid', farmUuid)
          .eq('scheduled_delivery_date', todayStr)
          .eq('status', 'pending')
          .then(r => {
            console.log('[DEBUG] Today\'s Pending Deliveries query result:', {
              rowsFetched: r.data?.length,
              error: r.error,
              scheduledDate: todayStr,
            });
            return r;
          }, () => ({ data: [], error: null })),
        // Actionable tray steps
        actionableTrayStepsPromise,
        // Watering tasks (distinct trays)
        wateringTrayCountPromise,
        maintenanceTasksPromise
      ]);

      const trayStepTasksCount = actionableTrayStepsCount || 0;
      const wateringTasksCountValue = wateringTrayCount || 0;
      const maintenanceTasksCountValue = maintenanceTasksCount.count || 0;
      const totalTasks = trayStepTasksCount + wateringTasksCountValue + maintenanceTasksCountValue;
      const todaysDeliveries = todaysDeliveriesResult?.data || [];
      const uniqueDeliveriesCount = new Set(
        todaysDeliveries
          .filter((schedule: any) => schedule.standing_order_id && schedule.scheduled_delivery_date)
          .map((schedule: any) => `${schedule.standing_order_id}-${schedule.scheduled_delivery_date}`)
      ).size;
      console.log('[DEBUG] Unique today deliveries count:', uniqueDeliveriesCount);

      console.log('[DEBUG] Dashboard actionable tasks breakdown:', {
        traySteps: trayStepTasksCount,
        watering: wateringTasksCountValue,
        maintenance: maintenanceTasksCountValue
      });

      setStats({
        totalTrays: traysTotal.count || 0,
        activeTrays: traysActive.count || 0,
        totalVarieties: varietiesCount.count || 0,
        totalOrders: uniqueDeliveriesCount,
        recentHarvests: recentHarvestsCount.count || 0,
        upcomingHarvests: upcomingHarvestsCount.count || 0,
        totalProducts: productsCount.count || 0,
        standingOrders: standingOrdersCount.count || 0,
        weeklyTasks: totalTasks,
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
          // Use the date string directly from database (YYYY-MM-DD format)
          // Don't parse through Date object to avoid timezone shifting
          const dateKey = String(t.harvest_date).split('T')[0];
          dailyYields[dateKey] = (dailyYields[dateKey] || 0) + Number(t.yield || 0);
        });

        // Generate last 7 days in chronological order using local dates
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
          last7Days.push({
            name: dayName,
            yield: dailyYields[dateKey] || 0
          });
        }
        setHarvestData(last7Days);
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

  // --- Stat Card Modal Handlers ---
  const handleStatCardClick = useCallback(async (type: NonNullable<StatModalType>) => {
    setActiveModal(type);
    setModalLoading(true);
    setModalData(null);

    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      switch (type) {
        case 'trays': {
          const { data, error } = await getSupabaseClient()
            .from('trays')
            .select(`
              tray_id,
              tray_unique_id,
              sow_date,
              location,
              recipes!inner(recipe_name, variety_name)
            `)
            .eq('farm_uuid', farmInfo.farmUuid)
            .eq('status', 'active')
            .is('harvest_date', null)
            .order('sow_date', { ascending: false })
            .limit(10);

          if (error) throw error;

          const formatted: ActiveTrayDetail[] = (data || []).map((t: any) => ({
            tray_id: t.tray_id,
            tray_unique_id: t.tray_unique_id || `T-${t.tray_id}`,
            sow_date: t.sow_date,
            location: t.location,
            recipe_name: t.recipes?.recipe_name || 'Unknown',
            variety_name: t.recipes?.variety_name || 'Unknown',
          }));

          setModalData({ type: 'trays', data: formatted });
          break;
        }

        case 'orders': {
          const { data, error } = await getSupabaseClient()
            .from('order_schedules')
            .select(`
              schedule_id,
              standing_order_id,
              scheduled_delivery_date,
              status,
              standing_orders!inner(order_name, farm_uuid, customer_id)
            `)
            .eq('standing_orders.farm_uuid', farmInfo.farmUuid)
            .eq('scheduled_delivery_date', todayStr)
            .eq('status', 'pending');

          if (error) throw error;

          // Deduplicate by standing_order_id + scheduled_delivery_date (unique deliveries)
          const uniqueDeliveries = new Map<string, any>();
          (data || []).forEach((o: any) => {
            const key = `${o.standing_order_id}-${o.scheduled_delivery_date}`;
            if (!uniqueDeliveries.has(key)) {
              uniqueDeliveries.set(key, o);
            }
          });

          const uniqueOrders = Array.from(uniqueDeliveries.values()).slice(0, 10);

          // Get customer names for the customer IDs
          const customerIds = [...new Set(uniqueOrders
            .map((o: any) => o.standing_orders?.customer_id)
            .filter(Boolean))];

          const { data: customers } = customerIds.length > 0
            ? await getSupabaseClient()
                .from('customers')
                .select('customerid, name')
                .in('customerid', customerIds)
            : { data: [] };

          const customerMap = new Map((customers || []).map((c: any) => [c.customerid, c.name]));

          const formatted: ActiveOrderDetail[] = uniqueOrders.map((o: any) => ({
            schedule_id: o.schedule_id,
            order_name: o.standing_orders?.order_name || 'Unknown Order',
            customer_name: customerMap.get(o.standing_orders?.customer_id) || 'Unknown Customer',
            scheduled_delivery_date: o.scheduled_delivery_date,
            status: o.status,
          }));

          setModalData({ type: 'orders', data: formatted });
          break;
        }

        case 'harvest': {
          const { data, error } = await getSupabaseClient()
            .from('harvest_soon_view')
            .select('tray_step_id, tray_id, scheduled_date')
            .eq('farm_uuid', farmInfo.farmUuid)
            .order('scheduled_date', { ascending: true })
            .limit(10);

          if (error) throw error;

          // Get tray details for these harvest steps
          const trayIds = [...new Set((data || []).map((h: any) => h.tray_id))];
          const { data: trayData } = trayIds.length > 0
            ? await getSupabaseClient()
                .from('trays')
                .select(`
                  tray_id,
                  tray_unique_id,
                  location,
                  recipes!inner(variety_name)
                `)
                .in('tray_id', trayIds)
            : { data: [] };

          const trayMap = new Map((trayData || []).map((t: any) => [t.tray_id, t]));

          const formatted: HarvestSoonDetail[] = (data || []).map((h: any) => {
            const tray = trayMap.get(h.tray_id) as any;
            const scheduledDate = new Date(h.scheduled_date);
            const daysUntil = Math.ceil((scheduledDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            return {
              tray_step_id: h.tray_step_id,
              tray_id: h.tray_id,
              tray_unique_id: tray?.tray_unique_id || `T-${h.tray_id}`,
              variety_name: tray?.recipes?.variety_name || 'Unknown',
              scheduled_date: h.scheduled_date,
              days_until: daysUntil,
              location: tray?.location || null,
            };
          });

          setModalData({ type: 'harvest', data: formatted });
          break;
        }

        case 'tasks': {
          const tasks: TaskDetail[] = [];
          const todayDow = today.getDay();

          // 1. Actionable tray steps
          const { data: traySteps } = await getSupabaseClient()
            .from('actionable_tray_steps')
            .select('tray_step_id, tray_id, step_name, step_description')
            .eq('farm_uuid', farmInfo.farmUuid)
            .eq('scheduled_date', todayStr)
            .eq('status', 'Pending')
            .limit(10);

          // Get tray unique IDs and variety info for tray steps
          const trayStepTrayIds = [...new Set((traySteps || []).map((s: any) => s.tray_id))];
          const { data: trayStepTrays } = trayStepTrayIds.length > 0
            ? await getSupabaseClient()
                .from('trays')
                .select('tray_id, tray_unique_id, recipes!inner(recipe_name, variety_name)')
                .in('tray_id', trayStepTrayIds)
            : { data: [] };

          const trayStepTrayMap = new Map((trayStepTrays || []).map((t: any) => [t.tray_id, {
            tray_unique_id: t.tray_unique_id,
            variety_name: t.recipes?.variety_name || t.recipes?.recipe_name || 'Unknown'
          }]));

          (traySteps || []).forEach((s: any) => {
            const trayInfo = trayStepTrayMap.get(s.tray_id);
            tasks.push({
              id: `step-${s.tray_step_id}`,
              type: 'tray_step',
              name: s.step_name || 'Tray Step',
              description: s.step_description,
              tray_id: s.tray_id,
              tray_unique_id: trayInfo?.tray_unique_id || `T-${s.tray_id}`,
              variety_name: trayInfo?.variety_name,
            });
          });

          // 2. Maintenance tasks
          const { data: maintenanceTasks } = await getSupabaseClient()
            .from('maintenance_tasks')
            .select('maintenance_task_id, task_name, task_type')
            .eq('farm_uuid', farmInfo.farmUuid)
            .eq('is_active', true)
            .or(`task_date.eq.${todayStr},day_of_week.eq.${todayDow}`)
            .limit(10);

          (maintenanceTasks || []).forEach((m: any) => {
            tasks.push({
              id: `maint-${m.maintenance_task_id}`,
              type: 'maintenance',
              name: m.task_name,
              description: m.task_type,
            });
          });

          setModalData({ type: 'tasks', data: tasks.slice(0, 10) });
          break;
        }

        case 'catalog': {
          // Get varieties with counts
          const { data: varieties, error } = await getSupabaseClient()
            .from('varieties')
            .select('varietyid, name, description')
            .order('name', { ascending: true })
            .limit(10);

          if (error) throw error;

          // Get active tray counts per variety
          const { data: trayCounts } = await getSupabaseClient()
            .from('trays')
            .select('recipes!inner(variety_id)')
            .eq('farm_uuid', farmInfo.farmUuid)
            .eq('status', 'active')
            .is('harvest_date', null);

          const trayCountMap = new Map<number, number>();
          (trayCounts || []).forEach((t: any) => {
            const vid = t.recipes?.variety_id;
            if (vid) {
              trayCountMap.set(vid, (trayCountMap.get(vid) || 0) + 1);
            }
          });

          // Get recipe counts per variety
          const { data: recipeCounts } = await getSupabaseClient()
            .from('recipes')
            .select('variety_id');

          const recipeCountMap = new Map<number, number>();
          (recipeCounts || []).forEach((r: any) => {
            if (r.variety_id) {
              recipeCountMap.set(r.variety_id, (recipeCountMap.get(r.variety_id) || 0) + 1);
            }
          });

          const formatted: CatalogDetail[] = (varieties || []).map((v: any) => ({
            variety_id: v.varietyid,
            variety_name: v.name,
            description: v.description,
            active_trays: trayCountMap.get(v.varietyid) || 0,
            recipe_count: recipeCountMap.get(v.varietyid) || 0,
          }));

          // Sort by active trays descending
          formatted.sort((a, b) => b.active_trays - a.active_trays);

          setModalData({ type: 'catalog', data: formatted });
          break;
        }
      }
    } catch (error) {
      console.error('[Dashboard] Error fetching modal data:', error);
      setModalData(null);
    } finally {
      setModalLoading(false);
    }
  }, [farmInfo.farmUuid]);

  const closeModal = useCallback(() => {
    setActiveModal(null);
    setModalData(null);
  }, []);

  const getModalTitle = (type: StatModalType): string => {
    switch (type) {
      case 'trays': return 'Active Trays';
      case 'orders': return 'Active Orders';
      case 'harvest': return 'Harvest Soon';
      case 'tasks': return "Today's Tasks";
      case 'catalog': return 'Variety Catalog';
      default: return '';
    }
  };

  const getModalViewAllPath = (type: StatModalType): string => {
    switch (type) {
      case 'trays': return '/trays';
      case 'orders': return '/orders';
      case 'harvest': return '/trays';
      case 'tasks': return '/daily-flow';
      case 'catalog': return '/varieties';
      default: return '/';
    }
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
          onClick={() => handleStatCardClick('trays')}
        />
        <StatCard
          title="Active Orders"
          value={stats.totalOrders}
          subtitle="To fulfill"
          icon={ClipboardList}
          color="text-blue-600"
          bg="bg-blue-100"
          onClick={() => handleStatCardClick('orders')}
        />
        <StatCard
          title="Harvest Soon"
          value={stats.upcomingHarvests}
          subtitle="Next 7 days"
          icon={Scissors}
          color="text-amber-600"
          bg="bg-amber-100"
          onClick={() => handleStatCardClick('harvest')}
        />
        <StatCard
          title="Today's Tasks"
          value={stats.weeklyTasks}
          subtitle="Pending"
          icon={AlertCircle}
          color="text-rose-600"
          bg="bg-rose-100"
          onClick={() => handleStatCardClick('tasks')}
        />
        <StatCard
          title="Catalog"
          value={stats.totalVarieties}
          subtitle="Varieties"
          icon={Package}
          color="text-violet-600"
          bg="bg-violet-100"
          onClick={() => handleStatCardClick('catalog')}
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

      {/* Stat Card Detail Modal */}
      <Dialog open={activeModal !== null} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{getModalTitle(activeModal)}</DialogTitle>
            <DialogDescription>
              {activeModal === 'trays' && 'Currently growing trays in your farm'}
              {activeModal === 'orders' && "Today's pending deliveries"}
              {activeModal === 'harvest' && 'Trays ready for harvest in the next 7 days'}
              {activeModal === 'tasks' && 'Tasks scheduled for today'}
              {activeModal === 'catalog' && 'All varieties in your catalog'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            {modalLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : modalData === null ? (
              <p className="text-sm text-gray-500 text-center py-8">No data available</p>
            ) : (
              <>
                {/* Active Trays Content */}
                {modalData.type === 'trays' && (
                  <div className="space-y-2">
                    {modalData.data.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">No active trays</p>
                    ) : (
                      modalData.data.map((tray) => (
                        <div
                          key={tray.tray_id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-100 rounded-lg">
                              <Sprout className="h-4 w-4 text-emerald-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{tray.variety_name}</p>
                              <p className="text-xs text-gray-500">
                                {tray.tray_unique_id} • {tray.recipe_name}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-gray-700">
                              {Math.ceil((new Date().getTime() - new Date(tray.sow_date).getTime()) / (1000 * 60 * 60 * 24))} days
                            </p>
                            <p className="text-xs text-gray-500">{tray.location || 'No location'}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Active Orders Content */}
                {modalData.type === 'orders' && (
                  <div className="space-y-2">
                    {modalData.data.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">No pending orders for today</p>
                    ) : (
                      modalData.data.map((order) => (
                        <div
                          key={order.schedule_id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 rounded-lg">
                              <ClipboardList className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{order.order_name}</p>
                              <p className="text-xs text-gray-500">{order.customer_name}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            {order.status}
                          </Badge>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Harvest Soon Content */}
                {modalData.type === 'harvest' && (
                  <div className="space-y-2">
                    {modalData.data.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">No upcoming harvests</p>
                    ) : (
                      modalData.data.map((harvest) => (
                        <div
                          key={harvest.tray_step_id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${harvest.days_until <= 0 ? 'bg-red-100' : harvest.days_until <= 2 ? 'bg-amber-100' : 'bg-green-100'}`}>
                              <Scissors className={`h-4 w-4 ${harvest.days_until <= 0 ? 'text-red-600' : harvest.days_until <= 2 ? 'text-amber-600' : 'text-green-600'}`} />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{harvest.variety_name}</p>
                              <p className="text-xs text-gray-500">
                                {harvest.tray_unique_id} • {harvest.location || 'No location'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-medium ${harvest.days_until <= 0 ? 'text-red-600' : harvest.days_until <= 2 ? 'text-amber-600' : 'text-gray-700'}`}>
                              {harvest.days_until <= 0 ? 'Overdue' : harvest.days_until === 1 ? 'Tomorrow' : `${harvest.days_until} days`}
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(harvest.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Today's Tasks Content */}
                {modalData.type === 'tasks' && (
                  <div className="space-y-2">
                    {modalData.data.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">No tasks for today</p>
                    ) : (
                      modalData.data.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${task.type === 'tray_step' ? 'bg-rose-100' : task.type === 'watering' ? 'bg-blue-100' : 'bg-purple-100'}`}>
                              <AlertCircle className={`h-4 w-4 ${task.type === 'tray_step' ? 'text-rose-600' : task.type === 'watering' ? 'text-blue-600' : 'text-purple-600'}`} />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                {task.name}
                                {task.variety_name && <span className="text-emerald-600 ml-1">({task.variety_name})</span>}
                              </p>
                              <p className="text-xs text-gray-500">
                                {task.tray_unique_id ? `${task.tray_unique_id} • ` : ''}
                                {task.description || task.type.replace('_', ' ')}
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              task.type === 'tray_step'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : task.type === 'watering'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-purple-50 text-purple-700 border-purple-200'
                            }
                          >
                            {task.type === 'tray_step' ? 'Step' : task.type === 'watering' ? 'Water' : 'Maintenance'}
                          </Badge>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Catalog Content */}
                {modalData.type === 'catalog' && (
                  <div className="space-y-2">
                    {modalData.data.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">No varieties in catalog</p>
                    ) : (
                      modalData.data.map((variety) => (
                        <div
                          key={variety.variety_id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-violet-100 rounded-lg">
                              <Package className="h-4 w-4 text-violet-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{variety.variety_name}</p>
                              <p className="text-xs text-gray-500 line-clamp-1">
                                {variety.description || 'No description'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex gap-3">
                            <div>
                              <p className="text-sm font-medium text-gray-700">{variety.active_trays}</p>
                              <p className="text-xs text-gray-500">trays</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-700">{variety.recipe_count}</p>
                              <p className="text-xs text-gray-500">recipes</p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="border-t pt-4">
            <Button
              variant="outline"
              onClick={() => {
                closeModal();
                navigate(getModalViewAllPath(activeModal));
              }}
              className="w-full"
            >
              View All
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  onClick?: () => void;
}

const StatCard = ({ title, value, subtitle, icon, color, bg, onClick }: StatCardProps) => (
  <Card
    className={`border-none shadow-sm hover:shadow-lg transition-all duration-200 rounded-2xl overflow-hidden group ${onClick ? 'cursor-pointer hover:scale-[1.02]' : ''}`}
    onClick={onClick}
  >
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
