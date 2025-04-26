import React, { useState, useEffect, useMemo } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from './api/firebaseConfig';
import { ref, get } from "firebase/database";
import Login from './views/Login';
import LandingPage from './views/LandingPage';
import NavBar from './components/NavBar';
import Farm3js from './views/Farm3js';
import './index.css';

function ProtectedRoute({ user, children }) {
    if (!user) {
        return <Navigate to="/login" replace />;
    }
    return children;
}

function Layout({ user }) {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  const mainContentStyle = useMemo(() => ({
    paddingTop: user && !isLoginPage ? 'var(--navbar-height, 70px)' : '0'
  }), [user, isLoginPage]);

  return (
    <>
      {user && !isLoginPage && <NavBar user={user} />}
      <div className="main-content" style={mainContentStyle}>
        <Routes>
          <Route
            path="/"
            element={<Navigate to={user ? "/landing" : "/login"} replace />}
          />
          <Route
            path="/login"
            element={user ? <Navigate to="/landing" replace /> : <Login />}
          />
          <Route
            path="/landing"
            element={
              <ProtectedRoute user={user}>
                <LandingPage user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/farm/:assetId"
            element={
              <ProtectedRoute user={user}>
                <Farm3js user={user} />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  );
}


function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="loading-container">Loading CropWise...</div>;
  }

  return (
    <Router>
      <Layout user={user} />
    </Router>
  );
}

export default App;
