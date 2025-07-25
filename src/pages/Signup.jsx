import { useNavigate } from 'react-router-dom';
import './Signup.css';
import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../Firebase.jsx';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect } from 'react';
import { db } from '../Firebase.jsx';
import { doc, setDoc } from 'firebase/firestore';
import logo from '../Official_Logo_White.png';

function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const [user, setUser] = useState(null);

  const signupprocess = async () =>
  {
    try
    {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      // Store user profile in Firestore
      await setDoc(doc(db, 'users', userCredential.user.uid, 'profile'), { name, email });
      console.log('Profile written:', { name, email });
      await new Promise(res => setTimeout(res, 1000)); // 1 second delay
      navigate('/dashboard');
    }
    catch(error)
    {
      setMessage(error.message);
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
    <div className="signup-container">
      {/* Header */}
      <div className="signup-header slide-in-from-top">
        <div className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <img src={logo} alt="Roversa Robotics" />
        </div>
        <div className="header-nav">
          <button className="nav-button fade-in-scale animate-on-mount-delay-1" onClick={() => navigate('/login')}>Login</button>
        </div>
      </div>

      {/* Main Content */}
      <div className="signup-content slide-in-from-bottom">
        <div className="signup-card fade-in-scale animate-on-mount-delay-2">
          <div className="signup-title animate-on-mount-delay-3">
            <h1>Create Account</h1>
            <p>Let's make your classroom experience easy</p>
          </div>

          {message && (
            <div className="error-message animate-on-mount-delay-4">
              {message}
            </div>
          )}

          <div className="signup-form">
            <div className="input-group animate-on-mount-delay-4">
              <label htmlFor="name">Name</label>
              <input 
                type="text" 
                id="name"
                placeholder="Enter your name" 
                className="signup-input" 
                value={name} 
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="input-group animate-on-mount-delay-5">
              <label htmlFor="email">Email</label>
              <input 
                type="email" 
                id="email"
                placeholder="Enter your email" 
                className="signup-input" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="input-group animate-on-mount-delay-6">
              <label htmlFor="password">Password</label>
              <input 
                type="password" 
                id="password"
                placeholder="Create a password" 
                className="signup-input" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button className="signup-submit-btn fade-in-scale animate-on-mount-delay-7" onClick={signupprocess}>
              Create Account
            </button>
          </div>
          
          <div className="login-link animate-on-mount-delay-8">
            <p>Already have an account? <button className="link-button" onClick={() => navigate('/login')}>Sign in</button></p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Signup; 