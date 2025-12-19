import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabaseClient';
import { Package, Scissors, ClipboardList, Filter, Calendar, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

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

const formatFullDate = (dateString: string): string => {
  return new Date(dateString).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'tray_created': return Package;
    case 'task_completed': return Scissors;
    case 'order_fulfilled': return ClipboardList;
    default: return Package;
  }
};

const getActivityStyles = (type: string) => {
  switch (type) {
    case 'tray_created': return { bg: 'bg-amber-100', color: 'text-amber-600' };
    case 'task_completed': return { bg: 'bg-emerald-100', color: 'text-emerald-600' };
    case 'order_fulfilled': return { bg: 'bg-blue-100', color: 'text-blue-600' };
    default: return { bg: 'bg-gray-100', color: 'text-gray-600' };
  }
};

const Activity = () => {
  const navigate = useNavigate();

  const [activities, setActivities] = useState<Array<{
    activity_id: string;
    activity_type: string;
    description: string;
    occurred_at: string;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('7days');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const ITEMS_PER_PAGE = 20;

  const fetchActivities = useCallback(async () => {
    setIsLoading(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      let query = getSupabaseClient()
        .from('recent_activity')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .order('occurred_at', { ascending: false })
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

      if (typeFilter !== 'all') {
        query = query.eq('activity_type', typeFilter);
      }

      const now = new Date();
      if (dateFilter === 'today') {
        const startOfDay = new Date(now.setHours(0, 0, 0, 0)).toISOString();
        query = query.gte('occurred_at', startOfDay);
      } else if (dateFilter === '7days') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('occurred_at', sevenDaysAgo);
      } else if (dateFilter === '30days') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('occurred_at', thirtyDaysAgo);
      }

      if (searchQuery.trim()) {
        query = query.ilike('description', `%${searchQuery.trim()}%`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching activities:', error);
      }

      if (data) {
        setActivities(data);
        setHasMore(data.length === ITEMS_PER_PAGE);
      }
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setIsLoading(false);
    }
  }, [page, typeFilter, dateFilter, searchQuery]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  useEffect(() => {
    setPage(0);
  }, [typeFilter, dateFilter, searchQuery]);

  const ActivityRow = ({ activity }: { activity: typeof activities[0] }) => {
    const Icon = getActivityIcon(activity.activity_type);
    const styles = getActivityStyles(activity.activity_type);
    
    return (
      <div className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0">
        <div className={`p-3 rounded-xl ${styles.bg}`}>
          <Icon size={20} className={styles.color} strokeWidth={2.5} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800">{activity.description}</p>
          <p className="text-xs text-gray-400">{formatFullDate(activity.occurred_at)}</p>
        </div>
        <span className="text-sm text-gray-500">{formatTimeAgo(activity.occurred_at)}</span>
      </div>
    );
  };

  const renderSkeleton = () => (
    <Card className="border-none shadow-sm rounded-2xl">
      <CardContent className="p-0">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 border-b border-gray-100 last:border-b-0">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
          <p className="text-sm text-gray-500">See everything happening across your farm.</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/')}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>

      <Card className="border-none shadow-sm rounded-2xl">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle className="flex items-center gap-2 text-gray-600 text-base">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
            <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
              <div className="flex items-center gap-2 w-full md:w-52">
                <Search className="h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search activity..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="md:w-44">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="tray_created">Tray Created</SelectItem>
                  <SelectItem value="task_completed">Task Completed</SelectItem>
                  <SelectItem value="order_fulfilled">Order Fulfilled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="md:w-44">
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="7days">Last 7 Days</SelectItem>
                  <SelectItem value="30days">Last 30 Days</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            renderSkeleton()
          ) : activities.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gray-100 mb-3">
                <Calendar className="h-5 w-5 text-gray-400" />
              </div>
              <p className="font-semibold text-gray-800">No activity found</p>
              <p className="text-sm text-gray-500">Try adjusting your filters.</p>
            </div>
          ) : (
            activities.map(activity => (
              <ActivityRow key={activity.activity_id} activity={activity} />
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button 
          variant="outline" 
          onClick={() => setPage(prev => Math.max(prev - 1, 0))}
          disabled={page === 0 || isLoading}
          className="gap-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <span className="text-sm text-gray-500">Page {page + 1}</span>
        <Button 
          variant="outline" 
          onClick={() => setPage(prev => prev + 1)}
          disabled={!hasMore || isLoading}
          className="gap-2"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default Activity;




