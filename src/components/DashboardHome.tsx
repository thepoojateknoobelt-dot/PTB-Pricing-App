import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  CheckCircle2, 
  Clock, 
  ArrowUpRight, 
  Plus, 
  Users, 
  Settings,
  FileText,
  DollarSign,
  Scissors,
  ArrowRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { formatCurrency } from '../lib/utils';
import { Client, Config, Quotation } from '../types';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip,
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface DashboardHomeProps {
  config: Config;
  clients: Client[];
  onNavigate: (tab: string) => void;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({ config, clients, onNavigate }) => {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchQuotations = async () => {
      try {
        const res = await fetch('/api/quotations');
        if (res.ok) {
          const data = await res.json();
          setQuotations(data);
        }
      } catch (err) {
        console.error('Failed to fetch quotations for dashboard', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchQuotations();
    const interval = setInterval(fetchQuotations, 4000);
    return () => clearInterval(interval);
  }, []);

  // Compute metrics
  const totalQuotes = quotations.length;
  const approvedQuotes = quotations.filter(q => q.status === 'approved');
  const pendingQuotes = quotations.filter(q => q.status === 'pending_approval');
  
  const totalRevenue = approvedQuotes.reduce((sum, q) => sum + (q.totalCost || 0), 0);
  const activeClientsCount = clients.length;

  // Process data for sales chart (last 6 months)
  const salesByMonth: Record<string, number> = {};
  quotations.forEach(q => {
    if (q.createdAt) {
      const date = new Date(q.createdAt);
      const monthYear = date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      salesByMonth[monthYear] = (salesByMonth[monthYear] || 0) + (q.totalCost || 0);
    }
  });

  const chartData = Object.entries(salesByMonth)
    .map(([name, value]) => ({ name, value }))
    .slice(-6); // Keep last 6 months

  // Process data for status chart
  const statusCounts = {
    Approved: approvedQuotes.length,
    Pending: pendingQuotes.length,
    Draft: quotations.filter(q => q.status === 'draft').length,
    Rejected: quotations.filter(q => q.status === 'rejected').length
  };

  const pieData = Object.entries(statusCounts)
    .filter(([_, val]) => val > 0)
    .map(([name, value]) => ({ name, value }));

  const COLORS = ['#10b981', '#f59e0b', '#71717a', '#ef4444'];

  const recentQuotes = [...quotations]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const formatOrderDate = (dateVal: any) => {
    if (!dateVal) return '';
    const date = new Date(dateVal);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Dashboard</h1>
          <p className="text-zinc-500">Overview of system performance, quotations, and active business metrics.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => onNavigate('calculator')} className="bg-zinc-900 hover:bg-zinc-800 text-white gap-1.5 shadow-md">
            <Plus className="h-4 w-4" /> Create Quotation
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-zinc-200 shadow-md hover:shadow-lg transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500">Total Revenue</CardTitle>
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <DollarSign className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-zinc-900">{formatCurrency(totalRevenue)}</div>
            <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
              <span className="text-emerald-600 font-bold flex items-center">
                <ArrowUpRight className="h-3 w-3" /> Approved
              </span>
              quotations volume
            </p>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-md hover:shadow-lg transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500">Total Quotes</CardTitle>
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <FileText className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-zinc-900">{totalQuotes}</div>
            <p className="text-[10px] text-zinc-500 mt-1">
              All generated quotations in system
            </p>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-md hover:shadow-lg transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500">Pending Review</CardTitle>
            <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-zinc-900">{pendingQuotes.length}</div>
            <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
              Requires admin approval
            </p>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-md hover:shadow-lg transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500">Active Clients</CardTitle>
            <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-zinc-900">{activeClientsCount}</div>
            <p className="text-[10px] text-zinc-500 mt-1">
              Clients registered in system
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-zinc-200 shadow-md bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-zinc-900 rounded-lg">
                <TrendingUp className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                <CardTitle className="text-base">Sales Performance Trend</CardTitle>
                <CardDescription className="text-xs">Quotation amounts summed by month</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-80 pt-4">
            {chartData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-zinc-400 text-sm italic">
                No monthly sales history available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#18181b" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#18181b" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip 
                    formatter={(v) => [formatCurrency(Number(v)), 'Volume']} 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e4e4e7', fontSize: '12px' }} 
                  />
                  <Area type="monotone" dataKey="value" stroke="#18181b" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 border-zinc-200 shadow-md bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quotation Distribution</CardTitle>
            <CardDescription className="text-xs">By lifecycle/approval status</CardDescription>
          </CardHeader>
          <CardContent className="h-80 flex flex-col items-center justify-center pt-4">
            {pieData.length === 0 ? (
              <div className="text-zinc-400 text-sm italic">No data available</div>
            ) : (
              <>
                <div className="w-full h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [v, 'Quotation(s)']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  {pieData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span>{entry.name} ({entry.value})</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Beltcut Pro Banner */}
      <div className="relative overflow-hidden bg-zinc-950 text-white p-6 rounded-2xl shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative z-10 space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-white/10 rounded-full border border-white/10 text-[9px] font-black uppercase tracking-wider text-blue-400">
            Industrial Grade Nesting
          </div>
          <h3 className="text-xl font-black italic tracking-tight uppercase">
            Beltcut <span className="text-blue-400 not-italic font-bold">Pro</span> Integration
          </h3>
          <p className="text-xs text-zinc-400 max-w-xl">
            Optimize 2D roll cutting directly inside the pricing portal. Nest custom slices on raw master rolls to calculate placement coordinates and reduce scrap waste.
          </p>
        </div>
        <div className="relative z-10 shrink-0">
          <button 
            onClick={() => onNavigate('beltcut')}
            className="relative inline-flex items-center justify-center px-8 py-4 text-xs font-black uppercase tracking-widest text-zinc-950 bg-white rounded-2xl border-2 border-zinc-200/20 shadow-[0_5px_0_#d4d4d8,0_12px_20px_rgba(0,0,0,0.15)] hover:shadow-[0_7px_0_#d4d4d8,0_16px_24px_rgba(0,0,0,0.2)] hover:-translate-y-[2px] active:translate-y-[3px] active:shadow-[0_2px_0_#d4d4d8,0_6px_10px_rgba(0,0,0,0.1)] transition-all duration-150 cursor-pointer select-none group/btn"
          >
            <span>Launch Beltcut Pro</span>
            <ArrowRight className="ml-2 h-4 w-4 group-hover/btn:translate-x-1.5 transition-transform duration-200" />
          </button>
        </div>
      </div>

      {/* Recent Activity and Quick Actions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Quotes */}
        <Card className="lg:col-span-2 border-zinc-200 shadow-md bg-white overflow-hidden">
          <CardHeader className="bg-zinc-50/50 border-b border-zinc-100 py-3.5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Recent Activity</CardTitle>
                <CardDescription className="text-xs">Latest quotations generated in system</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('quotations')} className="text-xs text-zinc-500 hover:text-zinc-900">
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentQuotes.length === 0 ? (
              <div className="py-16 text-center text-zinc-400 italic text-sm">
                No quotations recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-zinc-50/20">
                    <TableRow className="h-9">
                      <TableHead className="text-[10px] font-black uppercase tracking-wider pl-4">Timeline</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider">Client</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider">Belt Specs</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider text-right pr-4">Total Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentQuotes.map((q) => (
                      <TableRow key={q.id} className="text-xs hover:bg-zinc-50/50 transition-colors h-11">
                        <TableCell className="text-zinc-400 font-mono text-[10px] pl-4 py-2">
                          {formatOrderDate(q.createdAt)}
                        </TableCell>
                        <TableCell className="font-bold text-zinc-900 py-2">
                          {q.clientName}
                        </TableCell>
                        <TableCell className="text-zinc-500 py-2">
                          {q.beltType} <span className="text-zinc-400 font-mono text-[10px] ml-1">({q.dimensions.length}×{q.dimensions.width})</span>
                        </TableCell>
                        <TableCell className="font-black text-right pr-4 py-2 text-zinc-900 font-mono">
                          {formatCurrency(Math.round(q.totalCost))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions Panel */}
        <Card className="lg:col-span-1 border-zinc-200 shadow-md bg-white">
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
            <CardDescription className="text-xs">Access primary tasks directly</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <button 
              onClick={() => onNavigate('calculator')}
              className="w-full flex items-center justify-between p-3.5 rounded-xl border border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50 text-left transition-all duration-200 shadow-sm group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-zinc-900 text-white rounded-lg group-hover:scale-105 transition-transform">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-zinc-900">Run Calculation</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Open Costing Calculator</div>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-900 transition-colors" />
            </button>

            <button 
              onClick={() => onNavigate('clients')}
              className="w-full flex items-center justify-between p-3.5 rounded-xl border border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50 text-left transition-all duration-200 shadow-sm group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-zinc-900 text-white rounded-lg group-hover:scale-105 transition-transform">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-zinc-900">Register Client</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Add new client to registry</div>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-900 transition-colors" />
            </button>

            <button 
              onClick={() => onNavigate('config')}
              className="w-full flex items-center justify-between p-3.5 rounded-xl border border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50 text-left transition-all duration-200 shadow-sm group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-zinc-900 text-white rounded-lg group-hover:scale-105 transition-transform">
                  <Settings className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-zinc-900">Configure Settings</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Update unit rates, constants, etc.</div>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-900 transition-colors" />
            </button>

            <button 
              onClick={() => onNavigate('beltcut')}
              className="w-full flex items-center justify-between p-3.5 rounded-xl border border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50 text-left transition-all duration-200 shadow-sm group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-zinc-900 text-white rounded-lg group-hover:scale-105 transition-transform">
                  <Scissors className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-zinc-900">Beltcut Pro</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">2D roll cutting optimization engine</div>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-900 transition-colors" />
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
