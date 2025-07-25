import React, { useState, useRef, useEffect } from 'react';
import './DashboardCalendar.css';
import tentImg from '../tent.png';
import { createPortal } from 'react-dom';

// Updated: Returns {day, isCurrentMonth} for each cell
const getMonthMatrix = (year, month) => {
  // month: 0-indexed
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Monday as first day
  const matrix = [];
  let week = [];
  let day = 1;
  for (let i = 0; i < 6; i++) {
    week = [];
    for (let j = 0; j < 7; j++) {
      const cellIndex = i * 7 + j;
      if (cellIndex < startDay) {
        // Previous month
        week.push({ day: prevMonthLastDay - (startDay - cellIndex - 1), isCurrentMonth: false });
      } else if (day > daysInMonth) {
        // Next month
        week.push({ day: day - daysInMonth, isCurrentMonth: false });
        day++;
      } else {
        // Current month
        week.push({ day, isCurrentMonth: true });
        day++;
      }
    }
    matrix.push(week);
  }
  return matrix;
};

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function DashboardCalendar({ sessions = [] }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [titleFontSize, setTitleFontSize] = useState(2.5); // in rem
  const titleRef = useRef(null);
  const arrowsRef = useRef(null);
  const containerRef = useRef(null);
  // New state for modal
  const [selectedDay, setSelectedDay] = useState(null);
  const [showDayModal, setShowDayModal] = useState(false);
  const [sessionsForDay, setSessionsForDay] = useState([]);

  let matrix = getMonthMatrix(viewYear, viewMonth);
  // Always show 6 rows (42 days) for consistent sizing
  // Remove the logic that removes the last row

  // Shrink font size until text fits, and recalc on container resize
  useEffect(() => {
    if (!titleRef.current || !containerRef.current) return;
    const minFont = 1.1; // Increased minimum font size
    const maxFont = 1.4; // Increased maximum font size for better header appearance
    const step = 0.01;
    let bestFont = minFont;
    for (let font = maxFont; font >= minFont; font -= step) {
      titleRef.current.style.fontSize = `${font}rem`;
      const titleWidth = titleRef.current.scrollWidth;
      const containerWidth = containerRef.current.offsetWidth - (arrowsRef.current?.offsetWidth || 0) - 8;
      if (titleWidth <= containerWidth) {
        bestFont = font;
        break;
      }
    }
    setTitleFontSize(bestFont);
    // Observe container resize
    const observer = new window.ResizeObserver(() => {
      let bestFont = minFont;
      for (let font = maxFont; font >= minFont; font -= step) {
        titleRef.current.style.fontSize = `${font}rem`;
        const titleWidth = titleRef.current.scrollWidth;
        const containerWidth = containerRef.current.offsetWidth - (arrowsRef.current?.offsetWidth || 0) - 8;
        if (titleWidth <= containerWidth) {
          bestFont = font;
          break;
        }
      }
      setTitleFontSize(bestFont);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
    // eslint-disable-next-line
  }, [viewMonth, viewYear]);

  const handlePrev = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };
  const handleNext = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  // Get session data for a specific day
  const getSessionData = (day) => {
    try {
      const targetDate = new Date(viewYear, viewMonth, day);
      const targetDateStr = targetDate.toDateString();
      let past = 0;
      let active = 0;
      let scheduled = 0;
      sessions.forEach(session => {
        const sessionDate = new Date(session.createdAt);
        const sessionDateStr = sessionDate.toDateString();
        if (sessionDateStr === targetDateStr) {
          if (session.status === 'ended') {
            past++;
          } else if (session.status === 'active' || session.status === 'paused') {
            active++;
          } else if (session.status === 'scheduled') {
            scheduled++;
          }
        }
      });
      if (past > 0 || active > 0 || scheduled > 0) {
        return { past, active, scheduled };
      }
      return null;
    } catch (error) {
      console.error('Error getting session data:', error);
      return null;
    }
  };
  // Helper to get all sessions for a specific day
  const getSessionsForDay = (day) => {
    try {
      const targetDate = new Date(viewYear, viewMonth, day);
      const targetDateStr = targetDate.toDateString();
      return sessions.filter(session => {
        const sessionDate = new Date(session.createdAt);
        return sessionDate.toDateString() === targetDateStr;
      });
    } catch (error) {
      return [];
    }
  };

  return (
    <>
      <div className="dashboard-calendar-card">
        <div className="calendar-header-row" ref={containerRef}>
          <div
            className="calendar-title"
            ref={titleRef}
            style={{ fontSize: `${titleFontSize}rem` }}
          >
            {monthNames[viewMonth]}, {viewYear}
          </div>
          <div className="calendar-arrows-group" ref={arrowsRef}>
            <button className="calendar-arrow" onClick={handlePrev}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button className="calendar-arrow" onClick={handleNext}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        </div>
        <div className="calendar-subtitle">Track your progress</div>
        <div className="calendar-grid">
          {matrix.map((week, i) => (
            <div className="calendar-week" key={i}>
              {week.map((cell, j) => {
                // Highlight today
                const isToday = cell.isCurrentMonth &&
                  cell.day === today.getDate() &&
                  viewMonth === today.getMonth() &&
                  viewYear === today.getFullYear();
                return (
                  <div
                    className={`calendar-day${cell.isCurrentMonth ? '' : ' calendar-day-outside'}${isToday ? ' calendar-day-today' : ''}`}
                    key={j}
                    onClick={() => {
                      if (cell.isCurrentMonth) {
                        setSelectedDay(cell.day);
                        setSessionsForDay(getSessionsForDay(cell.day));
                        setShowDayModal(true);
                      }
                    }}
                    style={{ cursor: cell.isCurrentMonth ? 'pointer' : 'default' }}
                  >
                    <span>{cell.day}</span>
                    {cell.isCurrentMonth && getSessionData(cell.day) && (
                      <div className="calendar-day-dots">
                        {Array.from({ length: getSessionData(cell.day).past || 0 }, (_, i) => (
                          <div key={`past-${i}`} className="calendar-day-dot-past" />
                        ))}
                        {Array.from({ length: getSessionData(cell.day).active || 0 }, (_, i) => (
                          <div key={`active-${i}`} className="calendar-day-dot-active" />
                        ))}
                        {Array.from({ length: getSessionData(cell.day).scheduled || 0 }, (_, i) => (
                          <div key={`scheduled-${i}`} className="calendar-day-dot-scheduled" />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <img src={tentImg} alt="Tent illustration for calendar" className="calendar-tent-img" onError={e => { e.target.style.display = 'none'; }} />
      </div>
      {/* Modal for sessions on selected day (now using React Portal) */}
      {showDayModal && createPortal(
        <div className="modal-overlay" onClick={() => setShowDayModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, width: '90%', maxHeight: '80vh', overflowY: 'auto', borderRadius: 16 }}>
            <div className="modal-header">
              <h2 style={{ fontSize: '1.3rem', fontWeight: 400, color: '#222', fontFamily: 'Inter, sans-serif', textAlign: 'center', margin: 0 }}>
                Sessions on {selectedDay} {monthNames[viewMonth]}, {viewYear}
              </h2>
            </div>
            <div className="modal-body">
              {sessionsForDay.length === 0 ? (
                <div style={{ color: '#888', fontSize: 15, fontFamily: 'Open Sans, sans-serif', fontWeight: 400, textAlign: 'center', margin: '32px 0' }}>No sessions on this day</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
                  {sessionsForDay.map(session => (
                    <div key={session.id} style={{ background: '#f7f8fa', borderRadius: 10, padding: '12px 18px', border: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ fontWeight: 700, color: '#4169e1', fontSize: 15 }}>{session.name}</div>
                      <div style={{ color: '#888', fontWeight: 400, fontSize: 13 }}>{session.status.charAt(0).toUpperCase() + session.status.slice(1)}</div>
                      <div style={{ color: '#555', fontWeight: 400, fontSize: 12 }}>{session.block || session.blockName || session.classroomBlock || ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
} 