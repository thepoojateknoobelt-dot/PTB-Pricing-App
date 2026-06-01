import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { toast } from 'sonner';
import { UserPlus, Trash2, Shield, User as UserIcon, Edit2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';

export const UserManagement = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    role: 'sales' as 'admin' | 'sales',
    password: '',
    permission: 'write' as 'read' | 'write',
  });
  const [selectedPages, setSelectedPages] = useState<string[]>(['dashboard', 'calculator', 'quotations', 'clients']);
  const [isAdding, setIsAdding] = useState(false);

  // Edit User State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    role: 'sales' as 'admin' | 'sales',
    permission: 'write' as 'read' | 'write',
    allowedPages: [] as string[]
  });

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error('Failed to fetch users', err);
    }
  };

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username || !formData.password) {
      toast.error('Username and password are required');
      return;
    }

    setIsAdding(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          name: formData.name,
          role: formData.role,
          password: formData.password,
          permission: formData.permission,
          allowedPages: selectedPages
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        toast.error(errData.error || 'Failed to create user');
        setIsAdding(false);
        return;
      }

      toast.success('User created successfully');
      setFormData({ username: '', name: '', role: 'sales', password: '', permission: 'write' });
      setSelectedPages(['dashboard', 'calculator', 'quotations', 'clients']);
      fetchUsers();
    } catch (err: any) {
      console.error('Error creating user:', err);
      toast.error(`Failed to create user: ${err.message || 'Unknown error'}`);
    } finally {
      setIsAdding(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editFormData.name,
          role: editFormData.role,
          permission: editFormData.permission,
          allowedPages: editFormData.allowedPages
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        toast.error(errData.error || 'Failed to update user');
        return;
      }

      toast.success('User updated successfully');
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      console.error('Error updating user:', err);
      toast.error(`Failed to update user: ${err.message || 'Unknown error'}`);
    }
  };

  const handleStartEdit = (u: User) => {
    setEditingUser(u);
    setEditFormData({
      name: u.name,
      role: u.role,
      permission: u.permission || 'write',
      allowedPages: u.allowedPages || []
    });
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (userId === 'admin_user' || userId === 'admin') {
      toast.error('Cannot delete primary administrator');
      return;
    }
    if (!confirm(`Are you sure you want to delete user ${username}?`)) return;

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Delete failed');

      toast.success('User deleted');
      fetchUsers();
    } catch (err) {
      toast.error('Failed to delete user');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">User Management</h1>
          <p className="text-zinc-500">Manage portal access for sales team and administrators.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 border-zinc-200 shadow-sm h-fit">
          <CardHeader>
            <CardTitle>Add New User</CardTitle>
            <CardDescription>Create a new account with specific permissions</CardDescription>
          </CardHeader>
          <form onSubmit={handleAddUser}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input 
                  value={formData.username} 
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input 
                  value={formData.name} 
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={formData.role} onValueChange={(val: any) => setFormData({ ...formData, role: val })}>
                  <SelectTrigger className="border-zinc-300">
                    <SelectValue placeholder="Select Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales">Sales Person</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Access Level / Permission</Label>
                <Select value={formData.permission} onValueChange={(val: any) => setFormData({ ...formData, permission: val })}>
                  <SelectTrigger className="border-zinc-300">
                    <SelectValue placeholder="Select Access Level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="write">Read & Write (Full Access)</SelectItem>
                    <SelectItem value="read">Read Only (Cannot Edit/Save)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 pt-2 border-t border-zinc-100">
                <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Allowed Pages / Sections</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {[
                    { id: 'dashboard', label: 'Dashboard' },
                    { id: 'calculator', label: 'Calculator' },
                    { id: 'quotations', label: 'Quotations' },
                    { id: 'clients', label: 'Clients' },
                    { id: 'reports', label: 'Reports' },
                    { id: 'activity', label: 'Activity Log' },
                    { id: 'users', label: 'Users' },
                    { id: 'config', label: 'Configuration' },
                    { id: 'production', label: 'Production (Beltcut)' }
                  ].map(p => (
                    <label key={p.id} className="flex items-center gap-2 text-xs font-medium text-zinc-700 cursor-pointer p-1.5 hover:bg-zinc-50 rounded-lg transition-colors">
                      <input 
                        type="checkbox"
                        checked={formData.role === 'admin' || selectedPages.includes(p.id)}
                        disabled={formData.role === 'admin'}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPages([...selectedPages, p.id]);
                          } else {
                            setSelectedPages(selectedPages.filter(x => x !== p.id));
                          }
                        }}
                        className="rounded text-indigo-600 border-zinc-300 focus:ring-indigo-500 w-3.5 h-3.5"
                      />
                      <span>{p.label}</span>
                    </label>
                  ))}
                </div>
                {formData.role === 'admin' && (
                  <p className="text-[10px] text-zinc-400 italic">Administrators automatically have access to all pages.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Password</Label>
                <Input 
                  type="password" 
                  value={formData.password} 
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
              </div>
              <Button type="submit" className="w-full mt-4" disabled={isAdding}>
                <UserPlus className="h-4 w-4 mr-2" />
                {isAdding ? 'Adding...' : 'Create User'}
              </Button>
            </CardContent>
          </form>
        </Card>

        <Card className="lg:col-span-2 border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle>Existing Users</CardTitle>
            <CardDescription>View and manage all registered accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Access Level</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-zinc-100 flex items-center justify-center">
                          <UserIcon className="h-4 w-4 text-zinc-500" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium text-zinc-900">{u.name}</span>
                          <span className="text-xs text-zinc-500">@{u.username}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {u.role === 'admin' ? (
                          <Shield className="h-3.5 w-3.5 text-indigo-600" />
                        ) : (
                          <UserIcon className="h-3.5 w-3.5 text-emerald-600" />
                        )}
                        <span className={`text-xs font-semibold uppercase tracking-wider ${u.role === 'admin' ? 'text-indigo-600' : 'text-emerald-600'}`}>
                          {u.role}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border",
                        u.permission === 'read' 
                          ? "bg-amber-50 text-amber-700 border-amber-200" 
                          : "bg-blue-50 text-blue-700 border-blue-200"
                      )}>
                        {u.permission === 'read' ? 'Read Only' : 'Read & Write'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-zinc-400 hover:text-indigo-600"
                          onClick={() => handleStartEdit(u)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-zinc-400 hover:text-red-600"
                          onClick={() => handleDeleteUser(u.id, u.username)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {editingUser && (
        <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Modify Account Access</DialogTitle>
              <DialogDescription>
                Configure role, permission and allowed pages for @{editingUser.username}.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEditUser}>
              <div className="space-y-4 py-4">
                <div className="space-y-1.5">
                  <Label>Full Name</Label>
                  <Input 
                    value={editFormData.name} 
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={editFormData.role} onValueChange={(val: any) => setEditFormData({ ...editFormData, role: val })}>
                    <SelectTrigger className="border-zinc-300">
                      <SelectValue placeholder="Select Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales">Sales Person</SelectItem>
                      <SelectItem value="admin">Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Access Level / Permission</Label>
                  <Select value={editFormData.permission} onValueChange={(val: any) => setEditFormData({ ...editFormData, permission: val })}>
                    <SelectTrigger className="border-zinc-300">
                      <SelectValue placeholder="Select Access Level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="write">Read & Write (Full Access)</SelectItem>
                      <SelectItem value="read">Read Only (Cannot Edit/Save)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-zinc-100">
                  <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Allowed Pages / Sections</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {[
                      { id: 'dashboard', label: 'Dashboard' },
                      { id: 'calculator', label: 'Calculator' },
                      { id: 'quotations', label: 'Quotations' },
                      { id: 'clients', label: 'Clients' },
                      { id: 'reports', label: 'Reports' },
                      { id: 'activity', label: 'Activity Log' },
                      { id: 'users', label: 'Users' },
                      { id: 'config', label: 'Configuration' },
                      { id: 'production', label: 'Production (Beltcut)' }
                    ].map(p => (
                      <label key={p.id} className="flex items-center gap-2 text-xs font-medium text-zinc-700 cursor-pointer p-1.5 hover:bg-zinc-50 rounded-lg transition-colors">
                        <input 
                          type="checkbox"
                          checked={editFormData.role === 'admin' || editFormData.allowedPages.includes(p.id)}
                          disabled={editFormData.role === 'admin'}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditFormData({ ...editFormData, allowedPages: [...editFormData.allowedPages, p.id] });
                            } else {
                              setEditFormData({ ...editFormData, allowedPages: editFormData.allowedPages.filter(x => x !== p.id) });
                            }
                          }}
                          className="rounded text-indigo-600 border-zinc-300 focus:ring-indigo-500 w-3.5 h-3.5"
                        />
                        <span>{p.label}</span>
                      </label>
                    ))}
                  </div>
                  {editFormData.role === 'admin' && (
                    <p className="text-[10px] text-zinc-400 italic">Administrators automatically have access to all pages.</p>
                  )}
                </div>
              </div>
              <DialogFooter className="mt-4 flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-zinc-900 text-white hover:bg-zinc-800">
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
