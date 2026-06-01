import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { toast } from 'sonner';
import { UserPlus, Trash2, Shield, User as UserIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const UserManagement = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    role: 'sales' as 'admin' | 'sales',
    password: '',
  });
  const [isAdding, setIsAdding] = useState(false);

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
          password: formData.password
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        toast.error(errData.error || 'Failed to create user');
        setIsAdding(false);
        return;
      }

      toast.success('User created successfully');
      setFormData({ username: '', name: '', role: 'sales', password: '' });
      fetchUsers();
    } catch (err: any) {
      console.error('Error creating user:', err);
      toast.error(`Failed to create user: ${err.message || 'Unknown error'}`);
    } finally {
      setIsAdding(false);
    }
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
                  <SelectTrigger>
                    <SelectValue placeholder="Select Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales">Sales Person</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                  </SelectContent>
                </Select>
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
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-zinc-400 hover:text-red-600"
                        onClick={() => handleDeleteUser(u.id, u.username)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
