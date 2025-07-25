import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { auth } from '../Firebase.jsx';
import { signOut } from 'firebase/auth';
import './Dashboard.css';

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [userName, setUserName] = useState('');

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        navigate('/login');
      } else {
        setUser(user);
        setUserName(user.displayName || user.email?.split('@')[0] || 'User');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  return (
    <div className="sidebar">
      <div className="logo" style={{ marginBottom: 30 }}>
        <img src="/src/Official_Logo_White.png" alt="Roversa Robotics" />
      </div>
      <nav className="nav-menu">
        <div
          className={`nav-item${location.pathname === '/dashboard' ? ' active' : ''}`}
          onClick={() => navigate('/dashboard')}
          style={{ cursor: 'pointer' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Home SVG */}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20" style={{ marginRight: 8 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
            Home
          </span>
        </div>
        <div
          className={`nav-item${location.pathname.startsWith('/sessions') ? ' active' : ''}`}
          onClick={() => navigate('/sessions')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Sessions SVG */}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20" style={{ marginRight: 8 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
            </svg>
            Sessions
          </span>
        </div>
        <div
          className={`nav-item${location.pathname.startsWith('/classrooms') ? ' active' : ''}`}
          onClick={() => navigate('/classrooms')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Classrooms SVG */}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20" style={{ marginRight: 8 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
            </svg>
            Classrooms
          </span>
        </div>
        <div
          className={`nav-item${location.pathname.startsWith('/lessons') ? ' active' : ''}`}
          onClick={() => navigate('/lessons')}
          style={{ cursor: 'pointer' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Lessons SVG */}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20" style={{ marginRight: 8 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
            </svg>
            Lessons
          </span>
        </div>
        {/* Spacer to push robotman below Lessons */}
        <div style={{ height: '170px' }} />
        {/* Robotman image directly after Lessons */}
        <div className="robotman-wrapper" style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-end', marginTop: 0, marginBottom: '0', height: '100px', marginLeft: 0, marginRight: 0 }}>
          <img src="/src/robotman.png" alt="Robotman" className="robotman-img" style={{ width: '250px', height: 'auto', display: 'block', marginLeft: '-19px' }} />
        </div>
        {/* Profile and Settings above Log out */}
        <div className="nav-item" style={{ marginTop: '-50px', cursor: 'pointer', opacity: 0.5, pointerEvents: 'none' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Profile SVG */}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20" style={{ marginRight: 8 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 19.5a7.5 7.5 0 0115 0v.75a.75.75 0 01-.75.75h-13.5a.75.75 0 01-.75-.75v-.75z" />
            </svg>
            Profile
          </span>
        </div>
        <div className="nav-item" style={{ cursor: 'pointer', opacity: 0.5, pointerEvents: 'none' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Settings SVG */}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20" style={{ marginRight: 8 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.01c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.01 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.01 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.01c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.572-1.01c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.01-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.01-2.572c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.01z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </span>
        </div>
        <div className="nav-item logout" onClick={handleSignOut}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20" style={{ marginRight: 8 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15" />
            </svg>
            Log out
          </span>
        </div>
      </nav>
    </div>
  );
}

export default Sidebar; 