"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRoleSelection, setShowRoleSelection] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [isDevelopment, setIsDevelopment] = useState(false);
  const router = useRouter();

  // Check if we're in development mode (client-side)
  useEffect(() => {
    setIsDevelopment(
      typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    );
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Redirect based on role
        if (data.user.role === 'MANAGER_AGENT') {
          // Show role selection modal
          setShowRoleSelection(true);
          setUserData(data.user);
        } else if (data.user.role === 'MANAGER') {
          router.push('/manager');
        } else if (data.user.role === 'AGENT') {
          router.push('/agent');
        }
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Test mode for local development (bypasses authentication)
  const handleTestMode = async () => {
    setIsLoading(true);
    setError('');
    try {
      // Call test mode API to get a valid JWT token
      const response = await fetch('/api/auth/test-mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Set agent email in localStorage
        localStorage.setItem('agentEmail', 'test@example.com');
        
        // Redirect to agent page (cookie is set by API)
        router.push('/agent');
      } else {
        setError(data.error || 'Failed to enable test mode');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-900 to-black flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img 
            src="/golden-companies-logo.jpeg" 
            alt="Golden Companies" 
            className="h-20 w-auto mx-auto mb-4"
          />
          <h1 className="text-2xl font-semibold text-white">Welcome Back</h1>
          <p className="text-white/60">Sign in to your account</p>
        </div>

        {/* Login Form */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-white/80 mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Enter your email"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-white/80 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Enter your password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Signing In...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Test Mode Button (for local development) */}
          {isDevelopment && (
            <div className="mt-4">
              <button
                type="button"
                onClick={handleTestMode}
                disabled={isLoading}
                className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🧪 Test Mode (No Login Required)
              </button>
            </div>
          )}

          <div className="mt-6 text-center">
            <p className="text-white/40 text-sm">
              Need help? Contact your administrator
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-white/30 text-xs">
            © 2024 Golden Customer Care. All rights reserved.
          </p>
        </div>

        {/* Role Selection Modal */}
        {showRoleSelection && userData && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-neutral-800 border border-white/10 rounded-xl p-6 w-full max-w-md">
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-white mb-2">Choose Your Role</h2>
                <p className="text-white/60 text-sm">
                  Welcome back, {userData.name || userData.email}!<br />
                  Which role would you like to access?
                </p>
              </div>

              <div className="space-y-4">
                <button
                  onClick={() => {
                    setShowRoleSelection(false);
                    router.push('/manager');
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-3"
                >
                  <span className="text-xl">👔</span>
                  Manager Dashboard
                </button>
                
                <button
                  onClick={() => {
                    setShowRoleSelection(false);
                    router.push('/agent');
                  }}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-3"
                >
                  <span className="text-xl">💼</span>
                  Agent Portal
                </button>
              </div>

              <div className="mt-6 text-center">
                <button
                  onClick={() => {
                    setShowRoleSelection(false);
                    setUserData(null);
                  }}
                  className="text-white/60 hover:text-white text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
