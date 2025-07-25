import { useNavigate } from 'react-router-dom';
import './Home.css'
import { auth } from '../Firebase.jsx';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect } from 'react';
import { useState } from 'react';

function Home() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  // check if user is supposed to be on this page (logged out)
  useEffect(() => 
    {
      onAuthStateChanged(auth, (currentUser) => 
       {
         if (currentUser)
         {
           navigate('/dashboard'); // logged in already 
         }
       })
    });

  return (
    <div className="home-container">
      {/* Header */}
      <div className="home-header slide-in-from-top">
        <div className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <img src="/src/Official_Logo_White.png" alt="Roversa Robotics" />
        </div>
        <div className="header-nav">
          <button className="nav-button fade-in-scale animate-on-mount-delay-1" onClick={() => navigate('/login')}>Login</button>
        </div>
      </div>

      {/* Main Content */}
      <div className="home-content slide-in-from-bottom">
        <div className="hero-section">
          <div className="hero-content">
            <h1 className="animate-on-mount-delay-2">Welcome to Roversa Dashboard</h1>
            <div className="hero-buttons">
              <button className="secondary-btn fade-in-scale animate-on-mount-delay-3" onClick={() => navigate('/login')}>
                Sign In
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home; 