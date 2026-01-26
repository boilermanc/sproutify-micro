import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  Droplets,
  Sun,
  Scissors,
  Clock,
  MoreVertical,
  ArrowRight,
  Sprout,
  Eye,
  ExternalLink,
  SkipForward,
  AlertTriangle,
  FastForward,
  ChevronDown,
  ChevronUp,
  Scale,
  ChevronLeft,
  ChevronRight,
  Package,
  Trash2,
  XCircle,
  Calendar,
  Beaker,
  MapPin,
  Phone,
  RefreshCw,
  FileText,
  User,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getSupabaseClient } from '@/lib/supabaseClient';
import {
  fetchDailyTasks,
  completeTask,
  getActiveTraysCount,
  skipTask,
  skipMissedStep,
  completeMissedStep,
  skipAllMissedSteps,
  markTraysAsLost,
  LOSS_REASONS,
  completeSoakTask,
  completeSoakTaskByRecipe,
  completeSeedTask,
  useLeftoverSoakedSeed,
  discardSoakedSeed,
  cancelSeedingRequest,
  rescheduleSeedingRequest,
  fetchPassiveTrayStatus,
  fetchOrderGapStatus,
  fetchOverdueSeedingTasks,
  type PassiveTrayStatusItem,
  type OrderGapStatus
} from '../services/dailyFlowService';
import { recordFulfillmentAction } from '../services/orderFulfillmentActions';
import type { FulfillmentActionType } from '../services/orderFulfillmentActions';
import type { OrderFulfillmentStatus } from '../services/orderFulfillmentService';
import { finalizeTodaysDeliveries } from '../services/orderFulfillmentService';
import type { DailyTask, MissedStep, LossReason } from '../services/dailyFlowService';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { resolveVarietyNameFromRelation } from '@/lib/varietyUtils';
import GrowingMicrogreens from './GrowingMicrogreens';
import {
  fetchAssignableTrays,
  assignTrayToCustomer,
  harvestTrayNow,
  updateHarvestStepToToday,
  updateHarvestStepDate,
} from '../services/trayService';
import type { AssignableTray, MismatchedAssignedTray } from '../services/trayService';

const convertQuantityValueToGrams = (
  rawQuantity: number | string | null | undefined,
  unit?: string | null
): number | null => {
  if (rawQuantity === null || rawQuantity === undefined || rawQuantity === '') {
    return null;
  }
  const numericValue = typeof rawQuantity === 'string' ? parseFloat(rawQuantity) : Number(rawQuantity);
  if (!Number.isFinite(numericValue)) {
    return null;
  }
  const normalizedUnit = (unit || 'grams').toString().trim().toLowerCase();
  switch (normalizedUnit) {
    case 'kg':
    case 'kilogram':
    case 'kilograms':
      return numericValue * 1000;
    case 'g':
    case 'gram':
    case 'grams':
      return numericValue;
    case 'oz':
    case 'ounce':
    case 'ounces':
      return numericValue * 28.3495;
    case 'lb':
    case 'lbs':
    case 'pound':
    case 'pounds':
      return numericValue * 453.592;
    default:
      return numericValue;
  }
};

const formatQuantityDisplay = (
  rawQuantity: number | string | null | undefined,
  unit?: string | null
): string => {
  if (rawQuantity === null || rawQuantity === undefined || rawQuantity === '') {
    return 'N/A';
  }

  const numericValue = typeof rawQuantity === 'string' ? parseFloat(rawQuantity) : Number(rawQuantity);
  if (!Number.isFinite(numericValue)) {
    return 'N/A';
  }

  const normalizedUnit = (unit || 'grams').toString();
  const formattedValue =
    Number.isInteger(numericValue) ? numericValue.toString() : numericValue.toFixed(2).replace(/\.?0+$/, '');
  return `${formattedValue} ${normalizedUnit}`;
};

const getBatchAvailableGrams = (batch?: {
  quantity?: number | string | null;
  unit?: string | null;
  quantity_grams?: number | string | null;
}): number => {
  if (!batch) return 0;
  const gramsValue =
    batch.quantity_grams ?? convertQuantityValueToGrams(batch.quantity, batch.unit);
  if (gramsValue === null || gramsValue === undefined) return 0;
  const parsed = typeof gramsValue === 'string' ? parseFloat(gramsValue) : Number(gramsValue);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatShortDateLabel = (value?: string): string | undefined => {
  if (!value) return undefined;
  const dateOnly = value.includes('T') ? value.split('T')[0] : value;
  const [year, month, day] = dateOnly.split('-').map(Number);
  if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
    return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return undefined;
};

type TraySelectionDetail = {
  trayId: number;
  varietyName?: string;
  sowDate?: string;
};

// Format date string to local date display (handles timezone correctly)
const formatLocalDate = (value?: string | null): string => {
  if (!value) return 'N/A';
  const dateOnly = value.includes('T') ? value.split('T')[0] : value;
  const [year, month, day] = dateOnly.split('-').map(Number);
  if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
    return new Date(year, month - 1, day).toLocaleDateString();
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString();
  }
  return 'N/A';
};

const getRelativeDayLabel = (value?: string | null): string | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays > 1) return `in ${diffDays} days`;
  if (diffDays === -1) return 'yesterday';
  return `${Math.abs(diffDays)} days ago`;
};

const formatReadyDateLabel = (value?: string | null): string => {
  const relative = getRelativeDayLabel(value);
  const short = value ? formatShortDateLabel(value) : undefined;
  if (relative && short) {
    return `${relative} (${short})`;
  }
  if (relative) return relative;
  if (short) return short;
  return 'soon';
};

const formatGapKey = (gap: OrderGapStatus): string =>
  `${gap.customer_id ?? 'unknown'}-${gap.product_id ?? 'unknown'}`;

const parseMissingVarietyNames = (missing?: string | null): string[] => {
  if (!missing) return [];
  return missing
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);
};

// Variety status for order gap breakdown
interface VarietyStatus {
  varietyName: string;
  recipeId?: number;
  status: 'ready' | 'date_mismatch' | 'missing';
  tray?: MismatchedAssignedTray;
  readyDate?: string;
}

// Build variety breakdown for an order gap
// Uses recipe_id for matching when recipeRequirements are provided
const buildVarietyBreakdown = (
  gap: OrderGapStatus,
  mismatchedTrays: MismatchedAssignedTray[],
  matchingTrays: AssignableTray[],
  recipeRequirements?: OrderFulfillmentStatus[]
): VarietyStatus[] => {
  const breakdown: VarietyStatus[] = [];

  // Group mismatched trays by recipe_id
  const mismatchedByRecipeId = new Map<number, MismatchedAssignedTray>();
  for (const tray of mismatchedTrays) {
    if (tray.recipe_id && !mismatchedByRecipeId.has(tray.recipe_id)) {
      mismatchedByRecipeId.set(tray.recipe_id, tray);
    }
  }

  // Group ready trays by recipe_id
  const readyByRecipeId = new Map<number, AssignableTray>();
  for (const tray of matchingTrays) {
    if (tray.recipe_id && !readyByRecipeId.has(tray.recipe_id)) {
      readyByRecipeId.set(tray.recipe_id, tray);
    }
  }

  // If we have recipe requirements with recipe_ids, use those for matching
  if (recipeRequirements && recipeRequirements.length > 0) {
    for (const req of recipeRequirements) {
      const recipeId = req.recipe_id;
      const displayName = req.recipe_name;

      // First check if this variety is already fulfilled according to the database
      // This takes precedence over tray matching since it reflects the actual fulfillment state
      if (req.fulfillment_status === 'fulfilled') {
        breakdown.push({
          varietyName: displayName,
          recipeId,
          status: 'ready',
        });
        continue;
      }

      // Check if there's a mismatched tray for this recipe
      const mismatchedTray = mismatchedByRecipeId.get(recipeId);
      if (mismatchedTray) {
        breakdown.push({
          varietyName: mismatchedTray.variety_name || displayName,
          recipeId,
          status: 'date_mismatch',
          tray: mismatchedTray,
          readyDate: mismatchedTray.harvest_date,
        });
        continue;
      }

      // Check if there's a ready tray for this recipe
      const readyTray = readyByRecipeId.get(recipeId);
      if (readyTray) {
        breakdown.push({
          varietyName: readyTray.variety_name || displayName,
          recipeId,
          status: 'ready',
        });
        continue;
      }

      // No tray found - recipe is missing
      breakdown.push({
        varietyName: displayName,
        recipeId,
        status: 'missing',
      });
    }
  } else {
    // Fallback to name-based matching when recipe requirements aren't available
    const missingVarieties = parseMissingVarietyNames(gap.missing_varieties);

    // Group mismatched trays by variety name for fallback
    const mismatchedByVariety = new Map<string, MismatchedAssignedTray>();
    for (const tray of mismatchedTrays) {
      const varietyKey = (tray.variety_name || tray.recipe_name || '').toLowerCase();
      if (varietyKey && !mismatchedByVariety.has(varietyKey)) {
        mismatchedByVariety.set(varietyKey, tray);
      }
    }

    // Group ready trays by variety name for fallback
    const readyByVariety = new Map<string, AssignableTray>();
    for (const tray of matchingTrays) {
      const varietyKey = (tray.variety_name || tray.recipe_name || '').toLowerCase();
      if (varietyKey && !readyByVariety.has(varietyKey)) {
        readyByVariety.set(varietyKey, tray);
      }
    }

    // Process each mismatched tray variety
    for (const [, tray] of mismatchedByVariety) {
      const displayName = tray.variety_name || tray.recipe_name || '';
      breakdown.push({
        varietyName: displayName,
        recipeId: tray.recipe_id,
        status: 'date_mismatch',
        tray,
        readyDate: tray.harvest_date,
      });
    }

    // Process ready trays that aren't already mismatched (by recipe_id)
    for (const [, tray] of readyByVariety) {
      if (!mismatchedByRecipeId.has(tray.recipe_id)) {
        const displayName = tray.variety_name || tray.recipe_name || '';
        breakdown.push({
          varietyName: displayName,
          recipeId: tray.recipe_id,
          status: 'ready',
        });
      }
    }

    // Process missing varieties that aren't mismatched or ready (by recipe_id)
    for (const missingName of missingVarieties) {
      const alreadyAdded = breakdown.some(
        (v) => v.recipeId && (
          mismatchedByRecipeId.has(v.recipeId) || readyByRecipeId.has(v.recipeId)
        )
      );
      // Only add if not already covered by recipe_id
      if (!alreadyAdded || breakdown.length === 0) {
        const alreadyAddedByName = breakdown.some(
          (v) => v.varietyName.toLowerCase().includes(missingName) ||
                 missingName.includes(v.varietyName.toLowerCase())
        );
        if (!alreadyAddedByName) {
          breakdown.push({
            varietyName: missingName,
            status: 'missing',
          });
        }
      }
    }
  }

  // Sort: date_mismatch first, then missing, then ready
  breakdown.sort((a, b) => {
    const order = { date_mismatch: 0, missing: 1, ready: 2 };
    return order[a.status] - order[b.status];
  });

  return breakdown;
};

type HarvestGroup = {
  key: string;
  customerName?: string;
  deliveryDate?: string;
  tasks: DailyTask[];
};

type BatchHarvestRow = {
  trayId: number;
  crop: string;
  batchId?: string;
  taskId: string;
  recipeId?: number;
  varietyName?: string;
  sowDate?: string | null;
  seededBy?: string | null;
};

type HasRecipeInfo = {
  variety_name?: string | null;
  recipe_name?: string | null;
};

const getTrayDisplayName = (source?: HasRecipeInfo) => {
  if (!source) return 'Unknown';
  return source.variety_name || source.recipe_name || 'Unknown';
};

