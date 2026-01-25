import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Building2, User, Bell, Shield, Download, Save, CreditCard, ArrowUpRight, Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { useSubscription, TIER_INFO } from '@/hooks/useSubscription';
import TestAccountsManager from '@/components/TestAccountsManager';

interface FarmData {
  farm_uuid: string;
  farmname: string;
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
  firstname?: string;
  lastname?: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  postalcode?: string;
  country?: string;
  bio?: string;
  role: string;
  farm_uuid: string;
}

const SettingsPage = () => {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [farmData, setFarmData] = useState<FarmData | null>(null);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  // Subscription hook
  const {
    subscription,
    isLoading: subscriptionLoading,
    openPortal,
    getUsagePercentage,
    refresh: refreshSubscription,
  } = useSubscription();

  // Farm settings
  const [farmName, setFarmName] = useState('');
  const [seedingDays, setSeedingDays] = useState<string[]>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  
  // User profile
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
  const [bio, setBio] = useState('');
  
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

  // Handle checkout success from URL params
  useEffect(() => {
    const checkoutStatus = searchParams.get('checkout');
    const tier = searchParams.get('tier');
    if (checkoutStatus === 'success') {
      addToast({
        type: 'success',
        title: 'Subscription Activated!',
        description: tier
          ? `You're now subscribed to the ${TIER_INFO[tier]?.displayName || tier} plan.`
          : 'Your subscription has been activated successfully.',
      });
      refreshSubscription();
      // Clear URL params
      navigate('/settings', { replace: true });
    }
  }, [searchParams, addToast, navigate, refreshSubscription]);

  // Handle portal open
  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      await openPortal();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Error',
        description: 'Failed to open billing portal. Please try again.',
      });
    } finally {
      setPortalLoading(false);
    }
  };

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
        setFarmName(farm.farmname || '');
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
        setFirstName(profile.firstname || '');
        setLastName(profile.lastname || '');
        setPhone(profile.phone || '');
        setStreet(profile.street || '');
        setCity(profile.city || '');
        setState(profile.state || '');
        setPostalCode(profile.postalcode || '');
        setCountry(profile.country || '');
        setBio(profile.bio || '');
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
      addToast({
        type: 'error',
        title: 'Error',
        description: 'Failed to load settings'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFarm = async () => {
    if (!farmData) return;

    setSaving(true);

    try {
      const { error } = await getSupabaseClient()
        .from('farms')
        .update({ 
          farmname: farmName,
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

      addToast({
        type: 'success',
        title: 'Success',
        description: 'Farm information updated successfully'
      });
    } catch (error) {
      console.error('Error updating farm:', error);
      addToast({
        type: 'error',
        title: 'Error',
        description: 'Failed to update farm information'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profileData) return;

    setSaving(true);

    try {
      const { error } = await getSupabaseClient()
        .from('profile')
        .update({ 
          firstname: firstName,
          lastname: lastName,
          phone: phone,
          street: street,
          city: city,
          state: state,
          postalcode: postalCode,
          country: country,
          bio: bio
        })
        .eq('id', profileData.id);

      if (error) throw error;

      addToast({
        type: 'success',
        title: 'Success',
        description: 'Profile updated successfully'
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      addToast({
        type: 'error',
        title: 'Error',
        description: 'Failed to update profile'
      });
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
    addToast({
      type: 'success',
      title: 'Success',
      description: 'Preferences saved successfully'
    });
  };

  const handleResetPassword = async () => {
    if (!profileData?.email) {
      addToast({
        type: 'error',
        title: 'Error',
        description: 'Email address not found'
      });
      return;
    }

    setSaving(true);

    try {
      // Send password reset email via getSupabaseClient() Auth
      // The email will contain a link that redirects to the login page with a token
      const { error } = await getSupabaseClient().auth.resetPasswordForEmail(profileData.email, {
        redirectTo: `${window.location.origin}/login`,
      });

      if (error) throw error;

      addToast({
        type: 'success',
        title: 'Password Reset Email Sent',
        description: `Please check your inbox at ${profileData.email} and follow the instructions to reset your password.`,
        duration: 8000
      });
    } catch (error: unknown) {
      console.error('Error sending password reset email:', error);
      const err = error as { message?: string };
      addToast({
        type: 'error',
        title: 'Error',
        description: err.message || 'Failed to send password reset email'
      });
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

      addToast({
        type: 'success',
        title: 'Success',
        description: 'Data exported successfully'
      });
    } catch (error) {
      console.error('Error exporting data:', error);
      addToast({
        type: 'error',
        title: 'Error',
        description: 'Failed to export data'
      });
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

  const getSubscriptionBadge = (status?: string | null) => {
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
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            <CardTitle>Account & Subscription</CardTitle>
          </div>
          <CardDescription>Manage your subscription and billing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {subscriptionLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Status and Plan */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Subscription Status</Label>
                  <div className="mt-1">{getSubscriptionBadge(subscription.status)}</div>
                </div>
                <div>
                  <Label>Current Plan</Label>
                  <div className="mt-1 flex items-center gap-2">
                    {subscription.tier ? (
                      <>
                        <Badge variant="outline" className="text-sm">
                          {TIER_INFO[subscription.tier]?.displayName || subscription.tier}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          ${TIER_INFO[subscription.tier]?.price}/mo
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">No plan</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Tray Usage */}
              {subscription.tier && subscription.trayLimit < 999999 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>Tray Usage</Label>
                    <span className="text-sm text-muted-foreground">
                      {subscription.activeTrayCount} / {subscription.trayLimit} active trays
                    </span>
                  </div>
                  <Progress value={getUsagePercentage()} className="h-2" />
                  {getUsagePercentage() >= 80 && (
                    <p className="text-sm text-amber-600 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {getUsagePercentage() >= 100
                        ? 'You\'ve reached your tray limit. Upgrade to create more.'
                        : 'You\'re approaching your tray limit. Consider upgrading.'}
                    </p>
                  )}
                </div>
              )}

              {/* Trial or Renewal Info */}
              {subscription.status === 'trial' && subscription.trialEndDate && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Trial ends:</strong> {formatDate(subscription.trialEndDate)}
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    Subscribe before your trial ends to keep using Sproutify.
                  </p>
                </div>
              )}

              {subscription.status === 'active' && subscription.currentPeriodEnd && (
                <div>
                  <Label>Next Billing Date</Label>
                  <div className="mt-1 text-sm">
                    {formatDate(subscription.currentPeriodEnd)}
                    {subscription.cancelAtPeriodEnd && (
                      <Badge variant="destructive" className="ml-2">
                        Cancels at period end
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {subscription.status === 'past_due' && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg">
                  <p className="text-sm text-amber-800 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    <strong>Payment failed.</strong> Please update your payment method.
                  </p>
                </div>
              )}

              {(subscription.status === 'expired' || subscription.status === 'cancelled') && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
                  <p className="text-sm text-red-800">
                    Your subscription has ended. Subscribe to continue using all features.
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <Separator />
              <div className="flex flex-wrap gap-3">
                {subscription.stripeCustomerId && subscription.status === 'active' && (
                  <Button
                    variant="outline"
                    onClick={handleManageSubscription}
                    disabled={portalLoading}
                  >
                    {portalLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4 mr-2" />
                    )}
                    Manage Billing
                  </Button>
                )}
                {(subscription.status !== 'active' || subscription.tier !== 'pro') && (
                  <Button onClick={() => navigate('/pricing')}>
                    <ArrowUpRight className="h-4 w-4 mr-2" />
                    {subscription.status === 'active' ? 'Upgrade Plan' : 'View Plans'}
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

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
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Enter your first name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Enter your last name"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input value={profileData?.email || ''} disabled />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter your phone number"
                type="tel"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Role</Label>
            <Input value={profileData?.role || ''} disabled />
          </div>

          <Separator />

          <div>
            <Label className="text-base font-semibold">Address</Label>
            <p className="text-sm text-muted-foreground mb-3">Your contact address information</p>
            
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="street">Street Address</Label>
                <Input
                  id="street"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Enter your street address"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Enter city"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="state">State / Province</Label>
                  <Input
                    id="state"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="Enter state or province"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="postalCode">Postal Code</Label>
                  <Input
                    id="postalCode"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="Enter postal code"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Enter country"
                  />
                </div>
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid gap-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us a bit about yourself..."
              rows={4}
            />
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

      {/* Test Accounts Manager - Only visible to admins */}
      <TestAccountsManager />

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
