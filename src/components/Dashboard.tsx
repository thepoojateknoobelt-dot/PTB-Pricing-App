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
import { Loader2 } from 'lucide-react';

export const Dashboard = () => {
  const { user } = useAuth();

  const getInitialTab = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'dashboard';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [config, setConfig] = useState<Config | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);



  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') !== tab) {
      params.set('tab', tab);
      window.history.pushState({ tab }, '', `?${params.toString()}`);
    }
  };

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab') || 'dashboard';
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

  return (
    <div className="flex h-screen bg-zinc-50 overflow-hidden">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={handleTabChange} 
        beltCutProUrl={config?.beltCutProUrl}
      />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};
