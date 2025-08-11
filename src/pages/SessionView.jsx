import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { auth } from '../Firebase.jsx';
import { signOut } from 'firebase/auth';
import { db } from '../Firebase.jsx';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import './Dashboard.css';
import './Sessions.css';
import './SessionView.css';
import {
  setSerialPort,
  getSerialPort,
  setSerialReader,
  getSerialReader,
  disconnectSerial
} from '../serialManager';
import Sidebar from './Sidebar';
import playImg from '../play.png';
import testImg from '../test.png';
import forwardImg from '../forward.png';
import rightImg from '../right.png';
import reverseImg from '../reverse.png';
import leftImg from '../left.png';
import connectionGraphic from '../connectiongraphic.png';
import robotGraphic from '../robotgraphic.png';

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
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '28px',
        background: 'transparent',
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 16,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 12px'
      }}
    >
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: barColor,
          width: `${percent * 100}%`,
          transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)'
        }}
      />
      <div style={{ 
        fontSize: '11px',
        fontWeight: '600',
        color: '#666',
        zIndex: 1,
        textAlign: 'center'
      }}>
        {percentText + ' Charged'}
      </div>
    </div>
  );
}

// Add date formatting helper
function formatDateTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  return date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// Add a helper function for robot status
function getRobotStatus({ lastBatteryTime, firstBatteryTime, lastProgramTime }, now = new Date()) {
  // If no battery message within past 5 seconds, powered off
  if (!lastBatteryTime || ((now - lastBatteryTime) / 1000 > 5)) {
    return 'inactive_battery';
  }
  // If first battery message is over 3 minutes old and no program has ever been run/tested, then inactive
  if (!lastProgramTime && firstBatteryTime && ((now - firstBatteryTime) / 1000 > 180)) {
    return 'inactive';
  }
  // If no program within the past 3 minutes, inactive
  if (lastProgramTime && ((now - lastProgramTime) / 1000 > 180)) {
    return 'inactive';
  }
  // If recent program (within 3 minutes), active
  if (lastProgramTime && ((now - lastProgramTime) / 1000 <= 180)) {
    return 'active';
  }
  // Default fallback
  return 'idle';
}

// Helper to calculate program duration
function getProgramDuration(programText) {
  if (!programText) return 0;
  const commands = programText.trim().toLowerCase().split(/\s+/);
  let duration = 4000;
  for (const cmd of commands) {
    if (cmd === 'forward' || cmd === 'reverse') duration += 1500;
    else if (cmd === 'left' || cmd === 'right') duration += 1000;
  }
  return duration;
}

// Add this helper at the top (or near other helpers)
function isValidUrl(url) {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Helper to load sessions from Firestore
const loadSessions = async (user) => {
  if (!user) return [];
  const docRef = doc(db, 'users', user.uid, 'appdata', 'sessions');
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data().sessions || [];
  }
  return [];
};

// Helper to save sessions to Firestore
const saveSessions = async (user, sessions) => {
  if (!user) return;
  const docRef = doc(db, 'users', user.uid, 'appdata', 'sessions');
  await setDoc(docRef, { sessions });
};

