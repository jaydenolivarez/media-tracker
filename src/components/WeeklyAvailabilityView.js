import React, { useEffect, useState } from "react";
import { parseWeeklyAvailability } from "../utils/icalAvailability";
import { fetchWeeklyWeather } from "../utils/weather";
import { FadeInOverlay } from "./Dashboard";
import DetailedTaskView from "./DetailedTaskView";
import { useAuth } from "../context/AuthContext";
import { WiDaySunny, WiCloudy, WiDayCloudy, WiRain, WiThunderstorm, WiSnow, WiFog } from 'react-icons/wi';
import { getMediaTypeLabel, getMediaTypeColor } from '../constants/mediaTypes';

// Orange TURN label style
const turnLabelStyle = {
  display: 'inline-block',
  background: 'var(--turn-label-bg, #f97316)',
  color: 'var(--turn-label-text, #fff)',
  borderRadius: 12,
  padding: '2px 10px',
  fontSize: 13,
  fontWeight: 700,
  marginLeft: 8,
  minWidth: 44,
  textAlign: 'center',
  boxShadow: '0 1px 4px rgba(249,115,22,0.15)'
};

// Format: 'Wed, Jul 16 85F/74F Sunny'
// WeatherDropdown component for showing NOAA detailed forecast

// Map general shortForecast to icon
function getWeatherIcon(shortForecast) {
  const forecast = shortForecast.toLowerCase();
  if (forecast.includes('sunny') || forecast.includes('clear')) return <WiDaySunny size={26} color="#f7c948" title="Sunny" />;
  if (forecast.includes('partly cloudy') || forecast.includes('mostly sunny')) return <WiDayCloudy size={26} color="#c7d0e0" title="Partly Cloudy" />;
  if (forecast.includes('cloudy') || forecast.includes('overcast')) return <WiCloudy size={26} color="#a0aec0" title="Cloudy" />;
  if (forecast.includes('thunderstorm')) return <WiThunderstorm size={26} color="#6b7280" title="Thunderstorm" />;
  if (forecast.includes('rain') || forecast.includes('showers') || forecast.includes('drizzle')) return <WiRain size={26} color="#4f8ef7" title="Rain" />;
  if (forecast.includes('snow') || forecast.includes('flurries') || forecast.includes('sleet')) return <WiSnow size={26} color="#b9e0f7" title="Snow" />;
  if (forecast.includes('fog') || forecast.includes('mist') || forecast.includes('haze')) return <WiFog size={28} color="#bfc9d1" title="Fog" />;
  return <WiDaySunny size={28} color="#f7c948" title="Weather" />;
}

function WeatherDropdown({ forecast, shortForecast }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = React.useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <span ref={dropdownRef} style={{ marginLeft: 16, display: 'inline-block', position: 'relative' }}>
      <span
        onClick={() => setOpen(v => !v)}
        role="button"
        aria-label={shortForecast || 'Weather'}
        tabIndex={0}
        style={{
          display: 'inline-block',
          cursor: 'pointer',
          borderRadius: 8,
          outline: open ? '2px solid #f97316' : 'none',
          boxShadow: open ? '0 2px 16px rgba(80,120,200,0.13)' : undefined,
          background: open ? 'rgba(247,201,72,0.10)' : 'transparent',
          transition: 'box-shadow 0.15s, background 0.15s',
          marginRight: 2,
        }}
        onKeyPress={e => { if (e.key === 'Enter' || e.key === ' ') setOpen(v => !v); }}
        title={shortForecast || 'Weather'}
      >
        {getWeatherIcon(shortForecast || '')}
      </span>
      {open && (
        <div style={{
          position: 'absolute',
          left: 0,
          top: '120%',
          width: '30vw',
          background: 'var(--bg-card, #181a20)',
          color: 'var(--text-main, #fff)',
          border: '2px solid var(--sidebar-border)',
          borderRadius: 14,
          fontWeight: 600,
          boxShadow: '0 6px 32px 0 rgba(60,100,180,0.13)',
          padding: '22px 20px 16px 20px',
          zIndex: 30,
          fontSize: 14,
          lineHeight: 1.4,
          marginTop: 8,
        }}>
          {forecast}
        </div>
      )}
    </span>
  );
}


const getIsDarkMode = () => {
  if (typeof window === 'undefined') return false;
  return window.document?.documentElement?.getAttribute('data-theme') === 'dark';
};

const dayHeaderStyle = {
  fontWeight: 700,
  fontSize: 20,
  margin: '32px 0 8px 0',
  letterSpacing: 0.5,
  color: 'var(--text-main)'
};

const noTasksStyle = {
  margin: '32px 0',
  color: 'var(--text-secondary, #888)',
  fontSize: 18,
  textAlign: 'center',
};

