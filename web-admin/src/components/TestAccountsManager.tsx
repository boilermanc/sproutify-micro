import { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { getSupabaseClient } from '@/integrations/supabase/client';

interface TestAccount {
  id: number;
  email: string;
  notes: string | null;
  created_at: string;
}

const TestAccountsManager = () => {
  const [testAccounts, setTestAccounts] = useState<TestAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const { addToast } = useToast();

  useEffect(() => {
    fetchAccounts();
  }, []);

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

  const handleAddAccount = async () => {
    if (!newEmail.trim()) {
      addToast({
        type: 'error',
        title: 'Error',
        description: 'Please enter an email address',
      });
      return;
    }

    // Basic email validation
    if (!newEmail.includes('@')) {
      addToast({
        type: 'error',
        title: 'Error',
        description: 'Please enter a valid email address',
      });
      return;
    }

    setIsSaving(true);
    try {
      const client = getSupabaseClient();
      const { data: { user } } = await client.auth.getUser();

      const { data, error } = await client
        .from('test_accounts')
        .insert({
          email: newEmail.toLowerCase().trim(),
          notes: newNotes.trim() || null,
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
      setNewEmail('');
      setNewNotes('');

      addToast({
        type: 'success',
        title: 'Success',
        description: 'Test account added successfully',
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
          Manage accounts that bypass subscription restrictions. These accounts can access the app even with an expired subscription.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new account form */}
        <div className="flex gap-2">
          <Input
            placeholder="Email address"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Notes (optional)"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleAddAccount} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* List of test accounts */}
        <div className="space-y-2">
          {testAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No test accounts configured. Add an email above.
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