function SessionView() {
  const [runningPrograms, setRunningPrograms] = useState({});
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const location = useLocation();
  // Helper to get query params
  const getQueryParam = (key) => {
    const params = new URLSearchParams(location.search);
    return params.get(key);
  };
  const initialSessionName = getQueryParam('name') || `Session ${new Date().toLocaleDateString()}`;
  const [isConnected, setIsConnected] = useState(false);
  const [receivedData, setReceivedData] = useState([]);
  const [robots, setRobots] = useState({}); // Map of deviceId -> robot data
  const [selectedRobot, setSelectedRobot] = useState(null); // Currently selected robot for detailed view
  const [sessionStatus, setSessionStatus] = useState('active'); // 'active', 'paused', 'ended'
  const [sessionName, setSessionName] = useState(initialSessionName);
  const [sessionData, setSessionData] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // Track last saved state to compare for actual changes
  const [lastSavedState, setLastSavedState] = useState(null);
  // NEW: Classroom integration
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [selectedRobotForAssignment, setSelectedRobotForAssignment] = useState(null);
  // NEW: Robot selection for tagging
  const [selectedRobotsForTagging, setSelectedRobotsForTagging] = useState(new Set());
  const [showTagModal, setShowTagModal] = useState(false);
  // NEW: Search functionality for robots
  const [robotSearchTerm, setRobotSearchTerm] = useState('');
  // NEW: Track completed robots for lesson progress
  const [completedRobots, setCompletedRobots] = useState(new Set());
  // NEW: Data log search
  const [dataLogSearchTerm, setDataLogSearchTerm] = useState('');
  // NEW: Section minimization states
  const [minimizedSections, setMinimizedSections] = useState({
    connection: false,
    lessonProgress: false,
    robotsAndPrograms: false,
    dataReceived: true
  });
  // NEW: Robot details popup state
  const [showRobotDetailsPopup, setShowRobotDetailsPopup] = useState(false);
  const [selectedRobotForPopup, setSelectedRobotForPopup] = useState(null);
  // NEW: Highlight state for programs and robots
  const [highlightedRobot, setHighlightedRobot] = useState(null);
  const [highlightedProgram, setHighlightedProgram] = useState(null);
  const highlightTimeoutRef = useRef();
  const [user, setUser] = useState(() => auth.currentUser);
  useEffect(() => {
  const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
    setUser(firebaseUser);
  });
  return () => unsubscribe();
  }, []);
  // Tab state for session view
  const [activeTab, setActiveTab] = useState('main'); // 'main' or 'notes'
  const [sessionNotes, setSessionNotes] = useState('');
  const [notesFormatting, setNotesFormatting] = useState({
    bold: false,
    italic: false,
    underline: false,
    color: '#000000'
  });
  const [hasTextSelection, setHasTextSelection] = useState(false);
  const notesTextareaRef = useRef(null);

  // Remove activeTab state since we're removing tabs

  // Track if component is mounted
  const isMounted = useRef(false);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // NEW: Add click outside handler for dropdown menus
  useEffect(() => {
    const handleClickOutside = (event) => {
      const dropdowns = document.querySelectorAll('.dropdown');
      dropdowns.forEach(dropdown => {
        const menu = dropdown.querySelector('.dropdown-menu');
        if (menu && menu.style.display === 'block') {
          if (!dropdown.contains(event.target)) {
            menu.style.display = 'none';
          }
        }
      });
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // NEW: Load classrooms from Firestore
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

  // NEW: Get classroom by ID
  const getClassroomById = (classroomId) => {
    if (!classroomId) return null;
    const classroom = classrooms.find(c => String(c.id) === String(classroomId));
    console.log('getClassroomById:', { classroomId, classrooms: classrooms.length, found: classroom });
    return classroom;
  };

  // NEW: Toggle section minimization
  const toggleSection = (sectionName) => {
    setMinimizedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }));
  };

  // NEW: Handle classroom change
  const handleClassroomChange = async (newClassroomId) => {
    if (!sessionData) return;
    
    // Handle the "no-classroom" special case
    if (newClassroomId === 'no-classroom') {
      newClassroomId = null;
    }
    
    // Check if there's an actual change
    const currentClassroomId = sessionData.classroomId;
    const hasActualClassroomChange = currentClassroomId !== newClassroomId;
    
    // Store the new classroom selection without immediately applying it
    setSelectedClassroom(newClassroomId ? getClassroomById(newClassroomId) : null);
    
    // Only set hasUnsavedChanges if there's an actual change
    if (hasActualClassroomChange) {
      setHasUnsavedChanges(true);
      
      // Update session data with new classroom (but don't clear robots yet)
      const updatedSessionData = {
        ...sessionData,
        classroomId: newClassroomId || null
      };
      setSessionData(updatedSessionData);
    }
  };

  // NEW: Apply classroom change and save session
  const applyClassroomChange = async () => {
    if (!sessionData || !user) return;
    
    try {
      // Clear all robot assignments when classroom changes
      const updatedRobots = {};
      Object.keys(robots).forEach(deviceId => {
        updatedRobots[deviceId] = {
          ...robots[deviceId],
          assignedTo: null,
          assignedToType: null,
          assignedToName: null
        };
      });
      
      setRobots(updatedRobots);
      
      // Save the session with the new classroom and cleared robots
      const savedSessions = await loadSessions(user);
      const sessionIndex = savedSessions.findIndex(s => String(s.id) === String(sessionId));
      
      if (sessionIndex !== -1) {
        const updatedSession = {
          ...savedSessions[sessionIndex],
          classroomId: selectedClassroom?.id || null,
          robots: updatedRobots
        };
        
        savedSessions[sessionIndex] = updatedSession;
        await saveSessions(user, savedSessions);
        
        // Update session data
        setSessionData(updatedSession);
        
        // Update lastSavedState to reflect the new state
        const newLastSavedState = {
          robots: updatedRobots,
          receivedData: receivedData,
          sessionName: sessionName,
          completedRobots: completedRobots,
          sessionNotes: sessionNotes,
          classroomId: selectedClassroom?.id || null
        };
        setLastSavedState(newLastSavedState);
        
        // Reset the selectedClassroom to clear the dropdown
        setSelectedClassroom(null);
        
        // Clear the unsaved changes flag
        setHasUnsavedChanges(false);
        
        console.log('Classroom change applied successfully');
      }
    } catch (error) {
      console.error('Error applying classroom change:', error);
    }
  };

  // NEW: Clear all robot assignments
  const clearAllRobotAssignments = () => {
    const updatedRobots = {};
    Object.keys(robots).forEach(deviceId => {
      updatedRobots[deviceId] = {
        ...robots[deviceId],
        assignedTo: null,
        assignedToType: null,
        assignedToName: null
      };
    });
    
    setRobots(updatedRobots);
    setHasUnsavedChanges(true);
  };

  // Function to check if current state differs from last saved state
  const hasActualChanges = () => {
    if (!lastSavedState) return false;
    
    // Compare robots data
    const currentRobotsKeys = Object.keys(robots);
    const savedRobotsKeys = Object.keys(lastSavedState.robots || {});
    
    if (currentRobotsKeys.length !== savedRobotsKeys.length) return true;
    
    // Check if any robot data has changed
    for (const key of currentRobotsKeys) {
      if (!lastSavedState.robots[key] || 
          JSON.stringify(robots[key]) !== JSON.stringify(lastSavedState.robots[key])) {
        return true;
      }
    }
    
    // Compare received data
    if (receivedData.length !== (lastSavedState.receivedData || []).length) return true;
    
    // Compare session name
    if (sessionName !== lastSavedState.sessionName) return true;
    
    // Compare session notes
    if (sessionNotes !== (lastSavedState.sessionNotes || '')) return true;
    
    // Compare completed robots
    const currentCompletedArray = Array.from(completedRobots);
    const savedCompletedArray = Array.from(lastSavedState.completedRobots || []);
    if (currentCompletedArray.length !== savedCompletedArray.length) return true;
    
    for (const robotId of currentCompletedArray) {
      if (!savedCompletedArray.includes(robotId)) return true;
    }
    
    // Compare classroom ID
    const currentClassroomId = sessionData?.classroomId;
    const savedClassroomId = lastSavedState.classroomId;
    if (currentClassroomId !== savedClassroomId) return true;
    
    return false;
  };

  // Update hasUnsavedChanges based on actual changes
  useEffect(() => {
    const hasChanges = hasActualChanges();
    setHasUnsavedChanges(hasChanges);
  }, [robots, receivedData, sessionName, completedRobots, sessionNotes, sessionData]);


  // Only load session data on first mount
  const hasLoadedSessionRef = useRef(false);
  useEffect(() => {
    if (!hasLoadedSessionRef.current && sessionId && user) {
      hasLoadedSessionRef.current = true;
      setIsLoadingSession(true);
      setSessionLoadError(null);
      loadSessions(user).then(savedSessions => {
        const found = savedSessions.find(s => String(s.id) === String(sessionId));
        if (found) {
          setSessionData(found);
          setSessionName(found.name);
          setSessionStatus(found.status);
          setRobots(found.robots || {});
          setReceivedData(found.receivedData || {});
          setCompletedRobots(new Set(found.completedRobots || []));
          setLessonCompletions(found.lessonCompletions ? Object.fromEntries(Object.entries(found.lessonCompletions).map(([k, v]) => [k, new Set(v)])) : {});
          setSessionNotes(found.sessionNotes || '');
          setIsLoadingSession(false);
          
          // Initialize lastSavedState with loaded session data
          setLastSavedState({
            robots: found.robots || {},
            receivedData: found.receivedData || {},
            sessionName: found.name,
            sessionNotes: found.sessionNotes || '',
            completedRobots: new Set(found.completedRobots || []),
            lessonCompletions: found.lessonCompletions ? Object.fromEntries(Object.entries(found.lessonCompletions).map(([k, v]) => [k, new Set(v)])) : {},
            classroomId: found.classroomId || null
          });
          
          // Don't initialize selectedClassroom - let it start as null to show "Select Classroom..."
        } else {
          setIsLoadingSession(false);
          setSessionLoadError('Session not found.');
          setTimeout(() => navigate('/sessions'), 2000);
        }
      }).catch(err => {
        setIsLoadingSession(false);
        setSessionLoadError('Error loading session.');
      });
    }
  }, [sessionId, user, navigate]);

  // NEW: Load classrooms on mount and when user changes
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        loadClassrooms(user);
      } else {
        setClassrooms([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Don't automatically set selectedClassroom - let it start as null

  // Function to handle leaving the session view
  const handleLeaveSession = useCallback(async () => {
    try {
      // Only save if session is active and sessionData exists
      if (sessionStatus === 'active' && sessionData && sessionData.id) {
        loadSessions(user).then(savedSessions => {
          const updatedSession = {
            ...sessionData,
            name: sessionName,
            status: sessionStatus,
            robots: robots,
            receivedData: receivedData,
            completedRobots: Array.from(completedRobots),
            lessonCompletions: Object.fromEntries(
              Object.entries(lessonCompletions).map(([k, v]) => [k, Array.from(v)])
            ),
            sessionNotes: sessionNotes,
            lastUpdated: new Date().toISOString()
          };
          const existingIndex = savedSessions.findIndex(s => String(s.id) === String(sessionData.id));
          if (existingIndex >= 0) {
            savedSessions[existingIndex] = updatedSession;
          } else {
            savedSessions.push(updatedSession);
          }
          saveSessions(user, savedSessions);
          // Update last saved state after successful save
          setLastSavedState({
            robots: robots,
            receivedData: receivedData,
            sessionName: sessionName,
            sessionNotes: sessionNotes,
            completedRobots: completedRobots,
            lessonCompletions: Object.fromEntries(
              Object.entries(lessonCompletions).map(([k, v]) => [k, Array.from(v)])
            )
          });
        });
      }
      // Disconnect from micro:bit if connected
      if (isConnected) {
        try {
          await disconnectFromMicrobit();
        } catch (error) {
          console.error('Error disconnecting micro:bit:', error);
          // Continue even if disconnection fails
        }
      }
    } catch (error) {
      console.error('Error in handleLeaveSession:', error);
      // Continue even if there's an error
    }
    // Indicate completion
    return;
  }, [sessionStatus, sessionData?.id, sessionName, isConnected]);

  const handleSignOut = async () => {
    try {
      await handleLeaveSession();
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const [showSerialPopup, setShowSerialPopup] = useState(false);

  const connectToMicrobit = async () => {
    if (sessionStatus !== 'active') return; // Prevent connection if paused or ended
    setShowSerialPopup(true);
    try {
      const selectedPort = await navigator.serial.requestPort();
      await selectedPort.open({ baudRate: 115200 });
      setSerialPort(selectedPort);
      setIsConnected(true);

      const textDecoder = new TextDecoderStream();
      selectedPort.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      setSerialReader(reader);
    } catch (error) {
      console.error('Error connecting to micro:bit:', error);
      setIsConnected(false);
    } finally {
      setShowSerialPopup(false);
    }
  };

  const disconnectFromMicrobit = async () => {
    // Save session before disconnecting
    if (sessionStatus === 'active' && sessionData && sessionData.id) {
      await new Promise(resolve => {
        loadSessions(user).then(savedSessions => {
          const updatedSession = {
            ...sessionData,
            name: sessionName,
            status: sessionStatus,
            robots,
            receivedData,
            completedRobots: Array.from(completedRobots),
            lessonCompletions: Object.fromEntries(
              Object.entries(lessonCompletions).map(([k, v]) => [k, Array.from(v)])
            ),
            sessionNotes: sessionNotes,
            lastUpdated: new Date().toISOString()
          };
          const existingIndex = savedSessions.findIndex(s => String(s.id) === String(sessionData.id));
          if (existingIndex >= 0) {
            savedSessions[existingIndex] = updatedSession;
          } else {
            savedSessions.push(updatedSession);
          }
          saveSessions(user, savedSessions).then(resolve);
        });
      });
    }
    setIsConnected(false);
    await new Promise(resolve => setTimeout(resolve, 100));
    await disconnectSerial();
    window.location.reload();
  };

  // Parse and update robot state
  const handleSerialLine = (line) => {
    if (line && line.trim().length > 0) {
      const timestamp = new Date().toISOString();
      const data = line.trim();
      
      // Parse the incoming data format from microbit receiver
      // Format: "deviceId batteryLevel" or "deviceId buttonName program"
      const parts = data.split(' ');
      
      if (parts.length >= 2) {
        const deviceId = parts[0];
        // Ignore deviceIds longer than 10 characters
        if (deviceId.length > 10) {
          return;
        }
        
        // Check if second part is a number (battery message)
        if (parts.length === 2 && !isNaN(parseFloat(parts[1]))) {
          const batteryLevel = parseFloat(parts[1]);
          
          // Create parsed data object for battery
          const parsedData = {
            type: 'battery',
            voltage: batteryLevel,
            timestamp: timestamp
          };
          
          // Update robots state
          setRobots(prev => ({
            ...prev,
            [deviceId]: {
              ...prev[deviceId],
              deviceId,
              lastSeen: timestamp,
              dataCount: (prev[deviceId]?.dataCount || 0) + 1,
              latestData: parsedData,
              rawData: data,
              firstSeen: prev[deviceId]?.firstSeen || timestamp,
              status: prev[deviceId]?.status || 'inactive',
              batteryData: { voltage: batteryLevel, timestamp },
              lastBatteryTime: timestamp,
              firstBatteryTime: prev[deviceId]?.firstBatteryTime || timestamp,
              buttonEvents: prev[deviceId]?.buttonEvents || [],
              assignedTo: prev[deviceId]?.assignedTo || null,
              assignmentTime: prev[deviceId]?.assignmentTime || null
            }
          }));
          
          // Also add to received data for the log view
          setReceivedData(prev => [ ...(Array.isArray(prev) ? prev : []), { timestamp, data } ]);
          
          // Immediately save data when new data is received
          setTimeout(() => autosaveSession(), 100);
        }
        // Check if second part is a button name (button message)
        else if (parts.length >= 2 && ['PLAY', 'TEST'].includes(parts[1])) {
          const buttonName = parts[1];
          const program = parts.slice(2).join(' '); // Join remaining parts as program
          
          // Create parsed data object for button event
          const parsedData = {
            type: 'button_event',
            button: buttonName,
            program: program || null,
            timestamp: timestamp
          };
          
          // Update robots state
          setRobots(prev => ({
            ...prev,
            [deviceId]: {
              deviceId,
              lastSeen: timestamp,
              dataCount: (prev[deviceId]?.dataCount || 0) + 1,
              latestData: parsedData,
              rawData: data,
              firstSeen: prev[deviceId]?.firstSeen || timestamp,
              status: prev[deviceId]?.status || 'inactive', // PRESERVE STATUS
              // Preserve existing battery data
              batteryData: prev[deviceId]?.batteryData || prev[deviceId]?.latestData?.voltage ? { voltage: prev[deviceId]?.latestData?.voltage } : null,
              // Track button events specifically
              buttonEvents: [
                ...(prev[deviceId]?.buttonEvents || []),
                {
                  button: buttonName,
                  program: program || null,
                  timestamp: timestamp
                }
              ].slice(-10), // Keep last 10 button events
              // Preserve assignment
              assignedTo: prev[deviceId]?.assignedTo || null,
              assignmentTime: prev[deviceId]?.assignmentTime || null
            }
          }));
          
          // Also add to received data for the log view
          setReceivedData(prev => [ ...(Array.isArray(prev) ? prev : []), { timestamp, data } ]);
          
          // Immediately save data when new data is received
          setTimeout(() => autosaveSession(), 100);
          // Set running program duration
          const duration = getProgramDuration(program);
          setRunningPrograms(prev => ({
            ...prev,
            [deviceId]: Date.now() + duration
          }));
        } else {
          // Fallback to old parsing method for backward compatibility
          const deviceId = extractDeviceId(data);
          const parsedData = parseRobotData(data);
          
          // Update robots state
          setRobots(prev => ({
            ...prev,
            [deviceId]: {
              ...prev[deviceId],
              deviceId,
              lastSeen: timestamp,
              dataCount: (prev[deviceId]?.dataCount || 0) + 1,
              latestData: parsedData,
              rawData: data,
              firstSeen: prev[deviceId]?.firstSeen || timestamp,
              status: prev[deviceId]?.status || 'inactive',
              batteryData: prev[deviceId]?.batteryData || null, // Preserve existing battery data instead of using undefined batteryLevel
              lastBatteryTime: prev[deviceId]?.lastBatteryTime || timestamp,
              buttonEvents: prev[deviceId]?.buttonEvents || [],
              assignedTo: prev[deviceId]?.assignedTo || null,
              assignmentTime: prev[deviceId]?.assignmentTime || null
            }
          }));
          
          // Also add to received data for the log view
          setReceivedData(prev => [ ...(Array.isArray(prev) ? prev : []), { timestamp, data } ]);
          
          // Immediately save data when new data is received
          setTimeout(() => autosaveSession(), 100);
        }
      }
    }
  };

  const clearData = () => {
    if (!window.confirm('Are you sure you want to clear all robot data and received data? This cannot be undone.')) return;
    setReceivedData([]);
    setRobots({});
    // Do NOT update lastSavedState here!
  };

  const clearRobots = () => {
    if (!window.confirm('Are you sure you want to clear all robots? This cannot be undone.')) return;
    setRobots({});
    setCompletedRobots(new Set());
    // Update last saved state to reflect the cleared robots
    setLastSavedState(prev => ({
      ...prev,
      robots: {},
      completedRobots: new Set()
    }));
  };

  // 1. Add hardcoded lessons and new state for lesson selection and completion
  const DEFAULT_LESSONS = [
    { id: 'lesson1', name: 'I Feel' },
    { id: 'lesson2', name: 'Hungry, Hungry Robot' },
    { id: 'lesson3', name: 'Grid Challenges' },
    { id: 'lesson4', name: 'Duck Duck Robot' },
  ];
  const [lessons, setLessons] = useState(() => {
    let loaded = [];
    try {
      const saved = localStorage.getItem('roversaLessons');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          loaded = parsed.map(l => ({
            id: l.id,
            name: l.title || l.name || '',
            link: l.link || '',
          }));
        }
      }
    } catch {}
    // Merge with defaults, avoid duplicates by id
    const merged = [...DEFAULT_LESSONS];
    loaded.forEach(l => {
      if (!merged.some(def => def.id === l.id)) merged.push(l);
    });
    // Always add 'None' at the top
    return [{ id: 'none', name: 'None' }, ...merged];
  });
  const [selectedLessonId, setSelectedLessonId] = useState('none');
  // Map of lessonId -> Set of completed robotIds
  const [lessonCompletions, setLessonCompletions] = useState(() => {
    const initial = {};
    lessons.forEach(lesson => { initial[lesson.id] = new Set(); });
    return initial;
  });
  const [activeLessonTab, setActiveLessonTab] = useState('none');

  // If lessons change (e.g. user adds a lesson in another tab), update completions map
  useEffect(() => {
    setLessonCompletions(prev => {
      const updated = { ...prev };
      lessons.forEach(lesson => {
        if (!updated[lesson.id]) updated[lesson.id] = new Set();
      });
      // Remove completions for deleted lessons
      Object.keys(updated).forEach(id => {
        if (!lessons.some(l => l.id === id)) delete updated[id];
      });
      return updated;
    });
  }, [lessons]);

  // Optionally, update lessons if localStorage changes (e.g. user creates a lesson in another tab)
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'roversaLessons') {
        let loaded = [];
        try {
          const saved = localStorage.getItem('roversaLessons');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
              loaded = parsed.map(l => ({
                id: l.id,
                name: l.title || l.name || '',
                link: l.link || '',
              }));
            }
          }
        } catch {}
        const merged = [...DEFAULT_LESSONS];
        loaded.forEach(l => {
          if (!merged.some(def => def.id === l.id)) merged.push(l);
        });
        setLessons([{ id: 'none', name: 'None' }, ...merged]);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Replace toggleRobotCompletion to be per-lesson
  const toggleRobotCompletion = (deviceId) => {
    setLessonCompletions(prev => {
      const updated = { ...prev };
      const setCopy = new Set(updated[selectedLessonId]);
      if (setCopy.has(deviceId)) {
        setCopy.delete(deviceId);
      } else {
        setCopy.add(deviceId);
      }
      updated[selectedLessonId] = setCopy;
      // Persist to Firestore and reload session
      if (sessionData && sessionData.id) {
        // Convert sets to arrays for Firestore
        const completionsToSave = Object.fromEntries(
          Object.entries(updated).map(([k, v]) => [k, Array.from(v)])
        );
        const updatedSession = { ...sessionData, lessonCompletions: completionsToSave };
        loadSessions(user).then(async sessions => {
          const idx = sessions.findIndex(s => String(s.id) === String(sessionData.id));
          if (idx >= 0) {
            sessions[idx] = updatedSession;
          } else {
            sessions.push(updatedSession);
          }
          await saveSessions(user, sessions);
          // Reload session from Firestore
          const freshSessions = await loadSessions(user);
          const found = freshSessions.find(s => String(s.id) === String(sessionData.id));
          if (found && found.lessonCompletions) {
            setLessonCompletions(
              Object.fromEntries(
                Object.entries(found.lessonCompletions).map(([k, v]) => [k, new Set(v)])
              )
            );
          }
        });
      }
      return updated;
    });
  };

  const pauseSession = useCallback(() => {
    if (!sessionData) {
      console.error('Cannot pause session: sessionData is null');
      return;
    }
    
    const pausedSession = {
      ...sessionData,
      name: sessionName,
      status: 'paused',
      robots: robots,
      receivedData: receivedData,
      sessionNotes: sessionNotes,
      pausedAt: new Date().toISOString()
    };
    
    // Save to localStorage
    loadSessions(user).then(savedSessions => {
      const existingIndex = savedSessions.findIndex(s => String(s.id) === String(sessionData.id));
      if (existingIndex >= 0) {
        savedSessions[existingIndex] = pausedSession;
      } else {
        savedSessions.push(pausedSession);
      }
      saveSessions(user, savedSessions);
      setSessionStatus('paused');
      setSessionData(pausedSession);
      setHasUnsavedChanges(false);
      // Update last saved state after pausing session
      setLastSavedState({
        robots: robots,
        receivedData: receivedData,
        sessionName: sessionName,
        sessionNotes: sessionNotes,
        completedRobots: completedRobots,
        lessonCompletions: Object.fromEntries(
          Object.entries(lessonCompletions).map(([k, v]) => [k, Array.from(v)])
        )
      });
    });
  }, [sessionData, sessionName, robots, receivedData, sessionNotes]);

  const [showEndSessionModal, setShowEndSessionModal] = useState(false);

  // Handler for End Session button
  const handleEndSessionClick = () => {
    setShowEndSessionModal(true);
  };

  // Remove the confirm from endSession
  const endSession = () => {
    if (isConnected) {
      disconnectFromMicrobit();
    }
    if (!sessionData) {
      console.error('Cannot end session: sessionData is null');
      return;
    }
    const endedSession = {
      ...sessionData,
      name: sessionName,
      status: 'ended',
      robots: robots,
      receivedData: receivedData,
      completedRobots: Array.from(completedRobots),
      lessonCompletions: Object.fromEntries(
        Object.entries(lessonCompletions).map(([k, v]) => [k, Array.from(v)])
      ),
      sessionNotes: sessionNotes,
      endedAt: new Date().toISOString()
    };
    loadSessions(user).then(savedSessions => {
      const existingIndex = savedSessions.findIndex(s => String(s.id) === String(sessionData.id));
      if (existingIndex >= 0) {
        savedSessions[existingIndex] = endedSession;
      } else {
        savedSessions.push(endedSession);
      }
      saveSessions(user, savedSessions);
      setSessionStatus('ended');
      setSessionData(endedSession);
      setHasUnsavedChanges(false);
      setLastSavedState({
        robots: robots,
        receivedData: receivedData,
        sessionName: sessionName,
        sessionNotes: sessionNotes,
        completedRobots: completedRobots,
        lessonCompletions: Object.fromEntries(
          Object.entries(lessonCompletions).map(([k, v]) => [k, Array.from(v)])
        )
      });
    });
  };

  const resumeSession = () => {
    if (!sessionData) {
      console.error('Cannot resume session: sessionData is null');
      return;
    }
    
    const resumedSession = {
      ...sessionData,
      name: sessionName,
      status: 'active',
      robots: robots,
      receivedData: receivedData,
      completedRobots: Array.from(completedRobots),
      lessonCompletions: Object.fromEntries(
        Object.entries(lessonCompletions).map(([k, v]) => [k, Array.from(v)])
      ),
      sessionNotes: sessionNotes,
      resumedAt: new Date().toISOString()
    };
    
    // Save to localStorage
    loadSessions(user).then(savedSessions => {
      const existingIndex = savedSessions.findIndex(s => String(s.id) === String(sessionData.id));
      if (existingIndex >= 0) {
        savedSessions[existingIndex] = resumedSession;
      } else {
        savedSessions.push(resumedSession);
      }
      saveSessions(user, savedSessions);
      setSessionStatus('active');
      setSessionData(resumedSession);
      setHasUnsavedChanges(false);
      // Update last saved state after resuming session
      setLastSavedState({
        robots: robots,
        receivedData: receivedData,
        sessionName: sessionName,
        sessionNotes: sessionNotes,
        completedRobots: completedRobots,
        lessonCompletions: Object.fromEntries(
          Object.entries(lessonCompletions).map(([k, v]) => [k, Array.from(v)])
        )
      });
    });
  };

  const deleteSession = () => {
    setShowDeleteModal(true);
  };

  const handleRobotClick = (deviceId) => {
    setSelectedRobotForPopup(deviceId);
    setShowRobotDetailsPopup(true);
  };

  // Filter received data for selected robot
  const getRobotData = (deviceId) => {
    return receivedData.filter(item => {
      // Handle new format: "deviceId batteryLevel" or "deviceId BUTTON program"
      const parts = item.data.split(' ');
      if (parts.length >= 1) {
        const itemDeviceId = parts[0];
        return itemDeviceId === deviceId;
      }
      
      // Fallback to old extraction method for backward compatibility
      const itemDeviceId = extractDeviceId(item.data);
      return itemDeviceId === deviceId;
    });
  };

  // NEW: Get robot-specific programs
  const getRobotPrograms = (deviceId) => {
    const robot = robots[deviceId];
    if (!robot || !robot.buttonEvents) return [];
    
    return robot.buttonEvents
      .filter(event => event.program && event.program.trim())
      .map(event => ({
        deviceId,
        robotName: robot.assignedTo ? robot.assignedTo.name : deviceId,
        button: event.button,
        program: event.program,
        timestamp: event.timestamp,
        robot: robot
      }))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  };

  // NEW: Get latest program for a robot
  const getLatestProgram = (deviceId) => {
    const programs = getRobotPrograms(deviceId);
    return programs.length > 0 ? programs[0] : null;
  };

  // NEW: Get robot-specific logs
  const getRobotLogs = (deviceId) => {
    return receivedData.filter(item => {
      const parts = item.data.split(' ');
      if (parts.length >= 1) {
        const itemDeviceId = parts[0];
        return itemDeviceId === deviceId;
      }
      const itemDeviceId = extractDeviceId(item.data);
      return itemDeviceId === deviceId;
    });
  };

  // Check if user is logged in
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) return;
      
      // Load lessons from Firestore
      const docRef = doc(db, 'users', user.uid, 'appdata', 'lessons');
      const docSnap = await getDoc(docRef);
      let loaded = [];
      if (docSnap.exists()) {
        const data = docSnap.data().lessons || [];
        loaded = data.map(l => ({
          id: l.id,
          name: l.title || l.name || '',
          link: l.link || '',
        }));
      }
      
      // If session has a classroom, use classroom-specific lessons
      if (sessionData && sessionData.classroomId) {
        const classroom = getClassroomById(sessionData.classroomId);
        if (classroom) {
          const classroomLessons = classroom.lessons || [];
          const classroomLessonIds = classroomLessons.map(l => l.id);
          
          // Filter loaded lessons to only include classroom lessons
          const filteredLessons = loaded.filter(l => classroomLessonIds.includes(l.id));
          
          // Only include lessons that are specifically assigned to the classroom
          setLessons([{ id: 'none', name: 'None' }, ...filteredLessons]);
        } else {
          // Classroom not found, use all lessons
          const merged = [...DEFAULT_LESSONS];
          loaded.forEach(l => {
            if (!merged.some(def => def.id === l.id)) merged.push(l);
          });
          setLessons([{ id: 'none', name: 'None' }, ...merged]);
        }
      } else {
        // Use all lessons if no classroom is associated
        const merged = [...DEFAULT_LESSONS];
        loaded.forEach(l => {
          if (!merged.some(def => def.id === l.id)) merged.push(l);
        });
        setLessons([{ id: 'none', name: 'None' }, ...merged]);
      }
    });
    return () => unsubscribe();
  }, [sessionData]);

  // Update session data when robots or received data changes
  useEffect(() => {
    if (sessionData) {
      setSessionData(prev => ({
        ...prev,
        robots: robots,
        receivedData: receivedData,
        completedRobots: Array.from(completedRobots)
      }));
    }
  }, [robots, receivedData, completedRobots, sessionData?.id]);

  // Autosave when session name changes
  useEffect(() => {
    if (sessionStatus === 'active' && sessionName) {
      autosaveSession();
    }
  }, [sessionName]);

  useEffect(() => {
    if (!isConnected) return;
    
    let isCancelled = false;
    let buffer = '';
    
    const readSerial = async () => {
      // Wait 1 second before starting to read
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const reader = getSerialReader();
      while (!isCancelled) {
        try {
          const { value, done } = await reader.read();
          if (done) break;
          
          if (value) {
            buffer += value;
            const lines = buffer.split('\n');
            buffer = lines.pop(); // keep incomplete line in buffer
            
            // Process complete lines
            for (let line of lines) {
              if (!isCancelled) {
                handleSerialLine(line);
              }
            }
          }
        } catch (error) {
          console.error('Error reading serial data:', error);
          break;
        }
      }
    };
    
    readSerial();
    
    return () => { 
      isCancelled = true; 
    };
  }, [isConnected]);

  // Add a setInterval-based inactivity status check
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setRobots(prev => {
        let changed = false;
        const updated = { ...prev };
        Object.keys(updated).forEach(deviceId => {
          const robot = updated[deviceId];
          // Parse timestamps
          let lastBatteryTime = robot.lastBatteryTime ? new Date(robot.lastBatteryTime) : null;
          if (lastBatteryTime && isNaN(lastBatteryTime.getTime())) {
            lastBatteryTime = Date.parse(robot.lastBatteryTime) ? new Date(Date.parse(robot.lastBatteryTime)) : null;
          }
          let firstBatteryTime = robot.firstBatteryTime ? new Date(robot.firstBatteryTime) : null;
          if (firstBatteryTime && isNaN(firstBatteryTime.getTime())) {
            firstBatteryTime = Date.parse(robot.batteryData.timestamp) ? new Date(Date.parse(robot.batteryData.timestamp)) : null;
          }
          let lastProgramTime = null;
          if (robot.buttonEvents && robot.buttonEvents.length > 0) {
            for (let i = robot.buttonEvents.length - 1; i >= 0; i--) {
              const evt = robot.buttonEvents[i];
              if (evt && evt.timestamp) {
                const t = new Date(evt.timestamp);
                if (!isNaN(t.getTime())) {
                  lastProgramTime = t;
                  break;
                }
              }
            }
          }
          console.log('Status check', deviceId, {
            lastBatteryTime: robot.lastBatteryTime,
            parsed: robot.lastBatteryTime ? new Date(robot.lastBatteryTime) : null,
            now,
            diff: robot.lastBatteryTime ? (now - new Date(robot.lastBatteryTime)) / 1000 : null,
            firstBatteryTime: robot.firstBatteryTime,
            parsedFirst: robot.firstBatteryTime ? new Date(robot.firstBatteryTime) : null,
            lastProgramTime: robot.buttonEvents && robot.buttonEvents.length > 0 ? robot.buttonEvents[robot.buttonEvents.length - 1].timestamp : null
          });
          const newStatus = getRobotStatus({ lastBatteryTime, firstBatteryTime, lastProgramTime }, now);
          if (robot.status !== newStatus) {
            updated[deviceId] = { ...robot, status: newStatus };
            changed = true;
          }
        });
        return changed ? updated : prev;
      });
    }, 2000); // check every 2 seconds
    return () => clearInterval(interval);
  }, []);

  // Frequent autosave every 5 seconds
  useEffect(() => {
    const autosaveInterval = setInterval(() => {
      if (sessionStatus === 'active' && sessionData) {
        autosaveSession();
      }
    }, 5000);

    return () => clearInterval(autosaveInterval);
  }, [sessionStatus, sessionData?.id]);

  // Disconnect from micro:bit on page unload/refresh
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (sessionStatus === 'active' && sessionData && sessionData.id) {
        // Save session data to localStorage synchronously
        localStorage.setItem('unsavedSession', JSON.stringify({
          ...sessionData,
          name: sessionName,
          status: sessionStatus,
          robots,
          receivedData,
          completedRobots: Array.from(completedRobots),
          lessonCompletions: Object.fromEntries(
            Object.entries(lessonCompletions).map(([k, v]) => [k, Array.from(v)])
          ),
          sessionNotes: sessionNotes,
          lastUpdated: new Date().toISOString()
        }));
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [sessionStatus, sessionData, sessionName, robots, receivedData, completedRobots, lessonCompletions, sessionNotes]);

  // Autosave active session to localStorage (guarded, only when mounted)
  useEffect(() => {
    if (
      isMounted.current &&
      sessionStatus === 'active' &&
      sessionData &&
      sessionData.id
    ) {
      loadSessions(user).then(savedSessions => {
        const existingIndex = savedSessions.findIndex(s => String(s.id) === String(sessionData.id));
        if (existingIndex >= 0) {
          // Only update if the session is still active in storage
          if (savedSessions[existingIndex].status === 'active') {
            savedSessions[existingIndex] = {
              ...sessionData,
              name: sessionName,
              status: sessionStatus,
              robots: robots,
              receivedData: receivedData,
              completedRobots: Array.from(completedRobots),
              lessonCompletions: Object.fromEntries(
                Object.entries(lessonCompletions).map(([k, v]) => [k, Array.from(v)])
              ),
              sessionNotes: sessionNotes
            };
            saveSessions(user, savedSessions);
          }
        }
      });
    }
  }, [sessionName, sessionStatus, sessionData?.id]);

  // Dedicated autosave function
  const autosaveSession = () => {
    try {
      if ((sessionStatus === 'active' || sessionStatus === 'paused' || sessionStatus === 'ended') && sessionData && sessionData.id) {
        loadSessions(user).then(savedSessions => {
          const updatedSession = {
            ...sessionData,
            name: sessionName,
            status: sessionStatus,
            robots: robots,
            receivedData: receivedData,
            sessionNotes: sessionNotes,
            completedRobots: Array.from(completedRobots),
            lessonCompletions: Object.fromEntries(
              Object.entries(lessonCompletions).map(([k, v]) => [k, Array.from(v)])
            ),
            lastUpdated: new Date().toISOString()
          };
          const existingIndex = savedSessions.findIndex(s => String(s.id) === String(sessionData.id));
          if (existingIndex >= 0) {
            savedSessions[existingIndex] = updatedSession;
          } else {
            savedSessions.push(updatedSession);
          }
          saveSessions(user, savedSessions);
          // Update last saved state after successful save
          setLastSavedState({
            robots: robots,
            receivedData: receivedData,
            sessionName: sessionName,
            sessionNotes: sessionNotes,
            completedRobots: completedRobots,
            lessonCompletions: Object.fromEntries(
              Object.entries(lessonCompletions).map(([k, v]) => [k, Array.from(v)])
            )
          });
        });
      }
    } catch (error) {
      console.error('Error in autosaveSession:', error);
    }
  };

  // Helper function to generate a color from device ID
  const getRobotColor = (deviceId) => {
    let hash = 0;
    for (let i = 0; i < deviceId.length; i++) {
      hash = deviceId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 60%)`;
  };

  // Helper function to extract device ID from serial data
  const extractDeviceId = (data) => {
    // Try different patterns for device ID extraction
    // Pattern 1: Look for hex values (8+ characters)
    const hexPattern = /[0-9A-Fa-f]{8,}/g;
    const hexMatches = data.match(hexPattern);
    if (hexMatches && hexMatches.length > 0) {
      return hexMatches[0].toUpperCase();
    }
    
    // Pattern 2: Look for device ID in format "device:XXXX" or "id:XXXX"
    const devicePattern = /(?:device|id)[:\s]*([0-9A-Fa-f]+)/i;
    const deviceMatch = data.match(devicePattern);
    if (deviceMatch) {
      return deviceMatch[1].toUpperCase();
    }
    
    // Pattern 3: Look for any 4+ character hex string
    const shortHexPattern = /[0-9A-Fa-f]{4,}/g;
    const shortHexMatches = data.match(shortHexPattern);
    if (shortHexMatches && shortHexMatches.length > 0) {
      return shortHexMatches[0].toUpperCase();
    }
    
    // If no pattern matches, use a hash of the data as device ID
    return `UNKNOWN_${data.slice(0, 8).replace(/[^0-9A-Za-z]/g, '')}`;
  };

  // Helper function to parse robot data
  const parseRobotData = (data) => {
    // Try to extract sensor values, commands, or other data
    const parts = data.split(/[,\s]+/);
    const parsed = {};
    
    parts.forEach((part, index) => {
      if (part.includes('=')) {
        const [key, value] = part.split('=');
        parsed[key.trim()] = value.trim();
      } else if (part.includes(':')) {
        const [key, value] = part.split(':');
        parsed[key.trim()] = value.trim();
      } else if (index === 0 && !part.match(/[0-9A-Fa-f]{4,}/)) {
        // First part might be a command or sensor name
        parsed.command = part;
      } else if (!isNaN(part)) {
        // Numeric value
        parsed[`value${index}`] = parseFloat(part);
      }
    });
    
    return parsed;
  };

  // NEW: Filter robots based on search term
  const getFilteredRobots = () => {
    if (!robotSearchTerm.trim()) {
      return robots;
    }
    
    const searchTerm = robotSearchTerm.toLowerCase();
    const filtered = {};
    
    Object.entries(robots).forEach(([deviceId, robot]) => {
      // Search by device ID
      if (deviceId.toLowerCase().includes(searchTerm)) {
        filtered[deviceId] = robot;
        return;
      }
      
      // Search by assignment tags
      if (robot.assignedTo) {
        const assignmentText = robot.assignedTo.name.toLowerCase();
        if (assignmentText.includes(searchTerm)) {
          filtered[deviceId] = robot;
          return;
        }
        
        // Search by student email if available
        if (robot.assignedTo.email && robot.assignedTo.email.toLowerCase().includes(searchTerm)) {
          filtered[deviceId] = robot;
          return;
        }
        
        // Search by group student count
        if (robot.assignedTo.studentCount && robot.assignedTo.studentCount.toString().includes(searchTerm)) {
          filtered[deviceId] = robot;
          return;
        }
      }
    });
    
    return filtered;
  };

  // NEW: Robot assignment functions
  const assignRobotToStudent = async (deviceId, studentId) => {
    if (!sessionData?.classroomId) return;
    const classroom = getClassroomById(sessionData.classroomId);
    if (!classroom) return;
    
    const student = classroom.students.find(s => s.id === studentId);
    if (!student) return;
    const updatedRobots = {
      ...robots,
      [deviceId]: {
        ...robots[deviceId],
        assignedTo: {
          type: 'student',
          id: student.id,
          name: student.name,
          email: student.email
        },
        assignmentTime: new Date().toISOString()
      }
    };
    setRobots(updatedRobots);
    // Persist to Firestore and reload session
    if (sessionData && sessionData.id) {
      const updatedSession = { ...sessionData, robots: updatedRobots };
      loadSessions(user).then(async sessions => {
        const idx = sessions.findIndex(s => String(s.id) === String(sessionData.id));
        if (idx >= 0) {
          sessions[idx] = updatedSession;
        } else {
          sessions.push(updatedSession);
        }
        await saveSessions(user, sessions);
        // Reload session from Firestore
        const freshSessions = await loadSessions(user);
        const found = freshSessions.find(s => String(s.id) === String(sessionData.id));
        if (found) setRobots(found.robots || {});
      });
    }
  };

  const assignRobotToGroup = async (deviceId, groupId) => {
    if (!sessionData?.classroomId) return;
    const classroom = getClassroomById(sessionData.classroomId);
    if (!classroom) return;
    
    const group = classroom.groups.find(g => g.id === groupId);
    if (!group) return;
    const updatedRobots = {
      ...robots,
      [deviceId]: {
        ...robots[deviceId],
        assignedTo: {
          type: 'group',
          id: group.id,
          name: group.name,
          studentCount: group.students.length
        },
        assignmentTime: new Date().toISOString()
      }
    };
    setRobots(updatedRobots);
    // Persist to Firestore and reload session
    if (sessionData && sessionData.id) {
      const updatedSession = { ...sessionData, robots: updatedRobots };
      loadSessions(user).then(async sessions => {
        const idx = sessions.findIndex(s => String(s.id) === String(sessionData.id));
        if (idx >= 0) {
          sessions[idx] = updatedSession;
        } else {
          sessions.push(updatedSession);
        }
        await saveSessions(user, sessions);
        // Reload session from Firestore
        const freshSessions = await loadSessions(user);
        const found = freshSessions.find(s => String(s.id) === String(sessionData.id));
        if (found) setRobots(found.robots || {});
      });
    }
  };

  const unassignRobot = (deviceId) => {
    const updatedRobots = {
      ...robots,
      [deviceId]: {
        ...robots[deviceId],
        assignedTo: null,
        assignmentTime: null
      }
    };
    
    setRobots(updatedRobots);
  };

  const openAssignmentModal = (deviceId) => {
    setSelectedRobotForAssignment(deviceId);
    setShowAssignmentModal(true);
  };

  // NEW: Robot selection functions
  const toggleRobotSelection = (deviceId) => {
    const newSelected = new Set(selectedRobotsForTagging);
    if (newSelected.has(deviceId)) {
      newSelected.delete(deviceId);
    } else {
      newSelected.add(deviceId);
    }
    setSelectedRobotsForTagging(newSelected);
  };

  const openTagModal = () => {
    if (selectedRobotsForTagging.size > 0) {
      setShowTagModal(true);
    }
  };

  // Helper to truncate names to 12 characters with ...
  const truncateName = (name) => {
    return name && name.length > 12 ? name.slice(0, 12) + '...' : name;
  };

  const assignTagToMultipleRobots = async (type, id, name, additionalData = {}) => {
    const updatedRobots = { ...robots };
    selectedRobotsForTagging.forEach(deviceId => {
      updatedRobots[deviceId] = {
        ...updatedRobots[deviceId],
        assignedTo: {
          type,
          id,
          name,
          ...additionalData
        },
        assignmentTime: new Date().toISOString()
      };
    });
    setRobots(updatedRobots);
    setSelectedRobotsForTagging(new Set());
    setIsTagSelectionMode(false);
    setShowTagModal(false);
    // Persist to Firestore and reload session
    if (sessionData && sessionData.id) {
      const updatedSession = { ...sessionData, robots: updatedRobots };
      loadSessions(user).then(async sessions => {
        const idx = sessions.findIndex(s => String(s.id) === String(sessionData.id));
        if (idx >= 0) {
          sessions[idx] = updatedSession;
        } else {
          sessions.push(updatedSession);
        }
        await saveSessions(user, sessions);
        // Reload session from Firestore
        const freshSessions = await loadSessions(user);
        const found = freshSessions.find(s => String(s.id) === String(sessionData.id));
        if (found) setRobots(found.robots || {});
      });
    }
  };

  const assignTagToStudent = (studentId) => {
    if (!selectedClassroom) return;
    
    const student = selectedClassroom.students.find(s => s.id === studentId);
    if (!student) return;

    assignTagToMultipleRobots('student', student.id, student.name, {
      email: student.email
    });
  };

  const assignTagToGroup = (groupId) => {
    if (!selectedClassroom) return;
    
    const group = selectedClassroom.groups.find(g => g.id === groupId);
    if (!group) return;

    assignTagToMultipleRobots('group', group.id, group.name, {
      studentCount: group.students.length
    });
  };

  const removeTagsFromSelectedRobots = async () => {
    const updatedRobots = { ...robots };
    selectedRobotsForTagging.forEach(deviceId => {
      updatedRobots[deviceId] = {
        ...updatedRobots[deviceId],
        assignedTo: null,
        assignmentTime: null
      };
    });
    setRobots(updatedRobots);
    setSelectedRobotsForTagging(new Set());
    setIsTagSelectionMode(false);
    setShowTagModal(false);
    // Persist to Firestore and reload session
    if (sessionData && sessionData.id) {
      const updatedSession = { ...sessionData, robots: updatedRobots };
      loadSessions(user).then(async sessions => {
        const idx = sessions.findIndex(s => String(s.id) === String(sessionData.id));
        if (idx >= 0) {
          sessions[idx] = updatedSession;
        } else {
          sessions.push(updatedSession);
        }
        await saveSessions(user, sessions);
        // Reload session from Firestore
        const freshSessions = await loadSessions(user);
        const found = freshSessions.find(s => String(s.id) === String(sessionData.id));
        if (found) setRobots(found.robots || {});
      });
    }
  };

  // NEW: Function to highlight robot and program
  const highlightRobotAndProgram = (deviceId, programKey) => {
    setHighlightedRobot(deviceId);
    setHighlightedProgram(programKey);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedRobot(null);
      setHighlightedProgram(null);
      highlightTimeoutRef.current = null;
    }, 1500);
  };

  // NEW: Function to convert program text to visual buttons
  const renderProgramAsButtons = (programText) => {
    if (!programText) return null;
    
    const words = programText.toLowerCase().split(' ');
    const buttonImages = [];
    
    words.forEach((word, index) => {
      let imgSrc = null;
      switch (word.trim()) {
        case 'forward':
          imgSrc = forwardImg;
          break;
        case 'right':
          imgSrc = rightImg;
          break;
        case 'reverse':
          imgSrc = reverseImg;
          break;
        case 'left':
          imgSrc = leftImg;
          break;
        case 'play':
          imgSrc = playImg;
          break;
        case 'test':
          imgSrc = testImg;
          break;
        default:
          // For unknown commands, show text
          buttonImages.push(
            <span key={index} style={{
              display: 'inline-block',
              padding: '4px 8px',
              background: '#f0f0f0',
              borderRadius: '4px',
              fontSize: '0.75rem',
              margin: '0 2px',
              fontFamily: 'monospace',
              color: '#666'
            }}>
              {word}
            </span>
          );
          return;
      }
      
      if (imgSrc) {
        buttonImages.push(
          <img 
            key={index}
            src={imgSrc} 
            alt={word}
            style={{
              width: '24px',
              height: '24px',
              margin: '0 2px',
              verticalAlign: 'middle',
              objectFit: 'contain',
              scale: 10
            }}
          />
        );
      }
    });
    
    return buttonImages;
  };

  // Save session handler
  const handleSaveSession = async () => {
    try {
      if ((sessionStatus === 'active' || sessionStatus === 'paused' || sessionStatus === 'ended') && sessionData && sessionData.id) {
        const savedSessions = await loadSessions(user);
        const updatedSession = {
          ...sessionData,
          name: sessionName,
          status: sessionStatus,
          robots: robots,
          receivedData: receivedData,
          completedRobots: Array.from(completedRobots),
          lessonCompletions: Object.fromEntries(
            Object.entries(lessonCompletions).map(([k, v]) => [k, Array.from(v)])
          ),
          sessionNotes: sessionNotes,
          lastUpdated: new Date().toISOString()
        };
        
        const existingIndex = savedSessions.findIndex(s => String(s.id) === String(sessionData.id));
        if (existingIndex >= 0) {
          savedSessions[existingIndex] = updatedSession;
        } else {
          savedSessions.push(updatedSession);
        }
        await saveSessions(user, savedSessions);
        
        setHasUnsavedChanges(false);
        setLastSavedState({
          robots: robots,
          receivedData: receivedData,
          sessionName: sessionName,
          sessionNotes: sessionNotes,
          completedRobots: completedRobots,
          lessonCompletions: Object.fromEntries(
            Object.entries(lessonCompletions).map(([k, v]) => [k, Array.from(v)])
          )
        });
      }
    } catch (error) {
      console.error('Error saving session:', error);
    }
  };

  // UI for robot cards view
  const robotCardsView = (
    <div className="robot-cards-container" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '32px',
      width: '100%',
      overflow: 'visible',
      paddingTop: '32px', // ensure top tag is never clipped
    }}>
      {(() => {
        const sortedRobotEntries = (() => {
          if (!isConnected) return Object.entries(getFilteredRobots());
          // Move inactive robots to the top
          const entries = Object.entries(getFilteredRobots());
          return [
            ...entries.filter(([id, robot]) => robot.status === 'inactive'),
            ...entries.filter(([id, robot]) => robot.status !== 'inactive'),
          ];
        })();
        const robotEntries = sortedRobotEntries;
        
        if (robotEntries.length > 0) {
          return robotEntries.map(([deviceId, robot], index) => {
            // Extract voltage from robot.latestData
            let voltage = null;
            if (robot.batteryData && robot.batteryData.voltage) {
              voltage = robot.batteryData.voltage;
            } else if (robot.latestData) {
              const keys = Object.keys(robot.latestData);
              for (const k of ['vbat', 'battery', 'voltage']) {
                if (robot.latestData[k] && !isNaN(parseFloat(robot.latestData[k]))) {
                  voltage = parseFloat(robot.latestData[k]);
                  break;
                }
              }
              if (voltage === null) {
                // Fallback: find any value between 3.0 and 4.3
                for (const k of keys) {
                  const v = parseFloat(robot.latestData[k]);
                  if (!isNaN(v) && v >= 3.0 && v <= 4.3) {
                    voltage = v;
                    break;
                  }
                }
              }
            }
            // Add running program duration
            const isRunning = runningPrograms[robot.deviceId] && runningPrograms[robot.deviceId] > Date.now();
            return (
              <div 
                key={robot.deviceId} 
                className={`robot-card ${selectedRobot === robot.deviceId ? 'selected' : ''} ${selectedRobotsForTagging.has(robot.deviceId) ? 'tag-selected' : ''} ${lessonCompletions[selectedLessonId]?.has(robot.deviceId) ? 'completed' : ''} fade-in-scale animate-on-mount-delay-${Math.min(8 + index, 12)}`}
                onClick={() => handleRobotClick(robot.deviceId)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  padding: '20px 24px 36px 24px',
                  background: highlightedRobot === robot.deviceId ? '#e3eafe' : (lessonCompletions[selectedLessonId]?.has(robot.deviceId) ? '#f8f9ff' : '#fff'),
                  borderRadius: '16px',
                  boxShadow: lessonCompletions[selectedLessonId]?.has(robot.deviceId) 
                    ? '0 4px 20px rgba(65, 105, 225, 0.15)' 
                    : '0 2px 12px rgba(65, 105, 225, 0.08)',
                  border: selectedRobotsForTagging.has(robot.deviceId) ? '2px solid #4169e1' : '2px solid #e0e0e0',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'visible',
                  gap: '18px',
                  minHeight: '180px',
                  height: '180px',
                }}
              >
                {/* Status Tag - attached to top of card */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: -2,  // match card's left padding
                    zIndex: 20,
                    background: !isConnected
                      ? '#b0b0b0'
                      : isRunning
                        ? '#ffc107'
                        : robot.status === 'inactive_battery'
                          ? '#b0b0b0'
                          : robot.status === 'active'
                            ? '#28a745'
                            : robot.status === 'idle'
                              ? '#333'
                              : '#dc3545',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    padding: '7px 22px 7px 18px',
                    borderTopLeftRadius: '16px',
                    borderTopRightRadius: '16px',
                    borderBottomLeftRadius: '16px',
                    borderBottomRightRadius: '16px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    letterSpacing: '0.02em',
                    minWidth: '70px',
                    textAlign: 'center',
                    border: '2px solid #e1e1e0',
                    transform: 'translateY(-60%)',
                    pointerEvents: 'none',
                  }}
                >
                  {!isConnected
                    ? 'Waiting for connection...'
                    : isRunning
                      ? 'Running program'
                      : robot.status === 'inactive_battery'
                        ? 'Powered off'
                        : robot.status === 'active'
                          ? 'Active'
                          : robot.status === 'idle'
                            ? 'Idle'
                            : 'Inactive'}
                </div>
                {/* Ellipsis menu - top right */}
                <div
                  style={{
                    position: 'absolute',
                    top: '20px',
                    right: '12px',
                    zIndex: 10
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="dropdown">
                    <button
                      className="dropdown-toggle"
                      onClick={(e) => {
                        e.stopPropagation();
                        const dropdown = e.target.closest('.dropdown');
                        const menu = dropdown.querySelector('.dropdown-menu');
                        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                      }}
                      style={{
                        background: '#f0f0f0',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#333',
                        transition: 'all 0.2s ease',
                        outline: 'none'
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '16px', height: '16px' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
                      </svg>
                    </button>
                    <div className="dropdown-menu" style={{
                      display: 'none',
                      position: 'absolute',
                      top: '100%',
                      right: '0',
                      background: '#fff',
                      border: '1px solid #e0e0e0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                      zIndex: 1000,
                      minWidth: '140px',
                      padding: '4px 0'
                    }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Are you sure you want to delete robot ${robot.deviceId}? This cannot be undone.`)) {
                            const updatedRobots = { ...robots };
                            delete updatedRobots[robot.deviceId];
                            setRobots(updatedRobots);
                            // Also remove from completed robots if it was completed
                            if (completedRobots.has(robot.deviceId)) {
                              setCompletedRobots(prev => {
                                const newSet = new Set(prev);
                                newSet.delete(robot.deviceId);
                                return newSet;
                              });
                            }
                          }
                          e.target.closest('.dropdown-menu').style.display = 'none';
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '400',
                          color: '#dc3545',
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          transition: 'background-color 0.2s',
                          outline: 'none'
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = '#fff5f5'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '14px', height: '14px' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                        Delete Robot
                      </button>
                    </div>
                  </div>
                </div>
                {/* Left column: robot info, actions, assignment */}
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', flex: 1, minWidth: 0, gap: '18px' }}>
                  {/* Selection checkbox */}
                  <div
                    onClick={e => {
                      e.stopPropagation();
                      toggleRobotSelection(robot.deviceId);
                    }}
                    style={{
                      marginRight: '0',
                      zIndex: 5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      alignSelf: 'center',
                      padding: '6px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      minWidth: '25px',
                      minHeight: '25px',
                      boxSizing: 'border-box',
                      userSelect: 'none',
                      width: '28px',
                      height: '28px',
                      border: selectedRobotsForTagging.has(robot.deviceId) ? '2px solid #4169e1' : '2px solid #e0e0e0',
                      backgroundColor: selectedRobotsForTagging.has(robot.deviceId) ? '#4169e1' : 'transparent',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {selectedRobotsForTagging.has(robot.deviceId) && (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3.5} stroke="currentColor" style={{ width: 25, height: 25, color: '#fff' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    )}
                  </div>
                  {/* Robot image */}
                  <img 
                    src={robotGraphic} 
                    alt="Robot" 
                    style={{
                      width: '60px',
                      height: '70px',
                      marginRight: '0',
                      opacity: lessonCompletions[selectedLessonId]?.has(robot.deviceId) ? '0.8' : '1',
                      transition: 'opacity 0.3s ease'
                    }}
                  />
                  {/* Info and actions */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
                      <span 
                        className="robot-card-device-id" 
                        onClick={e => e.stopPropagation()}
                        style={{
                          fontWeight: lessonCompletions[selectedLessonId]?.has(robot.deviceId) ? '600' : '500',
                          color: lessonCompletions[selectedLessonId]?.has(robot.deviceId) ? '#4169e1' : '#222',
                          transition: 'all 0.3s ease',
                          minHeight: '22px',
                          display: 'inline-flex',
                          alignItems: 'center'
                        }}
                      >
                        {robot.deviceId}
                      </span>
                      {robot.assignedTo ? (
                        <span style={{
                          minWidth: '120px',
                          minHeight: '22px',
                          maxWidth: '200px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          background: lessonCompletions[selectedLessonId]?.has(robot.deviceId) ? '#e3eafe' : '#f8f9fa',
                          borderRadius: '12px',
                          fontSize: '12px',
                          color: lessonCompletions[selectedLessonId]?.has(robot.deviceId) ? '#4169e1' : '#666',
                          fontWeight: '500',
                          border: selectedRobotsForTagging.has(robot.deviceId) ? '1px solid #4169e1' : '1px solid #e0e0e0',
                          boxSizing: 'border-box',
                          boxShadow: lessonCompletions[selectedLessonId]?.has(robot.deviceId)
                            ? '0 2px 8px rgba(39, 75, 181, 0.08)'
                            : '0 1px 4px rgba(65, 105, 225, 0.08)',
                          padding: '3px 10px',
                          cursor: 'default',
                          gap: '8px',
                        }}>
                          <span style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}>
                            {robot.assignedTo.type === 'student'
                              ? `${truncateName(robot.assignedTo.name)}`
                              : `${truncateName(robot.assignedTo.name)} (${robot.assignedTo.studentCount} students)`}
                          </span>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              unassignRobot(robot.deviceId);
                            }}
                            title="Remove tag"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: lessonCompletions[selectedLessonId]?.has(robot.deviceId) ? '#4169e1' : '#888',
                              fontWeight: 'bold',
                              fontSize: '14px',
                              cursor: 'pointer',
                              padding: 0,
                              lineHeight: 1,
                              display: 'flex',
                              alignItems: 'center',
                              opacity: 0.6,
                              transition: 'opacity 0.2s',
                            }}
                            className="remove-tag-x"
                            onMouseEnter={e => e.target.style.opacity = 1}
                            onMouseLeave={e => e.target.style.opacity = 0.6}
                          >
                            ×
                          </button>
                        </span>
                      ) : (
                        <span style={{
                          minWidth: '120px',
                          minHeight: '22px',
                          maxWidth: '200px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          background: 'transparent',
                          borderRadius: '12px',
                          fontSize: '12px',
                          border: '1px solid transparent',
                          boxSizing: 'border-box',
                          boxShadow: 'none',
                          padding: '3px 10px',
                          cursor: 'default',
                        }} />
                      )}
                    </div>
                    {/* Action Buttons and Tag Row */}
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '4px',
                      marginTop: '0',
                      flexWrap: 'wrap',
                      rowGap: '8px',
                      paddingLeft: '0px',
                      marginLeft: '-6px',
                    }}>
                      {/* Mark As Done button */}
                      {selectedLessonId !== 'none' && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            toggleRobotCompletion(robot.deviceId);
                          }}
                          style={{
                            padding: '6px 12px',
                            background: lessonCompletions[selectedLessonId]?.has(robot.deviceId) ? '#274bb5' : '#4169e1',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '12px',
                            fontWeight: '500',
                            color: '#fff',
                            height: '32px',
                            minWidth: '100px',
                            boxShadow: lessonCompletions[selectedLessonId]?.has(robot.deviceId)
                              ? '0 2px 8px rgba(39, 75, 181, 0.3)'
                              : '0 1px 4px rgba(65, 105, 225, 0.2)'
                          }}
                          title={lessonCompletions[selectedLessonId]?.has(robot.deviceId) ? 'Mark as incomplete' : 'Mark as done'}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '14px', height: '14px' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                          </svg>
                          {lessonCompletions[selectedLessonId]?.has(robot.deviceId) ? 'Undo Done' : 'Mark as Done'}
                        </button>
                      )}
                      
                      {/* Edit Tags button */}
                      {sessionData && sessionData.classroomId && (
                        getClassroomById(sessionData.classroomId) ? (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setSelectedRobotForAssignment(robot.deviceId);
                              setShowAssignmentModal(true);
                            }}
                            style={{
                              padding: '6px 12px',
                              background: '#a259e1',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              fontSize: '12px',
                              fontWeight: '500',
                              color: '#fff',
                              height: '32px',
                              minWidth: '100px',
                              boxShadow: '0 1px 4px rgba(162, 89, 225, 0.2)'
                            }}
                            title="Edit robot tags"
                          >
                            <svg 
                              xmlns="http://www.w3.org/2000/svg" 
                              fill="none" 
                              viewBox="0 0 24 24" 
                              strokeWidth={1.5} 
                              stroke="currentColor" 
                              style={{ width: '14px', height: '14px' }}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.732.699 2.431 0l4.318-4.318c.699-.699.699-1.732 0-2.431L9.568 3Z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
                            </svg>
                            Assign
                          </button>
                        ) : (
                          <button
                            disabled
                            style={{
                              padding: '6px 12px',
                              background: '#e0e0e0',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'not-allowed',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              fontSize: '12px',
                              fontWeight: '500',
                              color: '#888',
                              height: '32px',
                              minWidth: '100px',
                              boxShadow: 'none'
                            }}
                            title="Classroom data not loaded"
                          >
                            <svg 
                              xmlns="http://www.w3.org/2000/svg" 
                              fill="none" 
                              viewBox="0 0 24 24" 
                              strokeWidth={1.5} 
                              stroke="currentColor" 
                              style={{ width: '14px', height: '14px' }}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.732.699 2.431 0l4.318-4.318c.699-.699.699-1.732 0-2.431L9.568 3Z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
                            </svg>
                            Assign (classroom unavailable)
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
                {/* Right column: Latest Program */}
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-end', marginRight: '200px' }}>
                  {(() => {
                    const latestProgram = getLatestProgram(robot.deviceId);
                    if (!latestProgram) {
                      return (
                        <div style={{
                          background: 'transparent',
                          borderRadius: '8px',
                          padding: '12px',
                          border: '1px solid transparent',
                          width: '250px',
                          minHeight: '110px',
                          marginBottom: '0'
                        }} />
                      );
                    }
                    return (
                      <div style={{
                        background: '#f8f9fa',
                        borderRadius: '8px',
                        padding: '12px',
                        border: '1px solid #e0e0e0',
                        width: '250px',
                        marginBottom: '0'
                      }}>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          marginBottom: '8px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ 
                              fontSize: '0.75rem', 
                              fontWeight: '600', 
                              color: '#4169e1'
                            }}>
                              Latest Program
                            </span>
                            {latestProgram.button === 'PLAY' ? (
                              <img src={playImg} alt="Play" style={{ width: 20, height: 20, verticalAlign: 'middle' }} />
                            ) : latestProgram.button === 'TEST' ? (
                              <img src={testImg} alt="Test" style={{ width: 20, height: 20, verticalAlign: 'middle' }} />
                            ) : (
                              <span style={{ fontSize: '0.65rem', color: '#666', background: '#e3eafe', padding: '1px 4px', borderRadius: '3px', fontWeight: '500' }}>{latestProgram.button}</span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.65rem', color: '#888' }}>
                            {formatDateTime(latestProgram.timestamp)}
                          </span>
                        </div>
                        
                        <div style={{ 
                          background: '#fff', 
                          padding: '6px 8px', 
                          borderRadius: '4px', 
                          border: '1px solid #e0e0e0', 
                          fontFamily: 'monospace', 
                          fontSize: '0.75rem', 
                          color: '#333', 
                          wordBreak: 'break-word',
                          marginBottom: '8px',
                          maxHeight: '60px',
                          overflow: 'hidden',
                          display: 'flex',
                          flexWrap: 'nowrap',
                          gap: '4px',
                          alignItems: 'center'
                        }}>
                          {renderProgramAsButtons(latestProgram.program)}
                        </div>
                        
                        <div style={{ 
                          display: 'flex', 
                          gap: '6px',
                          justifyContent: 'flex-end'
                        }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setProgramToAnimate(latestProgram);
                              resetRobotAnim(latestProgram.program);
                              setShowProgramAnimationModal(true);
                            }}
                            style={{
                              padding: '3px 6px',
                              background: '#4169e1',
                              color: 'white',
                              border: 'none',
                              borderRadius: '3px',
                              cursor: 'pointer',
                              fontSize: '0.65rem',
                              fontWeight: '500',
                              fontFamily: 'var(--font-body)',
                              transition: 'background 0.2s ease'
                            }}
                            onMouseEnter={(e) => e.target.style.background = '#274bb5'}
                            onMouseLeave={(e) => e.target.style.background = '#4169e1'}
                          >
                            View Program
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                {/* Battery bar at the bottom, spanning full width */}
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
                  <BatteryBar voltage={voltage} cardHeight={60} />
                </div>
              </div>
            );
          });
        } else {
          // Show appropriate message based on whether there's a search term
          if (robotSearchTerm.trim()) {
            return (
              <div className="fade-in-scale animate-on-mount-delay-8" style={{ 
                textAlign: 'center', 
                padding: '40px', 
                color: '#666',
                background: '#fff',
                borderRadius: '12px',
                border: '2px dashed #e0e0e0'
              }}>
                No robots found matching "{robotSearchTerm}". Try a different search term.
              </div>
            );
          } else {
            return (
              <div className="fade-in-scale animate-on-mount-delay-8" style={{ 
                textAlign: 'center', 
                padding: '40px', 
                color: '#666',
                background: '#fff',
                borderRadius: '12px',
                border: '2px dashed #e0e0e0'
              }}>
                No robots detected yet. Connect to micro:bit and send some data.
              </div>
            );
          }
        }
      })()}
    </div>
  );

  // UI for data view
  const filteredReceivedData = dataLogSearchTerm.trim()
    ? receivedData.filter(item =>
        item.data.toLowerCase().includes(dataLogSearchTerm.toLowerCase()) ||
        item.timestamp.toLowerCase().includes(dataLogSearchTerm.toLowerCase())
      )
    : receivedData;

  const dataView = (
    <div className="data-container fade-in-scale animate-on-mount-delay-5" style={{ marginTop: 16 }}>
      {filteredReceivedData.length > 0 ? (
        filteredReceivedData.map((item, idx) => (
          <div key={idx} className="data-item">
            <span className="timestamp">{formatDateTime(item.timestamp)}</span>
            <span className="data">{item.data}</span>
          </div>
        ))
      ) : (
        <div className="data-item">No data received{dataLogSearchTerm ? ' matching your search' : ''} yet</div>
      )}
    </div>
  );

  // UI for detailed robot data view
  const robotDataView = selectedRobot && (
    <div className="session-info fade-in-scale animate-on-mount-delay-4">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>Robot Data: {selectedRobot}</h2>
        <button 
          className="clear-data-btn fade-in-scale animate-on-mount-delay-5" 
          onClick={() => setSelectedRobot(null)}
        >
          ← Back to Robots
        </button>
      </div>
      <div className="data-container fade-in-scale animate-on-mount-delay-6" style={{ marginTop: 16 }}>
        {getRobotData(selectedRobot).length > 0 ? (
          getRobotData(selectedRobot).map((item, idx) => (
            <div key={idx} className="data-item">
              <span className="timestamp">{formatDateTime(item.timestamp)}</span>
              <span className="data">{item.data}</span>
            </div>
          ))
        ) : (
          <div className="data-item">No data received from this robot yet</div>
        )}
      </div>
    </div>
  );

  // Place this near the top of the component or before the return statement:
  const allSelectedDone = Array.from(selectedRobotsForTagging).every(id => completedRobots.has(id));

  // Add state for search bars in robot details popup
  const [robotDetailsProgramsSearch, setRobotDetailsProgramsSearch] = useState('');
  const [robotDetailsLogsSearch, setRobotDetailsLogsSearch] = useState('');

  // Prevent background scroll when serial popup is open
  useEffect(() => {
    if (showSerialPopup) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showSerialPopup]);

  // 2. Add new state for the program animation modal and robot animation
  const [showProgramAnimationModal, setShowProgramAnimationModal] = useState(false);
  const [programToAnimate, setProgramToAnimate] = useState(null); // { program, robotName, ... }
  const [robotAnimState, setRobotAnimState] = useState({
    x: 2, // center of 5x5
    y: 2,
    dir: 0, // 0=up, 1=right, 2=down, 3=left
    step: 0,
    gridSize: 5,
    offsetX: 0,
    offsetY: 0,
    robotScale: 1.0, // New: track robot scale
    history: [{ x: 2, y: 2, dir: 0 }],
    playing: false,
  });
  const animIntervalRef = useRef(null);

  // 3. Add helpers for parsing and running the program
  const parseProgramCommands = (programText) => {
    if (!programText) return [];
    return programText.trim().split(/\s+/).map(cmd => cmd.toLowerCase());
  };

  const resetRobotAnim = (programText) => {
    setRobotAnimState({
      x: 2,
      y: 2,
      dir: 0,
      step: 0,
      gridSize: 5,
      offsetX: 0,
      offsetY: 0,
      robotScale: 1.0, // New: track robot scale
      history: [{ x: 2, y: 2, dir: 0 }],
      playing: false,
    });
  };

  const moveRobot = (state, command) => {
    let { x, y, dir, gridSize, offsetX, offsetY, robotScale } = state;
    let newDir = dir;
    let newX = x;
    let newY = y;
    let newGridSize = gridSize;
    let newOffsetX = offsetX;
    let newOffsetY = offsetY;
    let newRobotScale = robotScale;
    
    // Handle movement commands
    if (command === 'forward') {
      if (dir === 0) newY -= 1;
      if (dir === 1) newX += 1;
      if (dir === 2) newY += 1;
      if (dir === 3) newX -= 1;
    } else if (command === 'reverse') {
      if (dir === 0) newY += 1;
      if (dir === 1) newX -= 1;
      if (dir === 2) newY -= 1;
      if (dir === 3) newX += 1;
    } else if (command === 'right') {
      newDir = (dir + 1) % 4;
    } else if (command === 'left') {
      newDir = (dir + 3) % 4;
    }
    
    // Check if robot is going beyond current grid boundaries
    const currentMinX = -offsetX;
    const currentMaxX = gridSize - 1 - offsetX;
    const currentMinY = -offsetY;
    const currentMaxY = gridSize - 1 - offsetY;
    
    let needsExpansion = false;
    
    // Check if robot is moving beyond current grid boundaries
    if (newX < currentMinX || newX > currentMaxX || newY < currentMinY || newY > currentMaxY) {
      needsExpansion = true;
    }
    
    if (needsExpansion) {
      // Expand grid by 2 (5→7→9→11→13...)
      newGridSize = gridSize + 2;
      
      // Calculate the bounds of the robot's path including the new position
      let minX = newX, maxX = newX, minY = newY, maxY = newY;
      for (const h of state.history) {
        minX = Math.min(minX, h.x);
        maxX = Math.max(maxX, h.x);
        minY = Math.min(minY, h.y);
        maxY = Math.max(maxY, h.y);
      }
      
      // Calculate new offsets to center the robot's path
      newOffsetX = Math.floor((newGridSize - 1) / 2) - Math.floor((maxX + minX) / 2);
      newOffsetY = Math.floor((newGridSize - 1) / 2) - Math.floor((maxY + minY) / 2);
      
      // Scale down robot by 15% for each expansion
      const expansionFactor = newGridSize / Math.max(state.gridSize, 5);
      if (expansionFactor > 1) {
        newRobotScale = robotScale * 0.85; // 15% reduction
      }
    }
    
    return {
      ...state,
      x: newX,
      y: newY,
      dir: newDir,
      gridSize: newGridSize,
      offsetX: newOffsetX,
      offsetY: newOffsetY,
      robotScale: newRobotScale,
      history: [...state.history, { x: newX, y: newY, dir: newDir }],
    };
  };

  const stepRobotAnim = (forward = true) => {
    if (!programToAnimate) return;
    const commands = parseProgramCommands(programToAnimate.program);
    setRobotAnimState(prev => {
      let step = prev.step;
      if (forward && step < commands.length) {
        const nextState = moveRobot(prev, commands[step]);
        // Only set playing: false if not currently playing (i.e., manual step)
        return { ...nextState, step: step + 1, playing: prev.playing };
      } else if (!forward && step > 0) {
        // Rewind: replay from start up to step-1
        let state = { x: 2, y: 2, dir: 0, step: 0, gridSize: 5, offsetX: 0, offsetY: 0, robotScale: 1.0, history: [{ x: 2, y: 2, dir: 0 }], playing: false };
        for (let i = 0; i < step - 1; ++i) {
          state = moveRobot(state, commands[i]);
          state.step = i + 1;
        }
        return { ...state, playing: false };
      }
      return prev;
    });
  };

  const handlePlayPause = () => {
    setRobotAnimState(prev => ({ ...prev, playing: !prev.playing }));
  };

  // Animation effect
  useEffect(() => {
    if (robotAnimState.playing && programToAnimate) {
      if (robotAnimState.step >= parseProgramCommands(programToAnimate.program).length) {
        setRobotAnimState(prev => ({ ...prev, playing: false }));
        return;
      }
      animIntervalRef.current = setTimeout(() => {
        stepRobotAnim(true);
      }, 1500); // 1.5 second delay
    } else {
      if (animIntervalRef.current) clearTimeout(animIntervalRef.current);
    }
    return () => { if (animIntervalRef.current) clearTimeout(animIntervalRef.current); };
  }, [robotAnimState.playing, robotAnimState.step, programToAnimate]);

  // Timer to force re-render while any program is running
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate(n => n + 1);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const [showResumeConflictModal, setShowResumeConflictModal] = useState(false);
  const [pendingResume, setPendingResume] = useState(false);

  // Handler for Resume button
  const handleResumeClick = () => {
    loadSessions(user).then(savedSessions => {
      const otherActive = savedSessions.find(
        s => s.status === 'active' && String(s.id) !== String(sessionData?.id)
      );
      if (otherActive) {
        setPendingResume(true);
        setShowResumeConflictModal(true);
        return;
      }
      resumeSession();
    });
  };

  // Add at the top of SessionView function, after other useState hooks
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [showInactivityModal, setShowInactivityModal] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const inactivityTimeoutRef = useRef(null);

  // Helper: update last activity time
  const updateLastActivity = () => {
    lastActivityRef.current = Date.now();
    if (showInactivityModal) setShowInactivityModal(false);
  };

  // Update last activity on relevant changes
  useEffect(() => {
    updateLastActivity();
    // eslint-disable-next-line
  }, [robots, receivedData, completedRobots, sessionName]);

  // Add comprehensive activity tracking
  useEffect(() => {
    if (sessionStatus !== 'active') return;

    const handleUserActivity = () => {
      updateLastActivity();
    };

    // Add event listeners for user activity
    document.addEventListener('click', handleUserActivity);
    document.addEventListener('keydown', handleUserActivity);
    document.addEventListener('mousemove', handleUserActivity);
    document.addEventListener('scroll', handleUserActivity);

    return () => {
      document.removeEventListener('click', handleUserActivity);
      document.removeEventListener('keydown', handleUserActivity);
      document.removeEventListener('mousemove', handleUserActivity);
      document.removeEventListener('scroll', handleUserActivity);
    };
  }, [sessionStatus]);

  // Inactivity timer effect
  useEffect(() => {
    if (sessionStatus !== 'active') {
      console.log('Session not active, clearing inactivity timer');
      if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
      return;
    }
    
    console.log('Starting inactivity timer for active session');
    if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
    
    const checkInactivity = () => {
      const now = Date.now();
      const elapsed = now - lastActivityRef.current;
      console.log('Checking inactivity, elapsed:', elapsed, 'ms');
      
      if (elapsed >= 10 * 60 * 1000) { 
        console.log('Inactivity detected, pausing session');
        pauseSession();
        setShowInactivityModal(true);
      } else {
        console.log('Still active, checking again in 1 minute');
        inactivityTimeoutRef.current = setTimeout(checkInactivity, 60 * 1000); // check every minute
      }
    };
    
    // Start checking immediately
    inactivityTimeoutRef.current = setTimeout(checkInactivity, 60 * 1000);
    
    return () => {
      if (inactivityTimeoutRef.current) {
        console.log('Clearing inactivity timer');
        clearTimeout(inactivityTimeoutRef.current);
      }
    };
  }, [sessionStatus, pauseSession]);

  // Hide modal if session resumes or ends
  useEffect(() => {
    if (sessionStatus !== 'paused') setShowInactivityModal(false);
  }, [sessionStatus]);

  // Add state for the lesson completion modal
  const [showLessonHistoryModal, setShowLessonHistoryModal] = useState(false);

  // Add a mapping from lessonId to Google Doc links
  const LESSON_LINKS = {
    lesson1: 'https://docs.google.com/document/d/15hDBUGjhOFpLSPmmkFJMXMcShzhLqdaBW9WTI3UOFXs/edit?tab=t.0#heading=h.a6lqxihc6dhl',
    lesson2: 'https://docs.google.com/document/d/13E9Lz6l0eP4ZT-kJBxJST35SX4427fOw6XLlfcZpwm0/edit?tab=t.0#heading=h.a6lqxihc6dhl',
    lesson3: 'https://docs.google.com/document/d/1qHoE0t6diltiHJbYG4hKiGGIJOQFLw3rRNMmLgWc-1E/edit?tab=t.0#heading=h.a6lqxihc6dhl',
    lesson4: 'https://docs.google.com/document/d/14jte14tL0Txgm1CdY9kZsbov0lZDoqv7UyhECFW8ioI/edit?tab=t.0#heading=h.a6lqxihc6dhl',
  };

  // Add state for the unsaved changes leave modal
  const [showLeaveUnsavedModal, setShowLeaveUnsavedModal] = useState(false);
  const [pendingLeaveAction, setPendingLeaveAction] = useState(null);

  // Add effect to warn about unsaved changes on reload or navigation
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (sessionStatus === 'active' && sessionData && sessionData.id) {
        // Save session data to localStorage synchronously
        localStorage.setItem('unsavedSession', JSON.stringify({
          ...sessionData,
          name: sessionName,
          status: sessionStatus,
          robots,
          receivedData,
          completedRobots: Array.from(completedRobots),
          lessonCompletions: Object.fromEntries(
            Object.entries(lessonCompletions).map(([k, v]) => [k, Array.from(v)])
          ),
          sessionNotes: sessionNotes,
          lastUpdated: new Date().toISOString()
        }));
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [sessionStatus, sessionData, sessionName, robots, receivedData, completedRobots, lessonCompletions, sessionNotes]);

  useEffect(() => {
    return () => {
      disconnectSerial();
      setIsConnected(false);
    };
  }, []);

  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [sessionLoadError, setSessionLoadError] = useState(null);

  // After all useState hooks, before other useEffects
