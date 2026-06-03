import React, { useState, useEffect } from 'react';
import { Quotation, Config, Company } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { formatCurrency, cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle2, XCircle, ShoppingCart, Download, FileText, Clock, AlertCircle, Search, SlidersHorizontal, Calendar, Filter, X, RotateCcw, Building2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface EnhancedQuotation extends Quotation {
  orderNumber?: number;
}

interface QuotationsListProps {
  config: Config;
}

const formatQuoteDate = (dateVal: any) => {
  if (!dateVal) return '';
  const date = (typeof dateVal === 'object' && 'toDate' in dateVal) ? dateVal.toDate() : new Date(dateVal);
  return isNaN(date.getTime()) ? '' : date.toLocaleDateString();
};

export const QuotationsList: React.FC<QuotationsListProps> = ({ config }) => {
  const { user } = useAuth();
  const [quotations, setQuotations] = useState<EnhancedQuotation[]>([]);
  const [selectedQuotation, setSelectedQuotation] = useState<EnhancedQuotation | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);

  // Tab State & Company State
  const [activeTab, setActiveTab] = useState<'quotations' | 'orders'>('quotations');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false);
  const [convertingQuotation, setConvertingQuotation] = useState<EnhancedQuotation | null>(null);

  // Master Searcher State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedBeltType, setSelectedBeltType] = useState<string>('all');
  const [selectedDateRange, setSelectedDateRange] = useState<string>('all');

  const fetchCompanies = async () => {
    try {
      const res = await fetch('/api/companies');
      if (res.ok) {
        const data = await res.json();
        setCompanies(data);
        if (data.length > 0) {
          setSelectedCompanyId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch companies', err);
    }
  };

  const fetchQuotations = async () => {
    try {
      const res = await fetch('/api/quotations');
      if (res.ok) {
        const data = await res.json();
        
        // Sort chronologically ascending to assign permanent order numbers starting at 100
        const sortedChronologically = [...data].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        
        const withOrderNumbers = sortedChronologically.map((q: any, index: number) => ({
          ...q,
          orderNumber: 100 + index
        }));

        // Sort descending by createdAt for display
        withOrderNumbers.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
        setQuotations(withOrderNumbers);
      }
    } catch (err) {
      console.error('Failed to fetch quotations', err);
    }
  };

  useEffect(() => {
    fetchQuotations();
    fetchCompanies();
    const interval = setInterval(fetchQuotations, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setSelectedStatus('all');
  }, [activeTab]);

  const handleApprove = async (q: Quotation) => {
    try {
      const newTotal = q.totalCost - (q.discountRequested || 0);

      const res = await fetch(`/api/quotations/${q.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'approved',
          totalCost: newTotal
        })
      });

      if (!res.ok) throw new Error('Approve failed');

      toast.success('Discount approved and price updated');
      fetchQuotations();
      setSelectedQuotation(null);
    } catch (err) {
      toast.error('Failed to approve');
    }
  };

  const handleReject = async () => {
    if (!selectedQuotation) return;
    try {
      const res = await fetch(`/api/quotations/${selectedQuotation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'rejected',
          rejectionReason
        })
      });

      if (!res.ok) throw new Error('Reject failed');

      toast.success('Discount rejected');
      setIsRejectDialogOpen(false);
      setRejectionReason('');
      setSelectedQuotation(null);
      fetchQuotations();
    } catch (err) {
      toast.error('Failed to reject');
    }
  };

  const handleConvertToOrder = (q: EnhancedQuotation) => {
    setConvertingQuotation(q);
    setIsConvertDialogOpen(true);
    if (companies.length > 0) {
      setSelectedCompanyId(companies[0].id);
    } else {
      setSelectedCompanyId('');
    }
  };

  const confirmConvertToOrder = async () => {
    if (!convertingQuotation) return;
    const selectedComp = companies.find(c => c.id === selectedCompanyId);
    const companyName = selectedComp ? selectedComp.name : 'Pooja Tekno Belt';
    
    try {
      const res = await fetch(`/api/quotations/${convertingQuotation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'order',
          company: companyName
        })
      });

      if (!res.ok) throw new Error('Convert failed');

      toast.success(`Quotation converted to order under "${companyName}"!`);
      setIsConvertDialogOpen(false);
      setConvertingQuotation(null);
      setSelectedQuotation(null);
      fetchQuotations();
      setActiveTab('orders');
    } catch (err) {
      toast.error('Failed to convert to order');
    }
  };

  // Get unique belt types for the filter dropdown
  const uniqueBeltTypes = Array.from(new Set(quotations.map(q => q.beltType))).filter(Boolean);

  // Apply filters
  const filteredQuotations = quotations.filter((q) => {
    // Tab filter
    if (activeTab === 'quotations' && (q.status === 'order' || q.status === 'executed')) return false;
    if (activeTab === 'orders' && q.status !== 'order' && q.status !== 'executed') return false;

    // 1. Search Query Filter (Client Name, Belt Type, createdBy, Order Number)
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase().trim();
      const matchClient = q.clientName?.toLowerCase().includes(query);
      const matchCreatedBy = q.createdByName?.toLowerCase().includes(query) || q.createdBy?.toLowerCase().includes(query);
      const matchBeltType = q.beltType?.toLowerCase().includes(query);
      const matchBeltStyle = q.beltStyle?.toLowerCase().includes(query);
      const matchOrderNum = q.orderNumber?.toString().includes(query) || `#${q.orderNumber}`.includes(query);
      
      if (!matchClient && !matchCreatedBy && !matchBeltType && !matchBeltStyle && !matchOrderNum) {
        return false;
      }
    }

    // 2. Status Filter
    if (selectedStatus !== 'all') {
      if (selectedStatus === 'pending') {
        if (q.status !== 'pending_approval') return false;
      } else {
        if (q.status !== selectedStatus) return false;
      }
    }

    // 3. Belt Type Filter
    if (selectedBeltType !== 'all') {
      if (q.beltType !== selectedBeltType) return false;
    }

    // 4. Date Range Filter
    if (selectedDateRange !== 'all') {
      const qDate = new Date(q.createdAt);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (selectedDateRange === 'today') {
        if (qDate < today) return false;
      } else if (selectedDateRange === 'yesterday') {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const endOfYesterday = new Date(today);
        if (qDate < yesterday || qDate >= endOfYesterday) return false;
      } else if (selectedDateRange === '7days') {
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        if (qDate < sevenDaysAgo) return false;
      } else if (selectedDateRange === '30days') {
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        if (qDate < thirtyDaysAgo) return false;
      }
    }

    return true;
  });

  const exportToCSV = () => {
    const headers = ['Order ID', 'Date', 'Client', 'Belt Category', 'Dimensions', 'Total Cost', 'Status'];
    const rows = filteredQuotations.map(q => [
      `#${q.orderNumber || ''}`,
      formatQuoteDate(q.createdAt),
      q.clientName,
      `${q.beltType}${q.beltStyle ? ` (${q.beltStyle})` : ''}`,
      `L ${q.dimensions.length}${q.dimensions.lengthUnit || q.dimensions.unit || 'mm'} x W ${q.dimensions.width}${q.dimensions.widthUnit || q.dimensions.unit || 'mm'}`,
      Math.round(q.totalCost),
      q.status
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quotations_report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_approval': return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
      case 'approved': return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1"><CheckCircle2 className="h-3 w-3" /> Approved</Badge>;
      case 'rejected': return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1"><XCircle className="h-3 w-3" /> Rejected</Badge>;
      case 'order': return <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 gap-1"><ShoppingCart className="h-3 w-3" /> Order</Badge>;
      case 'executed': return <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 gap-1"><CheckCircle2 className="h-3 w-3" /> Executed</Badge>;
      default: return <Badge variant="outline" className="bg-zinc-50 text-zinc-700 border-zinc-200">Draft</Badge>;
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedStatus('all');
    setSelectedBeltType('all');
    setSelectedDateRange('all');
    toast.success('Filters reset');
  };

  const hasActiveFilters = searchQuery !== '' || selectedStatus !== 'all' || selectedBeltType !== 'all' || selectedDateRange !== 'all';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Quotations & Orders</h1>
          <p className="text-zinc-500">Track all pricing requests, approvals, and active orders.</p>
        </div>
        <Button variant="outline" className="gap-2 self-start sm:self-auto" onClick={exportToCSV}>
          <Download className="h-4 w-4" />
          Export Report
        </Button>
      </div>

      {/* Master Searcher Section */}
      <div className="bg-zinc-50/50 p-4 rounded-xl border border-zinc-200/80 grid grid-cols-1 md:grid-cols-4 gap-4 items-end shadow-xs backdrop-blur-md">
        <div className="space-y-2 col-span-1 md:col-span-1">
          <Label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
            <Search className="h-3 w-3 text-zinc-500" /> Search Records
          </Label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Search ID, Client, Belt..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 border-zinc-300 focus-visible:ring-zinc-400 bg-white"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
            <Filter className="h-3 w-3 text-zinc-500" /> Status
          </Label>
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="h-9 border-zinc-300 bg-white w-full">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {activeTab === 'quotations' ? (
                <>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </>
              ) : (
                <>
                  <SelectItem value="order">Order</SelectItem>
                  <SelectItem value="executed">Executed</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
            <SlidersHorizontal className="h-3 w-3 text-zinc-500" /> Belt Type
          </Label>
          <Select value={selectedBeltType} onValueChange={setSelectedBeltType}>
            <SelectTrigger className="h-9 border-zinc-300 bg-white w-full">
              <SelectValue placeholder="All Belt Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Belt Types</SelectItem>
              {uniqueBeltTypes.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="h-3 w-3 text-zinc-500" /> Date Range
          </Label>
          <div className="flex gap-2">
            <Select value={selectedDateRange} onValueChange={setSelectedDateRange}>
              <SelectTrigger className="h-9 border-zinc-300 bg-white w-full">
                <SelectValue placeholder="All Time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="30days">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleResetFilters}
                className="h-9 w-9 border border-zinc-200 text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100 shrink-0"
                title="Reset Filters"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card className="border-zinc-200 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle>{activeTab === 'quotations' ? 'Quotations' : 'Orders'}</CardTitle>
              <CardDescription>
                Showing {filteredQuotations.length} of {quotations.length} records {hasActiveFilters && '(Filtered)'}
              </CardDescription>
            </div>
            <div className="flex bg-zinc-100 p-1 rounded-lg border border-zinc-200/50 self-start sm:self-auto shadow-inner">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab('quotations')}
                className={cn(
                  "px-4 py-1.5 h-8 text-xs font-bold transition-all rounded-md",
                  activeTab === 'quotations'
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-855"
                )}
              >
                Quotations
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab('orders')}
                className={cn(
                  "px-4 py-1.5 h-8 text-xs font-bold transition-all rounded-md",
                  activeTab === 'orders'
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-855"
                )}
              >
                Orders
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-zinc-200 overflow-hidden">
            <Table>
              <TableHeader className="bg-zinc-50/50">
                <TableRow>
                  <TableHead className="w-[100px] font-bold text-zinc-700">Order ID</TableHead>
                  <TableHead className="font-bold text-zinc-700">Date</TableHead>
                  <TableHead className="font-bold text-zinc-700">Client</TableHead>
                  <TableHead className="font-bold text-zinc-700">Belt Details</TableHead>
                  {activeTab === 'orders' && (
                    <TableHead className="font-bold text-zinc-700">Company</TableHead>
                  )}
                  <TableHead className="font-bold text-zinc-700">Total Price</TableHead>
                  <TableHead className="font-bold text-zinc-700">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={activeTab === 'orders' ? 7 : 6} className="h-24 text-center text-zinc-400 italic">
                      No matching records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredQuotations.map((q) => (
                    <TableRow 
                      key={q.id} 
                      className="cursor-pointer hover:bg-zinc-50/50 transition-colors"
                      onClick={() => setSelectedQuotation(q)}
                    >
                      <TableCell className="font-mono font-bold text-zinc-700 text-sm">
                        #{q.orderNumber}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500">
                        {formatQuoteDate(q.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-semibold text-zinc-900">{q.clientName}</span>
                          <span className="text-xs text-zinc-400">by {q.createdByName || q.createdBy}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-zinc-800">{q.beltType} {q.beltStyle && `(${q.beltStyle})`}</span>
                          <span className="text-xs text-zinc-500">L {q.dimensions.length}{q.dimensions.lengthUnit || q.dimensions.unit || 'mm'} x W {q.dimensions.width}{q.dimensions.widthUnit || q.dimensions.unit || 'mm'}</span>
                        </div>
                      </TableCell>
                      {activeTab === 'orders' && (
                        <TableCell>
                          <Badge variant="secondary" className="bg-zinc-100 text-zinc-800 border-zinc-200 gap-1 text-[11px] font-bold">
                            <Building2 className="h-3 w-3 text-zinc-500" />
                            {q.company || 'Pooja Tekno Belt'}
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-zinc-900">{formatCurrency(Math.round(q.totalCost))}</span>
                          {q.discountRequested && q.status === 'pending_approval' && (
                            <span className="text-[10px] text-amber-600 font-medium">Requesting {formatCurrency(q.discountRequested)} off</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(q.status)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedQuotation && !isRejectDialogOpen} onOpenChange={(open) => !open && setSelectedQuotation(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              Quotation Details <Badge variant="outline" className="font-mono bg-zinc-50">#{selectedQuotation?.orderNumber}</Badge>
            </DialogTitle>
            <DialogDescription>Review quotation details and take action</DialogDescription>
          </DialogHeader>
          {selectedQuotation && (
            <div className="grid grid-cols-2 gap-6 py-4">
              <div className="space-y-1">
                <p className="text-sm text-zinc-500">Order ID</p>
                <p className="font-semibold font-mono text-zinc-900">#{selectedQuotation.orderNumber}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-zinc-500">Client</p>
                <p className="font-semibold text-zinc-900">{selectedQuotation.clientName}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-zinc-500">Belt Category / Style</p>
                <p className="font-semibold text-zinc-900">{selectedQuotation.beltType} {selectedQuotation.beltStyle && `/ ${selectedQuotation.beltStyle}`}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-zinc-500">Dimensions</p>
                <p className="font-semibold text-zinc-900">L {selectedQuotation.dimensions.length}{selectedQuotation.dimensions.lengthUnit || selectedQuotation.dimensions.unit || 'mm'} x W {selectedQuotation.dimensions.width}{selectedQuotation.dimensions.widthUnit || selectedQuotation.dimensions.unit || 'mm'}</p>
              </div>

              <div className="space-y-1">
                <p className="text-sm text-zinc-500">Total Price</p>
                <p className="font-black text-2xl text-zinc-900">{formatCurrency(Math.round(selectedQuotation.totalCost))}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-zinc-500">Status</p>
                <div>{getStatusBadge(selectedQuotation.status)}</div>
              </div>
              {selectedQuotation.status === 'order' && (
                <div className="space-y-1">
                  <p className="text-sm text-zinc-500">Company</p>
                  <p className="font-semibold text-zinc-900 flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-zinc-500" />
                    {selectedQuotation.company || 'Pooja Tekno Belt'}
                  </p>
                </div>
              )}
              
              {selectedQuotation.discountRequested && selectedQuotation.discountRequested > 0 && (
                <div className="col-span-2 p-4 bg-amber-50 rounded-xl border border-amber-100 space-y-2">
                  <div className="flex items-center gap-2 text-amber-800 font-semibold">
                    <AlertCircle className="h-4 w-4" />
                    Discount Requested: {formatCurrency(selectedQuotation.discountRequested)}
                  </div>
                  <p className="text-sm text-amber-700 italic">"{selectedQuotation.discountReason}"</p>
                  <p className="text-xs text-amber-600 font-medium">Final Price after discount: {formatCurrency(Math.round(selectedQuotation.totalCost - selectedQuotation.discountRequested))}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            {user?.role === 'admin' && selectedQuotation?.status === 'pending_approval' && (
              <>
                <Button onClick={() => handleApprove(selectedQuotation!)}>
                  Approve Discount
                </Button>
                <Button variant="destructive" onClick={() => setIsRejectDialogOpen(true)}>
                  Reject Discount
                </Button>
              </>
            )}
            {(selectedQuotation?.status === 'approved' || selectedQuotation?.status === 'draft') && (
              <Button onClick={() => handleConvertToOrder(selectedQuotation!)}>
                Convert to Order
              </Button>
            )}
            <Button variant="outline" onClick={() => setSelectedQuotation(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Discount Request</DialogTitle>
            <DialogDescription>Provide a reason for rejecting the discount request.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason for Rejection</Label>
              <Input 
                placeholder="e.g. Margin too low, Standard pricing applies" 
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleReject}>Reject Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isConvertDialogOpen} onOpenChange={setIsConvertDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-indigo-600" />
              Convert to Order
            </DialogTitle>
            <DialogDescription>
              Select the company to which this order belongs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Company</Label>
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger className="w-full bg-white border-zinc-300">
                  <SelectValue placeholder="Choose a company...">
                    {companies.find(c => c.id === selectedCompanyId)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {companies.length === 0 && (
                <p className="text-xs text-rose-500 font-semibold mt-1">
                  ⚠️ No companies found. Please add a company in settings config first.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConvertDialogOpen(false)}>Cancel</Button>
            <Button 
              className="bg-indigo-600 hover:bg-indigo-700 text-white" 
              onClick={confirmConvertToOrder}
              disabled={companies.length === 0 || !selectedCompanyId}
            >
              Confirm Convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
