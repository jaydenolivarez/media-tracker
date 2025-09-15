import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import SchedulingList from "./SchedulingList";
import SchedulingWindow from "./SchedulingWindow";
import { FiX } from "react-icons/fi";
import { useAuth } from "../context/AuthContext";

export default function SchedulingView() {
  const navigate = useNavigate();
  const auth = useAuth();
  // Route currently defined as /scheduling/task/:taskId, but we will store publicId here as well.
  // We'll resolve it by matching against filteredTasks by either .publicId or .id
  const { taskId: routeParam } = useParams();
  const location = useLocation();

  // Responsive: mobile when <= 900px (match SchedulingList)
  const [isMobile, setIsMobile] = React.useState(() => (typeof window !== "undefined" ? window.innerWidth <= 900 : false));
  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Selection state synced with URL
  const [selectedTaskId, setSelectedTaskId] = React.useState(null); // Firestore id
  const [selectedPublicId, setSelectedPublicId] = React.useState(null);

  // Filtered tasks (from list) for context if needed
  const [filteredTasks, setFilteredTasks] = React.useState([]);

  // Resolve route param -> selection (supports either Firestore id or publicId)
  React.useEffect(() => {
    if (!routeParam) {
      setSelectedTaskId(null);
      setSelectedPublicId(null);
      return;
    }
    const match = (Array.isArray(filteredTasks) ? filteredTasks : []).find(
      t => String(t.id) === String(routeParam) || String(t.publicId) === String(routeParam)
    );
    if (match) {
      setSelectedTaskId(match.id);
      setSelectedPublicId(match.publicId);
    }
    // else: wait until filteredTasks loads/updates
  }, [routeParam, filteredTasks, location.key]);

  // Calendar assign flow state
  // When user clicks "Assign this range" in calendar, we:
  // - select the task
  // - navigate to /scheduling/task/:id
  // - set a preselect range + flags to auto-open DateAssignmentModal in SchedulingWindow
  const [preselectDateRange, setPreselectDateRange] = React.useState(null); // { start: 'yyyy-MM-dd', end: 'yyyy-MM-dd' }
  const [autoOpenDateModal, setAutoOpenDateModal] = React.useState(false);
  const [assignmentOrigin, setAssignmentOrigin] = React.useState(null); // 'calendar_assign' | null
  const [isWeeklyView, setIsWeeklyView] = React.useState(false);
  // Skip first child notification so we only close drawer on actual user toggles
  const hasNotifiedWeeklyViewRef = React.useRef(false);
  // Trigger refetch in SchedulingList when something changes (e.g., stage moved out of Scheduling)
  const [refreshKey, setRefreshKey] = React.useState(0);

  // Update URL when selection changes
  const updateRouteForSelection = React.useCallback(
    (idOrPublicId) => {
      if (idOrPublicId) {
        // We prefer using publicId in URL for shareable links
        const match = (Array.isArray(filteredTasks) ? filteredTasks : []).find(
          t => String(t.id) === String(idOrPublicId) || String(t.publicId) === String(idOrPublicId)
        );
        const pub = match?.publicId ?? idOrPublicId;
        navigate(`/scheduling/task/${pub}`, { replace: false });
      } else {
        navigate(`/scheduling`, { replace: false });
      }
    },
    [navigate, filteredTasks]
  );

  const handleTaskSelect = React.useCallback(
    (id) => {
      setSelectedTaskId(id);
      const match = (Array.isArray(filteredTasks) ? filteredTasks : []).find(t => String(t.id) === String(id));
      setSelectedPublicId(match?.publicId ?? null);
      updateRouteForSelection(match?.publicId || id);
      // Clear any pending auto-open state when user manually selects another task
      if (id) {
        setAutoOpenDateModal(false);
        setPreselectDateRange(null);
        setAssignmentOrigin(null);
      }
    },
    [updateRouteForSelection, filteredTasks]
  );

  const handleCalendarAssign = React.useCallback((taskId, range) => {
    // range: { start: Date, end: Date } for RBC month events OR { start: yyyy-MM-dd, end: yyyy-MM-dd } in our week overlay
    // Normalize to yyyy-MM-dd strings expected by SchedulingWindow
    const toYmd = (v) => {
      if (!v) return "";
      if (typeof v === "string") {
        // Already yyyy-MM-dd
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
        // Try to parse string date
        const d = new Date(v);
        if (!isNaN(d)) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${dd}`;
        }
        return "";
      }
      const d = v instanceof Date ? v : new Date(v);
      if (isNaN(d)) return "";
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    };

    const startYmd = toYmd(range?.start);
    const endYmd = toYmd(range?.end) || startYmd;

    setSelectedTaskId(taskId);
    const match = (Array.isArray(filteredTasks) ? filteredTasks : []).find(t => String(t.id) === String(taskId));
    setSelectedPublicId(match?.publicId ?? null);
    updateRouteForSelection(match?.publicId || taskId);
    setPreselectDateRange({ start: startYmd, end: endYmd });
    setAutoOpenDateModal(true);
    setAssignmentOrigin("calendar_assign");
  }, [updateRouteForSelection, filteredTasks]);

  // Weekly view toggle from list: close drawer to maximize space when switching on
  const handleWeeklyViewToggle = React.useCallback((showingWeekly) => {
    setIsWeeklyView(!!showingWeekly);
    // Only react to real toggles, not the initial mount notification from child
    if (!hasNotifiedWeeklyViewRef.current) {
      hasNotifiedWeeklyViewRef.current = true;
      return;
    }
    // Close SchedulingWindow on toggle between List and Calendar
    setSelectedTaskId(null);
    setSelectedPublicId(null);
    updateRouteForSelection(null);
    // Clear any pending auto-open/assign state
    setAutoOpenDateModal(false);
    setPreselectDateRange(null);
    setAssignmentOrigin(null);
  }, [updateRouteForSelection]);

  // Wrapper styles
  const containerStyle = {
    width: "100%",
    height: "100%",
    flex: '1 1 auto',
    minHeight: 0,
    display: "flex",
    alignItems: "stretch",
    justifyContent: "stretch",
    boxSizing: "border-box",
    position: 'relative',
    overflow: 'hidden',
  };

  // Left pane (list/calendar)
  const leftPaneStyle = {
    flex: 1,
    minWidth: 0,
    display: isMobile && selectedTaskId ? "none" : "flex",
    flexDirection: 'column',
    minHeight: 0,
  };

  // Right pane (drawer)
  // Right pane (drawer). Overlay on calendar view to avoid shifting content.
  const rightPaneStyle = {
    width: isMobile ? "100%" : 560,
    maxWidth: isMobile ? "100%" : 560,
    display: selectedTaskId ? "flex" : "none",
    flexDirection: "column",
    background: "var(--bg-card)",
    border: "1px solid var(--sidebar-border)",
    borderRadius: isMobile ? 0 : 12,
    boxShadow: isMobile ? "none" : "0 10px 30px rgba(0,0,0,0.12)",
    overflowY: "hidden",
    boxSizing: 'border-box',
    // Use fixed on both to isolate from parent layout/paint
    position: "fixed",
    top: isMobile ? 56 : 0,
    bottom: isMobile ? 0 : 0,
    left: isMobile ? 0 : "auto",
    right: 0,
    zIndex: 1000,
    contain: 'layout paint style',
    scrollbarGutter: 'stable both-edges',
    transform: 'translateZ(0)',
    willChange: 'transform',
  };

  // Transform-only slide animation for the overlay drawer
  const drawerVariants = {
    hidden: { x: 64 },
    visible: { x: 0 },
    exit: { x: 64 },
  };

  // When the routed taskId disappears (e.g., user erased it in URL), clear selection
  React.useEffect(() => {
    if (!routeParam && selectedTaskId) {
      setSelectedTaskId(null);
    }
  }, [routeParam, selectedTaskId]);

  // Refresh and reset selection when the active role changes via RoleSwitcherModal
  React.useEffect(() => {
    // Ignore initial mount if needed; for now always reset on change
    setSelectedTaskId(null);
    setSelectedPublicId(null);
    updateRouteForSelection(null);
    setRefreshKey((k) => k + 1);
  }, [auth.activeRole]);

  return (
    <div style={containerStyle}>
      {/* Left: List/Calendar */}
      <div style={leftPaneStyle}>
        <SchedulingList
          selectedTaskId={selectedTaskId}
          onTaskSelect={handleTaskSelect}
          onFilteredTasksChange={setFilteredTasks}
          onWeeklyViewToggle={handleWeeklyViewToggle}
          onCalendarAssign={handleCalendarAssign}
          refreshKey={refreshKey}
        />
      </div>

      {/* Right: Drawer / Fullscreen on mobile (animated overlay) */}
      <AnimatePresence initial={false}>
        {selectedTaskId && (
          <motion.div
            key={selectedTaskId}
            style={rightPaneStyle}
            aria-hidden={!selectedTaskId}
            variants={drawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ type: 'tween', duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            layout={false}
          >
            {/* Desktop close button (mobile uses back affordance within SchedulingWindow) */}
            {!isMobile && (
              <button
                onClick={() => { setSelectedTaskId(null); setSelectedPublicId(null); updateRouteForSelection(null); }}
                aria-label="Close"
                title="Close"
                style={{
                  position: 'absolute',
                  top: 20,
                  right: 10,
                  zIndex: 1001,
                  background: 'var(--bg-card)',
                  border: 'none',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontWeight: 100,
                }}
              >
                <FiX size={20}/>
              </button>
            )}

            <SchedulingWindow
              taskId={selectedTaskId}
              isMobile={isMobile}
              onTaskUpdated={(evt) => {
                // Clear auto-open flags after update
                if (autoOpenDateModal) {
                  setAutoOpenDateModal(false);
                  setPreselectDateRange(null);
                  setAssignmentOrigin(null);
                }
                // If task stage moved to Shooting, refresh list and close drawer
                const stage = evt?.changes?.stage;
                if (stage === 'Shooting' && assignmentOrigin !== 'calendar_assign') {
                  setRefreshKey(k => k + 1);
                  setSelectedTaskId(null);
                  setSelectedPublicId(null);
                  updateRouteForSelection(null);
                } else if (stage === 'Shooting' && assignmentOrigin === 'calendar_assign') {
                  // Calendar-assign flow: keep drawer open to proceed with reassign.
                  // Still refresh the list in the background so the left list removes the task.
                  setRefreshKey(k => k + 1);
                }
              }}
              // Allow window to request close (X button)
              onRequestClose={() => {
                setSelectedTaskId(null);
                setSelectedPublicId(null);
                updateRouteForSelection(null);
              }}
              // Calendar-assign auto-open flow
              preselectDateRange={preselectDateRange}
              autoOpenDateModal={autoOpenDateModal}
              assignmentOrigin={assignmentOrigin}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}