useEffect(() => {
  const unsaved = localStorage.getItem('unsavedSession');
  if (unsaved && user) {
    const session = JSON.parse(unsaved);
    loadSessions(user).then(savedSessions => {
      const idx = savedSessions.findIndex(s => String(s.id) === String(session.id));
      if (idx >= 0) {
        savedSessions[idx] = session;
      } else {
        savedSessions.push(session);
      }
      saveSessions(user, savedSessions);
      localStorage.removeItem('unsavedSession');
    });
  }
}, [user]);

  // Rich text formatting functions
  const applyFormatting = (format) => {
    const editor = notesTextareaRef.current;
    if (!editor) return;

    // Check if text is selected
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (range.collapsed) return; // No text selected

    // Apply formatting
    switch (format) {
      case 'bold':
        document.execCommand('bold', false, null);
        break;
      case 'italic':
        document.execCommand('italic', false, null);
        break;
      case 'underline':
        document.execCommand('underline', false, null);
        break;
      default:
        return;
    }
  };

  const toggleFormatting = (format) => {
    const editor = notesTextareaRef.current;
    if (!editor) return;

    // Only allow formatting if text is selected
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.getRangeAt(0).collapsed) {
      return; // No text selected, don't allow formatting
    }

    // Toggle the formatting state
    setNotesFormatting(prev => ({
      ...prev,
      [format]: !prev[format]
    }));

    // Apply formatting to selected text
    switch (format) {
      case 'bold':
        document.execCommand('bold', false, null);
        break;
      case 'italic':
        document.execCommand('italic', false, null);
        break;
      case 'underline':
        document.execCommand('underline', false, null);
        break;
      default:
        return;
    }
  };

  const changeTextColor = (color) => {
    const editor = notesTextareaRef.current;
    if (!editor) return;

    // Only allow color change if text is selected
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.getRangeAt(0).collapsed) {
      return; // No text selected, don't allow color change
    }

    // Update the color state
    setNotesFormatting(prev => ({
      ...prev,
      color: color
    }));

    // Apply color to selected text
    document.execCommand('foreColor', false, color);
  };

  const updateFormattingState = () => {
    const editor = notesTextareaRef.current;
    if (!editor) return;

    const selection = window.getSelection();
    const hasSelection = selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed;
    
    setHasTextSelection(hasSelection);

    // Only update formatting state if we have a selection
    if (hasSelection) {
      setNotesFormatting({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        color: notesFormatting.color
      });
    }
  };

  const handleNotesChange = () => {
    const editor = notesTextareaRef.current;
    if (!editor) return;
    
    setSessionNotes(editor.innerHTML);
  };

  const handleNotesFocus = () => {
    // Don't update formatting state on focus
  };

  const handleNotesKeyUp = () => {
    // Don't update formatting state on keyup
  };

  const handleNotesMouseUp = () => {
    // Check for text selection on mouse up
    const selection = window.getSelection();
    const hasSelection = selection && selection.toString().length > 0;
    setHasTextSelection(hasSelection);
    
    // Update formatting state if we have a selection
    if (hasSelection) {
      setNotesFormatting({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        color: notesFormatting.color
      });
    } else {
      // Reset formatting state when no text is selected
      setNotesFormatting({
        bold: false,
        italic: false,
        underline: false,
        color: notesFormatting.color
      });
    }
  };

  const handleSelectionChange = () => {
    // Check for text selection on any selection change
    const selection = window.getSelection();
    const hasSelection = selection && selection.toString().length > 0;
    setHasTextSelection(hasSelection);
    
    // Update formatting state if we have a selection
    if (hasSelection) {
      setNotesFormatting({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        color: notesFormatting.color
      });
    } else {
      // Reset formatting state when no text is selected
      setNotesFormatting({
        bold: false,
        italic: false,
        underline: false,
        color: notesFormatting.color
      });
    }
  };

  // Add selection change listener when component mounts
  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  // Simple input handler without automatic formatting
  const handleNotesInput = (e) => {
    const editor = notesTextareaRef.current;
    if (!editor) return;
    
    setSessionNotes(editor.innerHTML);
    
    // Auto-save notes when they change
    if ((sessionStatus === 'active' || sessionStatus === 'paused' || sessionStatus === 'ended') && sessionData && sessionData.id) {
      autosaveSession();
    }
  };

  // Clear formatting when typing after formatted text
  const handleNotesKeyDown = (e) => {
    // Only handle single character keys (typing)
    if (e.key.length === 1) {
      const editor = notesTextareaRef.current;
      if (!editor) return;

      // Check if we're typing after formatted text
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (range.collapsed) { // Cursor is positioned (not selecting)
          // Check if we're at the end of formatted text
          const container = range.startContainer;
          const offset = range.startOffset;
          
          // If we're at the end of a text node that's inside a formatting element
          if (container.nodeType === Node.TEXT_NODE && offset === container.length) {
            const parent = container.parentElement;
            if (parent && (parent.tagName === 'B' || parent.tagName === 'I' || parent.tagName === 'U' || parent.style.color)) {
              // We're at the end of formatted text, clear formatting for new text
              document.execCommand('removeFormat', false, null);
            }
          }
        }
      }
    }
  };

  // Apply formatting to new text as it's typed
  const applyFormattingToNewText = () => {
    const editor = notesTextareaRef.current;
    if (!editor) return;

    // Apply current formatting modes
    if (notesFormatting.bold) {
      document.execCommand('bold', false, null);
    }
    if (notesFormatting.italic) {
      document.execCommand('italic', false, null);
    }
    if (notesFormatting.underline) {
      document.execCommand('underline', false, null);
    }
    if (notesFormatting.color !== '#000000') {
      document.execCommand('foreColor', false, notesFormatting.color);
    }
  };

  // Set initial content when sessionNotes changes
  useEffect(() => {
    const editor = notesTextareaRef.current;
    if (editor) {
      console.log('Setting innerHTML:', sessionNotes);
      console.log('Current editor.innerHTML:', editor.innerHTML);
      console.log('Active tab:', activeTab);
      // Only set content if it's different from what's already in the editor
      if (sessionNotes !== editor.innerHTML) {
        editor.innerHTML = sessionNotes;
        console.log('Updated editor.innerHTML to:', sessionNotes);
      }
    } else {
      console.log('Editor not found, activeTab:', activeTab);
    }
  }, [sessionNotes, activeTab]);

  return (
    <div className="dashboard-container">
      <Sidebar className="slide-in-from-left" />
      {/* Main Content */}
      <div className="main-content slide-in-from-bottom">
        <div className="top-bar slide-in-from-top">
          <div className="session-header">
            <button className="back-btn fade-in-scale animate-on-mount-delay-1" onClick={async () => {
              if (sessionStatus === 'active' && hasUnsavedChanges) {
                setPendingLeaveAction(() => async () => {
                  navigate('/sessions', { replace: true });
                  try {
                    await handleLeaveSession();
                  } catch (error) {
                    console.error('Error in background cleanup:', error);
                  }
                });
                setShowLeaveUnsavedModal(true);
                return;
              }
              // Navigate immediately
              navigate('/sessions', { replace: true });
              try {
                await handleLeaveSession();
              } catch (error) {
                console.error('Error in background cleanup:', error);
              }
            }}>
              Sessions
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                {/* Session Name Header */}
                <div style={{ 
                  fontFamily: 'Space Mono, monospace', 
                  fontSize: '0.9rem', 
                  fontWeight: '600', 
                  color: '#666', 
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  textDecoration: 'underline',
                  textUnderlineOffset: '6px'
                }}>
                  Session Name
                </div>
                <input
                  type="text"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  className="session-title-input animate-on-mount-delay-2"
                  onFocus={(e) => e.target.style.borderColor = '#4169e1'}
                  onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
                  disabled={sessionStatus === 'ended'}
                  placeholder="Enter session name..."
                  style={{
                    border: '1.5px solid #e0e0e0',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    fontSize: '1.1rem',
                    fontWeight: '600',
                    background: '#fff',
                    color: '#222',
                    transition: 'border-color 0.2s ease',
                    outline: 'none',
                    width: '100%',
                    height: '40px',
                    maxWidth: '250px'
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Session Controls Header */}
                <div style={{ 
                  fontFamily: 'Space Mono, monospace', 
                  fontSize: '0.9rem', 
                  fontWeight: '600', 
                  color: '#666', 
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  textDecoration: 'underline',
                  textUnderlineOffset: '6px'
                }}>
                  Session Controls
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  {/* Session Management Section */}
                  {(sessionStatus === 'active' || sessionStatus === 'paused' || sessionStatus === 'ended') && (
                    <>
                      <button 
                        className="session-btn save-btn fade-in-scale animate-on-mount-delay-4"
                        onClick={handleSaveSession}
                        disabled={!hasUnsavedChanges}
                        style={{
                          opacity: hasUnsavedChanges ? 1 : 0.5,
                          cursor: hasUnsavedChanges ? 'pointer' : 'not-allowed',
                          transition: 'all 0.3s ease',
                          background: hasUnsavedChanges ? '#4169e1' : '#9ca3af',
                          color: hasUnsavedChanges ? '#fff' : '#6b7280',
                          border: hasUnsavedChanges ? 'none' : '1px solid #d1d5db',
                          boxShadow: hasUnsavedChanges ? '0 2px 8px rgba(65, 105, 225, 0.2)' : 'none'
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '18px', height: '18px' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25H6A2.25 2.25 0 0 1 3.75 18V6A2.25 2.25 0 0 1 6 3.75h1.5m9 0h-9" />
                        </svg>
                        {hasUnsavedChanges ? 'Save' : 'Saved'}
                      </button>
                      {sessionStatus === 'active' && (
                        <>
                          <button 
                            className="session-btn pause-btn fade-in-scale animate-on-mount-delay-5"
                            onClick={pauseSession}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '18px', height: '18px' }}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                            </svg>
                            Pause
                          </button>
                          <button 
                            className="session-btn end-btn fade-in-scale animate-on-mount-delay-6"
                            onClick={handleEndSessionClick}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '18px', height: '18px' }}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
                            </svg>
                            End
                          </button>
                        </>
                      )}
                      {sessionStatus === 'paused' && (
                        <>
                          <button 
                            className="session-btn resume-btn fade-in-scale animate-on-mount-delay-5"
                            onClick={handleResumeClick}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '18px', height: '18px' }}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347c-.75.412-1.667-.13-1.667-.986V5.653Z" />
                            </svg>
                            Resume
                          </button>
                          <button 
                            className="session-btn end-btn fade-in-scale animate-on-mount-delay-6"
                            onClick={handleEndSessionClick}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '18px', height: '18px' }}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
                            </svg>
                            End
                          </button>
                        </>
                      )}
                    </>
                  )}
                  {sessionStatus === 'ended' && (
                    <button 
                      className="session-btn delete-btn fade-in-scale animate-on-mount-delay-4"
                      onClick={deleteSession}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '18px', height: '18px' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                      Delete Session
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {!sessionData ? (
          <div className="session-view-content">
            <div style={{ textAlign: 'center', padding: '50px', color: '#666' }}>
              Loading session...
            </div>
          </div>
        ) : (
          <div className="session-view-content">
            {/* Tab Interface */}
            <div className="session-tabs fade-in-scale animate-on-mount-delay-1" style={{ 
              display: 'flex', 
              borderBottom: '2px solid #f0f0f0', 
              marginBottom: '24px',
              gap: '0'
            }}>
              <button
                onClick={() => setActiveTab('main')}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  border: 'none',
                  background: activeTab === 'main' ? '#4169e1' : 'transparent',
                  color: activeTab === 'main' ? 'white' : '#666',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: '600',
                  borderRadius: '8px 8px 0 0',
                  transition: 'all 0.2s ease',
                  borderBottom: activeTab === 'main' ? '2px solid #4169e1' : '2px solid transparent'
                }}
              >
                Session
              </button>
              <button
                onClick={() => setActiveTab('notes')}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  border: 'none',
                  background: activeTab === 'notes' ? '#4169e1' : 'transparent',
                  color: activeTab === 'notes' ? 'white' : '#666',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: '600',
                  borderRadius: '8px 8px 0 0',
                  transition: 'all 0.2s ease',
                  borderBottom: activeTab === 'notes' ? '2px solid #4169e1' : '2px solid transparent'
                }}
              >
                Notes
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  border: 'none',
                  background: activeTab === 'settings' ? '#4169e1' : 'transparent',
                  color: activeTab === 'settings' ? 'white' : '#666',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: '600',
                  borderRadius: '8px 8px 0 0',
                  transition: 'all 0.2s ease',
                  borderBottom: activeTab === 'settings' ? '2px solid #4169e1' : '2px solid transparent'
                }}
              >
                Settings
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'main' && (
              <div className="tab-content fade-in-scale animate-on-mount-delay-2">
                {/* Connection Section */}
                <div className="session-section fade-in-scale animate-on-mount-delay-1">
                  <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => toggleSection('connection')}>
                    <h2>Connection</h2>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSection('connection');
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '4px',
                        transition: 'background-color 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        outline: 'none'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        strokeWidth={1.5} 
                        stroke="currentColor" 
                        style={{ 
                          width: '20px', 
                          height: '20px',
                          transform: minimizedSections.connection ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s'
                        }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                  </div>
                  {!minimizedSections.connection && (
                    <>
                      <div style={{ marginBottom: '12px', padding: '8px 0px', backgroundColor: 'transparent', borderRadius: '6px', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '16px', height: '16px', color: '#666', flexShrink: 0 }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                        </svg>
                        {/* header tip */}
                        <p style={{ margin: 0, color: '#666', fontSize: '12px', lineHeight: '1.4', fontFamily: 'Space Mono, monospace' }}>
                          Plug in your receiver micro:bit to your computer and click the button below to connect.
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <button 
                          className={`connection-btn ${isConnected ? 'disconnect' : 'connect'} fade-in-scale animate-on-mount-delay-2`}
                          onClick={isConnected ? disconnectFromMicrobit : connectToMicrobit}
                          disabled={sessionStatus === 'ended' || sessionStatus === 'paused'}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '18px', height: '18px' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" />
                          </svg>
                          {isConnected ? 'Disconnect' : 'Connect'}
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div 
                            className={`status-dot ${isConnected ? 'connected' : ''} animate-on-mount-delay-3`}
                            style={{
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              backgroundColor: isConnected ? '#4CAF50' : '#b0b0b0',
                              transition: 'background-color 0.3s ease'
                            }}
                          ></div>
                          <span style={{ color: '#666', fontSize: '14px' }}>
                            {isConnected ? 'Connected to micro:bit' : 'Not connected'}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Lesson Progress Section */}
                <div className="session-section fade-in-scale animate-on-mount-delay-2">
                  <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => toggleSection('lessonProgress')}>
                    <h2>Lesson Progress</h2>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSection('lessonProgress');
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '4px',
                        transition: 'background-color 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        outline: 'none'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        strokeWidth={1.5} 
                        stroke="currentColor" 
                        style={{ 
                          width: '20px', 
                          height: '20px',
                          transform: minimizedSections.lessonProgress ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s'
                        }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                  </div>
                  {!minimizedSections.lessonProgress && (
                    <>
                      <div style={{ marginBottom: '12px', padding: '8px 0px', backgroundColor: 'transparent', borderRadius: '6px', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '16px', height: '16px', color: '#666', flexShrink: 0 }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                        </svg>
                        {/* header tip */}
                        <p style={{ margin: 0, color: '#666', fontSize: '12px', lineHeight: '1.4', fontFamily: 'Space Mono, monospace' }}>
                          Select a lesson and track your students' progress. When you mark a student as complete, the progress bar will update.
                        </p>
                      </div>
                      {/* Lesson selection dropdown and Lesson History button in one row */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 16 }}>
                        <div>
                          <label htmlFor="lesson-select" style={{ fontWeight: 600, marginRight: 12 }}>Select Lesson:</label>
                          <select
                            id="lesson-select"
                            value={selectedLessonId}
                            onChange={e => {
                              setSelectedLessonId(e.target.value);
                              setActiveLessonTab(e.target.value);
                            }}
                            style={{ 
                              padding: '6px 12px', 
                              borderRadius: 6, 
                              border: '1px solid #e0e0e0', 
                              fontSize: 14, 
                              fontFamily: 'Space Mono, monospace',
                              width: '200px',
                              minWidth: '200px'
                            }}
                          >
                            {lessons.map(lesson => (
                              <option key={lesson.id} value={lesson.id} style={{ fontFamily: 'Space Mono, monospace' }}>{lesson.name}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <button
                            style={{
                              padding: '8px 18px',
                              borderRadius: 8,
                              background: '#4169e1',
                              color: '#fff',
                              fontWeight: 600,
                              fontSize: 15,
                              border: 'none',
                              boxShadow: '0 2px 8px rgba(65, 105, 225, 0.10)',
                              cursor: 'pointer',
                              marginBottom: 0
                            }}
                            onClick={() => setShowLessonHistoryModal(true)}
                          >
                            Lesson History
                          </button>
                          <button
                            style={{
                              padding: '8px 12px',
                              borderRadius: 8,
                              background: selectedLessonId === 'none' || !LESSON_LINKS[selectedLessonId] ? '#e0e0e0' : '#f7f7f7',
                              color: selectedLessonId === 'none' || !LESSON_LINKS[selectedLessonId] ? '#b0b0b0' : '#444',
                              fontWeight: 600,
                              fontSize: 15,
                              border: '1.5px solid #d0d0d0',
                              boxShadow: '0 2px 8px rgba(65, 105, 225, 0.04)',
                              cursor: selectedLessonId === 'none' || !LESSON_LINKS[selectedLessonId] ? 'not-allowed' : 'pointer',
                              marginBottom: 0,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              transition: 'background 0.2s, color 0.2s, border 0.2s',
                            }}
                            disabled={selectedLessonId === 'none' || !LESSON_LINKS[selectedLessonId]}
                            title={selectedLessonId === 'none' || !LESSON_LINKS[selectedLessonId] ? 'Select a lesson with a link to pop out' : 'Open lesson link in new window'}
                            onMouseEnter={e => {
                              if (!(selectedLessonId === 'none' || !LESSON_LINKS[selectedLessonId])) {
                                e.target.style.background = '#ededed';
                                e.target.style.color = '#222';
                                e.target.style.borderColor = '#b0b0b0';
                              }
                            }}
                            onMouseLeave={e => {
                              if (!(selectedLessonId === 'none' || !LESSON_LINKS[selectedLessonId])) {
                                e.target.style.background = '#f7f7f7';
                                e.target.style.color = '#444';
                                e.target.style.borderColor = '#d0d0d0';
                              }
                            }}
                            onClick={() => {
                              if (selectedLessonId === 'none' || !LESSON_LINKS[selectedLessonId]) return;
                              window.open(
                                LESSON_LINKS[selectedLessonId],
                                '_blank',
                                'toolbar=yes,scrollbars=yes,resizable=yes,top=0,left=0,width=' + window.screen.width + ',height=' + window.screen.height
                              );
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: selectedLessonId === 'none' || !LESSON_LINKS[selectedLessonId] ? '#e0e0e0' : '#f7f7f7', borderRadius: 6, padding: '0 2px', transition: 'background 0.2s, color 0.2s, border 0.2s' }}>
                              Pop out
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '20px', height: '20px', marginLeft: 4 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                              </svg>
                            </span>
                          </button>
                        </div>
                      </div>
                      {/* Progress bar for selected lesson */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '20px',
                        padding: '20px 0'
                      }}>
                        <div style={{ 
                          flex: 1,
                          height: '32px',
                          background: '#f8f9fa',
                          borderRadius: '16px',
                          overflow: 'hidden',
                          position: 'relative',
                          border: '2px solid #e0e0e0'
                        }}>
                          <div style={{
                            height: '100%',
                            background: 'linear-gradient(90deg, #4169e1 0%, #274bb5 100%)',
                            borderRadius: '14px',
                            width: `${Object.keys(robots).length > 0 ? ((lessonCompletions[selectedLessonId]?.size || 0) / Object.keys(robots).length) * 100 : 0}%`,
                            transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            boxShadow: '0 2px 8px rgba(65, 105, 225, 0.2)'
                          }} />
                        </div>
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '12px',
                          fontSize: '16px',
                          fontWeight: '600'
                        }}>
                          <span style={{ color: '#4169e1' }}>
                            {lessonCompletions[selectedLessonId]?.size || 0}
                          </span>
                          <span style={{ color: '#666' }}>/</span>
                          <span style={{ color: '#222' }}>
                            {Object.keys(robots).length}
                          </span>
                          <span style={{ color: '#666', fontSize: '14px' }}>
                            ({Object.keys(robots).length > 0 ? Math.round(((lessonCompletions[selectedLessonId]?.size || 0) / Object.keys(robots).length) * 100) : 0}%)
                          </span>
                        </div>
                      </div>
                      {/* Progress key below bar, left-aligned */}
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '8px', marginLeft: '2px', fontSize: '14px', color: '#666' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#4169e1' }}></div>
                          <span>Completed</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#e0e0e0' }}></div>
                          <span>In Progress</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Robots Section */}
                <div className="session-section fade-in-scale animate-on-mount-delay-3" 
                  style={{ minWidth: 0, height: minimizedSections.robotsAndPrograms ? 'auto' : '600px', overflow: 'hidden' }}
                >
                  <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => toggleSection('robotsAndPrograms')}>
                    <h2>Robots</h2>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSection('robotsAndPrograms');
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '4px',
                        transition: 'background-color 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        outline: 'none'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        strokeWidth={1.5} 
                        stroke="currentColor" 
                        style={{ 
                          width: '20px', 
                          height: '20px',
                          transform: minimizedSections.robotsAndPrograms ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s'
                        }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                  </div>
                  
                  {!minimizedSections.robotsAndPrograms && (
                    <>
                      <div style={{ marginBottom: '12px', padding: '8px 0px', backgroundColor: 'transparent', borderRadius: '6px', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '16px', height: '16px', color: '#666', flexShrink: 0 }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                        </svg>
                        {/* header tip */}
                        <p style={{ margin: 0, color: '#666', fontSize: '12px', lineHeight: '1.4', fontFamily: 'Space Mono, monospace' }}>
                          Once you have connected your micro:bit, robots that have sent data will appear here.
                        </p>
                      </div>
                      {/* Single column layout for Robots */}
                      <div style={{ 
                        minWidth: 0,
                        height: 'calc(100% - 60px)', // Subtract header height
                        overflow: 'hidden'
                      }}>
                        {/* Robots Section */}
                        <div style={{ minWidth: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                          <div style={{ marginBottom: '20px', flexShrink: 0 }}>
                            <h3 style={{ 
                              fontSize: '1.1rem', 
                              fontWeight: '600', 
                              color: '#222',
                              marginBottom: '0px'
                            }}>
                              Robots ({(() => {
                                const filteredRobots = getFilteredRobots();
                                const totalCount = Object.keys(robots).length;
                                const filteredCount = Object.keys(filteredRobots).length;
                                return robotSearchTerm.trim() ? `${filteredCount} of ${totalCount}` : totalCount;
                              })()})
                            </h3>
                          </div>
                          {/* Search bar and bulk action buttons positioned under the header */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px', padding: '12px 0', flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '16px', height: '16px', color: '#666' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                              </svg>
                              <input
                                type="text"
                                placeholder="Search robots by ID or tags..."
                                value={robotSearchTerm}
                                onChange={(e) => setRobotSearchTerm(e.target.value)}
                                style={{
                                  padding: '8px 12px',
                                  border: '1px solid #e0e0e0',
                                  borderRadius: '6px',
                                  fontSize: '14px',
                                  width: '290px',
                                  outline: 'none',
                                  transition: 'border-color 0.2s'
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#4169e1'}
                                onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
                              />
                              {Object.keys(robots).length > 0 && (
                                <button 
                                  className="clear-data-btn fade-in-scale animate-on-mount-delay-7" 
                                  onClick={clearRobots}
                                  style={{
                                    padding: '8px 12px',
                                    height: '36px',
                                    fontSize: '14px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                >
                                  Clear Robots
                                </button>
                              )}
                              {(() => {
                                const filteredRobots = getFilteredRobots();
                                const filteredDeviceIds = Object.keys(filteredRobots);
                                return filteredDeviceIds.length > 0 && (
                                  <button
                                    className="clear-data-btn fade-in-scale animate-on-mount-delay-6"
                                    onClick={() => {
                                      const allSelected = filteredDeviceIds.length > 0 && filteredDeviceIds.every(id => selectedRobotsForTagging.has(id));
                                      if (allSelected) {
                                        setSelectedRobotsForTagging(new Set());
                                      } else {
                                        setSelectedRobotsForTagging(new Set(filteredDeviceIds));
                                      }
                                    }}
                                    style={{
                                      padding: '8px 12px',
                                      height: '36px',
                                      fontSize: '14px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    }}
                                  >
                                    {(() => {
                                      const allSelected = filteredDeviceIds.length > 0 && filteredDeviceIds.every(id => selectedRobotsForTagging.has(id));
                                      return allSelected ? 'Deselect All' : 'Select All';
                                    })()}
                                  </button>
                                );
                              })()}
                            </div>
                            {selectedRobotsForTagging.size > 0 && (
                              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                <button
                                  className="fade-in-scale animate-on-mount-delay-4"
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontSize: '14px',
                                    padding: '8px 12px',
                                    height: '36px',
                                    background: '#dc3545',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    boxShadow: '0 2px 8px rgba(220, 53, 69, 0.15)',
                                    cursor: 'pointer',
                                    transition: 'background 0.2s'
                                  }}
                                  onClick={() => {
                                    if (!window.confirm(`Are you sure you want to delete the selected robot${selectedRobotsForTagging.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
                                    const updatedRobots = { ...robots };
                                    selectedRobotsForTagging.forEach(deviceId => {
                                      delete updatedRobots[deviceId];
                                    });
                                    setRobots(updatedRobots);
                                    setSelectedRobotsForTagging(new Set());
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '14px', height: '14px' }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                  </svg>
                                  Delete Selected
                                </button>
                                {selectedLessonId !== 'none' && (
                                  <button
                                    className="fade-in-scale animate-on-mount-delay-5"
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      fontSize: '14px',
                                      padding: '8px 12px',
                                      height: '36px',
                                      background: '#4169e1',
                                      color: '#fff',
                                      border: 'none',
                                      borderRadius: '6px',
                                      boxShadow: '0 2px 8px rgba(65, 105, 225, 0.15)',
                                      cursor: 'pointer',
                                      transition: 'background 0.2s'
                                    }}
                                    onClick={() => {
                                      setCompletedRobots(prev => {
                                        const newSet = new Set(prev);
                                        const allSelectedDone = Array.from(selectedRobotsForTagging).every(id => completedRobots.has(id));
                                        if (allSelectedDone) {
                                          selectedRobotsForTagging.forEach(id => newSet.delete(id));
                                        } else {
                                          selectedRobotsForTagging.forEach(id => newSet.add(id));
                                        }
                                        return newSet;
                                      });
                                    }}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '14px', height: '14px' }}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                    </svg>
                                    {allSelectedDone ? 'Undo Done' : 'Mark as Done'}
                                  </button>
                                )}
                                {selectedClassroom && (
                                  <button 
                                    className="fade-in-scale animate-on-mount-delay-5"
                                    onClick={openTagModal}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      fontSize: '14px',
                                      padding: '8px 12px',
                                      height: '36px',
                                      background: '#a259e1',
                                      color: '#fff',
                                      border: 'none',
                                      borderRadius: '6px',
                                      boxShadow: '0 2px 8px rgba(162, 89, 225, 0.15)',
                                      cursor: 'pointer',
                                      transition: 'background 0.2s'
                                    }}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '14px', height: '14px' }}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.732.699 2.431 0l4.318-4.318c.699-.699.699-1.732 0-2.431L9.568 3Z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
                                    </svg>
                                    Assign
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          
                          <div style={{ flex: 1, overflow: 'auto' }}>
                            {!selectedRobot && robotCardsView}
                            {robotDataView}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Cumulative Data Section */}
                <div className="session-section fade-in-scale animate-on-mount-delay-4">
                  <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => toggleSection('dataReceived')}>
                    <h2>Logs ({receivedData.length})</h2>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSection('dataReceived');
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '4px',
                        transition: 'background-color 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        outline: 'none'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        strokeWidth={1.5} 
                        stroke="currentColor" 
                        style={{ 
                          width: '20px', 
                          height: '20px',
                          transform: minimizedSections.dataReceived ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s'
                        }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                  </div>
                  {!minimizedSections.dataReceived && (
                    <>
                      <div style={{ marginBottom: '12px', padding: '8px 0px', backgroundColor: 'transparent', borderRadius: '6px', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '16px', height: '16px', color: '#666', flexShrink: 0 }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                        </svg>
                        {/* header tip */}
                        <p style={{ margin: 0, color: '#666', fontSize: '12px', lineHeight: '1.4', fontFamily: 'Space Mono, monospace' }}>
                          View data being sent to your receiver micro:bit in real-time.
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '16px', height: '16px', color: '#666' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                          </svg>
                          <input
                            type="text"
                            placeholder="Search logs..."
                            value={dataLogSearchTerm}
                            onChange={e => setDataLogSearchTerm(e.target.value)}
                            style={{
                              padding: '8px 12px',
                              border: '1px solid #e0e0e0',
                              borderRadius: '6px',
                              fontSize: '14px',
                              width: '300px',
                              outline: 'none',
                              transition: 'border-color 0.2s'
                            }}
                            onFocus={e => e.target.style.borderColor = '#4169e1'}
                            onBlur={e => e.target.style.borderColor = '#e0e0e0'}
                          />
                        </div>
                        {receivedData.length > 0 && (
                          <button 
                            className="clear-data-btn fade-in-scale animate-on-mount-delay-5" 
                            onClick={clearData}
                            style={{
                              padding: '8px 12px',
                              height: '36px',
                              fontSize: '14px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            Clear Data
                          </button>
                        )}
                      </div>
                      {dataView}
                    </>
                  )}
                </div>
              </div>
            )}
            {activeTab === 'notes' && (
              <div className="tab-content fade-in-scale animate-on-mount-delay-2">
                {/* Notes Section */}
                <div style={{ padding: '24px' }}>
                  <h2 style={{ marginBottom: '24px', color: '#222', fontWeight: '700' }}>Session Notes</h2>
                  
                  {/* Rich Text Formatting Toolbar */}
                  <div style={{ 
                    display: 'flex', 
                    gap: '8px', 
                    marginBottom: '16px', 
                    padding: '12px', 
                    backgroundColor: '#f8f9fa', 
                    borderRadius: '8px',
                    border: '1px solid #e9ecef'
                  }}>
                    {/* Bold Button */}
                    <button
                      onClick={() => hasTextSelection && toggleFormatting('bold')}
                      disabled={!hasTextSelection}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #dee2e6',
                        borderRadius: '6px',
                        background: notesFormatting.bold ? '#4169e1' : '#fff',
                        color: hasTextSelection ? (notesFormatting.bold ? '#fff' : '#495057') : '#ccc',
                        cursor: hasTextSelection ? 'pointer' : 'not-allowed',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        transition: 'all 0.2s ease',
                        opacity: hasTextSelection ? 1 : 0.5
                      }}
                      title={hasTextSelection ? "Bold (Ctrl+B)" : "Select text to format"}
                    >
                      B
                    </button>
                    
                    {/* Italic Button */}
                    <button
                      onClick={() => hasTextSelection && toggleFormatting('italic')}
                      disabled={!hasTextSelection}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #dee2e6',
                        borderRadius: '6px',
                        background: notesFormatting.italic ? '#4169e1' : '#fff',
                        color: hasTextSelection ? (notesFormatting.italic ? '#fff' : '#495057') : '#ccc',
                        cursor: hasTextSelection ? 'pointer' : 'not-allowed',
                        fontStyle: 'italic',
                        fontSize: '14px',
                        transition: 'all 0.2s ease',
                        opacity: hasTextSelection ? 1 : 0.5
                      }}
                      title={hasTextSelection ? "Italic (Ctrl+I)" : "Select text to format"}
                    >
                      I
                    </button>
                    
                    {/* Underline Button */}
                    <button
                      onClick={() => hasTextSelection && toggleFormatting('underline')}
                      disabled={!hasTextSelection}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #dee2e6',
                        borderRadius: '6px',
                        background: notesFormatting.underline ? '#4169e1' : '#fff',
                        color: hasTextSelection ? (notesFormatting.underline ? '#fff' : '#495057') : '#ccc',
                        cursor: hasTextSelection ? 'pointer' : 'not-allowed',
                        textDecoration: 'underline',
                        fontSize: '14px',
                        transition: 'all 0.2s ease',
                        opacity: hasTextSelection ? 1 : 0.5
                      }}
                      title={hasTextSelection ? "Underline (Ctrl+U)" : "Select text to format"}
                    >
                      U
                    </button>
                    
                    {/* Color Palette */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', color: hasTextSelection ? '#495057' : '#ccc' }}>Color:</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {[
                          '#000000', // Black
                          '#FF0000', // Red
                          '#FFA500', // Orange
                          '#FFD700', // Yellow (Gold)
                          '#228B22', // Forest Green
                          '#0000FF', // Blue
                          '#800080',  // Purple
                        ].map((color) => (
                          <button
                            key={color}
                            onClick={() => hasTextSelection && changeTextColor(color)}
                            disabled={!hasTextSelection}
                            style={{
                              width: '24px',
                              height: '24px',
                              backgroundColor: color,
                              border: notesFormatting.color === color ? '2px solid #333' : '1px solid #dee2e6',
                              borderRadius: '1000px',
                              cursor: hasTextSelection ? 'pointer' : 'not-allowed',
                              opacity: hasTextSelection ? 1 : 0.5,
                              transition: 'all 0.2s ease'
                            }}
                            title={hasTextSelection ? `Change text color to ${color}` : "Select text to change color"}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  {/* Enhanced Textarea (now contentEditable div) */}
                  <div
                    ref={notesTextareaRef}
                    contentEditable={true}
                    onInput={handleNotesInput}
                    onKeyDown={handleNotesKeyDown}
                    onFocus={handleNotesFocus}
                    onBlur={updateFormattingState}
                    onKeyUp={handleNotesKeyUp}
                    onMouseUp={handleNotesMouseUp}
                    placeholder="Enter your notes here..."
                    style={{
                      width: '100%',
                      minHeight: '300px',
                      padding: '16px',
                      border: '1px solid #e0e0e0',
                      borderRadius: '8px',
                      fontSize: '14px',
                      lineHeight: '1.6',
                      fontFamily: 'inherit',
                      color: notesFormatting.color,
                      backgroundColor: '#fff',
                      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)',
                      outline: 'none',
                      overflowY: 'auto',
                      wordWrap: 'break-word'
                    }}
                  />
                  
                  {/* Formatting Help */}
                  <div style={{ 
                    marginTop: '12px', 
                    padding: '12px', 
                    backgroundColor: '#f8f9fa', 
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: '#6c757d'
                  }}>
                    <strong>Tip:</strong> Select text and use the toolbar above to apply formatting.
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'settings' && (
              <div className="tab-content fade-in-scale animate-on-mount-delay-2">
                {/* Settings Section */}
                <div style={{ padding: '24px' }}>
                  <h2 style={{ marginBottom: '24px', color: '#222', fontWeight: '700' }}>Session Settings</h2>
                  
                  {/* Classroom Settings */}
                  <div style={{ 
                    marginBottom: '32px',
                    padding: '24px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '12px',
                    border: '1px solid #e9ecef'
                  }}>
                    <h3 style={{ marginBottom: '16px', color: '#222', fontWeight: '600' }}>
                      Classroom
                    </h3>
                    <p style={{ 
                      color: '#666', 
                      fontSize: '14px', 
                      marginBottom: '20px',
                      lineHeight: '1.5'
                    }}>
                      Change the classroom associated with this session. When you apply the change, <strong>all robot assignments will be cleared.</strong> Select a new classroom and click "Apply Classroom Change" to confirm.
                    </p>
                    
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '8px', 
                        fontWeight: '500', 
                        color: '#333' 
                      }}>
                      </label>
                      {sessionData?.classroomId ? (
                        <div style={{
                          display: 'inline-block',
                          padding: '8px 12px',
                          backgroundColor: getClassroomById(sessionData.classroomId)?.color || '#4169e1',
                          color: '#fff',
                          borderRadius: '6px',
                          fontSize: '14px',
                          fontWeight: '500'
                        }}>
                          Current Classroom: {getClassroomById(sessionData.classroomId)?.name}
                        </div>
                      ) : (
                        <div style={{
                          display: 'inline-block',
                          padding: '8px 12px',
                          backgroundColor: '#e0e0e0',
                          color: '#666',
                          borderRadius: '6px',
                          fontSize: '14px',
                          fontWeight: '500'
                        }}>
                          No classroom assigned
                        </div>
                      )}
                    </div>
                    
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '8px', 
                        fontWeight: '500', 
                        color: '#333' 
                      }}>
                        Change to:
                      </label>
                      <select
                        value={hasUnsavedChanges ? selectedClassroom?.id || '' : ''}
                        onChange={(e) => handleClassroomChange(e.target.value || null)}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          border: '1px solid #e0e0e0',
                          borderRadius: '8px',
                          fontSize: '14px',
                          backgroundColor: '#fff',
                          color: '#222',
                          fontFamily: 'Space Mono, monospace'
                        }}
                      >
                        <option value="">{hasUnsavedChanges ? (selectedClassroom?.name || 'No classroom') : 'Select Classroom...'}</option>
                        <option value="no-classroom">No classroom</option>
                        {classrooms.map(classroom => (
                          <option key={classroom.id} value={classroom.id}>
                            {classroom.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    {/* Apply button for classroom change */}
                    <div style={{ marginTop: '12px' }}>
                      <button
                        onClick={applyClassroomChange}
                        disabled={!hasUnsavedChanges}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: hasUnsavedChanges ? 'pointer' : 'not-allowed',
                          backgroundColor: hasUnsavedChanges ? '#4169e1' : '#e0e0e0',
                          color: hasUnsavedChanges ? '#fff' : '#888',
                          fontFamily: 'Space Mono, monospace',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {hasUnsavedChanges ? 'Apply Classroom Change' : 'No Changes to Apply'}
                      </button>
                    </div>
                  </div>
                  
                  {/* Session Information */}
                  {/* <div style={{ 
                    padding: '24px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '12px',
                    border: '1px solid #e9ecef'
                  }}>
                    <h3 style={{ marginBottom: '16px', color: '#222', fontWeight: '600' }}>
                      Session Information
                    </h3>
                    <div style={{ display: 'grid', gap: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '500', color: '#666' }}>Session ID:</span>
                        <span style={{ fontFamily: 'monospace', color: '#222' }}>{sessionData?.id}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '500', color: '#666' }}>Status:</span>
                        <span style={{ 
                          color: sessionStatus === 'active' ? '#28a745' : sessionStatus === 'paused' ? '#ffc107' : '#dc3545',
                          fontWeight: '500',
                          textTransform: 'capitalize'
                        }}>
                          {sessionStatus}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '500', color: '#666' }}>Connected Robots:</span>
                        <span style={{ color: '#222', fontWeight: '500' }}>{Object.keys(robots).length}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '500', color: '#666' }}>Classroom:</span>
                        <span style={{ color: '#222' }}>{selectedClassroom?.name || 'None'}</span>
                      </div>
                    </div>
                  </div> */}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* NEW: Robot Assignment Modal */}
      {showAssignmentModal && selectedRobotForAssignment && sessionData?.classroomId && (
        <div className="modal-overlay" onClick={() => setShowAssignmentModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>Assign Robot: {selectedRobotForAssignment}</h2>
              <button className="modal-close" onClick={() => setShowAssignmentModal(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ marginBottom: '10px', color: '#222' }}>Assign to Student</h3>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      assignRobotToStudent(selectedRobotForAssignment, e.target.value);
                      setShowAssignmentModal(false);
                    }
                  }}
                  defaultValue=""
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: 'monospace'
                  }}
                >
                  <option value="">Select a student...</option>
                  {getClassroomById(sessionData.classroomId)?.students?.map(student => (
                    <option key={student.id} value={student.id}>
                      {student.name} ({student.email})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ marginBottom: '10px', color: '#222' }}>Assign to Group</h3>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      assignRobotToGroup(selectedRobotForAssignment, e.target.value);
                      setShowAssignmentModal(false);
                    }
                  }}
                  defaultValue=""
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: 'monospace'
                  }}
                >
                  <option value="">Select a group...</option>
                  {getClassroomById(sessionData.classroomId)?.groups?.map(group => (
                    <option key={group.id} value={group.id}>
                      {group.name} ({group.students.length} students)
                    </option>
                  ))}
                </select>
              </div>

              {robots[selectedRobotForAssignment]?.assignedTo && (
                <div style={{ marginTop: '20px', padding: '12px', background: '#fff3cd', borderRadius: '6px', border: '1px solid #ffeaa7' }}>
                  {/* <h4 style={{ margin: '0 0 8px 0', color: '#856404' }}>Current Assignment</h4> */}
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '16px', height: '16px', marginRight: '6px' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
                    </svg>
                    <p style={{ margin: '0', color: '#856404' }}>
                      Currently assigned to: {robots[selectedRobotForAssignment].assignedTo.name}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      unassignRobot(selectedRobotForAssignment);
                      setShowAssignmentModal(false);
                    }}
                    style={{
                      background: '#dc3545',
                      color: 'white',
                      marginLeft: 'auto',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontFamily: 'monospace'
                    }}
                  >
                    Unassign Robot
                  </button>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowAssignmentModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW: Tag Modal */}
      {showTagModal && sessionData?.classroomId && (
        <div className="modal-overlay" onClick={() => setShowTagModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>Assign {selectedRobotsForTagging.size} Robot{selectedRobotsForTagging.size !== 1 ? 's' : ''}</h2>
              <button className="modal-close" onClick={() => setShowTagModal(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              {!getClassroomById(sessionData.classroomId) ? (
                <div style={{ color: '#dc3545', fontWeight: 500, padding: '24px 0', textAlign: 'center' }}>
                  Please select a classroom to tag robots.
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ marginBottom: '10px', color: '#222' }}>Assign to Student</h3>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          assignTagToStudent(e.target.value);
                        }
                      }}
                      defaultValue=""
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #e0e0e0',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontFamily: 'monospace'
                      }}
                    >
                      <option value="">Select a student...</option>
                      {getClassroomById(sessionData.classroomId)?.students?.map(student => (
                        <option key={student.id} value={student.id}>
                          {student.name} ({student.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ marginBottom: '10px', color: '#222' }}>Assign to Group</h3>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          assignTagToGroup(e.target.value);
                        }
                      }}
                      defaultValue=""
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #e0e0e0',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontFamily: 'monospace'
                      }}
                    >
                      <option value="">Select a group...</option>
                      {getClassroomById(sessionData.classroomId)?.groups?.map(group => (
                        <option key={group.id} value={group.id}>
                          {group.name} ({group.students.length} students)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginTop: '20px', padding: '12px', background: '#fff3cd', borderRadius: '6px', border: '1px solid #ffeaa7' }}>
                    <h4 style={{ margin: '0 0 8px 0', color: '#856404' }}>Remove Assignments</h4>
                    <p style={{ margin: '0', color: '#856404' }}>
                      Remove assignments from {selectedRobotsForTagging.size} selected robot{selectedRobotsForTagging.size !== 1 ? 's' : ''}
                    </p>
                    <button
                      onClick={removeTagsFromSelectedRobots}
                      style={{
                        marginTop: '8px',
                        background: '#dc3545',
                        color: 'white',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      Remove Assignments
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowTagModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW: Robot Details Popup */}
      {showRobotDetailsPopup && selectedRobotForPopup && (
        <div className="modal-overlay" onClick={() => setShowRobotDetailsPopup(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h2>Robot Details: {selectedRobotForPopup}</h2>
              <button className="modal-close" onClick={() => setShowRobotDetailsPopup(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', height: '100%', overflow: 'hidden' }}>
                {/* Recent Programs */}
                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', fontWeight: '600', color: '#222' }}>
                    Recent Programs ({getRobotPrograms(selectedRobotForPopup).length})
                  </h3>
                  <input
                    type="text"
                    placeholder="Search recent programs..."
                    value={robotDetailsProgramsSearch}
                    onChange={e => setRobotDetailsProgramsSearch(e.target.value)}
                    style={{ marginBottom: '10px', padding: '8px 12px', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '14px', fontFamily: 'Space Mono, monospace' }}
                  />
                  <div style={{ flex: 1, overflow: 'auto', paddingRight: '8px' }}>
                    {(() => {
                      const programs = getRobotPrograms(selectedRobotForPopup);
                      const filteredPrograms = robotDetailsProgramsSearch.trim()
                        ? programs.filter(p =>
                            p.program.toLowerCase().includes(robotDetailsProgramsSearch.toLowerCase()) ||
                            p.button.toLowerCase().includes(robotDetailsProgramsSearch.toLowerCase()) ||
                            (p.robotName && p.robotName.toLowerCase().includes(robotDetailsProgramsSearch.toLowerCase())) ||
                            p.timestamp.toLowerCase().includes(robotDetailsProgramsSearch.toLowerCase())
                          )
                        : programs;
                      if (filteredPrograms.length === 0) {
                        return (
                          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666', fontStyle: 'italic' }}>
                            No programs found
                          </div>
                        );
                      }
                      return filteredPrograms.slice(0, 10).map((program, index) => (
                        <div 
                          key={`${program.deviceId}-${program.timestamp}-${index}`}
                          style={{
                            background: '#f8f9fa',
                            borderRadius: '12px',
                            padding: '16px',
                            marginBottom: '12px',
                            border: '1px solid #e0e0e0',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#4169e1', fontFamily: 'monospace' }}>
                                  {program.deviceId}
                                </span>
                                {program.button === 'PLAY' ? (
                                  <img src={playImg} alt="Play" style={{ width: 18, height: 18, verticalAlign: 'middle' }} />
                                ) : program.button === 'TEST' ? (
                                  <img src={testImg} alt="Test" style={{ width: 18, height: 18, verticalAlign: 'middle' }} />
                                ) : (
                                  <span style={{ fontSize: '0.75rem', color: '#666', background: '#e3eafe', padding: '2px 6px', borderRadius: '4px', fontWeight: '500' }}>{program.button}</span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '8px' }}>
                                {formatDateTime(program.timestamp)}
                              </div>
                            </div>
                          </div>
                          
                          <div style={{ background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e0e0e0', fontFamily: 'monospace', fontSize: '0.85rem', color: '#333', wordBreak: 'break-word', marginBottom: '8px' }}>
                            {renderProgramAsButtons(program.program)}
                          </div>
                          
                          <div style={{ 
                            display: 'flex', 
                            gap: '8px',
                            justifyContent: 'flex-end'
                          }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setProgramToAnimate(program);
                                resetRobotAnim(program.program);
                                setShowProgramAnimationModal(true);
                              }}
                              style={{
                                padding: '4px 8px',
                                background: '#4169e1',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: '500',
                                fontFamily: 'var(--font-body)',
                                transition: 'background 0.2s ease'
                              }}
                              onMouseEnter={(e) => e.target.style.background = '#274bb5'}
                              onMouseLeave={(e) => e.target.style.background = '#4169e1'}
                            >
                              View Program
                            </button>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Robot Logs */}
                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', fontWeight: '600', color: '#222' }}>
                    Logs ({getRobotLogs(selectedRobotForPopup).length})
                  </h3>
                  <input
                    type="text"
                    placeholder="Search logs..."
                    value={robotDetailsLogsSearch}
                    onChange={e => setRobotDetailsLogsSearch(e.target.value)}
                    style={{ marginBottom: '10px', padding: '8px 12px', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '14px', fontFamily: 'Space Mono, monospace' }}
                  />
                  <div style={{ flex: 1, overflow: 'auto', paddingRight: '8px' }}>
                    {(() => {
                      const logs = getRobotLogs(selectedRobotForPopup);
                      const filteredLogs = robotDetailsLogsSearch.trim()
                        ? logs.filter(item =>
                            item.data.toLowerCase().includes(robotDetailsLogsSearch.toLowerCase()) ||
                            item.timestamp.toLowerCase().includes(robotDetailsLogsSearch.toLowerCase())
                          )
                        : logs;
                      if (filteredLogs.length === 0) {
                        return (
                          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666', fontStyle: 'italic' }}>
                            No logs found
                          </div>
                        );
                      }
                      return filteredLogs.map((item, idx) => (
                        <div key={idx} style={{
                          background: '#f8f9fa',
                          borderRadius: '8px',
                          padding: '12px',
                          marginBottom: '8px',
                          border: '1px solid #e0e0e0',
                          fontSize: '0.85rem'
                        }}>
                          <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '4px', fontFamily: 'monospace' }}>
                            {formatDateTime(item.timestamp)}
                          </div>
                          <div style={{ color: '#333', fontFamily: 'monospace', wordBreak: 'break-word' }}>
                            {item.data}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowRobotDetailsPopup(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Serial Port Selection Popup Overlay */}
      {showSerialPopup && (
        <div className="serial-popup-overlay fade-in" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.55)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: '23vw',
          paddingBottom: '20vh',
          transition: 'background 0.4s cubic-bezier(0.4,0,0.2,1)',
        }}>
          <img
            src={connectionGraphic}
            alt="Connection Graphic"
            className="connection-bounce"
            style={{
              width: 450,
              height: 450,
              objectFit: 'contain',
              borderRadius: 16,
              boxShadow: '0 2px 12px rgba(65,105,225,0.10)',
              maxWidth: '90vw',
              maxHeight: '90vh',
              transition: 'opacity 0.4s cubic-bezier(0.4,0,0.2,1)'
            }}
          />
        </div>
      )}
      {/* 5. Add the new modal at the bottom of the component */}
      {showProgramAnimationModal && programToAnimate && (
        <div className="modal-overlay" onClick={() => setShowProgramAnimationModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="modal-header" style={{ width: '100%' }}>
              <h2>View Program</h2>
              <button className="modal-close" onClick={() => setShowProgramAnimationModal(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Program display as icons */}
            <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap', justifyContent: 'center' }}>
              {parseProgramCommands(programToAnimate.program).map((cmd, idx) => (
                <span key={idx} style={{
                  fontWeight: idx === robotAnimState.step ? 700 : 400,
                  color: idx === robotAnimState.step ? '#4169e1' : '#333',
                  fontFamily: 'monospace',
                  fontSize: '1rem',
                  opacity: idx === robotAnimState.step ? 1 : 0.6,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: idx === robotAnimState.step ? '#e3eafe' : 'transparent',
                  transition: 'all 0.2s'
                }}>{cmd}</span>
              ))}
            </div>
            {/* Dotted grid with robot */}
            <div style={{ position: 'relative', width: 320, height: 320, margin: '0 auto', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width={320} height={320} style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }}>
                {/* Draw grid dots - show actual grid size */}
                {Array.from({ length: robotAnimState.gridSize }).map((_, row) =>
                  Array.from({ length: robotAnimState.gridSize }).map((_, col) => (
                    <circle
                      key={`dot-${row}-${col}`}
                      cx={32 + col * (256 / (robotAnimState.gridSize - 1))}
                      cy={32 + row * (256 / (robotAnimState.gridSize - 1))}
                      r={4 * robotAnimState.robotScale}
                      fill="#bbb"
                      opacity={0.5}
                    />
                  ))
                )}
              </svg>
              {/* Robot graphic */}
              <img
                src={robotGraphic}
                alt="Robot"
                className="program-animation-robot"
                style={{
                  left: 32 + (robotAnimState.x + robotAnimState.offsetX) * (256 / (robotAnimState.gridSize - 1)) - (30 * robotAnimState.robotScale),
                  top: 32 + (robotAnimState.y + robotAnimState.offsetY) * (256 / (robotAnimState.gridSize - 1)) - (35 * robotAnimState.robotScale),
                  width: 60 * robotAnimState.robotScale,
                  height: 70 * robotAnimState.robotScale,
                  zIndex: 2,
                  transform: `rotate(${robotAnimState.dir * 90}deg)`
                }}
              />
            </div>
            {/* Controls */}
            <div style={{ display: 'flex', gap: 16, marginTop: 24, alignItems: 'center', justifyContent: 'center' }}>
              <button onClick={() => stepRobotAnim(false)} disabled={robotAnimState.step === 0} style={{ padding: 8, borderRadius: 8, border: '1px solid #ccc', background: '#f7f9fb', cursor: robotAnimState.step === 0 ? 'not-allowed' : 'pointer' }}>
                {/* Backward SVG */}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 28, height: 28, opacity: robotAnimState.step === 0 ? 0.4 : 1 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 0 1 0-1.954l7.108-4.061A1.125 1.125 0 0 1 21 8.689v8.122ZM11.25 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 0 1 0-1.954l7.108-4.061a1.125 1.125 0 0 1 1.683.977v8.122Z" />
                </svg>
              </button>
              <button onClick={handlePlayPause} style={{ padding: 8, borderRadius: 8, border: '1px solid #4169e1', background: robotAnimState.playing ? '#e3eafe' : '#4169e1', color: robotAnimState.playing ? '#4169e1' : '#fff', fontWeight: 700, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {robotAnimState.playing ? (
                  // Pause SVG
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 28, height: 28 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                  </svg>
                ) : (
                  // Play SVG
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 28, height: 28 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                  </svg>
                )}
              </button>
              <button onClick={() => stepRobotAnim(true)} disabled={robotAnimState.step >= parseProgramCommands(programToAnimate.program).length} style={{ padding: 8, borderRadius: 8, border: '1px solid #ccc', background: '#f7f9fb', cursor: robotAnimState.step >= parseProgramCommands(programToAnimate.program).length ? 'not-allowed' : 'pointer' }}>
                {/* Forward SVG */}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 28, height: 28, opacity: robotAnimState.step >= parseProgramCommands(programToAnimate.program).length ? 0.4 : 1 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061A1.125 1.125 0 0 1 3 16.811V8.69ZM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061a1.125 1.125 0 0 1-1.683-.977V8.69Z" />
                </svg>
              </button>
              <button onClick={() => { resetRobotAnim(programToAnimate.program); }} style={{ padding: 8, borderRadius: 8, border: '1px solid #ccc', background: '#fff', color: '#4169e1', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* Reset SVG */}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 28, height: 28 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
      {showResumeConflictModal && (
        <div className="modal-overlay" onClick={() => {
          setShowResumeConflictModal(false);
          setPendingResume(false);
        }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Active Session Detected</h2>
            </div>
            <div className="modal-body">
              <p>There is already an active running session. If you resume this session, the active session will be paused. Proceed?</p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => {
                setShowResumeConflictModal(false);
                setPendingResume(false);
              }}>
                Cancel
              </button>
              <button className="btn-primary" onClick={() => {
                // Pause all other active sessions
                loadSessions(user).then(savedSessions => {
                  const updatedSessions = savedSessions.map(s =>
                    s.status === 'active' && String(s.id) !== String(sessionData?.id)
                      ? { ...s, status: 'paused' }
                      : s
                  );
                  saveSessions(user, updatedSessions);
                  setShowResumeConflictModal(false);
                  setPendingResume(false);
                  resumeSession();
                });
              }}>
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}
      {showEndSessionModal && (
        <div className="modal-overlay" onClick={() => setShowEndSessionModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>End Session</h2>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to end this session? This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowEndSessionModal(false)}>
                Cancel
              </button>
              <button className="btn-primary" style={{ background: '#dc3545', borderColor: '#dc3545' }} onClick={() => {
                setShowEndSessionModal(false);
                endSession();
              }}>
                End Session
              </button>
            </div>
          </div>
        </div>
      )}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Session</h2>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete this session? This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>
              <button className="btn-primary" style={{ background: '#dc3545', borderColor: '#dc3545' }} onClick={() => {
                // Actually delete the session
                if (!sessionData) return;
                loadSessions(user).then(savedSessions => {
                  const filteredSessions = savedSessions.filter(s => String(s.id) !== String(sessionData.id));
                  saveSessions(user, filteredSessions);
                  setShowDeleteModal(false);
                  navigate('/sessions');
                });
              }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {showInactivityModal && (
        <div className="modal-overlay" onClick={() => setShowInactivityModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ marginBottom: 0, textAlign: 'center' }}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 60, height: 60, color: '#4169e1', margin: '0 auto' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <div className="modal-header" style={{ display: 'block', textAlign: 'center', justifyContent: 'center' }}>
              <h2>Session Paused</h2>
            </div>
            <div className="modal-body" style={{ marginBottom: 0, textAlign: 'center' }}>
              <p>Since you've been inactive for a while, your session has been paused.</p>
            </div>
            <div className="modal-footer" style={{ display: 'block', marginBottom: 0, textAlign: 'center' }}>
              <p style={{ marginTop: 0, marginBottom: 0, fontSize: 14, color: '#808080', textAlign: 'center' }}>Click anywhere to dismiss</p>
            </div>
          </div>
        </div>
      )}
      {showLessonHistoryModal && (
        <div className="modal-overlay" onClick={() => setShowLessonHistoryModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '80vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h2>Lesson Completion History</h2>
              <button className="modal-close" onClick={() => setShowLessonHistoryModal(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid #e0e0e0' }}>Lesson</th>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid #e0e0e0' }}>Completed Robots</th>
                  </tr>
                </thead>
                <tbody>
                  {lessons.filter(lesson => lesson.id !== 'none').filter(lesson => 
                    lessonCompletions[lesson.id] && lessonCompletions[lesson.id].size > 0
                  ).map(lesson => (
                    <tr key={lesson.id}>
                      <td style={{ padding: '8px', borderBottom: '1px solid #e0e0e0', fontWeight: 600 }}>{lesson.name}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #e0e0e0' }}>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {Array.from(lessonCompletions[lesson.id]).map(deviceId => {
                            const robot = robots[deviceId];
                            let tag = '';
                            if (robot?.assignedTo) {
                              tag = robot.assignedTo.type === 'student'
                                ? robot.assignedTo.name
                                : `${robot.assignedTo.name} (Group)`;
                            }
                            return (
                              <li key={deviceId} style={{ marginBottom: 2 }}>
                                <span style={{ fontFamily: 'Space Mono, monospace', fontWeight: 600 }}>{deviceId}</span>
                                {tag && (
                                  <span style={{ color: '#4169e1', marginLeft: 8, fontWeight: 500, fontSize: 13 }}>
                                    [{tag}]
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
                <p style={{ margin: 0, color: '#666', fontSize: '14px', lineHeight: '1.5' }}>
                  Tip: Lessons with no completed robots are not shown here.
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowLessonHistoryModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {showLeaveUnsavedModal && (
        <div className="modal-overlay" onClick={() => setShowLeaveUnsavedModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h2>Unsaved Changes</h2>
            </div>
            <div className="modal-body">
              <p>Wait! You have unsaved data you're leaving behind...</p>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={async () => {
                setShowLeaveUnsavedModal(false);
                if (pendingLeaveAction) await pendingLeaveAction();
              }}>
                Leave
              </button>
              <button className="btn-primary" style={{ background: '#4169e1', borderColor: '#4169e1' }} onClick={async () => {
                await handleSaveSession();
                setShowLeaveUnsavedModal(false);
                if (pendingLeaveAction) await pendingLeaveAction();
              }}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SessionView; 