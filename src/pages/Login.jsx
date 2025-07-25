import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../Firebase.jsx';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect } from 'react';
import './Login.css';

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const [user, setUser] = useState(null);

  const loginprocess = async () => 
  {
    try 
    {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      // No need to store userData in localStorage; use auth.currentUser
      navigate('/dashboard');
    } 
    catch(error) 
    {
      setError('Invalid login credentials');
    }
  };

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
    <div className="login-container">
      {/* Header */}
      <div className="login-header slide-in-from-top">
        <div className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <img src="/src/Official_Logo_White.png" alt="Roversa Robotics" />
        </div>
        <div className="header-nav">
          <button className="nav-button active fade-in-scale animate-on-mount-delay-1">Login</button>
        </div>
      </div>

      {/* Main Content */}
      <div className="login-content slide-in-from-bottom">
        <div className="login-card fade-in-scale animate-on-mount-delay-2">
          <div className="login-title animate-on-mount-delay-3">
            <h1>Welcome Back</h1>
            <p>Sign in to your Roversa Dashboard</p>
          </div>

          {error && (
            <div className="error-message animate-on-mount-delay-4">
              {error}
            </div>
          )}

          <div className="login-form">
            <div className="input-group animate-on-mount-delay-4">
              <label htmlFor="email">Email</label>
              <input 
                type="email" 
                id="email"
                placeholder="Enter your email" 
                className="login-input" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="input-group animate-on-mount-delay-5">
              <label htmlFor="password">Password</label>
              <input 
                type="password" 
                id="password"
                placeholder="Enter your password" 
                className="login-input" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
              />
            </div>

            <button className="login-submit-btn fade-in-scale animate-on-mount-delay-6" onClick={loginprocess}>
              Sign In
            </button>
          </div>
          
          <div className="signup-link animate-on-mount-delay-7">
            <p>Don't have an account? <button className="link-button" onClick={() => navigate('/signup')}>Sign up</button></p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login; 