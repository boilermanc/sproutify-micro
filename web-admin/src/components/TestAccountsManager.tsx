import { useState, useEffect, useRef } from 'react';
import { Search, Trash2, Loader2, Shield, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { getSupabaseClient } from '@/lib/supabaseClient';

interface TestAccount {
  id: number;
  email: string;
  notes: string | null;
  created_at: string;
}

interface ProfileResult {
  id: string;
  email: string;
  name: string | null;
  farms: { farmname: string }[] | null;
}

const TestAccountsManager = () => {
  const [testAccounts, setTestAccounts] = useState<TestAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProfileResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { addToast } = useToast();

  useEffect(() => {
    fetchAccounts();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      searchProfiles(searchQuery.trim());
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const fetchAccounts = async () => {
    setIsLoading(true);
    try {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('test_accounts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTestAccounts(data || []);
    } catch (err) {
      console.error('Error fetching test accounts:', err);
      addToast({
        type: 'error',
        title: 'Error',
        description: 'Failed to load test accounts',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const searchProfiles = async (query: string) => {
    setIsSearching(true);
    try {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('profile')
        .select('id, email, name, farms(farmname)')
        .or(`email.ilike.%${query}%,name.ilike.%${query}%`)
        .limit(10);

      if (error) throw error;

      // Filter out emails already in test accounts
      const existingEmails = new Set(testAccounts.map(a => a.email.toLowerCase()));
      const filtered = (data || []).filter(
        (p: any) => !existingEmails.has(p.email?.toLowerCase())
      );

      setSearchResults(filtered);
      setShowResults(true);
    } catch (err) {
      console.error('Error searching profiles:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddAccount = async (profile: ProfileResult) => {
    setIsSaving(true);
    setShowResults(false);
    setSearchQuery('');

    try {
      const client = getSupabaseClient();
      const { data: { user } } = await client.auth.getUser();

      const farmName = profile.farms?.[0]?.farmname;
      const notes = [profile.name, farmName].filter(Boolean).join(' - ') || null;

      const { data, error } = await client
        .from('test_accounts')
        .insert({
          email: profile.email.toLowerCase().trim(),
          notes,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('This email is already a test account');
        }
        throw error;
      }

      setTestAccounts([data, ...testAccounts]);

      addToast({
        type: 'success',
        title: 'Success',
        description: `${profile.email} added as a test account`,
      });
    } catch (err: any) {
      console.error('Error adding test account:', err);
      addToast({
        type: 'error',
        title: 'Error',
        description: err.message || 'Failed to add test account',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveAccount = async (id: number, email: string) => {
    if (!confirm(`Remove ${email} from test accounts?`)) return;

    try {
      const client = getSupabaseClient();
      const { error } = await client
        .from('test_accounts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setTestAccounts(testAccounts.filter(a => a.id !== id));

      addToast({
        type: 'success',
        title: 'Removed',
        description: `${email} removed from test accounts`,
      });
    } catch (err) {
      console.error('Error removing test account:', err);
      addToast({
        type: 'error',
        title: 'Error',
        description: 'Failed to remove test account',
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-amber-500" />
          <CardTitle>Test Accounts</CardTitle>
        </div>
        <CardDescription>
          Manage accounts that bypass subscription restrictions. Search for registered users by name or email to add them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search for users */}
        <div ref={searchRef} className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              className="pl-9"
              disabled={isSaving}
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Search results dropdown */}
          {showResults && searchResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {searchResults.map((profile) => {
                const farmName = profile.farms?.[0]?.farmname;
                return (
                  <button
                    key={profile.id}
                    onClick={() => handleAddAccount(profile)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left border-b last:border-b-0 border-slate-100"
                  >
                    <div>
                      <p className="font-medium text-sm">{profile.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {[profile.name, farmName].filter(Boolean).join(' · ') || 'No name'}
                      </p>
                    </div>
                    <UserPlus className="h-4 w-4 text-emerald-500 shrink-0 ml-2" />
                  </button>
                );
              })}
            </div>
          )}

          {showResults && searchQuery.trim().length >= 2 && !isSearching && searchResults.length === 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg p-4">
              <p className="text-sm text-muted-foreground text-center">No matching users found</p>
            </div>
          )}
        </div>

        {/* List of test accounts */}
        <div className="space-y-2">
          {testAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No test accounts configured. Search for a user above to add them.
            </p>
          ) : (
            testAccounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              >
                <div>
                  <p className="font-medium">{account.email}</p>
                  {account.notes && (
                    <p className="text-sm text-muted-foreground">{account.notes}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveAccount(account.id, account.email)}
                  className="text-red-500 hover:text-red-700 hover:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Note: All @sproutify.app emails automatically bypass subscription restrictions.
        </p>
      </CardContent>
    </Card>
  );
};

export default TestAccountsManager;
