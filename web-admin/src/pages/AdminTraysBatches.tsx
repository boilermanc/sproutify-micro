import { useState, useEffect, useCallback, useRef } from 'react';
import { cancelAdminRead, readAdminPage } from '../services/adminConsole';
import AdminDataStatus from '../components/AdminDataStatus';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  RefreshCcw, 
  Package,
  Sprout,
  Search,
  X,
  Building2
} from 'lucide-react';

interface Tray {
  tray_id: number;
  tray_unique_id: string;
  farm_uuid: string;
  recipe_id: number;
  sow_date: string;
  harvest_date: string | null;
  yield: number | null;
  batch_id: number | null;
  created_at: string;
  farm_name?: string;
  recipe_name?: string;
}

interface Batch {
  batch_id: number;
  farm_uuid: string;
  variety_name: string;
  purchase_date: string | null;
  quantity: number | null;
  created_at: string;
  farm_name?: string;
}

interface Farm {
  farm_uuid: string;
  farmname: string;
}

interface FarmStats {
  farm_uuid: string;
  farm_name: string;
  tray_count: number;
  batch_count: number;
}

const AdminTraysBatches = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const request = useRef(0);
  const [trays, setTrays] = useState<Tray[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmStats, setFarmStats] = useState<FarmStats[]>([]);
  const [selectedFarmUuid, setSelectedFarmUuid] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'trays' | 'batches'>('trays');

  const fetchData = useCallback(async () => {
    const current = ++request.current;
    setIsLoading(true); setLoadError(''); setTotal(null);
    try {
      const [farmPage,traysPage,seedbatchesPage] = await Promise.all([readAdminPage<Farm>('farms',page),readAdminPage<Tray & {farms?:{farmname?:string};recipes?:{recipe_name?:string};customers?:{customer_name?:string;customer_type?:string}}>('trays',page,selectedFarmUuid),readAdminPage<Batch & {farms?:{farmname?:string};recipes?:{recipe_name?:string};customers?:{customer_name?:string;customer_type?:string}}>('seedbatches',page,selectedFarmUuid)]);
      if(current !== request.current) return;
      setFarms(farmPage.rows);
      const traysRows = traysPage.rows.map(row=>({...row,farm_name:row.farms?.farmname || 'Unknown Farm',recipe_name:row.recipes?.recipe_name || 'Unknown Recipe'}));
      setTrays(traysRows);
      const seedbatchesRows = seedbatchesPage.rows.map(row=>({...row,farm_name:row.farms?.farmname || 'Unknown Farm'}));
      setBatches(seedbatchesRows);
      const summaries = new Map<string,FarmStats>();
      traysRows.forEach(row=>{const entry=summaries.get(row.farm_uuid) || {farm_uuid:row.farm_uuid,farm_name:row.farm_name,tray_count:0,batch_count:0};entry.tray_count++;summaries.set(row.farm_uuid,entry);});
      seedbatchesRows.forEach(row=>{const entry=summaries.get(row.farm_uuid) || {farm_uuid:row.farm_uuid,farm_name:row.farm_name,tray_count:0,batch_count:0};entry.batch_count++;summaries.set(row.farm_uuid,entry);});
      setFarmStats([...summaries.values()]);setTotal(Math.max(farmPage.total,traysPage.total,seedbatchesPage.total));
    } catch (error) {
      if (current === request.current) setLoadError(error instanceof Error ? error.message : 'Unable to load admin data.');
    } finally { if (current === request.current) setIsLoading(false); }
  }, [page, selectedFarmUuid]);
  useEffect(() => { void fetchData(); return () => { cancelAdminRead(request); }; }, [fetchData]);

  const filteredTrays = trays.filter(tray => {
    const trayId = (tray.tray_unique_id || '').toLowerCase();
    const farmName = (tray.farm_name || '').toLowerCase();
    const recipeName = (tray.recipe_name || '').toLowerCase();
    const searchLower = searchTerm.toLowerCase();
    return trayId.includes(searchLower) || 
           farmName.includes(searchLower) || 
           recipeName.includes(searchLower);
  });

  const filteredBatches = batches.filter(batch => {
    const varietyName = (batch.variety_name || '').toLowerCase();
    const farmName = (batch.farm_name || '').toLowerCase();
    const searchLower = searchTerm.toLowerCase();
    return varietyName.includes(searchLower) || 
           farmName.includes(searchLower);
  });

  const totalTrays = farmStats.reduce((sum, stat) => sum + stat.tray_count, 0);
  const totalBatches = farmStats.reduce((sum, stat) => sum + stat.batch_count, 0);

  if (loadError) return <div className="p-6 space-y-4"><p role="alert">{loadError} Data is unavailable.</p><Button onClick={fetchData}>Retry</Button></div>;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <AdminDataStatus error={loadError} page={page} total={total} loading={isLoading} onPage={setPage} />
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-gray-100 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Trays & Batches</h1>
          <p className="text-gray-500 font-medium mt-1">View trays and seed batches by farm</p>
        </div>
        <Button variant="outline" onClick={fetchData}>
          <RefreshCcw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-none shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Trays</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{totalTrays}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                <Sprout className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Batches</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{totalBatches}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Package className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Farms</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{farms.length}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Farm Selector */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Farm</label>
          <select
            value={selectedFarmUuid || ''}
            onChange={(e) => {setPage(1);setSelectedFarmUuid(e.target.value || null);}}
            className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          >
            <option value="">All Farms</option>
            {selectedFarmUuid && !farms.some(farm=>farm.farm_uuid===selectedFarmUuid) && <option value={selectedFarmUuid}>{selectedFarmUuid}</option>}
            {farms.map((farm) => {
              const stats = farmStats.find(s => s.farm_uuid === farm.farm_uuid);
              return (
                <option key={farm.farm_uuid} value={farm.farm_uuid}>
                  {farm.farmname} ({stats?.tray_count || 0} trays, {stats?.batch_count || 0} batches)
                </option>
              );
            })}
          </select>
        </div>
        {selectedFarmUuid && (
          <Button
            variant="outline"
            onClick={() => { setPage(1); setSelectedFarmUuid(null); }}
            className="mt-6 md:mt-0"
          >
            <X className="h-4 w-4 mr-2" />
            Clear Filter
          </Button>
        )}
      </div>

      {/* Farm Stats Grid */}
      {!selectedFarmUuid && farmStats.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Farm Statistics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {farmStats
              .sort((a, b) => (b.tray_count + b.batch_count) - (a.tray_count + a.batch_count))
              .map((stat) => (
                <Card 
                  key={stat.farm_uuid} 
                  className="border-none shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => { setPage(1); setSelectedFarmUuid(stat.farm_uuid); }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-lg">{stat.farm_name}</h3>
                      <Building2 className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Trays:</span>
                        <span className="font-semibold text-gray-900">{stat.tray_count}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Batches:</span>
                        <span className="font-semibold text-gray-900">{stat.batch_count}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      )}

      {/* Tabs and Content - Only show if farm is selected */}
      {selectedFarmUuid && (
        <>
          {/* Tabs */}
          <div className="flex gap-2 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('trays')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'trays'
                  ? 'text-purple-600 border-b-2 border-purple-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Sprout className="h-4 w-4 inline mr-2" />
              Trays ({filteredTrays.length})
            </button>
            <button
              onClick={() => setActiveTab('batches')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'batches'
                  ? 'text-purple-600 border-b-2 border-purple-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Package className="h-4 w-4 inline mr-2" />
              Batches ({filteredBatches.length})
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder={activeTab === 'trays' ? 'Search trays...' : 'Search batches...'}
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
          ) : activeTab === 'trays' ? (
            <div className="space-y-4">
              {filteredTrays.map((tray) => (
                <Card key={tray.tray_id} className="border-none shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">Tray {tray.tray_unique_id}</h3>
                          {tray.harvest_date ? (
                            <Badge className="bg-green-100 text-green-700">Harvested</Badge>
                          ) : (
                            <Badge className="bg-blue-100 text-blue-700">Active</Badge>
                          )}
                        </div>
                        <div className="space-y-1 text-sm text-gray-600">
                          <div key="recipe" className="flex items-center gap-2">
                            <span className="font-medium">Recipe:</span>
                            <span>{tray.recipe_name}</span>
                          </div>
                          <div key="sow" className="flex items-center gap-2">
                            <span className="font-medium">Sow Date:</span>
                            <span>{tray.sow_date ? new Date(tray.sow_date).toLocaleDateString() : 'N/A'}</span>
                          </div>
                          {tray.harvest_date && (
                            <div key="harvest" className="flex items-center gap-2">
                              <span className="font-medium">Harvest Date:</span>
                              <span>{new Date(tray.harvest_date).toLocaleDateString()}</span>
                            </div>
                          )}
                          {tray.yield && (
                            <div key="yield" className="flex items-center gap-2">
                              <span className="font-medium">Yield:</span>
                              <span>{tray.yield} oz</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredTrays.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  {searchTerm ? 'No trays found matching your search' : 'No trays found for this farm'}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredBatches.map((batch) => (
                <Card key={batch.batch_id} className="border-none shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{batch.variety_name}</h3>
                        </div>
                        <div className="space-y-1 text-sm text-gray-600">
                          {batch.purchase_date && (
                            <div key="purchase" className="flex items-center gap-2">
                              <span className="font-medium">Purchase Date:</span>
                              <span>{new Date(batch.purchase_date).toLocaleDateString()}</span>
                            </div>
                          )}
                          {batch.quantity && (
                            <div key="quantity" className="flex items-center gap-2">
                              <span className="font-medium">Quantity:</span>
                              <span>{batch.quantity}</span>
                            </div>
                          )}
                          <div key="created" className="flex items-center gap-2">
                            <span className="font-medium">Created:</span>
                            <span>{new Date(batch.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredBatches.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  {searchTerm ? 'No batches found matching your search' : 'No batches found for this farm'}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminTraysBatches;
