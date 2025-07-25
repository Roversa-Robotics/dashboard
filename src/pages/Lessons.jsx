import React, { useState } from 'react';
import Sidebar from './Sidebar';
import './Sessions.css';
import './Classrooms.css';
import { db, auth } from '../Firebase.jsx';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

const lessonDetailsTitleStyle = `
.session-view-content .lesson-details-title {
  font-family: 'Sniglet', serif !important;
  font-weight: 500 !important;
}
`;

const LESSONS = [
  {
    id: 'lesson1',
    title: 'I Feel',
    overview: 'Code Roversa to move on a grid toward an emotion based on a scenario.',
    age: 'Pre-K - 2nd',
    link: 'https://docs.google.com/document/d/15hDBUGjhOFpLSPmmkFJMXMcShzhLqdaBW9WTI3UOFXs/edit?tab=t.0#heading=h.a6lqxihc6dhl',
  },
  {
    id: 'lesson2',
    title: 'Hungry, Hungry Robot',
    overview: 'Code Roversa to move on a grid to bring a story to life.',
    age: 'Pre-K - 2nd',
    link: 'https://docs.google.com/document/d/13E9Lz6l0eP4ZT-kJBxJST35SX4427fOw6XLlfcZpwm0/edit?tab=t.0#heading=h.a6lqxihc6dhl',
  },
  {
    id: 'lesson3',
    title: 'Grid Challenges',
    overview: 'Code Roversa to move on a grid toward certain objectives.',
    age: '3rd - 5th',
    link: 'https://docs.google.com/document/d/1qHoE0t6diltiHJbYG4hKiGGIJOQFLw3rRNMmLgWc-1E/edit?tab=t.0#heading=h.a6lqxihc6dhl',
  },
  {
    id: 'lesson4',
    title: 'Duck Duck Robot',
    overview: 'Match numerals to number of obejcts and solve number facts by coding Roversa to the correct answer.',
    age: 'Pre-K - 2nd',
    link: 'https://docs.google.com/document/d/14jte14tL0Txgm1CdY9kZsbov0lZDoqv7UyhECFW8ioI/edit?tab=t.0#heading=h.a6lqxihc6dhl',
  },
];

const DEFAULT_LESSON_IDS = LESSONS.map(l => l.id);

