import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Client, Quotation } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { 
  Users, 
  FileText, 
  CheckCircle2, 
  Clock, 
  ArrowRight, 
  Scissors, 
  Calculator as CalcIcon,
  Factory
} from 'lucide-react';

interface DashboardOverviewProps {
  setActiveTab: (tab: string) => void;
  clients: Client[];
  quotations: Quotation[];
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({ 
  setActiveTab, 
  clients, 
  quotations 
}) => {
  const { user } = useAuth();

  // Compute statistics
  const clientsCount = clients.length;
  const quotationsCount = quotations.length;
  const pendingApprovalsCount = quotations.filter(q => q.status === 'pending_approval').length;
  const approvedCount = quotations.filter(q => q.status === 'approved').length;

  // Get recent quotations (last 5)
  const recentQuotations = [...quotations]
    .sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
      return dateB.getTime() - dateA.getTime();
    })
    .slice(0, 5);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-950 text-white p-8 rounded-3xl relative overflow-hidden shadow-2xl">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 pointer-events-none">
          <Factory className="h-64 w-64 translate-x-12 translate-y-12 rotate-12" />
        </div>
        <div className="relative z-10 space-y-2">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Pooja Tekno Belt
          </h1>
          <p className="text-zinc-400 text-sm max-w-xl">
            Welcome back, <span className="text-white font-bold">{user?.name || user?.username}</span>. Here is an overview of pricing portal operations and remnants optimization.
          </p>
        </div>
        <div className="flex items-center gap-3 relative z-10">
          <div className="px-4 py-2 bg-white/10 rounded-2xl border border-white/15 backdrop-blur-sm text-xs font-semibold capitalize">
            Role: {user?.role}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-zinc-200 shadow-sm bg-white hover:shadow-md transition-all duration-300">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Total Clients</p>
              <h3 className="text-3xl font-black text-zinc-900">{clientsCount}</h3>
            </div>
            <div className="p-3 bg-zinc-100 text-zinc-900 rounded-2xl">
              <Users className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-sm bg-white hover:shadow-md transition-all duration-300">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Quotations</p>
              <h3 className="text-3xl font-black text-zinc-900">{quotationsCount}</h3>
            </div>
            <div className="p-3 bg-zinc-100 text-zinc-900 rounded-2xl">
              <FileText className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-sm bg-white hover:shadow-md transition-all duration-300">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Pending Approval</p>
              <h3 className="text-3xl font-black text-amber-600">{pendingApprovalsCount}</h3>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
              <Clock className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-sm bg-white hover:shadow-md transition-all duration-300">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Approved Orders</p>
              <h3 className="text-3xl font-black text-emerald-600">{approvedCount}</h3>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
              <CheckCircle2 className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Beltcut Pro CTA + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Beltcut Pro Premium Card */}
        <div className="lg:col-span-2 group relative bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 text-white rounded-3xl p-8 shadow-xl flex flex-col justify-between overflow-hidden min-h-[300px]">
          {/* Decorative Gradient Overlay */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_120%,rgba(59,130,246,0.15),transparent)] pointer-events-none group-hover:scale-105 transition-transform duration-700" />
          
          <div className="space-y-4 relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full border border-white/15 backdrop-blur-sm text-[10px] font-bold tracking-wider uppercase text-zinc-300">
              <Scissors className="h-3 w-3 text-white" /> Industrial Grade Optimizer
            </div>
            <h2 className="text-3xl md:text-4xl font-black italic tracking-tight uppercase">
              Beltcut <span className="text-blue-400 not-italic">Pro</span>
            </h2>
            <p className="text-zinc-400 text-sm max-w-lg leading-relaxed">
              Open the 2D packing system. Input belt specifications, calculate nested placement configurations on raw rolls, and save remnants to minimize material wastage.
            </p>
          </div>

          <div className="relative z-10 pt-6">
            <button 
              onClick={() => setActiveTab('beltcut')}
              className="relative inline-flex items-center justify-center px-8 py-4.5 text-xs font-black uppercase tracking-widest text-zinc-950 bg-white rounded-2xl border-2 border-zinc-200/20 shadow-[0_5px_0_#d4d4d8,0_12px_20px_rgba(0,0,0,0.15)] hover:shadow-[0_7px_0_#d4d4d8,0_16px_24px_rgba(0,0,0,0.2)] hover:-translate-y-[2px] active:translate-y-[3px] active:shadow-[0_2px_0_#d4d4d8,0_6px_10px_rgba(0,0,0,0.1)] transition-all duration-150 cursor-pointer select-none group/btn"
            >
              <span>Launch Beltcut Pro</span>
              <ArrowRight className="ml-2 h-4 w-4 group-hover/btn:translate-x-1.5 transition-transform duration-200" />
            </button>
          </div>
        </div>

        {/* Quick Utilities Panel */}
        <Card className="border-zinc-200 shadow-sm bg-white/80 backdrop-blur-sm flex flex-col justify-between p-6 rounded-3xl">
          <div className="space-y-4">
            <div>
              <CardTitle className="text-lg">Quick Tasks</CardTitle>
              <CardDescription className="text-xs">Navigate to portal sub-tools directly</CardDescription>
            </div>
            
            <div className="space-y-3">
              <button 
                onClick={() => setActiveTab('calculator')}
                className="w-full flex items-center justify-between p-3.5 hover:bg-zinc-50 rounded-2xl border border-zinc-100 transition-all text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-zinc-900 rounded-xl text-white">
                    <CalcIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-800">Costing Calculator</p>
                    <p className="text-[10px] text-zinc-400">Calculate conveyor belt costing</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-zinc-400" />
              </button>

              <button 
                onClick={() => setActiveTab('quotations')}
                className="w-full flex items-center justify-between p-3.5 hover:bg-zinc-50 rounded-2xl border border-zinc-100 transition-all text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-zinc-900 rounded-xl text-white">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-800">Quotations Registry</p>
                    <p className="text-[10px] text-zinc-400">Review, draft & approve sales sheets</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-zinc-400" />
              </button>

              <button 
                onClick={() => setActiveTab('clients')}
                className="w-full flex items-center justify-between p-3.5 hover:bg-zinc-50 rounded-2xl border border-zinc-100 transition-all text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-zinc-900 rounded-xl text-white">
                    <Users className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-800">Client Registry</p>
                    <p className="text-[10px] text-zinc-400">Manage contacts and profit bounds</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-zinc-400" />
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* Recent Activity List */}
      <Card className="border-zinc-200 shadow-sm bg-white overflow-hidden rounded-3xl">
        <CardHeader className="bg-zinc-50/50 border-b border-zinc-100 py-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-zinc-800" />
            <div>
              <CardTitle className="text-base">Recent Quotations Activity</CardTitle>
              <CardDescription className="text-xs">Overview of the last 5 quotations created</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recentQuotations.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 text-sm">
              No recent quotations recorded.
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {recentQuotations.map((q) => {
                const date = q.createdAt?.toDate ? q.createdAt.toDate() : new Date(q.createdAt);
                return (
                  <div key={q.id} className="flex items-center justify-between p-4 px-6 hover:bg-zinc-50/50 transition-colors">
                    <div className="flex flex-col gap-0.5">
                      <p className="text-xs font-bold text-zinc-950">{q.clientName}</p>
                      <p className="text-[10px] text-zinc-400">
                        {q.beltType} ({q.beltStyle || 'Std'}) — {q.dimensions.length}m x {q.dimensions.width}m
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-xs font-bold text-zinc-900">
                        ₹{Math.round(q.totalCost).toLocaleString('en-IN')}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter border ${
                        q.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                        q.status === 'pending_approval' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                        'bg-zinc-100 text-zinc-600 border-zinc-200'
                      }`}>
                        {q.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
