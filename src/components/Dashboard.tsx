import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { DashboardHome } from './DashboardHome';
import { BeltcutPro } from './BeltcutPro/BeltcutPro';
import { Calculator } from './Calculator';
import { AdminConfig } from './AdminConfig';
import { UserManagement } from './UserManagement';
import { ClientRegistry } from './ClientRegistry';
import { QuotationsList } from './QuotationsList';
import { Reports } from './Reports';
import { ActivityLog } from './ActivityLog';
import { Config, Client } from '../types';
import { Loader2, Factory, Calculator as CalcIcon, Scissors, ArrowRight, ArrowLeft } from 'lucide-react';

export const Dashboard = () => {
  const { user } = useAuth();

  const getInitialModule = () => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('module') as 'master' | 'pricing' | 'production') || 'master';
  };

  const getInitialTab = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'dashboard';
  };

  const [activeModule, setActiveModule] = useState<'master' | 'pricing' | 'production'>(getInitialModule);
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [config, setConfig] = useState<Config | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const handleModuleChange = (mod: 'master' | 'pricing' | 'production') => {
    setActiveModule(mod);
    const params = new URLSearchParams(window.location.search);
    params.set('module', mod);
    if (mod === 'master') {
      params.delete('tab');
    } else if (mod === 'pricing') {
      params.set('tab', activeTab || 'dashboard');
    }
    window.history.pushState({ module: mod, tab: params.get('tab') }, '', `?${params.toString()}`);
  };

  const handleTabChange = (tab: string) => {
    if (tab === 'beltcut') {
      handleModuleChange('production');
      return;
    }
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    params.set('module', activeModule);
    if (params.get('tab') !== tab) {
      params.set('tab', tab);
      window.history.pushState({ module: activeModule, tab }, '', `?${params.toString()}`);
    }
  };

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const params = new URLSearchParams(window.location.search);
      const mod = (params.get('module') as 'master' | 'pricing' | 'production') || 'master';
      const tab = params.get('tab') || 'dashboard';
      setActiveModule(mod);
      setActiveTab(tab);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && activeTab !== 'dashboard') {
        handleTabChange('dashboard');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeTab]);

  const fetchConfigAndClients = async () => {
    try {
      const [configRes, clientsRes] = await Promise.all([
        fetch('/api/settings/config'),
        fetch('/api/clients')
      ]);

      if (configRes.ok) {
        const configData = await configRes.json();
        setConfig(configData);
      }

      if (clientsRes.ok) {
        const clientsData = await clientsRes.json();
        setClients(clientsData);
      }
    } catch (err) {
      console.error('Failed to fetch config or clients', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigAndClients();
    const interval = setInterval(fetchConfigAndClients, 15000);
    return () => clearInterval(interval);
  }, []);



  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-50">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  const renderContent = () => {
    const safeConfig = config || {} as any;
    switch (activeTab) {
      case 'dashboard':
        return <DashboardHome config={safeConfig} clients={clients} onNavigate={handleTabChange} />;
      case 'calculator':
        return <Calculator config={safeConfig} clients={clients} />;
      case 'config':
        return <AdminConfig config={safeConfig} />;
      case 'users':
        return <UserManagement />;
      case 'clients':
        return <ClientRegistry clients={clients} config={safeConfig} />;
      case 'quotations':
        return <QuotationsList config={safeConfig} />;
      case 'reports':
        return <Reports />;
      case 'activity':
        return <ActivityLog />;
      case 'beltcut':
        return <BeltcutPro />;
      default:
        return <DashboardHome config={safeConfig} clients={clients} onNavigate={handleTabChange} />;
    }
  };

  if (activeModule === 'master') {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col justify-between text-white font-sans antialiased overflow-hidden relative">
        {/* Background Decorative Gradients */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
        
        {/* Header */}
        <header className="p-8 flex items-center justify-between border-b border-white/5 backdrop-blur-sm bg-zinc-950/20 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white rounded-xl shadow-lg">
              <Factory className="h-6 w-6 text-zinc-950" />
            </div>
            <div className="flex flex-col">
              <span className="text-white font-black tracking-tight text-lg leading-none uppercase">Pooja Tekno Belt</span>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Master Portal</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider bg-zinc-900 px-3 py-1.5 rounded-lg border border-white/5">
              Logged in as: {user?.name || user?.username}
            </span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 z-10 max-w-5xl mx-auto w-full">
          <div className="text-center space-y-4 mb-16 animate-in fade-in slide-in-from-top-6 duration-700">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/5 text-xs font-black uppercase tracking-widest text-zinc-400">
              Welcome to the Business Suite
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-200 to-zinc-400">
              Pooja Tekno Belt
            </h1>
            <p className="text-zinc-400 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
              Select one of the specialized portals below to manage your pricing workflows or production optimization.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
            {/* PTB Pricing Portal Button Card */}
            <button
              onClick={() => handleModuleChange('pricing')}
              className="group text-left p-8 bg-zinc-900/50 hover:bg-zinc-900/80 border border-white/5 hover:border-white/10 rounded-3xl transition-all duration-300 shadow-2xl relative overflow-hidden flex flex-col justify-between min-h-[280px] cursor-pointer hover:-translate-y-1 hover:shadow-indigo-500/5"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-500/10 to-transparent rounded-bl-[100px] transition-all group-hover:scale-110" />
              
              <div className="space-y-4 relative z-10">
                <div className="p-3.5 bg-indigo-500/10 text-indigo-400 rounded-2xl w-fit group-hover:scale-105 transition-transform duration-300">
                  <CalcIcon className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white group-hover:text-indigo-400 transition-colors">
                    PTB Pricing & Costing
                  </h3>
                  <p className="text-zinc-500 text-xs mt-2 leading-relaxed">
                    Calculate conveyor belt costing, manage client-specific profit margins, create quotations/drafts, and manage system configurations.
                  </p>
                </div>
              </div>

              <div className="mt-8 flex items-center gap-1.5 text-xs font-bold text-zinc-400 group-hover:text-white transition-colors">
                <span>Access Pricing Portal</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>

            {/* Production Portal Button Card */}
            <button
              onClick={() => handleModuleChange('production')}
              className="group text-left p-8 bg-zinc-900/50 hover:bg-zinc-900/80 border border-white/5 hover:border-white/10 rounded-3xl transition-all duration-300 shadow-2xl relative overflow-hidden flex flex-col justify-between min-h-[280px] cursor-pointer hover:-translate-y-1 hover:shadow-emerald-500/5"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-bl-[100px] transition-all group-hover:scale-110" />
              
              <div className="space-y-4 relative z-10">
                <div className="p-3.5 bg-emerald-500/10 text-emerald-400 rounded-2xl w-fit group-hover:scale-105 transition-transform duration-300">
                  <Scissors className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors">
                    Production & Nesting
                  </h3>
                  <p className="text-zinc-500 text-xs mt-2 leading-relaxed">
                    Access Beltcut Pro. Optimize remnant utilization, perform 2D nesting on master rolls, calculate coordinates, and manage inventory cuts.
                  </p>
                </div>
              </div>

              <div className="mt-8 flex items-center gap-1.5 text-xs font-bold text-zinc-400 group-hover:text-white transition-colors">
                <span>Access Production Portal</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          </div>
        </main>

        {/* Footer */}
        <footer className="p-8 text-center text-zinc-600 text-xs border-t border-white/5 z-10">
          &copy; {new Date().getFullYear()} Pooja Tekno Belt. All rights reserved.
        </footer>
      </div>
    );
  }

  if (activeModule === 'production') {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          <BeltcutPro onBackToMaster={() => handleModuleChange('master')} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-50 overflow-hidden">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={handleTabChange} 
        beltCutProUrl={config?.beltCutProUrl}
        onBackToMaster={() => handleModuleChange('master')}
      />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};