function isValidUrl(url) {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export default function Lessons() {
  const [activeTab, setActiveTab] = useState(LESSONS[0].id);
  const [search, setSearch] = useState('');
  const [lessons, setLessons] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newLesson, setNewLesson] = useState({ title: '', overview: '', age: '', link: '' });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [lessonToDelete, setLessonToDelete] = useState(null);
  const filteredLessons = lessons.filter(l =>
    l.title.toLowerCase().includes(search.toLowerCase()) ||
    l.overview.toLowerCase().includes(search.toLowerCase())
  );
  const lesson = filteredLessons.find(l => l.id === activeTab) || filteredLessons[0];
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!lesson && filteredLessons.length > 0) {
      setActiveTab(filteredLessons[0].id);
    }
  }, [search]);

  // Helper to load lessons from Firestore
  const loadLessons = async (user) => {
    if (!user) return;
    const docRef = doc(db, 'users', user.uid, 'appdata', 'lessons');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const loaded = docSnap.data().lessons || [];
      // If user has no lessons, initialize with defaults
      if (loaded.length === 0) {
        await setDoc(docRef, { lessons: [...LESSONS] });
        setLessons([...LESSONS]);
      } else {
        setLessons(loaded);
      }
    } else {
      // No lessons doc: initialize with defaults
      await setDoc(docRef, { lessons: [...LESSONS] });
      setLessons([...LESSONS]);
    }
  };

  // Helper to save lessons to Firestore
  const saveLessons = async (user, lessonsArr) => {
    if (!user) return;
    const docRef = doc(db, 'users', user.uid, 'appdata', 'lessons');
    await setDoc(docRef, { lessons: lessonsArr });
  };

  // On mount, load lessons for the current user
  React.useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        navigate('/login');
      } else {
        loadLessons(user);
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // Save lessons to localStorage whenever they change
  React.useEffect(() => {
    // localStorage.setItem('roversaLessons', JSON.stringify(lessons));
  }, [lessons]);

  const handleCreateLesson = async () => {
    if (!newLesson.title.trim()) return;
    const user = auth.currentUser;
    const docRef = doc(db, 'users', user.uid, 'appdata', 'lessons');
    const docSnap = await getDoc(docRef);
    let lessonsArr = [];
    if (docSnap.exists()) {
      lessonsArr = docSnap.data().lessons || [];
      // If user has no lessons, initialize with defaults
      if (lessonsArr.length === 0) {
        lessonsArr = [...LESSONS];
      }
    } else {
      lessonsArr = [...LESSONS];
    }
    const id = 'lesson' + (Date.now());
    const updatedLessons = [
      ...lessonsArr,
      { id, title: newLesson.title, overview: newLesson.overview, age: newLesson.age, link: newLesson.link }
    ];
    await setDoc(docRef, { lessons: updatedLessons });
    setLessons(updatedLessons);
    setActiveTab(id);
    setShowCreateModal(false);
    setNewLesson({ title: '', overview: '', age: '', link: '' });
  };

  const handleDeleteLesson = async (id) => {
    const user = auth.currentUser;
    const updated = lessons.filter(l => l.id !== id);
    await saveLessons(user, updated);
    setLessons(updated);
    // If the deleted lesson is active, switch to another
    if (activeTab === id) {
      const next = updated[0]?.id || '';
      setActiveTab(next);
    }
    setShowDeleteModal(false);
    setLessonToDelete(null);
  };

  return (
    <>
      <style>{lessonDetailsTitleStyle}</style>
      <div className="dashboard-container">
        <Sidebar className="slide-in-from-left" />
        <div className="main-content slide-in-from-bottom">
          <div className="top-bar slide-in-from-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1 className="dashboard-welcome" style={{ fontFamily: 'Bevan, serif', fontWeight: 400 }}>
              Lessons
            </h1>
            <button
              className="create-classroom-btn"
              onClick={() => setShowCreateModal(true)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="20" height="20" style={{ minWidth: 20 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Create Lesson
            </button>
          </div>
          <div className="session-view-content" style={{ background: 'white', borderRadius: 18, boxShadow: '0 4px 24px rgba(65, 105, 225, 0.08)', padding: 32, display: 'flex', gap: 32 }}>
            {/* Vertical Tabs List */}
            <div style={{ minWidth: 280, maxWidth: 320, borderRight: '2px solid #e0e0e0', paddingRight: 24 }}>
              {/* Search bar with icon */}
              <div style={{ position: 'relative', marginBottom: 18 }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 2, background: 'transparent' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="#666" style={{ width: 20, height: 20, background: 'transparent', display: 'block' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder="Search lessons..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 40px',
                    borderRadius: 8,
                    border: '1.5px solid #e0e0e0',
                    fontSize: 16,
                    outline: 'none',
                    transition: 'border 0.2s',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#4169e1')}
                  onBlur={e => (e.target.style.borderColor = '#e0e0e0')}
                />
              </div>
              {filteredLessons.length === 0 && (
                <div style={{ color: '#888', fontStyle: 'italic', marginTop: 24 }}>No lessons found.</div>
              )}
              {filteredLessons.map(l => (
                <LessonTabWithTrash
                  key={l.id}
                  lesson={l}
                  isActive={activeTab === l.id}
                  onClick={() => setActiveTab(l.id)}
                  onDelete={() => { setLessonToDelete(l); setShowDeleteModal(true); }}
                  canDelete={!DEFAULT_LESSON_IDS.includes(l.id)}
                />
              ))}
            </div>
            {/* Lesson Details */}
            <div
              key={activeTab}
              className="slide-in-from-bottom"
              style={{
                flex: 1,
                padding: 24,
                background: '#f7f9fb',
                borderRadius: 12,
                minHeight: 220,
                position: 'relative',
              }}
            >
              {lesson ? (
                <>
                  {/* Trash button in expanded lesson details for user-created lessons */}
                  {!DEFAULT_LESSON_IDS.includes(lesson.id) && (
                    <button
                      onClick={() => { setLessonToDelete(lesson); setShowDeleteModal(true); }}
                      title="Delete lesson"
                      style={{
                        position: 'absolute',
                        right: 30,
                        top: 27,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        background: 'transparent',
                        color: '#dc3545',
                        border: '1px solid #dc3545',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                        transition: 'background 0.2s, border-color 0.2s, color 0.2s',
                        zIndex: 2,
                      }}
                      onMouseEnter={e => {
                        e.target.style.background = '#dc3545';
                        e.target.style.color = '#fff';
                      }}
                      onMouseLeave={e => {
                        e.target.style.background = 'transparent';
                        e.target.style.color = '#dc3545';
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 16, height: 16 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                      Delete lesson
                    </button>
                  )}
                  <h2 className="lesson-details-title" style={{ color: '#4169e1', fontWeight: 700, marginBottom: 12 }}>{lesson.title}</h2>
                  <div style={{ marginBottom: 18, fontSize: 16, color: '#444' }}>
                    <strong>Overview:</strong> {lesson.overview}
                  </div>
                  <div style={{ marginBottom: 18, fontSize: 16, color: '#444' }}>
                    <strong>Grade Levels:</strong> {lesson.age}
                  </div>
                  <a
                    href={isValidUrl(lesson.link) ? lesson.link : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-block',
                      padding: '10px 28px',
                      background: isValidUrl(lesson.link) ? '#4169e1' : '#e0e0e0',
                      color: isValidUrl(lesson.link) ? '#fff' : '#b0b0b0',
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: 16,
                      textDecoration: 'none',
                      boxShadow: '0 2px 8px rgba(65, 105, 225, 0.10)',
                      marginTop: 8,
                      transition: 'background 0.2s',
                      cursor: isValidUrl(lesson.link) ? 'pointer' : 'not-allowed',
                      pointerEvents: isValidUrl(lesson.link) ? 'auto' : 'none',
                    }}
                    tabIndex={isValidUrl(lesson.link) ? 0 : -1}
                    aria-disabled={!isValidUrl(lesson.link)}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      View Lesson
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 22, height: 22, marginLeft: 0, display: 'inline-block' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                    </span>
                  </a>
                </>
              ) : (
                <div style={{ color: '#888', fontStyle: 'italic', marginTop: 24 }}>No lesson selected.</div>
              )}
            </div>
          </div>
        </div>
        {/* Create Lesson Modal */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, paddingTop: 18 }}>
              <div className="modal-header" style={{ marginBottom: 8 }}>
                <h2>Create Lesson</h2>
                <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="modal-body">
                <div style={{ marginBottom: 18 }}>
                  <label style={{ fontWeight: 600, color: '#4169e1', marginBottom: 6, display: 'block', fontFamily: 'Space Mono, monospace' }}>Lesson Name <span style={{ color: 'red' }}>*</span></label>
                  <input
                    type="text"
                    value={newLesson.title}
                    onChange={e => setNewLesson({ ...newLesson, title: e.target.value })}
                    placeholder="Enter lesson name"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 16, marginBottom: 8, fontFamily: 'Space Mono, monospace' }}
                    required
                  />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={{ fontWeight: 600, color: '#4169e1', marginBottom: 6, display: 'block', fontFamily: 'Space Mono, monospace' }}>Overview</label>
                  <textarea
                    value={newLesson.overview}
                    onChange={e => setNewLesson({ ...newLesson, overview: e.target.value })}
                    placeholder="Enter lesson overview"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 16, minHeight: 60, resize: 'vertical', fontFamily: 'Space Mono, monospace' }}
                  />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={{ fontWeight: 600, color: '#4169e1', marginBottom: 6, display: 'block', fontFamily: 'Space Mono, monospace' }}>Grade Levels</label>
                  <input
                    type="text"
                    value={newLesson.age}
                    onChange={e => setNewLesson({ ...newLesson, age: e.target.value })}
                    placeholder="Enter grade levels"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 16, fontFamily: 'Space Mono, monospace' }}
                  />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={{ fontWeight: 600, color: '#4169e1', marginBottom: 6, display: 'block', fontFamily: 'Space Mono, monospace' }}>Lesson Link</label>
                  <input
                    type="text"
                    value={newLesson.link}
                    onChange={e => setNewLesson({ ...newLesson, link: e.target.value })}
                    placeholder="Enter lesson link"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 16, fontFamily: 'Space Mono, monospace' }}
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button className="btn-primary"
                  style={{
                    background: newLesson.title.trim() ? '#4169e1' : '#e0e0e0',
                    borderColor: newLesson.title.trim() ? '#4169e1' : '#e0e0e0',
                    color: newLesson.title.trim() ? '#fff' : '#b0b0b0',
                    cursor: newLesson.title.trim() ? 'pointer' : 'not-allowed',
                    fontFamily: 'Space Mono, monospace'
                  }}
                  onClick={handleCreateLesson}
                  disabled={!newLesson.title.trim()}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Delete Lesson Modal */}
        {showDeleteModal && lessonToDelete && (
          <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
              <div className="modal-header">
                <h2>Delete Lesson</h2>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to delete the lesson <b>{lessonToDelete.title}</b>? This action cannot be undone.</p>
              </div>
              <div className="modal-footer" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setShowDeleteModal(false)}>
                  Cancel
                </button>
                <button className="btn-primary" style={{ background: '#dc3545', borderColor: '#dc3545' }} onClick={() => handleDeleteLesson(lessonToDelete.id)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Helper component for lesson tab with trash icon on hover
function LessonTabWithTrash({ lesson, isActive, onClick, onDelete, canDelete }) {
  const [hover, setHover] = React.useState(false);
  // Truncate lesson title if longer than 10 chars
  const truncatedTitle = lesson.title.length > 14 ? lesson.title.slice(0, 14) + '…' : lesson.title;
  return (
    <div
      style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        onClick={onClick}
        className={isActive ? 'active' : ''}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '16px 18px',
          marginBottom: 8,
          border: 'none',
          borderRadius: 10,
          background: isActive ? '#f0f4ff' : 'none',
          color: isActive ? '#4169e1' : '#222',
          fontWeight: 700,
          fontSize: 17,
          cursor: 'pointer',
          transition: 'background 0.2s, color 0.2s',
          outline: 'none',
          boxShadow: isActive ? '0 2px 8px rgba(65, 105, 225, 0.08)' : 'none',
          borderLeft: isActive ? '4px solid #4169e1' : '4px solid transparent',
          display: 'block',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}
      >
        {truncatedTitle}
      </button>
      {/* Trash icon only on hover and for user-created lessons */}
      {canDelete && hover && (
        <button
          onClick={onDelete}
          title="Delete lesson"
          style={{
            position: 'absolute',
            right: 30,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            margin: 0,
            zIndex: 2,
            color: '#4169e1',
            opacity: 1,
            transition: 'color 0.2s',
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 16, height: 16 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
        </button>
      )}
    </div>
  );
} 