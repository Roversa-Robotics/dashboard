import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { db, auth } from '../Firebase.jsx';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import './Dashboard.css'; // We'll reuse the dashboard styling
import './Sessions.css';
import Sidebar from './Sidebar';

function Sessions() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [activeSessions, setActiveSessions] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [user, setUser] = useState(null);
  // NEW: Classroom integration
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  // NEW: Session conflict modal
  const [showSessionConflictModal, setShowSessionConflictModal] = useState(false);
  const [pendingSessionData, setPendingSessionData] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const loadClassrooms = async (user) => {
    if (!user) return;
    const docRef = doc(db, 'users', user.uid, 'appdata', 'classrooms');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      setClassrooms(docSnap.data().classrooms || []);
    } else {
      setClassrooms([]);
    }
  };

  // Helper function to get classroom name by ID
  const getClassroomName = (classroomId) => {
    if (!classroomId) return null;
    const classroom = classrooms.find(c => c.id === classroomId);
    return classroom ? classroom.name : null;
  };

  const handleCreateSession = () => {
    // Check for active session
    const savedSessions = JSON.parse(localStorage.getItem('roversaSessions') || '[]');
    const activeSession = savedSessions.find(s => s.status === 'active');
    if (activeSession) {
      setPendingSessionData({
        id: Date.now().toString(),
        name: sessionName,
        classroomId: selectedClassroomId || null,
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.email,
        status: 'active'
      });
      setShowSessionConflictModal(true);
      return;
    }
    // No active session, proceed to create
    actuallyCreateSession({
      id: Date.now().toString(),
      name: sessionName,
      classroomId: selectedClassroomId || null,
      createdAt: new Date().toISOString(),
      createdBy: auth.currentUser?.email,
      status: 'active'
    });
  };

  // Helper to actually create the session
  const actuallyCreateSession = async (newSession) => {
    const user = auth.currentUser;
    const docRef = doc(db, 'users', user.uid, 'appdata', 'sessions');
    const docSnap = await getDoc(docRef);
    let sessions = [];
    if (docSnap.exists()) {
      sessions = docSnap.data().sessions || [];
    }
    sessions.push(newSession);
    await setDoc(docRef, { sessions });
    setActiveSessions([newSession, ...activeSessions]);
    setShowCreateModal(false);
    setSessionName('');
    setSelectedClassroomId('');
    navigate(`/sessions/${newSession.id}?name=${encodeURIComponent(newSession.name)}`);
  };

  // Helper to load sessions from Firestore
  const loadSessions = async (user) => {
    if (!user) return;
    const docRef = doc(db, 'users', user.uid, 'appdata', 'sessions');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
    // Ensure all IDs are strings for comparison
      const active = (data.sessions || []).filter(s => String(s.status) === 'active');
      const paused = (data.sessions || []).filter(s => String(s.status) === 'paused');
      const recent = (data.sessions || []).filter(s => String(s.status) === 'ended');
      setActiveSessions([...active, ...paused]);
    setRecentSessions(recent);
    } else {
      setActiveSessions([]);
      setRecentSessions([]);
    }
  };

  // Helper to save sessions to Firestore
  const saveSessions = async (user, sessions) => {
    if (!user) return;
    const docRef = doc(db, 'users', user.uid, 'appdata', 'sessions');
    await setDoc(docRef, { sessions });
  };

  // Update the deleteSession handler
  const deleteSession = (sessionId) => {
    setSessionToDelete(sessionId);
    setShowDeleteModal(true);
  };

  // Check if user is logged in and set user state
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        navigate('/login');
      } else {
        setUser(user);
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // On mount, load sessions for the current user
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        navigate('/login');
      } else {
        setUser(user);
        loadSessions(user);
        loadClassrooms(user); // Load classrooms from Firestore
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // Reload sessions when the user navigates back to this page
  useEffect(() => {
    loadSessions(user);
  }, [location.pathname, user]);

  // Reload classrooms when the user changes
  useEffect(() => {
    loadClassrooms(user);
  }, [user]);

  // Combine all sessions into a single ordered list
  const allSessions = [
    ...activeSessions.filter(s => s.status === 'active'),
    ...activeSessions.filter(s => s.status === 'paused'),
    ...recentSessions
  ];

  // Filter sessions by search term (name or classroom)
  const filteredSessions = allSessions.filter(session => {
    const sessionNameMatch = session.name.toLowerCase().includes(searchTerm.toLowerCase());
    const classroomName = session.classroomId ? getClassroomName(session.classroomId) || '' : '';
    const classroomMatch = classroomName.toLowerCase().includes(searchTerm.toLowerCase());
    return sessionNameMatch || classroomMatch;
  });

  return (
    <div className="dashboard-container">
      <Sidebar className="slide-in-from-left" />
      {/* Main Content */}
      <div className="main-content slide-in-from-bottom">
        <div className="top-bar slide-in-from-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, marginBottom: 32 }}>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 700, color: '#222' }}>Sessions</h1>
          <button className="create-session-btn fade-in-scale animate-on-mount-delay-1" style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => setShowCreateModal(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Session
          </button>
        </div>

        <div className="sessions-content">
          {/* Search Bar */}
          <div style={{ marginBottom: 24, display: 'flex', width: '45%' }}>
            <div style={{ display: 'flex', alignItems: 'center', background: '#fff', borderRadius: 8, border: '1.5px solid #e0e0e0', boxShadow: '0 1px 4px rgba(65,105,225,0.04)', width: '100%', maxWidth: '100%' }}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 20, height: 20, color: '#666', marginLeft: 14, marginRight: 8 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                type="text"
                placeholder="Search sessions by name or classroom..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  padding: '10px 16px',
                  border: 'none',
                  outline: 'none',
                  fontSize: '1rem',
                  width: '100%',
                  background: 'transparent',
                  color: '#222',
                  borderRadius: 8
                }}
              />
            </div>
          </div>
          <div className="session-list">
            {filteredSessions.length > 0 ? (
              filteredSessions.map((session, index) => (
                <div 
                  key={session.id} 
                  className={`session-list-item ${session.status}-session slide-in-from-right animate-on-mount-delay-${3 + index}`}
                  onClick={() => navigate(`/sessions/${session.id}`)}
                  style={{ position: 'relative', overflow: 'hidden' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                      <span className={`status-badge ${session.status}`}>
                        {session.status === 'active' ? 'Active' : 
                         session.status === 'paused' ? 'Paused' : 
                         session.status === 'ended' ? 'Ended' : session.status}
                      </span>
                      <span style={{ fontWeight: 600, fontSize: '1.15rem', color: '#222' }}>{session.name}</span>
                      <span className="session-time" style={{ color: '#888', fontSize: 13 }}>Started: {new Date(session.createdAt).toLocaleString()}</span>
                      {session.classroomId && (
                        <span className="classroom-badge" style={{ 
                          background: '#e3eafe', 
                          color: '#4169e1', 
                          padding: '4px 8px', 
                          borderRadius: '4px', 
                          fontSize: '12px', 
                          fontWeight: '500' 
                        }}>
                          {getClassroomName(session.classroomId)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    className="delete-area"
                    onClick={e => { e.stopPropagation(); deleteSession(session.id); }}
                    title="Delete session"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="trash-icon">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </div>
                </div>
              ))
            ) : (
              searchTerm.trim() ? (
                <div className="session-list-item session-card-empty animate-on-mount-delay-3" style={{ textAlign: 'center', padding: 40 }}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="#b0b0b0" width="40" height="40" style={{ marginBottom: 12 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
                    <circle cx="12" cy="12" r="9" stroke="#b0b0b0" strokeWidth="1.5" fill="none" />
                  </svg>
                  <h3 style={{ color: '#888', fontWeight: 500 }}>No Sessions Found</h3>
                  <p style={{ color: '#bbb' }}>Try using a different query...</p>
                </div>
              ) : (
                <div className="session-list-item session-card-empty animate-on-mount-delay-3" style={{ textAlign: 'center', padding: 40 }}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="#b0b0b0" width="40" height="40" style={{ marginBottom: 12 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
                    <circle cx="12" cy="12" r="9" stroke="#b0b0b0" strokeWidth="1.5" fill="none" />
                  </svg>
                  <h3 style={{ color: '#888', fontWeight: 500 }}>No Sessions</h3>
                  <p style={{ color: '#bbb' }}>Start a new session to begin</p>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Create Session Modal */}
      {showCreateModal && (
        <div className="modal-overlay fade-in-scale" onClick={() => {
          setShowCreateModal(false);
          setSessionName('');
          setSelectedClassroomId(''); // Reset classroom selection on modal close
        }}>
          <div className="modal-content create-classroom-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Session</h2>
              <button className="modal-close" onClick={() => {
                setShowCreateModal(false);
                setSessionName('');
                setSelectedClassroomId(''); // Reset classroom selection on modal close
              }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Session Name <span style={{ color: 'red' }}>*</span></label>
                <input
                  type="text"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="Enter session name"
                  onKeyPress={(e) => e.key === 'Enter' && sessionName.trim() && handleCreateSession()}
                />
              </div>
              <div className="form-group">
                <label>Classroom (Optional)</label>
                <select
                  value={selectedClassroomId}
                  onChange={(e) => setSelectedClassroomId(e.target.value)}
                  className="form-control"
                >
                  <option value="">Select a Classroom</option>
                  {classrooms.map(classroom => (
                    <option key={classroom.id} value={classroom.id}>{classroom.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => {
                setShowCreateModal(false);
                setSessionName('');
                setSelectedClassroomId(''); // Reset classroom selection on modal close
              }}>
                Cancel
              </button>
              <button className="btn-primary"
                style={{
                  background: sessionName.trim() ? '#4169e1' : '#e0e0e0',
                  borderColor: sessionName.trim() ? '#4169e1' : '#e0e0e0',
                  color: sessionName.trim() ? '#fff' : '#b0b0b0',
                  cursor: sessionName.trim() ? 'pointer' : 'not-allowed',
                  fontFamily: 'Space Mono, monospace'
                }}
                onClick={handleCreateSession}
                disabled={!sessionName.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Conflict Modal */}
      {showSessionConflictModal && (
        <div className="modal-overlay fade-in-scale" onClick={() => {
          setShowSessionConflictModal(false);
          setPendingSessionData(null);
        }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Active Session Detected</h2>
            </div>
            <div className="modal-body">
              <p>There is already an active running session. If you create this session, the active session will be paused. Proceed?</p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => {
                setShowSessionConflictModal(false);
                setPendingSessionData(null);
              }}>
                Cancel
              </button>
              <button className="btn-primary" onClick={() => {
                // Pause the current active session
                const user = auth.currentUser;
                if (!user) return;
                const docRef = doc(db, 'users', user.uid, 'appdata', 'sessions');
                getDoc(docRef).then(docSnap => {
                  if (docSnap.exists()) {
                    const data = docSnap.data();
                    const sessions = data.sessions || [];
                    const activeSessionIndex = sessions.findIndex(s => s.status === 'active');
                if (activeSessionIndex !== -1) {
                      sessions[activeSessionIndex].status = 'paused';
                      setDoc(docRef, { sessions });
                    }
                }
                });
                setShowSessionConflictModal(false);
                if (pendingSessionData) {
                  actuallyCreateSession(pendingSessionData);
                  setPendingSessionData(null);
                }
              }}>
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-overlay fade-in-scale" onClick={() => {
          setShowDeleteModal(false);
          setSessionToDelete(null);
        }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Session</h2>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete this session? This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => {
                setShowDeleteModal(false);
                setSessionToDelete(null);
              }}>
                Cancel
              </button>
              <button className="btn-primary" style={{ background: '#dc3545', borderColor: '#dc3545' }} onClick={() => {
                // Actually delete the session
                const user = auth.currentUser;
                if (!user) return;
                const docRef = doc(db, 'users', user.uid, 'appdata', 'sessions');
                getDoc(docRef).then(docSnap => {
                  if (docSnap.exists()) {
                    const data = docSnap.data();
                    const sessions = data.sessions || [];
                    const filteredSessions = sessions.filter(s => String(s.id) !== String(sessionToDelete));
                    setDoc(docRef, { sessions: filteredSessions });
                  }
                });
                setShowDeleteModal(false);
                setSessionToDelete(null);
                loadSessions(user); // Reload the sessions
              }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Sessions; 