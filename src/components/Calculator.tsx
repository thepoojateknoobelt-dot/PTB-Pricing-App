import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Config, Client, Quotation, ProfitRange } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { toast } from 'sonner';
import { cn, formatCurrency } from '../lib/utils';
import { Calculator as CalcIcon, Save, Send, AlertCircle } from 'lucide-react';
import { calculateCosting, toMeters } from '../lib/calculations';

interface CalculatorProps {
  config: Config;
  clients: Client[];
}

// Helper to format timestamps safely for both Firebase Timestamp objects and ISO strings
const formatOrderDate = (dateVal: any, showYear = true) => {
  if (!dateVal) return '';
  const date = (typeof dateVal === 'object' && 'toDate' in dateVal) ? dateVal.toDate() : new Date(dateVal);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', showYear ? { day: '2-digit', month: 'short', year: 'numeric' } : { day: '2-digit', month: 'short' });
};

export const Calculator: React.FC<CalculatorProps> = ({ config, clients }) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    clientId: '',
    beltType: '', // This will be the Type Name
    beltStyle: '',
    length: '',
    lengthUnit: 'mm',
    width: '',
    widthUnit: 'mm',
    manualPackingCost: '',
    manualProfitMargin: '',
    selectedBOMOptions: {} as Record<string, number>, // bomItemId -> optionIndex
    hasHoles: false,
    holeSize: '',
    holeDistHorizontal: '',
    holeDistVertical: '',
    pricePerHole: '',
  });

  const [result, setResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [discountRequested, setDiscountRequested] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [clientHistory, setClientHistory] = useState<Quotation[]>([]);
  const [dimensionInsight, setDimensionInsight] = useState<string | null>(null);
  const [insightOrders, setInsightOrders] = useState<Quotation[]>([]);
  const selectedClient = clients?.find?.(c => c.id === formData.clientId) || null;

  useEffect(() => {
    if (!formData.length || !formData.width || !formData.clientId) {
      setDimensionInsight(null);
      setInsightOrders([]);
      return;
    }

    const checkDimensions = async () => {
      try {
        const res = await fetch('/api/quotations');
        if (!res.ok) throw new Error('Failed to fetch quotations');
        const quotations = await res.json();
        
        const currentLengthMtr = toMeters(parseFloat(formData.length), formData.lengthUnit);
        const currentWidthMtr = toMeters(parseFloat(formData.width), formData.widthUnit);
        const tolerance = 0.001; // 1mm tolerance

        const otherOrders = quotations
          .filter((q: any) => {
             if (q.clientId === formData.clientId) return false;
             const qLenMtr = toMeters(q.dimensions.length, q.dimensions.lengthUnit || 'mm');
             const qWidMtr = toMeters(q.dimensions.width, q.dimensions.widthUnit || 'mm');
             return Math.abs(qLenMtr - currentLengthMtr) < tolerance && 
                    Math.abs(qWidMtr - currentWidthMtr) < tolerance;
          });

        if (otherOrders.length > 0) {
          setInsightOrders(otherOrders);
          const clientNames = Array.from(new Set(otherOrders.map((o: any) => o.clientName)));
          setDimensionInsight(`This dimension was previously purchased by ${clientNames.join(', ')}`);
        } else {
          setDimensionInsight(null);
          setInsightOrders([]);
        }
      } catch (err) {
        console.error('Error checking dimension insights', err);
      }
    };

    const timeout = setTimeout(checkDimensions, 800);
    return () => clearTimeout(timeout);
  }, [formData.length, formData.width, formData.lengthUnit, formData.widthUnit, formData.clientId]);

  const fetchClientHistory = async (clientId: string) => {
    if (!clientId) {
      setClientHistory([]);
      return;
    }
    try {
      const res = await fetch('/api/quotations');
      if (res.ok) {
        const allQuotes = await res.json();
        const filtered = allQuotes
          .filter((q: any) => q.clientId === clientId)
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 5);
        setClientHistory(filtered);
      }
    } catch (err) {
      console.error('Failed to fetch client history', err);
    }
  };

  useEffect(() => {
    fetchClientHistory(formData.clientId);
    const interval = setInterval(() => {
      fetchClientHistory(formData.clientId);
    }, 15000);
    return () => clearInterval(interval);
  }, [formData.clientId]);

  const handleCalculate = async () => {
    if (!formData.clientId) {
      toast.error('Please select a client');
      return;
    }

    if (!formData.length || !formData.width) {
      toast.error('Please enter dimensions');
      return;
    }

    const lengthVal = parseFloat(formData.length);
    const widthVal = parseFloat(formData.width);

    if (isNaN(lengthVal) || lengthVal <= 0) {
      toast.error('Please enter a valid length greater than 0');
      return;
    }

    if (isNaN(widthVal) || widthVal <= 0) {
      toast.error('Please enter a valid width greater than 0');
      return;
    }

    const lengthInMeters = toMeters(lengthVal, formData.lengthUnit);
    const widthInMeters = toMeters(widthVal, formData.widthUnit);

    if (lengthInMeters > 100000) {
      toast.error('Length is too large (maximum 100,000 meters / 100 km)');
      return;
    }

    if (widthInMeters > 100) {
      toast.error('Width is too large (maximum 100 meters)');
      return;
    }

    if (formData.manualPackingCost) {
      const packingVal = parseFloat(formData.manualPackingCost);
      if (isNaN(packingVal) || packingVal < 0) {
        toast.error('Packing cost must be a valid positive number');
        return;
      }
      if (packingVal > 10000000) {
        toast.error('Packing cost is too large');
        return;
      }
    }

    if (formData.manualProfitMargin) {
      const profitVal = parseFloat(formData.manualProfitMargin);
      if (isNaN(profitVal) || profitVal < 0) {
        toast.error('Profit margin must be a valid positive number');
        return;
      }
      if (profitVal > 1000) {
        toast.error('Profit margin cannot exceed 1000%');
        return;
      }
    }

    setIsLoading(true);
    try {
      const selectedCategory = (Array.isArray(config?.beltTypes) ? config.beltTypes : [])?.find?.(t => t.name === formData.beltType) || null;
      const selectedStyle = (Array.isArray(selectedCategory?.styles) ? selectedCategory.styles : [])?.find?.(s => s.name === formData.beltStyle) || null;
      const clientProfitRanges = selectedClient?.profitMargins?.[formData.beltType] || [];
      
      const customBOM = (selectedStyle?.bom || []).map(item => {
        const selectedOptIdx = formData.selectedBOMOptions[item.id];
        if (selectedOptIdx !== undefined && item.options && item.options[selectedOptIdx]) {
          const opt = item.options[selectedOptIdx];
          return {
            ...item,
            rate: opt.rate,
            unit: opt.unit || item.unit,
            name: opt.name ? `${item.name} (${opt.name})` : item.name
          };
        }
        return item;
      });

      const result = calculateCosting({
        length: parseFloat(formData.length),
        lengthUnit: formData.lengthUnit,
        width: parseFloat(formData.width),
        widthUnit: formData.widthUnit,
        beltType: formData.beltType,
        manualPackingCost: formData.manualPackingCost || undefined,
        manualProfitMargin: formData.manualProfitMargin || undefined,
        hasHoles: formData.hasHoles,
        holeSize: formData.holeSize,
        holeDistHorizontal: formData.holeDistHorizontal,
        holeDistVertical: formData.holeDistVertical,
        pricePerHole: formData.pricePerHole,
      }, config, clientProfitRanges, customBOM, {});


      if (user?.role !== 'admin') {
        setResult({
          summary: {
            finalTotal: result.summary.finalTotal
          }
        });
      } else {
        setResult(result);
      }

      // Record this calculation in the audit log
      try {
        await fetch('/api/audit-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'PRICE_CALCULATION',
            details: `Client: ${selectedClient?.name}, Belt: ${formData.beltType} (${formData.beltStyle}), Dim: L ${formData.length}${formData.lengthUnit} x W ${formData.width}${formData.widthUnit}, Price: ${formatCurrency(result.summary.finalTotal)}`
          })
        });
      } catch (logErr) {
        console.error('Failed to create audit log', logErr);
      }
    } catch (err) {
      toast.error('Calculation failed');
    } finally {
      setIsLoading(false);
    }

  };

  const handleSaveQuotation = async (status: 'draft' | 'pending_approval' = 'draft') => {
    if (!result) return;

    try {
      if (!selectedClient) {
        toast.error('Selected client not found');
        return;
      }

      const quotationData = {
        clientId: formData.clientId,
        clientName: selectedClient.name,
        beltType: formData.beltType,
        beltStyle: formData.beltStyle,
        selectedBOMOptions: formData.selectedBOMOptions,
        dimensions: {
          length: parseFloat(formData.length),
          lengthUnit: formData.lengthUnit,
          width: parseFloat(formData.width),
          widthUnit: formData.widthUnit,
          hasHoles: formData.hasHoles,
          holeSize: formData.hasHoles ? (parseFloat(formData.holeSize) || 0) : undefined,
          holeDistHorizontal: formData.hasHoles ? (parseFloat(formData.holeDistHorizontal) || 0) : undefined,
          holeDistVertical: formData.hasHoles ? (parseFloat(formData.holeDistVertical) || 0) : undefined,
          pricePerHole: formData.hasHoles ? (parseFloat(formData.pricePerHole) || 0) : undefined,
          totalHoles: formData.hasHoles ? (result.summary.totalHoles || 0) : undefined,
        },
        totalCost: result.summary.finalTotal,
        status,
        discountRequested: parseFloat(discountRequested) || 0, // Now an amount
        discountReason: discountReason,
        createdBy: user?.id,
        createdByName: user?.name || user?.username,
      };

      const saveRes = await fetch('/api/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quotationData)
      });
      
      if (!saveRes.ok) throw new Error('Save failed');
      
      toast.success(status === 'pending_approval' ? 'Approval request sent!' : 'Quotation saved!');
      setResult(null);
      
      // Fetch history immediately to update the client history table without manual refresh
      fetchClientHistory(formData.clientId);
      
      setFormData({
        ...formData,
        length: '',
        width: '',
        manualPackingCost: '',
        manualProfitMargin: '',
        beltStyle: '',
        hasHoles: false,
        holeSize: '',
        holeDistHorizontal: '',
        holeDistVertical: '',
        pricePerHole: '',
      });
      setDiscountRequested('');
      setDiscountReason('');
    } catch (err) {
      toast.error('Failed to save quotation');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-zinc-900 rounded-lg text-white">
            <CalcIcon className="h-4 w-4" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">Costing Calculator</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 border-zinc-300 shadow-xl bg-white/50 backdrop-blur-sm self-start">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 mb-0.5">
              <div className="p-1.5 bg-zinc-900 rounded-lg">
                <CalcIcon className="h-3.5 w-3.5 text-white" />
              </div>
              <CardTitle className="text-lg">Input Parameters</CardTitle>
            </div>
            <CardDescription className="text-xs">Enter belt details for calculation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Primary Selection Section */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Selection</Label>
                <div className="grid gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Client</Label>
                    <Select value={formData.clientId} onValueChange={(val) => setFormData({ ...formData, clientId: val })}>
                      <SelectTrigger className="bg-white border-zinc-400 focus:ring-zinc-900 transition-all h-9 text-xs">
                        <SelectValue placeholder="Select Client">
                          {selectedClient ? selectedClient.name : undefined}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(Array.isArray(clients) ? clients : [])?.map?.(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Category</Label>
                      <Select value={formData.beltType} onValueChange={(val) => setFormData({ ...formData, beltType: val, beltStyle: '' })}>
                        <SelectTrigger className="bg-white border-zinc-400 transition-all h-9 text-xs">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Array.isArray(config?.beltTypes) ? config.beltTypes : [])?.map?.(type => (
                            <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Style</Label>
                      <Select 
                        disabled={!formData.beltType}
                        value={formData.beltStyle} 
                        onValueChange={(val) => setFormData({ ...formData, beltStyle: val })}
                      >
                        <SelectTrigger className="bg-white border-zinc-400 transition-all h-9 text-xs">
                          <SelectValue placeholder="Style" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Array.isArray((Array.isArray(config?.beltTypes) ? config.beltTypes : [])?.find?.(t => t.name === formData.beltType)?.styles) ? (config?.beltTypes?.find?.(t => t.name === formData.beltType)?.styles) : [])?.map?.(style => (
                            <SelectItem key={style.id} value={style.name}>{style.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>


                </div>
              </div>

              {/* Dimensions Section */}
              <div className="space-y-1.5 pt-1.5 border-t border-zinc-100">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Dimensions</Label>
                <div className="grid gap-2.5">
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs font-medium">Length</Label>
                      <div className="relative group">
                        <Input 
                          type="number" 
                          value={formData.length} 
                          onChange={(e) => setFormData({ ...formData, length: e.target.value })}
                          placeholder="0.00"
                          className="bg-white border-zinc-400 pl-3 pr-20 focus:ring-zinc-900 transition-all h-10 text-sm font-semibold"
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                           <Select value={formData.lengthUnit} onValueChange={(val: any) => setFormData({ ...formData, lengthUnit: val })}>
                            <SelectTrigger className="h-7 w-auto min-w-[56px] border-none shadow-none bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-[10px] font-black uppercase ring-0 focus:ring-0 rounded-md px-2 transition-colors">
                              <div className="flex items-center gap-1">
                                <SelectValue />
                              </div>
                            </SelectTrigger>
                            <SelectContent className="min-w-[120px]">
                              {(Array.isArray(config?.units) ? config.units : [])?.map?.(u => (
                                <SelectItem key={u.value} value={u.value} className="text-[10px] font-bold uppercase">{u.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs font-medium">Width</Label>
                      <div className="relative group">
                        <Input 
                          type="number" 
                          value={formData.width} 
                          onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                          placeholder="0.00"
                          className="bg-white border-zinc-400 pl-3 pr-20 focus:ring-zinc-900 transition-all h-10 text-sm font-semibold"
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                          <Select value={formData.widthUnit} onValueChange={(val: any) => setFormData({ ...formData, widthUnit: val })}>
                            <SelectTrigger className="h-7 w-auto min-w-[56px] border-none shadow-none bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-[10px] font-black uppercase ring-0 focus:ring-0 rounded-md px-2 transition-colors">
                              <div className="flex items-center gap-1">
                                <SelectValue />
                              </div>
                            </SelectTrigger>
                            <SelectContent className="min-w-[120px]">
                              {(Array.isArray(config?.units) ? config.units : [])?.map?.(u => (
                                <SelectItem key={u.value} value={u.value} className="text-[10px] font-bold uppercase">{u.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Hole Checkbox Layout Specification */}
                  <div className="space-y-3 pt-2.5 border-t border-zinc-100">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="holeCheckbox"
                        checked={formData.hasHoles || false}
                        onChange={(e) => setFormData({ ...formData, hasHoles: e.target.checked })}
                        className="h-4 w-4 rounded border-zinc-400 text-zinc-900 focus:ring-zinc-900 transition-colors"
                      />
                      <Label htmlFor="holeCheckbox" className="text-xs font-semibold cursor-pointer">
                        Hole Checkbox
                      </Label>
                    </div>

                    {formData.hasHoles && (
                      <div className="grid gap-2.5 pl-4 border-l border-zinc-200 mt-2 animate-in fade-in slide-in-from-top-1 duration-150">
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold text-zinc-500 uppercase">Hole Size (mm)</Label>
                          <Input
                            type="number"
                            placeholder="e.g. 5"
                            value={formData.holeSize || ''}
                            onChange={(e) => setFormData({ ...formData, holeSize: e.target.value })}
                            className="bg-white border-zinc-400 h-9 text-xs"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold text-zinc-500 uppercase">Horizontal Spacing (mm)</Label>
                            <Input
                              type="number"
                              placeholder="e.g. 50"
                              value={formData.holeDistHorizontal || ''}
                              onChange={(e) => setFormData({ ...formData, holeDistHorizontal: e.target.value })}
                              className="bg-white border-zinc-400 h-9 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold text-zinc-500 uppercase">Vertical Spacing (mm)</Label>
                            <Input
                              type="number"
                              placeholder="e.g. 30"
                              value={formData.holeDistVertical || ''}
                              onChange={(e) => setFormData({ ...formData, holeDistVertical: e.target.value })}
                              className="bg-white border-zinc-400 h-9 text-xs"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold text-zinc-500 uppercase">Price per Hole (₹)</Label>
                          <Input
                            type="number"
                            placeholder="e.g. 2.5"
                            value={formData.pricePerHole || ''}
                            onChange={(e) => setFormData({ ...formData, pricePerHole: e.target.value })}
                            className="bg-white border-zinc-400 h-9 text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                </div>
                {dimensionInsight && insightOrders.length > 0 && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <button type="button" className="w-full text-left mt-3 p-2 bg-indigo-50 hover:bg-indigo-100 transition-colors border border-indigo-100 rounded-lg flex items-start gap-2 animate-in fade-in slide-in-from-top-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
                        <AlertCircle className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-indigo-900">Insight</p>
                          <p className="text-[10px] text-indigo-700">{dimensionInsight}</p>
                        </div>
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col p-6 sm:max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Previous Orders Insight</DialogTitle>
                        <DialogDescription>
                          Detailed history of orders with dimensions {formData.length}{formData.lengthUnit} x {formData.width}{formData.widthUnit}.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="mt-2 border rounded-md overflow-x-auto flex-1">
                        <Table>
                          <TableHeader className="bg-zinc-50">
                            <TableRow>
                              <TableHead className="text-xs font-bold min-w-[90px]">Date</TableHead>
                              <TableHead className="text-xs font-bold">Client</TableHead>
                              <TableHead className="text-xs font-bold">Category</TableHead>
                              <TableHead className="text-xs font-bold">Status</TableHead>
                              <TableHead className="text-xs font-bold text-right">Price</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {insightOrders.map((order) => (
                              <TableRow key={order.id} className="hover:bg-zinc-50/50 h-10">
                                <TableCell className="text-[10px] text-zinc-500 font-mono">
                                  {formatOrderDate(order.createdAt)}
                                </TableCell>
                                <TableCell className="text-xs font-medium text-zinc-900">{order.clientName}</TableCell>
                                <TableCell className="text-xs text-zinc-600">
                                  {order.beltType} <span className="text-zinc-400">({order.beltStyle})</span>
                                </TableCell>
                                <TableCell>
                                  <span className={cn(
                                     "inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter border",
                                     order.status === 'approved' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                     order.status === 'pending_approval' ? "bg-amber-50 text-amber-700 border-amber-100" :
                                     "bg-zinc-100 text-zinc-600 border-zinc-200"
                                  )}>
                                    {order.status.replace('_', ' ')}
                                  </span>
                                </TableCell>
                                <TableCell className="text-[11px] font-bold text-right font-mono">
                                  {formatCurrency(order.totalCost)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>


              {/* Material Variants Selection (Dynamic) */}
              {(() => {
                const category = (Array.isArray(config?.beltTypes) ? config.beltTypes : [])?.find?.(t => t.name === formData.beltType) || null;
                const style = (Array.isArray(category?.styles) ? category.styles : [])?.find?.(s => s.name === formData.beltStyle) || null;
                const showBOMOptions = formData.beltStyle && Array.isArray(style?.bom) && style.bom.some(item => Array.isArray(item.options) && item.options.length > 0);
                
                return showBOMOptions && (
                  <div className="space-y-1.5 pt-1.5 border-t border-zinc-100 animate-in fade-in slide-in-from-top-2">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Material Specification</Label>
                    <div className="grid gap-2">
                      {(() => {
                        const filteredBOM = (Array.isArray(style?.bom) ? style.bom : [])?.filter?.(item => Array.isArray(item.options) && item.options.length > 0) || [];
                        return filteredBOM.map(item => (
                          <div key={item.id} className="space-y-1">
                            <Label className="text-[10px] font-medium text-zinc-400">{item.name}</Label>
                            <Select 
                              value={formData.selectedBOMOptions[item.id]?.toString()} 
                              onValueChange={(val) => setFormData({ 
                                ...formData, 
                                selectedBOMOptions: { ...formData.selectedBOMOptions, [item.id]: parseInt(val) } 
                              })}
                            >
                              <SelectTrigger className="bg-white border-zinc-400 h-9 text-xs">
                                <SelectValue placeholder={`Select ${item.name}`}>
                                  {(() => {
                                    const idx = formData.selectedBOMOptions[item.id];
                                    const opt = Array.isArray(item.options) ? item.options[idx] : null;
                                    if (idx === undefined || !opt) return null;
                                    return opt.name || `₹${opt.rate} / ${opt.unit || item.unit}`;
                                  })()}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {(Array.isArray(item.options) ? item.options : [])?.map?.((opt: any, i: number) => (
                                  <SelectItem key={i} value={i.toString()}>
                                    {opt.name || `₹${opt.rate} / ${opt.unit || item.unit}`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                );
              })()}

              {/* Overrides Section - Only visible after calculation */}
              {result && (
                <div className="space-y-1.5 pt-1.5 border-t border-zinc-100 animate-in fade-in slide-in-from-top-2">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Manual Overrides</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Packing Cost</Label>
                      <Input 
                        type="number" 
                        value={formData.manualPackingCost} 
                        onChange={(e) => setFormData({ ...formData, manualPackingCost: e.target.value })}
                        placeholder={config.rates.packing.toString()}
                        className="bg-white border-zinc-400 focus:ring-zinc-900 h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Profit %</Label>
                      <Input 
                        type="number" 
                        value={formData.manualProfitMargin} 
                        onChange={(e) => setFormData({ ...formData, manualProfitMargin: e.target.value })}
                        placeholder={config.constants.defaultProfit.toString()}
                        className="bg-white border-zinc-400 focus:ring-zinc-900 h-9 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Button 
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-white mt-1 h-10 text-sm font-semibold rounded-lg shadow-md transition-all active:scale-[0.98]" 
              onClick={handleCalculate}
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  Calculating...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CalcIcon className="h-3.5 w-3.5" />
                  Calculate Costing
                </div>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-zinc-300 shadow-xl bg-white/50 backdrop-blur-sm">
          <CardHeader className="border-b border-zinc-100 pb-2 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Calculation Result</CardTitle>
                <CardDescription className="text-xs">
                  {user?.role === 'admin' ? 'Detailed breakdown of costs and margins' : 'Total estimated price for the client'}
                </CardDescription>
              </div>
              {result && (
                <div className="px-2.5 py-0.5 bg-zinc-100 rounded-full text-[9px] font-bold uppercase tracking-widest text-zinc-600">
                  Ready
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-6">
            {!result ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                <div className="p-3 bg-zinc-50 rounded-full mb-3">
                  <CalcIcon className="h-8 w-8 opacity-20" />
                </div>
                <p className="text-zinc-500 text-sm font-medium">Enter parameters and click calculate to see results</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Hole Layout Info Card */}
                {result.summary && result.summary.hasHoles && (
                  <div className="p-3 bg-indigo-50 border border-indigo-150 rounded-xl space-y-1.5 animate-in fade-in duration-200">
                    <h3 className="text-[10px] font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 text-indigo-700" />
                      Holes Layout Specifications
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-semibold text-slate-700 mt-1">
                      <div>
                        <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">Total Holes</span>
                        <p className="text-base font-black text-indigo-900">{result.summary.totalHoles}</p>
                      </div>
                      <div>
                        <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">Holes Grid (L x W)</span>
                        <p className="text-xs font-bold text-slate-900">
                          {Math.floor(toMeters(parseFloat(formData.length), formData.lengthUnit) * 1000 / (parseFloat(formData.holeDistHorizontal) || 1))} × {Math.floor(toMeters(parseFloat(formData.width), formData.widthUnit) * 1000 / (parseFloat(formData.holeDistVertical) || 1))}
                        </p>
                      </div>
                      <div>
                        <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">Hole Size</span>
                        <p className="text-xs font-bold text-slate-900">{formData.holeSize} mm</p>
                      </div>
                      <div>
                        <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">Spacing (H / V)</span>
                        <p className="text-xs font-bold text-slate-900">
                          {formData.holeDistHorizontal}mm / {formData.holeDistVertical}mm
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {user?.role === 'admin' && result.breakdown && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-1 rounded-full bg-zinc-900" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600">Material Cost Breakdown</h3>
                    </div>
                    <div className="border border-zinc-100 rounded-lg overflow-x-auto shadow-sm">
                      <Table>
                        <TableHeader className="bg-zinc-50/50">
                        <TableRow>
                          <TableHead className="text-[10px] font-bold py-2 h-8">Material</TableHead>
                          <TableHead className="text-right text-[10px] font-bold py-2 h-8">Consumption</TableHead>
                          <TableHead className="text-right text-[10px] font-bold py-2 h-8">Rate</TableHead>
                          <TableHead className="text-right text-[10px] font-bold py-2 h-8">Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(result.breakdown)
                          .filter(([key]) => key.toLowerCase() !== 'packing')
                          .map(([key, val]: [string, any]) => (
                          <TableRow key={key} className="hover:bg-zinc-50/30 transition-colors h-8">
                            <TableCell className="font-medium capitalize text-xs py-1.5">
                              {key.replace(/([A-Z])/g, ' $1')}
                              {val.unit && <span className="text-[10px] text-zinc-400 font-medium ml-1">({val.unit})</span>}
                            </TableCell>
                            <TableCell className="text-right text-xs text-zinc-600 font-mono py-1.5">
                              {val.unit === 'holes'
                                ? val.consumption.toFixed(0)
                                : (val.consumption > 999999 ? val.consumption.toExponential(4) : val.consumption.toFixed(4))
                              }
                            </TableCell>
                            <TableCell className="text-right text-xs text-zinc-600 font-mono py-1.5">{formatCurrency(val.rate)}</TableCell>
                            <TableCell className="text-right font-bold text-xs font-mono py-1.5">{formatCurrency(val.cost)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-zinc-50/50 font-black border-t-2 border-zinc-100 h-9">
                          <TableCell colSpan={3} className="text-xs text-zinc-900 py-2">Subtotal</TableCell>
                          <TableCell className="text-right text-xs text-zinc-900 font-mono py-2">{formatCurrency(result.summary.subtotal)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
                )}

                {user?.role === 'admin' && result.summary && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-1 rounded-full bg-zinc-900" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600">Price Summary</h3>
                    </div>
                    <div className="border border-zinc-100 rounded-lg overflow-x-auto shadow-sm">
                      <Table>
                        <TableBody>
                          <TableRow className="hover:bg-zinc-50/30 transition-colors h-8">
                            <TableCell className="font-medium text-xs py-1.5">Material Subtotal</TableCell>
                            <TableCell className="text-right font-mono text-xs py-1.5">{formatCurrency(result.summary.subtotal)}</TableCell>
                          </TableRow>
                          <TableRow className="text-zinc-500 hover:bg-zinc-50/30 transition-colors h-7">
                            <TableCell className="text-[10px] pl-6 py-1">Purchase GST ({config.constants.purchaseGst}%)</TableCell>
                            <TableCell className="text-right font-mono text-[10px] py-1">{formatCurrency(result.summary.purchaseGst)}</TableCell>
                          </TableRow>
                          <TableRow className="bg-zinc-50/30 font-semibold border-y border-zinc-100 h-8">
                            <TableCell className="text-xs py-1.5">Total Landed Cost</TableCell>
                            <TableCell className="text-right font-mono text-xs py-1.5">{formatCurrency(result.summary.totalWithPurchaseGst)}</TableCell>
                          </TableRow>
                          <TableRow className="text-zinc-500 hover:bg-zinc-50/30 transition-colors h-7">
                            <TableCell className="text-[10px] pl-6 py-1">Fix Cost ({result.summary.fixCostPercentage}%)</TableCell>
                            <TableCell className="text-right font-mono text-[10px] py-1">{formatCurrency(result.summary.fixCost)}</TableCell>
                          </TableRow>
                          <TableRow className="text-zinc-500 hover:bg-zinc-50/30 transition-colors border-b border-zinc-100 h-7">
                            <TableCell className="text-[10px] pl-6 py-1">Profit Margin ({result.summary.profitMarginUsed}%)</TableCell>
                            <TableCell className="text-right font-mono text-[10px] py-1">{formatCurrency(result.summary.profit)}</TableCell>
                          </TableRow>
                          <TableRow className="text-zinc-500 hover:bg-zinc-50/30 transition-colors h-7">
                            <TableCell className="text-[10px] pl-6 py-1">Sale GST ({config.constants.saleGst}%)</TableCell>
                            <TableCell className="text-right font-mono text-[10px] py-1">{formatCurrency(result.summary.saleGst)}</TableCell>
                          </TableRow>
                          <TableRow className="text-zinc-500 hover:bg-zinc-50/30 transition-colors h-7 border-b border-zinc-100">
                            <TableCell className="text-[10px] pl-6 py-1">Packing Charge</TableCell>
                            <TableCell className="text-right font-mono text-[10px] py-1">{formatCurrency(result.summary.packingCost)}</TableCell>
                          </TableRow>
                          <TableRow className="bg-zinc-900 hover:bg-zinc-800 text-white font-bold h-11">
                            <TableCell className="text-sm py-2">Final Selling Price</TableCell>
                            <TableCell className="text-right text-lg font-mono py-2">{formatCurrency(result.summary.finalTotal)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-zinc-50 p-4 rounded-xl border border-zinc-100 shadow-inner">
                  <div className="flex flex-col justify-center p-4 bg-zinc-900 rounded-lg text-white shadow-lg overflow-hidden relative">
                    <p className="text-zinc-400 text-[9px] font-black uppercase tracking-[0.2em] mb-2">Price Breakdown</p>
                    
                    {user?.role === 'admin' ? (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-black tracking-tight">{formatCurrency(result.summary.totalWithProfit)}</span>
                          <span className="text-zinc-500 text-[10px] font-bold uppercase">Base</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-zinc-400 font-mono text-sm">+{formatCurrency(result.summary.saleGst)}</span>
                          <span className="text-zinc-500 text-[10px] font-bold uppercase italic">GST ({config.constants.saleGst}%)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-zinc-400 font-mono text-sm">+{formatCurrency(result.summary.packingCost)}</span>
                          <span className="text-zinc-500 text-[10px] font-bold uppercase">Packing</span>
                        </div>
                      </div>
                    ) : (
                      <div className="py-2">
                        <p className="text-xs text-zinc-400 leading-normal">
                          Total estimated belt selling price including taxes and packaging charges.
                        </p>
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Net Total</span>
                        <span className="text-xl font-black text-emerald-400">{formatCurrency(result.summary.finalTotal)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-zinc-500">Adjustment</Label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 font-mono text-xs">{config.currency || '₹'}</span>
                        <Input 
                          type="number" 
                          placeholder="Adjust amount" 
                          value={discountRequested}
                          onChange={(e) => setDiscountRequested(e.target.value)}
                          className="bg-white border-zinc-400 pl-7 h-10 focus:ring-zinc-900 text-base font-bold"
                        />
                      </div>
                    </div>
                    {discountRequested && parseFloat(discountRequested) > 0 && (
                      <div className="space-y-1 animate-in fade-in slide-in-from-top-1">
                        <Label className="text-[10px] font-bold uppercase text-zinc-500">Clarification</Label>
                        <Input 
                          placeholder="Reason..." 
                          value={discountReason}
                          onChange={(e) => setDiscountReason(e.target.value)}
                          className="bg-white border-zinc-400 h-8 text-xs italic"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {user?.permission === 'read' && (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium animate-in fade-in duration-300">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Your account is in read-only mode. You cannot save or submit quotations.</span>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    className="flex-1 gap-1.5 h-10 border-zinc-300 hover:bg-zinc-50 text-zinc-700 text-xs font-bold transition-all disabled:opacity-50" 
                    onClick={() => handleSaveQuotation('draft')}
                    disabled={user?.permission === 'read'}
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save Draft
                  </Button>
                  <Button 
                    className="flex-2 gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white h-10 text-xs font-bold shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                    onClick={() => handleSaveQuotation(discountRequested ? 'pending_approval' : 'draft')}
                    disabled={user?.permission === 'read'}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {discountRequested ? 'Submit Review' : 'Finalize'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {formData.clientId && (
        <Card className="border-zinc-300 shadow-xl bg-white/80 backdrop-blur-sm mt-4 overflow-hidden">
          <CardHeader className="bg-zinc-50/50 border-b border-zinc-100 py-3">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded bg-zinc-900 flex items-center justify-center">
                <Save className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                <CardTitle className="text-base">Client History</CardTitle>
                <CardDescription className="text-[10px] font-medium">Recent quotations for {clients?.find?.(c => c.id === formData.clientId)?.name || 'Client'}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {clientHistory.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center opacity-40">
                <CalcIcon className="h-7 w-7 mb-1.5" />
                <p className="text-[10px] font-bold uppercase tracking-widest italic">New Client Data Flow</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-zinc-50/30">
                    <TableRow className="hover:bg-transparent h-10">
                      <TableHead className="text-[9px] font-black uppercase tracking-wider pl-4">Timeline</TableHead>
                      <TableHead className="text-[9px] font-black uppercase tracking-wider">Specs</TableHead>
                      <TableHead className="text-[9px] font-black uppercase tracking-wider">Dim</TableHead>
                      <TableHead className="text-[9px] font-black uppercase tracking-wider text-right pr-4">Value</TableHead>
                      <TableHead className="text-[9px] font-black uppercase tracking-wider text-center">Lifecycle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientHistory.map((q) => (
                      <TableRow key={q.id} className="text-xs hover:bg-zinc-50/50 transition-colors group h-10">
                        <TableCell className="text-zinc-400 font-mono text-[10px] pl-4 py-2">
                          {formatOrderDate(q.createdAt, false)}
                        </TableCell>
                        <TableCell className="font-bold text-zinc-900 py-2">
                          {q.beltType} <span className="text-zinc-400 font-normal ml-0.5">({q.beltStyle || 'Std'})</span>
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-zinc-600 py-2">
                          {q.dimensions.length}{q.dimensions.lengthUnit || 'mm'}×{q.dimensions.width}{q.dimensions.widthUnit || 'mm'}
                        </TableCell>
                        <TableCell className="font-black text-right pr-4 py-2">
                          {formatCurrency(Math.round(q.totalCost))}
                        </TableCell>
                        <TableCell className="py-2 pr-4 text-center">
                           <div className={cn(
                             "inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter border",
                             q.status === 'approved' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                             q.status === 'pending_approval' ? "bg-amber-50 text-amber-700 border-amber-100" :
                             "bg-zinc-100 text-zinc-600 border-zinc-200"
                           )}>
                             {q.status.replace('_', ' ')}
                           </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
