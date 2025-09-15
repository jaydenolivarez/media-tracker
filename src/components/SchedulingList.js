// Restructured as component on SchedulingView

import React, { useEffect, useState, useRef } from "react";
import SchedulingCalendar from "./SchedulingCalendar";
import { getMediaTypeColor } from "../constants/mediaTypes";
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { FiClock } from "react-icons/fi";
import PropertyFilterToggle from "./PropertyFilterToggle";
import MediaTypeToggle from "./MediaTypeToggle";
import { MEDIA_TYPES } from "../constants/mediaTypes";
import TaskTable from "./TaskTable";
import GapSearchModal from "./GapSearchModal";
import AdminICalTestingToggle from "./AdminICalTestingToggle";

const SchedulingList = ({ selectedTaskId, onTaskSelect, onFilteredTasksChange, onWeeklyViewToggle, onCalendarAssign, refreshKey = 0 }) => {
  // --- Media Type Toggle State ---
  const auth = useAuth();
  const userData = auth.userData;
  const enabledMediaTypes = (userData?.permissions?.mediaTypes && Array.isArray(userData.permissions.mediaTypes))
    ? userData.permissions.mediaTypes
    : MEDIA_TYPES.map(t => t.key);
  const [selectedMediaTypes, setSelectedMediaTypes] = useState(enabledMediaTypes);

  // Initialize selected media types from shared user setting or default to all enabled
  useEffect(() => {
    if (userData?.permissions?.mediaTypes) {
      if (userData.mediaTypeToggle && Array.isArray(userData.mediaTypeToggle) && userData.mediaTypeToggle.length > 0) {
        setSelectedMediaTypes(userData.mediaTypeToggle.filter(type => enabledMediaTypes.includes(type)));
      } else {
        setSelectedMediaTypes([...enabledMediaTypes]);
      }
    }
  }, [userData]);

  // --- Sorting and Search State ---
  const [sortColumn, setSortColumn] = useState('createdAt');
  const [sortDirection, setSortDirection] = useState('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 900 : false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // --- Sorting Handler ---
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // --- Weekly Availability Handler ---
  const handleShowWeeklyAvailability = () => {
    setShowWeeklyView(true);
  };

  // --- Search Handler ---
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const [showingAvailable, setShowingAvailable] = useState(false);
  const [availableUnitCodes, setAvailableUnitCodes] = useState([]);
  const [showWeeklyView, setShowWeeklyView] = useState(false);
  // Notify parent when weekly view toggles (used to close drawer)
  useEffect(() => {
    if (typeof onWeeklyViewToggle === 'function') {
      onWeeklyViewToggle(showWeeklyView);
    }
  }, [showWeeklyView]);
  
  const role = auth.role;
  const activeRole = auth.activeRole;
  const [tasks, setTasks] = useState([]);
  const [propertyTypeFilter, setPropertyTypeFilter] = useState('all'); // 'all', 'new', 'existing'
  const [loading, setLoading] = useState(true);
  const [usersMap, setUsersMap] = useState({});
  // selectedTaskId is now controlled via props
// Remove local state

  const allowedRoles = ['manager', 'photographer'];
  const hasPermission = (
    (typeof auth?.hasAnyRole === 'function' && auth.hasAnyRole(allowedRoles)) ||
    (Array.isArray(auth?.roles) && auth.roles.some(r => allowedRoles.includes(String(r).toLowerCase()))) ||
    (typeof role === 'string' && allowedRoles.includes(role.trim().toLowerCase()))
  );
  const [gapSearchOpen, setGapSearchOpen] = useState(false);

  useEffect(() => {
    if (!hasPermission) return;
    const fetchSchedulingTasks = async () => {
      setLoading(true);
      const db = getFirestore();
      // Only fetch tasks in 'Scheduling' state (progressState === 1)
      const q = query(collection(db, "tasks"), where("stage", "==", "Scheduling"));
      const snap = await getDocs(q);
      const taskList = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      setTasks(taskList);
      setLoading(false);
      // Fetch user info for display
      const uniqueUserIds = [...new Set(taskList.map(t => t.createdBy || (t.log && t.log[0]?.user)))];
      const userSnaps = await Promise.all(
        uniqueUserIds.filter(Boolean).map(async uid => {
          try {
            const userRef = doc(db, "users", uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              return { id: uid, ...userSnap.data() };
            }
          } catch (e) {}
          return { id: uid };
        })
      );
      const usersObj = {};
      userSnaps.forEach(u => { if (u && u.id) usersObj[u.id] = u; });
      setUsersMap(usersObj);
    };
    fetchSchedulingTasks();
  }, [hasPermission, refreshKey, activeRole]);

  const currentUser = auth.currentUser;

  // Photographer-specific filter: only assigned & stage === 'Scheduling' and not archived
  let filteredTasks = tasks.filter(t => t.stage === "Scheduling" && !t.archived);
  if (showingAvailable && availableUnitCodes.length > 0) {
    filteredTasks = filteredTasks.filter(task => availableUnitCodes.includes(task.unitCode));
  } else if (activeRole === 'photographer' && auth.user && auth.user.uid) {
    filteredTasks = filteredTasks.filter(task => task.assignedPhotographer === auth.user.uid && task.stage === "Scheduling");
  }
  // --- Media Type Filter ---
  filteredTasks = filteredTasks.filter(task => selectedMediaTypes.includes(task.mediaType));
  
  // Filter tasks by propertyTypeFilter
  filteredTasks = filteredTasks.filter(task => {
    if (propertyTypeFilter === 'all') return true;
    if (propertyTypeFilter === 'new') return task.isNewProperty === true;
    if (propertyTypeFilter === 'existing') return task.isNewProperty === false;
    return true;
  });

// Propagate filtered tasks to parent for drawer selection context
React.useEffect(() => {
  if (typeof onFilteredTasksChange === 'function') {
    onFilteredTasksChange(filteredTasks);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [tasks, selectedMediaTypes, propertyTypeFilter, searchQuery, showingAvailable, availableUnitCodes]);

  // --- Search Filter (only in normal scheduling view)
  if (!showWeeklyView && searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filteredTasks = filteredTasks.filter(task => {
      // Match on property name, update type, assigned editor, emergency, createdAt
      const propertyName = (task.propertyName || '').toLowerCase();
      const updateType = (task.updateType || '').toLowerCase();
      const assignedEditor = (task.assignedEditorDisplayName || '').toLowerCase();
      const emergency = task.priorityRequest ? 'priority' : '';
      const createdAt = task.createdAt ? (typeof task.createdAt === 'string' ? task.createdAt : (task.createdAt.toDate ? task.createdAt.toDate().toISOString() : new Date(task.createdAt).toISOString())) : '';
      return (
        propertyName.includes(q) ||
        updateType.includes(q) ||
        assignedEditor.includes(q) ||
        emergency.includes(q) ||
        createdAt.includes(q)
      );
    });
  }

  // --- Sorting (only in normal scheduling view) ---
  if (!showWeeklyView && sortColumn) {
    filteredTasks = [...filteredTasks].sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];
      // Special handling for createdAt (date)
      if (sortColumn === 'createdAt') {
        aVal = aVal ? (typeof aVal === 'string' ? new Date(aVal) : (aVal.toDate ? aVal.toDate() : new Date(aVal))) : 0;
        bVal = bVal ? (typeof bVal === 'string' ? new Date(bVal) : (bVal.toDate ? bVal.toDate() : new Date(bVal))) : 0;
      }
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // Prevent infinite update loop: Only call onFilteredTasksChange if filteredTasks actually changed
  const lastFilteredRef = React.useRef();
  React.useEffect(() => {
    const last = lastFilteredRef.current;
    const isSame =
      last &&
      last.length === filteredTasks.length &&
      last.every((t, i) => t.id === filteredTasks[i].id);
    if (!isSame && typeof onFilteredTasksChange === 'function') {
      onFilteredTasksChange(filteredTasks);
      lastFilteredRef.current = filteredTasks;
    }
  }, [filteredTasks, onFilteredTasksChange]);

  if (role === 'admin') {
    // Add admin-specific logic here
  }

  return (
    <div
      style={{
        height: '100%',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'stretch',
        backgroundColor: 'var(--page-header)',
      }}
    >
      {/* Admin iCal Testing Toggle 
  {userData?.permissions?.adminTesting === true && (
               <div style={{ width: '100%', display: 'flex', flexDirection: 'row', justifyContent: 'center', marginBottom: 8 }}>
          <AdminICalTestingToggle />
        </div>
  )}
        */}
      {/* CONSOLIDATED FILTER/TITLE/SEARCH ROW */}
      <div>
      <div className="scheduling-controls" style={{
        width: '100%',
        margin: '20px 0 10px 0',
        display: 'flex',
        alignItems: 'center',
        minHeight: 64,
      }}>
        {/* Center: Title + Show Available/Show All Button */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginLeft: 40 }}>
          
          <h1 style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: 28, letterSpacing: 0.1, margin: 0, marginRight: 18, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {!isMobile && (
              <span style={{ display: 'inline-flex', alignItems: 'center', fontFamily: "var(--title-font)" }}>
                <FiClock size={24} style={{ color: '#3b82f6', marginRight: 12 }} /> Scheduling
              </span>
            )}
          <button
            style={{
              background: showWeeklyView ? '#f97316' : '#3b82f6',
              color: '#fff',
              border: '1.5px solid var(--sidebar-border)',
              borderRadius: 8,
              padding: '8px 18px',
              marginLeft: 0,
              fontWeight: 600,
              fontSize: 16,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(80,120,200,0.07)',
              transition: 'background 0.15s, border 0.15s',
              display: 'inline-block',
              whiteSpace: 'nowrap',
              zIndex: 40,
              marginLeft: 20,
            }}
            onClick={() => setShowWeeklyView(v => !v)}
            >
            {showWeeklyView ? 'Show List' : 'Show Calendar'}
          </button>
          {/* Media Type Toggle: desktop only (mobile goes into Filter modal) */}
          {!isMobile && (
            <span style={{ display: 'inline-block', marginLeft: 60, verticalAlign: 'middle' }}>
              <MediaTypeToggle
                enabledMediaTypes={enabledMediaTypes}
                selectedMediaTypes={selectedMediaTypes}
                onChange={setSelectedMediaTypes}
                persistKey="mediaTypeToggle"
              />
            </span>
          )}
          </h1>
          {/* Gap Search Button + Modal only when weekly view is active */}
          {showWeeklyView && (
            <>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button
                  style={{
                    background: 'linear-gradient(90deg, #f97316, #fbbf24)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 17,
                    border: 'none',
                    borderRadius: 10,
                    padding: '8px 18px',
                    marginRight: 40,
                    cursor: 'pointer',
                    boxShadow: '0 2px 12px rgba(249,115,22,0.10)',
                    letterSpacing: 0.2,
                    outline: 'none',
                    transition: 'background 0.18s, box-shadow 0.18s',
                  }}
                  onClick={() => setGapSearchOpen(true)}
                >
                  Gap Search
                </button>
              </div>
              <GapSearchModal open={gapSearchOpen} onClose={() => setGapSearchOpen(false)} />
            </>
          )}
        </div>
        {!showWeeklyView && (
          <>
        {/* Right controls: desktop vs mobile */}
        {isMobile ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
            <button
              style={{
                background: 'var(--bg-card)',
                border: '1.5px solid var(--sidebar-border)',
                color: 'var(--text-main)',
                borderRadius: 8,
                padding: '8px 14px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(80,120,200,0.05)'
              }}
              onClick={() => setFilterOpen(true)}
            >
              Filter
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={handleSearchChange}
                style={{
                  width: searchOpen ? 220 : 0,
                  opacity: searchOpen ? 1 : 0,
                  marginRight: searchOpen ? 12 : 0,
                  transition: 'width 0.35s cubic-bezier(.4,0,.2,1), opacity 0.23s cubic-bezier(.4,0,.2,1), margin 0.2s',
                  padding: searchOpen ? '8px 14px' : '8px 0px',
                  borderRadius: 8,
                  border: '1.5px solid var(--sidebar-border)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-main)',
                  fontSize: 16,
                  outline: 'none',
                  boxShadow: searchOpen ? '0 2px 8px rgba(80,120,200,0.07)' : 'none',
                  pointerEvents: searchOpen ? 'auto' : 'none',
                  minWidth: 0,
                  maxWidth: '100%',
                }}
                onBlur={() => { if (searchQuery === "") setSearchOpen(false); }}
                onKeyDown={e => { if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(""); } }}
              />
              <button
                title={searchOpen ? "Close Search" : "Search Tasks"}
                style={{
                  background: 'var(--bg-card)',
                  border: '1.5px solid var(--sidebar-border)',
                  color: 'var(--text-main)',
                  borderRadius: 10,
                  padding: 8,
                  marginRight: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(80,120,200,0.05)',
                  transition: 'background 0.15s, border 0.15s',
                }}
                onClick={() => {
                  setSearchOpen(o => {
                    if (!o) setTimeout(() => searchInputRef.current && searchInputRef.current.focus(), 80);
                    else if (searchQuery !== "") setSearchQuery("");
                    return !o;
                  });
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'var(--sidebar-bg)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = 'var(--bg-card)';
                }}
              >
                <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </button>
            </div>
            <div style={{ minWidth: 120, maxWidth: 220, display: 'flex', marginRight: 40 }}>
              <PropertyFilterToggle
                value={propertyTypeFilter}
                onChange={setPropertyTypeFilter}
                style={{ width: '100%', minWidth: 90, fontSize: 14, padding: '4px 12px' }}
              />
            </div>
          </div>
        )}
          </>
        )}
      </div>
      {/* Mobile Filter Modal */}
      {isMobile && filterOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.5)', zIndex: 99999, display: 'flex',
          alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto'
        }}
          onClick={e => { if (e.target === e.currentTarget) setFilterOpen(false); }}
        >
          <div style={{
            width: '100%', maxWidth: 560, background: 'var(--bg-card)', color: 'var(--text-main)',
            borderRadius: 12, margin: '24px 12px', boxShadow: '0 10px 30px rgba(0,0,0,0.25)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--sidebar-border)' }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Filters</div>
              <button onClick={() => setFilterOpen(false)} aria-label="Close" style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Search</div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search tasks..."
                    value={searchQuery}
                    onChange={handleSearchChange}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1.5px solid var(--sidebar-border)',
                      background: 'var(--bg-main)',
                      color: 'var(--text-main)',
                      fontSize: 16,
                      outline: 'none',
                    }}
                  />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Property Type</div>
                <PropertyFilterToggle
                  value={propertyTypeFilter}
                  onChange={setPropertyTypeFilter}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Media Types</div>
                <MediaTypeToggle
                  enabledMediaTypes={enabledMediaTypes}
                  selectedMediaTypes={selectedMediaTypes}
                  onChange={setSelectedMediaTypes}
                  persistKey="mediaTypeToggle"
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  style={{
                    background: 'transparent', border: '1px solid var(--sidebar-border)', color: 'var(--text-main)', borderRadius: 8, padding: '10px 14px', cursor: 'pointer'
                  }}
                  onClick={() => { setSearchQuery(''); setFilterOpen(false); }}
                >
                  Clear
                </button>
                <button
                  style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => setFilterOpen(false)}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
        {showWeeklyView ? (
          // New modern week calendar view
          <div style={{ flex: 1, minHeight: 0 }}>
            <SchedulingCalendar
              tasks={filteredTasks}
              selectedTaskId={selectedTaskId}
              onEventClick={(id) => onTaskSelect && onTaskSelect(id)}
              onAssign={(taskId, range) => {
                if (typeof onCalendarAssign === 'function') {
                  onCalendarAssign(taskId, range);
                }
              }}
            />
          </div>
        ) : (
          <div className="scheduling-table-container" style={{flex: 1, overflowY: 'auto', boxShadow: "0 2px 16px rgba(80,120,200,0.07)",}}>
            <style>{`
              .scheduling-table-container {
                background: var(--bg-main);
                overflow-y: hidden;
              }
            `}</style>
            {(() => {
              const mobileVisibleColumns = [
                ...(enabledMediaTypes.length > 1 ? ["mediaType"] : []),
                "propertyName",
                "updateType",
              ];
              const desktopVisibleColumns = [
                "propertyName",
                "updateType",
                "emergency",
                "createdAt",
                ...(enabledMediaTypes.length > 1 ? ["mediaType"] : []),
              ];
              return (
            <TaskTable
              tasks={filteredTasks}
              users={Object.values(usersMap)}
              onRowClick={task => onTaskSelect(task.id)}
              visibleColumns={isMobile ? mobileVisibleColumns : desktopVisibleColumns}
              sortColumn={!showWeeklyView ? sortColumn : undefined}
              sortDirection={!showWeeklyView ? sortDirection : undefined}
              onSort={!showWeeklyView ? handleSort : undefined}
              enableRowProps={true}
              rowProps={(task) => {
                const isSelected = selectedTaskId && task.id === selectedTaskId;
                return {
                  'data-task-row': 'true',
                  'data-selected': isSelected ? 'true' : 'false',
                  style: isSelected ? {
                    outline: '2px solid #4f46e5',
                    outlineOffset: -2,
                    background: 'rgba(79,70,229,0.06)',
                    borderLeft: `4px solid ${getMediaTypeColor(task.mediaType)}`
                  } : {}
                };
              }}
            />) })()}
          </div>
        )}
      </div>  
    </div>
  );
};

export default SchedulingList;
