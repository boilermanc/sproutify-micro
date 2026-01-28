import { useState, useEffect, useCallback } from 'react';
import {
  Tag,
  RefreshCw,
  AlertCircle,
  Loader2,
  Printer,
  Check,
  CheckSquare,
  Square,
  Calendar,
  User
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

interface LabelableTray {
  tray_id: number;
  recipe_name: string;
  variety_name: string | null;
  harvest_date: string | null;
  sow_date: string | null;
  customer_name: string | null;
  customer_id: number | null;
}

const FarmHandLabels = () => {
  const [trays, setTrays] = useState<LabelableTray[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrayIds, setSelectedTrayIds] = useState<Set<number>>(new Set());
  const [printing, setPrinting] = useState(false);
  const [printSuccess, setPrintSuccess] = useState(false);

  const loadTrays = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      setError(null);

      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) throw new Error('Session not found');
      const { farmUuid } = JSON.parse(sessionData);

      // Get today's date for filtering
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      // Also get yesterday and tomorrow for a reasonable range
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      // Fetch trays harvested today/yesterday OR ready for harvest (status = 'harvested' within recent days)
      const { data: traysData, error: traysError } = await getSupabaseClient()
        .from('trays')
        .select(`
          tray_id,
          sow_date,
          harvest_date,
          customer_id,
          recipes!inner (
            recipe_name,
            variety_name
          ),
          customers (
            name
          )
        `)
        .eq('farm_uuid', farmUuid)
        .eq('status', 'harvested')
        .gte('harvest_date', yesterdayStr)
        .lte('harvest_date', todayStr)
        .order('harvest_date', { ascending: false });

      if (traysError) throw traysError;

      const normalized: LabelableTray[] = (traysData || []).map((t: any) => ({
        tray_id: t.tray_id,
        recipe_name: t.recipes?.recipe_name || 'Unknown',
        variety_name: t.recipes?.variety_name || null,
        harvest_date: t.harvest_date || null,
        sow_date: t.sow_date || null,
        customer_name: t.customers?.name || null,
        customer_id: t.customer_id || null,
      }));

      setTrays(normalized);
      setSelectedTrayIds(new Set()); // Clear selection on refresh
    } catch (err) {
      console.error('Error loading trays:', err);
      setError('Failed to load trays');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTrays();
  }, [loadTrays]);

  const toggleTray = (trayId: number) => {
    setSelectedTrayIds(prev => {
      const next = new Set(prev);
      if (next.has(trayId)) {
        next.delete(trayId);
      } else {
        next.add(trayId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedTrayIds(new Set(trays.map(t => t.tray_id)));
  };

  const selectNone = () => {
    setSelectedTrayIds(new Set());
  };

  const handlePrintLabels = async () => {
    if (selectedTrayIds.size === 0) return;

    try {
      setPrinting(true);
      setError(null);
      setPrintSuccess(false);

      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) throw new Error('Session not found');
      const { farmUuid, farmName } = JSON.parse(sessionData);

      // Prepare tray data for webhook
      const selectedTrays = trays.filter(t => selectedTrayIds.has(t.tray_id));
      const labelData = selectedTrays.map(t => ({
        tray_id: t.tray_id,
        recipe_name: t.recipe_name,
        variety_name: t.variety_name || t.recipe_name,
        harvest_date: t.harvest_date,
        sow_date: t.sow_date,
        customer_name: t.customer_name,
      }));

      // Get n8n webhook URL from environment or use default
      // The webhook endpoint should be configured in the farm settings
      const { data: farmSettings } = await getSupabaseClient()
        .from('farm_settings')
        .select('label_webhook_url')
        .eq('farm_uuid', farmUuid)
        .maybeSingle();

      const webhookUrl = farmSettings?.label_webhook_url;

      if (!webhookUrl) {
        throw new Error('Label printing webhook not configured. Please contact your farm manager.');
      }

      // Send to n8n webhook
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          farm_uuid: farmUuid,
          farm_name: farmName,
          trays: labelData,
          printed_at: new Date().toISOString(),
          tray_count: labelData.length,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send print request');
      }

      setPrintSuccess(true);
      // Clear selection after successful print
      setTimeout(() => {
        setSelectedTrayIds(new Set());
        setPrintSuccess(false);
      }, 3000);
    } catch (err) {
      console.error('Error printing labels:', err);
      setError(err instanceof Error ? err.message : 'Failed to print labels');
    } finally {
      setPrinting(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Print Labels</h1>
          <p className="text-sm text-slate-500">
            {trays.length === 0 ? 'No trays ready' : `${trays.length} tray${trays.length !== 1 ? 's' : ''} harvested`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => loadTrays(true)}
          disabled={refreshing}
        >
          <RefreshCw className={cn("h-5 w-5", refreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Card className="p-4 bg-red-50 border-red-200">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm">{error}</span>
          </div>
        </Card>
      )}

      {/* Success */}
      {printSuccess && (
        <Card className="p-4 bg-emerald-50 border-emerald-200">
          <div className="flex items-center gap-2 text-emerald-700">
            <Check className="h-5 w-5" />
            <span>Labels sent to printer!</span>
          </div>
        </Card>
      )}

      {/* Selection Controls */}
      {trays.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={selectAll}
              className="text-slate-600"
            >
              Select All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={selectNone}
              className="text-slate-600"
            >
              Clear
            </Button>
          </div>
          <span className="text-sm text-slate-500">
            {selectedTrayIds.size} selected
          </span>
        </div>
      )}

      {/* Tray List */}
      {trays.length === 0 ? (
        <Card className="p-8 text-center">
          <Tag className="h-12 w-12 mx-auto text-slate-400 mb-3" />
          <p className="text-lg font-medium text-slate-700">No trays to label</p>
          <p className="text-sm text-slate-500 mt-1">
            Harvested trays from today will appear here.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {trays.map((tray) => {
            const isSelected = selectedTrayIds.has(tray.tray_id);
            return (
              <Card
                key={tray.tray_id}
                className={cn(
                  "p-3 cursor-pointer transition-all active:scale-[0.98]",
                  isSelected
                    ? "border-purple-400 bg-purple-50 ring-2 ring-purple-200"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                )}
                onClick={() => toggleTray(tray.tray_id)}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex items-center justify-center w-6 h-6 rounded",
                    isSelected ? "text-purple-600" : "text-slate-400"
                  )}>
                    {isSelected ? (
                      <CheckSquare className="h-5 w-5" />
                    ) : (
                      <Square className="h-5 w-5" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-900">
                        {tray.variety_name || tray.recipe_name}
                      </span>
                      <span className="text-xs text-slate-400">
                        #{tray.tray_id}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-500">
                      {tray.harvest_date && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>Harvested {formatDate(tray.harvest_date)}</span>
                        </div>
                      )}
                      {tray.customer_name && (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{tray.customer_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Print Button - Fixed at bottom */}
      {trays.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 p-4 bg-white border-t border-slate-200 md:static md:border-t-0 md:bg-transparent md:p-0">
          <Button
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300"
            size="lg"
            onClick={handlePrintLabels}
            disabled={selectedTrayIds.size === 0 || printing}
          >
            {printing ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Sending to Printer...
              </>
            ) : (
              <>
                <Printer className="h-5 w-5 mr-2" />
                Print {selectedTrayIds.size} Label{selectedTrayIds.size !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

export default FarmHandLabels;
