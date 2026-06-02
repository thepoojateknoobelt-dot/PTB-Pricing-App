import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  login: (userData: User) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 🟢 Relative API endpoint internally resolves to the same host/port in local/production.
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Query the same-origin backend directly
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setUser(data.user);
            localStorage.setItem('ptb_user', JSON.stringify(data.user));
            return;
          }
        } else if (res.status === 401) {
          // If explicitly unauthorized, clear the session and force login
          localStorage.removeItem('ptb_user');
          setUser(null);
          return;
        }
        
        // If server says offline or other status (not 401), we do local check
        const storedUser = localStorage.getItem('ptb_user');
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('Auth check failed, using local fallback', err);
        // Fallback to offline local storage (unreachable server scenario)
        const storedUser = localStorage.getItem('ptb_user');
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  const login = (userData: User) => {
    localStorage.setItem('ptb_user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = async () => {
    try {
      // Direct same-origin request for logout
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout API failed', err);
    }
    localStorage.removeItem('ptb_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};