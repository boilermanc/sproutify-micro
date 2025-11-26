import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { notifyNewOrder, checkHarvestReminders } from '../services/notificationService';
import { Eye, Edit, ShoppingBasket, Plus, Search } from 'lucide-react';
import EmptyState from '../components/onboarding/EmptyState';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const TraysPage = () => {
  const [trays, setTrays] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTray, setNewTray] = useState({
    recipe_id: '',
    batch_id: 'null',
  });

  const fetchTrays = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;

      const { farmUuid } = JSON.parse(sessionData);

      // Fetch trays with recipes join (recipes has variety_name as text field)
      // Note: seedbatches join removed - will fetch separately to avoid column name issues
      const { data, error } = await supabase
        .from('trays')
        .select(`
          *,
          recipes!inner(variety_name, recipe_name)
        `)
        .eq('farm_uuid', farmUuid)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch seedbatches separately to get batch info
      // Actual DB column: batchid (not batch_id)
      const batchIds = (data || [])
        .map(tray => tray.batch_id)
        .filter(id => id !== null && id !== undefined);
      
      let batchesMap: Record<number, any> = {};
      if (batchIds.length > 0) {
        const { data: batchesData } = await supabase
          .from('seedbatches')
          .select('batchid, varietyid')
          .in('batchid', batchIds);
        
        // Fetch variety names for batches
        const varietyIds = (batchesData || [])
          .map(b => b.varietyid)
          .filter(id => id !== null && id !== undefined);
        
        let varietiesMap: Record<number, any> = {};
        if (varietyIds.length > 0) {
          const { data: varietiesData } = await supabase
            .from('varieties')
            .select('varietyid, name')
            .in('varietyid', varietyIds);
          
          varietiesMap = (varietiesData || []).reduce((acc, v) => {
            acc[v.varietyid] = v.name;
            return acc;
          }, {} as Record<number, string>);
        }
        
        // Map batches with variety names
        batchesMap = (batchesData || []).reduce((acc, b) => {
          acc[b.batchid] = {
            batchid: b.batchid,
            variety_name: varietiesMap[b.varietyid] || ''
          };
          return acc;
        }, {} as Record<number, any>);
      }

      const formattedTrays = (data || []).map(tray => {
        const batch = tray.batch_id ? batchesMap[tray.batch_id] : null;
        return {
          id: tray.tray_id,
          trayId: tray.tray_unique_id || tray.tray_id,
          batchId: batch ? `B-${batch.batchid}` : 'N/A',
          variety: tray.recipes?.variety_name || 'Unknown',
          recipe: tray.recipes?.recipe_name || 'Unknown',
          location: 'N/A', // Location not in schema yet
          status: tray.harvest_date ? 'Harvested' : 'Growing',
          created_at: new Date(tray.created_at).toLocaleDateString()
        };
      });

      setTrays(formattedTrays);
    } catch (error) {
      console.error('Error fetching trays:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFormData = async () => {
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      // Fetch recipes and batches separately
      // Batches: actual columns are batchid, varietyid (FK to varieties.varietyid)
      const [recipesResult, batchesResult] = await Promise.all([
        supabase
          .from('recipes')
          .select('*')
          .eq('farm_uuid', farmUuid)
          .eq('is_active', true)
          .order('recipe_name', { ascending: true }),
        supabase
          .from('seedbatches')
          .select('*')
          .eq('farm_uuid', farmUuid)
          .order('purchasedate', { ascending: false }) // Actual column: purchasedate
      ]);

      // Fetch varieties to get names for batches
      const varietyIds = (batchesResult.data || [])
        .map(b => b.varietyid)
        .filter(id => id !== null && id !== undefined);
      
      let varietiesMap: Record<number, string> = {};
      if (varietyIds.length > 0) {
        const { data: varietiesData } = await supabase
          .from('varieties')
          .select('varietyid, name')
          .in('varietyid', varietyIds);
        
        varietiesMap = (varietiesData || []).reduce((acc, v) => {
          acc[v.varietyid] = v.name;
          return acc;
        }, {} as Record<number, string>);
      }

      // Normalize batches with variety names
      const normalizedBatches = (batchesResult.data || []).map((batch: any) => ({
        ...batch,
        batch_id: batch.batchid, // Map for code compatibility
        variety_name: varietiesMap[batch.varietyid] || ''
      }));

      setRecipes(recipesResult.data || []);
      setBatches(normalizedBatches);
    } catch (error) {
      console.error('Error fetching form data:', error);
    }
  };

  useEffect(() => {
    fetchTrays();
    fetchFormData();
  }, []);

  const handleAddTray = async () => {
    if (!newTray.recipe_id) return;

    setCreating(true);
    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) return;
      const { farmUuid } = JSON.parse(sessionData);

      // Generate a unique ID for the tray
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const trayUniqueId = `T-${timestamp}${random}`;

      const payload = {
        recipe_id: parseInt(newTray.recipe_id),
        batch_id: newTray.batch_id === 'null' ? null : parseInt(newTray.batch_id),
        tray_unique_id: trayUniqueId,
        farm_uuid: farmUuid,
        sow_date: new Date().toISOString(),
      };

      const { data: insertedTray, error } = await supabase
        .from('trays')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      setNewTray({ recipe_id: '', batch_id: 'null' });
      setIsAddDialogOpen(false);
      fetchTrays();

      // Check for notifications
      if (insertedTray) {
        // If tray has a customer_id, notify about new order
        if ((insertedTray as { customer_id?: number }).customer_id) {
          notifyNewOrder(insertedTray.tray_id);
        }
        // Check if harvest is coming up soon
        checkHarvestReminders();
      }
    } catch (error) {
      console.error('Error creating tray:', error);
      alert('Failed to create tray');
    } finally {
      setCreating(false);
    }
  };

  const filteredTrays = trays.filter(tray => 
    tray.variety.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tray.trayId.toString().toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Trays</h1>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trays</h1>
          <p className="text-muted-foreground">Manage your growing trays</p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Tray
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Tray</DialogTitle>
              <DialogDescription>
                Start a new tray from a recipe.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="recipe">Recipe</Label>
                <Select 
                  value={newTray.recipe_id} 
                  onValueChange={(value) => setNewTray({ ...newTray, recipe_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a recipe" />
                  </SelectTrigger>
                  <SelectContent>
                    {recipes.map((recipe) => (
                      <SelectItem key={recipe.recipe_id} value={recipe.recipe_id.toString()}>
                        {recipe.recipe_name} ({recipe.variety_name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="batch">Seed Batch (Optional)</Label>
                <Select 
                  value={newTray.batch_id} 
                  onValueChange={(value) => setNewTray({ ...newTray, batch_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a batch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="null">None</SelectItem>
                    {batches.map((batch) => {
                      const batchId = batch.batch_id || batch.batchid;
                      return (
                        <SelectItem key={batchId} value={batchId.toString()}>
                          B-{batchId} ({batch.variety_name || ''})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddTray} disabled={creating || !newTray.recipe_id}>
                {creating ? 'Creating...' : 'Create Tray'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search trays..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="rounded-md border bg-card text-card-foreground shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tray ID</TableHead>
              <TableHead>Recipe</TableHead>
              <TableHead>Batch ID</TableHead>
              <TableHead>Variety</TableHead>
              <TableHead>Planted Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTrays.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0 border-none">
                  <div className="p-8 flex flex-col items-center justify-center text-center">
                     {searchTerm ? (
                       <>
                         <p className="text-muted-foreground mb-4">No trays found matching "{searchTerm}"</p>
                         <Button variant="outline" onClick={() => setSearchTerm('')}>Clear Search</Button>
                       </>
                     ) : (
                        <EmptyState
                          icon={<ShoppingBasket size={64} className="text-muted-foreground mb-4" />}
                          title="No Trays Yet"
                          description="Trays are your active growing containers. Create your first tray to get started!"
                          actionLabel="+ Create Your First Tray"
                          onAction={() => setIsAddDialogOpen(true)}
                          showOnboardingLink={true}
                        />
                     )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredTrays.map((tray) => (
                <TableRow key={tray.id}>
                  <TableCell className="font-medium">{tray.trayId}</TableCell>
                  <TableCell>{tray.recipe}</TableCell>
                  <TableCell>{tray.batchId}</TableCell>
                  <TableCell>{tray.variety}</TableCell>
                  <TableCell>{tray.created_at}</TableCell>
                  <TableCell>
                    <Badge variant={tray.status.toLowerCase() === 'growing' ? 'default' : 'secondary'} className={tray.status.toLowerCase() === 'growing' ? 'bg-green-500 hover:bg-green-600' : ''}>
                      {tray.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => alert(`View details for ${tray.trayId}`)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => alert(`Edit ${tray.trayId}`)}>
                        <Edit className="h-4 w-4" />
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

export default TraysPage;