// Table style matches PendingTasksView
const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  marginBottom: 0,
  background: 'var(--bg-card, #181a20)',
  borderRadius: 16,
  boxShadow: '0 2px 16px rgba(80,120,200,0.07)',
  overflow: 'hidden',
};
const thStyle = {
  background: 'var(--table-header-bg)',
  color: 'var(--text-main, #fff)',
  fontWeight: 700,
  padding: '8px 12px',
  borderBottom: '2px solid var(--table-border, #2d313e)',
  textAlign: 'left',
};
const tdStyle = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--table-border, #2d313e)',
  color: 'var(--text-main, #fff)',
};

// Robust date formatter for Firestore Timestamp, UNIX, ISO, etc.
function formatCreatedAt(createdAt) {
  if (!createdAt) return '';
  // Firestore Timestamp (has toDate method)
  if (createdAt.toDate) return createdAt.toDate().toLocaleDateString();
  // UNIX timestamp (seconds)
  if (typeof createdAt === 'number' && createdAt < 1e12) return new Date(createdAt * 1000).toLocaleDateString();
  // UNIX timestamp (milliseconds)
  if (typeof createdAt === 'number') return new Date(createdAt).toLocaleDateString();
  // ISO string
  const date = new Date(createdAt);
  return isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

// Row hover/click style (consistent with PendingTasksView)
const taskRowStyle = {
  cursor: 'pointer',
  transition: 'background 0.15s',
};

function WeeklyAvailabilityView({ tasks, loading, enabledMediaTypes }) {
  // Default to all media types if not passed
  const allMediaTypes = React.useMemo(() => {
    if (Array.isArray(enabledMediaTypes) && enabledMediaTypes.length > 0) return enabledMediaTypes;
    // fallback: scan tasks for all unique media types
    const types = Array.from(new Set((tasks || []).map(t => t.mediaType).filter(Boolean)));
    return types.length > 0 ? types : ["photos", "3d_tours"];
  }, [enabledMediaTypes, tasks]);
  const showMediaTypeColumn = allMediaTypes.length > 1;
  const [weather, setWeather] = useState([]);

  useEffect(() => {
    fetchWeeklyWeather().then(setWeather);
  }, []);
  const auth = useAuth();
  const role = auth?.role;
  const currentUser = auth?.user;
  const [weeklyData, setWeeklyData] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [gapSearchOpen, setGapSearchOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Filter tasks for photographers
    let filteredTasks = (tasks || []).filter(t => t.stage === "Scheduling" && t.archived !== true);
    if (role === 'photographer' && currentUser?.uid) {
      filteredTasks = tasks.filter(task => {
        // Adjust this property as needed based on your task structure
        return task.assignedPhotographerId === currentUser.uid;
      });
    }
    if (!loading && filteredTasks) {
      if (filteredTasks.length > 0) {
        (async () => {
          const result = await parseWeeklyAvailability(filteredTasks);
          if (!cancelled) setWeeklyData(result);
        })();
      } else {
        // No tasks for this user; set empty weeklyData to avoid indefinite loading
        setWeeklyData({ days: [] });
      }
    }
    return () => { cancelled = true; };
  }, [tasks, loading, role, currentUser]);

  if (loading) return <div style={noTasksStyle}>Loading weekly availability...</div>;
  if (!weeklyData || !Array.isArray(weeklyData.days)) {
    // Show a loading overlay/spinner while parsing icals
    return (
      <div style={{
        minHeight: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
      }}>
        <div style={{
          border: '4px solid var(--table-border, #2d313e)',
          borderTop: '4px solid #f97316',
          borderRadius: '50%',
          width: 48,
          height: 48,
          animation: 'spin 1s linear infinite',
        }} />
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  const { days, tasksWithoutIcal } = weeklyData;
  const hasAny = Array.isArray(days) && days.some(day => Array.isArray(day.tasks) && day.tasks.length > 0);

  return (
    <div style={{ width: '100%', margin: '0 auto', maxWidth: 1100 }}>
      {Array.isArray(days) && days.map((day, i) => {
        // Try to match weather to this day by index (assuming both are 7 days)
        const w = weather[i];
        return (
        <div key={day.date}>
          <div style={dayHeaderStyle}>
            {day.label}
            {w && <WeatherDropdown forecast={w.detailedForecast} shortForecast={w.shortForecast || ''} />}
          </div>
          {!Array.isArray(day.tasks) || day.tasks.length === 0 ? (
            <div style={{ ...noTasksStyle, margin: 0 }}>No available tasks for this day.</div>
          ) : (
            <div style={{
              background: 'var(--bg-card, #181a20)',
              borderRadius: 16,
              boxShadow: '0 2px 16px rgba(80,120,200,0.07)',
              padding: 0,
              marginBottom: 28,
              overflow: 'hidden',
            }}>
              <table style={tableStyle}>
              <thead>
                <tr>
                  {showMediaTypeColumn && <th style={{...thStyle, width: '10%'}}>Media Type</th>}
                  <th style={thStyle}>Property Name</th>
                  <th style={thStyle}>Update Type</th>
                  <th style={thStyle}>Priority Request</th>
                  <th style={thStyle}>Created Date</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {day.tasks.map(({ task, isTurn }) => (
                  <tr
                    key={task.id}
                    style={taskRowStyle}
                    onClick={() => setSelectedTask(task)}
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter') setSelectedTask(task); }}
                    onMouseEnter={e => {
                      const isDark = typeof window !== 'undefined' && window.document?.documentElement?.getAttribute('data-theme') === 'dark';
                      e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.06)" : "#f7faff";
                      e.currentTarget.style.color = 'var(--text-main)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = '';
                      e.currentTarget.style.color = 'var(--text-main)';
                    }}
                  >
                    {showMediaTypeColumn && (
                    <td style={{...tdStyle, width: '10%'}}>
                      <div style={{
                            display: 'inline-block',
                            background: getMediaTypeColor(task.mediaType),
                            color: '#fff',
                            borderRadius: 12,
                            padding: '2px 10px',
                            fontSize: 13,
                            fontWeight: 700,
                            minWidth: 44,
                            textAlign: 'center',
                            boxShadow: '0 1px 4px rgba(80,120,200,0.10)',
                            marginBottom: 3
                          }}>{getMediaTypeLabel(task.mediaType)}</div>
                    </td>
                  )}
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: 600 }}>{task.propertyName}</div>
                      </div>
                    </td>
                    <td style={tdStyle}>{task.updateType}</td>
                    <td style={tdStyle}>{task.priorityRequest ? 'Yes' : ''}</td>
                    <td style={tdStyle}>{formatCreatedAt(task.createdAt)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {isTurn && <span style={turnLabelStyle}>TURN</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
          )}</div>
      );})}
      <div style={{ marginTop: 40 }}>
        <div style={{ ...dayHeaderStyle, fontSize: 18 }}>Tasks without Calendar</div>
      {!Array.isArray(tasksWithoutIcal) || tasksWithoutIcal.length === 0 ? (
        <div style={noTasksStyle}>All tasks have calendars.</div>
      ) : (
        <div style={{
          background: 'var(--bg-card, #181a20)',
          borderRadius: 16,
          boxShadow: '0 2px 16px rgba(80,120,200,0.07)',
          padding: 0,
          marginBottom: 28,
          overflow: 'hidden',
        }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                {showMediaTypeColumn && <th style={{...thStyle, width: '10%'}}>Media Type</th>}
                <th style={thStyle}>Property Name</th>
                <th style={thStyle}>Update Type</th>
                <th style={thStyle}>Priority Request</th>
                <th style={thStyle}>Created Date</th>
              </tr>
            </thead>
            <tbody>
              {tasksWithoutIcal.map(task => (
                <tr
                  key={task.id}
                  style={taskRowStyle}
                  onClick={() => setSelectedTask(task)}
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') setSelectedTask(task); }}
                >
                  {showMediaTypeColumn && (
                    <td style={{...tdStyle, width: '10%'}}>
                      <div style={{
                        display: 'inline-block',
                        background: getMediaTypeColor(task.mediaType),
                        color: '#fff',
                        borderRadius: 12,
                        padding: '2px 10px',
                        fontSize: 13,
                        fontWeight: 700,
                        minWidth: 44,
                        textAlign: 'center',
                        boxShadow: '0 1px 4px rgba(80,120,200,0.10)',
                        marginBottom: 3
                      }}>{getMediaTypeLabel(task.mediaType)}</div>
                    </td>
                  )}
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                      <div style={{ fontWeight: 600 }}>{task.propertyName}</div>
                    </div>
                  </td>
                  <td style={tdStyle}>{task.updateType}</td>
                  <td style={tdStyle}>{task.priorityRequest ? 'Yes' : ''}</td>
                  <td style={tdStyle}>{formatCreatedAt(task.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!hasAny && (!Array.isArray(tasksWithoutIcal) || tasksWithoutIcal.length === 0) && (
        <div style={noTasksStyle}>No tasks are available this week!</div>
      )}
      {/* Modal for detailed task view, matching PendingTasksView */}
      {selectedTask && (
        <FadeInOverlay sidebarWidth={68} onClose={() => setSelectedTask(null)}>
          {(handleFadeOut) => (
            <div style={{ marginTop: 20, width: '100%', maxWidth: 1200 }}>
              <DetailedTaskView
                taskId={selectedTask.id}
                task={selectedTask}
                role={role}
                currentUser={currentUser}
                onCloseTask={() => setSelectedTask(null)}
              />
            </div>
          )}
        </FadeInOverlay>
      )}
    </div>
    </div>
  );
}

export default WeeklyAvailabilityView;
