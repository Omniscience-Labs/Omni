'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  useEnterpriseAdminCheck,
  useEnterprisePoolStatus,
  useEnterpriseUsers,
  useEnterpriseStats,
  useEnterpriseCreditHistory,
  useLoadCredits,
  useNegateCredits,
  useUpdateUserLimit,
  useDeactivateUser,
  useReactivateUser,
  useRefreshEnterpriseData,
  type EnterpriseUser,
} from '@/hooks/admin/use-enterprise-admin';
import { 
  Building2,
  DollarSign,
  Users,
  TrendingUp,
  Plus,
  Minus,
  RefreshCw,
  Shield,
  AlertCircle,
  CheckCircle,
  XCircle,
  Edit2,
  History,
} from 'lucide-react';
import { isEnterpriseMode } from '@/lib/config';
import { toast } from 'sonner';

// ============================================================================
// LOAD CREDITS DIALOG
// ============================================================================

function LoadCreditsDialog({ isOmni }: { isOmni: boolean }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const loadCredits = useLoadCredits();

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid positive amount');
      return;
    }

    try {
      await loadCredits.mutateAsync({ 
        amount: numAmount, 
        description: description || 'Credit load' 
      });
      toast.success(`Successfully loaded $${numAmount.toFixed(2)}`);
      setOpen(false);
      setAmount('');
      setDescription('');
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to load funds');
    }
  };

  if (!isOmni) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Load Funds
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Load Funds to Pool</DialogTitle>
          <DialogDescription>
            Add funds to the enterprise pool. This will be available for all users.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount ($)</Label>
            <Input
              id="amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="100.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              placeholder="Monthly credit allocation"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loadCredits.isPending}>
            {loadCredits.isPending ? 'Loading...' : 'Load Funds'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// NEGATE CREDITS DIALOG
// ============================================================================

function NegateCreditsDialog({ isOmni }: { isOmni: boolean }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const negateCredits = useNegateCredits();

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid positive amount');
      return;
    }

    try {
      await negateCredits.mutateAsync({ 
        amount: numAmount, 
        description: description || 'Credit negation' 
      });
      toast.success(`Successfully negated $${numAmount.toFixed(2)}`);
      setOpen(false);
      setAmount('');
      setDescription('');
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to negate funds');
    }
  };

  if (!isOmni) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Minus className="h-4 w-4" />
          Negate Funds
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Negate Funds from Pool</DialogTitle>
          <DialogDescription>
            Remove funds from the enterprise pool. Use with caution.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="negate-amount">Amount ($)</Label>
            <Input
              id="negate-amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="50.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="negate-description">Reason</Label>
            <Input
              id="negate-description"
              placeholder="Adjustment reason"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={negateCredits.isPending}>
            {negateCredits.isPending ? 'Processing...' : 'Negate Funds'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// EDIT USER LIMIT DIALOG
// ============================================================================

function EditUserLimitDialog({ user, onClose }: { user: EnterpriseUser | null; onClose: () => void }) {
  const [limit, setLimit] = useState(user?.monthly_limit?.toString() || '100');
  const updateLimit = useUpdateUserLimit();

  const handleSubmit = async () => {
    if (!user) return;
    
    const numLimit = parseFloat(limit);
    if (isNaN(numLimit) || numLimit < 0) {
      toast.error('Please enter a valid limit');
      return;
    }

    try {
      await updateLimit.mutateAsync({ 
        accountId: user.account_id, 
        monthly_limit: numLimit 
      });
      toast.success(`Updated limit to $${numLimit.toFixed(2)}`);
      onClose();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to update limit');
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Monthly Limit</DialogTitle>
          <DialogDescription>
            Update the monthly spending limit for {user?.email || user?.account_id}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="user-limit">Monthly Limit ($)</Label>
            <Input
              id="user-limit"
              type="number"
              min="0"
              step="1"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
          <div className="text-sm text-muted-foreground">
            Current usage: ${user?.current_month_usage?.toFixed(2) || '0.00'}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={updateLimit.isPending}>
            {updateLimit.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// USER TABLE
// ============================================================================

function EnterpriseUserTable() {
  const { data: users, isLoading } = useEnterpriseUsers();
  const [editingUser, setEditingUser] = useState<EnterpriseUser | null>(null);
  const deactivateUser = useDeactivateUser();
  const reactivateUser = useReactivateUser();

  const handleToggleActive = async (user: EnterpriseUser) => {
    try {
      if (user.is_active) {
        await deactivateUser.mutateAsync(user.account_id);
        toast.success('User deactivated');
      } else {
        await reactivateUser.mutateAsync(user.account_id);
        toast.success('User reactivated');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to update user status');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!users || users.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No users have used the system yet.</p>
        <p className="text-sm">Users are provisioned on first use.</p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Usage</TableHead>
            <TableHead>Limit</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.account_id}>
              <TableCell>
                <div className="font-medium">{user.email || 'Unknown'}</div>
                <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {user.account_id}
                </div>
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <div className="text-sm">
                    ${user.current_month_usage.toFixed(2)} / ${user.monthly_limit.toFixed(2)}
                  </div>
                  <Progress value={user.usage_percentage} className="h-2 w-24" />
                </div>
              </TableCell>
              <TableCell>
                <div className="text-sm font-medium">
                  ${user.remaining.toFixed(2)} remaining
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={user.is_active ? 'default' : 'secondary'}>
                  {user.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingUser(user)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleActive(user)}
                  >
                    {user.is_active ? (
                      <XCircle className="h-4 w-4 text-destructive" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      
      <EditUserLimitDialog 
        user={editingUser} 
        onClose={() => setEditingUser(null)} 
      />
    </>
  );
}

// ============================================================================
// CREDIT HISTORY
// ============================================================================

function CreditHistorySection() {
  const { data, isLoading } = useEnterpriseCreditHistory(10);

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (!data?.history || data.history.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-sm">
        No transactions yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.history.slice(0, 5).map((load) => (
        <div key={load.id} className="flex items-center justify-between py-2 border-b last:border-0">
          <div className="flex items-center gap-2">
            {load.type === 'load' ? (
              <Plus className="h-4 w-4 text-green-500" />
            ) : (
              <Minus className="h-4 w-4 text-red-500" />
            )}
            <div>
              <div className="text-sm font-medium">
                {load.type === 'load' ? '+' : '-'}${Math.abs(load.amount).toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">
                {load.description || load.type}
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(load.created_at).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function EnterpriseAdminPage() {
  const { data: adminStatus, isLoading: adminLoading, error: adminError } = useEnterpriseAdminCheck();
  const { data: poolStatus, isLoading: poolLoading } = useEnterprisePoolStatus();
  const { data: stats, isLoading: statsLoading } = useEnterpriseStats();
  const { refreshAll } = useRefreshEnterpriseData();

  // Check if enterprise mode is enabled
  if (!isEnterpriseMode()) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Enterprise Mode Disabled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Enterprise mode is not enabled for this instance. 
              Contact your administrator to enable enterprise billing.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not authorized
  if (adminError || !adminStatus?.is_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-red-500" />
              Access Denied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              You don't have permission to access the enterprise admin dashboard.
              Contact your administrator if you believe this is an error.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              Enterprise Admin
            </h1>
            <p className="text-md text-muted-foreground mt-1">
              Manage enterprise billing and user limits
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refreshAll}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <LoadCreditsDialog isOmni={adminStatus?.is_omni || false} />
            <NegateCreditsDialog isOmni={adminStatus?.is_omni || false} />
          </div>
        </div>

        {/* Admin Badge */}
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Shield className="h-3 w-3" />
            {adminStatus?.email}
          </Badge>
          {adminStatus?.is_omni && (
            <Badge className="gap-1 bg-purple-500">
              Omni Admin
            </Badge>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pool Balance</CardDescription>
            </CardHeader>
            <CardContent>
              {poolLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold text-green-600">
                  ${poolStatus?.credit_balance?.toFixed(2) || '0.00'}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Loaded</CardDescription>
            </CardHeader>
            <CardContent>
              {poolLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">
                  ${poolStatus?.total_loaded?.toFixed(2) || '0.00'}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Used</CardDescription>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold text-orange-600">
                  ${stats?.pool?.total_used?.toFixed(2) || '0.00'}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Users</CardDescription>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">
                  {stats?.users?.active || 0} / {stats?.users?.total || 0}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Users Table */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                User Management
              </CardTitle>
              <CardDescription>
                View and manage user spending limits
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EnterpriseUserTable />
            </CardContent>
          </Card>

          {/* Credit History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Recent Transactions
              </CardTitle>
              <CardDescription>
                Fund load and negation history
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CreditHistorySection />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
