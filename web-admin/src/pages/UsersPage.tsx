import { useState, useEffect } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';
import { Edit, Trash2, UserPlus, Eye, EyeOff, Mail, Lock, User as UserIcon } from 'lucide-react';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastActive: string;
  createdAt: string;
}

const UsersPage = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [canManage, setCanManage] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Farm Hand',
  });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const client = getSupabaseClient();
        const { data: { user }, error: authError } = await client.auth.getUser();
        if (authError || !user) throw new Error('Please sign in again.');
        const { data: own, error: ownError } = await client.from('profile').select('farm_uuid, role, is_active').eq('id', user.id).single();
        if (ownError || !own?.farm_uuid || own.is_active !== true) throw new Error('Active farm membership required.');

        const { data, error } = own.role === 'Owner'
          ? await client.rpc('list_farm_users')
          : await client.from('profile').select('*').eq('id', user.id);

        if (error) throw error;

        const formattedUsers: User[] = (data || []).map((user: { id: string; firstname?: string; lastname?: string; email?: string; role?: string; is_active: boolean; last_active?: string; created_at?: string }) => ({
          id: user.id,
          name: [user.firstname, user.lastname].filter(Boolean).join(' '),
          email: user.email || '',
          role: user.role || 'Viewer',
          isActive: user.is_active,
          lastActive: user.last_active ? new Date(user.last_active).toLocaleDateString() : 'Never',
          createdAt: user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown',
        }));

        setUsers(formattedUsers);
        setCanManage(own.role === 'Owner');
      } catch (error) {
        console.error('Error fetching users:', error);
        setCanManage(false);
        setError('Team management is unavailable. Please contact support before adding accounts.');
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const handleCreateUser = async () => {
    if (!formData.name.trim() || !formData.email.trim() || formData.password.length < 12) {
      setError('Enter a name, email and a password with at least 12 characters.');
      return;
    }

    setCreating(true);
    setError('');

    try {
      const client = getSupabaseClient();
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError || !user) throw new Error('Please sign in again.');
      const { data: own, error: ownError } = await client.from('profile').select('farm_uuid, role, is_active').eq('id', user.id).single();
      if (ownError || own?.role !== 'Owner' || own.is_active !== true) throw new Error('Only an active farm owner can create accounts.');
      const farmUuid = own.farm_uuid;
      const { data: { session } } = await client.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: formData.email.trim().toLowerCase(),
          password: formData.password,
          name: formData.name.trim(),
          role: formData.role,
          farmUuid,
        }),
      });

      const result = await response.json();

      if (!response.ok || result.success !== true || !result.user?.id || result.user.farmUuid !== farmUuid || result.user.role !== formData.role) {
        throw new Error(result.error || 'Failed to create user');
      }

      // Format and add the new user to the list
      const newUser: User = {
        id: result.user.id,
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        role: result.user.role || formData.role,
        isActive: result.user.isActive ?? true,
        lastActive: 'Just now',
        createdAt: result.user.createdAt ? new Date(result.user.createdAt).toLocaleDateString() : new Date().toLocaleDateString(),
      };
      setUsers(current => [newUser, ...current]);
      
      // Reset form and close modal
      setFormData({ name: '', email: '', password: '', role: 'Farm Hand' });
      setShowAddModal(false);
      setError('');
      setNotice(result.verificationDelivery === 'sent' ? 'Account created. A verification email was requested for the new user.' : 'Account created, but the verification email could not be sent. Use Resend verification on the login page; do not create the account again.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const name = user.name || '';
    const email = user.email || '';
    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'All' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleBadgeVariant = (role: string) => {
    switch (role.toLowerCase()) {
      case 'owner': return 'default';
      case 'editor': return 'secondary';
      case 'viewer': return 'outline';
      default: return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="table-page">
        <div className="page-header">
          <div>
            <h1 className="text-3xl font-bold">User Management</h1>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">Manage farm users and permissions</p>
        </div>
        <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
          <DialogTrigger asChild>
            <Button disabled={!canManage}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                Add a new team member to your farm
              </DialogDescription>
            </DialogHeader>
            
            {error && (
              <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm mb-4 flex items-center gap-2">
                <span>!</span>
                <span>{error}</span>
              </div>
            )}

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Full Name</Label>
                <div className="relative">
                  <UserIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    placeholder="John Doe"
                    className="pl-8"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={creating}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="john.doe@example.com"
                    className="pl-8"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    disabled={creating}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Minimum 12 characters"
                    className="pl-8 pr-10"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    disabled={creating}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={creating}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Password must be at least 12 characters long</p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="role">Role</Label>
                <Select 
                  value={formData.role} 
                  onValueChange={(value) => setFormData({ ...formData, role: value })}
                  disabled={creating}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Farm Hand">Farm Hand - Daily farm work</SelectItem>
                    <SelectItem value="Viewer">Viewer - Read-only access</SelectItem>
                    <SelectItem value="Editor">Editor - Can edit data</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {formData.role === 'Farm Hand' && 'Can record daily farm work without managing customers, billing, or users'}
                  {formData.role === 'Viewer' && 'Can view data but cannot make changes'}
                  {formData.role === 'Editor' && 'Can view and edit data but cannot manage users'}
                  {formData.role === 'Owner' && 'Full access including user management'}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddModal(false)} disabled={creating}>
                Cancel
              </Button>
              <Button onClick={handleCreateUser} disabled={creating || !canManage}>
                {creating ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Creating...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Create User
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {notice && <p role="status">{notice}</p>}
      {error && !showAddModal && <p role="alert">{error}</p>}
      <div className="flex items-center space-x-4">
        <div className="flex-1 max-w-sm">
          <Input
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="w-[200px]">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Roles</SelectItem>
              <SelectItem value="Owner">Owner</SelectItem>
              <SelectItem value="Editor">Editor</SelectItem>
              <SelectItem value="Farm Hand">Farm Hand</SelectItem>
              <SelectItem value="Viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Active</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(user.role)}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? 'default' : 'secondary'} className={user.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-700'}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>{user.lastActive}</TableCell>
                  <TableCell>{user.createdAt}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => alert(`Edit ${user.name}`)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => alert(`Delete ${user.name}`)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default UsersPage;
