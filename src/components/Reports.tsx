import React, { useState, useEffect } from 'react';
import { Quotation, AuditLog } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { formatCurrency } from '../lib/utils';
import { TrendingUp, ShoppingBag, Users, IndianRupee } from 'lucide-react';

export const Reports = () => {
  const [quotations, setQuotations] = useState<Quotation[]>([]);

  useEffect(() => {
    fetch('/api/quotations')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch quotations');
        return res.json();
      })
      .then(data => {
        setQuotations(data);
      })
      .catch(err => {
        console.error(err);
      });
  }, []);

  const orders = quotations.filter(q => q.status === 'order');
  const totalRevenue = orders.reduce((sum, q) => sum + q.totalCost, 0);
  const totalOrders = orders.length;
  const totalQuotes = quotations.length;

  // Data for Sales by Month
  const salesByMonth = orders.reduce((acc: any, q) => {
    if (!q.createdAt) return acc;
    const date = (typeof q.createdAt === 'object' && 'toDate' in q.createdAt) ? q.createdAt.toDate() : new Date(q.createdAt);
    if (isNaN(date.getTime())) return acc;
    const month = date.toLocaleString('default', { month: 'short' });
    if (!month) return acc;
    acc[month] = (acc[month] || 0) + q.totalCost;
    return acc;
  }, {});

  const chartData = Object.entries(salesByMonth).map(([name, value]) => ({ name, value }));

  // Data for Belt Category Distribution
  const beltTypeData = orders.reduce((acc: any, q) => {
    acc[q.beltType] = (acc[q.beltType] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.entries(beltTypeData).map(([name, value]) => ({ name, value }));
  const COLORS = ['#18181b', '#3f3f46', '#71717a', '#a1a1aa'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Sales Analytics</h1>
          <p className="text-zinc-500">Overview of business performance and sales trends.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-zinc-200 shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-zinc-900 rounded-2xl">
              <IndianRupee className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Total Revenue</p>
              <h3 className="text-2xl font-bold">{formatCurrency(totalRevenue)}</h3>
            </div>
          </CardContent>
        </Card>
        <Card className="border-zinc-200 shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-zinc-100 rounded-2xl">
              <ShoppingBag className="h-6 w-6 text-zinc-900" />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Total Orders</p>
              <h3 className="text-2xl font-bold">{totalOrders}</h3>
            </div>
          </CardContent>
        </Card>
        <Card className="border-zinc-200 shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-zinc-100 rounded-2xl">
              <TrendingUp className="h-6 w-6 text-zinc-900" />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Total Quotes</p>
              <h3 className="text-2xl font-bold">{totalQuotes}</h3>
            </div>
          </CardContent>
        </Card>
        <Card className="border-zinc-200 shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-zinc-100 rounded-2xl">
              <Users className="h-6 w-6 text-zinc-900" />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Conversion Rate</p>
              <h3 className="text-2xl font-bold">{totalQuotes ? ((totalOrders / totalQuotes) * 100).toFixed(1) : 0}%</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
            <CardDescription>Monthly revenue from completed orders</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717a' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717a' }} tickFormatter={(val) => `₹${val/1000}k`} />
                <Tooltip 
                  cursor={{ fill: '#f4f4f5' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(val: number) => [formatCurrency(val), 'Revenue']}
                />
                <Bar dataKey="value" fill="#18181b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle>Belt Category Distribution</CardTitle>
            <CardDescription>Popularity of different belt categories in orders</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                   contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2 ml-4">
              {pieData.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="text-xs text-zinc-500">{entry.name} ({entry.value})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
