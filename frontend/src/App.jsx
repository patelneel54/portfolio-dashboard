import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import { C } from './styles/theme';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('auth_token');
  return token ? children : <Navigate to="/login" />;
}

export default function App() {
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event) => {
      if (event.data?.type === 'SW_UPDATED') setShowUpdateBanner(true);
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text, fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      {showUpdateBanner && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1200,
          background: C.accent,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: '12px 16px',
          paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
          fontSize: 14,
          fontWeight: 600,
        }}>
          <span>New version available</span>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'rgba(255,255,255,0.2)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            Refresh
          </button>
        </div>
      )}
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}