export default function DailyFlow() {
  const navigate = useNavigate();
  const [traySelectionModal, setTraySelectionModal] = useState<{ trayDetails: TraySelectionDetail[]; groupLabel?: string } | null>(null);

  const handleViewTrayDetail = useCallback(
    (trayId: number) => {
      setTraySelectionModal(null);
      navigate(`/trays/${trayId}?mode=edit`);
    },
    [navigate]
  );

  const openTraySelectionModal = useCallback(
    (trayDetails: TraySelectionDetail[], groupLabel?: string) => {
      if (trayDetails.length === 0) return;
      if (trayDetails.length === 1) {
        handleViewTrayDetail(trayDetails[0].trayId);
        return;
      }
      setTraySelectionModal({ trayDetails, groupLabel });
    },
    [handleViewTrayDetail]
  );

  const closeTraySelectionModal = useCallback(() => {
    setTraySelectionModal(null);
  }, []);
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [overdueSeedingTasks, setOverdueSeedingTasks] = useState<DailyTask[]>([]);
  const [skippedOverdueTasks, setSkippedOverdueTasks] = useState<Set<string>>(new Set());
  const [activeTraysCount, setActiveTraysCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [viewingTask, setViewingTask] = useState<DailyTask | null>(null);
  const [harvestingTask, setHarvestingTask] = useState<DailyTask | null>(null);
  const [harvestYield, setHarvestYield] = useState<string>('');
  const [harvestSelectedTrayIds, setHarvestSelectedTrayIds] = useState<number[]>([]);
  const [seedingTask, setSeedingTask] = useState<DailyTask | null>(null);
  const [seedingDialogReady, setSeedingDialogReady] = useState(false); // Prevents button clicks during dialog transition
  const [soakTask, setSoakTask] = useState<DailyTask | null>(null);
  const [soakDate, setSoakDate] = useState<string>(() => new Date().toISOString().split('T')[0]); // Default to today
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [availableBatches, setAvailableBatches] = useState<any[]>([]);
  useEffect(() => {
    console.log('[DailyFlow] availableBatches state updated:', availableBatches.map((batch) => ({
      batchid: batch.batchid,
      batch_id: batch.batch_id,
      batchId: batch.batchId,
    })));
  }, [availableBatches]);

  useEffect(() => {
    if (selectedBatchId === null) {
      console.log('[DailyFlow] selectedBatchId cleared');
      return;
    }
    const batch = availableBatches.find((b) => b.batchid === selectedBatchId);
    console.log('[DailyFlow] Selected batch:', {
      selectedBatchId,
      batch,
    });
  }, [selectedBatchId, availableBatches]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [soakQuantityGrams, setSoakQuantityGrams] = useState<string>('');
  const [seedQuantityPerTray, setSeedQuantityPerTray] = useState<number>(0);
  const [seedQuantityCompleted, setSeedQuantityCompleted] = useState<string>('');
  const [isSoakVariety, setIsSoakVariety] = useState<boolean>(false);
  const [availableSoakedSeed, setAvailableSoakedSeed] = useState<any>(null);
  const [allAvailableSoakedSeed, setAllAvailableSoakedSeed] = useState<any[]>([]);
  const [useSoakedSeedDialog, setUseSoakedSeedDialog] = useState<any>(null);
  const [useSoakedSeedQuantity, setUseSoakedSeedQuantity] = useState<string>('');
  const [discardSoakedSeedDialog, setDiscardSoakedSeedDialog] = useState<any>(null);
  const [discardReason, setDiscardReason] = useState<string>('expired');
  const [missedStepForSeeding, setMissedStepForSeeding] = useState<{ task: DailyTask; step: MissedStep } | null>(null);
  const [skipAllTask, setSkipAllTask] = useState<DailyTask | null>(null);
  const [lostTask, setLostTask] = useState<DailyTask | null>(null);
  const [lossReason, setLossReason] = useState<LossReason | ''>('');
  const [lossNotes, setLossNotes] = useState<string>('');
  const [cancelRequestDialog, setCancelRequestDialog] = useState<{ task: DailyTask; reason: string } | null>(null);
  const [isCancellingRequest, setIsCancellingRequest] = useState(false);
  const [rescheduleRequestDialog, setRescheduleRequestDialog] = useState<{ task: DailyTask; newDate: string } | null>(null);
  const [passiveStepDetails, setPassiveStepDetails] = useState<{ stepName: string; varieties: Array<{ recipe: string; trays: number }>; totalTrays: number } | null>(null);
  const [manageOrderDialog, setManageOrderDialog] = useState<DailyTask | null>(null);
  const [fulfillmentAction, setFulfillmentAction] = useState<FulfillmentActionType | ''>('');
  const [fulfillmentNotes, setFulfillmentNotes] = useState<string>('');
  const [fulfillmentQuantity, setFulfillmentQuantity] = useState<string>('');
  const [isProcessingFulfillment, setIsProcessingFulfillment] = useState(false);
  const [actionHistory, setActionHistory] = useState<Map<string, any[]>>(new Map());
  const actionHistoryRef = useRef<Map<string, any[]>>(new Map());
  const recipeVarietyCacheRef = useRef<Record<number, string>>({});
  const [availableSubstitutes, setAvailableSubstitutes] = useState<any[]>([]);
  const [selectedSubstitute, setSelectedSubstitute] = useState<number | null>(null);
  const [passiveTrayStatus, setPassiveTrayStatus] = useState<PassiveTrayStatusItem[]>([]);
  const [orderGapStatus, setOrderGapStatus] = useState<OrderGapStatus[]>([]);
  const activeOrderGaps = useMemo(() => orderGapStatus.filter((gap) => gap.gap > 0), [orderGapStatus]);
  const [gapMissingVarietyTrays, setGapMissingVarietyTrays] = useState<Record<string, AssignableTray[]>>({});
  const [gapMissingVarietyTraysLoading, setGapMissingVarietyTraysLoading] = useState<Record<string, boolean>>({});
  const [gapMismatchedTrays, setGapMismatchedTrays] = useState<Record<string, MismatchedAssignedTray[]>>({});
  const [gapMismatchedTraysLoading, setGapMismatchedTraysLoading] = useState<Record<string, boolean>>({});
  const [gapRecipeRequirements, setGapRecipeRequirements] = useState<Record<string, OrderFulfillmentStatus[]>>({});
  const [gapReallocationConfirm, setGapReallocationConfirm] = useState<{
    gap: OrderGapStatus;
    tray: MismatchedAssignedTray;
    action: 'harvestEarly' | 'keepForFuture' | 'cancel';
    nextDeliveryDate?: string | null; // The next scheduled delivery after today
  } | null>(null);
  const [animatingOutGaps, setAnimatingOutGaps] = useState<Set<string>>(new Set());
  // Track gaps that have been removed via user action - prevents them from reappearing
  // due to race conditions with pending data fetches
  const removedGapsRef = useRef<Set<string>>(new Set());
  const [isFinalizingDay, setIsFinalizingDay] = useState(false);
  const [assignModalGap, setAssignModalGap] = useState<OrderGapStatus | null>(null);
  const [assignableTrays, setAssignableTrays] = useState<AssignableTray[]>([]);
  const [isLoadingAssignableTrays, setIsLoadingAssignableTrays] = useState(false);
  const [selectedAssignTrayId, setSelectedAssignTrayId] = useState<number | null>(null);
  const [isAssigningTray, setIsAssigningTray] = useState(false);
  const [nearReadyTrayModal, setNearReadyTrayModal] = useState<{
    gap: OrderGapStatus;
    tray: AssignableTray;
  } | null>(null);
  const [isTrayModalProcessing, setIsTrayModalProcessing] = useState(false);
  const [batchHarvestModalGroup, setBatchHarvestModalGroup] = useState<HarvestGroup | null>(null);
  const [batchHarvestRows, setBatchHarvestRows] = useState<BatchHarvestRow[]>([]);
  const [batchHarvestSelected, setBatchHarvestSelected] = useState<Record<number, boolean>>({});
  const [batchHarvestYields, setBatchHarvestYields] = useState<Record<number, string>>({});
  const [isBatchHarvesting, setIsBatchHarvesting] = useState(false);
  // State for "Complete Order & Harvest Early" confirmation modal
  const [earlyHarvestConfirm, setEarlyHarvestConfirm] = useState<{
    group: HarvestGroup;
    mismatchedTrays: MismatchedAssignedTray[];
    readyVarieties: string[];
  } | null>(null);
  const [isProcessingEarlyHarvest, setIsProcessingEarlyHarvest] = useState(false);
  // Track early harvest trays that were modified (for revert on cancel)
  const [pendingEarlyHarvestTrays, setPendingEarlyHarvestTrays] = useState<{
    trayStepId: number;
    originalDate: string;
  }[]>([]);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
    show: boolean;
  }>({ type: 'success', message: '', show: false });
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });
  
  // Ref to prevent duplicate submissions (more reliable than state for this)
  const isSubmittingSeeding = useRef(false);

  const showNotification = useCallback(
    (
      type: 'success' | 'error' | 'info' | 'warning',
      message: string,
      title?: string
    ) => {
      const formattedMessage = title ? `${title}: ${message}` : message;
      if (type === 'error') {
        console.error('[DailyFlow Notification]', formattedMessage);
      } else if (type === 'warning') {
        console.warn('[DailyFlow Notification]', formattedMessage);
      } else if (type === 'info') {
        console.info('[DailyFlow Notification]', formattedMessage);
      } else {
        console.log('[DailyFlow Notification]', formattedMessage);
      }

      setNotification({
        type: type === 'error' ? 'error' : 'success',
        message: formattedMessage,
        show: true,
      });

      setTimeout(() => setNotification((prev) => ({ ...prev, show: false })), 5000);
    },
    []
  );

  const changeSelectedDate = (offsetDays: number) => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + offsetDays);
      next.setHours(0, 0, 0, 0);
      return next;
    });
  };

  const getFarmUuidFromSession = useCallback(() => {
    const sessionData = localStorage.getItem('sproutify_session');
    if (!sessionData) return null;
    try {
      return JSON.parse(sessionData).farmUuid as string | null;
    } catch {
      return null;
    }
  }, []);

  // ✅ OPTIMIZED: Consolidated gap data fetcher - eliminates 25-50 queries
  const updateAllGapData = useCallback(async (gaps: OrderGapStatus[]) => {
    if (!gaps || gaps.length === 0) {
      setGapMissingVarietyTrays({});
      setGapMissingVarietyTraysLoading({});
      setGapMismatchedTrays({});
      setGapMismatchedTraysLoading({});
      setGapRecipeRequirements({});
      return;
    }

    const farmUuid = getFarmUuidFromSession();
    if (!farmUuid) {
      setGapMissingVarietyTrays({});
      setGapMissingVarietyTraysLoading({});
      setGapMismatchedTrays({});
      setGapMismatchedTraysLoading({});
      setGapRecipeRequirements({});
      return;
    }

    // Set initial loading states
    const initialLoading: Record<string, boolean> = {};
    gaps.forEach((gap) => {
      initialLoading[formatGapKey(gap)] = true;
    });
    setGapMissingVarietyTraysLoading(initialLoading);
    setGapMismatchedTraysLoading(initialLoading);

    try {
      // Collect all unique product IDs, customer IDs, and delivery dates from gaps
      const productIds = [...new Set(gaps.map(g => g.product_id).filter(Boolean))];
      const deliveryDates = [...new Set(gaps.map(g => g.scheduled_delivery_date || g.delivery_date).filter(Boolean))];

      // Calculate ready date range for assignable trays
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const readyDateMin = new Date(today);
      readyDateMin.setDate(readyDateMin.getDate() - 11);
      const readyDateMax = new Date(today);
      readyDateMax.setDate(readyDateMax.getDate() + 10);

      // Fetch ALL required data in parallel (4 queries total, regardless of gap count)
      const [
        allActiveTrays,
        productRecipeMappings,
        harvestTraySteps,
        orderFulfillmentData
      ] = await Promise.all([
        // Query 1: ALL active trays (both assigned and unassigned) with recipe details
        getSupabaseClient()
          .from('trays')
          .select(`
            tray_id,
            sow_date,
            recipe_id,
            customer_id,
            status,
            recipes (
              recipe_id,
              recipe_name,
              variety_name
            )
          `)
          .eq('farm_uuid', farmUuid)
          .eq('status', 'active')
          .is('harvest_date', null)
          .then(({ data, error }) => {
            if (error) {
              console.error('[updateAllGapData] Error fetching trays:', error);
              return [];
            }
            return data || [];
          }),

        // Query 2: Product → recipe mappings for ALL products in gaps
        productIds.length > 0
          ? getSupabaseClient()
              .from('product_recipe_mapping')
              .select('product_id, recipe_id')
              .in('product_id', productIds)
              .then(({ data, error }) => {
                if (error) {
                  console.error('[updateAllGapData] Error fetching product mappings:', error);
                  return [];
                }
                return data || [];
              })
          : Promise.resolve([]),

        // Query 3: Harvest step schedules for ALL active trays
        getSupabaseClient()
          .from('tray_steps')
          .select(`
            tray_step_id,
            tray_id,
            step_id,
            scheduled_date,
            status,
            steps!inner (
              step_name
            )
          `)
          .eq('farm_uuid', farmUuid)
          .ilike('steps.step_name', '%harvest%')
          .eq('status', 'Pending')
          .then(({ data, error }) => {
            if (error) {
              console.error('[updateAllGapData] Error fetching harvest steps:', error);
              return [];
            }
            return data || [];
          }),

        // Query 4: Order fulfillment details for ALL relevant delivery dates
        deliveryDates.length > 0 && gaps.some(g => g.customer_name)
          ? getSupabaseClient()
              .from('order_fulfillment_status')
              .select('*')
              .eq('farm_uuid', farmUuid)
              .in('delivery_date', deliveryDates)
              .then(({ data, error }) => {
                if (error) {
                  console.error('[updateAllGapData] Error fetching fulfillment details:', error);
                  return [];
                }
                return data || [];
              })
          : Promise.resolve([])
      ]);

      // Build lookup maps from fetched data
      const productRecipeMap = new Map<number, number[]>();
      productRecipeMappings.forEach((pr: any) => {
        if (!productRecipeMap.has(pr.product_id)) {
          productRecipeMap.set(pr.product_id, []);
        }
        productRecipeMap.get(pr.product_id)!.push(pr.recipe_id);
      });

      const harvestStepMap = new Map<number, { scheduled_date: string; tray_step_id: number }>();
      harvestTraySteps.forEach((ts: any) => {
        if (ts.scheduled_date) {
          harvestStepMap.set(ts.tray_id, {
            scheduled_date: ts.scheduled_date,
            tray_step_id: ts.tray_step_id,
          });
        }
      });

      const orderFulfillmentMap = new Map<string, any[]>();
      orderFulfillmentData.forEach((ofd: any) => {
        const key = `${ofd.delivery_date}-${ofd.customer_name}`;
        if (!orderFulfillmentMap.has(key)) {
          orderFulfillmentMap.set(key, []);
        }
        orderFulfillmentMap.get(key)!.push(ofd);
      });

      // Process each gap using pre-fetched data (IN MEMORY - no more queries!)
      const newMissingVarietyTrays: Record<string, AssignableTray[]> = {};
      const newMismatchedTrays: Record<string, MismatchedAssignedTray[]> = {};
      const newRecipeRequirements: Record<string, OrderFulfillmentStatus[]> = {};

      gaps.forEach((gap) => {
        const gapKey = formatGapKey(gap);

        // === Process Missing Variety Trays ===
        const missingVarieties = parseMissingVarietyNames(gap.missing_varieties);
        if (gap.product_id == null || missingVarieties.length === 0) {
          newMissingVarietyTrays[gapKey] = [];
        } else {
          // Get recipe IDs for this product
          const recipeIdsForProduct = productRecipeMap.get(gap.product_id) || [];
          
          // Filter unassigned trays that match product and are in ready window
          const assignableTrays = allActiveTrays
            .filter((tray: any) => {
              if (tray.customer_id != null) return false; // Must be unassigned
              if (!recipeIdsForProduct.includes(tray.recipe_id)) return false; // Must match product
              if (!tray.sow_date) return false;
              
              // Check if in ready window (-11 to +10 days)
              const sowDate = new Date(tray.sow_date);
              return sowDate >= readyDateMin && sowDate <= readyDateMax;
            })
            .map((tray: any) => {
              const recipe = Array.isArray(tray.recipes) ? tray.recipes[0] : tray.recipes;
              const sowDate = new Date(tray.sow_date);
              const daysGrown = Math.max(0, Math.floor((today.getTime() - sowDate.getTime()) / (1000 * 60 * 60 * 24)));
              
              return {
                tray_id: tray.tray_id,
                recipe_id: tray.recipe_id,
                recipe_name: recipe?.recipe_name || 'Unknown',
                variety_name: recipe?.variety_name || null,
                sow_date: tray.sow_date,
                days_grown: daysGrown,
                days_until_ready: Math.max(0, 12 - daysGrown),
              };
            });

          // Filter to only matching varieties
          const matches = assignableTrays.filter((tray) => {
            const nameToCheck = (
              (tray.variety_name && tray.variety_name.toLowerCase()) ||
              (tray.recipe_name && tray.recipe_name.toLowerCase()) ||
              ''
            );
            return missingVarieties.some((name) => nameToCheck.includes(name));
          });

          newMissingVarietyTrays[gapKey] = matches;
        }

        // === Process Mismatched Trays ===
        if (gap.product_id == null || gap.customer_id == null || !gap.scheduled_delivery_date && !gap.delivery_date) {
          newMismatchedTrays[gapKey] = [];
        } else {
          const deliveryDate = gap.scheduled_delivery_date || gap.delivery_date;
          const deliveryDateObj = new Date(deliveryDate!);
          deliveryDateObj.setHours(0, 0, 0, 0);

          // Get recipe IDs for this product
          const recipeIdsForProduct = productRecipeMap.get(gap.product_id) || [];
          
          // Filter assigned trays for this customer and product
          const customerTrays = allActiveTrays.filter((tray: any) => 
            tray.customer_id === gap.customer_id && 
            recipeIdsForProduct.includes(tray.recipe_id)
          );

          // Identify recipes with at least one ready tray
          const recipesWithReadyTrays = new Set<number>();
          customerTrays.forEach((tray: any) => {
            const harvestInfo = harvestStepMap.get(tray.tray_id);
            if (!harvestInfo) return;
            
            const harvestDateObj = new Date(harvestInfo.scheduled_date);
            harvestDateObj.setHours(0, 0, 0, 0);
            
            if (harvestDateObj <= today) {
              recipesWithReadyTrays.add(tray.recipe_id);
            }
          });

          // Collect mismatched trays (assigned but not ready in time)
          const mismatchedTrays: MismatchedAssignedTray[] = [];
          customerTrays.forEach((tray: any) => {
            // Skip if this variety already has a ready tray
            if (recipesWithReadyTrays.has(tray.recipe_id)) return;

            const harvestInfo = harvestStepMap.get(tray.tray_id);
            if (!harvestInfo) return;

            const harvestDateObj = new Date(harvestInfo.scheduled_date);
            harvestDateObj.setHours(0, 0, 0, 0);

            // Only include if harvest date is after today (truly mismatched)
            if (harvestDateObj > today) {
              const recipe = Array.isArray(tray.recipes) ? tray.recipes[0] : tray.recipes;
              mismatchedTrays.push({
                tray_id: tray.tray_id,
                recipe_id: tray.recipe_id,
                recipe_name: recipe?.recipe_name || 'Unknown',
                variety_name: recipe?.variety_name || null,
                sow_date: tray.sow_date,
                customer_id: tray.customer_id,
                harvest_date: harvestInfo.scheduled_date,
                tray_step_id: harvestInfo.tray_step_id,
              });
            }
          });

          newMismatchedTrays[gapKey] = mismatchedTrays;
        }

        // === Process Recipe Requirements ===
        const deliveryDate = gap.scheduled_delivery_date || gap.delivery_date;
        if (!deliveryDate || !gap.customer_name) {
          newRecipeRequirements[gapKey] = [];
        } else {
          const fulfillmentKey = `${deliveryDate}-${gap.customer_name}`;
          const fulfillmentDetails = orderFulfillmentMap.get(fulfillmentKey) || [];
          
          // Filter to only include recipes for this specific product if it's a mix
          const filteredRequirements = gap.is_mix
            ? fulfillmentDetails // Mix products: show all recipes for this order
            : fulfillmentDetails.filter((r: any) => r.recipe_name === gap.product_name);
          
          newRecipeRequirements[gapKey] = filteredRequirements;
        }
      });

      // Update all state at once
      setGapMissingVarietyTrays(newMissingVarietyTrays);
      setGapMismatchedTrays(newMismatchedTrays);
      setGapRecipeRequirements(newRecipeRequirements);
      
      // Clear all loading states
      const noLoading: Record<string, boolean> = {};
      gaps.forEach((gap) => {
        noLoading[formatGapKey(gap)] = false;
      });
      setGapMissingVarietyTraysLoading(noLoading);
      setGapMismatchedTraysLoading(noLoading);

    } catch (error) {
      console.error('[updateAllGapData] Error updating gap data:', error);
      
      // Set empty data and clear loading on error
      const emptyData: Record<string, any> = {};
      const noLoading: Record<string, boolean> = {};
      gaps.forEach((gap) => {
        const gapKey = formatGapKey(gap);
        emptyData[gapKey] = [];
        noLoading[gapKey] = false;
      });
      
      setGapMissingVarietyTrays(emptyData);
      setGapMismatchedTrays(emptyData);
      setGapRecipeRequirements(emptyData);
      setGapMissingVarietyTraysLoading(noLoading);
      setGapMismatchedTraysLoading(noLoading);
    }
  }, [getFarmUuidFromSession]);

  const openAssignModal = useCallback(async (gap: OrderGapStatus) => {
    const farmUuid = getFarmUuidFromSession();
    if (!farmUuid) {
      showNotification('error', 'Unable to determine farm for assignment');
      return;
    }
    setAssignModalGap(gap);
    setIsLoadingAssignableTrays(true);
    try {
      const trays = await fetchAssignableTrays(farmUuid, gap.product_id);
      setAssignableTrays(trays);
      setSelectedAssignTrayId(trays[0]?.tray_id ?? null);
    } catch (error) {
      console.error('[DailyFlow] Error loading assignable trays:', error);
      showNotification('error', 'Failed to load ready trays');
    } finally {
      setIsLoadingAssignableTrays(false);
    }
  }, [getFarmUuidFromSession, showNotification]);

  const handleAssignUnassignedGap = useCallback(() => {
    const unassignedGap = activeOrderGaps.find((gap) => gap.unassigned_ready > 0);
    if (unassignedGap) {
      openAssignModal(unassignedGap);
      return;
    }
    showNotification('error', 'No unassigned trays currently available');
  }, [activeOrderGaps, openAssignModal, showNotification]);

  // Finalize today's deliveries - mark fulfilled as completed, unfulfilled as skipped
  const handleFinalizeDay = useCallback(async () => {
    const farmUuid = getFarmUuidFromSession();
    if (!farmUuid) {
      showNotification('error', 'No farm selected');
      return;
    }

    setIsFinalizingDay(true);
    try {
      const result = await finalizeTodaysDeliveries(farmUuid);
      const total = result.completed + result.skipped;
      if (total > 0) {
        showNotification('success', `Day finalized: ${result.completed} completed, ${result.skipped} skipped`);
        // Reload tasks to refresh the gap display
        await loadTasks({ suppressLoading: true });
      } else {
        showNotification('info', 'No pending deliveries to finalize');
      }
    } catch (error: any) {
      console.error('[DailyFlow] Error finalizing day:', error);
      showNotification('error', error?.message || 'Failed to finalize day');
    } finally {
      setIsFinalizingDay(false);
    }
  }, [getFarmUuidFromSession, showNotification, loadTasks]);

  const closeAssignModal = useCallback(() => {
    setAssignModalGap(null);
    setAssignableTrays([]);
    setSelectedAssignTrayId(null);
    setIsLoadingAssignableTrays(false);
    setIsAssigningTray(false);
  }, []);

  const viewNearReadyTray = useCallback((gap: OrderGapStatus, tray: AssignableTray) => {
    setNearReadyTrayModal({ gap, tray });
  }, []);

  // Track tasks that are animating out (use ref so it persists through loadTasks calls)
  const animatingOutRef = useRef<Set<string>>(new Set());
  const [animatingOut, setAnimatingOut] = useState<Set<string>>(new Set());

  // Fetch action history for an at-risk task
  const pendingHistoryFetches = useRef<Set<string>>(new Set());
  const fetchActionHistory = useCallback(async (task: DailyTask) => {
    if (!task.standingOrderId || !task.deliveryDate || !getSupabaseClient()) return;

    const key = `${task.standingOrderId}-${task.deliveryDate}-${task.recipeId}`;

    if (pendingHistoryFetches.current.has(key)) return;

    const currentHistory = actionHistoryRef.current;
    if (currentHistory.has(key)) return;

    pendingHistoryFetches.current.add(key);

    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) {
        pendingHistoryFetches.current.delete(key);
        return;
      }

      const { farmUuid } = JSON.parse(sessionData);
      const { data } = await getSupabaseClient()
        .from('order_fulfillment_actions')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .eq('standing_order_id', task.standingOrderId)
        .eq('delivery_date', task.deliveryDate)
        .eq('recipe_id', task.recipeId)
        .order('created_at', { ascending: false })
        .limit(3);

      if (data) {
        setActionHistory(prev => {
          if (!prev.has(key)) {
            const next = new Map(prev);
            next.set(key, data);
            return next;
          }
          return prev;
        });
      }
    } catch (error) {
      console.error('Error fetching action history:', error);
    } finally {
      pendingHistoryFetches.current.delete(key);
    }
  }, []);

  useEffect(() => {
    actionHistoryRef.current = actionHistory;
  }, [actionHistory]);

  // Autofill seeding quantity based on remaining trays and batch inventory
  useEffect(() => {
    if (!seedingTask || isSoakVariety) return;
    if (!seedQuantityPerTray || seedQuantityPerTray <= 0) return;
    const batch = availableBatches.find((b) => b.batchid === selectedBatchId);
    if (!batch) return;
    const remaining = Math.max(0, (seedingTask.quantity || 0) - (seedingTask.quantityCompleted || 0));
    const availableGrams = getBatchAvailableGrams(batch);
    const needed = remaining * seedQuantityPerTray;
    const maxTrays = seedQuantityPerTray > 0 ? Math.floor(availableGrams / seedQuantityPerTray) : 0;
    if (!seedQuantityCompleted) {
      if (needed <= availableGrams) {
        setSeedQuantityCompleted(remaining.toString());
      } else if (maxTrays > 0) {
        setSeedQuantityCompleted(maxTrays.toString());
      }
    }
  }, [seedingTask, isSoakVariety, availableBatches, selectedBatchId, seedQuantityPerTray, seedQuantityCompleted]);

  const isLoadingTasksRef = useRef(false);
  const loadingStartTimeRef = useRef<number>(0);
  const loadAbortControllerRef = useRef<AbortController | null>(null);

  const loadTasks = useCallback(async (options: { suppressLoading?: boolean } = {}) => {
    const showLoading = !options.suppressLoading;

    // Abort any previous in-flight request to prevent stale connection issues
    if (loadAbortControllerRef.current) {
      console.log('[loadTasks] Aborting previous request');
      loadAbortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    loadAbortControllerRef.current = abortController;
    const signal = abortController.signal;

    // Check if already loading
    if (isLoadingTasksRef.current) {
      const elapsedTime = Date.now() - loadingStartTimeRef.current;
      // If stuck for more than 30 seconds, force reset
      if (elapsedTime > 30000) {
        console.warn('[loadTasks] Refresh appears stuck (>30s), forcing reset');
        isLoadingTasksRef.current = false;
      } else {
        console.warn('[loadTasks] Refresh already in progress, skipping');
        return;
      }
    }

    isLoadingTasksRef.current = true;
    loadingStartTimeRef.current = Date.now();
    console.log('[loadTasks] Starting task refresh...');
    if (showLoading) {
      setLoading(true);
    }

    try {
      // Check if aborted before starting
      if (signal.aborted) {
        console.log('[loadTasks] Request aborted before starting');
        return;
      }

      const sessionData = localStorage.getItem('sproutify_session');
      const farmUuid = sessionData ? JSON.parse(sessionData).farmUuid : null;

      const gapPromise = farmUuid
        ? fetchOrderGapStatus(farmUuid, signal).catch((error) => {
            if (error.name === 'AbortError') {
              console.log('[loadTasks] Order gaps fetch aborted');
              return [];
            }
            console.error('[loadTasks] Error fetching order gaps:', error);
            return [];
          })
        : Promise.resolve<OrderGapStatus[]>([]);

      // Force refresh to bypass any caching - pass Date and forceRefresh flag
      // Add timeout to each promise to prevent hanging
      const timeoutPromise = <T,>(promise: Promise<T>, timeoutMs: number, defaultValue: T): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
          )
        ]).catch((error) => {
          if (error.name === 'AbortError') {
            console.log('[loadTasks] Request aborted');
            return defaultValue;
          }
          console.error('[loadTasks] Promise failed or timed out:', error);
          return defaultValue;
        });
      };

      // Increased timeouts to allow slow queries to complete
      const [tasksData, count, passiveStatus, orderGaps, overdueTasks] = await Promise.all([
        timeoutPromise(fetchDailyTasks(selectedDate, true, signal), 30000, []), // Increased to 30s
        timeoutPromise(getActiveTraysCount(signal), 20000, 0), // Increased to 20s
        timeoutPromise(fetchPassiveTrayStatus(signal), 20000, []), // Increased to 20s
        gapPromise,
        timeoutPromise(fetchOverdueSeedingTasks(7, signal), 20000, []), // Increased to 20s
      ]);

      // Check if aborted before updating state
      if (signal.aborted) {
        console.log('[loadTasks] Request aborted before state update');
        return;
      }
      
      // Update passive tray status
      setPassiveTrayStatus(passiveStatus);

      // Filter out gaps that have been removed by user action (prevents race condition)
      const filteredGaps = orderGaps.filter((g: OrderGapStatus) => !removedGapsRef.current.has(formatGapKey(g)));
      setOrderGapStatus(filteredGaps);

      // Log order gaps data for debugging
      const activeGaps = filteredGaps.filter((g: OrderGapStatus) => g.gap > 0);
      console.log('[DailyFlow Component] Order gaps status:', {
        totalGaps: orderGaps.length,
        activeGaps: activeGaps.length,
        gaps: activeGaps.map((g: OrderGapStatus) => ({
          customer: g.customer_name,
          product: g.product_name,
          gap: g.gap,
          deliveryDate: g.scheduled_delivery_date || g.delivery_date,
          missingVarieties: g.missing_varieties,
        })),
      });

      const atRiskTasks = tasksData.filter(t => t.action.toLowerCase().includes('at risk'));
      const atRiskCount = atRiskTasks.length;
      
      // Check specifically for Purple Basil in the fetched tasks
      const purpleBasilTasks = tasksData.filter(t => 
        (t.crop?.toLowerCase().includes('purple basil') || 
         t.action?.toLowerCase().includes('purple basil')) &&
        t.recipeId === 14
      );
      
      console.log('[DailyFlow Component] Loaded tasks:', {
        total: tasksData.length,
        prep: tasksData.filter(t => t.action === 'Soak' || t.action === 'Seed').length,
        harvest: tasksData.filter(t => t.action.toLowerCase().startsWith('harvest')).length,
        atRisk: atRiskCount,
        workflow: tasksData.filter(t => !t.action.toLowerCase().startsWith('harvest') && !t.action.toLowerCase().includes('at risk') && t.action !== 'Soak' && t.action !== 'Seed').length,
        passive: tasksData.filter(t => ['Germination', 'Blackout', 'Growing', 'Growing Phase'].includes(t.action) || ['Germination', 'Blackout', 'Growing', 'Growing Phase'].some(name => t.stepDescription?.includes(name))).length,
        purpleBasilInTasks: purpleBasilTasks.length,
        purpleBasilTasks: purpleBasilTasks.map(t => ({
          action: t.action,
          crop: t.crop,
          recipeId: t.recipeId,
          deliveryDate: t.deliveryDate,
          standingOrderId: t.standingOrderId,
          taskSource: t.taskSource,
          id: t.id
        })),
        atRiskTasks: atRiskTasks.map(t => ({
          action: t.action,
          crop: t.crop,
          recipeId: t.recipeId,
          deliveryDate: t.deliveryDate,
          standingOrderId: t.standingOrderId,
          taskSource: t.taskSource,
          id: t.id
        }))
      });
      
      // Update state - this will trigger re-render
      // Preserve tasks that are currently animating out (they'll be removed after animation completes)
      setTasks(prevTasks => {
        const animatingTaskIds = animatingOutRef.current;
        const newTasks = [...tasksData];
        
        // Keep animating tasks in the array so animation can complete
        const animatingTasks = prevTasks.filter(t => animatingTaskIds.has(t.id));
        const newTaskIds = new Set(newTasks.map(t => t.id));
        
        // Add animating tasks that aren't in the new data (they're being removed)
        const tasksToKeep = animatingTasks.filter(t => !newTaskIds.has(t.id));
        
        // Combine new tasks with animating tasks that should stay
        return [...newTasks, ...tasksToKeep];
      });
      setActiveTraysCount(count);

      // Update overdue seeding tasks (filter out skipped ones)
      setOverdueSeedingTasks(overdueTasks);
      console.log('[loadTasks] State updated with', tasksData.length, 'tasks,', overdueTasks.length, 'overdue seedings');
      
      // Load action history for at-risk tasks (only fetch if not already loaded)
      const atRiskTasksData = tasksData.filter(t => t.action.toLowerCase().includes('at risk'));
      atRiskTasksData.forEach(task => {
        if (task.standingOrderId && task.deliveryDate) {
          // Fetch asynchronously (function will check if already loaded)
          fetchActionHistory(task);
        }
      });

      // Load available soaked seed
      // Note: available_soaked_seed view already filters by status='available', so we don't need to filter again
      if (farmUuid) {
        try {
          const soakedSeedPromise = getSupabaseClient()
            .from('available_soaked_seed')
            .select('*')
            .eq('farm_uuid', farmUuid)
            .order('expires_at', { ascending: true });

          // Add timeout to prevent hanging
          const result = await Promise.race([
            soakedSeedPromise,
            new Promise<{ data: null; error: any }>((resolve) =>
              setTimeout(() => resolve({ data: null, error: { message: 'Query timeout' } }), 5000)
            )
          ]);

          const { data: soakedSeedData, error } = result;

          if (error) {
            console.error('[DailyFlow] Error fetching available soaked seed:', error);
            setAllAvailableSoakedSeed([]);
          } else {
            const filtered = (soakedSeedData || []).filter((item: any) => (item.quantity_remaining ?? 0) > 0);
            setAllAvailableSoakedSeed(filtered);
          }
        } catch (error) {
          console.error('[DailyFlow] Unexpected error fetching available soaked seed:', error);
          setAllAvailableSoakedSeed([]);
        }
      } else {
        setAllAvailableSoakedSeed([]);
      }
    } catch (error) {
      console.error('[loadTasks] Error loading tasks:', error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
      isLoadingTasksRef.current = false;
      console.log('[loadTasks] Refresh completed, flag cleared');
    }
  }, [selectedDate, fetchActionHistory]);

  // Cleanup effect to ensure ref is reset and requests are aborted if component unmounts
  useEffect(() => {
    return () => {
      if (loadAbortControllerRef.current) {
        console.log('[loadTasks] Component unmounting, aborting in-flight requests');
        loadAbortControllerRef.current.abort();
      }
      if (isLoadingTasksRef.current) {
        console.warn('[loadTasks] Component unmounting with refresh in progress, clearing flag');
        isLoadingTasksRef.current = false;
      }
    };
  }, []);

  // Abort stale requests when tab visibility changes to prevent zombie connections
  useEffect(() => {
    let visibilityTimeout: ReturnType<typeof setTimeout> | null = null;
    
    const handleVisibilityChange = () => {
      // Clear any pending visibility timeout
      if (visibilityTimeout) {
        clearTimeout(visibilityTimeout);
        visibilityTimeout = null;
      }
      
      if (document.visibilityState === 'hidden') {
        // Tab is being hidden - abort any in-flight requests to prevent stale connections
        if (loadAbortControllerRef.current) {
          console.log('[loadTasks] Tab hidden, aborting in-flight requests to prevent stale connections');
          loadAbortControllerRef.current.abort();
          loadAbortControllerRef.current = null;
        }
        // Reset loading state since we aborted
        if (isLoadingTasksRef.current) {
          isLoadingTasksRef.current = false;
          loadingStartTimeRef.current = 0;
        }
      } else if (document.visibilityState === 'visible') {
        // Tab is now visible - trigger a fresh load after a longer delay
        // Only trigger if we're not already loading
        console.log('[loadTasks] Tab visible, scheduling fresh load if not already loading');
        visibilityTimeout = setTimeout(() => {
          // Double-check we're not already loading before triggering
          if (!isLoadingTasksRef.current) {
            loadTasks({ suppressLoading: true });
          } else {
            console.log('[loadTasks] Skipping visibility load - already loading');
          }
        }, 2000); // Increased delay to 2 seconds to allow session refresh + any ongoing loads to complete
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (visibilityTimeout) {
        clearTimeout(visibilityTimeout);
      }
    };
  }, [loadTasks]);

  // Auto-recovery: Check periodically if we're stuck and force reset
  useEffect(() => {
    let recoveryTimeout: ReturnType<typeof setTimeout> | null = null;
    
    const recoveryInterval = setInterval(() => {
      if (isLoadingTasksRef.current) {
        const elapsedTime = Date.now() - loadingStartTimeRef.current;
        // Increased threshold to 60 seconds to account for slow queries
        if (elapsedTime > 60000) {
          console.error('[loadTasks] STUCK STATE DETECTED - Auto-recovering after', elapsedTime, 'ms');
          
          // Abort any in-flight requests first
          if (loadAbortControllerRef.current) {
            console.log('[loadTasks] Aborting stuck request');
            loadAbortControllerRef.current.abort();
            loadAbortControllerRef.current = null;
          }
          
          isLoadingTasksRef.current = false;
          loadingStartTimeRef.current = 0;
          
          // Clear any existing recovery timeout
          if (recoveryTimeout) {
            clearTimeout(recoveryTimeout);
          }
          
          // Trigger a fresh load after a delay, but only once
          recoveryTimeout = setTimeout(() => {
            // Only attempt recovery if we're still not loading
            if (!isLoadingTasksRef.current) {
              console.log('[loadTasks] Attempting recovery load');
              loadTasks({ suppressLoading: true });
            } else {
              console.log('[loadTasks] Skipping recovery load - already loading');
            }
            recoveryTimeout = null;
          }, 2000);
        }
      }
    }, 15000); // Check every 15 seconds (less frequent)
    
    return () => {
      clearInterval(recoveryInterval);
      if (recoveryTimeout) {
        clearTimeout(recoveryTimeout);
      }
    };
  }, [loadTasks]);

  useEffect(() => {
    loadTasks();
    // Refresh every 5 minutes, but only if not currently loading
    const interval = setInterval(() => {
      if (!isLoadingTasksRef.current) {
        loadTasks({ suppressLoading: true });
      } else {
        console.log('[loadTasks] Skipping interval refresh - already loading');
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadTasks]);

  // ✅ OPTIMIZED: Single function that fetches all gap data once (no loops!)
  useEffect(() => {
    updateAllGapData(orderGapStatus);
  }, [orderGapStatus, updateAllGapData]);

  const handleAssignTray = useCallback(async () => {
    if (!assignModalGap || !selectedAssignTrayId) return;
    setIsAssigningTray(true);
    try {
      const success = await assignTrayToCustomer(selectedAssignTrayId, assignModalGap.customer_id);
      if (success) {
        showNotification('success', 'Tray assigned successfully');
        closeAssignModal();
        await loadTasks({ suppressLoading: true });
      } else {
        showNotification('error', 'Failed to assign tray');
      }
    } catch (error) {
      console.error('[DailyFlow] Error assigning tray:', error);
      showNotification('error', 'Failed to assign tray');
    } finally {
      setIsAssigningTray(false);
    }
  }, [assignModalGap, selectedAssignTrayId, closeAssignModal, loadTasks, showNotification]);

  const handleAssignNearestTray = useCallback(async () => {
    if (!nearReadyTrayModal) return;
    const { gap, tray } = nearReadyTrayModal;
    if (!gap.customer_id) {
      showNotification('error', 'Missing customer for this gap');
      return;
    }

    setIsTrayModalProcessing(true);
    try {
      const success = await assignTrayToCustomer(tray.tray_id, gap.customer_id);
      if (success) {
        showNotification('success', `Tray ${tray.tray_id} assigned to ${gap.customer_name}`);
        setNearReadyTrayModal(null);
        await loadTasks({ suppressLoading: true });
      } else {
        showNotification('error', 'Failed to assign tray');
      }
    } catch (error) {
      console.error('[DailyFlow] Error assigning near-ready tray:', error);
      showNotification('error', 'Failed to assign tray');
    } finally {
      setIsTrayModalProcessing(false);
    }
  }, [nearReadyTrayModal, loadTasks, showNotification]);

  const handleSkipDelivery = useCallback(async (gap: OrderGapStatus) => {
    if (!gap.standing_order_id) {
      showNotification('error', 'Missing standing order details for this gap');
      return;
    }

    const deliveryDate = gap.scheduled_delivery_date || gap.delivery_date;
    if (!deliveryDate) {
      showNotification('error', 'Missing delivery date for this gap');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      showNotification('error', 'Session expired. Please log in again.');
      return;
    }

    try {
      const { error } = await supabase
        .from('order_schedules')
        .update({ status: 'skipped' })
        .eq('standing_order_id', gap.standing_order_id)
        .eq('scheduled_delivery_date', deliveryDate);

      if (error) throw error;
      const formattedDate = new Date(deliveryDate).toLocaleDateString();
      showNotification('success', `Delivery skipped for ${gap.customer_name || 'customer'} on ${formattedDate}`);
      await loadTasks({ suppressLoading: true });
    } catch (error: any) {
      console.error('[DailyFlow] Error skipping delivery:', error);
      showNotification('error', error?.message || 'Failed to skip delivery');
    }
  }, [loadTasks, showNotification]);

  // Open confirmation dialog for reallocation actions
  const openReallocationConfirm = useCallback(async (
    gap: OrderGapStatus,
    tray: MismatchedAssignedTray,
    action: 'harvestEarly' | 'keepForFuture' | 'cancel'
  ) => {
    console.log('[DailyFlow] openReallocationConfirm called:', {
      action,
      gap: { customer_name: gap.customer_name, product_name: gap.product_name, standing_order_id: gap.standing_order_id },
      tray: tray ? { tray_id: tray.tray_id, recipe_id: tray.recipe_id, variety_name: tray.variety_name, tray_step_id: tray.tray_step_id } : null,
    });

    if (!tray) {
      console.error('[DailyFlow] openReallocationConfirm called with null/undefined tray');
      showNotification('error', 'No tray data available for this action');
      return;
    }

    let nextDeliveryDate: string | null = null;

    // For harvest early, fetch the next delivery date that will lose coverage
    if (action === 'harvestEarly' && gap.standing_order_id) {
      const supabase = getSupabaseClient();
      if (supabase) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split('T')[0];

        const { data } = await supabase
          .from('order_schedules')
          .select('scheduled_delivery_date')
          .eq('standing_order_id', gap.standing_order_id)
          .gt('scheduled_delivery_date', todayStr)
          .eq('status', 'pending')
          .order('scheduled_delivery_date', { ascending: true })
          .limit(1);

        if (data && data.length > 0) {
          nextDeliveryDate = data[0].scheduled_delivery_date;
        }
      }
    }

    setGapReallocationConfirm({ gap, tray, action, nextDeliveryDate });
  }, [showNotification]);

  // Execute the confirmed reallocation action with animation
  const handleReallocationConfirm = useCallback(async () => {
    if (!gapReallocationConfirm) return;

    const { gap, tray, action } = gapReallocationConfirm;
    const gapKey = formatGapKey(gap);

    // Close dialog first
    setGapReallocationConfirm(null);

    const supabase = getSupabaseClient();
    if (!supabase) {
      showNotification('error', 'Session expired. Please log in again.');
      return;
    }

    const deliveryDate = gap.scheduled_delivery_date || gap.delivery_date;

    try {
      let success = false;
      let message = '';

      if (action === 'harvestEarly') {
        // Update harvest step scheduled_date to today
        success = await updateHarvestStepToToday(tray.tray_step_id);
        if (success) {
          message = `Tray #${tray.tray_id} harvest moved to today`;
        }
      } else if (action === 'keepForFuture' || action === 'cancel') {
        if (!gap.standing_order_id || !deliveryDate) {
          showNotification('error', 'Missing order details');
          return;
        }

        const notes = action === 'keepForFuture'
          ? 'Keeping tray for future delivery'
          : 'Cancelled by user';

        const { error } = await supabase
          .from('order_schedules')
          .update({ status: 'skipped', notes })
          .eq('standing_order_id', gap.standing_order_id)
          .eq('scheduled_delivery_date', deliveryDate);

        if (!error) {
          success = true;
          message = action === 'keepForFuture'
            ? `Skipped today - tray kept for ${new Date(tray.harvest_date).toLocaleDateString()}`
            : `Delivery cancelled for ${gap.customer_name || 'customer'}`;
        }
      }

      if (success) {
        showNotification('success', message);

        // Track this gap as removed to prevent race conditions with pending fetches
        removedGapsRef.current.add(gapKey);

        // Clear from tracking after 10 seconds (database should be synced by then)
        setTimeout(() => {
          removedGapsRef.current.delete(gapKey);
        }, 10000);

        // Only animate out for actions that truly resolve the gap
        // "harvestEarly" doesn't skip the delivery, so the gap may persist in a different form
        if (action === 'keepForFuture' || action === 'cancel') {
          setAnimatingOutGaps(prev => new Set(prev).add(gapKey));

          // Optimistically remove the gap from state
          setOrderGapStatus(prev => prev.filter(g => formatGapKey(g) !== gapKey));

          // Wait for animation (300ms matches CSS duration-300), then reload
          setTimeout(async () => {
            await loadTasks({ suppressLoading: true });
            // Clear animation AFTER data is reloaded
            setAnimatingOutGaps(prev => {
              const next = new Set(prev);
              next.delete(gapKey);
              return next;
            });
          }, 300);
        } else {
          // For harvestEarly, optimistically remove the gap and reload
          // The tray will appear in harvest section
          setOrderGapStatus(prev => prev.filter(g => formatGapKey(g) !== gapKey));
          await loadTasks({ suppressLoading: true });
        }
      } else {
        showNotification('error', 'Action failed. Please try again.');
      }
    } catch (error: any) {
      console.error('[DailyFlow] Error in reallocation action:', error);
      showNotification('error', error?.message || 'Action failed');
    }
  }, [gapReallocationConfirm, loadTasks, showNotification]);

  const handleHarvestNearestTray = useCallback(async () => {
    if (!nearReadyTrayModal) return;
    setIsTrayModalProcessing(true);
    try {
      const success = await harvestTrayNow(nearReadyTrayModal.tray.tray_id);
      if (success) {
        showNotification('success', `Tray ${nearReadyTrayModal.tray.tray_id} marked as harvested`);
        setNearReadyTrayModal(null);
        await loadTasks({ suppressLoading: true });
      } else {
        showNotification('error', 'Failed to harvest tray');
      }
    } catch (error) {
      console.error('[DailyFlow] Error harvesting near-ready tray:', error);
      showNotification('error', 'Failed to harvest tray');
    } finally {
      setIsTrayModalProcessing(false);
    }
  }, [nearReadyTrayModal, loadTasks, showNotification]);

  const openNearReadyTrayDetail = useCallback(() => {
    if (!nearReadyTrayModal) return;
    setNearReadyTrayModal(null);
    navigate(`/trays/${nearReadyTrayModal.tray.tray_id}`);
  }, [nearReadyTrayModal, navigate]);

  const [errorDialog, setErrorDialog] = useState<{
    show: boolean;
    message: string;
    title: string;
  }>({ show: false, message: '', title: 'Error' });

  const showErrorDialog = (title: string, message: string) => {
    setErrorDialog({ show: true, message, title });
  };

  // Fetch available substitutes for substitute action
  const fetchAvailableSubstitutes = async (task: DailyTask) => {
    if (!task.deliveryDate) return;
    
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      
      const { farmUuid } = JSON.parse(sessionData);
      
      if (!getSupabaseClient()) return;
      
      const { data } = await getSupabaseClient()
        .from('order_fulfillment_status')
        .select('recipe_id, recipe_name, variety_name, trays_ready, harvest_date')
        .eq('farm_uuid', farmUuid)
        .neq('recipe_id', task.recipeId)
        .gte('trays_ready', 1);
      
      if (data && task.deliveryDate) {
        // Filter by harvest_date <= delivery_date
        const filtered = data.filter((item: any) => {
          if (!item.harvest_date) return false;
          return item.harvest_date <= (task.deliveryDate || '');
        });
        setAvailableSubstitutes(filtered);
      }
    } catch (error) {
      console.error('Error fetching available substitutes:', error);
    }
  };

  const handleAtRiskTask = (task: DailyTask, actionType?: FulfillmentActionType) => {
    // Open Manage Order dialog for at-risk tasks
    setManageOrderDialog(task);
    if (actionType) {
      setFulfillmentAction(actionType);
      // Fetch action history when opening dialog
      fetchActionHistory(task);
      // Fetch substitutes if substitute action
      if (actionType === 'substitute') {
        fetchAvailableSubstitutes(task);
      }
    }
  };

  const handleComplete = async (task: DailyTask, yieldValue?: number, batchId?: number, taskDate?: string) => {
    // Prevent at-risk tasks from being marked as done - they must use Manage Order
    if (task.action.toLowerCase().includes('at risk')) {
      handleAtRiskTask(task);
      return;
    }
    
    // For harvest tasks, open the harvest dialog instead of completing directly
    if (task.action.toLowerCase().startsWith('harvest') && !task.action.toLowerCase().includes('at risk') && yieldValue === undefined) {
      setHarvestingTask(task);
      setHarvestYield('');
      setHarvestSelectedTrayIds([]);
      return;
    }

    // For soak tasks, open the soak dialog instead of completing directly
    if (task.action === 'Soak' && task.taskSource === 'soak_request') {
      setSoakTask(task);
      setSelectedBatchId(null);
      setAvailableBatches([]);
      setSoakQuantityGrams('');
      // Default soak date to the selected date in Daily Flow (the task's scheduled date)
      setSoakDate(selectedDate.toISOString().split('T')[0]);

      // Fetch available batches for this recipe
      // fetchAvailableBatchesForRecipe will handle fetching recipe_id from request if needed
      await fetchAvailableBatchesForRecipe(task);
      return;
    }

    // For seed tasks, open the seeding dialog instead of completing directly
    // Handle both seed_request and planting_schedule seeding tasks
    if (task.action === 'Seed' && (task.taskSource === 'seed_request' || task.taskSource === 'planting_schedule')) {
      console.log('[DailyFlow] Opening seeding dialog for task:', {
        id: task.id,
        taskSource: task.taskSource,
        recipeId: task.recipeId,
        requestId: task.requestId,
        crop: task.crop,
        currentIsSoakVariety: isSoakVariety, // Log current state before reset
      });
      // IMPORTANT: Set dialog not ready to prevent button clicks during transition
      setSeedingDialogReady(false);
      // Reset all state BEFORE opening the dialog to prevent stale state flash
      setIsSoakVariety(false);
      setAvailableSoakedSeed(null);
      setSelectedBatchId(null);
      setAvailableBatches([]);
      setSeedQuantityCompleted('');
      setMissedStepForSeeding(null);
      // Now open the dialog AFTER state is reset
      setSeedingTask(task);
      console.log('[DailyFlow] State reset complete, dialog should now open with isSoakVariety=false');

      // For planting_schedule tasks, we need to fetch batches using recipeId directly
      if (task.taskSource === 'planting_schedule' && task.recipeId) {
        console.log('[DailyFlow] Fetching batches for planting_schedule task with recipeId:', task.recipeId);

        // Check if recipe has soak step FIRST, before fetching batches
        const { data: hasSoakData } = await getSupabaseClient().rpc('recipe_has_soak', {
          p_recipe_id: task.recipeId
        });

        const hasSoak = hasSoakData && hasSoakData[0]?.has_soak;
        setIsSoakVariety(hasSoak || false);

        if (hasSoak) {
          // Soak variety - check for available soaked seed by variety_id (not recipe_id)
          // First get the variety_id from the recipe
          const { data: recipeData } = await getSupabaseClient()
            .from('recipes')
            .select('variety_id, variety_name')
            .eq('recipe_id', task.recipeId)
            .single();

          if (recipeData?.variety_id) {
            const sessionData = localStorage.getItem('sproutify_session');
            if (sessionData) {
              const { farmUuid } = JSON.parse(sessionData);
              const { data: soakedSeedData } = await getSupabaseClient()
                .from('available_soaked_seed')
                .select('*')
                .eq('farm_uuid', farmUuid)
                .eq('variety_id', recipeData.variety_id)
                .gt('quantity_remaining', 0)
                .order('soak_date', { ascending: true })
                .limit(1);

              if (soakedSeedData && soakedSeedData.length > 0) {
                setAvailableSoakedSeed(soakedSeedData[0]);
              }
              // If no soaked seed available, dialog will show "no soaked seed" UI
            }
          }
        } else {
          // Non-soak variety - fetch available batches for this recipe
          await fetchAvailableBatchesForRecipe(task);
        }
        // Mark dialog as ready for interaction after all async operations complete
        setSeedingDialogReady(true);
        console.log('[DailyFlow] Seeding dialog ready for interaction');
        return;
      }
      
      // For seed_request tasks, check if this is a soak variety and fetch relevant data
      if (task.requestId) {
        const { data: requestData } = await getSupabaseClient()
          .from('tray_creation_requests')
          .select('recipe_id')
          .eq('request_id', task.requestId)
          .single();

        if (requestData) {
          // Check if recipe has soak step
          const { data: hasSoakData } = await getSupabaseClient().rpc('recipe_has_soak', {
            p_recipe_id: requestData.recipe_id
          });

          const hasSoak = hasSoakData && hasSoakData[0]?.has_soak;
          setIsSoakVariety(hasSoak || false);

          if (hasSoak) {
            // Soak variety - check for available soaked seed by variety_id (NOT request_id)
            // First get the variety_id from the recipe
            const { data: recipeData } = await getSupabaseClient()
              .from('recipes')
              .select('variety_id, variety_name')
              .eq('recipe_id', requestData.recipe_id)
              .single();

            if (recipeData?.variety_id) {
              const sessionData = localStorage.getItem('sproutify_session');
              if (sessionData) {
                const { farmUuid } = JSON.parse(sessionData);
                const { data: soakedSeedData } = await getSupabaseClient()
                  .from('available_soaked_seed')
                  .select('*')
                  .eq('farm_uuid', farmUuid)
                  .eq('variety_id', recipeData.variety_id)
                  .gt('quantity_remaining', 0)
                  .order('soak_date', { ascending: true })
                  .limit(1);

                if (soakedSeedData && soakedSeedData.length > 0) {
                  setAvailableSoakedSeed(soakedSeedData[0]);
                }
                // If no soaked seed available, dialog will show "no soaked seed" UI
              }
            }
          } else {
            // Non-soak variety - need batch selection
            await fetchAvailableBatchesForRecipe(task);
          }
        }
        // Mark dialog as ready for interaction after all async operations complete
        setSeedingDialogReady(true);
        console.log('[DailyFlow] Seeding dialog ready for interaction (seed_request path)');
      }
      return;
    }

    // Only add to completingIds if not already there (prevent duplicate calls)
    // Note: handleSeedingConfirm already adds it, so this is a safeguard for direct calls
    // Check current state first (synchronous check)
    if (completingIds.has(task.id)) {
      console.log('[DailyFlow] Task already in completingIds, skipping duplicate handleComplete call');
      return;
    }
    
    // Add to completingIds
    setCompletingIds(prev => new Set(prev).add(task.id));
    
    try {
      const success = await completeTask(task, yieldValue, batchId, taskDate);
      if (success) {
        // Start exit animation
        animatingOutRef.current.add(task.id);
        setAnimatingOut(prev => new Set(prev).add(task.id));
        
        // Show formatted success notification
        const yieldText = yieldValue ? ` - ${yieldValue}g yield` : '';
        showNotification('success', `${task.action} completed for ${task.trays} ${task.trays === 1 ? 'tray' : 'trays'} (${task.batchId})${yieldText}`);

        // Wait for animation to complete, then remove task
        setTimeout(() => {
          setTasks(prev => prev.filter(t => t.id !== task.id));
          animatingOutRef.current.delete(task.id);
          setAnimatingOut(prev => {
            const next = new Set(prev);
            next.delete(task.id);
            return next;
          });
          
          // Only reload for tasks that might affect other tasks or counts
          // (Harvest changes active tray count, Seed creates new trays)
          // For simple tasks like Water, just remove from state
          const needsReload = task.action === 'Harvest' || task.action === 'Seed' || task.action === 'Soak';
          if (needsReload) {
            // Reload tasks after animation to get updated counts and new tasks
            setTimeout(async () => {
              await loadTasks({ suppressLoading: true });
            }, 100);
          }
        }, 300); // Animation duration
      } else {
        showNotification('error', 'Failed to complete task. Please try again.');
      }
    } catch (error: any) {
      console.error('Error completing task:', error);
      const errorMessage = error?.message || 'Failed to complete task. Please try again.';
      
      // Show error dialog for critical errors (like insufficient seed)
      if (error?.code === 'P0001' || errorMessage.includes('Not enough seed') || errorMessage.includes('insufficient')) {
        showErrorDialog('Insufficient Seed', errorMessage);
      } else {
        showNotification('error', errorMessage);
      }
    } finally {
      setCompletingIds(prev => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  const resetBatchHarvestState = () => {
    setBatchHarvestRows([]);
    setBatchHarvestSelected({});
    setBatchHarvestYields({});
  };

  const closeHarvestDialog = () => {
    setHarvestingTask(null);
    setHarvestSelectedTrayIds([]);
    setHarvestYield('');
  };

  const enrichBatchHarvestRowsWithVariety = useCallback(
    async (rows: BatchHarvestRow[]): Promise<BatchHarvestRow[]> => {
      if (rows.length === 0) return rows;
      const missingRecipeIds = Array.from(
        new Set(
          rows
            .map((row) => row.recipeId)
            .filter((id): id is number => !!id && !recipeVarietyCacheRef.current[id])
        )
      );

      if (missingRecipeIds.length > 0) {
        const farmUuid = getFarmUuidFromSession();
        if (farmUuid) {
          try {
            const { data: recipesData, error: recipesError } = await getSupabaseClient()
              .from('recipes')
              .select('recipe_id, variety_id, variety_name, varieties(name)')
              .in('recipe_id', missingRecipeIds)
              .eq('farm_uuid', farmUuid);

            if (!recipesError && recipesData) {
              const updatedCache = { ...recipeVarietyCacheRef.current };
              recipesData.forEach((recipe: any) => {
                if (!recipe?.recipe_id) return;
                const varietyNameFromRelation = resolveVarietyNameFromRelation(recipe.varieties);
                const varietyName = varietyNameFromRelation || recipe.variety_name;
                if (varietyName) {
                  updatedCache[recipe.recipe_id] = varietyName;
                }
              });
              recipeVarietyCacheRef.current = updatedCache;
            } else if (recipesError) {
              console.error('[DailyFlow] Error fetching recipe varieties for batch harvest modal:', recipesError);
            }
          } catch (error) {
            console.error('[DailyFlow] Error loading variety names for batch harvest modal:', error);
          }
        }
      }

      return rows.map((row) => ({
        ...row,
        varietyName:
          row.varietyName || (row.recipeId ? recipeVarietyCacheRef.current[row.recipeId] : undefined),
      }));
    },
    [getFarmUuidFromSession]
  );

  const openBatchHarvestModal = async (group: HarvestGroup) => {
    const rowsMap = new Map<number, BatchHarvestRow>();
    group.tasks.forEach((task) => {
      task.trayIds.forEach((trayId) => {
        if (!rowsMap.has(trayId)) {
          rowsMap.set(trayId, {
            trayId,
            crop: task.crop,
            batchId: task.batchId,
            taskId: task.id,
            recipeId: task.recipeId,
            varietyName: (task as HasRecipeInfo).variety_name ?? undefined,
          });
        }
      });
    });

    const rows = Array.from(rowsMap.values());
    let rowsWithDetails = rows;
    const trayIds = rows.map((row) => row.trayId);
    if (trayIds.length > 0) {
      const farmUuid = getFarmUuidFromSession();
      if (farmUuid) {
        try {
          const { data: trayDetails, error: trayDetailsError } = await getSupabaseClient()
            .from('trays')
            .select('tray_id, sow_date, created_by')
            .in('tray_id', trayIds)
            .eq('farm_uuid', farmUuid);

          if (!trayDetailsError && trayDetails) {
            const detailMap = new Map<number, any>();
            trayDetails.forEach((detail: any) => {
              if (detail?.tray_id) {
                detailMap.set(detail.tray_id, detail);
              }
            });
            rowsWithDetails = rowsWithDetails.map((row) => {
              const detail = detailMap.get(row.trayId);
              return {
                ...row,
                sowDate: detail?.sow_date ?? row.sowDate ?? null,
                seededBy: detail?.created_by ?? row.seededBy ?? null,
              };
            });
          } else if (trayDetailsError) {
            console.error('[DailyFlow] Error fetching tray details for batch harvest modal:', trayDetailsError);
          }
        } catch (error) {
          console.error('[DailyFlow] Unexpected error fetching tray details for batch harvest modal:', error);
        }
      }
    }
    const initialSelected: Record<number, boolean> = {};
    const initialYields: Record<number, string> = {};

    rows.forEach((row) => {
      initialSelected[row.trayId] = false;
      initialYields[row.trayId] = '';
    });

    setBatchHarvestRows(rowsWithDetails);
    setBatchHarvestSelected(initialSelected);
    setBatchHarvestYields(initialYields);
    setBatchHarvestModalGroup(group);

    try {
      const enrichedRows = await enrichBatchHarvestRowsWithVariety(rowsWithDetails);
      setBatchHarvestRows(enrichedRows);
    } catch (error) {
      console.error('[DailyFlow] Error enriching batch harvest rows:', error);
    }
  };

  const closeBatchHarvestModal = async () => {
    // If there are pending early harvest trays, revert their dates
    if (pendingEarlyHarvestTrays.length > 0) {
      try {
        for (const { trayStepId, originalDate } of pendingEarlyHarvestTrays) {
          await updateHarvestStepDate(trayStepId, originalDate);
        }
        showNotification('info', 'Harvest cancelled. Tray dates reverted.');
        // Reload tasks to reflect the reverted dates
        void loadTasks({ suppressLoading: true });
      } catch (error) {
        console.error('[closeBatchHarvestModal] Error reverting dates:', error);
        showNotification('error', 'Failed to revert harvest dates');
      }
      setPendingEarlyHarvestTrays([]);
    }
    resetBatchHarvestState();
    setBatchHarvestModalGroup(null);
  };

  // Get mismatched trays for a harvest group (same customer, matching products)
  // Only returns the MINIMUM trays needed to fill gaps, not all mismatched trays
  const getMismatchedTraysForGroup = useCallback((group: HarvestGroup): MismatchedAssignedTray[] => {
    if (!group.customerName) return [];

    // Get customer ID from the first task
    const customerId = group.tasks[0]?.customerId;
    if (!customerId) return [];

    // Find gaps for this customer to determine how many trays are actually needed
    const customerGaps = activeOrderGaps.filter(gap => gap.customer_id === customerId);

    // For each gap, get only the minimum trays needed
    const selectedTrays: MismatchedAssignedTray[] = [];

    for (const gap of customerGaps) {
      const gapKey = `${gap.customer_id}-${gap.product_id}`;
      const mismatchedForGap = gapMismatchedTrays[gapKey] || [];

      if (mismatchedForGap.length === 0) continue;

      // Group trays by recipe_id to handle variety-specific needs
      const traysByRecipe = new Map<number, MismatchedAssignedTray[]>();
      for (const tray of mismatchedForGap) {
        const existing = traysByRecipe.get(tray.recipe_id) || [];
        existing.push(tray);
        traysByRecipe.set(tray.recipe_id, existing);
      }

      // For each recipe, take only the trays needed (gap count, typically 1 per variety)
      // Sort by harvest date (earliest first) to minimize impact on future deliveries
      for (const [_recipeId, trays] of traysByRecipe) {
        // Sort by harvest date - earliest dates first (closest to ready)
        const sorted = [...trays].sort((a, b) => {
          const dateA = new Date(a.harvest_date).getTime();
          const dateB = new Date(b.harvest_date).getTime();
          return dateA - dateB;
        });

        // For a mix product, we need 1 tray per variety
        // For single products, we might need more (based on gap)
        // Use gap count as the max, but typically it's 1 per recipe/variety
        const traysNeeded = gap.is_mix ? 1 : Math.min(gap.gap, sorted.length);
        const selected = sorted.slice(0, traysNeeded);
        selectedTrays.push(...selected);
      }
    }

    return selectedTrays;
  }, [gapMismatchedTrays, activeOrderGaps]);

  // Open the early harvest confirmation modal
  const openEarlyHarvestConfirm = useCallback((group: HarvestGroup) => {
    const mismatchedTrays = getMismatchedTraysForGroup(group);
    const readyVarieties = group.tasks.map(t => t.crop);

    setEarlyHarvestConfirm({
      group,
      mismatchedTrays,
      readyVarieties,
    });
  }, [getMismatchedTraysForGroup]);

  // Process early harvest: update harvest dates for mismatched trays, then open batch harvest modal
  const handleConfirmEarlyHarvest = useCallback(async () => {
    if (!earlyHarvestConfirm) return;

    const { group, mismatchedTrays } = earlyHarvestConfirm;

    setIsProcessingEarlyHarvest(true);
    try {
      // Store original dates for potential revert
      const pendingTrays = mismatchedTrays.map(tray => ({
        trayStepId: tray.tray_step_id,
        originalDate: tray.harvest_date,
      }));
      setPendingEarlyHarvestTrays(pendingTrays);

      // Update all mismatched trays to harvest today
      for (const tray of mismatchedTrays) {
        await updateHarvestStepToToday(tray.tray_step_id);
      }

      // Build enhanced group with early harvest trays included
      // Create synthetic tasks for the early harvest trays
      const earlyHarvestTasks: DailyTask[] = mismatchedTrays.map(tray => ({
        id: `early-harvest-${tray.tray_id}`,
        action: `Harvest ${tray.variety_name || tray.recipe_name}`,
        crop: tray.variety_name || tray.recipe_name,
        batchId: 'Early',
        location: 'N/A',
        dayCurrent: 0,
        dayTotal: 0,
        trays: 1,
        status: 'urgent' as const,
        trayIds: [tray.tray_id],
        recipeId: tray.recipe_id,
        taskSource: 'tray_step' as const,
        quantity: 1,
        customerName: group.customerName,
        customerId: tray.customer_id,
        deliveryDate: group.deliveryDate,
      }));

      // Create enhanced group with both ready and early harvest trays
      const enhancedGroup: HarvestGroup = {
        ...group,
        tasks: [...group.tasks, ...earlyHarvestTasks],
      };

      // Close confirmation modal
      setEarlyHarvestConfirm(null);

      showNotification('success', 'Harvest dates updated. Ready to complete order.');

      // Open the batch harvest modal with the enhanced group
      void openBatchHarvestModal(enhancedGroup);
    } catch (error) {
      console.error('[handleConfirmEarlyHarvest] Error:', error);
      showNotification('error', 'Failed to update harvest dates');
      setPendingEarlyHarvestTrays([]);
    } finally {
      setIsProcessingEarlyHarvest(false);
    }
  }, [earlyHarvestConfirm, showNotification]);

  const handleRecordBatchHarvest = async () => {
    if (!batchHarvestModalGroup) return;

    const selectedTrayIds = batchHarvestRows
      .filter((row) => batchHarvestSelected[row.trayId])
      .map((row) => row.trayId);

    if (selectedTrayIds.length === 0) {
      showNotification('error', 'Select at least one tray to harvest');
      return;
    }

    setIsBatchHarvesting(true);
    console.log('[DailyFlow] Batch harvest started', { selectedTrayIds });
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) {
        showNotification('error', 'Session expired. Please reload the page.');
        return;
      }

      const { farmUuid } = JSON.parse(sessionData);
      const client = getSupabaseClient();
      if (!client) {
        throw new Error('Supabase client not initialized');
      }

      const now = new Date().toISOString();

      for (const trayId of selectedTrayIds) {
        console.log('[DailyFlow] Updating tray', trayId);
        const payload: Record<string, any> = { harvest_date: now, status: 'harvested' };
        const yieldInput = batchHarvestYields[trayId];
        if (yieldInput && yieldInput.trim() !== '') {
          const parsed = parseFloat(yieldInput);
          if (!Number.isNaN(parsed)) {
            payload.yield = parsed;
          }
        }

        const { error } = await client
          .from('trays')
          .update(payload)
          .eq('tray_id', trayId)
          .eq('farm_uuid', farmUuid);

        if (error) {
          throw error;
        }
        console.log('[DailyFlow] Tray update succeeded', { trayId });
      }

      console.log('[DailyFlow] Updating tray_steps for', selectedTrayIds);
      const { error: stepsError } = await client
        .from('tray_steps')
        .update({
          completed: true,
          completed_at: new Date().toISOString(),
          status: 'Completed',
        })
        .in('tray_id', selectedTrayIds);

      if (stepsError) throw stepsError;
      console.log('[DailyFlow] tray_steps update succeeded');

      // Mark order_schedules as completed if this is for a standing order
      if (batchHarvestModalGroup.customerName && batchHarvestModalGroup.deliveryDate) {
        // Get standing_order_id from the first task in the group
        const standingOrderId = batchHarvestModalGroup.tasks[0]?.standingOrderId;
        
        if (standingOrderId) {
          console.log('[DailyFlow] Marking order_schedule as completed:', {
            standing_order_id: standingOrderId,
            delivery_date: batchHarvestModalGroup.deliveryDate,
            customer: batchHarvestModalGroup.customerName
          });

          const { error: scheduleError } = await client
            .from('order_schedules')
            .update({ 
              status: 'completed'
            })
            .eq('standing_order_id', standingOrderId)
            .eq('scheduled_delivery_date', batchHarvestModalGroup.deliveryDate);

          if (scheduleError) {
            console.error('[DailyFlow] Error marking order_schedule as completed:', scheduleError);
            // Don't throw - harvest was successful, just log the error
          } else {
            console.log('[DailyFlow] order_schedule marked as completed successfully');
          }
        } else {
          console.log('[DailyFlow] No standing_order_id found, skipping order_schedule update');
        }
      } else {
        console.log('[DailyFlow] Unassigned harvest - no order_schedule to update');
      }

      const orderLabel = batchHarvestModalGroup.customerName || 'this order';
      showNotification(
        'success',
        `Harvested ${selectedTrayIds.length} ${selectedTrayIds.length === 1 ? 'tray' : 'trays'} for ${orderLabel}`
      );

      // Clear pending early harvest trays (don't revert dates on successful harvest)
      setPendingEarlyHarvestTrays([]);

      console.log('[DailyFlow] Calling loadTasks');
      await loadTasks({ suppressLoading: true });
      closeBatchHarvestModal();
    } catch (error) {
      console.error('[DailyFlow] Batch harvest error:', error);
      showNotification('error', 'Failed to record batch harvest. Please try again.');
    } finally {
      setIsBatchHarvesting(false);
    }
  };

  const handleHarvestConfirm = async () => {
    if (!harvestingTask) return;

    if (harvestSelectedTrayIds.length === 0) {
      showNotification('error', 'Select at least one tray to harvest');
      return;
    }

    const yieldValue = harvestYield ? parseFloat(harvestYield) : undefined;
    const taskToComplete: DailyTask = {
      ...harvestingTask,
      trayIds: harvestSelectedTrayIds,
    };

    closeHarvestDialog();
    await handleComplete(taskToComplete, yieldValue);
  };

  const fetchAvailableBatchesForRecipe = async (task: DailyTask) => {
    setLoadingBatches(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) {
        setAvailableBatches([]);
        return;
      }

      const { farmUuid } = JSON.parse(sessionData);

      // Get recipe_id and variety_name from request if task has requestId, otherwise use task.recipeId
      let recipeId = task.recipeId;
      let requestRecipeName: string | null = null;
      let requestVarietyName: string | null = null;
      
      if (task.requestId && (!recipeId || recipeId === 0)) {
        const { data: requestData, error: requestError } = await getSupabaseClient()
          .from('tray_creation_requests')
          .select('recipe_id, recipe_name, variety_name')
          .eq('request_id', task.requestId)
          .maybeSingle();
        
        if (requestError) {
          console.error('[DailyFlow] Error fetching request:', requestError);
          setAvailableBatches([]);
          return;
        } else if (requestData) {
          if (requestData.recipe_id) {
            recipeId = requestData.recipe_id;
            console.log('[DailyFlow] Fetched recipe_id from request:', recipeId);
          }
          if (requestData.recipe_name) {
            requestRecipeName = requestData.recipe_name;
          }
          if (requestData.variety_name) {
            requestVarietyName = requestData.variety_name;
          }
        } else {
          console.error('[DailyFlow] Request found but no recipe_id:', { requestId: task.requestId, requestData });
          setAvailableBatches([]);
          return;
        }
      }

      console.log('[DailyFlow] Fetching recipe:', { recipeId, farmUuid, requestVarietyName });

      // Fetch recipe to get variety_id and seed_quantity
      // First try with is_active filter (active recipes)
      let { data: recipeData, error: recipeError } = await getSupabaseClient()
        .from('recipes')
        .select('recipe_id, recipe_name, variety_id, variety_name, seed_quantity, seed_quantity_unit, is_active')
        .eq('recipe_id', recipeId)
        .eq('farm_uuid', farmUuid)
        .maybeSingle();

      // If not found, try without is_active filter (in case recipe is inactive)
      if (!recipeData && !recipeError) {
        console.log('[DailyFlow] Recipe not found as active, checking if it exists as inactive...');
        const { data: inactiveRecipe, error: inactiveError } = await getSupabaseClient()
          .from('recipes')
          .select('recipe_id, recipe_name, variety_id, variety_name, seed_quantity, seed_quantity_unit, is_active')
          .eq('recipe_id', recipeId)
          .eq('farm_uuid', farmUuid)
          .maybeSingle();
        
        if (inactiveRecipe) {
          console.warn('[DailyFlow] Recipe found but is inactive:', inactiveRecipe);
          recipeData = inactiveRecipe;
          recipeError = null;
        } else if (inactiveError) {
          recipeError = inactiveError;
        }
      }

      // If recipe not found, try to find variety by name from request and fetch batches directly
      let varietyId: number | null = null;
      let varietyName: string = '';
      let seedQuantityPerTray = 0;
      let totalSeedNeeded = 0;

      if (recipeData) {
        // Recipe found - use its data
        varietyId = recipeData.variety_id;
        varietyName = recipeData.variety_name || '';
        
        // Calculate seed quantity needed per tray (convert to grams)
        if (recipeData.seed_quantity) {
          const unit = recipeData.seed_quantity_unit || 'grams';
          seedQuantityPerTray = unit === 'oz' ? recipeData.seed_quantity * 28.35 : recipeData.seed_quantity;
        }
        totalSeedNeeded = seedQuantityPerTray * task.trays;
      } else if (requestVarietyName) {
        // Recipe not found, but we have variety_name from request - try to find variety by name
        console.log('[DailyFlow] Recipe not found, trying to find variety by name:', requestVarietyName);
        const { data: varietyData, error: varietyError } = await getSupabaseClient()
          .from('varieties')
          .select('varietyid, name, seed_quantity_grams')
          .ilike('name', requestVarietyName)
          .maybeSingle();
        
        if (varietyData) {
          varietyId = varietyData.varietyid;
          varietyName = varietyData.name || requestVarietyName;
          // Get seed_quantity_grams from variety
          seedQuantityPerTray = varietyData.seed_quantity_grams || 0;
          console.log('[DailyFlow] Found variety by name:', { varietyId, varietyName, seedQuantityPerTray });
        } else {
          console.error('[DailyFlow] Variety not found by name:', { varietyName: requestVarietyName, error: varietyError });
          const recipeName = requestRecipeName || `Recipe ID ${recipeId}`;
          showNotification('error', `Recipe "${recipeName}" not found and variety "${requestVarietyName}" not found. Please check your data.`);
          setAvailableBatches([]);
          return;
        }
      } else {
        // No recipe and no variety_name - can't proceed
        const recipeName = requestRecipeName || `Recipe ID ${recipeId}`;
        console.error('[DailyFlow] Recipe not found and no variety_name available:', { recipeId, farmUuid, task, requestRecipeName });
        showNotification('error', `Recipe "${recipeName}" (ID: ${recipeId}) not found for your farm. The recipe may have been deleted.`);
        setAvailableBatches([]);
        return;
      }

      if (!varietyId) {
        console.error('[DailyFlow] No variety_id found');
        showNotification('error', 'Could not determine variety for this recipe. Please check your recipe configuration.');
        setAvailableBatches([]);
        return;
      }

      // Query available batches by variety_id (not recipe_id)
      // Prefer the inventory view which already normalizes units/trays_possible
      const traysNeeded = Math.max(1, task.trays || 0);
      console.log('[DailyFlow] Fetching batches for variety_id:', varietyId, { traysNeeded, totalSeedNeeded });

      const inventorySelect = `
        batchid,
        quantity,
        unit,
        lot_number,
        purchasedate,
        varietyid,
        trays_possible,
        quantity_grams
      `;

      let batchesData: any[] | null = null;
      let usedInventoryView = false;

      const { data: inventoryData, error: inventoryError } = await getSupabaseClient()
        .from('seed_inventory_status')
        .select(inventorySelect)
        .eq('farm_uuid', farmUuid)
        .eq('varietyid', varietyId)
        .gte('trays_possible', traysNeeded)
        .order('purchasedate', { ascending: true });

      if (!inventoryError) {
        batchesData = inventoryData || [];
        usedInventoryView = true;
        console.log('[DailyFlow] seed_inventory_status returned batches:', {
          varietyId,
          traysNeeded,
          count: batchesData.length
        });
      } else {
        console.warn('[DailyFlow] seed_inventory_status query failed, falling back to seedbatches:', inventoryError);
      }

      if (!usedInventoryView) {
        const { data: fallbackBatches, error: fallbackError } = await getSupabaseClient()
          .from('seedbatches')
          .select(`
            batchid,
            quantity,
            unit,
            lot_number,
            purchasedate,
            varietyid
          `)
          .eq('farm_uuid', farmUuid)
          .eq('varietyid', varietyId)
          .gt('quantity', 0)
          .order('purchasedate', { ascending: true });

        if (fallbackError) {
          console.error('[DailyFlow] Error fetching batches:', fallbackError);
          setAvailableBatches([]);
          return;
        }

        let filteredBatches = fallbackBatches || [];
        if (totalSeedNeeded > 0) {
          filteredBatches = filteredBatches.filter((batch: any) => {
            const batchGrams = convertQuantityValueToGrams(batch.quantity, batch.unit);
            return batchGrams === null || batchGrams >= totalSeedNeeded;
          });
        }

        batchesData = filteredBatches;
        console.log('[DailyFlow] Fallback seedbatches query returned batches:', {
          varietyId,
          traysNeeded,
          count: batchesData.length
        });
      }

      // Fetch variety name and seed_quantity_grams if we don't have them yet
      // Always fetch seed_quantity_grams from variety if we don't have it from recipe
      if (varietyId) {
        const { data: varietyData } = await getSupabaseClient()
          .from('varieties')
          .select('name, seed_quantity_grams')
          .eq('varietyid', varietyId)
          .maybeSingle();
        if (varietyData) {
          if (!varietyName) {
            varietyName = varietyData.name || varietyName;
          }
          // Use variety's seed_quantity_grams if recipe didn't provide one or if it's 0
          if (seedQuantityPerTray === 0 && varietyData.seed_quantity_grams) {
            seedQuantityPerTray = varietyData.seed_quantity_grams;
          }
        }
      }

      const dataSource = usedInventoryView ? 'seed_inventory_status' : 'seedbatches';
      console.log('[DailyFlow] Found batches:', { 
        source: dataSource,
        count: batchesData?.length || 0, 
        varietyId, 
        varietyName,
        traysNeeded,
        totalSeedNeeded,
        batches: batchesData 
      });

      // Format batches for display
  const formattedBatches = (batchesData || []).map((batch: any) => {
        const rawBatchId =
          batch.batchid ??
          batch.batch_id ??
          batch.id ??
          batch.batchId ??
          batch.BatchId ??
          null;
        const numericBatchId =
          rawBatchId === null || rawBatchId === undefined
            ? null
            : Number(rawBatchId);
        const resolvedBatchId =
          numericBatchId !== null && Number.isFinite(numericBatchId)
            ? numericBatchId
            : null;

        return {
          batchid: resolvedBatchId,
          batch_id: resolvedBatchId,
          batchId: resolvedBatchId,
          quantity: Number(batch.quantity).toFixed(2),
          unit: batch.unit,
          lot_number: batch.lot_number || null,
          purchasedate: batch.purchasedate,
          variety_name: batch.variety,
          trays_possible: batch.trays_possible ?? null,
          quantity_grams:
            batch.quantity_grams ??
            convertQuantityValueToGrams(batch.quantity, batch.unit) ??
            0,
        };
      });

    console.log('[DailyFlow] Normalized batches:', formattedBatches);

      if (formattedBatches.length === 0) {
        console.warn('[DailyFlow] No batches found for variety:', { varietyId, varietyName, farmUuid });
        showNotification('error', `No seed batches found for variety "${varietyName}". Please add a batch first.`);
      }

      console.log('[DailyFlow] Setting availableBatches:', formattedBatches.map((batch) => ({
        batchid: batch.batchid,
        batch_id: batch.batch_id,
      })));
      setAvailableBatches(formattedBatches);
      if (
        formattedBatches.length === 1 &&
        formattedBatches[0].batchid !== null &&
        formattedBatches[0].batchid !== undefined
      ) {
        setSelectedBatchId(formattedBatches[0].batchid);
        console.log('[DailyFlow] Auto-selected batch for single result:', formattedBatches[0].batchid);
      }
      setSeedQuantityPerTray(seedQuantityPerTray); // Store for use in modal
    } catch (error) {
      console.error('[DailyFlow] Error in fetchAvailableBatchesForRecipe:', error);
      setAvailableBatches([]);
    } finally {
      setLoadingBatches(false);
    }
  };

  const handleSoakConfirm = async () => {
    if (!soakTask || !selectedBatchId) {
      showNotification('error', 'Please select a seed batch');
      return;
    }

    if (!soakQuantityGrams || parseFloat(soakQuantityGrams) <= 0) {
      showNotification('error', 'Please enter a valid quantity in grams');
      return;
    }

    // Must have either requestId or recipeId
    if (!soakTask.requestId && !soakTask.recipeId) {
      showNotification('error', 'Invalid soak task - missing request ID or recipe ID');
      return;
    }

    // Prevent double-clicks
    if (isSubmittingSeeding.current) {
      return;
    }

    isSubmittingSeeding.current = true;
    setCompletingIds(prev => new Set(prev).add(soakTask!.id));

    try {
      const quantityGrams = parseFloat(soakQuantityGrams);
      // Use the user-selected soak date from the date picker
      const taskDateStr = soakDate;

      let soakedSeedId: number;

      if (soakTask.requestId) {
        // Use original function for tasks with requestId
        soakedSeedId = await completeSoakTask(
          soakTask.requestId,
          selectedBatchId,
          quantityGrams,
          taskDateStr
        );
      } else if (soakTask.recipeId) {
        // Use new function for planting_schedule tasks (recipeId only)
        soakedSeedId = await completeSoakTaskByRecipe(
          soakTask.recipeId,
          selectedBatchId,
          quantityGrams,
          taskDateStr
        );
      } else {
        throw new Error('No request ID or recipe ID found');
      }

      showNotification('success', `Soak task completed! Soaked seed ID: ${soakedSeedId}`);
      
      // Close dialog and reload tasks
      setSoakTask(null);
      setSelectedBatchId(null);
      setAvailableBatches([]);
      setSoakQuantityGrams('');
      
      // Reload tasks to show updated status
      setTimeout(async () => {
        await loadTasks({ suppressLoading: true });
      }, 100);
    } catch (error: any) {
      console.error('Error completing soak task:', error);
      const errorMessage = error?.message || 'Failed to complete soak task';
      showNotification('error', errorMessage);
    } finally {
      isSubmittingSeeding.current = false;
      setCompletingIds(prev => {
        const next = new Set(prev);
        next.delete(soakTask?.id || '');
        return next;
      });
    }
  };

  const handleCancelRequest = async () => {
    if (!cancelRequestDialog || isCancellingRequest) return;

    setIsCancellingRequest(true);
    try {
      await cancelSeedingRequest(
        cancelRequestDialog.task.requestId!,
        cancelRequestDialog.reason
      );
      showNotification('success', 'Request cancelled successfully');
      setCancelRequestDialog(null);
      setTimeout(() => loadTasks({ suppressLoading: true }), 100);
    } catch (error: any) {
      console.error('Error cancelling request:', error);
      showNotification('error', error?.message || 'Failed to cancel request');
    } finally {
      setIsCancellingRequest(false);
    }
  };

  const handleRescheduleRequest = async () => {
    if (!rescheduleRequestDialog) return;

    try {
      // Get original date from request
      const { data: requestData } = await getSupabaseClient()
        .from('tray_creation_requests')
        .select('seed_date')
        .eq('request_id', rescheduleRequestDialog.task.requestId!)
        .single();

      const originalDate = requestData?.seed_date || new Date().toISOString();

      await rescheduleSeedingRequest(
        rescheduleRequestDialog.task.requestId!,
        rescheduleRequestDialog.newDate,
        originalDate
      );
      showNotification('success', 'Request rescheduled successfully');
      setRescheduleRequestDialog(null);
      setTimeout(() => loadTasks({ suppressLoading: true }), 100);
    } catch (error: any) {
      console.error('Error rescheduling request:', error);
      showNotification('error', error?.message || 'Failed to reschedule request');
    }
  };

  const handleFulfillmentAction = async () => {
    if (!manageOrderDialog || !fulfillmentAction) return;

    setIsProcessingFulfillment(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) {
        showNotification('error', 'Session expired. Please log in again.');
        return;
      }

      const { farmUuid, userId } = JSON.parse(sessionData);

      // Call RPC function directly
      const response = await recordFulfillmentAction({
        p_farm_uuid: farmUuid,
        p_standing_order_id: manageOrderDialog.standingOrderId || 0,
        p_delivery_date: manageOrderDialog.deliveryDate || '',
        p_recipe_id: manageOrderDialog.recipeId,
        p_action_type: fulfillmentAction,
        p_notes: fulfillmentNotes || null,
        p_original_quantity: manageOrderDialog.traysNeeded || null,
        p_fulfilled_quantity: fulfillmentAction === 'partial' ? parseInt(fulfillmentQuantity) || null : null,
        p_substitute_recipe_id: selectedSubstitute || null,
        p_created_by: userId || null,
      });

      console.log('[handleFulfillmentAction] RPC response:', response);
      
      if (response.success) {
        const actionLabel = fulfillmentAction === 'contacted' ? 'Contacted customer' :
                           fulfillmentAction === 'note' ? 'Note added' :
                           fulfillmentAction === 'skip' ? 'Skipped' :
                           fulfillmentAction === 'substitute' ? 'Substituted' : 'Action recorded';
        
        showNotification('success', `${manageOrderDialog.crop} ${actionLabel}`);
        
        // Refresh action history for this item
        if (manageOrderDialog.standingOrderId && manageOrderDialog.deliveryDate) {
          fetchActionHistory(manageOrderDialog);
        }
        
        // If resolved, animate out the card instead of reloading
        if (response.resolved) {
          console.log('[handleFulfillmentAction] Item resolved, animating out...');
          console.log('[handleFulfillmentAction] RPC response details:', {
            success: response.success,
            resolved: response.resolved,
            action_id: response.action_id,
            schedule_id: response.schedule_id
          });
          console.log('[handleFulfillmentAction] Skipped item details:', {
            recipeId: manageOrderDialog.recipeId,
            deliveryDate: manageOrderDialog.deliveryDate,
            standingOrderId: manageOrderDialog.standingOrderId,
            crop: manageOrderDialog.crop,
            actionType: fulfillmentAction
          });
          
          // Close dialog first so UI updates immediately
          setManageOrderDialog(null);
          setFulfillmentAction('');
          setFulfillmentNotes('');
          setFulfillmentQuantity('');
          setSelectedSubstitute(null);
          setAvailableSubstitutes([]);
          
          // Find the task that matches the resolved item
          const taskToRemove = tasks.find(t => 
            t.recipeId === manageOrderDialog.recipeId &&
            t.deliveryDate === manageOrderDialog.deliveryDate &&
            t.standingOrderId === manageOrderDialog.standingOrderId &&
            t.action.toLowerCase().includes('at risk')
          );
          
          if (taskToRemove) {
            // Start exit animation
            setAnimatingOut(prev => new Set(prev).add(taskToRemove.id));
            
            // Wait for animation to complete, then remove from tasks
            setTimeout(() => {
              setTasks(prev => prev.filter(t => t.id !== taskToRemove.id));
              setAnimatingOut(prev => {
                const next = new Set(prev);
                next.delete(taskToRemove.id);
                return next;
              });
              console.log('[handleFulfillmentAction] Task removed after animation');
            }, 500); // Match animation duration
          } else {
            // Fallback: if task not found, do a minimal reload (only at-risk tasks)
            console.log('[handleFulfillmentAction] Task not found in state, doing minimal reload...');
            // Only reload at-risk tasks, not the entire page
            const nonAtRiskTasks = tasks.filter(t => !t.action.toLowerCase().includes('at risk'));
            
            // Reload only at-risk tasks
            const sessionData = localStorage.getItem('sproutify_session');
            const farmUuid = sessionData ? JSON.parse(sessionData).farmUuid : null;
            if (farmUuid) {
            fetchDailyTasks(selectedDate, true).then((tasksData) => {
                const newAtRiskTasks = tasksData.filter(t => t.action.toLowerCase().includes('at risk'));
                setTasks([...nonAtRiskTasks, ...newAtRiskTasks]);
                }).catch((error) => {
                console.error('[handleFulfillmentAction] Error reloading at-risk tasks:', error);
                // Fallback to full reload on error
                loadTasks({ suppressLoading: true });
              });
            }
          }
        } else {
          console.log('[handleFulfillmentAction] Item NOT resolved - action logged but item remains at-risk');
          // Close dialog and reset state even if not resolved
          setManageOrderDialog(null);
          setFulfillmentAction('');
          setFulfillmentNotes('');
          setFulfillmentQuantity('');
          setSelectedSubstitute(null);
          setAvailableSubstitutes([]);
        }
      }
    } catch (error: any) {
      console.error('Error recording fulfillment action:', error);
      showNotification('error', error?.message || 'Failed to record fulfillment action');
      // Keep dialog open on error so user can retry
    } finally {
      setIsProcessingFulfillment(false);
    }
  };

  const handleSeedingConfirm = async () => {
    if (!seedingTask) {
      showNotification('error', 'Invalid seeding task');
      return;
    }

    if (!seedQuantityCompleted || parseInt(seedQuantityCompleted) <= 0) {
      showNotification('error', 'Please enter a valid quantity of trays to seed');
      return;
    }

    // Prevent double-clicks and duplicate submissions using ref (synchronous check)
    if (isSubmittingSeeding.current) {
      console.log('[DailyFlow] Seeding already in progress, ignoring duplicate call');
      return;
    }

    // Also check completingIds as a secondary safeguard
    if (completingIds.has(seedingTask.id)) {
      console.log('[DailyFlow] Task already in completingIds, ignoring duplicate call');
      return;
    }

    // Prevent double-clicks
    if (isSubmittingSeeding.current) {
      return;
    }

    // Check if batch is required (for non-soak varieties)
    // For soak varieties, batch_id should be null
    let batchIdToUse: number | null = null;
    if (selectedBatchId !== null && selectedBatchId !== undefined) {
      batchIdToUse = selectedBatchId;
    }
    console.log('[DailyFlow] handleSeedingConfirm batchIdToUse before validation:', batchIdToUse);

    // Determine recipe ID and check if this is a soak variety
    let recipeId: number | undefined;
    let isSoakVariety = false;
    
    if (seedingTask.taskSource === 'planting_schedule') {
      // For planting_schedule tasks, use recipeId directly
      recipeId = seedingTask.recipeId;
      if (recipeId) {
        const { data: hasSoak } = await getSupabaseClient().rpc('recipe_has_soak', {
          p_recipe_id: recipeId
        });
        
        isSoakVariety = hasSoak && hasSoak[0]?.has_soak;
      }
    } else if (seedingTask.requestId) {
      // For seed_request tasks, get recipe_id from request
      const { data: requestData } = await getSupabaseClient()
        .from('tray_creation_requests')
        .select('recipe_id')
        .eq('request_id', seedingTask.requestId)
        .single();
      
      if (requestData) {
        recipeId = requestData.recipe_id;
        const { data: hasSoak } = await getSupabaseClient().rpc('recipe_has_soak', {
          p_recipe_id: recipeId
        });
        
        isSoakVariety = hasSoak && hasSoak[0]?.has_soak;
      }
    }

    // Validate that we have what we need
    if (seedingTask.taskSource === 'planting_schedule' && !recipeId) {
      showNotification('error', 'Invalid seed task - missing recipe ID');
      return;
    }

    if (seedingTask.taskSource === 'seed_request' && !seedingTask.requestId) {
      showNotification('error', 'Invalid seed task - missing request ID');
      return;
    }

    if (!isSoakVariety && batchIdToUse == null) {
      showNotification('error', 'Please select a seed batch for non-soak varieties');
      return;
    }

    isSubmittingSeeding.current = true;
    setCompletingIds(prev => new Set(prev).add(seedingTask.id));

    const missedStepRef = missedStepForSeeding;
    const quantityToComplete = parseInt(seedQuantityCompleted);
    const batchIdForTask = batchIdToUse ?? undefined;
    
    // Get task date - use original sowDate for overdue tasks, otherwise today
    // This ensures the completion matches what fetchOverdueSeedingTasks checks
    let taskDateStr: string;
    if (seedingTask.isOverdue && seedingTask.sowDate) {
      taskDateStr = seedingTask.sowDate;
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      taskDateStr = today.toISOString().split('T')[0];
    }
    try {
      let traysCreated = 0;
      
      if (seedingTask.taskSource === 'planting_schedule') {
        // For planting_schedule tasks, use completeTask which creates trays directly
        // Create a modified task with the quantity to complete
        const taskToComplete: DailyTask = {
          ...seedingTask,
          trays: quantityToComplete,
        };
        
        
        console.log('[DailyFlow] Calling completeTask with batchId:', batchIdForTask);
        const success = await completeTask(taskToComplete, undefined, batchIdForTask, taskDateStr);
        if (success) {
          traysCreated = quantityToComplete;
        } else {
          throw new Error('Failed to complete seeding task');
        }
      } else {
        // For seed_request tasks, use completeSeedTask
        traysCreated = await completeSeedTask(
          seedingTask.requestId!,
          quantityToComplete,
          batchIdToUse,
          undefined,
          seedingTask.recipeId,
          taskDateStr,
          seedingTask.trayIds
        );
      }

      showNotification('success', `Seeding completed! Created ${traysCreated} ${traysCreated === 1 ? 'tray' : 'trays'}`);
      
      // Close dialog and clear state on success
      setSeedingTask(null);
      setMissedStepForSeeding(null);
      setSelectedBatchId(null);
      setAvailableBatches([]);
      setSeedQuantityCompleted('');
      
      // If this was triggered from a missed step, mark it as completed
      if (missedStepRef) {
        const success = await completeMissedStep(missedStepRef.step);
        if (success) {
          console.log('[DailyFlow] Marked missed seeding step as completed');
        }
      }

      // Animate out the completed seeding task immediately
      if (seedingTask) {
        // Store the task ID and details for checking after animation
        const completedTaskId = seedingTask.id;
        const completedRequestId = seedingTask.requestId;
        const completedRecipeId = seedingTask.recipeId;
        const completedTaskSource = seedingTask.taskSource;
        const wasOverdue = seedingTask.isOverdue;
        
        // Start exit animation immediately - this must happen before any async operations
        // to ensure the animation starts right away
        animatingOutRef.current.add(completedTaskId);
        setAnimatingOut(prev => new Set(prev).add(completedTaskId));
        
        // Wait for animation to complete, then remove and sync with backend
        setTimeout(async () => {
          // Remove task from array after animation
          setTasks(prev => prev.filter(t => t.id !== completedTaskId));

          // Also remove from overdue seeding tasks if this was an overdue task
          if (wasOverdue) {
            setOverdueSeedingTasks(prev => prev.filter(t => t.id !== completedTaskId));
          }
          
          // Remove from animating set and ref
          animatingOutRef.current.delete(completedTaskId);
          setAnimatingOut(prev => {
            const next = new Set(prev);
            next.delete(completedTaskId);
            return next;
          });
          
          // Update active tray count since seeding creates new trays
          await getActiveTraysCount().then(count => {
            setActiveTraysCount(count);
          }).catch(error => {
            console.error('[DailyFlow] Error updating active tray count:', error);
          });
          
          // Reload only seeding tasks to check if task is fully completed or partially completed
          // This ensures we sync with backend state without full page reload
          const sessionData = localStorage.getItem('sproutify_session');
          const farmUuid = sessionData ? JSON.parse(sessionData).farmUuid : null;
          if (farmUuid) {
            try {
              const allTasks = await fetchDailyTasks(selectedDate, true);
              const seedTasks = allTasks.filter(t => 
                t.action === 'Seed' && 
                ((completedTaskSource === 'seed_request' && t.requestId === completedRequestId) ||
                 (completedTaskSource === 'planting_schedule' && t.recipeId === completedRecipeId))
              );
              
              // If there's a matching task from the reload (partial completion), add it back
              // Otherwise, the task is fully completed and should stay gone
              if (seedTasks.length > 0) {
                setTasks(prev => {
                  const existingIds = new Set(prev.map(t => t.id));
                  const newSeedTasks = seedTasks.filter(t => !existingIds.has(t.id));
                  return [...prev, ...newSeedTasks];
                });
              }
            } catch (error) {
              console.error('[DailyFlow] Error syncing seeding tasks:', error);
              // Task already removed, so no action needed
            }
          }
        }, 500); // Match animation duration
      }
    } catch (error: any) {
      console.error('[DailyFlow] Error in handleSeedingConfirm:', error);
      const errorMessage = error?.message || 'Failed to complete seeding task';
      showNotification('error', errorMessage);
      if (missedStepRef) {
        setMissedStepForSeeding(missedStepRef);
      }
    } finally {
      isSubmittingSeeding.current = false;
      setCompletingIds(prev => {
        const next = new Set(prev);
        next.delete(seedingTask?.id || '');
        return next;
      });
    }
  };

  const handleViewDetails = (task: DailyTask) => {
    setViewingTask(task);
  };

  const handleMarkAsLost = (task: DailyTask) => {
    setLostTask(task);
    setLossReason('');
    setLossNotes('');
  };

  const handleLostConfirm = async () => {
    if (!lostTask || !lossReason) return;

    setCompletingIds(prev => new Set(prev).add(lostTask.id));
    try {
      const success = await markTraysAsLost(lostTask.trayIds, lossReason, lossNotes);
      if (success) {
        setTasks(prev => prev.filter(t => t.id !== lostTask.id));
        const reasonLabel = LOSS_REASONS.find(r => r.value === lossReason)?.label || lossReason;
        showNotification('success', `Marked ${lostTask.trays} ${lostTask.trays === 1 ? 'tray' : 'trays'} as lost (${reasonLabel})`);
        setLostTask(null);
        setTimeout(() => loadTasks({ suppressLoading: true }), 500);
      } else {
        showNotification('error', 'Failed to mark trays as lost. Please try again.');
      }
    } catch (error) {
      console.error('Error marking trays as lost:', error);
      showNotification('error', 'Failed to mark trays as lost. Please try again.');
    } finally {
      setCompletingIds(prev => {
        const next = new Set(prev);
        next.delete(lostTask.id);
        return next;
      });
    }
  };

  const handleUseSoakedSeed = async () => {
    if (!useSoakedSeedDialog || !useSoakedSeedQuantity || parseInt(useSoakedSeedQuantity) <= 0) {
      showNotification('error', 'Please enter a valid quantity of trays');
      return;
    }

    try {
      const quantityTrays = parseInt(useSoakedSeedQuantity);
      // eslint-disable-next-line react-hooks/rules-of-hooks -- This is a service function, not a React hook
      const traysCreated = await useLeftoverSoakedSeed(
        useSoakedSeedDialog.soaked_id,
        quantityTrays,
        useSoakedSeedDialog.request_id || null
      );

      showNotification('success', `Created ${traysCreated} ${traysCreated === 1 ? 'tray' : 'trays'} from leftover soaked seed`);
      setUseSoakedSeedDialog(null);
      setUseSoakedSeedQuantity('');
      setTimeout(() => loadTasks({ suppressLoading: true }), 500);
    } catch (error: any) {
      console.error('Error using soaked seed:', error);
      const errorMessage = error?.message || 'Failed to use soaked seed';
      showNotification('error', errorMessage);
    }
  };

  const handleDiscardSoakedSeed = async () => {
    if (!discardSoakedSeedDialog) return;

    try {
      const success = await discardSoakedSeed(
        discardSoakedSeedDialog.soaked_id,
        discardReason
      );

      if (success) {
        showNotification('success', 'Soaked seed discarded successfully');
        setDiscardSoakedSeedDialog(null);
        setDiscardReason('expired');
        setTimeout(() => loadTasks({ suppressLoading: true }), 500);
      } else {
        showNotification('error', 'Failed to discard soaked seed');
      }
    } catch (error: any) {
      console.error('Error discarding soaked seed:', error);
      const errorMessage = error?.message || 'Failed to discard soaked seed';
      showNotification('error', errorMessage);
    }
  };

  const handleSkip = async (task: DailyTask) => {
    if (!confirm(`Skip this ${task.action} task for ${task.trays} tray(s)? This will mark it as skipped and move to the next step.`)) {
      return;
    }

    setCompletingIds(prev => new Set(prev).add(task.id));
    try {
      const success = await skipTask(task);
      if (success) {
        // Start exit animation
        animatingOutRef.current.add(task.id);
        setAnimatingOut(prev => new Set(prev).add(task.id));
        showNotification('success', `Skipped ${task.action} for ${task.trays} ${task.trays === 1 ? 'tray' : 'trays'}`);

        // Wait for animation, then remove and reload
        setTimeout(() => {
          setTasks(prev => prev.filter(t => t.id !== task.id));
          animatingOutRef.current.delete(task.id);
          setAnimatingOut(prev => {
            const next = new Set(prev);
            next.delete(task.id);
            return next;
          });
          setTimeout(() => loadTasks({ suppressLoading: true }), 100);
        }, 300);
      } else {
        showNotification('error', 'Failed to skip task. Please try again.');
      }
    } catch (error) {
      console.error('Error skipping task:', error);
      showNotification('error', 'Failed to skip task. Please try again.');
    } finally {
      setCompletingIds(prev => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  // Handler for skipping overdue seeding tasks (local skip - removes from view for this session)
  const handleSkipOverdueSeeding = (task: DailyTask) => {
    if (!confirm(`Skip this overdue seeding for ${task.crop}? You decided not to seed for this delivery.`)) {
      return;
    }
    setSkippedOverdueTasks(prev => new Set(prev).add(task.id));
    showNotification('success', `Skipped overdue seeding for ${task.crop}`);
  };

  // Handler for seeding an overdue task (opens the seeding dialog)
  const handleSeedOverdueTask = async (task: DailyTask) => {
    // IMPORTANT: Set dialog not ready to prevent button clicks during transition
    setSeedingDialogReady(false);
    // Reset all state BEFORE opening the dialog to prevent stale state flash
    setIsSoakVariety(false);
    setAvailableSoakedSeed(null);
    setSelectedBatchId(null);
    setAvailableBatches([]);
    setSeedQuantityCompleted('');
    setMissedStepForSeeding(null);
    // Now open the dialog AFTER state is reset
    setSeedingTask(task);
    setLoadingBatches(true);

    // Check if recipe requires soaking FIRST, before fetching dry batches
    if (task.recipeId) {
      const { data: hasSoakData } = await getSupabaseClient().rpc('recipe_has_soak', {
        p_recipe_id: task.recipeId
      });

      const hasSoak = hasSoakData && hasSoakData[0]?.has_soak;
      setIsSoakVariety(hasSoak || false);

      if (hasSoak) {
        // Soak variety - check for available soaked seed by variety_id
        const { data: recipeData } = await getSupabaseClient()
          .from('recipes')
          .select('variety_id, variety_name')
          .eq('recipe_id', task.recipeId)
          .single();

        if (recipeData?.variety_id) {
          const sessionData = localStorage.getItem('sproutify_session');
          if (sessionData) {
            const { farmUuid } = JSON.parse(sessionData);
            const { data: soakedSeedData } = await getSupabaseClient()
              .from('available_soaked_seed')
              .select('*')
              .eq('farm_uuid', farmUuid)
              .eq('variety_id', recipeData.variety_id)
              .gt('quantity_remaining', 0)
              .order('soak_date', { ascending: true })
              .limit(1);

            if (soakedSeedData && soakedSeedData.length > 0) {
              setAvailableSoakedSeed(soakedSeedData[0]);
            }
            // If no soaked seed available, dialog will show "no soaked seed" UI
            // with options to start soaking, reschedule, or cancel
          }
        } else {
          showNotification('error', 'Could not determine variety for this recipe.');
          setSeedingTask(null);
          setLoadingBatches(false);
          setSeedingDialogReady(true);
          return;
        }
        setLoadingBatches(false);
        setSeedingDialogReady(true);
        return;
      }
    }

    // Non-soak variety - fetch available batches for this recipe
    await fetchAvailableBatchesForRecipe(task);
    setSeedingDialogReady(true);
  };

  const handleSkipMissed = async (_task: DailyTask, missedStep: MissedStep) => {
    try {
      const success = await skipMissedStep(missedStep);
      if (success) {
      showNotification('success', `Skipped "${missedStep.description}" (Day ${missedStep.expectedDay})`);
      await loadTasks({ suppressLoading: true });
      } else {
        showNotification('error', 'Failed to skip step. Please try again.');
      }
    } catch {
      showNotification('error', 'Failed to skip step. Please try again.');
    }
  };

  const handleCompleteMissed = async (task: DailyTask, missedStep: MissedStep) => {
    // Check if this is a seeding step - if so, always open seeding dialog
    const isSeedingStep = (missedStep.description || missedStep.stepName || '').toLowerCase().includes('seed');

    if (isSeedingStep) {
      // IMPORTANT: Set dialog not ready to prevent button clicks during transition
      setSeedingDialogReady(false);
      // Reset all state BEFORE opening the dialog to prevent stale state flash
      setIsSoakVariety(false);
      setAvailableSoakedSeed(null);
      setSelectedBatchId(null);
      setAvailableBatches([]);

      // For missed seeding steps, always open the seeding dialog
      // Create a temporary task object for the seeding dialog
      const seedingTaskObj: DailyTask = {
        id: `missed-seeding-${missedStep.stepId}`,
        action: 'Seed',
        crop: task.crop,
        batchId: 'New',
        location: task.location || 'Growing Area',
        dayCurrent: 0,
        dayTotal: 0,
        trays: 1, // Default to 1 tray, user can adjust if needed
        status: 'urgent',
        trayIds: [],
        recipeId: task.recipeId,
        stepDescription: missedStep.description || missedStep.stepName,
      };

      // Now open the dialog AFTER state is reset
      setSeedingTask(seedingTaskObj);
      // Set default quantity to remaining
      const remaining = (seedingTaskObj.quantity || 0) - (seedingTaskObj.quantityCompleted || 0);
      setSeedQuantityCompleted(remaining.toString());
      // Track the missed step so we can mark it as completed after seeding
      setMissedStepForSeeding({ task, step: missedStep });

      // Check if soak variety and fetch data - use recipeId directly (more reliable than requestId)
      const recipeIdToCheck = seedingTaskObj.recipeId || task.recipeId;
      if (recipeIdToCheck) {
        const { data: hasSoakData } = await getSupabaseClient().rpc('recipe_has_soak', {
          p_recipe_id: recipeIdToCheck
        });

        const hasSoak = hasSoakData && hasSoakData[0]?.has_soak;
        setIsSoakVariety(hasSoak || false);

        if (hasSoak) {
          // Soak variety - check for available soaked seed by variety_id
          const { data: recipeData } = await getSupabaseClient()
            .from('recipes')
            .select('variety_id, variety_name')
            .eq('recipe_id', recipeIdToCheck)
            .single();

          if (recipeData?.variety_id) {
            const sessionData = localStorage.getItem('sproutify_session');
            if (sessionData) {
              const { farmUuid } = JSON.parse(sessionData);
              const { data: soakedSeedData } = await getSupabaseClient()
                .from('available_soaked_seed')
                .select('*')
                .eq('farm_uuid', farmUuid)
                .eq('variety_id', recipeData.variety_id)
                .gt('quantity_remaining', 0)
                .order('soak_date', { ascending: true })
                .limit(1);

              if (soakedSeedData && soakedSeedData.length > 0) {
                setAvailableSoakedSeed(soakedSeedData[0]);
              }
              // If no soaked seed available, dialog will show "no soaked seed" UI
              // with options to start soaking, reschedule, or cancel
            }
          } else {
            showNotification('error', 'Could not determine variety for this recipe.');
            setSeedingTask(null);
            setSeedingDialogReady(true);
            return;
          }
        } else {
          // Non-soak variety - fetch available batches
          await fetchAvailableBatchesForRecipe(seedingTaskObj);
        }
      } else {
        // No recipe ID available - just fetch batches
        await fetchAvailableBatchesForRecipe(seedingTaskObj);
      }
      setSeedingDialogReady(true);
    } else {
      // For other missed steps, just mark as completed normally
      try {
        const success = await completeMissedStep(missedStep);
        if (success) {
          showNotification('success', `Completed "${missedStep.description}" (Day ${missedStep.expectedDay})`);
          await loadTasks({ suppressLoading: true });
        } else {
          showNotification('error', 'Failed to complete step. Please try again.');
        }
      } catch {
        showNotification('error', 'Failed to complete step. Please try again.');
      }
    }
  };

  const handleSkipAllMissed = async (task: DailyTask) => {
    if (!task.missedSteps || task.missedSteps.length === 0) return;
    // Open confirmation dialog instead of browser confirm
    setSkipAllTask(task);
  };

  const handleSkipAllConfirm = async () => {
    if (!skipAllTask || !skipAllTask.missedSteps || skipAllTask.missedSteps.length === 0) return;

    // Store values before clearing state
    const task = skipAllTask;
    const missedSteps = task.missedSteps;
    const cropName = task.crop;
    
    // TypeScript guard - we know missedSteps is defined from the check above
    if (!missedSteps) return;
    
    setSkipAllTask(null);

    try {
      const success = await skipAllMissedSteps(missedSteps);
      if (success) {
        showNotification('success', `Skipped ${missedSteps.length} missed steps for ${cropName}`);
        await loadTasks({ suppressLoading: true });
      } else {
        showNotification('error', 'Failed to skip steps. Please try again.');
      }
    } catch {
      showNotification('error', 'Failed to skip steps. Please try again.');
    }
  };

  // Grouping Logic: Group by action type
  const harvestTasks = tasks.filter(t => t.action.toLowerCase().startsWith('harvest') && !t.action.toLowerCase().includes('at risk'));
  const atRiskTasks = tasks.filter(t => t.action.toLowerCase().includes('at risk'));
  const prepTasks = tasks.filter(t => t.action === 'Soak' || t.action === 'Seed');
  const harvestGroups = useMemo<HarvestGroup[]>(() => {
    const groupMap = new Map<string, HarvestGroup>();
    harvestTasks.forEach((task) => {
      const customerKey = task.customerName?.trim() || 'unassigned';
      const deliveryKey = task.deliveryDate || 'no-date';
      const key = `${customerKey}||${deliveryKey}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          key,
          customerName: task.customerName,
          deliveryDate: task.deliveryDate,
          tasks: [],
        });
      }
      groupMap.get(key)!.tasks.push(task);
    });
    return Array.from(groupMap.values());
  }, [harvestTasks]);

  const batchHarvestSelectedCount = useMemo(() => {
    return batchHarvestRows.reduce((count, row) => count + (batchHarvestSelected[row.trayId] ? 1 : 0), 0);
  }, [batchHarvestRows, batchHarvestSelected]);
  
  // Only log task grouping and limit frequency to avoid spam
  const logKey = `task-grouping-${tasks.length}-${atRiskTasks.length}`;
  const lastLog = (window as any).__lastTaskGroupingLog;
  if (lastLog !== logKey) {
    console.log('[DailyFlow] Task grouping:', {
      totalTasks: tasks.length,
      harvestCount: harvestTasks.length,
      atRiskCount: atRiskTasks.length,
      atRiskTasks: atRiskTasks.map(t => ({ id: t.id, action: t.action, crop: t.crop })),
      prepCount: prepTasks.length
    });
    (window as any).__lastTaskGroupingLog = logKey;
  }
  
  // Identify passive steps (informational only - no action required)
  // These are typically: Germination, Blackout, Growing, etc.
  // Watering and misting are NEVER passive - they're actionable tasks
  const passiveStepNames = ['Germination', 'Blackout', 'Growing', 'Growing Phase'];

  // Active workflow tasks (exclude passive, harvest, at-risk)
  // Watering and misting tasks are ALWAYS workflow tasks (actionable)
  const workflowTasks = tasks.filter(t => {
    const actionLower = t.action.toLowerCase();
    // Watering and misting are always workflow tasks
    if (actionLower.startsWith('water') || actionLower.startsWith('mist')) {
      return true;
    }
    // Check if action matches passive step names (case-insensitive)
    const isPassiveStep = passiveStepNames.some(name =>
      actionLower === name.toLowerCase() || actionLower.includes(name.toLowerCase())
    );
    return !actionLower.startsWith('harvest') &&
           !actionLower.includes('at risk') &&
           t.action !== 'Soak' &&
           t.action !== 'Seed' &&
           !isPassiveStep &&
           !passiveStepNames.some(name => t.stepDescription?.toLowerCase().includes(name.toLowerCase()));
  });

  // Tasks that have missed steps (need catch-up)
  const tasksWithMissedSteps = tasks.filter(t => t.missedSteps && t.missedSteps.length > 0);

  const formatHeaderDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const headerDayName = selectedDate.toLocaleDateString('en-US', { weekday: 'long' });
  const formattedDate = formatHeaderDate(selectedDate);
  const todayReference = new Date();
  todayReference.setHours(0, 0, 0, 0);
  const isViewingToday = selectedDate.getTime() === todayReference.getTime();

  if (loading) {
    return (
      <div className="min-h-screen bg-white p-4 md:p-8">
        <div className="flex flex-col items-center justify-center h-64">
          <GrowingMicrogreens compact message="Loading your daily flow..." />
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
    <div className="min-h-screen bg-white p-4 md:p-8">
      
      {/* 1. TOP HEADER: High Level Stats */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-lg bg-emerald-100">
              <Calendar className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="p-0 text-slate-500 hover:text-slate-700"
                  onClick={() => changeSelectedDate(-1)}
                  aria-label="Previous day"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">{formattedDate}</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className="p-0 text-slate-500 hover:text-slate-700"
                  onClick={() => changeSelectedDate(1)}
                  aria-label="Next day"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-slate-500">
                {isViewingToday ? 'Today - ' : ''}
                {headerDayName}'s Flow
              </p>
            </div>
          </div>
          <p className="text-slate-600 flex items-center gap-2 mt-2">
            <Clock size={16} /> {prepTasks.length + workflowTasks.length + harvestTasks.length + atRiskTasks.length} {(prepTasks.length + workflowTasks.length + harvestTasks.length + atRiskTasks.length) === 1 ? 'Task' : 'Tasks'} require attention
          </p>
        </div>
        
        {/* Progress Summary Widget */}
        <div className="bg-white border border-slate-200 shadow-sm p-3 rounded-xl flex items-center gap-4 min-w-[200px]">
          <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600">
            <Sprout size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase">Active Trays</p>
            <p className="text-xl font-bold text-slate-900">{activeTraysCount.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="space-y-8">

        {/* TRAY STATUS SUMMARY */}
        {passiveTrayStatus.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="h-8 w-1 bg-slate-400 rounded-full"></span>
              <h3 className="text-xl font-semibold text-slate-900">Tray Status</h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-slate-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="font-medium mb-1">Current Tray Overview</p>
                  <p>Summary of all trays in passive growth phases. These don't need immediate action but you can click "View Details" to check on individual trays.</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {passiveTrayStatus.map((summary) => (
                <PassiveStepCard
                  key={summary.stepName}
                  stepName={summary.stepName}
                  totalTrays={summary.totalTrays}
                  onViewDetails={() => setPassiveStepDetails(summary)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ORDER STATUS GAPS */}
        {activeOrderGaps.length > 0 && (
          <section>
            <Card className="border-amber-200 bg-amber-50/80 shadow-sm overflow-hidden p-4 md:p-6">
            <div className="flex flex-wrap items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-700" />
                <h3 className="text-lg font-semibold uppercase tracking-wide text-amber-900">Order Gaps</h3>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-amber-600 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    <p className="font-medium mb-1">What are Order Gaps?</p>
                    <p>These are upcoming orders that don't have enough ready trays assigned. You need to either assign available trays, adjust harvest dates of existing trays, or contact the customer about alternatives.</p>
                  </TooltipContent>
                </Tooltip>
                <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-xs uppercase tracking-[0.2em]">
                  {activeOrderGaps.length} gap{activeOrderGaps.length === 1 ? '' : 's'}
                </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="border border-amber-200 text-amber-900 text-xs uppercase tracking-[0.2em] px-3 py-1 rounded-full"
                onClick={handleAssignUnassignedGap}
              >
                Assign Unassigned
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="border border-slate-300 text-slate-700 text-xs uppercase tracking-[0.2em] px-3 py-1 rounded-full hover:bg-slate-100"
                onClick={handleFinalizeDay}
                disabled={isFinalizingDay}
              >
                {isFinalizingDay ? 'Finalizing...' : 'Finalize Day'}
              </Button>
              </div>
              <div className="mt-4 space-y-3">
                {activeOrderGaps.map((gap) => {
                  const needsUnassigned = gap.unassigned_ready > 0;
                  const hasNearReady = gap.near_ready_assigned > 0;
                  const gapKey = formatGapKey(gap);
                  const matchingTrays = gapMissingVarietyTrays[gapKey] || [];
                  const mismatchedTrays = gapMismatchedTrays[gapKey] || [];
                  const isMissingVarietyLoading = gapMissingVarietyTraysLoading[gapKey] || false;
                  const isMismatchedLoading = gapMismatchedTraysLoading[gapKey] || false;
                  const recipeRequirements = gapRecipeRequirements[gapKey] || [];
                  const hasMismatchedTray = mismatchedTrays.length > 0;
                  const isFixable = needsUnassigned || hasNearReady || hasMismatchedTray;
                  const deliveryDate = gap.scheduled_delivery_date || gap.delivery_date;
                  const isAnimatingOut = animatingOutGaps.has(gapKey);

                  // Build variety breakdown for mix products or any gap with variety info
                  // Pass recipe requirements to enable matching by recipe_id instead of names
                  const varietyBreakdown = buildVarietyBreakdown(gap, mismatchedTrays, matchingTrays, recipeRequirements);
                  const showVarietyBreakdown = varietyBreakdown.length > 0;

                  // Determine the message based on gap status
                  let message: string;
                  if (showVarietyBreakdown) {
                    // Summary message for variety breakdown
                    const mismatchCount = varietyBreakdown.filter(v => v.status === 'date_mismatch').length;
                    const missingCount = varietyBreakdown.filter(v => v.status === 'missing').length;
                    const readyCount = varietyBreakdown.filter(v => v.status === 'ready').length;
                    const parts: string[] = [];
                    if (mismatchCount > 0) parts.push(`${mismatchCount} date mismatch`);
                    if (missingCount > 0) parts.push(`${missingCount} missing`);
                    if (readyCount > 0) parts.push(`${readyCount} ready`);
                    message = parts.length > 0 ? parts.join(' • ') : 'Checking varieties...';
                  } else if (needsUnassigned) {
                    message = `⚠️ Missing ${gap.varieties_missing} ${gap.varieties_missing === 1 ? 'variety' : 'varieties'} — ${gap.unassigned_ready} unassigned ${gap.unassigned_ready === 1 ? 'tray' : 'trays'} ready to grab!`;
                  } else if (hasNearReady) {
                    message = `⏳ Ready ${formatReadyDateLabel(gap.soonest_ready_date)}`;
                  } else {
                    message = '❌ No trays available — at risk!';
                  }

                  const rowClass = hasMismatchedTray
                    ? 'border-l-4 border-orange-400 bg-orange-50 text-orange-900'
                    : isFixable
                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                      : 'border-red-200 bg-red-50 text-red-900';
                  const showViewTrayButton = matchingTrays.length > 0 && !isMissingVarietyLoading && !hasMismatchedTray;
                  const showSkipDeliveryButton = !isMissingVarietyLoading && matchingTrays.length === 0 && gap.gap > 0 && !hasMismatchedTray && !showVarietyBreakdown;
                  return (
                    <div
                      key={`${gap.customer_id}-${gap.product_id}`}
                      className={cn(
                        'rounded-2xl border p-3 space-y-2 transition-all duration-300',
                        rowClass,
                        isAnimatingOut && 'opacity-0 -translate-x-full scale-95'
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-current">
                          {gap.customer_name} — {gap.product_name}
                        </p>
                        <div className="flex items-center gap-2">
                          {deliveryDate && (
                            <span className="text-[0.65rem] text-current/70">
                              {formatLocalDate(deliveryDate)}
                            </span>
                          )}
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-[0.6rem] uppercase tracking-[0.25em]',
                              hasMismatchedTray ? 'bg-orange-100 text-orange-700' : isFixable ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                            )}
                          >
                            Gap {gap.gap}
                          </Badge>
                        </div>
                      </div>

                      {/* Variety breakdown for mix products */}
                      {showVarietyBreakdown ? (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-current/70 uppercase tracking-wide">
                            {varietyBreakdown.length} {varietyBreakdown.length === 1 ? 'variety' : 'varieties'} needed:
                          </p>
                          <div className="space-y-1">
                            {varietyBreakdown.map((v, idx) => (
                              <div
                                key={`${v.varietyName}-${idx}`}
                                className={cn(
                                  'flex items-center justify-between text-xs px-2 py-1.5 rounded-lg',
                                  v.status === 'ready' && 'bg-emerald-100/50 text-emerald-800',
                                  v.status === 'date_mismatch' && 'bg-orange-100/50 text-orange-800',
                                  v.status === 'missing' && 'bg-red-100/50 text-red-800'
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <span>
                                    {v.status === 'ready' && '✓'}
                                    {v.status === 'date_mismatch' && '⚠️'}
                                    {v.status === 'missing' && '❌'}
                                  </span>
                                  <span className="font-medium capitalize">{v.varietyName}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {v.status === 'ready' && (
                                    <span className="text-emerald-600">Ready</span>
                                  )}
                                  {v.status === 'date_mismatch' && v.tray && (
                                    <>
                                      <span className="text-orange-700">
                                        #{v.tray.tray_id} ready {formatLocalDate(v.readyDate)}
                                      </span>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 px-2 text-[0.65rem] text-orange-700 hover:bg-orange-200"
                                        onClick={() => openReallocationConfirm(gap, v.tray!, 'harvestEarly')}
                                      >
                                        Harvest Early
                                      </Button>
                                    </>
                                  )}
                                  {v.status === 'missing' && (
                                    <span className="text-red-600">No tray</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          {/* Summary action buttons for all mismatched varieties */}
                          {mismatchedTrays.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-current/10">
                              <Button
                                size="sm"
                                className="text-xs bg-orange-600 hover:bg-orange-700"
                                onClick={() => openReallocationConfirm(gap, mismatchedTrays[0], 'keepForFuture')}
                              >
                                Keep All for Original Dates
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-orange-600 hover:text-orange-800 hover:bg-orange-100"
                                onClick={() => openReallocationConfirm(gap, mismatchedTrays[0], 'cancel')}
                              >
                                Cancel Delivery
                              </Button>
                            </div>
                          )}
                          {/* Action buttons for gaps with missing varieties (no mismatched trays) */}
                          {mismatchedTrays.length === 0 && varietyBreakdown.some(v => v.status === 'missing') && (
                            <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-current/10">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={() => handleSkipDelivery(gap)}
                              >
                                Skip Delivery
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <p className="text-sm leading-relaxed">{message}</p>
                          {gap.is_mix && gap.varieties_in_product > 0 && (
                            <p className="text-xs text-current/80">
                              {gap.varieties_missing}/{gap.varieties_in_product} varieties missing
                            </p>
                          )}
                          {gap.missing_varieties && (
                            <p className="text-xs text-current/80">
                              Missing: {gap.missing_varieties}
                            </p>
                          )}
                        </>
                      )}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {/* Mismatched tray reallocation options (only show when NOT using variety breakdown) */}
                      {hasMismatchedTray && !isMismatchedLoading && !showVarietyBreakdown && (
                        <>
                          <Button
                            size="sm"
                            className="text-sm bg-orange-600 hover:bg-orange-700"
                            onClick={() => openReallocationConfirm(gap, mismatchedTrays[0], 'harvestEarly')}
                          >
                            Harvest Early & Use Today
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-sm border-orange-300 text-orange-700 hover:bg-orange-100"
                            onClick={() => openReallocationConfirm(gap, mismatchedTrays[0], 'keepForFuture')}
                          >
                            Keep for {formatLocalDate(mismatchedTrays[0].harvest_date)}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-sm text-orange-600 hover:text-orange-800 hover:bg-orange-100"
                            onClick={() => openReallocationConfirm(gap, mismatchedTrays[0], 'cancel')}
                          >
                            Cancel Delivery
                          </Button>
                        </>
                      )}
                      {isMismatchedLoading && !showVarietyBreakdown && (
                        <Button variant="outline" size="sm" className="text-sm" disabled>
                          Checking assigned trays...
                        </Button>
                      )}

                      {/* Original gap handling options */}
                    {needsUnassigned && !hasMismatchedTray && (
                      <Button className="text-sm" onClick={() => openAssignModal(gap)}>
                        Assign Tray
                      </Button>
                    )}
                      {isMissingVarietyLoading && !hasMismatchedTray && (
                        <Button variant="outline" size="sm" className="text-sm" disabled>
                          Checking trays...
                        </Button>
                      )}
                      {showViewTrayButton && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-sm"
                          onClick={() => viewNearReadyTray(gap, matchingTrays[0])}
                        >
                          View Tray
                        </Button>
                      )}
                      {showSkipDeliveryButton && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-sm"
                          onClick={() => handleSkipDelivery(gap)}
                        >
                          Skip Delivery
                        </Button>
                      )}
                      {!needsUnassigned && !hasNearReady && !hasMismatchedTray && gap.gap > 0 && (
                        <Badge variant="destructive" className="text-[0.6rem] uppercase tracking-[0.25em]">
                          At Risk
                        </Badge>
                      )}
                    </div>

                    {/* Warning for harvest early option */}
                    {hasMismatchedTray && (
                      <div className="mt-2 p-2 bg-orange-100 border border-orange-200 rounded-lg">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-orange-800">
                            Harvesting early will remove coverage for a future scheduled delivery
                          </p>
                        </div>
                      </div>
                    )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </section>
        )}


        {/* SECTION 0: MISSED STEPS CATCH-UP */}
        {tasksWithMissedSteps.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="h-8 w-1 bg-amber-500 rounded-full"></span>
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h3 className="text-xl font-semibold text-slate-900">Catch Up Required</h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-amber-500 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="font-medium mb-1">Missed Steps</p>
                  <p>These trays have steps that were scheduled but not completed. You can either complete them now (if still applicable) or skip them to move forward.</p>
                </TooltipContent>
              </Tooltip>
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 ml-2">
                {tasksWithMissedSteps.reduce((acc, t) => acc + (t.missedSteps?.length || 0), 0)} missed steps
              </Badge>
            </div>

            <div className="space-y-4">
              {tasksWithMissedSteps.map(task => (
                <MissedStepsCard
                  key={`missed-${task.id}`}
                  task={task}
                  onSkipMissed={handleSkipMissed}
                  onCompleteMissed={handleCompleteMissed}
                  onSkipAll={handleSkipAllMissed}
                  isAnimatingOut={animatingOut.has(task.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* SECTION 1: THE HARVEST (Priority #1) */}
        {harvestTasks.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="h-8 w-1 bg-emerald-500 rounded-full"></span>
              <h3 className="text-xl font-semibold text-slate-900">Ready for Harvest</h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-slate-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="font-medium mb-1">Trays Ready to Harvest</p>
                  <p>These trays have completed their growing cycle and are ready to be cut. Customer orders are grouped at the top. Click on individual trays to record harvest details.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            
            <div className="space-y-6">
            {harvestGroups.map((group) => {
              const traysReady = group.tasks.reduce((sum, task) => sum + (Number(task.quantity) || 0), 0);
              const groupLabel = group.customerName ? `${group.customerName} Order` : 'Unassigned Trays';
              const deliveryLabel = formatShortDateLabel(group.deliveryDate);
              const groupMismatchedTrays = getMismatchedTraysForGroup(group);
              const hasMismatchedVarieties = groupMismatchedTrays.length > 0;
              const trayDetailCandidates = group.tasks.flatMap((task) => task.trayDetails || []);
              const uniqueTrayDetails = Array.from(new Map(trayDetailCandidates.map((detail) => [detail.trayId, detail])).values());
              // Get all tray IDs from the group's tasks
              const groupTrayIds = Array.from(new Set(group.tasks.flatMap(task => task.trayIds || [])));
              const fallbackTrayDetails: TraySelectionDetail[] = groupTrayIds
                .map((trayId) => ({ trayId: Number(trayId) }));
              const trayDetailsForModal = uniqueTrayDetails.length > 0 ? uniqueTrayDetails : fallbackTrayDetails;
              const trayCountForModal = trayDetailsForModal.length;
                return (
                  <div
                    key={group.key}
                    className={cn(
                      "rounded-2xl border p-4 space-y-4 transition-shadow duration-200",
                      group.customerName ? "border-emerald-200 bg-emerald-50 shadow-sm" : "border-slate-200 bg-white"
                    )}
                  >
                    <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{groupLabel}</p>
                        {deliveryLabel && (
                          <p className="text-xs text-slate-500">Delivery {deliveryLabel}</p>
                        )}
                        <p className="text-xs font-semibold text-emerald-700">
                          {group.customerName
                            ? `${group.customerName}: ${group.tasks.length} ${group.tasks.length === 1 ? 'variety' : 'varieties'} ready`
                            : `${traysReady} ${traysReady === 1 ? 'tray' : 'trays'} ready`}
                        </p>
                        {hasMismatchedVarieties && (
                          <p className="text-xs text-orange-600 mt-1">
                            +{groupMismatchedTrays.length} {groupMismatchedTrays.length === 1 ? 'variety' : 'varieties'} need early harvest
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="bg-slate-100 text-slate-700 mt-1 md:mt-0">
                          {group.tasks.length} {group.tasks.length === 1 ? 'variety' : 'varieties'}
                        </Badge>
                        {!group.customerName && trayCountForModal > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 h-9"
                            onClick={() => openTraySelectionModal(trayDetailsForModal, groupLabel)}
                          >
                            View {trayCountForModal === 1 ? 'Tray' : `${trayCountForModal} Trays`}
                          </Button>
                        )}
                        {group.customerName && (
                          hasMismatchedVarieties ? (
                            <Button
                              size="sm"
                              className="bg-orange-600 hover:bg-orange-700"
                              onClick={() => openEarlyHarvestConfirm(group)}
                            >
                              Complete Order & Harvest Early
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void openBatchHarvestModal(group)}
                            >
                              Harvest Order
                            </Button>
                          )
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {group.tasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          variant="harvest"
                          onComplete={handleComplete}
                          isCompleting={completingIds.has(task.id)}
                          isAnimatingOut={animatingOut.has(task.id)}
                          onViewDetails={handleViewDetails}
                          onMarkAsLost={handleMarkAsLost}
                          navigate={navigate}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* SECTION 1.5: AT RISK ITEMS */}
        {atRiskTasks.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="h-8 w-1 bg-amber-500 rounded-full"></span>
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h3 className="text-xl font-semibold text-slate-900">At Risk</h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-amber-500 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="font-medium mb-1">Orders At Risk</p>
                  <p>These orders may not be fulfilled on time. Use the action buttons to: contact the customer, skip the item, substitute with another product, or add notes.</p>
                </TooltipContent>
              </Tooltip>
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 ml-2">
                {atRiskTasks.length} {atRiskTasks.length === 1 ? 'item' : 'items'}
              </Badge>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {atRiskTasks.map(task => {
                const historyKey = `${task.standingOrderId}-${task.deliveryDate}-${task.recipeId}`;
                const history = actionHistory.get(historyKey) || [];
                return (
                  <AtRiskTaskCard
                    key={task.id}
                    task={task}
                    onAction={handleAtRiskTask}
                    actionHistory={history}
                    onViewDetails={handleViewDetails}
                    isAnimatingOut={animatingOut.has(task.id)}
                  />
                );
              })}
            </div>
          </section>
        )}

      <Dialog open={!!assignModalGap} onOpenChange={(open) => !open && closeAssignModal()}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Assign Ready Tray</DialogTitle>
            <DialogDescription>
              Select a ready tray to assign to {assignModalGap?.customer_name} ({assignModalGap?.product_name})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {isLoadingAssignableTrays ? (
              <p className="text-sm text-slate-500">Loading ready trays...</p>
            ) : assignableTrays.length === 0 ? (
              <p className="text-sm text-slate-500">
                No unassigned ready trays found for this product.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {assignableTrays.map((tray) => (
                  <label
                    key={tray.tray_id}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                      selectedAssignTrayId === tray.tray_id
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 bg-white'
                    )}
                  >
                    <input
                      type="radio"
                      name="assign-tray"
                      value={tray.tray_id}
                      checked={selectedAssignTrayId === tray.tray_id}
                      onChange={() => setSelectedAssignTrayId(tray.tray_id)}
                      className="h-3 w-3 text-emerald-600 focus:ring-0"
                    />
                    <div className="text-sm">
                      <p className="font-semibold text-slate-900">
                        Tray {tray.tray_id} • {getTrayDisplayName(tray)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Sowed {tray.sow_date ? new Date(tray.sow_date).toLocaleDateString() : 'N/A'} • {tray.days_grown} days grown
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeAssignModal}>Cancel</Button>
            <Button
              onClick={handleAssignTray}
              disabled={
                !assignModalGap ||
                !selectedAssignTrayId ||
                isAssigningTray ||
                isLoadingAssignableTrays ||
                assignableTrays.length === 0
              }
            >
              {isAssigningTray ? 'Assigning...' : 'Assign Tray'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!nearReadyTrayModal}
        onOpenChange={(open) => !open && setNearReadyTrayModal(null)}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              {nearReadyTrayModal
                ? `${getTrayDisplayName(nearReadyTrayModal.tray)} — Tray ${nearReadyTrayModal.tray.tray_id}`
                : 'Tray'}
            </DialogTitle>
            <DialogDescription>
              Near-ready tray for {nearReadyTrayModal?.gap.customer_name} — {nearReadyTrayModal?.gap.product_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Recipe</Label>
              <p className="font-semibold text-slate-900">
                {nearReadyTrayModal ? getTrayDisplayName(nearReadyTrayModal.tray) : '—'}
              </p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Sow Date</Label>
                <p className="text-sm text-slate-700">
                  {nearReadyTrayModal?.tray.sow_date
                    ? new Date(nearReadyTrayModal.tray.sow_date).toLocaleDateString()
                    : 'Unknown'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Days grown</Label>
                <p className="text-sm text-slate-700">{nearReadyTrayModal?.tray.days_grown ?? '—'}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Ready status</Label>
                <p className="text-sm text-slate-700">
                  {nearReadyTrayModal
                    ? nearReadyTrayModal.tray.days_until_ready <= 0
                      ? 'Ready now'
                      : `Ready in ${nearReadyTrayModal.tray.days_until_ready} day${nearReadyTrayModal.tray.days_until_ready === 1 ? '' : 's'}`
                    : 'Loading...'}
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="flex flex-col gap-2">
            <Button
              onClick={handleAssignNearestTray}
              disabled={!nearReadyTrayModal || isTrayModalProcessing}
              className="w-full"
            >
              {isTrayModalProcessing ? 'Processing...' : `Assign to ${nearReadyTrayModal?.gap.customer_name}`}
            </Button>
            <Button
              variant="outline"
              onClick={handleHarvestNearestTray}
              disabled={!nearReadyTrayModal || isTrayModalProcessing}
              className="w-full"
            >
              {isTrayModalProcessing ? 'Processing...' : 'Harvest today'}
            </Button>
            <Button
              variant="ghost"
              onClick={openNearReadyTrayDetail}
              className="w-full"
            >
              View full tray detail
            </Button>
            <Button
              variant="ghost"
              onClick={() => setNearReadyTrayModal(null)}
              className="w-full"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        {/* Available Soaked Seed Panel */}
        {allAvailableSoakedSeed.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="h-8 w-1 bg-amber-500 rounded-full"></span>
              <h3 className="text-xl font-semibold text-slate-900">Available Soaked Seed</h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-slate-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="font-medium mb-1">Leftover Soaked Seeds</p>
                  <p>Seeds that were soaked but not fully used. Use them before they expire by clicking "Use" to create new trays, or "Discard" if they're no longer viable.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {allAvailableSoakedSeed.map((soaked: any) => {
                const urgency = soaked.urgency || 'available';
                const isUrgent = urgency === 'expires_tomorrow' || urgency === 'expired';
                
                // Calculate approximate trays from remaining quantity (assuming ~340g per tray)
                const approxTrays = Math.floor((soaked.quantity_remaining || 0) / 340);
                
                return (
                  <Card key={soaked.soaked_id} className={cn(
                    "relative overflow-hidden border-2",
                    urgency === 'expired' ? "border-red-300 bg-red-50" :
                    urgency === 'expires_tomorrow' ? "border-amber-300 bg-amber-50" :
                    "border-slate-200 bg-white"
                  )}>
                    <div className={cn("absolute top-0 left-0 w-full h-1", {
                      'bg-red-500': urgency === 'expired',
                      'bg-amber-500': urgency === 'expires_tomorrow',
                      'bg-green-500': urgency === 'available'
                    })}></div>
                    <div className="p-5">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-bold text-lg text-slate-900">{soaked.variety_name}</h4>
                          <p className="text-xs text-slate-500 font-medium tracking-wide uppercase mt-1">
                            {soaked.quantity_remaining} {soaked.unit || 'g'} SOAKED
                          </p>
                        </div>
                        {isUrgent && (
                          <Badge variant="secondary" className={cn(
                            "font-mono",
                            urgency === 'expired' ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                          )}>
                            {urgency === 'expired' ? 'Expired' : 'Expires Tomorrow'}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="mb-4 space-y-1 text-sm text-slate-600">
                        <p>Soaked: {formatLocalDate(soaked.soak_date)}</p>
                        <p>Expires: {formatLocalDate(soaked.expires_at)}</p>
                        {approxTrays > 0 && (
                          <p className="text-slate-500">~{approxTrays} {approxTrays === 1 ? 'tray' : 'trays'} worth</p>
                        )}
                      </div>
                      
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setUseSoakedSeedDialog(soaked);
                            setUseSoakedSeedQuantity(approxTrays > 0 ? approxTrays.toString() : '1');
                          }}
                          className="flex-1"
                        >
                          <Package className="h-4 w-4 mr-2" />
                          Use
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setDiscardSoakedSeedDialog(soaked);
                            setDiscardReason('expired');
                          }}
                          className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Discard
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* SECTION 1.4: MISSED SEEDLINGS (Overdue seeding tasks) */}
        {overdueSeedingTasks.filter(t => !skippedOverdueTasks.has(t.id)).length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="h-8 w-1 bg-amber-500 rounded-full"></span>
              <h3 className="text-xl font-semibold text-slate-900">Missed Seedings</h3>
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 font-mono">
                {overdueSeedingTasks.filter(t => !skippedOverdueTasks.has(t.id)).length} overdue
              </Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-slate-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="font-medium mb-1">Missed Seeding Tasks</p>
                  <p>These seedings were scheduled but not completed. Click "Seed Now" to catch up, or "Skip" if you've decided not to fulfill this order.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {overdueSeedingTasks
                .filter(task => !skippedOverdueTasks.has(task.id))
                .map(task => {
                  const formatOverdueDate = (dateStr: string | undefined) => {
                    if (!dateStr) return '';
                    const date = new Date(dateStr + 'T12:00:00');
                    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                  };

                  return (
                    <Card key={task.id} className="relative overflow-hidden border-2 border-amber-300 bg-amber-50">
                      <div className="absolute top-0 left-0 w-full h-1 bg-amber-500"></div>
                      <div className="p-5">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="font-bold text-lg text-slate-900">{task.crop}</h4>
                            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase mt-1">
                              {task.trays} {task.trays === 1 ? 'tray' : 'trays'} to seed
                            </p>
                          </div>
                          <Badge variant="secondary" className="bg-amber-100 text-amber-700 font-mono">
                            {task.daysOverdue} day{task.daysOverdue !== 1 ? 's' : ''} late
                          </Badge>
                        </div>

                        <div className="mb-4 space-y-1 text-sm text-slate-600">
                          <p>Was scheduled: {formatOverdueDate(task.sowDate)}</p>
                          {task.customerName && <p>Customer: {task.customerName}</p>}
                          {task.deliveryDate && (
                            <p>Delivery: {new Date(task.deliveryDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleSeedOverdueTask(task)}
                            disabled={completingIds.has(task.id)}
                            className="flex-1 bg-amber-600 hover:bg-amber-700"
                          >
                            <Sprout className="h-4 w-4 mr-2" />
                            Seed Now
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSkipOverdueSeeding(task)}
                            className="flex-1 text-slate-600 hover:text-slate-700"
                          >
                            <SkipForward className="h-4 w-4 mr-2" />
                            Skip
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
            </div>
          </section>
        )}

        {/* SECTION 1.5: PREP TASKS (Soak & Seed) */}
        {prepTasks.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="h-8 w-1 bg-purple-500 rounded-full"></span>
              <h3 className="text-xl font-semibold text-slate-900">Preparation Tasks</h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-slate-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="font-medium mb-1">Soak & Seed Tasks</p>
                  <p><strong>Soak:</strong> Start soaking seeds in water. Click "Begin Soak" to record the soak start time and select a seed batch.</p>
                  <p className="mt-1"><strong>Seed:</strong> Plant soaked seeds into trays. Click "Start Seeding" to create new trays from soaked seeds.</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {prepTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  variant={task.action === 'Soak' ? 'prep' : 'seed'}
                  onComplete={handleComplete}
                  isCompleting={completingIds.has(task.id)}
                  isAnimatingOut={animatingOut.has(task.id)}
                  onViewDetails={handleViewDetails}
                  navigate={navigate}
                />
              ))}
            </div>
          </section>
        )}

        {/* SECTION 2: WORKFLOW TASKS */}
        {workflowTasks.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="h-8 w-1 bg-blue-500 rounded-full"></span>
              <h3 className="text-xl font-semibold text-slate-900">Tasks & Maintenance</h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-slate-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="font-medium mb-1">Daily Care Tasks</p>
                  <p>Routine tasks for your growing trays. Click "Mark Done" after completing each task. Use the menu (...) to skip tasks or mark trays as lost if needed.</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {workflowTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  variant={
                    task.action.toLowerCase().includes('water') || task.action.toLowerCase().includes('mist') 
                      ? 'water' 
                      : task.action.toLowerCase() === 'uncover' 
                      ? 'warning' 
                      : 'default'
                  }
                  onComplete={handleComplete}
                  isCompleting={completingIds.has(task.id)}
                  isAnimatingOut={animatingOut.has(task.id)}
                  onViewDetails={handleViewDetails}
                  onSkip={handleSkip}
                  onMarkAsLost={handleMarkAsLost}
                  navigate={navigate}
                />
              ))}
            </div>
          </section>
        )}

        {/* SECTION 3: TRAY STATUS (Passive Steps) - Now uses direct DB query */}
        {/* Empty State */}
        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Sprout size={64} className="text-slate-300 mb-4" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">No flow today</h3>
            <p className="text-slate-500 max-w-md">
              All caught up! No batches require attention right now. Check back later or create new trays to get started.
            </p>
          </div>
        )}

      </div>

      {/* Notification Toast */}
      {notification.show && (
        <div className="fixed bottom-4 right-4 z-[100] animate-in slide-in-from-bottom-5">
          <Card className={cn(
            "p-4 shadow-lg border-2 min-w-[300px]",
            notification.type === 'success' 
              ? "bg-emerald-50 border-emerald-200 text-emerald-900" 
              : "bg-red-50 border-red-200 text-red-900"
          )}>
            <div className="flex items-start gap-3">
              <div className={cn(
                "h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                notification.type === 'success' ? "bg-emerald-500" : "bg-red-500"
              )}>
                {notification.type === 'success' ? (
                  <Check className="h-3 w-3 text-white" />
                ) : (
                  <span className="text-white text-xs font-bold">×</span>
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">
                  {notification.type === 'success' ? 'Success' : 'Error'}
                </p>
                <p className="text-sm mt-1">{notification.message}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-slate-500 hover:text-slate-900"
                onClick={() => setNotification({ ...notification, show: false })}
              >
                <span className="text-lg">×</span>
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Task Details Modal */}
      <Dialog open={!!viewingTask} onOpenChange={(open) => !open && setViewingTask(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewingTask && (
                <>
                  {viewingTask.action.toLowerCase().startsWith('harvest') && !viewingTask.action.toLowerCase().includes('at risk') && <Scissors className="h-5 w-5 text-emerald-600" />}
                  {viewingTask.action.toLowerCase().includes('at risk') && <AlertTriangle className="h-5 w-5 text-amber-600" />}
                  {viewingTask.action === 'Uncover' && <Sun className="h-5 w-5 text-amber-600" />}
                  {viewingTask.action === 'Soak' && <Beaker className="h-5 w-5 text-purple-600" />}
                  {viewingTask.action === 'Seed' && <Sprout className="h-5 w-5 text-indigo-600" />}
                  {(viewingTask.action === 'Water' || viewingTask.action === 'Blackout') && <Droplets className="h-5 w-5 text-blue-600" />}
                  Task Details
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              Detailed information about this task
            </DialogDescription>
          </DialogHeader>
          {viewingTask && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Action</p>
                  <p className="text-base font-semibold text-slate-900">{viewingTask.action}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Crop</p>
                  <p className="text-base font-semibold text-slate-900">{viewingTask.crop}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Batch ID</p>
                  <p className="text-base font-mono text-slate-900">{viewingTask.batchId}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Number of Trays</p>
                  <p className="text-base font-semibold text-slate-900">{viewingTask.trays} {viewingTask.trays === 1 ? 'Tray' : 'Trays'}</p>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-500">Growth Progress</p>
                <div className="flex items-center gap-2">
                  <Progress 
                    value={(viewingTask.dayCurrent / viewingTask.dayTotal) * 100} 
                    className="flex-1 h-2"
                  />
                  <span className="text-sm font-semibold text-slate-700">
                    Day {viewingTask.dayCurrent} of {viewingTask.dayTotal}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Location</p>
                  <p className="text-base text-slate-900">{viewingTask.location}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Status</p>
                  <Badge 
                    variant={viewingTask.status === 'urgent' ? 'destructive' : 'secondary'}
                    className="mt-1"
                  >
                    {viewingTask.status === 'urgent' ? 'Urgent' : 'Pending'}
                  </Badge>
                </div>
              </div>

              {viewingTask.stepDescription && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-500">Current Step</p>
                  <p className="text-base text-slate-900 italic">{viewingTask.stepDescription}</p>
                </div>
              )}

              <div className="pt-4 border-t border-slate-200">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setViewingTask(null)}
                    className="flex-1"
                  >
                    Close
                  </Button>
                  {viewingTask.action.toLowerCase().includes('at risk') ? (
                    <Button
                      onClick={() => {
                        setManageOrderDialog(viewingTask);
                        setViewingTask(null);
                      }}
                      className="flex-1 bg-amber-600 hover:bg-amber-700"
                    >
                      Manage Order
                    </Button>
                  ) : !viewingTask.action.toLowerCase().startsWith('harvest') && (
                    <Button
                      onClick={() => {
                        setViewingTask(null);
                        handleComplete(viewingTask);
                      }}
                      className="flex-1"
                      disabled={completingIds.has(viewingTask.id)}
                    >
                      {completingIds.has(viewingTask.id) ? 'Processing...' : 'Mark as Done'}
                    </Button>
                  )}
                </div>
                {viewingTask.action.toLowerCase().includes('at risk') && (
                  <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm font-medium text-amber-900 mb-2">⚠️ At Risk Item</p>
                    <p className="text-sm text-amber-800 mb-3">
                      This item needs {viewingTask.trays} {viewingTask.trays === 1 ? 'tray' : 'trays'} but there are no trays ready to harvest.
                    </p>
                    <p className="text-xs text-amber-700">
                      To resolve this, create more trays by going to the Planting Schedule page and seeding additional trays for this recipe.
                    </p>
                  </div>
                )}
                {viewingTask.action.toLowerCase().startsWith('harvest') && !viewingTask.action.toLowerCase().includes('at risk') && (
                  <p className="text-xs text-slate-500 mt-2">
                    Harvest completion is managed from tray details; no inline action here.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Harvest Dialog - with instructions and yield recording */}
      <Dialog open={!!harvestingTask} onOpenChange={(open) => !open && closeHarvestDialog()}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <Scissors className="h-5 w-5" />
              </div>
              Time to Harvest!
            </DialogTitle>
            <DialogDescription>
              Your {harvestingTask?.crop} is ready for harvest
            </DialogDescription>
          </DialogHeader>

          {harvestingTask && (
            <div className="space-y-6 py-4">
              {/* Summary Card */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-emerald-600 font-medium uppercase">Crop</p>
                    <p className="text-lg font-bold text-emerald-900">{harvestingTask.crop}</p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600 font-medium uppercase">Trays</p>
                    <p className="text-lg font-bold text-emerald-900">{harvestingTask.trays} {harvestingTask.trays === 1 ? 'tray' : 'trays'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600 font-medium uppercase">Batch</p>
                    <p className="text-base font-mono text-emerald-800">{harvestingTask.batchId}</p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600 font-medium uppercase">Location</p>
                    <p className="text-base text-emerald-800">{harvestingTask.location}</p>
                  </div>
                </div>
              </div>

              {/* Harvest Instructions */}
              <div className="space-y-3">
                <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Package className="h-4 w-4 text-slate-500" />
                  Harvest Checklist
                </h4>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex items-start gap-2">
                    <span className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">1</span>
                    <span>Cut microgreens just above the soil level using clean, sharp scissors or a knife</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">2</span>
                    <span>Rinse gently if needed and shake off excess water</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">3</span>
                    <span>Weigh your harvest and record the yield below</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">4</span>
                    <span>Store in a container with a paper towel to absorb moisture</span>
                  </li>
                </ul>
              </div>

              {harvestingTask && (() => {
                console.log('[Harvest Dialog] harvestSelectedTrayIds:', harvestSelectedTrayIds);
                console.log('[Harvest Dialog] task.trayIds:', harvestingTask.trayIds);
                return null;
              })()}

              {/* Tray Selection */}
              {harvestingTask && harvestingTask.trayIds && harvestingTask.trayIds.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">
                    Select Trays to Harvest ({harvestSelectedTrayIds.length} of {harvestingTask.trayIds.length} selected)
                  </Label>
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-3 space-y-2">
                    {harvestingTask.trayIds.map((trayId) => (
                      <label key={trayId} className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-2 rounded">
                        <input
                          type="checkbox"
                          checked={harvestSelectedTrayIds.includes(trayId)}
                          onChange={() => {
                            setHarvestSelectedTrayIds((prev) =>
                              prev.includes(trayId)
                                ? prev.filter((id) => id !== trayId)
                                : [...prev, trayId]
                            );
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-sm text-slate-700">Tray #{trayId}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Yield Recording */}
              <div className="space-y-2">
                <Label htmlFor="yield" className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-slate-500" />
                  Record Yield (optional)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="yield"
                    type="number"
                    placeholder="e.g., 150"
                    value={harvestYield}
                    onChange={(e) => setHarvestYield(e.target.value)}
                    className="flex-1"
                    min="0"
                    step="0.1"
                  />
                  <span className="text-sm text-slate-500 font-medium">grams</span>
                </div>
                <p className="text-xs text-slate-400">
                  Recording yield helps track productivity over time
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={closeHarvestDialog}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleHarvestConfirm}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              disabled={completingIds.has(harvestingTask?.id || '')}
            >
              {completingIds.has(harvestingTask?.id || '') ? (
                'Processing...'
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Complete Harvest
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Harvest Modal for Customer Orders */}
      <Dialog
        open={!!batchHarvestModalGroup}
        onOpenChange={(open) => {
          if (!open) closeBatchHarvestModal();
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              Harvest for {batchHarvestModalGroup?.customerName || 'this order'}
            </DialogTitle>
            <DialogDescription>
              Confirm the ready trays and optionally record yield per tray before marking the order as harvested.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {batchHarvestRows.length === 0 ? (
              <p className="text-sm text-slate-500">
                No ready trays found for this order. Refresh the page if this looks incorrect.
              </p>
            ) : (
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-2">
                {batchHarvestRows.map((row) => (
                  <div
                    key={`${row.trayId}-${row.taskId}`}
                    className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-3 py-3"
                  >
                    <label className="flex items-center gap-3 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!batchHarvestSelected[row.trayId]}
                        onChange={() =>
                          setBatchHarvestSelected((prev) => ({
                            ...prev,
                            [row.trayId]: !prev[row.trayId],
                          }))
                        }
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {row.varietyName || row.crop}
                        </p>
                        <p className="text-xs text-slate-500">
                          Tray {row.trayId}
                          {row.batchId ? ` • ${row.batchId}` : ''}
                        </p>
                        {row.sowDate && (
                          <p className="text-xs text-slate-400">
                            Seeded {formatShortDateLabel(row.sowDate) ?? row.sowDate}
                          </p>
                        )}
                      </div>
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="Yield"
                        value={batchHarvestYields[row.trayId] ?? ''}
                        onChange={(e) =>
                          setBatchHarvestYields((prev) => ({
                            ...prev,
                            [row.trayId]: e.target.value,
                          }))
                        }
                        disabled={!batchHarvestSelected[row.trayId]}
                        className="w-24"
                      />
                      <span className="text-xs font-semibold text-slate-500">g</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={closeBatchHarvestModal}>
              Cancel
            </Button>
            <Button
              onClick={handleRecordBatchHarvest}
              disabled={isBatchHarvesting || batchHarvestSelectedCount === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isBatchHarvesting
                ? 'Recording...'
                : `Record Harvest${batchHarvestSelectedCount > 0 ? ` (${batchHarvestSelectedCount})` : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Seeding Dialog - with batch selection */}
      {/* Soak Task Completion Dialog */}
      <Dialog open={!!soakTask} onOpenChange={(open) => {
        if (!open) {
          setSoakTask(null);
          setSelectedBatchId(null);
          setAvailableBatches([]);
          setSoakQuantityGrams('');
          setSeedQuantityPerTray(0);
        }
      }}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Beaker className="h-5 w-5" />
              </div>
              Complete Soak Task
            </DialogTitle>
            <DialogDescription>
              Select a seed batch and enter the amount to soak
            </DialogDescription>
          </DialogHeader>

          {soakTask && (() => {
            const traysRemainingToSeed = (soakTask.quantity || 0) - (soakTask.quantityCompleted || 0);
            const seedPerTray = seedQuantityPerTray || 0;
            
            // Calculate trays with soaked seed available for this request
            // Find available soaked seed for this request_id
            const soakedSeedForRequest = allAvailableSoakedSeed.find(
              (soaked: any) => soaked.request_id === soakTask.requestId
            );
            const traysWithSoakedSeed = soakedSeedForRequest && seedPerTray > 0
              ? Math.floor((soakedSeedForRequest.quantity_remaining || 0) / seedPerTray)
              : 0;
            
            // Soak task quantity = trays remaining to seed - trays with soaked seed available
            const remaining = Math.max(0, traysRemainingToSeed - traysWithSoakedSeed);
            const gramsNeeded = remaining * seedPerTray; // Recommended amount
            const selectedBatch = availableBatches.find(b => b.batchid === selectedBatchId);
            const availableGrams = getBatchAvailableGrams(selectedBatch);
            const requestedQuantity = parseFloat(soakQuantityGrams) || 0;
            const hasShortage = selectedBatch && seedPerTray > 0 && gramsNeeded > availableGrams;
            const isInsufficient = selectedBatch && requestedQuantity > 0 && requestedQuantity > availableGrams;
            const totalAvailable = availableBatches.reduce((sum, b) => sum + getBatchAvailableGrams(b), 0);
            const shortage = hasShortage ? gramsNeeded - availableGrams : (isInsufficient ? requestedQuantity - availableGrams : 0);
            const maxTraysPossible = seedPerTray > 0 ? Math.floor(availableGrams / seedPerTray) : 0;
            const canSoakPartial = maxTraysPossible > 0;

            return (
              <div className="space-y-6 py-4">
                {/* Summary Card */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-blue-600 font-medium uppercase">Variety</p>
                      <p className="text-lg font-bold text-blue-900">{soakTask.crop}</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-600 font-medium uppercase">Quantity</p>
                      <p className="text-lg font-bold text-blue-900">
                        {remaining} tray{remaining !== 1 ? 's' : ''} to soak
                        {traysWithSoakedSeed > 0 && (
                          <span className="text-xs font-normal text-blue-600 ml-2">
                            ({traysRemainingToSeed} remaining - {traysWithSoakedSeed} soaked = {remaining} to soak)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Soak Date Selection */}
                <div className="space-y-2">
                  <Label htmlFor="soak-date" className="text-sm font-medium">
                    Soak Date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="soak-date"
                    type="date"
                    value={soakDate}
                    onChange={(e) => setSoakDate(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full"
                  />
                  <p className="text-xs text-slate-500">
                    When did you soak (or are soaking) these seeds? Defaults to today.
                  </p>
                </div>

                {/* Inventory Warning */}
                {hasShortage && selectedBatch && (
                  <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <h4 className="font-semibold text-amber-900 mb-1">Insufficient Inventory</h4>
                        <p className="text-sm text-amber-800">
                          Recommended amount is <strong>{gramsNeeded.toFixed(2)}g</strong>, but only{' '}
                          <strong>{availableGrams.toFixed(2)}g</strong> is available in the selected batch.
                        </p>
                        <p className="text-sm text-amber-800 mt-2">
                          <strong>Shortage:</strong> {shortage.toFixed(2)}g
                        </p>
                        {selectedBatch && (
                          <div className="mt-2 p-2 bg-amber-100 rounded text-xs">
                            <p className="font-medium text-amber-900">Available Batch Info:</p>
                            <p className="text-amber-800">
                              Batch #{selectedBatch.batchid}: {availableGrams.toFixed(2)}g
                              {selectedBatch.lot_number && ` • Lot: ${selectedBatch.lot_number}`}
                            </p>
                            {totalAvailable > availableGrams && (
                              <p className="text-amber-800 mt-1">
                                Total available across all batches: {totalAvailable.toFixed(2)}g
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 pt-2 border-t border-amber-200">
                      <p className="text-sm font-medium text-amber-900">Options:</p>
                      <div className="flex flex-col gap-2">
                        {canSoakPartial && (() => {
                          const partialGrams = maxTraysPossible * seedPerTray; // Calculate exact amount for max trays
                          return (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                // Set quantity to the exact amount needed for max complete trays
                                setSoakQuantityGrams(partialGrams.toString());
                              }}
                              className="w-full justify-start text-amber-800 border-amber-300 hover:bg-amber-100"
                            >
                              <Droplets className="h-4 w-4 mr-2" />
                              Soak Partial ({maxTraysPossible} tray{maxTraysPossible !== 1 ? 's' : ''} - {partialGrams.toFixed(2)}g)
                            </Button>
                          );
                        })()}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setRescheduleRequestDialog({
                              task: soakTask,
                              newDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                            });
                          }}
                          className="w-full justify-start text-amber-800 border-amber-300 hover:bg-amber-100"
                        >
                          <Calendar className="h-4 w-4 mr-2" />
                          Reschedule Request
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCancelRequestDialog({
                              task: soakTask,
                              reason: 'insufficient_inventory'
                            });
                          }}
                          className="w-full justify-start text-red-600 border-red-300 hover:bg-red-50"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Cancel Request
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Batch Selection */}
                <div className="space-y-3">
                  <Label htmlFor="soak-batch-select" className="text-sm font-medium">
                    Seed Batch <span className="text-red-500">*</span>
                  </Label>
                  {loadingBatches ? (
                    <div className="text-sm text-slate-500">Loading available batches...</div>
                  ) : availableBatches.length === 0 ? (
                    <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p>No available batches found for this variety.</p>
                      <button
                        className="text-amber-700 underline font-medium hover:text-amber-800 mt-1 block"
                        onClick={() => {
                          setSoakTask(null);
                          navigate('/batches');
                        }}
                      >
                        Go to Batches page to add seed inventory
                      </button>
                    </div>
                  ) : (
                      <Select
                        value={selectedBatchId?.toString() || ''}
                        onValueChange={(value) => {
                          const parsed = parseInt(value, 10);
                          console.log('[DailyFlow] Soak dialog batch selected:', { value, parsed });
                          setSelectedBatchId(parsed);
                          setSoakQuantityGrams(''); // Reset quantity when batch changes
                        }}
                      >
                      <SelectTrigger id="soak-batch-select" className="w-full">
                        <SelectValue placeholder="Select a seed batch" />
                      </SelectTrigger>
                      <SelectContent>
                      {availableBatches.map((batch) => {
                        const quantityLabel = formatQuantityDisplay(batch.quantity, batch.unit);
                        return (
                      <SelectItem key={batch.batchid} value={batch.batchid.toString()}>
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {batch.variety_name} - Batch #{batch.batchid}
                              </span>
                              <span className="text-xs text-slate-500">
                                  {quantityLabel} available
                                {batch.lot_number && ` • Lot: ${batch.lot_number}`}
                              </span>
                            </div>
                          </SelectItem>
                        );
                      })}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Quantity to Soak */}
                {selectedBatch && !canSoakPartial ? (
                  <div className="space-y-2">
                    <Label htmlFor="soak-quantity" className="text-sm font-medium text-slate-400">
                      Amount to Soak (grams) <span className="text-red-500">*</span>
                    </Label>
                    <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                      <p className="text-sm text-slate-600">
                        <strong>Insufficient inventory:</strong> Only {availableGrams.toFixed(2)}g available, but {seedPerTray.toFixed(2)}g is needed per tray. 
                        Not enough for even 1 tray. Please reschedule or cancel this request.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="soak-quantity" className="text-sm font-medium">
                      Amount to Soak (grams) <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="soak-quantity"
                      type="number"
                      min="0"
                      step="0.01"
                      max={selectedBatch ? availableGrams : undefined}
                      placeholder="Enter amount in grams"
                      value={soakQuantityGrams}
                      onChange={(e) => setSoakQuantityGrams(e.target.value)}
                      className={cn("w-full", (hasShortage || isInsufficient) && "border-amber-500")}
                      disabled={selectedBatch && !canSoakPartial}
                      required
                    />
                    {seedPerTray > 0 && remaining > 0 && (
                      <p className="text-xs text-slate-500">
                        {remaining} trays × {seedPerTray}g = {gramsNeeded.toFixed(2)}g recommended
                      </p>
                    )}
                    {selectedBatch && (
                      <p className="text-xs text-slate-500">
                        Maximum available: {availableGrams.toFixed(2)}g
                        {!canSoakPartial && seedPerTray > 0 && (
                          <span className="text-amber-600 ml-2">
                            (Not enough for 1 tray - need {seedPerTray}g, have {availableGrams.toFixed(2)}g)
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSoakTask(null);
                setSelectedBatchId(null);
                setAvailableBatches([]);
                setSoakQuantityGrams('');
                setSeedQuantityPerTray(0);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSoakConfirm}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              disabled={(() => {
                if (!soakTask) return true;
                const selectedBatch = availableBatches.find(b => b.batchid === selectedBatchId);
                if (!selectedBatch) return !selectedBatchId || !soakQuantityGrams || isSubmittingSeeding.current || completingIds.has(soakTask?.id || '') || availableBatches.length === 0;
                const availableGrams = getBatchAvailableGrams(selectedBatch);
                const seedPerTray = seedQuantityPerTray || 0;
                const canSoakPartial = seedPerTray > 0 ? Math.floor(availableGrams / seedPerTray) > 0 : false;
                return !selectedBatchId || !soakQuantityGrams || isSubmittingSeeding.current || completingIds.has(soakTask?.id || '') || availableBatches.length === 0 || !canSoakPartial;
              })()}
            >
              {isSubmittingSeeding.current || completingIds.has(soakTask?.id || '') ? (
                'Processing...'
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Complete Soak
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Seed Task Completion Dialog */}
      <Dialog open={!!seedingTask} onOpenChange={(open) => {
        if (!open) {
          setSeedingTask(null);
          setSelectedBatchId(null);
          setAvailableBatches([]);
          setSeedQuantityCompleted('');
          setMissedStepForSeeding(null);
          setIsSoakVariety(false);
          setAvailableSoakedSeed(null);
          setSeedingDialogReady(false);
        }
      }}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-700">
              <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                <Sprout className="h-5 w-5" />
              </div>
              Time to Seed!
            </DialogTitle>
            <DialogDescription>
              Select a seed batch to complete seeding and create trays
            </DialogDescription>
          </DialogHeader>

          {seedingTask && (() => {
            console.log('[DailyFlow] Rendering seeding dialog content:', {
              taskId: seedingTask.id,
              isSoakVariety,
              hasAvailableSoakedSeed: !!availableSoakedSeed,
            });
            const remainingTrays = Math.max(0, (seedingTask.quantity || 0) - (seedingTask.quantityCompleted || 0));
            const selectedBatch = availableBatches.find((b) => b.batchid === selectedBatchId);
            const seedPerTray = seedQuantityPerTray || 0;
            const traysInput = parseInt(seedQuantityCompleted || '0', 10) || 0;
            const traysToSeed = traysInput > 0 ? traysInput : remainingTrays;
            const gramsNeeded = seedPerTray > 0 ? traysToSeed * seedPerTray : 0;
            const totalNeeded = seedPerTray > 0 ? remainingTrays * seedPerTray : 0;
            const convertedAvailableGrams =
              selectedBatch?.quantity_grams ??
              convertQuantityValueToGrams(selectedBatch?.quantity, selectedBatch?.unit) ??
              0;
            const availableGrams = convertedAvailableGrams || 0;
            const maxTraysPossible = seedPerTray > 0 ? Math.floor(availableGrams / seedPerTray) : 0;
            const hasShortage = seedPerTray > 0 && totalNeeded > availableGrams;
            const shortage = hasShortage ? totalNeeded - availableGrams : 0;
            const canSeedPartial = hasShortage && maxTraysPossible > 0;

            return (
              <div className="space-y-6 py-4">
                {/* Summary Card */}
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-indigo-600 font-medium uppercase">Variety</p>
                      <p className="text-lg font-bold text-indigo-900">{seedingTask.crop}</p>
                    </div>
                    <div>
                      <p className="text-xs text-indigo-600 font-medium uppercase">Remaining</p>
                      <p className="text-lg font-bold text-indigo-900">
                        {remainingTrays} tray{remainingTrays !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Soak Variety: Show available soaked seed */}
                {isSoakVariety && (
                  <div className="space-y-3">
                    {!seedingDialogReady ? (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                        <p className="text-sm text-slate-600">Checking for soaked seed...</p>
                      </div>
                    ) : availableSoakedSeed ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <p className="text-sm font-medium text-green-900 mb-2">Soaked Seed Available</p>
                        <p className="text-base text-green-800">
                          {Number(availableSoakedSeed.quantity_remaining).toFixed(2)} {availableSoakedSeed.unit || 'g'} READY TO SEED
                        </p>
                        <p className="text-xs text-green-600 mt-1">
                          Soaked: {formatLocalDate(availableSoakedSeed.soak_date)} |
                          Expires: {formatLocalDate(availableSoakedSeed.expires_at)}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 space-y-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-amber-900">No Soaked {seedingTask.crop} Available</p>
                            <p className="text-xs text-amber-700 mt-1">
                              This variety requires soaking before seeding. You can start soaking now, reschedule, or cancel this seeding.
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 pt-2 border-t border-amber-200">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!seedingDialogReady}
                            onClick={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log('[DailyFlow] Start Soaking Now clicked');
                              // Create a synthetic soak task from the seeding task
                              const syntheticSoakTask: DailyTask = {
                                ...seedingTask,
                                id: `soak-adhoc-${seedingTask.id}`,
                                action: 'Soak',
                                taskSource: 'soak_request',
                              };
                              setSeedingTask(null);
                              setSoakTask(syntheticSoakTask);
                              setSelectedBatchId(null);
                              setAvailableBatches([]);
                              setSoakQuantityGrams('');
                              // Default to today for ad-hoc soaks (user is soaking now)
                              setSoakDate(new Date().toISOString().split('T')[0]);
                              await fetchAvailableBatchesForRecipe(syntheticSoakTask);
                            }}
                            className="w-full justify-start text-blue-700 border-blue-300 hover:bg-blue-50"
                          >
                            <Beaker className="h-4 w-4 mr-2" />
                            Start Soaking Now
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!seedingDialogReady}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setRescheduleRequestDialog({
                                task: seedingTask,
                                newDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                              });
                            }}
                            className="w-full justify-start text-amber-800 border-amber-300 hover:bg-amber-100"
                          >
                            <Calendar className="h-4 w-4 mr-2" />
                            Reschedule Seeding
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!seedingDialogReady}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setCancelRequestDialog({
                                task: seedingTask,
                                reason: 'no_soaked_seed',
                              });
                            }}
                            className="w-full justify-start text-red-600 border-red-300 hover:bg-red-50"
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Cancel Seeding
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Non-Soak Variety: Batch Selection */}
                {!isSoakVariety && (
                  <div className="space-y-3">
                    <Label htmlFor="batch-select" className="text-sm font-medium">
                      Seed Batch <span className="text-red-500">*</span>
                    </Label>
                    {loadingBatches ? (
                      <div className="text-sm text-slate-500">Loading available batches...</div>
                    ) : availableBatches.length === 0 ? (
                      <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p>No available batches found for this variety.</p>
                        <button
                          className="text-amber-700 underline font-medium hover:text-amber-800 mt-1 block"
                          onClick={() => {
                            setSeedingTask(null);
                            navigate('/batches');
                          }}
                        >
                          Go to Batches page to add seed inventory
                        </button>
                      </div>
                    ) : (
                      <Select
                        value={selectedBatchId?.toString() || ''}
                        onValueChange={(value) => {
                          const parsed = parseInt(value, 10);
                          console.log('[DailyFlow] Seeding dialog batch selected:', { value, parsed });
                          setSelectedBatchId(parsed);
                        }}
                      >
                        <SelectTrigger id="batch-select" className="w-full">
                          <SelectValue placeholder="Select a seed batch" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableBatches.map((batch) => (
                            <SelectItem key={batch.batchid} value={batch.batchid.toString()}>
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {batch.variety_name} - Batch #{batch.batchid}
                                </span>
                                <span className="text-xs text-slate-500">
                                  {Number(batch.quantity).toFixed(2)} {batch.unit || 'grams'} available
                                  {batch.lot_number && ` • Lot: ${batch.lot_number}`}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Calculation helper */}
                    {seedPerTray > 0 && (
                      <div className="text-xs text-slate-600">
                        {traysToSeed || remainingTrays} tray{(traysToSeed || remainingTrays) !== 1 ? 's' : ''} × {seedPerTray.toFixed(2)}g ={' '}
                        {gramsNeeded.toFixed(2)}g needed
                      </div>
                    )}
                    {selectedBatch && seedPerTray > 0 && (
                      <div className="text-xs text-slate-600">
                        Available: {availableGrams.toFixed(2)}g{' '}
                        {hasShortage ? (
                          <span className="text-amber-700 font-medium">⚠ Insufficient</span>
                        ) : (
                          <span className="text-green-700 font-medium">✓ Sufficient</span>
                        )}
                        {hasShortage && maxTraysPossible > 0 && (
                          <span className="text-amber-700 ml-2">(can seed {maxTraysPossible} tray{maxTraysPossible !== 1 ? 's' : ''})</span>
                        )}
                      </div>
                    )}

                    {/* Shortage options */}
                    {hasShortage && selectedBatch && (
                      <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-amber-900">Insufficient Inventory</p>
                            <p className="text-xs text-amber-800">
                              Need {totalNeeded.toFixed(2)}g for {remainingTrays} trays; available {availableGrams.toFixed(2)}g (short {shortage.toFixed(2)}g).
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 pt-2 border-t border-amber-200">
                          {canSeedPartial && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSeedQuantityCompleted(maxTraysPossible.toString())}
                              className="justify-start text-amber-800 border-amber-300 hover:bg-amber-100"
                            >
                              Seed Partial ({maxTraysPossible} tray{maxTraysPossible !== 1 ? 's' : ''})
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setRescheduleRequestDialog({
                                task: seedingTask,
                                newDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                              })
                            }
                            className="justify-start text-amber-800 border-amber-300 hover:bg-amber-100"
                          >
                            <Calendar className="h-4 w-4 mr-2" />
                            Reschedule Request
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setCancelRequestDialog({
                                task: seedingTask,
                                reason: 'insufficient_inventory',
                              })
                            }
                            className="justify-start text-red-600 border-red-300 hover:bg-red-50"
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Cancel Request
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Quantity to Seed */}
                <div className="space-y-2">
                  <Label htmlFor="seed-quantity" className="text-sm font-medium">
                    Trays to Seed <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="seed-quantity"
                    type="number"
                    min="1"
                    max={remainingTrays}
                    placeholder="Enter number of trays"
                    value={seedQuantityCompleted}
                    onChange={(e) => setSeedQuantityCompleted(e.target.value)}
                    className="w-full"
                    required
                  />
                  <p className="text-xs text-slate-500">
                    Remaining: {remainingTrays} trays
                  </p>
                  {!isSoakVariety && selectedBatch && seedPerTray > 0 && (
                    <p className="text-xs text-slate-500">
                      {seedQuantityCompleted ? seedQuantityCompleted : traysToSeed} tray{(seedQuantityCompleted || traysToSeed) !== 1 ? 's' : ''} × {seedPerTray.toFixed(2)}g = {gramsNeeded.toFixed(2)}g
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSeedingTask(null);
                setSelectedBatchId(null);
                setAvailableBatches([]);
                setSeedQuantityCompleted('');
                setMissedStepForSeeding(null);
                setIsSoakVariety(false);
                setAvailableSoakedSeed(null);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSeedingConfirm}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              disabled={(!isSoakVariety && !selectedBatchId) || !seedQuantityCompleted || isSubmittingSeeding.current || completingIds.has(seedingTask?.id || '') || (availableBatches.length === 0 && !isSoakVariety) || (isSoakVariety && !availableSoakedSeed)}
            >
              {isSubmittingSeeding.current || completingIds.has(seedingTask?.id || '') ? (
                'Processing...'
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Complete Seeding
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Use Soaked Seed Dialog */}
      <Dialog open={!!useSoakedSeedDialog} onOpenChange={(open) => !open && setUseSoakedSeedDialog(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Use Soaked Seed</DialogTitle>
            <DialogDescription>
              Create ad-hoc trays from leftover soaked seed
            </DialogDescription>
          </DialogHeader>
          {useSoakedSeedDialog && (
            <div className="space-y-4 py-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <p className="text-sm font-medium text-slate-900 mb-1">{useSoakedSeedDialog.variety_name}</p>
                <p className="text-xs text-slate-600">
                  {Number(useSoakedSeedDialog.quantity_remaining).toFixed(2)} {useSoakedSeedDialog.unit || 'g'} available
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="use-quantity">Number of Trays</Label>
                <Input
                  id="use-quantity"
                  type="number"
                  min="1"
                  value={useSoakedSeedQuantity}
                  onChange={(e) => setUseSoakedSeedQuantity(e.target.value)}
                  placeholder="Enter number of trays"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUseSoakedSeedDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUseSoakedSeed}
              disabled={!useSoakedSeedQuantity || parseInt(useSoakedSeedQuantity) <= 0}
            >
              <Package className="h-4 w-4 mr-2" />
              Create Trays
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discard Soaked Seed Dialog */}
      <Dialog open={!!discardSoakedSeedDialog} onOpenChange={(open) => !open && setDiscardSoakedSeedDialog(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Discard Soaked Seed</DialogTitle>
            <DialogDescription>
              Mark soaked seed as waste
            </DialogDescription>
          </DialogHeader>
          {discardSoakedSeedDialog && (
            <div className="space-y-4 py-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm font-medium text-red-900 mb-1">{discardSoakedSeedDialog.variety_name}</p>
                <p className="text-xs text-red-700">
                  {discardSoakedSeedDialog.quantity_remaining} {discardSoakedSeedDialog.unit || 'g'} will be discarded
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="discard-reason">Reason</Label>
                <Select value={discardReason} onValueChange={setDiscardReason}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="contaminated">Contaminated</SelectItem>
                    <SelectItem value="over-soaked">Over-soaked</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardSoakedSeedDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleDiscardSoakedSeed}
              variant="destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Request Dialog */}
      <Dialog open={!!cancelRequestDialog} onOpenChange={(open) => !open && setCancelRequestDialog(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Cancel Seeding Request</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this request?
            </DialogDescription>
          </DialogHeader>
          {cancelRequestDialog && (
            <div className="space-y-4 py-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm font-medium text-red-900 mb-1">
                  {cancelRequestDialog.task.crop}
                </p>
                <p className="text-xs text-red-700">
                  {(() => {
                    const remaining = (cancelRequestDialog.task.quantity || 0) - (cancelRequestDialog.task.quantityCompleted || 0);
                    return `${remaining} tray${remaining !== 1 ? 's' : ''} remaining`;
                  })()}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cancel-reason">Cancellation Reason</Label>
                <Select 
                  value={cancelRequestDialog.reason} 
                  onValueChange={(value) => setCancelRequestDialog({ ...cancelRequestDialog, reason: value })}
                >
                  <SelectTrigger id="cancel-reason">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="insufficient_inventory">Insufficient Inventory</SelectItem>
                    <SelectItem value="no_soaked_seed">No Soaked Seed Available</SelectItem>
                    <SelectItem value="changed_plans">Changed Plans</SelectItem>
                    <SelectItem value="quality_issues">Quality Issues</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelRequestDialog(null)}>
              Keep Request
            </Button>
            <Button
              onClick={handleCancelRequest}
              variant="destructive"
              disabled={!cancelRequestDialog?.reason || isCancellingRequest}
            >
              {isCancellingRequest ? 'Cancelling...' : 'Cancel Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Request Dialog */}
      <Dialog open={!!rescheduleRequestDialog} onOpenChange={(open) => !open && setRescheduleRequestDialog(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Reschedule Seeding Request</DialogTitle>
            <DialogDescription>
              Choose a new date for this seeding request
            </DialogDescription>
          </DialogHeader>
          {rescheduleRequestDialog && (
            <div className="space-y-4 py-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-900 mb-1">
                  {rescheduleRequestDialog.task.crop}
                </p>
                <p className="text-xs text-blue-700">
                  {(() => {
                    const remaining = (rescheduleRequestDialog.task.quantity || 0) - (rescheduleRequestDialog.task.quantityCompleted || 0);
                    return `${remaining} tray${remaining !== 1 ? 's' : ''} remaining`;
                  })()}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reschedule-date">New Seed Date</Label>
                <Input
                  id="reschedule-date"
                  type="date"
                  value={rescheduleRequestDialog.newDate}
                  onChange={(e) => setRescheduleRequestDialog({ ...rescheduleRequestDialog, newDate: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full"
                  required
                />
                <p className="text-xs text-slate-500">
                  Select a future date for this seeding request
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleRequestDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleRescheduleRequest}
              disabled={!rescheduleRequestDialog?.newDate}
            >
              Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Passive Step Details Dialog */}
      <Dialog open={!!passiveStepDetails} onOpenChange={(open) => !open && setPassiveStepDetails(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-700">
              <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                {passiveStepDetails && (() => {
                  const name = passiveStepDetails.stepName.toLowerCase();
                  if (name.includes('germination')) return <Sprout className="h-5 w-5 text-slate-600" />;
                  if (name.includes('blackout')) return <Sun className="h-5 w-5 text-slate-600" />;
                  if (name.includes('growing')) return <Droplets className="h-5 w-5 text-slate-600" />;
                  return <Clock className="h-5 w-5 text-slate-600" />;
                })()}
              </div>
              {passiveStepDetails?.stepName} - {passiveStepDetails?.totalTrays} {passiveStepDetails?.totalTrays === 1 ? 'Tray' : 'Trays'}
            </DialogTitle>
            <DialogDescription>
              Breakdown by variety
            </DialogDescription>
          </DialogHeader>
          {passiveStepDetails && (
            <div className="space-y-4 py-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="space-y-3">
                  {passiveStepDetails.varieties.map((variety, index) => (
                    <div 
                      key={index}
                      className={cn(
                        "flex items-center justify-between py-2",
                        index < passiveStepDetails.varieties.length - 1 && "border-b border-slate-200"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-slate-400"></div>
                        <span className="text-sm font-medium text-slate-900">{variety.recipe}</span>
                      </div>
                      <span className="text-sm text-slate-600 font-mono">
                        {variety.trays} {variety.trays === 1 ? 'tray' : 'trays'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPassiveStepDetails(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error Dialog for Critical Errors */}
      <Dialog open={errorDialog.show} onOpenChange={(open) => !open && setErrorDialog({ show: false, message: '', title: '' })}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5" />
              </div>
              {errorDialog.title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-900">{errorDialog.message}</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setErrorDialog({ show: false, message: '', title: '' })}
              className="w-full bg-red-600 hover:bg-red-700"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Skip All Confirmation Dialog */}
      <Dialog open={!!skipAllTask} onOpenChange={(open) => !open && setSkipAllTask(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                <FastForward className="h-5 w-5" />
              </div>
              Skip All Missed Steps?
            </DialogTitle>
            <DialogDescription>
              This will skip all missed steps for this crop
            </DialogDescription>
          </DialogHeader>

          {skipAllTask && skipAllTask.missedSteps && (
            <div className="space-y-4 py-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-amber-600 font-medium uppercase">Crop</p>
                    <p className="text-lg font-bold text-amber-900">{skipAllTask.crop}</p>
                  </div>
                  <div>
                    <p className="text-xs text-amber-600 font-medium uppercase">Missed Steps</p>
                    <p className="text-base font-semibold text-amber-900">
                      {skipAllTask.missedSteps.length} {skipAllTask.missedSteps.length === 1 ? 'step' : 'steps'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-slate-700">
                  Are you sure you want to skip all {skipAllTask.missedSteps.length} missed {skipAllTask.missedSteps.length === 1 ? 'step' : 'steps'} for <strong>{skipAllTask.crop}</strong>?
                </p>
                <p className="text-xs text-slate-500">
                  This will clear your backlog and mark all missed steps as skipped. You can still complete them later if needed.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setSkipAllTask(null)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSkipAllConfirm}
              className="flex-1 bg-amber-600 hover:bg-amber-700"
            >
              <FastForward className="h-4 w-4 mr-2" />
              Skip All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tray Reallocation Confirmation Dialog */}
      <Dialog open={!!gapReallocationConfirm} onOpenChange={(open) => !open && setGapReallocationConfirm(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700">
              <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5" />
              </div>
              {gapReallocationConfirm?.action === 'harvestEarly' && 'Harvest Early?'}
              {gapReallocationConfirm?.action === 'keepForFuture' && 'Skip Today\'s Delivery?'}
              {gapReallocationConfirm?.action === 'cancel' && 'Cancel Delivery?'}
            </DialogTitle>
            <DialogDescription>
              {gapReallocationConfirm?.action === 'harvestEarly' && 'This will move the harvest date to today'}
              {gapReallocationConfirm?.action === 'keepForFuture' && 'Keep the tray for its scheduled delivery date'}
              {gapReallocationConfirm?.action === 'cancel' && 'Cancel this delivery entirely'}
            </DialogDescription>
          </DialogHeader>

          {gapReallocationConfirm && (
            <div className="space-y-4 py-4">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <div>
                      <p className="text-xs text-orange-600 font-medium uppercase">Customer</p>
                      <p className="text-lg font-bold text-orange-900">{gapReallocationConfirm.gap.customer_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-orange-600 font-medium uppercase">Tray</p>
                      <p className="text-lg font-bold text-orange-900">#{gapReallocationConfirm.tray.tray_id}</p>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <div>
                      <p className="text-xs text-orange-600 font-medium uppercase">Delivery Date</p>
                      <p className="text-orange-800">
                        {formatLocalDate(gapReallocationConfirm.gap.scheduled_delivery_date || gapReallocationConfirm.gap.delivery_date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-orange-600 font-medium uppercase">Harvest Ready</p>
                      <p className="text-orange-800">
                        {formatLocalDate(gapReallocationConfirm.tray.harvest_date)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {gapReallocationConfirm.action === 'harvestEarly' && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-amber-800">
                      {gapReallocationConfirm.nextDeliveryDate
                        ? `This will remove coverage for the ${formatLocalDate(gapReallocationConfirm.nextDeliveryDate)} delivery. You may need to plant more trays to cover that date.`
                        : 'This tray was scheduled for a future delivery. You may need to plant more trays to cover that date.'}
                    </p>
                  </div>
                </div>
              )}

              {gapReallocationConfirm.action === 'keepForFuture' && (
                <p className="text-sm text-slate-600">
                  Today's delivery will be skipped. The tray will remain assigned for the {formatLocalDate(gapReallocationConfirm.nextDeliveryDate || gapReallocationConfirm.tray.harvest_date)} delivery.
                </p>
              )}

              {gapReallocationConfirm.action === 'cancel' && (
                <p className="text-sm text-slate-600">
                  This will cancel today's scheduled delivery for {gapReallocationConfirm.gap.customer_name}.
                </p>
              )}
            </div>
          )}

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setGapReallocationConfirm(null)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleReallocationConfirm}
              className={cn(
                "flex-1",
                gapReallocationConfirm?.action === 'harvestEarly' && "bg-orange-600 hover:bg-orange-700",
                gapReallocationConfirm?.action === 'keepForFuture' && "bg-blue-600 hover:bg-blue-700",
                gapReallocationConfirm?.action === 'cancel' && "bg-slate-600 hover:bg-slate-700"
              )}
            >
              {gapReallocationConfirm?.action === 'harvestEarly' && 'Harvest Early'}
              {gapReallocationConfirm?.action === 'keepForFuture' && 'Keep for Later'}
              {gapReallocationConfirm?.action === 'cancel' && 'Cancel Delivery'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Early Harvest Confirmation Dialog - for completing orders with early harvest */}
      <Dialog open={!!earlyHarvestConfirm} onOpenChange={(open) => !open && setEarlyHarvestConfirm(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700">
              <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5" />
              </div>
              Complete Order Early?
            </DialogTitle>
            <DialogDescription>
              Some varieties will be harvested before their scheduled date
            </DialogDescription>
          </DialogHeader>

          {earlyHarvestConfirm && (
            <div className="space-y-4 py-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <p className="text-xs text-emerald-600 font-medium uppercase mb-2">Ready to Harvest</p>
                <div className="flex flex-wrap gap-1.5">
                  {earlyHarvestConfirm.readyVarieties.map((variety, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-emerald-100 text-emerald-800 rounded-full"
                    >
                      <span className="text-emerald-600">✓</span>
                      {variety}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <p className="text-xs text-orange-600 font-medium uppercase mb-2">
                  Will be Harvested Early ({earlyHarvestConfirm.mismatchedTrays.length})
                </p>
                <div className="space-y-2">
                  {earlyHarvestConfirm.mismatchedTrays.map((tray) => (
                    <div
                      key={tray.tray_id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="font-medium text-orange-900">
                        {tray.variety_name || tray.recipe_name}
                      </span>
                      <span className="text-orange-700">
                        Tray #{tray.tray_id} • was due {formatLocalDate(tray.harvest_date)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-amber-800">
                    Harvesting early may affect future deliveries. You may need to plant additional trays to cover those dates.
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setEarlyHarvestConfirm(null)}
              className="flex-1"
              disabled={isProcessingEarlyHarvest}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmEarlyHarvest}
              className="flex-1 bg-orange-600 hover:bg-orange-700"
              disabled={isProcessingEarlyHarvest}
            >
              {isProcessingEarlyHarvest ? 'Processing...' : 'Confirm & Complete Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lost Tray Dialog - for marking trays as lost/failed */}
      <Dialog open={!!lostTask} onOpenChange={(open) => !open && setLostTask(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="h-5 w-5" />
              </div>
              Mark Trays as Lost
            </DialogTitle>
            <DialogDescription>
              Record why these trays failed to complete their growth cycle
            </DialogDescription>
          </DialogHeader>

          {lostTask && (
            <div className="space-y-6 py-4">
              {/* Summary Card */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-red-600 font-medium uppercase">Crop</p>
                    <p className="text-lg font-bold text-red-900">{lostTask.crop}</p>
                  </div>
                  <div>
                    <p className="text-xs text-red-600 font-medium uppercase">Trays Affected</p>
                    <p className="text-lg font-bold text-red-900">{lostTask.trays} {lostTask.trays === 1 ? 'tray' : 'trays'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-red-600 font-medium uppercase">Current Day</p>
                    <p className="text-base text-red-800">Day {lostTask.dayCurrent} of {lostTask.dayTotal}</p>
                  </div>
                  <div>
                    <p className="text-xs text-red-600 font-medium uppercase">Location</p>
                    <p className="text-base text-red-800">{lostTask.location}</p>
                  </div>
                </div>
              </div>

              {/* Loss Reason Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">What went wrong? <span className="text-red-500">*</span></Label>
                <div className="grid grid-cols-2 gap-2">
                  {LOSS_REASONS.map((reason) => (
                    <button
                      key={reason.value}
                      type="button"
                      onClick={() => setLossReason(reason.value)}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-all",
                        lossReason === reason.value
                          ? "border-red-500 bg-red-50 ring-2 ring-red-500/20"
                          : "border-slate-200 hover:border-red-300 hover:bg-red-50/50"
                      )}
                    >
                      <p className="font-medium text-sm text-slate-900">{reason.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{reason.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="loss-notes">Additional Notes (optional)</Label>
                <Textarea
                  id="loss-notes"
                  placeholder="Any additional details about what happened..."
                  value={lossNotes}
                  onChange={(e) => setLossNotes(e.target.value)}
                  className="resize-none"
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setLostTask(null)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleLostConfirm}
              className="flex-1 bg-red-600 hover:bg-red-700"
              disabled={!lossReason || completingIds.has(lostTask?.id || '')}
            >
              {completingIds.has(lostTask?.id || '') ? (
                'Processing...'
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Mark as Lost
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contacted Modal */}
      {manageOrderDialog && fulfillmentAction === 'contacted' && (
        <Dialog open={!!manageOrderDialog} onOpenChange={(open) => !open && (setManageOrderDialog(null), setFulfillmentAction(''))}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-blue-600" />
                Log Customer Contact
              </DialogTitle>
              <DialogDescription>
                {manageOrderDialog.crop} — {manageOrderDialog.customerName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={fulfillmentNotes}
                  onChange={(e) => setFulfillmentNotes(e.target.value)}
                  placeholder="Called Marie, left voicemail about missing Purple Basil. Will call back tomorrow."
                  rows={4}
                />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-800">⚠️ Item will remain in At-Risk list</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setManageOrderDialog(null); setFulfillmentAction(''); setFulfillmentNotes(''); }}>
                Cancel
              </Button>
              <Button onClick={handleFulfillmentAction} disabled={isProcessingFulfillment || !fulfillmentNotes.trim()}>
                {isProcessingFulfillment ? 'Processing...' : 'Log Contact'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Skip Modal */}
      {manageOrderDialog && fulfillmentAction === 'skip' && (
        <Dialog open={!!manageOrderDialog} onOpenChange={(open) => !open && (setManageOrderDialog(null), setFulfillmentAction(''))}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <SkipForward className="h-5 w-5 text-amber-600" />
                Skip Item
              </DialogTitle>
              <DialogDescription>
                Skipping: {manageOrderDialog.crop}<br />
                For: {manageOrderDialog.customerName} - {manageOrderDialog.deliveryDate}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea
                  value={fulfillmentNotes}
                  onChange={(e) => setFulfillmentNotes(e.target.value)}
                  placeholder="Customer agreed to receive 3-variety box this week."
                  rows={3}
                />
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-xs text-green-800">✅ Item will be removed from At-Risk</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setManageOrderDialog(null); setFulfillmentAction(''); setFulfillmentNotes(''); }}>
                Cancel
              </Button>
              <Button onClick={handleFulfillmentAction} disabled={isProcessingFulfillment || !fulfillmentNotes.trim()}>
                {isProcessingFulfillment ? 'Processing...' : 'Skip Item'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Substitute Modal */}
      {manageOrderDialog && fulfillmentAction === 'substitute' && (
        <Dialog open={!!manageOrderDialog} onOpenChange={(open) => !open && (setManageOrderDialog(null), setFulfillmentAction(''), setSelectedSubstitute(null))}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-green-600" />
                Substitute Item
              </DialogTitle>
              <DialogDescription>
                Replace: {manageOrderDialog.crop}<br />
                For: {manageOrderDialog.customerName} - {manageOrderDialog.deliveryDate}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Substitute with</Label>
                <Select value={selectedSubstitute?.toString() || ''} onValueChange={(value) => setSelectedSubstitute(parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select variety..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSubstitutes.map((sub) => {
                      const label = sub.variety_name || sub.recipe_name || 'Unknown';
                      return (
                        <SelectItem key={sub.recipe_id} value={sub.recipe_id.toString()}>
                          {label} ({sub.trays_ready} {sub.trays_ready === 1 ? 'tray' : 'trays'} ready)
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  value={fulfillmentNotes}
                  onChange={(e) => setFulfillmentNotes(e.target.value)}
                  placeholder="Marie prefers sunflower as backup option."
                  rows={3}
                />
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-xs text-green-800">✅ Item will be removed from At-Risk</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setManageOrderDialog(null); setFulfillmentAction(''); setSelectedSubstitute(null); setFulfillmentNotes(''); }}>
                Cancel
              </Button>
              <Button onClick={handleFulfillmentAction} disabled={isProcessingFulfillment || !selectedSubstitute}>
                {isProcessingFulfillment ? 'Processing...' : 'Substitute'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Note Modal */}
      {manageOrderDialog && fulfillmentAction === 'note' && (
        <Dialog open={!!manageOrderDialog} onOpenChange={(open) => !open && (setManageOrderDialog(null), setFulfillmentAction(''))}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-slate-600" />
                Add Note
              </DialogTitle>
              <DialogDescription>
                {manageOrderDialog.crop} — {manageOrderDialog.customerName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Note</Label>
                <Textarea
                  value={fulfillmentNotes}
                  onChange={(e) => setFulfillmentNotes(e.target.value)}
                  placeholder="Checking if we can source from another farm."
                  rows={4}
                />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-800">⚠️ Item will remain in At-Risk list</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setManageOrderDialog(null); setFulfillmentAction(''); setFulfillmentNotes(''); }}>
                Cancel
              </Button>
              <Button onClick={handleFulfillmentAction} disabled={isProcessingFulfillment || !fulfillmentNotes.trim()}>
                {isProcessingFulfillment ? 'Processing...' : 'Save Note'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={!!traySelectionModal} onOpenChange={(open) => !open && closeTraySelectionModal()}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Choose a tray</DialogTitle>
            <DialogDescription>
              {traySelectionModal?.groupLabel
                ? `This group belongs to ${traySelectionModal.groupLabel}. Pick a tray to view its details.`
                : 'Select a tray to open its detail page.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-3">
            {traySelectionModal?.trayDetails.map((detail) => {
              const sowLabel = detail.sowDate ? formatShortDateLabel(detail.sowDate) : undefined;
              return (
                <Button
                  key={detail.trayId}
                  variant="outline"
                  className="w-full justify-between border-slate-200 hover:border-slate-300"
                  onClick={() => handleViewTrayDetail(detail.trayId)}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-semibold text-sm text-slate-900">Tray {detail.trayId}</span>
                    <span className="text-xs text-slate-500">
                      {(detail.varietyName || 'Unknown variety')}
                      {sowLabel ? ` • Sowed ${sowLabel}` : detail.sowDate ? ` • Sowed ${detail.sowDate}` : ''}
                    </span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-500" />
                </Button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeTraySelectionModal}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}

// --- SUB-COMPONENT: Passive Step Card ---
interface PassiveStepCardProps {
  stepName: string;
  totalTrays: number;
  onViewDetails: () => void;
}

const PassiveStepCard = ({ stepName, totalTrays, onViewDetails }: PassiveStepCardProps) => {
  // Get icon and tooltip based on step name
  const getIconAndTooltip = () => {
    const name = stepName.toLowerCase();
    if (name.includes('germination')) {
      return {
        icon: <Sprout className="h-6 w-6 text-slate-500" />,
        tooltip: "Trays currently germinating. These are covered and developing roots. No action needed - just monitor progress."
      };
    }
    if (name.includes('blackout')) {
      return {
        icon: <Sun className="h-6 w-6 text-slate-500" />,
        tooltip: "Trays in blackout phase. Keep covered to encourage stem growth. Check for mold and moisture levels."
      };
    }
    if (name.includes('growing') || name === 'grow') {
      return {
        icon: <Droplets className="h-6 w-6 text-slate-500" />,
        tooltip: "Trays actively growing under lights. Monitor watering schedule and check for any issues like yellowing or pests."
      };
    }
    if (name.includes('ready to harvest') || name.includes('harvest')) {
      return {
        icon: <Scissors className="h-6 w-6 text-green-600" />,
        tooltip: "Trays that have reached their full grow days and are ready to cut. These are a subset of Growing trays that can be harvested now."
      };
    }
    return {
      icon: <Clock className="h-6 w-6 text-slate-500" />,
      tooltip: `Trays in the ${stepName} phase. Click View Details to see individual trays and their status.`
    };
  };

  const { icon, tooltip } = getIconAndTooltip();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Card className="group relative overflow-hidden transition-all duration-300 hover:shadow-md border border-slate-200/70 bg-slate-50/80 rounded-2xl cursor-help">
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-base text-slate-900 leading-tight truncate">{stepName}</h4>
                <p className="text-xl font-bold text-slate-700 mt-1">
                  {totalTrays} {totalTrays === 1 ? 'Tray' : 'Trays'}
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full border-slate-300 text-slate-700 hover:bg-slate-100 h-9"
              onClick={onViewDetails}
            >
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </Button>
          </div>
        </Card>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
};

// --- SUB-COMPONENT: At-Risk Task Card with Action Buttons ---
interface AtRiskTaskCardProps {
  task: DailyTask;
  onAction: (task: DailyTask, actionType: FulfillmentActionType) => void;
  actionHistory?: any[];
  onViewDetails?: (task: DailyTask) => void;
  isAnimatingOut?: boolean;
}

type AtRiskActionConfig = {
  actionType: FulfillmentActionType;
  icon: LucideIcon;
  label: string;
  borderClass: string;
  hoverClass: string;
  strokeColor: string;
};

const atRiskActionConfigs: AtRiskActionConfig[] = [
  {
    actionType: 'contacted',
    icon: Phone,
    label: 'Log customer contact',
    borderClass: 'border-blue-200',
    hoverClass: 'hover:bg-blue-50',
    strokeColor: '#2563eb',
  },
  {
    actionType: 'skip',
    icon: SkipForward,
    label: 'Skip this item',
    borderClass: 'border-amber-200',
    hoverClass: 'hover:bg-amber-50',
    strokeColor: '#c2410c',
  },
  {
    actionType: 'substitute',
    icon: RefreshCw,
    label: 'Substitute this item',
    borderClass: 'border-emerald-200',
    hoverClass: 'hover:bg-emerald-50',
    strokeColor: '#15803d',
  },
  {
    actionType: 'note',
    icon: FileText,
    label: 'Add a note',
    borderClass: 'border-slate-300',
    hoverClass: 'hover:bg-slate-100',
    strokeColor: '#475467',
  },
];

const AtRiskActionCircle = ({
  config,
  onClick,
}: {
  config: AtRiskActionConfig;
  onClick: () => void;
}) => {
  const Icon = config.icon;
  return (
    <button
      type="button"
      className={cn(
        'h-8 w-8 rounded-full border-2 bg-white flex items-center justify-center transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-300',
        config.borderClass,
        config.hoverClass
      )}
      title={config.label}
      aria-label={config.label}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" stroke={config.strokeColor} strokeWidth={1.8} />
    </button>
  );
};

const AtRiskTaskCard = ({ task, onAction, actionHistory = [], onViewDetails, isAnimatingOut = false }: AtRiskTaskCardProps) => {
  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    // Parse date string (YYYY-MM-DD) as local date to avoid UTC timezone shift
    const dateOnly = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const [year, month, day] = dateOnly.split('-').map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      // Fallback to standard parsing if format is unexpected
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    // Create date in local timezone (month is 0-indexed)
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatActionType = (type: string) => {
    const labels: Record<string, string> = {
      'contacted': 'Contacted',
      'note': 'Note',
      'skip': 'Skipped',
      'substitute': 'Substituted',
      'partial': 'Partial'
    };
    return labels[type] || type;
  };

  return (
    <Card className={cn(
      "bg-amber-50 border-2 border-amber-200 hover:border-amber-300 transition-all",
      isAnimatingOut && "opacity-0 -translate-x-full scale-95 transition-all duration-500 ease-in-out"
    )}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-semibold text-amber-900 uppercase">At Risk</span>
            </div>
            <h4 className="font-semibold text-slate-900 text-sm mb-1">{task.crop}</h4>
            <p className="text-xs text-slate-600">{task.customerName}</p>
          </div>
          {onViewDetails && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewDetails(task)}
              className="h-6 w-6 p-0"
            >
              <Eye className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Order Details */}
        <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
          <div>
            <span className="text-amber-700">Delivery:</span>
            <span className="ml-1 font-semibold">{formatDate(task.deliveryDate || '')}</span>
          </div>
          <div>
            <span className="text-amber-700">Need:</span>
            <span className="ml-1 font-semibold">{task.traysNeeded || 0} tray{task.traysNeeded !== 1 ? 's' : ''}</span>
          </div>
          <div>
            <span className="text-amber-700">Have:</span>
            <span className="ml-1 font-semibold text-red-600">{task.traysReady || 0} tray{task.traysReady !== 1 ? 's' : ''}</span>
          </div>
          <div>
            <span className="text-amber-700">Missing:</span>
            <span className="ml-1 font-semibold text-red-600">{task.trays || 0}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {atRiskActionConfigs.map((config) => (
            <AtRiskActionCircle
              key={config.actionType}
              config={config}
              onClick={() => onAction(task, config.actionType)}
            />
          ))}
        </div>

        {/* Action History */}
        {actionHistory.length > 0 && (
          <div className="pt-2 border-t border-amber-200">
            <p className="text-xs font-medium text-amber-900 mb-1">Action History:</p>
            <div className="space-y-1">
              {actionHistory.slice(0, 2).map((action, idx) => (
                <div key={idx} className="text-xs text-amber-800">
                  • {formatDate(action.created_at)}: {formatActionType(action.action_type)}
                  {action.notes && (
                    <span className="text-amber-600 ml-1">- {action.notes.substring(0, 30)}{action.notes.length > 30 ? '...' : ''}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

// --- SUB-COMPONENT: The Modern Task Card ---
interface TaskCardProps {
  task: DailyTask;
  variant: 'harvest' | 'warning' | 'default' | 'prep' | 'seed' | 'water';
  onComplete: (task: DailyTask) => void;
  isCompleting: boolean;
  isAnimatingOut?: boolean;
  onViewDetails?: (task: DailyTask) => void;
  onSkip?: (task: DailyTask) => void;
  onMarkAsLost?: (task: DailyTask) => void;
  navigate?: ReturnType<typeof useNavigate>;
}

const TaskCard = ({ 
  task, 
  variant, 
  onComplete, 
  isCompleting, 
  isAnimatingOut = false, 
  onViewDetails, 
  onSkip, 
  onMarkAsLost,
  navigate
}: TaskCardProps) => {

  // Handle click on harvest cards to navigate to tray edit page
  const handleCardClick = useCallback(() => {
    if (variant !== 'harvest' || !navigate) return;
    
    // If we have tray IDs, navigate to the tray edit page
    if (task.trayIds && task.trayIds.length > 0) {
      // If single tray, go directly to edit page
      if (task.trayIds.length === 1) {
        navigate(`/trays/${task.trayIds[0]}?mode=edit`);
      } else {
        // For multiple trays, go to trays page filtered by recipe
        navigate(`/trays?recipe=${task.recipeId}`);
      }
    }
  }, [variant, task.trayIds, task.recipeId, navigate]);

  // Enhanced Color Schemes (Soft Backgrounds + Strong Accents)
  const styles = {
    harvest: {
      softBg: 'bg-emerald-50',
      softText: 'text-emerald-700',
      iconColor: 'text-emerald-600',
      border: 'border-emerald-100 hover:border-emerald-300',
      icon: <Scissors size={18} />,
      btn: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200',
      progressColor: '#059669', // emerald-600
      badge: 'bg-emerald-100 text-emerald-800'
    },
    warning: {
      softBg: 'bg-amber-50',
      softText: 'text-amber-700',
      iconColor: 'text-amber-600',
      border: 'border-amber-100 hover:border-amber-300',
      icon: <Sun size={18} />,
      btn: 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200',
      progressColor: '#d97706', // amber-600
      badge: 'bg-amber-100 text-amber-800'
    },
    prep: {
      softBg: 'bg-purple-50',
      softText: 'text-purple-700',
      iconColor: 'text-purple-600',
      border: 'border-purple-100 hover:border-purple-300',
      icon: <Beaker size={18} />,
      btn: 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-200',
      progressColor: '#7c3aed', // purple-600
      badge: 'bg-purple-100 text-purple-800'
    },
    seed: {
      softBg: 'bg-indigo-50',
      softText: 'text-indigo-700',
      iconColor: 'text-indigo-600',
      border: 'border-indigo-100 hover:border-indigo-300',
      icon: <Sprout size={18} />,
      btn: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200',
      progressColor: '#4f46e5', // indigo-600
      badge: 'bg-indigo-100 text-indigo-800'
    },
    water: {
      softBg: 'bg-cyan-50',
      softText: 'text-cyan-700',
      iconColor: 'text-cyan-600',
      border: 'border-cyan-100 hover:border-cyan-300',
      icon: <Droplets size={18} />,
      btn: 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-cyan-200',
      progressColor: '#0891b2', // cyan-600
      badge: 'bg-cyan-100 text-cyan-800'
    },
    default: {
      softBg: 'bg-slate-50',
      softText: 'text-slate-700',
      iconColor: 'text-slate-600',
      border: 'border-slate-200 hover:border-slate-300',
      icon: <Droplets size={18} />,
      btn: 'bg-slate-800 hover:bg-slate-900 text-white shadow-slate-200',
      progressColor: '#475569', // slate-600
      badge: 'bg-slate-100 text-slate-800'
    }
  };

  const style = styles[variant] || styles.default;
  const isCustomerOrder = variant === 'harvest' && Boolean(task.customerName);
  const progressPercent = Math.min((task.dayCurrent / task.dayTotal) * 100, 100);
  const trayCount = task.traysRemaining ?? task.trays;
  const isHarvestClickable = variant === 'harvest' && task.trayIds && task.trayIds.length > 0;

  return (
    <Card 
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden transition-all duration-300 bg-white border",
        "hover:shadow-lg hover:-translate-y-1", 
        style.border,
        isCustomerOrder && "ring-1 ring-emerald-200 shadow-emerald-200/50",
        isAnimatingOut && "opacity-0 translate-x-10 scale-95 transition-all duration-300",
        isHarvestClickable && "cursor-pointer"
      )}
      onClick={isHarvestClickable ? handleCardClick : undefined}
    >
      
      {/* 1. Header Section: Icon & Batch ID */}
      <div className="p-4 pb-2">
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-3">
            {/* Soft Icon Circle */}
            <div className={cn(
              "h-10 w-10 rounded-full flex items-center justify-center transition-colors",
              style.softBg,
              style.iconColor
            )}>
              {style.icon}
            </div>
            
            <div className="flex flex-col">
              <span className={cn(
                "text-xs font-bold uppercase tracking-wider",
                style.softText
              )}>
                {task.action}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {task.batchId}
              </span>
            </div>
          </div>

          <Badge variant="outline" className={cn("border-0 font-medium px-2", style.badge)}>
            {trayCount} {trayCount === 1 ? 'Tray' : 'Trays'}
          </Badge>
        </div>

        {/* 2. Hero Section: Crop Name */}
        <h3 className="text-lg font-bold text-slate-900 leading-tight mb-4 truncate pr-2">
          {task.crop}
        </h3>

        {/* 3. Info Grid: Stats */}
        <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs text-slate-500 mb-3">
          <div className="flex items-center gap-1.5">
            <Calendar size={14} className="text-slate-400" />
            <span>Day <span className="text-slate-900 font-semibold">{task.dayCurrent}</span>/{task.dayTotal}</span>
          </div>
          {/* For seeding tasks, show customer info instead of location (trays don't exist yet) */}
          {variant === 'seed' ? (
            task.customerName ? (
              <div className="flex items-center gap-1.5">
                <User size={14} className="text-slate-400" />
                <span className="truncate">{task.customerName}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <MapPin size={14} className="text-slate-400" />
                <span className="truncate text-slate-400">No customer</span>
              </div>
            )
          ) : (
            <div className="flex items-center gap-1.5">
              <MapPin size={14} className="text-slate-400" />
              <span className="truncate">{task.location}</span>
            </div>
          )}
        </div>
        
        {/* Show customer info for harvest orders */}
        {variant === 'harvest' && task.customerName && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-emerald-700 mb-2">
            <Badge variant="outline" className="border-emerald-200 text-emerald-700 px-2 py-0.5">
              Order
            </Badge>
            <span className="truncate">For: {task.customerName}</span>
            {task.deliveryDate && (
              <span className="text-slate-500">
                • Delivery {formatShortDateLabel(task.deliveryDate) ?? task.deliveryDate}
              </span>
            )}
          </div>
        )}
        
        {/* Show delivery date for seeding tasks with customers */}
        {variant === 'seed' && task.customerName && task.deliveryDate && (() => {
          // Parse date string as local date to avoid UTC timezone shift
          const dateOnly = task.deliveryDate.includes('T') ? task.deliveryDate.split('T')[0] : task.deliveryDate;
          const [year, month, day] = dateOnly.split('-').map(Number);
          const deliveryDate = !isNaN(year) && !isNaN(month) && !isNaN(day) 
            ? new Date(year, month - 1, day)
            : new Date(task.deliveryDate);
          return (
            <div className="text-xs text-slate-500 mb-2 flex items-center gap-1.5">
              <Calendar size={12} className="text-slate-400" />
              <span>Delivery: {deliveryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
          );
        })()}
        
        {/* Show weight info for seeding tasks with germination step requiring weight */}
        {variant === 'seed' && task.requiresWeight && task.weightLbs != null && task.weightLbs > 0 && (
          <div className="text-xs text-slate-600 mb-2 font-medium">
            Stack with {task.weightLbs}lb weight
          </div>
        )}

        {/* Show overdue indicator for seeding tasks */}
        {variant === 'seed' && task.isOverdue && task.daysOverdue && task.daysOverdue > 0 && (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-red-600 mb-2 bg-red-50 px-2 py-1 rounded-md border border-red-200">
            <AlertTriangle size={14} className="text-red-500" />
            <span>{task.daysOverdue} {task.daysOverdue === 1 ? 'day' : 'days'} overdue</span>
          </div>
        )}

        {/* Progress Bar (Subtle) */}
        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1">
          <div 
            className="h-full rounded-full transition-all duration-500" 
            style={{ 
              width: `${progressPercent}%`, 
              backgroundColor: style.progressColor 
            }} 
          />
        </div>

        {task.stepDescription && (
          <p className="mt-3 text-[11px] text-slate-500 leading-relaxed line-clamp-2 bg-slate-50 p-2 rounded-md border border-slate-100">
            {task.stepDescription}
          </p>
        )}
      </div>

      {/* 4. Action Footer */}
      {variant === 'harvest' ? (
        <div className="p-3 bg-white border-t border-slate-50 mt-auto text-xs text-slate-500 flex items-center gap-1.5">
          {isHarvestClickable ? (
            <>
              <span>Click card to view tray details and record harvest</span>
              <ArrowRight size={12} className="text-slate-400" />
            </>
          ) : (
            <span>Harvest actions are recorded from the tray details page; no inline action here.</span>
          )}
        </div>
      ) : (
        <div className="p-3 bg-white border-t border-slate-50 mt-auto">
          <div className="flex gap-2">
            <Button
              onClick={() => onComplete && onComplete(task)}
              disabled={isCompleting || !onComplete}
              className={cn(
                "flex-1 shadow-sm transition-all active:scale-95 font-semibold text-xs h-9",
                style.btn
              )}
            >
              {isCompleting ? 'Processing...' : (
                <span className="flex items-center gap-2">
                  {task.action.toLowerCase().includes('at risk') ? 'Manage Order' :
                   variant === 'seed' ? 'Start Seeding' : 
                   variant === 'prep' ? 'Begin Soak' : 'Mark Done'} 
                  <ArrowRight size={14} />
                </span>
              )}
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 bg-transparent"
                >
                  <MoreVertical size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => onViewDetails?.(task)}>
                  <Eye className="mr-2 h-4 w-4 text-slate-500" /> Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.location.href = `/trays?recipe=${task.recipeId}`}>
                  <ExternalLink className="mr-2 h-4 w-4 text-slate-500" /> View Trays
                </DropdownMenuItem>
                {(onSkip || onMarkAsLost) && <DropdownMenuSeparator />}
                {onSkip && (
                  <DropdownMenuItem onClick={() => onSkip(task)} className="text-amber-600">
                    <SkipForward className="mr-2 h-4 w-4" /> Skip Task
                  </DropdownMenuItem>
                )}
                {onMarkAsLost && (
                  <DropdownMenuItem onClick={() => onMarkAsLost(task)} className="text-red-600">
                    <Trash2 className="mr-2 h-4 w-4" /> Mark as Lost
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
    </Card>
  );
};

// --- SUB-COMPONENT: Missed Steps Card for Catch-Up ---
interface MissedStepsCardProps {
  task: DailyTask;
  onSkipMissed: (task: DailyTask, missedStep: MissedStep) => void;
  onCompleteMissed: (task: DailyTask, missedStep: MissedStep) => void;
  onSkipAll: (task: DailyTask) => void;
  isAnimatingOut?: boolean;
}

const MissedStepsCard = ({ task, onSkipMissed, onCompleteMissed, onSkipAll, isAnimatingOut = false }: MissedStepsCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const missedSteps = task.missedSteps || [];

  if (missedSteps.length === 0) return null;

  return (
    <Card className={cn(
      "border-amber-200 bg-amber-50/50",
      isAnimatingOut && "opacity-0 translate-x-full transition-all duration-300 ease-in-out"
    )}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h4 className="font-bold text-slate-900">{task.crop}</h4>
              <p className="text-xs text-slate-500">
                {missedSteps.length} missed {missedSteps.length === 1 ? 'step' : 'steps'} - Day {task.dayCurrent} of {task.dayTotal}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSkipAll(task)}
              className="text-amber-600 border-amber-300 hover:bg-amber-100"
            >
              <FastForward className="h-4 w-4 mr-1" />
              Skip All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="text-slate-500"
            >
              {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </Button>
          </div>
        </div>

        {/* Summary when collapsed */}
        {!expanded && (
          <div className="text-sm text-slate-600 bg-white/60 rounded-lg p-3 border border-amber-200/50">
            <p>
              You missed: {missedSteps.map(s => s.description || s.stepName).join(', ')}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Click to expand and handle each step individually, or "Skip All" to clear them.
            </p>
          </div>
        )}

        {/* Expanded view with individual steps */}
        {expanded && (
          <div className="space-y-2 mt-3">
            {missedSteps.map((step) => (
              <div
                key={step.stepId}
                className="flex items-center justify-between bg-white rounded-lg p-3 border border-amber-200/50"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-sm font-medium">
                    {step.expectedDay}
                  </div>
                  <div>
                    <p className="font-medium text-slate-700">{step.description || step.stepName}</p>
                    <p className="text-xs text-slate-500">Expected on Day {step.expectedDay}</p>
                    {(step.description || step.stepName || '').toLowerCase().includes('seed') && (
                      <p className="text-xs text-indigo-600 mt-1 italic">
                        Click "Seed" to select batch and create trays
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCompleteMissed(task, step)}
                    className={cn(
                      (step.description || step.stepName || '').toLowerCase().includes('seed')
                        ? "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600"
                        : "text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                    )}
                  >
                    {(step.description || step.stepName || '').toLowerCase().includes('seed') ? (
                      <>
                        <Sprout className="h-4 w-4 mr-1" />
                        Seed
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        Done
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSkipMissed(task, step)}
                    className="text-slate-500 hover:text-amber-600"
                    title="Skip this step - we decided not to seed this week"
                  >
                    <SkipForward className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};
