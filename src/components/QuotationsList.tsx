import React, { useState, useEffect } from 'react';
import { Quotation, Config } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle2, XCircle, ShoppingCart, Download, FileText, Clock, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Label } from './ui/label';
import { Input } from './ui/input';

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
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);

  const fetchQuotations = async () => {
    try {
      const res = await fetch('/api/quotations');
      if (res.ok) {
        const data = await res.json();
        data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setQuotations(data);
      }
    } catch (err) {
      console.error('Failed to fetch quotations', err);
    }
  };

  useEffect(() => {
    fetchQuotations();
    const interval = setInterval(fetchQuotations, 10000);
    return () => clearInterval(interval);
  }, []);

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

  const handleConvertToOrder = async (q: Quotation) => {
    try {
      const res = await fetch(`/api/quotations/${q.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'order'
        })
      });

      if (!res.ok) throw new Error('Convert failed');

      toast.success('Quotation converted to order!');
      setSelectedQuotation(null);
      fetchQuotations();
    } catch (err) {
      toast.error('Failed to convert');
    }
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Client', 'Belt Category', 'Dimensions', 'Total Cost', 'Status'];
    const rows = quotations.map(q => [
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
      default: return <Badge variant="outline" className="bg-zinc-50 text-zinc-700 border-zinc-200">Draft</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Quotations & Orders</h1>
          <p className="text-zinc-500">Track all pricing requests, approvals, and active orders.</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={exportToCSV}>
          <Download className="h-4 w-4" />
          Export Report
        </Button>
      </div>

      <Card className="border-zinc-200 shadow-sm">
        <CardHeader>
          <CardTitle>All Records</CardTitle>
          <CardDescription>Click on a row to view details and take action</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Belt Details</TableHead>
                <TableHead>Total Price</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotations.map((q) => (
                <TableRow 
                  key={q.id} 
                  className="cursor-pointer hover:bg-zinc-50 transition-colors"
                  onClick={() => setSelectedQuotation(q)}
                >
                  <TableCell className="text-xs text-zinc-500">
                    {formatQuoteDate(q.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-zinc-900">{q.clientName}</span>
                      <span className="text-xs text-zinc-500">by {q.createdByName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{q.beltType} {q.beltStyle && `(${q.beltStyle})`}</span>
                      <span className="text-xs text-zinc-500">L {q.dimensions.length}{q.dimensions.lengthUnit || q.dimensions.unit || 'mm'} x W {q.dimensions.width}{q.dimensions.widthUnit || q.dimensions.unit || 'mm'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-mono font-bold">{formatCurrency(Math.round(q.totalCost))}</span>
                      {q.discountRequested && q.status === 'pending_approval' && (
                        <span className="text-[10px] text-amber-600 font-medium">Requesting {formatCurrency(q.discountRequested)} off</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(q.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedQuotation && !isRejectDialogOpen} onOpenChange={(open) => !open && setSelectedQuotation(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Quotation Details</DialogTitle>
            <DialogDescription>Review quotation details and take action</DialogDescription>
          </DialogHeader>
          {selectedQuotation && (
            <div className="grid grid-cols-2 gap-6 py-4">
              <div className="space-y-1">
                <p className="text-sm text-zinc-500">Client</p>
                <p className="font-semibold">{selectedQuotation.clientName}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-zinc-500">Belt Category / Style</p>
                <p className="font-semibold">{selectedQuotation.beltType} {selectedQuotation.beltStyle && `/ ${selectedQuotation.beltStyle}`}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-zinc-500">Dimensions</p>
                <p className="font-semibold">L {selectedQuotation.dimensions.length}{selectedQuotation.dimensions.lengthUnit || selectedQuotation.dimensions.unit || 'mm'} x W {selectedQuotation.dimensions.width}{selectedQuotation.dimensions.widthUnit || selectedQuotation.dimensions.unit || 'mm'}</p>
              </div>

              <div className="space-y-1">
                <p className="text-sm text-zinc-500">Total Price</p>
                <p className="font-bold text-xl">{formatCurrency(Math.round(selectedQuotation.totalCost))}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-zinc-500">Status</p>
                <div>{getStatusBadge(selectedQuotation.status)}</div>
              </div>
              
              {selectedQuotation.discountRequested > 0 && (
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
    </div>
  );
};
