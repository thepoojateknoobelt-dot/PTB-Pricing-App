import React, { useState, useEffect, useMemo } from 'react';
import { Quotation, Client, Config } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { formatCurrency, cn } from '../lib/utils';
import { calculateCosting } from '../lib/calculations';
import { Calendar, Download, Printer, TrendingUp, IndianRupee, Building2, ShoppingBag, Percent, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';

interface ReportsProps {
  config: Config;
  clients: Client[];
}

const convertToDate = (dateVal: any): Date => {
  if (!dateVal) return new Date(0);
  const date = (typeof dateVal === 'object' && 'toDate' in dateVal) ? dateVal.toDate() : new Date(dateVal);
  return isNaN(date.getTime()) ? new Date(0) : date;
};

const formatLocalDate = (date: Date): string => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
};

export const Reports: React.FC<ReportsProps> = ({ config, clients }) => {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [activeReportCard, setActiveReportCard] = useState<'purchase' | 'profitability' | 'company' | null>(null);
  const [isDateConfirmed, setIsDateConfirmed] = useState<boolean>(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('this-month');
  const [selectedCompany, setSelectedCompany] = useState<string>('all');

  // Default date range: current month start to today
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    return formatLocalDate(new Date(d.getFullYear(), d.getMonth(), 1));
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return formatLocalDate(new Date());
  });

  const handlePresetClick = (preset: string) => {
    const today = new Date();
    let start = new Date();
    let end = new Date();

    switch (preset) {
      case 'today':
        start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        break;
      case 'yesterday':
        start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
        end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
        break;
      case 'this-week': {
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
        start = new Date(today.getFullYear(), today.getMonth(), diff);
        end = new Date();
        break;
      }
      case 'last-7-days':
        start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
        end = new Date();
        break;
      case 'this-month':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date();
        break;
      case 'last-month':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'last-30-days':
        start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
        end = new Date();
        break;
      default:
        return;
    }

    setStartDate(formatLocalDate(start));
    setEndDate(formatLocalDate(end));
  };

  useEffect(() => {
    fetch('/api/quotations')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setQuotations(data);
      })
      .catch(err => console.error('Failed to fetch quotations in reports:', err));

    fetch('/api/companies')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setCompanies(data);
      })
      .catch(err => console.error('Failed to fetch companies in reports:', err));
  }, []);

  // Filter orders and calculate costs on-the-fly
  const filteredOrders = useMemo(() => {
    const orders = quotations.filter(q => q.status === 'order' || q.status === 'executed');
    if (!startDate && !endDate) return [];

    const start = startDate ? new Date(startDate) : new Date(0);
    start.setHours(0, 0, 0, 0);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    return orders
      .filter(q => {
        const orderDate = q.updatedAt || q.createdAt;
        if (!orderDate) return false;
        const qDate = convertToDate(orderDate);
        return qDate >= start && qDate <= end;
      })
      .map(q => {
        if (q.items && q.items.length > 0) {
          const itemsSubtotal = q.items.reduce((sum, item) => sum + (item.calculated?.summary?.subtotal || 0), 0);
          const itemsTotalWithProfit = q.items.reduce((sum, item) => sum + (item.calculated?.summary?.totalWithProfit || 0), 0);
          const itemsProfit = q.items.reduce((sum, item) => sum + (item.calculated?.summary?.profit || 0), 0);
          const itemsProfitMarginUsed = q.items.length > 0 
            ? q.items.reduce((sum, item) => sum + (item.calculated?.summary?.profitMarginUsed || 0), 0) / q.items.length
            : 0;

          return {
            ...q,
            calculated: {
              summary: {
                subtotal: itemsSubtotal,
                totalWithProfit: itemsTotalWithProfit,
                profit: itemsProfit,
                profitMarginUsed: itemsProfitMarginUsed
              }
            }
          };
        }

        const client = clients?.find(c => c.id === q.clientId) || null;
        const clientProfitRanges = client?.profitMargins?.[q.beltType] || [];
        const category = config?.beltTypes?.find(t => t.name === q.beltType) || null;
        const style = category?.styles?.find(s => s.name === q.beltStyle) || null;

        const included = q.selectedBOMOptions?._included;
        const customRates = q.selectedBOMOptions?._customRates || {};
        const customBOM = (style?.bom || [])
          .filter(item => !included || included[item.id] !== false)
          .map(item => {
            const selectedOptIdx = q.selectedBOMOptions?.[item.id];
            let rate = item.rate;
            let unit = item.unit;
            let name = item.name;
            let formula = item.formula;

            if (selectedOptIdx !== undefined && item.options && item.options[selectedOptIdx]) {
              const opt = item.options[selectedOptIdx];
              rate = opt.rate;
              unit = opt.unit || item.unit;
              name = opt.name ? opt.name.trim() : item.name;
              formula = opt.formula || item.formula;
            }

            if (customRates[item.id] !== undefined) {
              rate = customRates[item.id];
            }

            return {
              ...item,
              rate,
              unit,
              name,
              formula
            };
          });

        const costingParams = {
          length: q.dimensions.length,
          lengthUnit: q.dimensions.lengthUnit || q.dimensions.unit || 'mm',
          width: q.dimensions.width,
          widthUnit: q.dimensions.widthUnit || q.dimensions.unit || 'mm',
          beltType: q.beltType,
          hasHoles: q.dimensions.hasHoles,
          holeSize: q.dimensions.holeSize,
          holeDistHorizontal: q.dimensions.holeDistHorizontal,
          holeDistVertical: q.dimensions.holeDistVertical,
          pricePerHole: q.dimensions.pricePerHole,
        };

        const result = calculateCosting(costingParams, config, clientProfitRanges, customBOM, {});
        
        return {
          ...q,
          calculated: result
        };
      })
      .sort((a, b) => convertToDate(b.updatedAt || b.createdAt).getTime() - convertToDate(a.updatedAt || a.createdAt).getTime());
  }, [quotations, startDate, endDate, config, clients]);

  // Aggregated calculations for Reports
  const totalMaterialSubtotal = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (o.calculated?.summary?.subtotal || 0), 0);
  }, [filteredOrders]);

  const totalBasePrice = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (o.calculated?.summary?.totalWithProfit || 0), 0);
  }, [filteredOrders]);

  const totalProfitMarginCash = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (o.calculated?.summary?.profit || 0), 0);
  }, [filteredOrders]);

  const avgProfitMarginPct = useMemo(() => {
    if (filteredOrders.length === 0) return 0;
    const sum = filteredOrders.reduce((acc, o) => acc + (o.calculated?.summary?.profitMarginUsed || 0), 0);
    return sum / filteredOrders.length;
  }, [filteredOrders]);

  // Dynamic Company mapping
  const activeCompaniesList = useMemo(() => {
    const names = new Set(companies.map(c => c.name));
    names.add('Pooja Tekno Belt');
    return Array.from(names);
  }, [companies]);

  // Dynamic filter for company reports
  const displayOrders = useMemo(() => {
    if (activeReportCard === 'company' && selectedCompany !== 'all') {
      return filteredOrders.filter(o => (o.company || 'Pooja Tekno Belt') === selectedCompany);
    }
    return filteredOrders;
  }, [filteredOrders, activeReportCard, selectedCompany]);

  const companySalesMap = useMemo(() => {
    const map: Record<string, number> = {};
    activeCompaniesList.forEach(name => {
      map[name] = 0;
    });
    filteredOrders.forEach(o => {
      const compName = o.company || 'Pooja Tekno Belt';
      if (activeCompaniesList.includes(compName)) {
        map[compName] = (map[compName] || 0) + o.totalCost;
      } else {
        // Add to default/first company if not matching
        const defaultComp = activeCompaniesList[0] || 'Pooja Tekno Belt';
        map[defaultComp] = (map[defaultComp] || 0) + o.totalCost;
      }
    });
    return map;
  }, [filteredOrders, activeCompaniesList]);

  // Export CSV Handler
  const handleExportCSV = () => {
    if (filteredOrders.length === 0) {
      toast.error('No orders to export in selected date range.');
      return;
    }

    let headers: string[] = [];
    let rows: string[][] = [];

    if (activeReportCard === 'purchase') {
      headers = ['Order ID', 'Date', 'Client', 'Material Subtotal'];
      rows = filteredOrders.map(o => [
        `#${o.orderNumber || ''}`,
        convertToDate(o.updatedAt || o.createdAt).toLocaleDateString('en-IN'),
        o.clientName,
        Math.round(o.calculated?.summary?.subtotal || 0).toString()
      ]);
      rows.push(['GRAND TOTAL', '', '', Math.round(totalMaterialSubtotal).toString()]);
    } else if (activeReportCard === 'profitability') {
      headers = ['Order ID', 'Date', 'Client', 'Base Price', 'Profit Margin (Cash)', 'Profit Margin (%)'];
      rows = filteredOrders.map(o => [
        `#${o.orderNumber || ''}`,
        convertToDate(o.updatedAt || o.createdAt).toLocaleDateString('en-IN'),
        o.clientName,
        Math.round(o.calculated?.summary?.totalWithProfit || 0).toString(),
        Math.round(o.calculated?.summary?.profit || 0).toString(),
        (o.calculated?.summary?.profitMarginUsed || 0).toFixed(1) + '%'
      ]);
      rows.push(['GRAND TOTAL', '', '', Math.round(totalBasePrice).toString(), Math.round(totalProfitMarginCash).toString(), 'Avg: ' + avgProfitMarginPct.toFixed(1) + '%']);
    } else if (activeReportCard === 'company') {
      headers = ['Order ID', 'Date', 'Client', 'Company', 'Final Selling Price'];
      rows = displayOrders.map(o => [
        `#${o.orderNumber || ''}`,
        convertToDate(o.updatedAt || o.createdAt).toLocaleDateString('en-IN'),
        o.clientName,
        o.company || 'Pooja Tekno Belt',
        Math.round(o.totalCost).toString()
      ]);
      const grandTotalFinal = displayOrders.reduce((sum, o) => sum + o.totalCost, 0);
      rows.push(['GRAND TOTAL', '', '', '', Math.round(grandTotalFinal).toString()]);
    }

    const csvContent = [headers, ...rows]
      .map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeReportCard}_report_${startDate}_to_${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('CSV Report exported successfully.');
  };

  // Print Report Handler
  const handlePrintReport = () => {
    if (filteredOrders.length === 0) {
      toast.error('No orders to print in selected date range.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let reportTitle = '';
    let tableHeaders = '';
    let tableRows = '';
    let totalsHeader = '';

    const formattedStart = startDate ? new Date(startDate).toLocaleDateString('en-IN') : 'Start';
    const formattedEnd = endDate ? new Date(endDate).toLocaleDateString('en-IN') : 'End';

    if (activeReportCard === 'purchase') {
      reportTitle = 'Purchase Cost Report';
      tableHeaders = '<th>Order ID</th><th>Date</th><th>Client</th><th style="text-align: right;">Material Subtotal</th>';
      tableRows = filteredOrders.map(o => `
        <tr>
          <td>#${o.orderNumber || ''}</td>
          <td>${convertToDate(o.updatedAt || o.createdAt).toLocaleDateString('en-IN')}</td>
          <td>${o.clientName}</td>
          <td style="text-align: right;">${formatCurrency(o.calculated?.summary?.subtotal || 0)}</td>
        </tr>
      `).join('');
      totalsHeader = `<h3>Total Material Subtotal: ${formatCurrency(totalMaterialSubtotal)}</h3>`;
    } else if (activeReportCard === 'profitability') {
      reportTitle = 'Order Profitability Report';
      tableHeaders = '<th>Order ID</th><th>Date</th><th>Client</th><th style="text-align: right;">Base Price</th><th style="text-align: right;">Profit Margin (₹)</th><th style="text-align: right;">Profit Margin (%)</th>';
      tableRows = filteredOrders.map(o => `
        <tr>
          <td>#${o.orderNumber || ''}</td>
          <td>${convertToDate(o.updatedAt || o.createdAt).toLocaleDateString('en-IN')}</td>
          <td>${o.clientName}</td>
          <td style="text-align: right;">${formatCurrency(o.calculated?.summary?.totalWithProfit || 0)}</td>
          <td style="text-align: right;">${formatCurrency(o.calculated?.summary?.profit || 0)}</td>
          <td style="text-align: right;">${(o.calculated?.summary?.profitMarginUsed || 0).toFixed(1)}%</td>
        </tr>
      `).join('');
      totalsHeader = `
        <h3>Total Base Price: ${formatCurrency(totalBasePrice)}</h3>
        <h3>Total Profit Margin (₹): ${formatCurrency(totalProfitMarginCash)}</h3>
        <h3>Average Profit Margin (%): ${avgProfitMarginPct.toFixed(1)}%</h3>
      `;
    } else if (activeReportCard === 'company') {
      reportTitle = `Company Sales Report (${selectedCompany === 'all' ? 'All Companies' : selectedCompany})`;
      tableHeaders = '<th>Order ID</th><th>Date</th><th>Client</th><th>Company</th><th style="text-align: right;">Final Selling Price</th>';
      tableRows = displayOrders.map(o => `
        <tr>
          <td>#${o.orderNumber || ''}</td>
          <td>${convertToDate(o.updatedAt || o.createdAt).toLocaleDateString('en-IN')}</td>
          <td>${o.clientName}</td>
          <td>${o.company || 'Pooja Tekno Belt'}</td>
          <td style="text-align: right;">${formatCurrency(o.totalCost)}</td>
        </tr>
      `).join('');
      
      if (selectedCompany === 'all') {
        totalsHeader = activeCompaniesList.map(comp => `
          <h3>Total ${comp}: ${formatCurrency(companySalesMap[comp] || 0)}</h3>
        `).join('');
      } else {
        totalsHeader = `<h3>Total ${selectedCompany}: ${formatCurrency(displayOrders.reduce((sum, o) => sum + o.totalCost, 0))}</h3>`;
      }
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>${reportTitle}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; color: #18181b; }
            h1 { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
            h3 { font-size: 14px; font-weight: bold; margin: 5px 0; }
            p { font-size: 12px; color: #71717a; margin-top: 0; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #e4e4e7; padding: 8px; font-size: 11px; text-align: left; }
            th { background-color: #f4f4f5; font-weight: bold; }
            tr:nth-child(even) { background-color: #fafafa; }
            .totals-section { margin-bottom: 20px; border-bottom: 2px solid #18181b; padding-bottom: 10px; }
          </style>
        </head>
        <body>
          <h1>${reportTitle}</h1>
          <p>Date Range: ${formattedStart} to ${formattedEnd}</p>
          <div class="totals-section">
            ${totalsHeader}
          </div>
          <table>
            <thead>
              <tr>${tableHeaders}</tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-2 border-b border-zinc-200 pb-4">
        <div className="p-2 bg-zinc-950 rounded-xl text-white shadow-md">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl sm:text-3xl font-black tracking-tight text-zinc-900">Reports Dashboard</h1>
          <p className="text-xs text-zinc-500 font-bold mt-0.5">Generate, analyze, and export business reports</p>
        </div>
      </div>

      {/* ── TOP: Three dynamic report cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Card 1: Purchase Cost */}
        <button
          type="button"
          onClick={() => {
            const next = activeReportCard === 'purchase' ? null : 'purchase';
            setActiveReportCard(next);
            setIsDateConfirmed(false);
            setSelectedPreset('this-month');
            setSelectedCompany('all');
            const d = new Date();
            setStartDate(formatLocalDate(new Date(d.getFullYear(), d.getMonth(), 1)));
            setEndDate(formatLocalDate(new Date()));
          }}
          className={`group w-full text-left p-6 rounded-2xl border-2 transition-all duration-300 cursor-pointer flex items-center gap-4 shadow-sm hover:shadow-md ${
            activeReportCard === 'purchase'
              ? 'bg-zinc-950 border-zinc-950 text-white shadow-lg scale-[1.01]'
              : 'bg-white border-zinc-200 text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50/50'
          }`}
        >
          <div className={`p-3.5 rounded-xl shrink-0 transition-transform group-hover:scale-115 ${activeReportCard === 'purchase' ? 'bg-white/10' : 'bg-zinc-100'}`}>
            <IndianRupee size={24} className={activeReportCard === 'purchase' ? 'text-white' : 'text-zinc-700'} />
          </div>
          <div>
            <p className={`text-[10px] font-black uppercase tracking-wider ${activeReportCard === 'purchase' ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Report #1
            </p>
            <h3 className={`text-lg font-black leading-snug mt-0.5 ${activeReportCard === 'purchase' ? 'text-white' : 'text-zinc-950'}`}>
              Purchase Cost
            </h3>
            <p className={`text-[10px] font-bold mt-1 leading-normal ${activeReportCard === 'purchase' ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Material Subtotal cost breakdown
            </p>
          </div>
        </button>

        {/* Card 2: Order Profitability */}
        <button
          type="button"
          onClick={() => {
            const next = activeReportCard === 'profitability' ? null : 'profitability';
            setActiveReportCard(next);
            setIsDateConfirmed(false);
            setSelectedPreset('this-month');
            setSelectedCompany('all');
            const d = new Date();
            setStartDate(formatLocalDate(new Date(d.getFullYear(), d.getMonth(), 1)));
            setEndDate(formatLocalDate(new Date()));
          }}
          className={`group w-full text-left p-6 rounded-2xl border-2 transition-all duration-300 cursor-pointer flex items-center gap-4 shadow-sm hover:shadow-md ${
            activeReportCard === 'profitability'
              ? 'bg-emerald-700 border-emerald-700 text-white shadow-lg scale-[1.01]'
              : 'bg-white border-zinc-200 text-zinc-800 hover:border-emerald-400 hover:bg-zinc-50/50'
          }`}
        >
          <div className={`p-3.5 rounded-xl shrink-0 transition-transform group-hover:scale-115 ${activeReportCard === 'profitability' ? 'bg-white/15' : 'bg-emerald-50'}`}>
            <TrendingUp size={24} className={activeReportCard === 'profitability' ? 'text-white' : 'text-emerald-700'} />
          </div>
          <div>
            <p className={`text-[10px] font-black uppercase tracking-wider ${activeReportCard === 'profitability' ? 'text-emerald-100' : 'text-zinc-500'}`}>
              Report #2
            </p>
            <h3 className={`text-lg font-black leading-snug mt-0.5 ${activeReportCard === 'profitability' ? 'text-white' : 'text-zinc-950'}`}>
              Order Profitability
            </h3>
            <p className={`text-[10px] font-bold mt-1 leading-normal ${activeReportCard === 'profitability' ? 'text-emerald-100' : 'text-zinc-500'}`}>
              Base selling price and profit margins
            </p>
          </div>
        </button>

        {/* Card 3: Company Sales */}
        <button
          type="button"
          onClick={() => {
            const next = activeReportCard === 'company' ? null : 'company';
            setActiveReportCard(next);
            setIsDateConfirmed(false);
            setSelectedPreset('this-month');
            setSelectedCompany('all');
            const d = new Date();
            setStartDate(formatLocalDate(new Date(d.getFullYear(), d.getMonth(), 1)));
            setEndDate(formatLocalDate(new Date()));
          }}
          className={`group w-full text-left p-6 rounded-2xl border-2 transition-all duration-300 cursor-pointer flex items-center gap-4 shadow-sm hover:shadow-md ${
            activeReportCard === 'company'
              ? 'bg-indigo-700 border-indigo-700 text-white shadow-lg scale-[1.01]'
              : 'bg-white border-zinc-200 text-zinc-800 hover:border-indigo-400 hover:bg-zinc-50/50'
          }`}
        >
          <div className={`p-3.5 rounded-xl shrink-0 transition-transform group-hover:scale-115 ${activeReportCard === 'company' ? 'bg-white/15' : 'bg-indigo-50'}`}>
            <Building2 size={24} className={activeReportCard === 'company' ? 'text-white' : 'text-indigo-700'} />
          </div>
          <div>
            <p className={`text-[10px] font-black uppercase tracking-wider ${activeReportCard === 'company' ? 'text-indigo-100' : 'text-zinc-500'}`}>
              Report #3
            </p>
            <h3 className={`text-lg font-black leading-snug mt-0.5 ${activeReportCard === 'company' ? 'text-white' : 'text-zinc-950'}`}>
              Company Sales
            </h3>
            <p className={`text-[10px] font-bold mt-1 leading-normal ${activeReportCard === 'company' ? 'text-indigo-100' : 'text-zinc-500'}`}>
              Final totals divided by company units
            </p>
          </div>
        </button>

      </div>

      {/* ── BOTTOM: Date Selection Prompt OR Report Output ── */}
      {activeReportCard && (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-3 duration-300">
          
          {!isDateConfirmed ? (
            /* Elegant prompt to select dates first */
            <Card className="border-zinc-200 shadow-md bg-white max-w-2xl mx-auto overflow-hidden rounded-2xl">
              <div className="bg-zinc-950 p-6 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white/10 rounded-xl">
                    {activeReportCard === 'purchase' && <IndianRupee size={20} />}
                    {activeReportCard === 'profitability' && <TrendingUp size={20} />}
                    {activeReportCard === 'company' && <Building2 size={20} />}
                  </div>
                  <div>
                    <h2 className="text-base font-black tracking-tight uppercase">
                      {activeReportCard === 'purchase' && 'Purchase Cost Report'}
                      {activeReportCard === 'profitability' && 'Order Profitability Report'}
                      {activeReportCard === 'company' && 'Company Sales Report'}
                    </h2>
                    <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mt-0.5">Select Date Range Parameters</p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setActiveReportCard(null)}
                  className="text-zinc-400 hover:text-white transition-colors text-xs font-bold bg-transparent border-none cursor-pointer"
                >
                  Cancel
                </button>
              </div>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-zinc-500 tracking-wider">Quick Date Presets</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'today', label: 'Today' },
                      { id: 'yesterday', label: 'Yesterday' },
                      { id: 'this-week', label: 'This Week' },
                      { id: 'last-7-days', label: 'Last 7 Days' },
                      { id: 'this-month', label: 'This Month' },
                      { id: 'last-month', label: 'Last Month' },
                      { id: 'last-30-days', label: 'Last 30 Days' },
                    ].map(preset => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          handlePresetClick(preset.id);
                          setSelectedPreset(preset.id);
                        }}
                        className={cn(
                          "py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer",
                          selectedPreset === preset.id
                            ? "bg-zinc-950 text-white border-zinc-950 shadow-sm"
                            : "bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300"
                        )}
                      >
                        {preset.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSelectedPreset('custom')}
                      className={cn(
                        "py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer",
                        selectedPreset === 'custom'
                          ? "bg-zinc-950 text-white border-zinc-950 shadow-sm"
                          : "bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300"
                      )}
                    >
                      Custom Range
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-zinc-100 pt-6">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider flex items-center gap-1">
                      <Calendar size={12} /> Start Date
                    </Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setSelectedPreset('custom');
                      }}
                      className="bg-white border-zinc-300 focus:ring-zinc-950 text-sm font-semibold h-10 rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider flex items-center gap-1">
                      <Calendar size={12} /> End Date
                    </Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setSelectedPreset('custom');
                      }}
                      className="bg-white border-zinc-300 focus:ring-zinc-950 text-sm font-semibold h-10 rounded-xl"
                    />
                  </div>
                </div>

                {activeReportCard === 'company' && (
                  <div className="space-y-1.5 border-t border-zinc-100 pt-6">
                    <Label className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider flex items-center gap-1">
                      <Building2 size={12} /> Filter by Company
                    </Label>
                    <select
                      value={selectedCompany}
                      onChange={(e) => setSelectedCompany(e.target.value)}
                      className="w-full bg-white border border-zinc-300 focus:ring-zinc-950 text-sm font-semibold h-10 rounded-xl px-3 outline-none"
                    >
                      <option value="all">All Companies</option>
                      {activeCompaniesList.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="border-t border-zinc-100 pt-6 flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveReportCard(null)}
                    className="border-zinc-200 hover:bg-zinc-50 text-zinc-700 h-10 text-xs font-bold px-5 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setIsDateConfirmed(true);
                      toast.success('Report generated successfully.');
                    }}
                    className="bg-zinc-950 hover:bg-zinc-900 text-white h-10 text-xs font-bold px-6 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <BarChart3 size={14} /> Generate Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            /* Generated Report UI */
            <>
              {/* Header Bar with Action Controls */}
              <Card className="border-zinc-200 shadow-sm bg-white overflow-hidden rounded-2xl">
                <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className={cn(
                      "p-3 rounded-xl text-white shrink-0 shadow-sm",
                      activeReportCard === 'purchase' && "bg-zinc-950",
                      activeReportCard === 'profitability' && "bg-emerald-700",
                      activeReportCard === 'company' && "bg-indigo-700"
                    )}>
                      {activeReportCard === 'purchase' && <IndianRupee size={20} />}
                      {activeReportCard === 'profitability' && <TrendingUp size={20} />}
                      {activeReportCard === 'company' && <Building2 size={20} />}
                    </div>
                    <div>
                      <h2 className="text-sm font-black uppercase tracking-wider text-zinc-900">
                        {activeReportCard === 'purchase' && 'Purchase Cost Report'}
                        {activeReportCard === 'profitability' && 'Order Profitability Report'}
                        {activeReportCard === 'company' && 'Company Sales Report'}
                      </h2>
                      <p className="text-xs text-zinc-500 font-bold mt-0.5">
                        Range: {new Date(startDate).toLocaleDateString('en-IN')} to {new Date(endDate).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
                    {activeReportCard === 'company' && (
                      <div className="flex items-center gap-2 border border-zinc-200 bg-zinc-50/50 py-1.5 px-3 rounded-xl">
                        <Label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider whitespace-nowrap">Company:</Label>
                        <select
                          value={selectedCompany}
                          onChange={(e) => setSelectedCompany(e.target.value)}
                          className="bg-white border border-zinc-200 focus:ring-zinc-900 text-xs font-bold h-8 rounded-lg px-2 outline-none"
                        >
                          <option value="all">All Companies</option>
                          {activeCompaniesList.map(name => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => setIsDateConfirmed(false)}
                      className="flex-1 md:flex-initial border-zinc-200 text-zinc-700 hover:bg-zinc-50 h-9 text-xs font-bold px-4 rounded-xl flex items-center gap-1.5 cursor-pointer"
                    >
                      <Calendar size={13} /> Change Date
                    </Button>
                    <Button
                      onClick={handleExportCSV}
                      className="flex-1 md:flex-initial bg-zinc-900 hover:bg-zinc-800 text-white h-9 text-xs font-bold px-4 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Download size={13} /> Export CSV
                    </Button>
                    <Button
                      onClick={handlePrintReport}
                      className="flex-1 md:flex-initial bg-zinc-900 hover:bg-zinc-800 text-white h-9 text-xs font-bold px-4 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Printer size={13} /> Print
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Report 1: Purchase Cost Details */}
              {activeReportCard === 'purchase' && (
                <div className="space-y-6">
                  
                  {/* Upper Stats Card */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <Card className="border-zinc-200 shadow-sm bg-white rounded-2xl">
                      <CardContent className="p-5 flex items-center gap-4">
                        <div className="p-3.5 bg-zinc-100 rounded-xl shrink-0">
                          <IndianRupee className="h-6 w-6 text-zinc-950" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Total Material Subtotal</p>
                          <h3 className="text-2xl font-black text-zinc-950 mt-0.5">{formatCurrency(totalMaterialSubtotal)}</h3>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Table Data */}
                  <Card className="border-zinc-200 shadow-sm bg-white rounded-2xl overflow-hidden">
                    <CardHeader className="pb-2 border-b border-zinc-100">
                      <CardTitle className="text-xs font-black uppercase tracking-wider text-zinc-800">
                        Filtered Orders Sheet
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader className="bg-zinc-50/50">
                            <TableRow>
                              <TableHead className="text-xs font-black text-zinc-500">Order ID</TableHead>
                              <TableHead className="text-xs font-black text-zinc-500">Date</TableHead>
                              <TableHead className="text-xs font-black text-zinc-500">Client</TableHead>
                              <TableHead className="text-xs font-black text-zinc-500 text-right">Material Subtotal</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody className="text-xs font-semibold text-zinc-700">
                            {filteredOrders.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={4} className="py-12 text-center text-zinc-400 font-medium italic">
                                  No orders found in selected date range.
                                </TableCell>
                              </TableRow>
                            ) : (
                              <>
                                {filteredOrders.map(o => (
                                  <TableRow key={o.id} className="hover:bg-zinc-50/35 transition-colors h-9">
                                    <TableCell className="font-mono font-bold text-zinc-950">#{o.orderNumber || ''}</TableCell>
                                    <TableCell>{convertToDate(o.updatedAt || o.createdAt).toLocaleDateString('en-IN')}</TableCell>
                                    <TableCell className="font-bold text-zinc-900">{o.clientName}</TableCell>
                                    <TableCell className="text-right font-bold font-mono text-zinc-900">
                                      {formatCurrency(o.calculated?.summary?.subtotal || 0)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                                <TableRow className="bg-zinc-50/70 border-t-2 border-zinc-200 font-black h-10 text-zinc-950">
                                  <TableCell colSpan={3} className="text-xs font-black text-zinc-900">GRAND TOTAL</TableCell>
                                  <TableCell className="text-right text-xs font-black font-mono text-zinc-900">
                                    {formatCurrency(totalMaterialSubtotal)}
                                  </TableCell>
                                </TableRow>
                              </>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>

                </div>
              )}

              {/* Report 2: Order Profitability Details */}
              {activeReportCard === 'profitability' && (
                <div className="space-y-6">
                  
                  {/* Upper Stats Card */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    <Card className="border-zinc-200 shadow-sm bg-white rounded-2xl">
                      <CardContent className="p-5 flex items-center gap-4">
                        <div className="p-3.5 bg-zinc-100 rounded-xl shrink-0">
                          <IndianRupee className="h-6 w-6 text-zinc-950" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Total Base Price</p>
                          <h3 className="text-2xl font-black text-zinc-950 mt-0.5">{formatCurrency(totalBasePrice)}</h3>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-zinc-200 shadow-sm bg-white rounded-2xl">
                      <CardContent className="p-5 flex items-center gap-4">
                        <div className="p-3.5 bg-zinc-100 rounded-xl shrink-0">
                          <Percent className="h-6 w-6 text-zinc-950" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Average Profit Margin %</p>
                          <h3 className="text-2xl font-black text-zinc-950 mt-0.5">{avgProfitMarginPct.toFixed(1)}%</h3>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Table Data */}
                  <Card className="border-zinc-200 shadow-sm bg-white rounded-2xl overflow-hidden">
                    <CardHeader className="pb-2 border-b border-zinc-100">
                      <CardTitle className="text-xs font-black uppercase tracking-wider text-zinc-800">
                        Filtered Orders Sheet
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader className="bg-zinc-50/50">
                            <TableRow>
                              <TableHead className="text-xs font-black text-zinc-500">Order ID</TableHead>
                              <TableHead className="text-xs font-black text-zinc-500">Date</TableHead>
                              <TableHead className="text-xs font-black text-zinc-500">Client</TableHead>
                              <TableHead className="text-xs font-black text-zinc-500 text-right">Base Price</TableHead>
                              <TableHead className="text-xs font-black text-zinc-500 text-right">Profit Margin (₹)</TableHead>
                              <TableHead className="text-xs font-black text-zinc-500 text-right">Profit Margin (%)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody className="text-xs font-semibold text-zinc-700">
                            {filteredOrders.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} className="py-12 text-center text-zinc-400 font-medium italic">
                                  No orders found in selected date range.
                                </TableCell>
                              </TableRow>
                            ) : (
                              <>
                                {filteredOrders.map(o => (
                                  <TableRow key={o.id} className="hover:bg-zinc-50/35 transition-colors h-9">
                                    <TableCell className="font-mono font-bold text-zinc-950">#{o.orderNumber || ''}</TableCell>
                                    <TableCell>{convertToDate(o.createdAt).toLocaleDateString('en-IN')}</TableCell>
                                    <TableCell className="font-bold text-zinc-900">{o.clientName}</TableCell>
                                    <TableCell className="text-right font-bold font-mono text-zinc-900">
                                      {formatCurrency(o.calculated?.summary?.totalWithProfit || 0)}
                                    </TableCell>
                                    <TableCell className="text-right font-bold font-mono text-zinc-900">
                                      {formatCurrency(o.calculated?.summary?.profit || 0)}
                                    </TableCell>
                                    <TableCell className="text-right font-bold font-mono text-zinc-900">
                                      {(o.calculated?.summary?.profitMarginUsed || 0).toFixed(1)}%
                                    </TableCell>
                                  </TableRow>
                                ))}
                                <TableRow className="bg-zinc-50/70 border-t-2 border-zinc-200 font-black h-10 text-zinc-950">
                                  <TableCell colSpan={3} className="text-xs font-black text-zinc-900">GRAND TOTAL</TableCell>
                                  <TableCell className="text-right text-xs font-black font-mono text-zinc-900">
                                    {formatCurrency(totalBasePrice)}
                                  </TableCell>
                                  <TableCell className="text-right text-xs font-black font-mono text-zinc-900">
                                    {formatCurrency(totalProfitMarginCash)}
                                  </TableCell>
                                  <TableCell className="text-right text-xs font-black font-mono text-zinc-900">
                                    Avg: {avgProfitMarginPct.toFixed(1)}%
                                  </TableCell>
                                </TableRow>
                              </>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>

                </div>
              )}

              {/* Report 3: Company Sales Details */}
              {activeReportCard === 'company' && (
                <div className="space-y-6">
                  
                  {/* Upper Stats Card (Exactly 3 Company Cards or filtered) */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {activeCompaniesList
                      .filter(compName => selectedCompany === 'all' || compName === selectedCompany)
                      .map(compName => (
                        <Card key={compName} className="border-zinc-200 shadow-sm bg-white rounded-2xl">
                          <CardContent className="p-5 flex items-center gap-4">
                            <div className="p-3.5 bg-zinc-100 rounded-xl shrink-0">
                              <Building2 className="h-6 w-6 text-zinc-950" />
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">
                                {compName} Sales
                              </p>
                              <h3 className="text-2xl font-black text-zinc-950 mt-0.5">
                                {formatCurrency(companySalesMap[compName] || 0)}
                              </h3>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>

                  {/* Table Data */}
                  <Card className="border-zinc-200 shadow-sm bg-white rounded-2xl overflow-hidden">
                    <CardHeader className="pb-2 border-b border-zinc-100">
                      <CardTitle className="text-xs font-black uppercase tracking-wider text-zinc-800">
                        Filtered Orders Sheet
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader className="bg-zinc-50/50">
                            <TableRow>
                              <TableHead className="text-xs font-black text-zinc-500">Order ID</TableHead>
                              <TableHead className="text-xs font-black text-zinc-500">Date</TableHead>
                              <TableHead className="text-xs font-black text-zinc-500">Client</TableHead>
                              <TableHead className="text-xs font-black text-zinc-500">Company</TableHead>
                              <TableHead className="text-xs font-black text-zinc-500 text-right">Final Selling Price</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody className="text-xs font-semibold text-zinc-700">
                            {displayOrders.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={5} className="py-12 text-center text-zinc-400 font-medium italic">
                                  No orders found in selected date range.
                                </TableCell>
                              </TableRow>
                            ) : (
                              <>
                                {displayOrders.map(o => (
                                  <TableRow key={o.id} className="hover:bg-zinc-50/35 transition-colors h-9">
                                    <TableCell className="font-mono font-bold text-zinc-950">#{o.orderNumber || ''}</TableCell>
                                    <TableCell>{convertToDate(o.createdAt).toLocaleDateString('en-IN')}</TableCell>
                                    <TableCell className="font-bold text-zinc-900">{o.clientName}</TableCell>
                                    <TableCell className="font-bold text-zinc-650">{o.company || 'Pooja Tekno Belt'}</TableCell>
                                    <TableCell className="text-right font-bold font-mono text-zinc-900">
                                      {formatCurrency(o.totalCost)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                                <TableRow className="bg-zinc-50/70 border-t-2 border-zinc-200 font-black h-10 text-zinc-950">
                                  <TableCell colSpan={4} className="text-xs font-black text-zinc-900">GRAND TOTAL</TableCell>
                                  <TableCell className="text-right text-xs font-black font-mono text-zinc-900">
                                    {formatCurrency(displayOrders.reduce((sum, o) => sum + o.totalCost, 0))}
                                  </TableCell>
                                </TableRow>
                              </>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>

                </div>
              )}
            </>
          )}

        </div>
      )}
    </div>
  );
};
