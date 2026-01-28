import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  RefreshCw,
  AlertCircle,
  Loader2,
  Phone,
  Mail,
  MessageSquare,
  MapPin,
  Calendar,
  ChevronRight,
  X
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

interface Customer {
  customer_id: number;
  customer_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  delivery_address: string | null;
  delivery_instructions: string | null;
  preferred_delivery_days: string[] | null;
  notes: string | null;
}

const DAYS_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const FarmHandCustomers = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const loadCustomers = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      setError(null);

      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) throw new Error('Session not found');
      const { farmUuid } = JSON.parse(sessionData);

      const { data, error: fetchError } = await getSupabaseClient()
        .from('customers')
        .select('*')
        .eq('farm_uuid', farmUuid)
        .order('name', { ascending: true });

      if (fetchError) throw fetchError;

      const normalized: Customer[] = (data || []).map((c: any) => {
        // Compose address from billing fields
        let address = null;
        if (c.billingstreet) {
          address = c.billingstreet;
          if (c.billingcity) address += `, ${c.billingcity}`;
          if (c.billingstate) address += `, ${c.billingstate}`;
          if (c.billingpostalcode) address += ` ${c.billingpostalcode}`;
        }

        return {
          customer_id: c.customerid ?? c.customer_id,
          customer_name: c.name ?? c.customer_name ?? '',
          email: c.email ?? null,
          phone: c.contactnumber ?? c.phone ?? null,
          address,
          delivery_address: c.delivery_address ?? null,
          delivery_instructions: c.delivery_instructions ?? null,
          preferred_delivery_days: c.preferred_delivery_days ?? null,
          notes: c.notes ?? null,
        };
      });

      setCustomers(normalized);
    } catch (err) {
      console.error('Error loading customers:', err);
      setError('Failed to load customers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const formatDeliveryDays = (days: string[] | null) => {
    if (!days || days.length === 0) return null;

    // Sort by day order and abbreviate
    const sorted = [...days].sort((a, b) =>
      DAYS_ORDER.indexOf(a) - DAYS_ORDER.indexOf(b)
    );

    return sorted.map(d => d.slice(0, 3)).join(', ');
  };

  const handleCall = (phone: string) => {
    window.location.href = `tel:${phone.replace(/\D/g, '')}`;
  };

  const handleText = (phone: string) => {
    window.location.href = `sms:${phone.replace(/\D/g, '')}`;
  };

  const handleEmail = (email: string) => {
    window.location.href = `mailto:${email}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500">
            {customers.length === 0 ? 'No customers' : `${customers.length} customer${customers.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => loadCustomers(true)}
          disabled={refreshing}
        >
          <RefreshCw className={cn("h-5 w-5", refreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Card className="p-4 bg-red-50 border-red-200">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </Card>
      )}

      {/* Customer List */}
      {customers.length === 0 ? (
        <Card className="p-8 text-center">
          <Users className="h-12 w-12 mx-auto text-slate-400 mb-3" />
          <p className="text-lg font-medium text-slate-700">No customers yet</p>
          <p className="text-sm text-slate-500 mt-1">
            Customers will appear here when added.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {customers.map((customer) => (
            <Card
              key={customer.customer_id}
              className="p-4 border-l-4 border-blue-400 bg-blue-50 cursor-pointer transition-all active:scale-[0.98]"
              onClick={() => setSelectedCustomer(customer)}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-100">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{customer.customer_name}</span>
                    <ChevronRight className="h-5 w-5 text-slate-400 flex-shrink-0" />
                  </div>

                  {/* Quick contact info */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-slate-600">
                    {customer.phone && (
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        <span>{customer.phone}</span>
                      </div>
                    )}
                    {customer.preferred_delivery_days && customer.preferred_delivery_days.length > 0 && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDeliveryDays(customer.preferred_delivery_days)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Customer Detail Dialog */}
      <Dialog open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              {selectedCustomer?.customer_name}
            </DialogTitle>
          </DialogHeader>

          {selectedCustomer && (
            <div className="space-y-4">
              {/* Quick Actions */}
              <div className="grid grid-cols-3 gap-2">
                {selectedCustomer.phone && (
                  <>
                    <Button
                      variant="outline"
                      className="flex flex-col items-center gap-1 h-auto py-3"
                      onClick={() => handleCall(selectedCustomer.phone!)}
                    >
                      <Phone className="h-5 w-5 text-emerald-600" />
                      <span className="text-xs">Call</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="flex flex-col items-center gap-1 h-auto py-3"
                      onClick={() => handleText(selectedCustomer.phone!)}
                    >
                      <MessageSquare className="h-5 w-5 text-blue-600" />
                      <span className="text-xs">Text</span>
                    </Button>
                  </>
                )}
                {selectedCustomer.email && (
                  <Button
                    variant="outline"
                    className="flex flex-col items-center gap-1 h-auto py-3"
                    onClick={() => handleEmail(selectedCustomer.email!)}
                  >
                    <Mail className="h-5 w-5 text-purple-600" />
                    <span className="text-xs">Email</span>
                  </Button>
                )}
              </div>

              {/* Contact Details */}
              <div className="space-y-3">
                {selectedCustomer.phone && (
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                    <Phone className="h-4 w-4 text-slate-500 mt-0.5" />
                    <div>
                      <p className="text-xs text-slate-500 uppercase">Phone</p>
                      <p className="text-sm text-slate-900">{selectedCustomer.phone}</p>
                    </div>
                  </div>
                )}

                {selectedCustomer.email && (
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                    <Mail className="h-4 w-4 text-slate-500 mt-0.5" />
                    <div>
                      <p className="text-xs text-slate-500 uppercase">Email</p>
                      <p className="text-sm text-slate-900 break-all">{selectedCustomer.email}</p>
                    </div>
                  </div>
                )}

                {selectedCustomer.preferred_delivery_days && selectedCustomer.preferred_delivery_days.length > 0 && (
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                    <Calendar className="h-4 w-4 text-slate-500 mt-0.5" />
                    <div>
                      <p className="text-xs text-slate-500 uppercase">Delivery Days</p>
                      <p className="text-sm text-slate-900">
                        {selectedCustomer.preferred_delivery_days.join(', ')}
                      </p>
                    </div>
                  </div>
                )}

                {(selectedCustomer.delivery_address || selectedCustomer.address) && (
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                    <MapPin className="h-4 w-4 text-slate-500 mt-0.5" />
                    <div>
                      <p className="text-xs text-slate-500 uppercase">
                        {selectedCustomer.delivery_address ? 'Delivery Address' : 'Address'}
                      </p>
                      <p className="text-sm text-slate-900">
                        {selectedCustomer.delivery_address || selectedCustomer.address}
                      </p>
                    </div>
                  </div>
                )}

                {selectedCustomer.delivery_instructions && (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-xs text-amber-700 uppercase mb-1">Delivery Instructions</p>
                    <p className="text-sm text-amber-900">{selectedCustomer.delivery_instructions}</p>
                  </div>
                )}

                {selectedCustomer.notes && (
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500 uppercase mb-1">Notes</p>
                    <p className="text-sm text-slate-700">{selectedCustomer.notes}</p>
                  </div>
                )}
              </div>

              {/* Close Button */}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setSelectedCustomer(null)}
              >
                <X className="h-4 w-4 mr-2" />
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FarmHandCustomers;
