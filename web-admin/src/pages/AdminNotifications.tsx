import { useState, useEffect, useCallback, useRef } from 'react';
import { cancelAdminRead, adminAction, readAdminPage } from '../services/adminConsole';
import AdminDataStatus from '../components/AdminDataStatus';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  RefreshCcw, 
  Send,
  Search,
  CheckCircle2,
  Circle,
  Info
} from 'lucide-react';

interface Notification {
  notification_id: number;
  farm_uuid: string;
  user_id: string | null;
  type: 'low_stock' | 'harvest_reminder' | 'order_update' | 'system' | 'info';
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
  user_email?: string;
  user_name?: string;
  farm_name?: string;
}

const InfoTooltip = ({ description }: { description: string }) => (
  <span
    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-transparent text-slate-400 hover:border-slate-500"
    title={description}
    aria-label={description}
  >
    <Info className="h-3 w-3" aria-hidden="true" />
  </span>
);

const AdminNotifications = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const request = useRef(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; email: string; name: string }>>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // Send notification form state
  const [sendToAll, setSendToAll] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [notificationType, setNotificationType] = useState<string>('info');
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationBody, setNotificationBody] = useState('');
  const [notificationLink, setNotificationLink] = useState('');
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState('');
  const [reason, setReason] = useState('');
  const [sentCount, setSentCount] = useState<number | null>(null);
  const intent = useRef<{ signature: string; requestId: string } | null>(null);

  const fetchData = useCallback(async () => {
    const current = ++request.current;
    setIsLoading(true); setLoadError(''); setTotal(null);
    try {
      const [notificationPage,userPage] = await Promise.all([readAdminPage<Notification>('notifications',page),readAdminPage<{id:string;email:string;name:string;firstname?:string;lastname?:string}>('users',page)]);
      if(current !== request.current) return;
      setNotifications(notificationPage.rows);setUsers(userPage.rows.map(user=>({...user,name:[user.firstname,user.lastname].filter(Boolean).join(' ')})));
      setTotal(Math.max(notificationPage.total,userPage.total));
    } catch (error) {
      if (current === request.current) setLoadError(error instanceof Error ? error.message : 'Unable to load admin data.');
    } finally { if (current === request.current) setIsLoading(false); }
  }, [page]);
  useEffect(() => { void fetchData(); return () => { cancelAdminRead(request); }; }, [fetchData]);

  const handleSendNotification = async () => {
    if (sending) return;
    setSendError(''); setSendSuccess(false); setSentCount(null);
    if (!notificationTitle.trim() || !notificationBody.trim() || !reason.trim() || (!sendToAll && !selectedUserId)) {
      setSendError('Title, body, reason and a recipient are required.'); return;
    }
    const payload = { target: sendToAll ? 'all' : 'user', ...(sendToAll ? {} : {user_id:selectedUserId}), type:notificationType, title:notificationTitle, message:notificationBody, ...(notificationLink.trim() ? {link:notificationLink.trim()} : {}), reason };
    const signature = JSON.stringify(payload);
    if (intent.current?.signature !== signature) intent.current = { signature, requestId:crypto.randomUUID() };
    const requestId = intent.current.requestId;
    setSending(true);
    try {
      const result = await adminAction<{inserted:number;request_id:string}>('send_notification', {...payload,request_id:requestId});
      if (result.request_id !== requestId || !Number.isInteger(result.inserted) || result.inserted <= 0) throw new Error('No notifications were confirmed. Refresh before trying a different request.');
      setSentCount(result.inserted); setSendSuccess(true); intent.current=null;
      setNotificationTitle('');setNotificationBody('');setNotificationLink('');setReason('');
      void fetchData();
    } catch(error) { setSendError(error instanceof Error ? error.message : 'Unable to send notifications.'); }
    finally {setSending(false);}
  };

  const filteredNotifications = notifications.filter(notif => {
    if (typeFilter !== 'all' && notif.type !== typeFilter) return false;
    if (statusFilter === 'read' && !notif.is_read) return false;
    if (statusFilter === 'unread' && notif.is_read) return false;
    if (userFilter !== 'all' && notif.user_id !== userFilter) return false;
    if (searchTerm && !notif.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !notif.message.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !notif.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !notif.user_email?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    if (sortOrder === 'newest') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    } else {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
  });

  const typeColors: Record<string, string> = {
    'low_stock': 'bg-red-100 text-red-700',
    'harvest_reminder': 'bg-green-100 text-green-700',
    'order_update': 'bg-blue-100 text-blue-700',
    'system': 'bg-purple-100 text-purple-700',
    'info': 'bg-gray-100 text-gray-700',
  };

  const metrics = {
    total: notifications.length,
    unread: notifications.filter(n => !n.is_read).length,
    read: notifications.filter(n => n.is_read).length,
    uniqueUsers: new Set(notifications.map(n => n.user_id)).size,
    sentToday: notifications.filter(n => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return new Date(n.created_at) >= today;
    }).length,
    sentThisWeek: notifications.filter(n => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return new Date(n.created_at) >= weekAgo;
    }).length,
    system: notifications.filter(n => n.type === 'system').length,
    info: notifications.filter(n => n.type === 'info').length,
  };

  const unreadPercent = metrics.total > 0 ? Math.round((metrics.unread / metrics.total) * 100) : 0;
  const readPercent = metrics.total > 0 ? Math.round((metrics.read / metrics.total) * 100) : 0;

  const metricCards = [
    {
      key: 'total',
      label: 'Total',
      value: metrics.total,
      tooltip: 'Number of notifications retrieved (limited to the 100 most recent entries).',
    },
    {
      key: 'unread',
      label: 'Unread',
      value: metrics.unread,
      tooltip: 'Notifications that are still marked unread so you know what needs attention.',
      valueClass: 'text-red-600',
      subText: `${unreadPercent}% of total`,
    },
    {
      key: 'read',
      label: 'Read',
      value: metrics.read,
      tooltip: 'Notifications marked read by users.',
      valueClass: 'text-green-600',
      subText: `${readPercent}% of total`,
    },
    {
      key: 'uniqueUsers',
      label: 'Unique Users',
      value: metrics.uniqueUsers,
      tooltip: 'How many unique users appear in the current notification set.',
    },
    {
      key: 'sentToday',
      label: 'Sent Today',
      value: metrics.sentToday,
      tooltip: 'Notifications that were created since midnight for each farm.',
    },
    {
      key: 'sentThisWeek',
      label: 'Sent This Week',
      value: metrics.sentThisWeek,
      tooltip: 'Notifications created in the last 7 days.',
    },
    {
      key: 'system',
      label: 'System',
      value: metrics.system,
      tooltip: 'System-level notifications that typically include configuration or maintenance updates.',
    },
    {
      key: 'info',
      label: 'Info',
      value: metrics.info,
      tooltip: 'Informational notifications without urgent actions.',
    },
  ];

  if (loadError) return <div className="p-6 space-y-4"><p role="alert">{loadError} Data is unavailable.</p><Button onClick={fetchData}>Retry</Button></div>;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <AdminDataStatus error={loadError} page={page} total={total} loading={isLoading} onPage={setPage} />
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-gray-100 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Notifications</h1>
          <p className="text-gray-500 font-medium mt-1">Manage and send push notifications</p>
        </div>
        <Button variant="outline" onClick={fetchData}>
          <RefreshCcw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        {metricCards.map((card) => (
          <Card key={card.key} className="border-none shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-1">
                <p className="text-sm text-gray-500 mb-1">{card.label}</p>
                <InfoTooltip description={card.tooltip} />
              </div>
              <p className={`text-2xl font-bold ${card.valueClass ?? ''}`}>{card.value}</p>
              {card.subText && (
                <p className="text-xs text-gray-400 mt-1">{card.subText}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Send Notification Form */}
      <Card className="border-none shadow-md">
        <CardHeader>
          <CardTitle>Send Notification</CardTitle>
          <CardDescription>Send push notifications to users</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sendToAll}
                onChange={(e) => setSendToAll(e.target.checked)}
                className="rounded"
              />
              <span className="flex items-center gap-1">
                Send to All Users
                <InfoTooltip description="Broadcast to every active user (per farm) when checked. Uncheck to target a single user." />
              </span>
            </Label>
            {sendToAll && (
              <span className="text-sm text-gray-500">
                All active eligible users; the backend confirms the final count.
              </span>
            )}
          </div>

          {!sendToAll && (
            <div className="space-y-2">
              <Label>Select User</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label>Type</Label>
                <InfoTooltip description="Pick the notification bucket so the badge on each notification matches its intent." />
              </div>
              <Select value={notificationType} onValueChange={setNotificationType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="low_stock">Low Stock</SelectItem>
                  <SelectItem value="harvest_reminder">Harvest Reminder</SelectItem>
                  <SelectItem value="order_update">Order Update</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notification-title">Title *</Label>
            <Input
              id="notification-title" value={notificationTitle} disabled={sending} maxLength={200}
              onChange={(e) => setNotificationTitle(e.target.value)}
              placeholder="Notification title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notification-body">Body *</Label>
            <Textarea
              id="notification-body" value={notificationBody} disabled={sending} maxLength={5000}
              onChange={(e) => setNotificationBody(e.target.value)}
              placeholder="Notification message"
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label>Link (optional)</Label>
            <Input
              value={notificationLink}
              onChange={(e) => setNotificationLink(e.target.value)}
              placeholder="/trays, /orders, etc."
            />
          </div>

          <div className="space-y-2"><Label htmlFor="notification-reason">Reason *</Label><Input id="notification-reason" value={reason} onChange={e=>setReason(e.target.value)} disabled={sending} maxLength={500} /></div>
          {sendError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {sendError}
            </div>
          )}

          {sendSuccess && (
            <div role="status" className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              Confirmed {sentCount} notifications created.
            </div>
          )}

          <Button
            onClick={handleSendNotification}
            disabled={sending || !notificationTitle || !notificationBody || !reason.trim()}
            className="w-full md:w-auto"
          >
            <Send className="h-4 w-4 mr-2" />
            {sending ? 'Sending...' : 'Send Notification'}
          </Button>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <Label>Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search notifications..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Label>Type</Label>
            <InfoTooltip description="Choose a notification bucket to quickly spot low stock alerts, orders, etc." />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="low_stock">Low Stock</SelectItem>
              <SelectItem value="harvest_reminder">Harvest Reminder</SelectItem>
              <SelectItem value="order_update">Order Update</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Label>Status</Label>
            <InfoTooltip description="Filter by whether recipients have already opened the notification." />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Label>Sort</Label>
            <InfoTooltip description="Choose whether the newest or oldest notifications appear first." />
          </div>
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
            setStatusFilter('all');
            setUserFilter('all');
          }}
        >
          Clear Filters
        </Button>
      </div>

      {/* Notifications List */}
      <div className="space-y-4">
        <div className="text-sm text-gray-500">
          Showing {filteredNotifications.length} of {notifications.length} notifications
        </div>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        ) : (
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {filteredNotifications.map((notif) => (
              <Card key={notif.notification_id} className="border-none shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {notif.is_read ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <Circle className="h-4 w-4 text-gray-400" />
                        )}
                        <h3 className="font-semibold">{notif.title}</h3>
                        <Badge className={typeColors[notif.type] || 'bg-gray-100 text-gray-700'}>
                          {notif.type}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{notif.message}</p>
                      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                        <span>User: {notif.user_name} ({notif.user_email})</span>
                        <span>Farm: {notif.farm_name}</span>
                        <span>Sent: {new Date(notif.created_at).toLocaleString()}</span>
                        {notif.link && (
                          <span className="text-purple-600">Link: {notif.link}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredNotifications.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                No notifications found
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminNotifications;

