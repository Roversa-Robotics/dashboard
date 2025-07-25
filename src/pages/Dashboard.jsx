import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { auth } from '../Firebase.jsx';
import { signOut } from 'firebase/auth';
import { db } from '../Firebase.jsx';
import { doc, getDoc } from 'firebase/firestore';
import './Dashboard.css';
import Sidebar from './Sidebar';
import DashboardCalendar from './DashboardCalendar';
import chargingStationImg from '/src/chargingstation.png';
import dashboardBatteryDesign from '/src/dashboardbatterydesign.png';
import excitedFlowerImg from '/src/excited_flower.png';
import myrobots from '../myrobots.png';
import myclassrooms from '../myclassrooms.png';
import accessguides from '../accessguides.png';

function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [userName, setUserName] = useState('');
  const [recentSessions, setRecentSessions] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [pausedSessions, setPausedSessions] = useState([]);
  const [robotsNeedingCharge, setRobotsNeedingCharge] = useState([]);
  const [showRobotActivityModal, setShowRobotActivityModal] = useState(false);
  const modalRef = useRef();

  // BatteryBar and getRobotStatus helpers from SessionView.jsx
  function BatteryBar({ voltage, cardHeight = 60 }) {
    const minV = 3.3;
    const maxV = 5;
    let percent = 0;
    if (typeof voltage === 'number') {
      percent = Math.max(0, Math.min(1, (voltage - minV) / (maxV - minV)));
    }
    const percentText = `${Math.round(percent * 100)}%`;
    let barColor = '#4caf50';
    if (percent < 0.2) barColor = '#f44336';
    else if (percent < 0.5) barColor = '#ff9800';
    return (
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '30px', background: 'transparent', borderBottomLeftRadius: 16, borderBottomRightRadius: 16, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px' }}>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', background: barColor, width: `${percent * 100}%`, transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)' }} />
        <div style={{ fontSize: '11px', fontWeight: '600', color: '#666', zIndex: 1, textAlign: 'center' }}>
          {percentText} 2 {voltage ? `${voltage.toFixed(2)}V` : ' 14'}
        </div>
      </div>
    );
  }
  function getRobotStatus({ lastBatteryTime, firstBatteryTime, lastProgramTime }, now = new Date()) {
    if (!lastBatteryTime || ((now - new Date(lastBatteryTime)) / 1000 > 10)) {
      return 'inactive_battery';
    }
    if (lastProgramTime && ((now - new Date(lastProgramTime)) / 1000 <= 180)) {
      return 'active';
    }
    if (lastProgramTime && ((now - new Date(lastProgramTime)) / 1000 > 180)) {
      return 'inactive';
    }
    if (!lastProgramTime && firstBatteryTime && ((now - new Date(firstBatteryTime)) / 1000 > 180)) {
      return 'inactive';
    }
    return 'inactive_battery';
  }

  // Helper to get assignment (student/group) for a robot
  function getAssignment(robot) {
    if (robot.assignedTo && typeof robot.assignedTo === 'object') {
      if (robot.assignedTo.name) return robot.assignedTo.name;
      if (robot.assignedTo.group) return robot.assignedTo.group;
    }
    if (robot.assignedTo) return robot.assignedTo;
    return 'Unassigned';
  }

  // Modal close on outside click
  useEffect(() => {
    if (!showRobotActivityModal) return;
    function handleClickOutside(event) {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        setShowRobotActivityModal(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showRobotActivityModal]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  useEffect(() => {
    // Load sessions from Firestore for the current user
    const loadSessions = async (user) => {
      if (!user) return;
      const docRef = doc(db, 'users', user.uid, 'appdata', 'sessions');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setActiveSessions((data.sessions || []).filter(s => String(s.status) === 'active'));
        setPausedSessions((data.sessions || []).filter(s => String(s.status) === 'paused'));
        const recent = (data.sessions || []).filter(s => String(s.status) === 'ended');
        recent.sort((a, b) => new Date(b.endedAt || b.createdAt) - new Date(a.endedAt || a.createdAt));
        setRecentSessions(recent.slice(0, 3)); // Show up to 3 recent sessions
        // Aggregate robots from all sessions, keeping session context
        let robotsNeedingChargeList = [];
        (data.sessions || []).forEach(session => {
          if (session.robots) {
            Object.entries(session.robots).forEach(([deviceId, robot]) => {
              if (!robot.batteryData || typeof robot.batteryData.voltage !== 'number') return;
              const status = getRobotStatus(robot);
              if (robot.batteryData.voltage < 3.7 || status === 'inactive_battery') {
                robotsNeedingChargeList.push({
                  sessionName: session.name,
                  sessionId: session.id,
                  deviceId,
                  robot
                });
              }
            });
          }
        });
        setRobotsNeedingCharge(robotsNeedingChargeList);
      } else {
        setActiveSessions([]);
        setPausedSessions([]);
        setRecentSessions([]);
        setRobotsNeedingCharge([]);
      }
    };
    // Load user profile name from Firestore
    const loadUserName = async (user) => {
      if (!user) return;
      try {
        const profileRef = doc(db, 'users', user.uid, 'profile');
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          const profile = profileSnap.data();
          console.log('Profile loaded:', profile);
          if (profile.name && profile.name.trim() !== '') {
            setUserName(profile.name);
            return;
          }
        }
      } catch (e) {}
      setUserName(user.email?.split('@')[0] || 'User');
    };
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        navigate('/login');
      } else {
        setUser(user);
        loadUserName(user);
        loadSessions(user);
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  return (
    <div className="dashboard-container">
      <Sidebar className="slide-in-from-left" />

      {/* Robot Activity Modal (moved outside main-content for full overlay) */}
      {showRobotActivityModal && (
        <div className="modal-overlay" onClick={() => setShowRobotActivityModal(false)}>
          <div
            className="modal-content"
            ref={modalRef}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 500, width: '90%', maxHeight: '80vh', overflowY: 'auto', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
          >
            <div className="modal-header">
              <h2 style={{ fontSize: '1.5rem', fontWeight: 400, color: '#222', fontFamily: 'Inter, sans-serif', textAlign: 'center', margin: 0 }}>Low Battery Robots</h2>
            </div>
            <div className="modal-body" style={{ width: '100%' }}>
              {robotsNeedingCharge.length === 0 ? (
                <div style={{ color: '#888', fontSize: 16, fontFamily: 'Open Sans, sans-serif', fontWeight: 400, textAlign: 'center', margin: '32px 0' }}>All robots are sufficiently charged</div>
              ) : (
                <div className="robot-cards-container" style={{ display: 'flex', flexWrap: 'wrap', gap: 24, width: '100%', justifyContent: 'center', alignItems: 'flex-start' }}>
                  {robotsNeedingCharge.map(({ sessionName, sessionId, deviceId, robot }, idx) => {
                    const minV = 3.3;
                    const maxV = 5;
                    let percent = 0;
                    if (typeof robot.batteryData?.voltage === 'number') {
                      percent = Math.max(0, Math.min(1, (robot.batteryData.voltage - minV) / (maxV - minV)));
                    }
                    const percentText = `${Math.round(percent * 100)}%`;
                    const assignment = getAssignment(robot);
                    return (
                      <div key={sessionId + '-' + deviceId} className="robot-card" style={{ width: 320, minHeight: 70, background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px rgba(65, 105, 225, 0.08)', border: '2px solid #e0e0e0', padding: '16px 20px', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', position: 'relative', textAlign: 'left', gap: 8 }}>
                        <div className="robot-card-info" style={{ width: '70%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                          <div style={{ fontWeight: 700, color: '#4169e1', fontSize: 16, marginBottom: 2, letterSpacing: 0.5 }}>{deviceId}</div>
                          <div style={{ color: '#555', fontWeight: 500, fontSize: 13, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{assignment}</div>
                          <div style={{ color: '#888', fontWeight: 400, fontSize: 12, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sessionName}</div>
                        </div>
                        <div style={{ color: '#d32f2f', fontWeight: 700, fontSize: 20, minWidth: 80, textAlign: 'right' }}>{percentText}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="main-content dashboard-home-main-content slide-in-from-bottom">
        <div className="dashboard-header slide-in-from-top">
          <h1 className="dashboard-welcome" style={{ fontFamily: 'Bevan, serif', fontWeight: 400 }}>
            Welcome, {userName}!
          </h1>
          <div className="dashboard-subtitle">Control the Classroom. Ignite the Circuit.</div>
        </div>

        {/* Main cards and Active Sessions grouped in the same container */}
        <div style={{ width: '100%' }}>
          <div className="dashboard-cards-row" style={{ display: 'flex', gap: 24, marginBottom: 0, paddingBottom: 0 }}>
            {/* My Sessions card */}
            <div className="dashboard-card fade-in-scale animate-on-mount-delay-1" onClick={() => navigate('/sessions')} style={{ flex: '1 1 320px', minWidth: 250, maxWidth: 250 }}>
              <img src={myrobots} alt="My Sessions" className="dashboard-card-bg" />
              <div className="dashboard-card-content">
                <div className="dashboard-card-title">My Sessions</div>
                <div className="dashboard-card-desc">View and manage active sessions</div>
              </div>
            </div>
            {/* My Classrooms card */}
            <div className="dashboard-card fade-in-scale animate-on-mount-delay-3" onClick={() => navigate('/classrooms')} style={{ flex: '1 1 320px', minWidth: 250, maxWidth: 250 }}>
              <img src={myclassrooms} alt="My Classrooms" className="dashboard-card-bg" />
              <div className="dashboard-card-content">
                <div className="dashboard-card-title">My Classrooms</div>
                <div className="dashboard-card-desc">Manage your students and groups</div>
              </div>
            </div>
            {/* Access Lessons card */}
            <div className="dashboard-card fade-in-scale animate-on-mount-delay-4" onClick={() => navigate('/lessons')} style={{ flex: '1 1 320px', minWidth: 250, maxWidth: 250 }}>
              <img src={accessguides} alt="Access Lessons" className="dashboard-card-bg" />
              <div className="dashboard-card-content">
                <div className="dashboard-card-title">Access Lessons</div>
                <div className="dashboard-card-desc">View and manage lessons</div>
              </div>
            </div>
            {/* Calendar card moved here */}
            <div className="dashboard-calendar-card animate-on-mount-delay-5" style={{ minWidth: 220, maxWidth: 320, marginLeft: 12, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <DashboardCalendar sessions={[...activeSessions, ...pausedSessions, ...recentSessions]} />
            </div>
          </div>
          {/* Combined Active Sessions and Recent Sessions in one row */}
          <div style={{ display: 'flex', flexDirection: 'row', gap: 30, width: '100%', marginTop: 0, alignItems: 'flex-start' }}>
            {/* Monitor Current Robot Activity Card (replaces Robots Needing Charging) */}
            <div style={{ minWidth: 180, maxWidth: 240, marginLeft: 0, padding: 0, background: '#fff', border: '1.5px solid #e0e0e0', boxShadow: '0 1px 4px rgba(65,105,225,0.04)', borderRadius: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden', marginTop: '-32px' }}>
              <div style={{ width: '100%', background: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 0 0 0', position: 'relative', minHeight: 120 }}>
                {/* Pink design background */}
                <img src={dashboardBatteryDesign} alt="Battery Design" style={{ position: 'absolute', top: -50, left: 0, width: '100%', height: 200, objectFit: 'cover', zIndex: 1, pointerEvents: 'none', borderTopLeftRadius: 20, borderTopRightRadius: 20 }} />
                {/* Charging station image */}
                <img src={chargingStationImg} alt="Charging Station" style={{ width: 170, height: 140, objectFit: 'cover', marginBottom: 10, zIndex: 400, position: 'relative' }} />
              </div>
              <div style={{ padding: '0 14px 14px 14px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#222', margin: '12px 0 6px 0', fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>Time to Charge?</h2>
                <div style={{ color: '#555', fontSize: '0.80rem', fontFamily: 'Inter, sans-serif', fontWeight: 400, textAlign: 'center', marginBottom: 14, maxWidth: 200 }}>
                  Monitor your robots' battery life while they're in use.
                </div>
                <button
                  style={{
                    background: '#ff7a1a',
                    color: '#fff',
                    fontWeight: 700,
                    fontFamily: 'Bevan, serif',
                    fontSize: '0.85rem',
                    border: 'none',
                    borderRadius: 10,
                    padding: '10px 0',
                    width: '100%',
                    marginTop: 6,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                    outline: 'none',
                    letterSpacing: 0.5,
                  }}
                  onClick={() => setShowRobotActivityModal(true)}
                >
                  See Activity
                </button>
              </div>
            </div>
            {/* Active Sessions section (right) */}
            <div style={{ flex: 1, minWidth: 340, maxWidth: 520, marginTop: '-32px' }}>
              <div className="dashboard-card active-sessions-section fade-in-scale animate-on-mount-delay-2" style={{ padding: 0, width: '100%', marginBottom: 8, marginTop: 0, display: 'flex', flexDirection: 'column', background: '#fff6fa', border: '2px solid #fff', borderRadius: 20 }}>
                {/* Move title and description above session-list */}
                <div style={{ padding: '22px 28px 0 28px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <img src={excitedFlowerImg} alt="Excited Flower" style={{ width: 80, height: 105, marginRight: 8, marginBottom: 20, marginLeft: -10, flexShrink: 0 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <h2 style={{ fontSize: '2rem', fontWeight: 700, color: '#222', marginBottom: 6, fontFamily: 'Inter, sans-serif', textAlign: 'left' }}>Active Sessions</h2>
                    <div style={{ color: '#555', fontSize: '0.85rem', marginBottom: 25, fontFamily: 'Open Sans, sans-serif', textAlign: 'left' }}>
                      Continue or manage your currently running or paused sessions
                    </div>
                  </div>
                </div>
                <div className="session-list" style={{ padding: '0 28px 0 28px', width: '100%', marginTop: 6 }}>
                  {[...activeSessions, ...pausedSessions].length > 0 ? (
                    [...activeSessions, ...pausedSessions].map((session, index) => (
                      <div
                        key={session.id}
                        className={`session-list-item ${session.status}-session`}
                        onClick={() => navigate(`/sessions/${session.id}`)}
                        style={{
                          position: 'relative',
                          overflow: 'hidden',
                          marginBottom: 10,
                          borderRadius: 8,
                          background: '#fff',
                          border: '1.5px solid #e0e0e0',
                          boxShadow: '0 1px 4px rgba(65,105,225,0.04)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '14px 24px',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          minWidth: 0,
                          width: '100%',
                          boxSizing: 'border-box',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 18, minWidth: 0 }}>
                          <span className={`status-badge ${session.status}`} style={{ fontSize: 13, padding: '3px 12px', borderRadius: 5, marginRight: 8, marginLeft: 8, marginTop: 18, flexShrink: 0 }}>
                            {session.status === 'active' ? 'Active' : session.status === 'paused' ? 'Paused' : session.status}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: '1.18rem', color: '#222', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{session.name}</span>
                          <span className="session-time" style={{ color: '#888', fontSize: '0.93rem', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
                            Started: {new Date(session.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        {session.status === 'paused' && (
                          null
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="session-list-item session-card-empty animate-on-mount-delay-2" style={{ textAlign: 'center', padding: 40, color: '#888', fontFamily: 'inherit' }}>
                      <h3 style={{ color: '#888', fontWeight: 500, fontSize: '1.1rem' }}>No Active or Paused Sessions</h3>
                      <p style={{ color: '#bbb', fontSize: 14 }}>Start or resume a session to see it here.</p>
                    </div>
                  )}
                </div>
                <div style={{ margin: '10px 28px 18px 0', textAlign: 'right' }}>
                  <button
                    style={{
                      background: '#ff7a1a',
                      color: '#fff',
                      fontWeight: 700,
                      fontFamily: 'Bevan, serif',
                      fontSize: '0.75rem',
                      border: 'none',
                      borderRadius: 10,
                      padding: '12px 0',
                      width: '100%',
                      marginTop: 8,
                      marginRight: 28,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                      outline: 'none',
                      letterSpacing: 0.5,
                    }}
                    onClick={() => navigate('/sessions')}
                  >
                    View All Sessions
                  </button>
                </div>
              </div>
            </div>
            {/* Recent Sessions section (right) */}
            <div className="dashboard-calendar-card animate-on-mount-delay-5" style={{ minWidth: 220, maxWidth: 320, marginTop: '20px', marginLeft: 20, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              {/* Only Recent Sessions below, calendar has moved above */}
              <div className="recent-sessions-section" style={{ marginTop: 0 }}>
                <h2 className="recent-sessions-title" style={{ fontSize: '1.5rem', fontWeight: 700, color: '#222', marginBottom: 6 }}>Recent Sessions</h2>
                <div className="recent-sessions-subtitle" style={{ color: '#555', fontSize: '0.85rem', marginBottom: 24 }}>
                  View student progress on most recently assigned sessions
                </div>
                <div className="recent-sessions-list">
                  {recentSessions.length > 0 ? (
                    recentSessions.map((session, index) => {
                      const block = session.block || session.blockName || (session.classroomBlock ? session.classroomBlock : null);
                      const dateObj = new Date(session.endedAt || session.createdAt);
                      const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'long' });
                      return (
                        <div 
                          key={session.id} 
                          className={`recent-session-card slide-in-from-right animate-on-mount-delay-${5 + index}`}
                          onClick={() => navigate(`/sessions/${session.id}`)}
                          style={{ cursor: 'pointer', position: 'relative' }}
                        >
                          {/* Ended status badge removed */}
                          <div className="recent-session-card-main">
                            <div className="recent-session-card-info">
                              <div className="recent-session-card-title" style={{ fontWeight: 700, fontSize: '1.18rem', color: '#222', marginBottom: 4 }}>{session.name}</div>
                              <div className="recent-session-card-meta" style={{ color: '#888', fontSize: '1.02rem', marginBottom: 10 }}>
                                <span>{dateStr}</span>
                                {block && <span className="dot-separator">•</span>}
                                {block && <span>{block}</span>}
                              </div>
                              {/* Progress bar (static for now) */}
                              <div className="recent-session-progress-bar">
                                <div className="recent-session-progress-bar-inner" />
                                <div className="recent-session-progress-dot" />
                              </div>
                            </div>
                            <div className="recent-session-card-menu">
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="12" cy="5" r="1.5" fill="#888" />
                                <circle cx="12" cy="12" r="1.5" fill="#888" />
                                <circle cx="12" cy="19" r="1.5" fill="#888" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="recent-session-item no-sessions animate-on-mount-delay-5">No recent sessions</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard; 