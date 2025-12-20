import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  RefreshCcw, 
  Mail,
  Search,
  ExternalLink
} from 'lucide-react';

interface EmailEvent {
  id: string;
  email_id: string;
  event_type: string;
  recipient_email: string;
  subject: string;
  campaign_id: string | null;
  clicked_link: string | null;
  created_at: string;
}

const AdminEmailEvents = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [events, setEvents] = useState<EmailEvent[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Note: This assumes an email_events table exists
      // If it doesn't exist yet, this will show an empty state
      const { data: eventsData, error: eventsError } = await getSupabaseClient()
        .from('email_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (eventsError) {
        // Table might not exist yet - that's okay
        if (eventsError.code === 'PGRST116' || eventsError.message.includes('does not exist')) {
          console.log('Email events table does not exist yet');
          setEvents([]);
        } else if (eventsError.code === '42501' || eventsError.code === 'PGRST301' || eventsError.message.includes('permission denied')) {
          console.error('Permission denied - admin RLS policies may not be configured');
          // Show empty state with helpful message
          setEvents([]);
        } else {
          console.error('Error fetching email events:', eventsError);
          setEvents([]);
        }
      } else {
        setEvents(eventsData || []);
      }
    } catch (error) {
      console.error('Error fetching email events:', error);
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredEvents = events.filter(event => {
    if (typeFilter !== 'all' && event.event_type !== typeFilter) return false;
    if (searchTerm && 
        !event.recipient_email.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !event.subject.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !event.email_id.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !(event.campaign_id && event.campaign_id.toLowerCase().includes(searchTerm.toLowerCase()))) return false;
    return true;
  }).sort((a, b) => {
    if (sortOrder === 'newest') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    } else {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
  });

  const eventTypeColors: Record<string, string> = {
    'email.sent': 'bg-blue-100 text-blue-700',
    'email.delivered': 'bg-green-100 text-green-700',
    'email.delivery_delayed': 'bg-amber-100 text-amber-700',
    'email.complained': 'bg-orange-100 text-orange-700',
    'email.bounced': 'bg-red-100 text-red-700',
    'email.opened': 'bg-purple-100 text-purple-700',
    'email.clicked': 'bg-indigo-100 text-indigo-700',
  };

  const metrics = {
    total: events.length,
    sent: events.filter(e => e.event_type === 'email.sent').length,
    delivered: events.filter(e => e.event_type === 'email.delivered').length,
    opened: events.filter(e => e.event_type === 'email.opened').length,
    clicked: events.filter(e => e.event_type === 'email.clicked').length,
    bounced: events.filter(e => e.event_type === 'email.bounced').length,
    complained: events.filter(e => e.event_type === 'email.complained').length,
    uniqueRecipients: new Set(events.map(e => e.recipient_email)).size,
    uniqueCampaigns: new Set(events.filter(e => e.campaign_id).map(e => e.campaign_id)).size,
    last7Days: events.filter(e => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return new Date(e.created_at) >= weekAgo;
    }).length,
  };

  const openRate = metrics.delivered > 0 
    ? Math.round((metrics.opened / metrics.delivered) * 100) 
    : 0;
  const clickRate = metrics.delivered > 0 
    ? Math.round((metrics.clicked / metrics.delivered) * 100) 
    : 0;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-gray-100 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Email Events</h1>
          <p className="text-gray-500 font-medium mt-1">Track email delivery, opens, clicks, and more</p>
        </div>
        <Button variant="outline" onClick={fetchData}>
          <RefreshCcw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500 mb-1">Total Events</p>
            <p className="text-2xl font-bold">{metrics.total}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500 mb-1">Sent</p>
            <p className="text-2xl font-bold text-blue-600">{metrics.sent}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500 mb-1">Delivered</p>
            <p className="text-2xl font-bold text-green-600">{metrics.delivered}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500 mb-1">Opened</p>
            <p className="text-2xl font-bold text-purple-600">{metrics.opened}</p>
            <p className="text-xs text-gray-400 mt-1">{openRate}% open rate</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500 mb-1">Clicked</p>
            <p className="text-2xl font-bold text-indigo-600">{metrics.clicked}</p>
            <p className="text-xs text-gray-400 mt-1">{clickRate}% click rate</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500 mb-1">Bounced</p>
            <p className="text-2xl font-bold text-red-600">{metrics.bounced}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500 mb-1">Complained</p>
            <p className="text-2xl font-bold text-orange-600">{metrics.complained}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500 mb-1">Unique Recipients</p>
            <p className="text-2xl font-bold">{metrics.uniqueRecipients}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500 mb-1">Unique Campaigns</p>
            <p className="text-2xl font-bold">{metrics.uniqueCampaigns}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500 mb-1">Last 7 Days</p>
            <p className="text-2xl font-bold">{metrics.last7Days}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search by email, subject, ID, or campaign..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Event Types</SelectItem>
              <SelectItem value="email.sent">Sent</SelectItem>
              <SelectItem value="email.delivered">Delivered</SelectItem>
              <SelectItem value="email.delivery_delayed">Delivery Delayed</SelectItem>
              <SelectItem value="email.complained">Complained</SelectItem>
              <SelectItem value="email.bounced">Bounced</SelectItem>
              <SelectItem value="email.opened">Opened</SelectItem>
              <SelectItem value="email.clicked">Clicked</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as 'newest' | 'oldest')}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setSearchTerm('');
            setTypeFilter('all');
          }}
        >
          Clear Filters
        </Button>
      </div>

      {/* Events Table */}
      {events.length === 0 && !isLoading ? (
        <Card className="border-none shadow-md">
          <CardContent className="p-12 text-center">
            <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Email Events Yet</h3>
            <p className="text-gray-500 mb-4">
              Email events will appear here once emails are sent and tracked.
            </p>
            <p className="text-sm text-gray-400">
              The email_events table needs to be created and webhooks configured to track email events.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-gray-500">
            Showing {filteredEvents.length} of {events.length} events
          </div>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
            </div>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {filteredEvents.map((event) => (
                <Card key={event.id} className="border-none shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={eventTypeColors[event.event_type] || 'bg-gray-100 text-gray-700'}>
                            {event.event_type}
                          </Badge>
                          <span className="text-xs font-mono text-gray-400">
                            {event.email_id.substring(0, 8)}...
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="font-medium text-gray-500">Recipient:</span>
                            <p className="text-gray-900">{event.recipient_email}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-500">Subject:</span>
                            <p className="text-gray-900">{event.subject}</p>
                          </div>
                          {event.campaign_id && (
                            <div>
                              <span className="font-medium text-gray-500">Campaign:</span>
                              <p className="text-gray-900 font-mono text-xs">{event.campaign_id}</p>
                            </div>
                          )}
                          {event.clicked_link && (
                            <div>
                              <span className="font-medium text-gray-500">Link Clicked:</span>
                              <a
                                href={event.clicked_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-purple-600 hover:underline flex items-center gap-1"
                              >
                                {event.clicked_link.length > 50 
                                  ? event.clicked_link.substring(0, 50) + '...'
                                  : event.clicked_link}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          )}
                          <div>
                            <span className="font-medium text-gray-500">Time:</span>
                            <p className="text-gray-900">
                              {new Date(event.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredEvents.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  No events found matching your filters
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminEmailEvents;

