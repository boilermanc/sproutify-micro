import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Send,
  TestTube,
  Users,
  AlertCircle,
  History,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  Eye
} from 'lucide-react';
// Using textarea for HTML email composition (react-quill not compatible with React 19)

interface BroadcastRecord {
  id: string;
  campaign_id: string;
  subject: string;
  html_body: string;
  target_table: string | null;
  trial_status_filter: string | null;
  recipient_count: number;
  emails_sent: number;
  is_test: boolean;
  test_email: string | null;
  status: 'sending' | 'sent' | 'failed' | 'partial_failure';
  created_at: string;
}

const AdminEmailBroadcast = () => {
  const [mode, setMode] = useState<'test' | 'broadcast'>('test');
  const [testEmail, setTestEmail] = useState('');
  const [targetTable, setTargetTable] = useState<'profile' | 'pre_registrations'>('profile');
  const [trialStatusFilter, setTrialStatusFilter] = useState<string>('all');
  const [targetUserCount, setTargetUserCount] = useState(0);
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  // Broadcast history state
  const [recentBroadcasts, setRecentBroadcasts] = useState<BroadcastRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [expandedBroadcast, setExpandedBroadcast] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);

  const fetchTargetCount = useCallback(async () => {
    if (mode === 'test') return;

    try {
      let query = getSupabaseClient()
        .from(targetTable)
        .select('*', { count: 'exact', head: true })
        .not('email', 'is', null);

      // Only apply trial_status filter for profile table
      if (targetTable === 'profile' && trialStatusFilter !== 'all') {
        // Note: This assumes there's a trial_status field in profile
        // If not, we'll need to adjust this
        query = query.eq('trial_status', trialStatusFilter);
      }

      // For profile table, also filter by is_active
      if (targetTable === 'profile') {
        query = query.eq('is_active', true);
      }

      const { count, error } = await query;
      if (error) throw error;
      setTargetUserCount(count || 0);
    } catch (error) {
      console.error('Error fetching target count:', error);
      setTargetUserCount(0);
    }
  }, [mode, targetTable, trialStatusFilter]);

  const fetchRecentBroadcasts = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const { data, error } = await getSupabaseClient()
        .from('email_broadcasts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setRecentBroadcasts(data || []);
    } catch (error) {
      console.error('Error fetching broadcast history:', error);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchTargetCount();
  }, [fetchTargetCount]);

  useEffect(() => {
    fetchRecentBroadcasts();
  }, [fetchRecentBroadcasts]);

  const loadTemplate = (templateName: 'update' | 'features') => {
    if (templateName === 'update') {
      setSubject('Sproutify Micro App Update Available! 🎉');
      setHtmlBody(`
        <h2>Exciting News!</h2>
        <p>We're thrilled to announce a new update to the Sproutify Micro app with improved features and bug fixes.</p>
        <h3>What's New:</h3>
        <ul>
          <li>Enhanced tray tracking</li>
          <li>Improved recipe management</li>
          <li>Better reporting tools</li>
        </ul>
        <p>Update now to enjoy the latest improvements!</p>
        <p>Best regards,<br>The Sproutify Team</p>
      `);
    } else if (templateName === 'features') {
      setSubject('New Features in Sproutify Micro! ✨');
      setHtmlBody(`
        <h2>New Features Available!</h2>
        <p>We've added exciting new features to help you manage your micro greens farm more efficiently.</p>
        <h3>New Features:</h3>
        <ul>
          <li>Advanced analytics dashboard</li>
          <li>Automated harvest reminders</li>
          <li>Enhanced inventory tracking</li>
        </ul>
        <p>Log in to explore these new features today!</p>
        <p>Best regards,<br>The Sproutify Team</p>
      `);
    }
  };

  const handleSend = async () => {
    if (!subject || !htmlBody || htmlBody.length < 10) {
      setSendError('Subject and body (minimum 10 characters) are required');
      return;
    }

    if (mode === 'test') {
      if (!testEmail) {
        setSendError('Test email is required');
        return;
      }
    } else {
      if (targetUserCount === 0) {
        setSendError('No users match the selected criteria');
        return;
      }
      if (!showConfirm) {
        setShowConfirm(true);
        return;
      }
    }

    setSending(true);
    setSendError('');
    setSendSuccess(false);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      // Get current session for auth
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/send-broadcast-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          subject,
          htmlBody,
          testEmail: mode === 'test' ? testEmail : undefined,
          targetTable: mode === 'broadcast' ? targetTable : undefined,
          trialStatus: mode === 'broadcast' && targetTable === 'profile' && trialStatusFilter !== 'all' ? trialStatusFilter : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Email send error details:', errorData);
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      await response.json();
      setSendSuccess(true);
      setSubject('');
      setHtmlBody('');
      setTestEmail('');
      setShowConfirm(false);
      fetchRecentBroadcasts(); // Refresh history
      setTimeout(() => setSendSuccess(false), 3000);
    } catch (error) {
      console.error('Error sending email:', error);
      setSendError(error instanceof Error ? error.message : 'Failed to send email');
    } finally {
      setSending(false);
    }
  };


  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-gray-100 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Email Broadcast</h1>
          <p className="text-gray-500 font-medium mt-1">Send formatted emails to users</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={mode === 'test' ? 'default' : 'outline'}
            onClick={() => {
              setMode('test');
              setShowConfirm(false);
            }}
            className={mode === 'test' ? 'bg-blue-600' : ''}
          >
            <TestTube className="h-4 w-4 mr-2" />
            Test Mode
          </Button>
          <Button
            variant={mode === 'broadcast' ? 'default' : 'outline'}
            onClick={() => {
              setMode('broadcast');
              setShowConfirm(false);
            }}
            className={mode === 'broadcast' ? 'bg-red-600' : ''}
          >
            <Users className="h-4 w-4 mr-2" />
            Send to All
          </Button>
        </div>
      </div>

      {/* Mode Info */}
      {mode === 'test' ? (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-blue-800">
              <TestTube className="h-5 w-5" />
              <span className="font-medium">Test Mode: Send to a single email address for testing</span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">Broadcast Mode: Will send to {targetUserCount} users</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Target Selection */}
      <Card className="border-none shadow-md">
        <CardHeader>
          <CardTitle>Target Selection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === 'test' ? (
            <div className="space-y-2">
              <Label>Test Email Address *</Label>
              <Input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Target Table *</Label>
                <Select value={targetTable} onValueChange={(value: 'profile' | 'pre_registrations') => setTargetTable(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="profile">Profile (Active Users)</SelectItem>
                    <SelectItem value="pre_registrations">Pre-Registrations</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {targetTable === 'profile' && (
                <div className="space-y-2">
                  <Label>Filter by Trial Status</Label>
                  <Select value={trialStatusFilter} onValueChange={setTrialStatusFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All users</SelectItem>
                      <SelectItem value="none">No trial</SelectItem>
                      <SelectItem value="active">Active trial</SelectItem>
                      <SelectItem value="converted">Converted</SelectItem>
                      <SelectItem value="expired">Expired trial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <p className="text-sm text-gray-500">
                Will send to {targetUserCount} {targetTable === 'profile' ? 'users' : 'pre-registrations'} matching the selected criteria
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Composition */}
      <Card className="border-none shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Email Composition</CardTitle>
              <CardDescription>Create your email message</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadTemplate('update')}
              >
                App Update Template
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadTemplate('features')}
              >
                New Features Template
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Subject Line *</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Testing Micro Broadcast"
            />
          </div>

          <div className="space-y-2">
            <Label>Message Body * (HTML supported)</Label>
            <Textarea
              value={htmlBody}
              onChange={(e) => setHtmlBody(e.target.value)}
              placeholder="Write your email here... HTML is supported (e.g., &lt;h2&gt;Title&lt;/h2&gt;&lt;p&gt;Content&lt;/p&gt;)"
              className="min-h-[300px] font-mono text-sm resize-y"
              rows={15}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Minimum 10 characters required. HTML tags are supported.
              </p>
              <div className="text-xs text-gray-400">
                {htmlBody.length} characters
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      {showConfirm && mode === 'broadcast' && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-red-800">
                <AlertCircle className="h-5 w-5" />
                <span className="font-semibold">Confirm Broadcast</span>
              </div>
              <p className="text-red-700">
                You are about to send this email to <strong>{targetUserCount} {targetTable === 'profile' ? 'users' : 'pre-registrations'}</strong>
                {targetTable === 'profile' && trialStatusFilter !== 'all' && ` with status: ${trialStatusFilter}`}.
                This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={handleSend}
                  disabled={sending}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {sending ? 'Sending...' : 'Confirm & Send'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error/Success Messages */}
      {sendError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-red-700">
            {sendError}
          </CardContent>
        </Card>
      )}

      {sendSuccess && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 text-green-700">
            Email sent successfully!
          </CardContent>
        </Card>
      )}

      {/* Send Button */}
      {!showConfirm && (
        <div className="flex flex-col items-end gap-2">
          {/* Show what's missing */}
          {(!subject || htmlBody.length < 10 || (mode === 'test' && !testEmail)) && (
            <p className="text-sm text-gray-500">
              Required:{' '}
              {[
                mode === 'test' && !testEmail && 'test email',
                !subject && 'subject',
                htmlBody.length < 10 && 'body (min 10 chars)',
              ]
                .filter(Boolean)
                .join(', ')}
            </p>
          )}
          <Button
            onClick={handleSend}
            disabled={sending || !subject || htmlBody.length < 10 || (mode === 'test' && !testEmail)}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Send className="h-4 w-4 mr-2" />
            {sending ? 'Sending...' : mode === 'test' ? 'Send Test Email' : 'Send to All'}
          </Button>
        </div>
      )}

      {/* Broadcast History */}
      <Card className="border-none shadow-md">
        <CardHeader
          className="cursor-pointer"
          onClick={() => setShowHistory(!showHistory)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-gray-500" />
              <CardTitle>Recent Broadcasts</CardTitle>
            </div>
            {showHistory ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </div>
        </CardHeader>
        {showHistory && (
          <CardContent>
            {loadingHistory ? (
              <p className="text-gray-500 text-center py-4">Loading history...</p>
            ) : recentBroadcasts.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No broadcasts sent yet</p>
            ) : (
              <div className="space-y-3">
                {recentBroadcasts.map((broadcast) => (
                  <div
                    key={broadcast.id}
                    className="border rounded-lg overflow-hidden"
                  >
                    <div
                      className="p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => setExpandedBroadcast(
                        expandedBroadcast === broadcast.id ? null : broadcast.id
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {/* Status Icon */}
                          {broadcast.status === 'sent' && (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          )}
                          {broadcast.status === 'failed' && (
                            <XCircle className="h-5 w-5 text-red-500" />
                          )}
                          {broadcast.status === 'partial_failure' && (
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                          )}
                          {broadcast.status === 'sending' && (
                            <Clock className="h-5 w-5 text-blue-500 animate-pulse" />
                          )}
                          <div>
                            <p className="font-medium text-gray-900 line-clamp-1">
                              {broadcast.subject}
                            </p>
                            <p className="text-sm text-gray-500">
                              {new Date(broadcast.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {/* Badges */}
                          <div className="flex items-center gap-2">
                            {broadcast.is_test ? (
                              <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                                Test
                              </span>
                            ) : (
                              <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded">
                                Broadcast
                              </span>
                            )}
                            <span className="text-sm text-gray-600">
                              {broadcast.emails_sent}/{broadcast.recipient_count} sent
                            </span>
                          </div>
                          {expandedBroadcast === broadcast.id ? (
                            <ChevronUp className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {expandedBroadcast === broadcast.id && (
                      <div className="p-4 border-t bg-white space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500">Status</p>
                            <p className="font-medium capitalize">{broadcast.status.replace('_', ' ')}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Target</p>
                            <p className="font-medium">
                              {broadcast.is_test
                                ? broadcast.test_email
                                : broadcast.target_table || 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">Filter</p>
                            <p className="font-medium">
                              {broadcast.trial_status_filter || 'None'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">Campaign ID</p>
                            <p className="font-medium text-xs font-mono">
                              {broadcast.campaign_id}
                            </p>
                          </div>
                        </div>

                        {/* HTML Preview */}
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Eye className="h-4 w-4 text-gray-500" />
                            <p className="text-sm font-medium text-gray-700">Email Content Preview</p>
                          </div>
                          <div
                            className="border rounded p-4 bg-gray-50 max-h-64 overflow-y-auto prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: broadcast.html_body }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default AdminEmailBroadcast;

