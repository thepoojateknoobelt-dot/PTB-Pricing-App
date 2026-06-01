import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  login: (userData: User) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 🟢 AAPKA LIVE AWS LAMBDA URL LOCK KAR DIYA HAI
const LAMBDA_API_URL = "https://srdxqwkta6dm6c6wwd7xy7fetu0iezmh.lambda-url.ap-south-1.on.aws/";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Direct live AWS Lambda URL par request bhej rahe hain
        const res = await fetch(`${LAMBDA_API_URL}auth/me`);
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setUser(data.user);
            localStorage.setItem('ptb_user', JSON.stringify(data.user));
            return;
          }
        }
        
        // Agar server offline ya unauthorized kahe, toh local check karenge
        const storedUser = localStorage.getItem('ptb_user');
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('Auth check failed, using local fallback', err);
        // Fallback to offline local storage
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
      // Direct live AWS Lambda URL par logout request
      await fetch(`${LAMBDA_API_URL}auth/logout`, { method: 'POST' });
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