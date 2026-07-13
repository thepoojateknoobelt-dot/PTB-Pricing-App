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

interface EnhancedQuotation extends Quotation {
  orderNumber?: number;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({ config, clients, onNavigate }) => {
  const [quotations, setQuotations] = useState<EnhancedQuotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
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
          
          setQuotations(withOrderNumbers);
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
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 rounded-lg text-[#1e40af]">
            <TrendingUp className="h-4 w-4" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#1e3a8a]">Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => onNavigate('calculator')} className="bg-[#1e40af] hover:bg-[#1d4ed8] text-white gap-1.5 shadow-md h-8 text-xs px-3 rounded-[6px] cursor-pointer">
            <Plus className="h-3.5 w-3.5" /> Create Quotation
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-blue-100/60 shadow-[0_4px_12px_rgba(30,58,138,0.04)] rounded-[14px] hover:shadow-md transition-all duration-200 bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-blue-550">Total Revenue</CardTitle>
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <DollarSign className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-[#1e3a8a]">{formatCurrency(totalRevenue)}</div>
            <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
              <span className="text-emerald-600 font-bold flex items-center">
                <ArrowUpRight className="h-3 w-3" /> Approved
              </span>
              quotations volume
            </p>
          </CardContent>
        </Card>

        <Card className="border-blue-100/60 shadow-[0_4px_12px_rgba(30,58,138,0.04)] rounded-[14px] hover:shadow-md transition-all duration-200 bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-blue-550">Total Quotes</CardTitle>
            <div className="p-1.5 bg-blue-50 text-[#1e40af] rounded-lg">
              <FileText className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-[#1e3a8a]">{totalQuotes}</div>
            <p className="text-[10px] text-zinc-500 mt-1">
              All generated quotations in system
            </p>
          </CardContent>
        </Card>

        <Card className="border-blue-100/60 shadow-[0_4px_12px_rgba(30,58,138,0.04)] rounded-[14px] hover:shadow-md transition-all duration-200 bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-blue-550">Pending Review</CardTitle>
            <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-[#1e3a8a]">{pendingQuotes.length}</div>
            <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
              Requires admin approval
            </p>
          </CardContent>
        </Card>

        <Card className="border-blue-100/60 shadow-[0_4px_12px_rgba(30,58,138,0.04)] rounded-[14px] hover:shadow-md transition-all duration-200 bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-blue-550">Active Clients</CardTitle>
            <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-[#1e3a8a]">{activeClientsCount}</div>
            <p className="text-[10px] text-zinc-500 mt-1">
              Clients registered in system
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-blue-100/60 shadow-[0_4px_12px_rgba(30,58,138,0.04)] rounded-[14px] bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-50 rounded-lg text-[#1e40af]">
                <TrendingUp className="h-3.5 w-3.5" />
              </div>
              <div>
                <CardTitle className="text-base text-[#1e3a8a]">Sales Performance Trend</CardTitle>
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
                      <stop offset="5%" stopColor="#1e40af" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#1e40af" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip 
                    formatter={(v) => [formatCurrency(Number(v)), 'Volume']} 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #dbeafe', fontSize: '12px' }} 
                  />
                  <Area type="monotone" dataKey="value" stroke="#1e40af" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 border-blue-100/60 shadow-[0_4px_12px_rgba(30,58,138,0.04)] rounded-[14px] bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-[#1e3a8a]">Quotation Distribution</CardTitle>
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

      {/* Recent Activity and Quick Actions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Quotes */}
        <Card className="lg:col-span-2 border-blue-100/60 shadow-[0_4px_12px_rgba(30,58,138,0.04)] rounded-[14px] bg-white overflow-hidden">
          <CardHeader className="bg-blue-50/10 border-b border-blue-100/40 py-3.5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base text-[#1e3a8a]">Recent Activity</CardTitle>
                <CardDescription className="text-xs">Latest quotations generated in system</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('quotations')} className="text-xs text-blue-600 hover:text-[#1e3a8a] hover:bg-blue-50">
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
                  <TableHeader className="bg-blue-50/20">
                    <TableRow className="h-9 border-b border-blue-100/30">
                      <TableHead className="text-[10px] font-black uppercase tracking-wider pl-4">ID</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider">Timeline</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider">Client</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider">Belt Specs</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider text-right pr-4">Total Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentQuotes.map((q: any) => (
                      <TableRow key={q.id} className="text-xs hover:bg-blue-50/20 border-b border-blue-100/30 transition-colors h-11">
                        <TableCell className="font-mono font-bold text-blue-700 text-xs pl-4 py-2">
                          #{q.orderNumber}
                        </TableCell>
                        <TableCell className="text-zinc-400 font-mono text-[10px] py-2">
                          {formatOrderDate(q.createdAt)}
                        </TableCell>
                        <TableCell className="font-bold text-[#1e3a8a] py-2">
                          {q.clientName}
                        </TableCell>
                        <TableCell className="text-zinc-500 py-2">
                          {q.beltType} <span className="text-zinc-400 font-mono text-[10px] ml-1">({q.dimensions.length}×{q.dimensions.width})</span>
                        </TableCell>
                        <TableCell className="font-black text-right pr-4 py-2 text-[#1e3a8a] font-mono">
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
        <Card className="lg:col-span-1 border-blue-100/60 shadow-[0_4px_12px_rgba(30,58,138,0.04)] rounded-[14px] bg-white">
          <CardHeader>
            <CardTitle className="text-base text-[#1e3a8a]">Quick Actions</CardTitle>
            <CardDescription className="text-xs">Access primary tasks directly</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <button 
              onClick={() => onNavigate('calculator')}
              className="w-full flex items-center justify-between p-3.5 rounded-xl border border-blue-100 hover:border-blue-200 hover:bg-blue-50/30 text-left transition-all duration-200 shadow-sm group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-[#1e40af] rounded-lg group-hover:scale-105 transition-transform">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#1e3a8a]">Run Calculation</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Open Costing Calculator</div>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-blue-400 group-hover:text-[#1e40af] transition-colors" />
            </button>

            <button 
              onClick={() => onNavigate('clients')}
              className="w-full flex items-center justify-between p-3.5 rounded-xl border border-blue-100 hover:border-blue-200 hover:bg-blue-50/30 text-left transition-all duration-200 shadow-sm group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-[#1e40af] rounded-lg group-hover:scale-105 transition-transform">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#1e3a8a]">Register Client</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Add new client to registry</div>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-blue-400 group-hover:text-[#1e40af] transition-colors" />
            </button>

            <button 
              onClick={() => onNavigate('config')}
              className="w-full flex items-center justify-between p-3.5 rounded-xl border border-blue-100 hover:border-blue-200 hover:bg-blue-50/30 text-left transition-all duration-200 shadow-sm group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-[#1e40af] rounded-lg group-hover:scale-105 transition-transform">
                  <Settings className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#1e3a8a]">Configure Settings</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Update unit rates, constants, etc.</div>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-blue-400 group-hover:text-[#1e40af] transition-colors" />
            </button>

            <button 
              onClick={() => onNavigate('beltcut')}
              className="w-full flex items-center justify-between p-3.5 rounded-xl border border-blue-100 hover:border-blue-200 hover:bg-blue-50/30 text-left transition-all duration-200 shadow-sm group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-[#1e40af] rounded-lg group-hover:scale-105 transition-transform">
                  <Scissors className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#1e3a8a]">Beltcut Pro</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">2D roll cutting optimization engine</div>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-blue-400 group-hover:text-[#1e40af] transition-colors" />
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
