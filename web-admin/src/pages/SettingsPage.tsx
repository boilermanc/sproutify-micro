import { useState, useEffect } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Building2, User, Bell, Shield, Download, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface FarmData {
  farm_uuid: string;
  farm_name: string;
  seeding_days?: string[];
  subscription_status?: string;
  subscription_plan?: string;
  trial_start_date?: string;
  trial_end_date?: string;
  subscription_start_date?: string;
  subscription_end_date?: string;
  created_at?: string;
}

interface ProfileData {
  id: string;
  email: string;
  name: string;
  role: string;
  farm_uuid: string;
}

const SettingsPage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [farmData, setFarmData] = useState<FarmData | null>(null);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Farm settings
  const [farmName, setFarmName] = useState('');
  const [seedingDays, setSeedingDays] = useState<string[]>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  
  // User profile
  const [userName, setUserName] = useState('');
  
  // Preferences
  const [defaultUnit, setDefaultUnit] = useState('pcs');
  const [dateFormat, setDateFormat] = useState('MM/DD/YYYY');
  const [notifications, setNotifications] = useState({
    lowStock: true,
    harvestReminders: true,
    orderUpdates: true,
  });

  // Security - no state needed for email-based reset

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid, userId } = JSON.parse(sessionData);

      // Fetch farm data
      const { data: farm, error: farmError } = await getSupabaseClient()
        .from('farms')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .single();

      if (farmError) throw farmError;
      if (farm) {
        setFarmData(farm);
        setFarmName(farm.farm_name || farm.farmname || '');
        setSeedingDays(farm.seeding_days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
      }

      // Fetch profile data
      const { data: profile, error: profileError } = await getSupabaseClient()
        .from('profile')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;
      if (profile) {
        setProfileData(profile);
        setUserName(profile.name || '');
      }

      // Load preferences from localStorage
      const savedPreferences = localStorage.getItem('sproutify_preferences');
      if (savedPreferences) {
        const prefs = JSON.parse(savedPreferences);
        setDefaultUnit(prefs.defaultUnit || 'pcs');
        setDateFormat(prefs.dateFormat || 'MM/DD/YYYY');
        setNotifications(prefs.notifications || {
          lowStock: true,
          harvestReminders: true,
          orderUpdates: true,
        });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFarm = async () => {
    if (!farmData) return;

    setSaving(true);
    setMessage(null);

    try {
      const { error } = await getSupabaseClient()
        .from('farms')
        .update({ 
          farm_name: farmName,
          seeding_days: seedingDays
        })
        .eq('farm_uuid', farmData.farm_uuid);

      if (error) throw error;

      // Update session
      const sessionData = localStorage.getItem('sproutify_session');
      if (sessionData) {
        const session = JSON.parse(sessionData);
        session.farmName = farmName;
        localStorage.setItem('sproutify_session', JSON.stringify(session));
      }

      setMessage({ type: 'success', text: 'Farm information updated successfully' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error updating farm:', error);
      setMessage({ type: 'error', text: 'Failed to update farm information' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profileData) return;

    setSaving(true);
    setMessage(null);

    try {
      const { error } = await getSupabaseClient()
        .from('profile')
        .update({ name: userName })
        .eq('id', profileData.id);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Profile updated successfully' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage({ type: 'error', text: 'Failed to update profile' });
    } finally {
      setSaving(false);
    }
  };

  const handleSavePreferences = () => {
    const preferences = {
      defaultUnit,
      dateFormat,
      notifications,
    };
    localStorage.setItem('sproutify_preferences', JSON.stringify(preferences));
    setMessage({ type: 'success', text: 'Preferences saved successfully' });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleResetPassword = async () => {
    if (!profileData?.email) {
      setMessage({ type: 'error', text: 'Email address not found' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      // Send password reset email via getSupabaseClient() Auth
      // The email will contain a link that redirects to the login page with a token
      const { error } = await getSupabaseClient().auth.resetPasswordForEmail(profileData.email, {
        redirectTo: `${window.location.origin}/login`,
      });

      if (error) throw error;

      setMessage({ 
        type: 'success', 
        text: `Password reset email sent to ${profileData.email}. Please check your inbox and follow the instructions to reset your password.` 
      });
      setTimeout(() => setMessage(null), 8000);
    } catch (error: unknown) {
      console.error('Error sending password reset email:', error);
      const err = error as { message?: string };
      setMessage({ type: 'error', text: err.message || 'Failed to send password reset email' });
    } finally {
      setSaving(false);
    }
  };

  const handleExportData = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Fetch all farm data (varieties are global, no farm_uuid filter)
      const [varieties, recipes, batches, trays, customers, vendors, supplies] = await Promise.all([
        getSupabaseClient().from('varieties').select('*'),
        getSupabaseClient().from('recipes').select('*').eq('farm_uuid', farmUuid),
        getSupabaseClient().from('seedbatches').select('*').eq('farm_uuid', farmUuid),
        getSupabaseClient().from('trays').select('*').eq('farm_uuid', farmUuid),
        getSupabaseClient().from('customers').select('*').eq('farm_uuid', farmUuid),
        getSupabaseClient().from('vendors').select('*').eq('farm_uuid', farmUuid),
        getSupabaseClient().from('supplies').select('*').eq('farm_uuid', farmUuid),
      ]);

      const exportData = {
        exportDate: new Date().toISOString(),
        farm: farmData,
        varieties: varieties.data || [],
        recipes: recipes.data || [],
        batches: batches.data || [],
        trays: trays.data || [],
        customers: customers.data || [],
        vendors: vendors.data || [],
        supplies: supplies.data || [],
      };

      // Download as JSON
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sproutify-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage({ type: 'success', text: 'Data exported successfully' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error exporting data:', error);
      setMessage({ type: 'error', text: 'Failed to export data' });
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getSubscriptionBadge = (status?: string) => {
    switch (status) {
      case 'trial':
        return <Badge variant="secondary">Trial</Badge>;
      case 'active':
        return <Badge variant="default">Active</Badge>;
      case 'expired':
        return <Badge variant="destructive">Expired</Badge>;
      case 'cancelled':
        return <Badge variant="outline">Cancelled</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex justify-center items-center h-64">
          <div className="text-muted-foreground">Loading settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your farm settings and preferences</p>
        </div>
      </div>

      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* Farm Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            <CardTitle>Farm Information</CardTitle>
          </div>
          <CardDescription>Manage your farm details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="farmName">Farm Name</Label>
            <Input
              id="farmName"
              value={farmName}
              onChange={(e) => setFarmName(e.target.value)}
              placeholder="Enter farm name"
            />
          </div>
          <div className="grid gap-2">
            <Label>Seeding Days</Label>
            <p className="text-sm text-muted-foreground mb-2">
              Select the days of the week when seeding typically occurs
            </p>
            <div className="grid grid-cols-2 gap-3">
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
                <div key={day} className="flex items-center space-x-2">
                  <input
                    id={`seeding-${day}`}
                    type="checkbox"
                    checked={seedingDays.includes(day)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSeedingDays([...seedingDays, day]);
                      } else {
                        setSeedingDays(seedingDays.filter(d => d !== day));
                      }
                    }}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor={`seeding-${day}`} className="font-normal cursor-pointer">
                    {day}
                  </Label>
                </div>
              ))}
            </div>
          </div>
          <Button onClick={handleSaveFarm} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            Save Farm Information
          </Button>
        </CardContent>
      </Card>

      {/* Account & Subscription */}
      {farmData && (farmData.subscription_status || farmData.subscription_plan) && (
        <Card>
          <CardHeader>
            <CardTitle>Account & Subscription</CardTitle>
            <CardDescription>View your subscription status and plan details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Subscription Status</Label>
                <div className="mt-1">{getSubscriptionBadge(farmData.subscription_status)}</div>
              </div>
              <div>
                <Label>Subscription Plan</Label>
                <div className="mt-1">
                  {farmData.subscription_plan ? (
                    <Badge variant="outline">{farmData.subscription_plan}</Badge>
                  ) : (
                    <span className="text-muted-foreground">N/A</span>
                  )}
                </div>
              </div>
            </div>
            {farmData.trial_end_date && (
              <div>
                <Label>Trial End Date</Label>
                <div className="mt-1 text-sm">{formatDate(farmData.trial_end_date)}</div>
              </div>
            )}
            {farmData.subscription_end_date && (
              <div>
                <Label>Subscription End Date</Label>
                <div className="mt-1 text-sm">{formatDate(farmData.subscription_end_date)}</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* User Profile */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5" />
            <CardTitle>User Profile</CardTitle>
          </div>
          <CardDescription>Manage your personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="userName">Name</Label>
            <Input
              id="userName"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your name"
            />
          </div>
          <div className="grid gap-2">
            <Label>Email</Label>
            <Input value={profileData?.email || ''} disabled />
          </div>
          <div className="grid gap-2">
            <Label>Role</Label>
            <Input value={profileData?.role || ''} disabled />
          </div>
          <Button onClick={handleSaveProfile} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            Save Profile
          </Button>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <CardTitle>Preferences</CardTitle>
          </div>
          <CardDescription>Customize your application preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="defaultUnit">Default Unit</Label>
            <Select value={defaultUnit} onValueChange={setDefaultUnit}>
              <SelectTrigger id="defaultUnit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pcs">Pieces (pcs)</SelectItem>
                <SelectItem value="lbs">Pounds (lbs)</SelectItem>
                <SelectItem value="oz">Ounces (oz)</SelectItem>
                <SelectItem value="g">Grams (g)</SelectItem>
                <SelectItem value="kg">Kilograms (kg)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dateFormat">Date Format</Label>
            <Select value={dateFormat} onValueChange={setDateFormat}>
              <SelectTrigger id="dateFormat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />
          <div className="space-y-3">
            <Label>Notifications</Label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="lowStock" className="font-normal">Low Stock Alerts</Label>
                <input
                  id="lowStock"
                  type="checkbox"
                  checked={notifications.lowStock}
                  onChange={(e) => setNotifications({ ...notifications, lowStock: e.target.checked })}
                  className="h-4 w-4"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="harvestReminders" className="font-normal">Harvest Reminders</Label>
                <input
                  id="harvestReminders"
                  type="checkbox"
                  checked={notifications.harvestReminders}
                  onChange={(e) => setNotifications({ ...notifications, harvestReminders: e.target.checked })}
                  className="h-4 w-4"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="orderUpdates" className="font-normal">Order Updates</Label>
                <input
                  id="orderUpdates"
                  type="checkbox"
                  checked={notifications.orderUpdates}
                  onChange={(e) => setNotifications({ ...notifications, orderUpdates: e.target.checked })}
                  className="h-4 w-4"
                />
              </div>
            </div>
          </div>
          <Button onClick={handleSavePreferences}>
            <Save className="h-4 w-4 mr-2" />
            Save Preferences
          </Button>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <CardTitle>Security</CardTitle>
          </div>
          <CardDescription>Manage your account security</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Email Address</Label>
            <Input value={profileData?.email || ''} disabled />
          </div>
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <p className="text-sm text-muted-foreground">
              To reset your password, we'll send a secure link to your email address. Click the button below to receive the password reset email.
            </p>
          </div>
          <Button onClick={handleResetPassword} disabled={saving || !profileData?.email}>
            <Shield className="h-4 w-4 mr-2" />
            {saving ? 'Sending...' : 'Send Password Reset Email'}
          </Button>
        </CardContent>
      </Card>

      {/* Data Export */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            <CardTitle>Data Export</CardTitle>
          </div>
          <CardDescription>Export your farm data for backup or migration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Export all your farm data including varieties, recipes, batches, trays, customers, vendors, and supplies as a JSON file.
          </p>
          <Button onClick={handleExportData} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export All Data
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
