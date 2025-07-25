import { useState } from 'react'
import { HashRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Sessions from './pages/Sessions';
import SessionView from './pages/SessionView';
import Classrooms from './pages/Classrooms';
import Lessons from './pages/Lessons';
import { auth } from './Firebase.jsx'
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useRef } from 'react';
import { disconnectSerial } from './serialManager';
import './App.css';
import './fonts.css';

function AppRoutes() {
  const location = useLocation();
  const prevLocation = useRef(location);
  
  useEffect(() => {
    // Only disconnect serial when leaving a session view page
    const wasOnSessionView = prevLocation.current.pathname.match(/^\/sessions\/[^/]+$/);
    const isOnSessionView = location.pathname.match(/^\/sessions\/[^/]+$/);
    
    if (wasOnSessionView && !isOnSessionView) {
      // We're leaving a session view page
      window.location.reload();
    }
    
    prevLocation.current = location;
  }, [location]);
  
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/sessions" element={<Sessions />} />
      <Route path="/sessions/:sessionId" element={<SessionView />} />
      <Route path="/classrooms" element={<Classrooms />} />
      <Route path="/lessons" element={<Lessons />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <div className="App">
        <AppRoutes />
      </div>
    </Router>
  );
}

export default App;
