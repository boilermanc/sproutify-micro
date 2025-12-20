import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  RefreshCcw, 
  Users, 
  Building2,
  Search,
  X
} from 'lucide-react';

interface Farm {
  farm_uuid: string;
  farm_name?: string;
  farmname?: string;
  created_at?: string;
  is_active: boolean;
  user_count?: number;
}

interface User {
  id: string;
  email: string;
  name: string;
  farm_uuid: string;
  role: string;
  is_active: boolean;
  created_at: string;
  last_active: string;
  farm_name?: string;
}

const AdminFarmsUsers = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'farms' | 'users'>('farms');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch farms with user counts
      const { data: farmsData, error: farmsError } = await getSupabaseClient()
        .from('farms')
        .select('*')
        .limit(100);

      if (farmsError) {
        console.error('Farms error:', farmsError);
        // If RLS error, show helpful message
        if (farmsError.code === 'PGRST301' || farmsError.message.includes('permission denied')) {
          throw new Error('Admin RLS policies not configured. Please run migration 033_add_admin_rls_policies.sql');
        }
        throw farmsError;
      }

      // Fetch user counts for each farm
      const farmsWithCounts: Farm[] = await Promise.all(
        (farmsData || []).map(async (farm: Record<string, unknown>) => {
          const { count } = await getSupabaseClient()
            .from('profile')
            .select('*', { count: 'exact', head: true })
            .eq('farm_uuid', farm.farm_uuid as string);
          // Normalize farm name - handle both farmname and farm_name
          const farmName = (farm.farmname || farm.farm_name || 'Unknown Farm') as string;
          return { 
            ...farm, 
            farm_name: farmName, 
            user_count: count || 0,
            farm_uuid: farm.farm_uuid as string,
            is_active: (farm.is_active ?? true) as boolean,
            created_at: farm.created_at as string | undefined
          } as Farm;
        })
      );

      setFarms(farmsWithCounts);

      // Fetch users with farm names
      const { data: usersData, error: usersError } = await getSupabaseClient()
        .from('profile')
        .select(`
          *,
          farms (
            farmname
          )
        `)
        .limit(100);

      if (usersError) {
        console.error('Users error:', usersError);
        // If RLS error, show helpful message
        if (usersError.code === 'PGRST301' || usersError.message.includes('permission denied')) {
          throw new Error('Admin RLS policies not configured. Please run migration 033_add_admin_rls_policies.sql');
        }
        throw usersError;
      }

      const usersWithFarmNames: User[] = (usersData || []).map((user: Record<string, unknown>) => {
        const farmsData = user.farms as Record<string, unknown> | undefined;
        const farmName = (farmsData?.farmname || 'No Farm') as string;
        return {
          ...user,
          farm_name: farmName,
          id: user.id as string,
          email: user.email as string,
          name: user.name as string,
          farm_uuid: user.farm_uuid as string,
          role: user.role as string,
          is_active: (user.is_active ?? false) as boolean,
          created_at: user.created_at as string,
          last_active: user.last_active as string
        } as User;
      });

      setUsers(usersWithFarmNames);
    } catch (error) {
      console.error('Error fetching data:', error);
      // Show user-friendly error
      if (error instanceof Error && error.message.includes('RLS')) {
        alert('Admin access not configured. Please contact support to set up admin RLS policies.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredFarms = farms.filter(farm => {
    const farmName = (farm.farm_name || farm.farmname || '').toLowerCase();
    return farmName.includes(searchTerm.toLowerCase());
  });

  const filteredUsers = users.filter(user => {
    const name = (user.name || '').toLowerCase();
    const email = (user.email || '').toLowerCase();
    const farmName = (user.farm_name || '').toLowerCase();
    const searchLower = searchTerm.toLowerCase();
    return name.includes(searchLower) || 
           email.includes(searchLower) || 
           farmName.includes(searchLower);
  });

  const roleColors: Record<string, string> = {
    'Owner': 'bg-purple-100 text-purple-700',
    'Editor': 'bg-blue-100 text-blue-700',
    'Viewer': 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-gray-100 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Farms & Users</h1>
          <p className="text-gray-500 font-medium mt-1">Manage all farms and user accounts</p>
        </div>
        <Button variant="outline" onClick={fetchData}>
          <RefreshCcw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('farms')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'farms'
              ? 'text-purple-600 border-b-2 border-purple-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Building2 className="h-4 w-4 inline mr-2" />
          Farms ({farms.length})
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'users'
              ? 'text-purple-600 border-b-2 border-purple-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="h-4 w-4 inline mr-2" />
          Users ({users.length})
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="text"
          placeholder={activeTab === 'farms' ? 'Search farms...' : 'Search users by name, email, or farm...'}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 pr-10"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : activeTab === 'farms' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFarms.map((farm) => (
            <Card key={farm.farm_uuid} className="border-none shadow-sm hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{farm.farm_name || farm.farmname || 'Unknown Farm'}</CardTitle>
                  <Badge variant={farm.is_active ? 'default' : 'secondary'}>
                    {farm.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Users:</span>
                    <span className="font-medium">{farm.user_count || 0}</span>
                  </div>
                  {farm.created_at && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Created:</span>
                      <span className="font-medium">
                        {new Date(farm.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Farm ID:</span>
                    <span className="font-mono text-xs text-gray-400">
                      {farm.farm_uuid.substring(0, 8)}...
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredFarms.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500">
              No farms found
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredUsers.map((user) => (
            <Card key={user.id} className="border-none shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">{user.name}</h3>
                      <Badge className={roleColors[user.role] || 'bg-gray-100 text-gray-700'}>
                        {user.role}
                      </Badge>
                      {user.is_active ? (
                        <Badge variant="default" className="bg-green-100 text-green-700">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Email:</span>
                        <span>{user.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Farm:</span>
                        <span>{user.farm_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Created:</span>
                        <span>{new Date(user.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Last Active:</span>
                        <span>{new Date(user.last_active).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredUsers.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No users found
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminFarmsUsers;

