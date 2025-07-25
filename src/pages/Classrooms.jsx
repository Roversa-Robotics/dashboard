import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { db, auth } from '../Firebase.jsx';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import './Dashboard.css';
import './Classrooms.css';
import Sidebar from './Sidebar';

function Classrooms() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [classrooms, setClassrooms] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [newClassroomName, setNewClassroomName] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [selectedColor, setSelectedColor] = useState('#4169e1');
  const [selectedTheme, setSelectedTheme] = useState('blue'); // Theme selection instead of slider
  const [dragOverGroupId, setDragOverGroupId] = useState(null); // For visual feedback
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [editClassroomName, setEditClassroomName] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [classroomToDelete, setClassroomToDelete] = useState(null);

  // Predefined themes with gradient colors
  const themes = {
    blue: {
      name: 'Blue',
      primary: '#4169e1',
      dark: '#4f7ad6', // less dark
      light: '#6b8cff'
    },
    red: {
      name: 'Red',
      primary: '#dc3545',
      dark: '#d95c63', // less dark
      light: '#ff6b6b'
    },
    green: {
      name: 'Green',
      primary: '#28a745',
      dark: '#4bbf6b', // less dark
      light: '#6bff8c'
    },
    orange: {
      name: 'Orange',
      primary: '#fd7e14',
      dark: '#ff9c4a', // less dark
      light: '#ffb366'
    },
    purple: {
      name: 'Purple',
      primary: '#6f42c1',
      dark: '#8d6fd1', // less dark
      light: '#b366ff'
    },
    teal: {
      name: 'Teal',
      primary: '#20c997',
      dark: '#4fd6b0', // less dark
      light: '#6bffd9'
    },
    pink: {
      name: 'Pink',
      primary: '#e83e8c',
      dark: '#e86fa7', // less dark
      light: '#ff6bb3'
    },
    indigo: {
      name: 'Indigo',
      primary: '#6610f2',
      dark: '#7c4dff', // less dark
      light: '#9d66ff'
    }
  };

  // Update selected color when theme changes
  useEffect(() => {
    setSelectedColor(themes[selectedTheme].primary);
  }, [selectedTheme]);

  // When selectedClassroom changes, update editClassroomName
  useEffect(() => {
    if (selectedClassroom) {
      setEditClassroomName(selectedClassroom.name);
    }
  }, [selectedClassroom]);

  // Function to update classroom name in localStorage and state
  const handleClassroomNameChange = (e) => {
    setEditClassroomName(e.target.value);
  };
  const saveClassroomName = () => {
    if (!selectedClassroom || !editClassroomName.trim()) return;
    if (editClassroomName === selectedClassroom.name) return;
    const updatedClassrooms = classrooms.map(c =>
      c.id === selectedClassroom.id ? { ...c, name: editClassroomName } : c
    );
    localStorage.setItem('roversaClassrooms', JSON.stringify(updatedClassrooms));
    setClassrooms(updatedClassrooms);
    setSelectedClassroom({ ...selectedClassroom, name: editClassroomName });
  };
  const handleClassroomNameKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveClassroomName();
      e.target.blur();
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Helper to load classrooms from Firestore
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

  // Helper to save classrooms to Firestore
  const saveClassrooms = async (user, classrooms) => {
    if (!user) return;
    const docRef = doc(db, 'users', user.uid, 'appdata', 'classrooms');
    await setDoc(docRef, { classrooms });
  };

  // Replace all localStorage classroom logic with Firestore logic
  // Example: when creating a classroom
  const handleCreateClassroom = async () => {
    if (!newClassroomName.trim()) return;
    const user = auth.currentUser;
    const docRef = doc(db, 'users', user.uid, 'appdata', 'classrooms');
    const docSnap = await getDoc(docRef);
    let classroomsArr = [];
    if (docSnap.exists()) {
      classroomsArr = docSnap.data().classrooms || [];
    }
    const newClassroom = {
      id: Date.now().toString(),
      name: newClassroomName,
      color: selectedColor,
      createdAt: new Date().toISOString(),
      createdBy: user.email,
      students: [],
      groups: []
    };
    const updatedClassrooms = [newClassroom, ...classroomsArr];
    await setDoc(docRef, { classrooms: updatedClassrooms });
    setClassrooms(updatedClassrooms);
    setShowCreateModal(false);
    setNewClassroomName('');
    setSelectedColor('#4169e1');
    setSelectedTheme('blue'); // Reset to blue theme
  };

  const handleAddStudent = () => {
    if (!newStudentName.trim() || !newStudentEmail.trim()) return;

    const newStudent = {
      id: Date.now().toString(),
      name: newStudentName,
      email: newStudentEmail,
      addedAt: new Date().toISOString()
    };

    const updatedClassrooms = classrooms.map(classroom => {
      if (classroom.id === selectedClassroom.id) {
        return {
          ...classroom,
          students: [...classroom.students, newStudent]
        };
      }
      return classroom;
    });

    localStorage.setItem('roversaClassrooms', JSON.stringify(updatedClassrooms));
    setClassrooms(updatedClassrooms);
    setShowAddStudentModal(false);
    setNewStudentName('');
    setNewStudentEmail('');
    setSelectedClassroom(updatedClassrooms.find(c => c.id === selectedClassroom.id));
  };

  const handleAddGroup = () => {
    if (!newGroupName.trim()) return;

    const newGroup = {
      id: Date.now().toString(),
      name: newGroupName,
      students: [],
      createdAt: new Date().toISOString()
    };

    const updatedClassrooms = classrooms.map(classroom => {
      if (classroom.id === selectedClassroom.id) {
        return {
          ...classroom,
          groups: [...classroom.groups, newGroup]
        };
      }
      return classroom;
    });

    localStorage.setItem('roversaClassrooms', JSON.stringify(updatedClassrooms));
    setClassrooms(updatedClassrooms);
    setShowAddGroupModal(false);
    setNewGroupName('');
    setSelectedClassroom(updatedClassrooms.find(c => c.id === selectedClassroom.id));
  };

  const handleAddStudentToGroup = (groupId, studentId) => {
    const updatedClassrooms = classrooms.map(classroom => {
      if (classroom.id === selectedClassroom.id) {
        const updatedGroups = classroom.groups.map(group => {
          if (group.id === groupId) {
            const student = classroom.students.find(s => s.id === studentId);
            if (student && !group.students.find(s => s.id === studentId)) {
              return {
                ...group,
                students: [...group.students, student]
              };
            }
          }
          return group;
        });
        return { ...classroom, groups: updatedGroups };
      }
      return classroom;
    });

    localStorage.setItem('roversaClassrooms', JSON.stringify(updatedClassrooms));
    setClassrooms(updatedClassrooms);
    setSelectedClassroom(updatedClassrooms.find(c => c.id === selectedClassroom.id));
  };

  const handleRemoveStudentFromGroup = (groupId, studentId) => {
    const updatedClassrooms = classrooms.map(classroom => {
      if (classroom.id === selectedClassroom.id) {
        const updatedGroups = classroom.groups.map(group => {
          if (group.id === groupId) {
            return {
              ...group,
              students: group.students.filter(s => s.id !== studentId)
            };
          }
          return group;
        });
        return { ...classroom, groups: updatedGroups };
      }
      return classroom;
    });

    localStorage.setItem('roversaClassrooms', JSON.stringify(updatedClassrooms));
    setClassrooms(updatedClassrooms);
    setSelectedClassroom(updatedClassrooms.find(c => c.id === selectedClassroom.id));
  };

  const handleDeleteClassroom = (classroomId) => {
    setClassroomToDelete(classroomId);
    setShowDeleteModal(true);
  };

  const handleDeleteStudent = (classroomId, studentId) => {
    if (confirm('Are you sure you want to remove this student? This action cannot be undone.')) {
      const updatedClassrooms = classrooms.map(classroom => {
        if (classroom.id === classroomId) {
          const updatedStudents = classroom.students.filter(s => s.id !== studentId);
          const updatedGroups = classroom.groups.map(group => ({
            ...group,
            students: group.students.filter(s => s.id !== studentId)
          }));
          return { ...classroom, students: updatedStudents, groups: updatedGroups };
        }
        return classroom;
      });

      localStorage.setItem('roversaClassrooms', JSON.stringify(updatedClassrooms));
      setClassrooms(updatedClassrooms);
      if (selectedClassroom?.id === classroomId) {
        setSelectedClassroom(updatedClassrooms.find(c => c.id === classroomId));
      }
    }
  };

  const handleDeleteGroup = (classroomId, groupId) => {
    if (confirm('Are you sure you want to delete this group? This action cannot be undone.')) {
      const updatedClassrooms = classrooms.map(classroom => {
        if (classroom.id === classroomId) {
          return {
            ...classroom,
            groups: classroom.groups.filter(g => g.id !== groupId)
          };
        }
        return classroom;
      });

      localStorage.setItem('roversaClassrooms', JSON.stringify(updatedClassrooms));
      setClassrooms(updatedClassrooms);
      if (selectedClassroom?.id === classroomId) {
        setSelectedClassroom(updatedClassrooms.find(c => c.id === classroomId));
      }
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        navigate('/login');
      } else {
        setUser(user);
        loadClassrooms(user);
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (menuOpenId === null) return;
    const close = () => setMenuOpenId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuOpenId]);

  return (
    <div className="dashboard-container">
      <Sidebar className="slide-in-from-left" />
      {/* Main Content */}
      <div className="main-content slide-in-from-bottom">
        <div className="top-bar slide-in-from-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, marginBottom: 32 }}>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 700, color: '#222' }}>Classrooms</h1>
          <button className="create-classroom-btn fade-in-scale animate-on-mount-delay-1" onClick={() => setShowCreateModal(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Classroom
          </button>
        </div>

        <div className="classrooms-content">
          {classrooms.length === 0 ? (
            <div className="empty-state animate-on-mount-delay-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="#b0b0b0" width="60" height="60">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
              <h3>No Classrooms Yet</h3>
              <p>Create your first classroom to start managing students and groups</p>
              <button className="create-first-btn fade-in-scale animate-on-mount-delay-3" onClick={() => setShowCreateModal(true)}>
                Create Your First Classroom
              </button>
            </div>
          ) : (
            <div className="classrooms-grid">
              {classrooms.map((classroom, index) => {
                const handleMenuClick = (e) => {
                  e.stopPropagation();
                  setMenuOpenId(menuOpenId === classroom.id ? null : classroom.id);
                };
                const handleEdit = (e) => {
                  e.stopPropagation();
                  setMenuOpenId(null);
                  setSelectedClassroom(classroom);
                };
                const handleDelete = (e) => {
                  e.stopPropagation();
                  setMenuOpenId(null);
                  handleDeleteClassroom(classroom.id);
                };
                return (
                  <div 
                    key={classroom.id} 
                    className={`classroom-card fade-in-scale animate-on-mount-delay-${2 + index}`} 
                    onClick={() => setSelectedClassroom(classroom)} 
                    style={{ cursor: 'pointer', position: 'relative' }}
                  >
                    <div className="classroom-card-header-bar" style={{
                      background: `${themes[Object.keys(themes).find(key => themes[key].primary === classroom.color) || 'blue']?.primary}`,
                      position: 'relative',
                    }}>
                      <button className="classroom-card-menu-btn" onClick={handleMenuClick} style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', zIndex: 20, padding: 2 }} onMouseDown={e => e.stopPropagation()}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="#fff" width="22" height="22">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
                        </svg>
                      </button>
                    </div>
                    {menuOpenId === classroom.id && (
                      <div className="classroom-card-menu" style={{ position: 'absolute', top: 38, right: 8, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.10)', zIndex: 10000, minWidth: 100, padding: '4px 0' }} onClick={e => e.stopPropagation()}>
                        <button className="menu-item" onClick={handleEdit} style={{ width: '100%', padding: '4px 8px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '13px', fontWeight: 400, color: '#222', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="16" height="16" style={{ minWidth: 16 }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                          </svg>
                          Edit
                        </button>
                        <button className="menu-item" onClick={handleDelete} style={{ width: '100%', padding: '4px 8px', background: 'none', border: 'none', textAlign: 'left', color: '#dc3545', cursor: 'pointer', fontSize: '13px', fontWeight: 400, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="16" height="16" style={{ minWidth: 16 }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                          Delete
                        </button>
                      </div>
                    )}
                    <span className="classroom-card-avatar" style={{
                      background: classroom.color || '#4169e1',
                      border: '4px solid #fff',
                    }}>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="28" height="28">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                      </svg>
                    </span>
                    <div className="classroom-card-content">
                      <div className="classroom-info">
                        <div className="classroom-title">
                          <h3>{classroom.name}</h3>
                        </div>
                        <p>{classroom.students.length} students • {classroom.groups.length} groups</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create Classroom Modal */}
      {showCreateModal && (
        <div className="modal-overlay fade-in-scale" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content create-classroom-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Classroom</h2>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Classroom Name <span style={{ color: 'red' }}>*</span></label>
                <input
                  type="text"
                  value={newClassroomName}
                  onChange={(e) => setNewClassroomName(e.target.value)}
                  placeholder="Enter classroom name"
                  onKeyPress={(e) => e.key === 'Enter' && handleCreateClassroom()}
                />
              </div>
              
              <div className="form-group">
                <label>Theme</label>
                <div className="theme-buttons">
                  {Object.entries(themes).map(([key, theme]) => (
                    <button
                      key={key}
                      className={`theme-button ${selectedTheme === key ? 'selected' : ''}`}
                      style={{ background: `linear-gradient(to bottom, ${theme.dark} 0%, ${theme.dark} 50%, ${theme.light} 50%, ${theme.light} 100%)` }}
                      onClick={() => setSelectedTheme(key)}
                      title={theme.name}
                      aria-label={`Select ${theme.name} theme`}
                    >
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button className="btn-primary"
                style={{
                  background: newClassroomName.trim() ? '#4169e1' : '#e0e0e0',
                  borderColor: newClassroomName.trim() ? '#4169e1' : '#e0e0e0',
                  color: newClassroomName.trim() ? '#fff' : '#b0b0b0',
                  cursor: newClassroomName.trim() ? 'pointer' : 'not-allowed',
                  fontFamily: 'Space Mono, monospace'
                }}
                onClick={handleCreateClassroom}
                disabled={!newClassroomName.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Classroom Detail Modal */}
      {selectedClassroom && (
        <div className="modal-overlay fade-in-scale" onClick={() => setSelectedClassroom(null)}>
          <div className="modal-content classroom-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="classroom-header-info">
                <input
                  type="text"
                  value={editClassroomName}
                  onChange={handleClassroomNameChange}
                  onBlur={saveClassroomName}
                  onKeyDown={handleClassroomNameKeyDown}
                  className="classroom-name-input"
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    border: 'none',
                    background: 'transparent',
                    color: '#222',
                    padding: '8px 0',
                    borderBottom: '2px solid transparent',
                    minWidth: 200,
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={e => (e.target.style.borderBottomColor = '#4169e1')}
                  onBlurCapture={e => (e.target.style.borderBottomColor = 'transparent')}
                  placeholder="Enter classroom name..."
                  maxLength={60}
                />
              </div>
              <button className="modal-close" onClick={() => setSelectedClassroom(null)}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="classroom-detail-tabs">
                <div className="tab-content">
                  {/* Students Section */}
                  <div className="section">
                    <div className="section-header">
                      <h3>Students</h3>
                      <button className="add-btn" onClick={() => setShowAddStudentModal(true)}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="16" height="16">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Add Student
                      </button>
                    </div>
                    <div className="students-list">
                      {selectedClassroom.students.length === 0 ? (
                        <div className="empty-list">
                          <p>No students added yet</p>
                        </div>
                      ) : (
                        selectedClassroom.students.map(student => (
                          <div
                            key={student.id}
                            className="student-item"
                            draggable
                            onDragStart={e => {
                              e.dataTransfer.setData('studentId', student.id);
                            }}
                          >
                            <div className="student-info">
                              <div className="student-avatar">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="16" height="16">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                                </svg>
                              </div>
                              <div className="student-details">
                                <span className="student-name">{student.name}</span>
                                <span className="student-email">{student.email}</span>
                              </div>
                            </div>
                            <button 
                              className="remove-btn"
                              onClick={() => handleDeleteStudent(selectedClassroom.id, student.id)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="14" height="14">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Groups Section */}
                  <div className="section">
                    <div className="section-header">
                      <h3>Groups</h3>
                      <button className="add-btn" onClick={() => setShowAddGroupModal(true)}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="16" height="16">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Add Group
                      </button>
                    </div>
                    <div className="groups-list">
                      {selectedClassroom.groups.length === 0 ? (
                        <div className="empty-list">
                          <p>No groups created yet</p>
                        </div>
                      ) : (
                        selectedClassroom.groups.map(group => (
                          <div
                            key={group.id}
                            className={`group-item${dragOverGroupId === group.id ? ' drag-over' : ''}`}
                            onDragOver={e => e.preventDefault()}
                            onDragEnter={() => setDragOverGroupId(group.id)}
                            onDragLeave={() => setDragOverGroupId(null)}
                            onDrop={e => {
                              setDragOverGroupId(null);
                              const studentId = e.dataTransfer.getData('studentId');
                              if (studentId) {
                                handleAddStudentToGroup(group.id, studentId);
                              }
                            }}
                          >
                            <div className="group-header">
                              <h4>{group.name}</h4>
                              <button 
                                className="remove-btn"
                                onClick={() => handleDeleteGroup(selectedClassroom.id, group.id)}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="14" height="14">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                            <div className="group-students">
                              {group.students.length === 0 ? (
                                <p className="no-students">No students in this group</p>
                              ) : (
                                group.students.map(student => (
                                  <div key={student.id} className="group-student">
                                    <span>{student.name}</span>
                                    <button 
                                      className="remove-student-btn"
                                      onClick={() => handleRemoveStudentFromGroup(group.id, student.id)}
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="12" height="12">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                            {selectedClassroom.students.length > 0 && (
                              <div className="add-to-group">
                                <select 
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      handleAddStudentToGroup(group.id, e.target.value);
                                      e.target.value = '';
                                    }
                                  }}
                                  defaultValue=""
                                >
                                  <option value="">Add student to group...</option>
                                  {selectedClassroom.students
                                    .filter(student => !group.students.find(s => s.id === student.id))
                                    .map(student => (
                                      <option key={student.id} value={student.id}>
                                        {student.name}
                                      </option>
                                    ))
                                  }
                                </select>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {showAddStudentModal && (
        <div className="modal-overlay fade-in-scale" onClick={() => setShowAddStudentModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Student</h2>
              <button className="modal-close" onClick={() => setShowAddStudentModal(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Student Name</label>
                <input
                  type="text"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  placeholder="Enter student name"
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={newStudentEmail}
                  onChange={(e) => setNewStudentEmail(e.target.value)}
                  placeholder="Enter student email"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowAddStudentModal(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleAddStudent}>
                Add Student
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Group Modal */}
      {showAddGroupModal && (
        <div className="modal-overlay fade-in-scale" onClick={() => setShowAddGroupModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Group</h2>
              <button className="modal-close" onClick={() => setShowAddGroupModal(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Group Name</label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Enter group name"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddGroup()}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowAddGroupModal(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleAddGroup}>
                Add Group
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Classroom</h2>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete this classroom? This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>
              <button className="btn-primary" style={{ background: '#dc3545', borderColor: '#dc3545' }} onClick={() => {
                if (!classroomToDelete) return;
                const updatedClassrooms = classrooms.filter(c => c.id !== classroomToDelete);
                localStorage.setItem('roversaClassrooms', JSON.stringify(updatedClassrooms));
                setClassrooms(updatedClassrooms);
                if (selectedClassroom?.id === classroomToDelete) {
                  setSelectedClassroom(null);
                }
                setShowDeleteModal(false);
                setClassroomToDelete(null);
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

export default Classrooms; 