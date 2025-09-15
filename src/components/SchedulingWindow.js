  
/**
 * SchedulingWindow: Modular, swappable info-block detail view for scheduling tasks.
 * Use in both PendingTasksView and WeeklyAvailabilityView.
 * Pass infoBlocks as an array of React nodes for flexible arrangement.
 */

import PropTypes from 'prop-types';
import ReactDOM from 'react-dom';
import './SchedulingWindow.css';
import { getMediaTypeLabel, getMediaTypeColor } from "../constants/mediaTypes";
import { getActiveSecurityCodes, todayYmdCentral } from "../utils/securityCodes";
import StageProgressBar from "./StageProgressBar";
import { getStagesForMediaType } from "../constants/stages";
import { useState, useEffect, useRef, useMemo } from "react";
import { getFirestore, doc, getDocs, getDoc, updateDoc, collection, onSnapshot, query, orderBy, addDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useBanner } from "../context/BannerContext";
import { FiArchive, FiUserPlus, FiLock, FiUnlock, FiCalendar, FiFilter, FiExternalLink } from "react-icons/fi";
import ArchiveConfirmModal from "./ArchiveConfirmModal";
import CompleteTaskModal from "./CompleteTaskModal";
import ReassignModal from "./ReassignModal";
import DateAssignmentModal from "./DateAssignmentModal";
import { addTaskLog } from "../taskLogs";
import { getUserDisplayName } from "../utils/userDisplayName";
import { parseICalEvents } from "../utils/icalAvailability";
import { sha256 } from "js-sha256";

function getCurrentStage(task) {
  const { NAMES: stageNames } = getStagesForMediaType(task?.mediaType);
  if (!task) return stageNames[0];
  if (typeof task.stage === "string" && stageNames.includes(task.stage)) return task.stage;
  return stageNames[0];
}

// Helper to format Firestore Timestamp or ISO string (match DetailedTaskView)
function formatDate(val) {
  if (!val) return "-";
  if (typeof val === "object" && val.seconds) {
    const d = new Date(val.seconds * 1000);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString();
  }
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-');
    return `${Number(m)}/${Number(d)}/${y}`;
  }
  if (typeof val === "string" && !isNaN(Date.parse(val))) {
    return new Date(val).toLocaleString();
  }
  return val.toString();
}


const SchedulingWindow = ({ task, taskId, role, onTaskUpdated, isMobile, infoBlocks = [], preselectDateRange, autoOpenDateModal, assignmentOrigin }) => {
  // --- Archive State ---
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiving, setArchiving] = useState(false);
  // --- Reassign Modal State ---
  const [showReassign, setShowReassign] = useState(false);
  const [multiEditorAssignments, setMultiEditorAssignments] = useState([]);
  const [assignmentModalError, setAssignmentModalError] = useState("");
  const [originalAssignments, setOriginalAssignments] = useState("");
  const [photographer, setPhotographer] = useState("");
  const [originalPhotographer, setOriginalPhotographer] = useState("");
  const [users, setUsers] = useState([]);
  // --- Property info ---
  const [propNames, setPropNames] = useState(null);
  const [addressCity, setAddressCity] = useState("");
  const [securityCodesUpdatedAt, setSecurityCodesUpdatedAt] = useState("");
  // --- Banner/Error State ---
  const { showBanner, hideBanner } = useBanner();
  const auth = useAuth();

  // --- Shooting Date Modal State (range default) ---
  const [showEditScheduledDate, setShowEditScheduledDate] = useState(false);
  const [showScheduleAssignPanel, setShowScheduleAssignPanel] = useState(false);
  // hold YYYY-MM-DD strings
  const [scheduledShootDateEdit, setScheduledShootDateEdit] = useState({ start: "", end: "" });
  const [savingScheduledDate, setSavingScheduledDate] = useState(false);
  const [scheduledDateError, setScheduledDateError] = useState("");
  const [scheduledDateSuccess, setScheduledDateSuccess] = useState("");
  // Calendar options bubbled from embedded DateAssignmentModal
  const [combinedCalendarOpts, setCombinedCalendarOpts] = useState({ enabled: false, recipients: [] });
  // Portal target for Google Calendar invite section (placed under Reassign panel)
  const invitePortalRef = useRef(null);
  // Confirm modal for saving without a photographer
  const [showNoPhotogConfirm, setShowNoPhotogConfirm] = useState(false);
  const [pendingSaveRequested, setPendingSaveRequested] = useState(false);
  

  // --- Helper: iconBtn style ---
  const iconBtn = {
    background: "var(--button-bg)",
    border: "1.5px solid var(--button-border)",
    color: "var(--button-text)",
    borderRadius: 8,
    padding: "7px 14px",
    fontWeight: 600,
    fontSize: 15,
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    transition: "background 0.15s, border 0.15s, color 0.15s"
  };

  // Load property names (with address info) once
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const db = getFirestore();
        const ref = doc(db, "autocomplete", "propertyNames");
        const snap = await getDoc(ref);
        if (!mounted) return;
        if (snap.exists()) {
          const list = Array.isArray(snap.get("names")) ? snap.get("names") : [];
          setPropNames(list);
          const ts = snap.get("securityCodesUpdatedAt");
          setSecurityCodesUpdatedAt(typeof ts === 'string' ? ts : (ts && ts.toISOString ? ts.toISOString() : ""));
        } else {
          setPropNames([]);
        }
      } catch (e) {
        setPropNames([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  

  // --- Live Task Subscription ---
  const [taskDoc, setTaskDoc] = useState(task || null);
  const resolvedTaskId = taskId || task?.id;
  useEffect(() => {
    if (!resolvedTaskId) return;
    const db = getFirestore();
    const ref = doc(db, "tasks", resolvedTaskId);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setTaskDoc({ id: snap.id, ...snap.data() });
      }
    });
    return () => unsub();
  }, [resolvedTaskId]);

  const viewTask = taskDoc || task;

  // Resolve city for current task (after viewTask is defined)
  useEffect(() => {
    if (!propNames || !viewTask) { setAddressCity(""); return; }
    const norm = (s) => (s || "").toString().trim().toLowerCase();
    const u = norm(viewTask.unitCode || viewTask.propertyName);
    const n = norm(viewTask.propertyName);
    let foundCity = "";
    for (const item of propNames) {
      const iu = norm(item && item.unitCode);
      const iname = norm(item && item.name);
      if ((iu && (iu === u || iu === n)) || (iname && (iname === u || iname === n))) {
        foundCity = (item && item.addressCity) || "";
        break;
      }
    }
    setAddressCity(foundCity);
  }, [propNames, viewTask?.unitCode, viewTask?.propertyName]);

  // Auto-open Date modal when invoked from calendar selection
  const [autoOpenHandledFor, setAutoOpenHandledFor] = useState(null);
  useEffect(() => {
    if (!viewTask?.id) return;
    if (!autoOpenDateModal || !preselectDateRange || !preselectDateRange.start || !preselectDateRange.end) return;
    if (autoOpenHandledFor === viewTask.id) return;
    // Preload range and open
    setScheduledShootDateEdit({ start: preselectDateRange.start, end: preselectDateRange.end });
    setScheduledDateError("");
    setScheduledDateSuccess("");
    setShowEditScheduledDate(true);
    setAutoOpenHandledFor(viewTask.id);
  }, [viewTask?.id, autoOpenDateModal, preselectDateRange, autoOpenHandledFor]);

  // --- Tabs: Info, Comments, History ---
  const [activeTab, setActiveTab] = useState('info'); // 'info' | 'comments' | 'history'
  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  // Notes: show the initial creation note (earliest comment text) or 'None'
  const notes = useMemo(() => {
    const list = Array.isArray(comments) ? comments : [];
    if (list.length === 0) return 'None';
    const first = list[0] || {};
    const text = (first.text || first.message || '').toString().trim();
    return text || 'None';
  }, [comments]);

  // Live subscribe to comments
  useEffect(() => {
    if (!viewTask?.id) return;
    const db = getFirestore();
    const commentsRef = collection(db, "tasks", viewTask.id, "comments");
    const q = query(commentsRef, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [viewTask?.id]);

  async function handleAddComment() {
    if (!viewTask?.id || !commentInput.trim() || commentSubmitting) return;
    setCommentSubmitting(true);
    try {
      const db = getFirestore();
      const commentsRef = collection(db, "tasks", viewTask.id, "comments");
      await addDoc(commentsRef, {
        text: commentInput.trim(),
        createdAt: serverTimestamp(),
        // Store as object for consistency with DetailedTaskView
        user: {
          uid: auth?.userData?.id || auth?.userData?.uid || "unknown",
          displayName: auth?.userData?.displayName || auth?.userData?.email || auth?.userData?.id || "Unknown User"
        },
        timestamp: new Date().toISOString(),
      });
      setCommentInput("");
      if (typeof onTaskUpdated === 'function') {
        onTaskUpdated({ id: viewTask.id, action: 'comment_add' });
      }
    } catch (e) {
      showBanner && showBanner("Failed to add comment: " + (e.message || e), "error");
    }
    setCommentSubmitting(false);
  }

 

  // --- Archive Handler ---
  async function handleArchiveTask() {
    if (!viewTask || archiving) return;
    setArchiving(true);
    try {
      const db = getFirestore();
      const taskRef = doc(db, "tasks", viewTask.id);
      await updateDoc(taskRef, { archived: true });
      setShowArchiveModal(false);
      // Add undo logic and logging if needed
      // ...
      if (typeof onTaskUpdated === 'function') {
        onTaskUpdated({ id: viewTask.id, action: 'archive', changes: { archived: true } });
      }
    } catch (e) {
      showBanner && showBanner("Failed to archive task: " + (e.message || e), "error");
    }
    setArchiving(false);
  }

  // --- Shooting Date Helpers ---
  function toLocalNoonISOString(yyyyMmDd) {
    if (!yyyyMmDd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return null;
    const [y, m, d] = yyyyMmDd.split('-').map(Number);
    // Set to local noon to avoid timezone drift
    const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
    return dt.toISOString();
  }

  // Determine if task has a valid scheduled date
  function hasValidScheduledDate() {
    const val = viewTask?.scheduledShootDate;
    if (!val) return false;
    if (typeof val === 'object') {
      return !!(val.start || val.end);
    }
    if (typeof val === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return true;
      const d = new Date(val);
      return !isNaN(d);
    }
    return false;
  }

  // Helpers for Google Calendar URL
  function yyyymmddFrom(val) {
    if (!val) return null;
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      return val.replace(/-/g, '');
    }
    const d = new Date(val);
    if (isNaN(d)) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  function addDaysYmd(yyyymmdd, days) {
    if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd;
    const y = parseInt(yyyymmdd.slice(0, 4), 10);
    const m = parseInt(yyyymmdd.slice(4, 6), 10) - 1;
    const d = parseInt(yyyymmdd.slice(6, 8), 10);
    const dt = new Date(y, m, d);
    dt.setDate(dt.getDate() + days);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}${mm}${dd}`;
  }

  function buildGoogleCalendarURL(task, usersArr /* recipientEmails intentionally ignored to avoid notifications */) {
    const sched = task?.scheduledShootDate;
    if (!sched) return null;
    let startYmd = null;
    let endYmd = null;
    if (typeof sched === 'object' && (sched.start || sched.end)) {
      startYmd = yyyymmddFrom(sched.start || sched.end);
      endYmd = yyyymmddFrom(sched.end || sched.start);
    } else if (typeof sched === 'string') {
      startYmd = yyyymmddFrom(sched);
      endYmd = startYmd;
    }
    if (!startYmd) return null;
    if (!endYmd) endYmd = startYmd;
    // Google all-day events use end-exclusive
    const endExclusive = addDaysYmd(endYmd, 1);

    // Resolve expanded property entry
    const norm = (s) => (s || '').toString().trim().toLowerCase();
    const loose = (s) => norm(s).replace(/[^a-z0-9]/g, '');
    const keyName = norm(task.propertyName);
    const keyLoose = loose(task.propertyName);
    const keyUnit = norm(task.unitCode || task.unit || task.unit_code);
    let matchedItem = null;
    if (Array.isArray(propNames)) {
      for (const item of propNames) {
        const nm = norm(item && item.name);
        const nmLoose = loose(item && item.name);
        const uc = norm(item && item.unitCode);
        const ucLoose = loose(item && item.unitCode);
        if ((nm && (nm === keyName || nmLoose === keyLoose)) ||
            (uc && (uc === keyUnit || uc === keyName)) ||
            (ucLoose && (ucLoose === loose(task.unitCode || task.unit || task.unit_code) || ucLoose === keyLoose))) {
          matchedItem = item;
          break;
        }
      }
    }

    const mediaLabel = getMediaTypeLabel(task?.mediaType) || 'Media';
    const fullPhotogName = task?.assignedPhotographer
      ? getUserDisplayName(task.assignedPhotographer, Array.isArray(usersArr) ? usersArr : [])
      : 'Unassigned';
    const photographerName = (() => {
      const v = (fullPhotogName || '').toString().trim();
      if (!v) return 'Unassigned';
      // If looks like email, take part before '@'
      if (v.includes('@')) return v.split('@')[0];
      // Otherwise take first token by space
      return v.split(/\s+/)[0];
    })();
    const expandedName = (matchedItem && matchedItem.name) || task?.propertyName || 'Shoot';
    const title = `(${photographerName} - ${mediaLabel}) ${expandedName}`;

    // Notes: from earliest comment (computed above via useMemo)

    // Security codes: active as of uploaded timestamp (Central)
    let securityCodesBlock = 'N/A';
    try {
      const asOf = securityCodesUpdatedAt && !isNaN(Date.parse(securityCodesUpdatedAt)) ? new Date(securityCodesUpdatedAt) : new Date();
      const asOfYmd = todayYmdCentral(asOf);
      const codes = Array.isArray(matchedItem?.securityCodes) ? matchedItem.securityCodes : [];
      const active = getActiveSecurityCodes(codes, asOfYmd, asOf);
      if (active.length > 0) {
        securityCodesBlock = active
          .map(c => {
            const type = (c.codeType || 'Code').toString().trim();
            return `${type}: ${c.code}`;
          })
          .join('\n');
      }
    } catch (_) {}

    const taskLink = task?.publicId ? `https://media.ortools.co/dashboard/tasks/${task.publicId}` : '';
    const details = [
      `Update Type: ${task?.updateType || ''}`,
      `Notes: ${notes}`,
      `Task Link: ${taskLink || 'N/A'}`,
      '',
      '---- Security Codes ----',
      '',
      securityCodesBlock,
    ].join('\n');

    // Location: Use full address if available
    const location = matchedItem && (matchedItem.address || [matchedItem.addressStreet, matchedItem.addressCity, matchedItem.addressZip].filter(Boolean).join(', '))
      || task?.propertyName || '';

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates: `${startYmd}/${endExclusive}`,
      details,
      location,
    });
    // Suppress notifications: do not append guests; add sendUpdates=none for safety
    let url = `https://calendar.google.com/calendar/render?${params.toString()}&sendUpdates=none`;
    return url;
  }

  function openEditShootingDate() {
    // initialize edit state from task.scheduledShootDate
    const cur = viewTask?.scheduledShootDate;
    if (cur && typeof cur === 'object' && cur.start && cur.end) {
      // try to coerce ISO or YYYY-MM-DD to YYYY-MM-DD
      const toYmd = (val) => {
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
        const date = new Date(val);
        if (isNaN(date)) return "";
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      };
      setScheduledShootDateEdit({ start: toYmd(cur.start), end: toYmd(cur.end) });
    } else if (typeof cur === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cur)) {
      setScheduledShootDateEdit({ start: cur, end: cur });
    } else {
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const d = String(today.getDate()).padStart(2, '0');
      const ymd = `${y}-${m}-${d}`;
      setScheduledShootDateEdit({ start: ymd, end: ymd });
    }
    setScheduledDateError("");
    setScheduledDateSuccess("");
    // Initialize assignment state (prefill editors and photographer) without opening legacy modal
    const assignedEditors = Array.isArray(viewTask?.assignedEditors) ? viewTask.assignedEditors : [];
    const allUnassigned = assignedEditors.length === 0 || assignedEditors.every(a => !a || !a.editorId);
    const canonicalUnassigned = { editorId: '', label: 'Exterior', customLabel: '' };
    const initial = allUnassigned
      ? [canonicalUnassigned]
      : assignedEditors.map(a => ({
          editorId: a.editorId || '',
          label: (a.label && a.label.length > 0) ? a.label : 'Exterior',
          customLabel: a.customLabel || ''
        }));
    const initialString = JSON.stringify(initial);
    setMultiEditorAssignments(initial);
    setOriginalAssignments(initialString);
    setAssignmentModalError("");
    setPhotographer(viewTask?.assignedPhotographer || "");
    setOriginalPhotographer(viewTask?.assignedPhotographer || "");
    // For SchedulingWindow, open combined Schedule + Assign panel
    setShowScheduleAssignPanel(true);
  }

  async function handleSaveScheduledDateRange(calendarOpts) {
    if (!scheduledShootDateEdit?.start || !scheduledShootDateEdit?.end) return;
    setSavingScheduledDate(true);
    setScheduledDateError("");
    try {
      const db = getFirestore();
      const taskRef = doc(db, "tasks", viewTask.id);
      const startISO = toLocalNoonISOString(scheduledShootDateEdit.start);
      const endISO = toLocalNoonISOString(scheduledShootDateEdit.end);
      const now = new Date().toISOString();

      // Compute initial overlap state against current iCal (end-exclusive)
      let scheduledOverBlockedAtCreate = false;
      let initialBlockKey = null;
      try {
        const icalUrl = viewTask?.ical;
        if (icalUrl) {
          const resp = await fetch(icalUrl);
          const text = await resp.text();
          const events = parseICalEvents(text);
          const s = new Date(startISO);
          const e = new Date(endISO);
          const overlaps = [];
          for (const ev of events) {
            const evStart = new Date(ev.start);
            const evEnd = new Date(ev.end);
            if (evStart < e && s < evEnd) {
              overlaps.push({ start: evStart, end: evEnd });
            }
          }
          if (overlaps.length > 0) scheduledOverBlockedAtCreate = true;
          const parts = overlaps
            .map(o => `${o.start.toISOString().slice(0,10)}_${o.end.toISOString().slice(0,10)}`)
            .sort();
          const base = [
            String(viewTask.id || ""),
            new Date(startISO).toISOString().slice(0,10),
            new Date(endISO).toISOString().slice(0,10),
            ...parts,
          ].join("|");
          initialBlockKey = sha256(base);
        }
      } catch (e) {
        // Best-effort; if iCal fetch/parse fails, proceed without flags
      }

      const scheduledByUid = auth.userData?.id || auth.userData?.uid || "unknown";
      await updateDoc(taskRef, {
        scheduledShootDate: { start: startISO, end: endISO },
        stage: 'Shooting',
        lastProgressUpdate: now,
        scheduledByUid,
        scheduledOverBlockedAtCreate,
        ...(initialBlockKey ? { initialBlockKey } : {}),
      });
      // Optimistically update local task state
      setTaskDoc(prev => prev ? { ...prev, scheduledShootDate: { start: startISO, end: endISO }, stage: 'Shooting', lastProgressUpdate: now, scheduledByUid } : prev);
      // Log progress update to Shooting
      try {
        const uid = auth.userData?.id || auth.userData?.uid || "unknown";
        const displayName = auth.userData?.displayName || auth.userData?.email || auth.userData?.id || "Unknown User";
        await addTaskLog(viewTask.id, {
          type: "progress_update",
          user: { uid, displayName },
          timestamp: now,
          description: `Progress updated to Shooting`
        });
      } catch (e) {}
      setCurrentStage('Shooting');
      setScheduledDateSuccess("Shooting date updated!");
      setTimeout(() => setScheduledDateSuccess(""), 1500);
      setShowEditScheduledDate(false);
      if (typeof onTaskUpdated === 'function') {
        onTaskUpdated({ id: viewTask.id, action: 'save_date', changes: { scheduledShootDate: { start: startISO, end: endISO }, stage: 'Shooting', lastProgressUpdate: now } });
      }
      // If invoked from calendar assign flow, open reassign UI next
      if (assignmentOrigin === 'calendar_assign') {
        setTimeout(() => {
          openMultiEditorModal();
        }, 0);
      }
      // Open Google Calendar invite if requested
      if (calendarOpts && calendarOpts.enabled) {
        const recipients = Array.isArray(calendarOpts.recipients) ? calendarOpts.recipients.filter(Boolean) : [];
        const virtualTask = { ...viewTask, scheduledShootDate: { start: startISO, end: endISO } };
        const url = buildGoogleCalendarURL(virtualTask, Array.isArray(users) ? users : [], recipients);
        if (!url) {
          showBanner && showBanner('No valid shooting date to create calendar event.', 'error');
        } else {
          try {
            window.open(url, '_blank', 'noopener,noreferrer');
          } catch (e) {
            showBanner && showBanner('Failed to open Google Calendar.', 'error');
          }
        }
      }
    } catch (e) {
      setScheduledDateError("Failed to update date: " + (e.message || e));
    }
    setSavingScheduledDate(false);
  }

  async function handleClearScheduledDate() {
    setSavingScheduledDate(true);
    setScheduledDateError("");
    try {
      const db = getFirestore();
      const taskRef = doc(db, "tasks", viewTask.id);
      const now = new Date().toISOString();
      await updateDoc(taskRef, { scheduledShootDate: null, stage: 'Scheduling', lastProgressUpdate: now });
      // Optimistically update local task state
      setTaskDoc(prev => prev ? { ...prev, scheduledShootDate: null, stage: 'Scheduling', lastProgressUpdate: now } : prev);
      // Log progress update to Scheduling
      try {
        const uid = auth.userData?.id || auth.userData?.uid || "unknown";
        const displayName = auth.userData?.displayName || auth.userData?.email || auth.userData?.id || "Unknown User";
        await addTaskLog(viewTask.id, {
          type: "progress_update",
          user: { uid, displayName },
          timestamp: now,
          description: `Progress updated to Scheduling`
        });
      } catch (e) {}
      setCurrentStage('Scheduling');
      setScheduledDateSuccess("Shooting date cleared!");
      setTimeout(() => setScheduledDateSuccess(""), 1500);
      if (typeof onTaskUpdated === 'function') {
        onTaskUpdated({ id: viewTask.id, action: 'clear_date', changes: { scheduledShootDate: null, stage: 'Scheduling', lastProgressUpdate: now } });
      }
    } catch (e) {
      setScheduledDateError("Failed to clear date: " + (e.message || e));
    }
    setSavingScheduledDate(false);
  }

  // --- Reassign Handlers (simplified, see DetailedTaskView for full logic) ---
  function openMultiEditorModal() {
    // Prefill assignments
    const assignedEditors = Array.isArray(viewTask?.assignedEditors) ? viewTask.assignedEditors : [];
    const allUnassigned = assignedEditors.length === 0 ||
      assignedEditors.every(a => !a || !a.editorId);
    const canonicalUnassigned = { editorId: '', label: 'Exterior', customLabel: '' };
    const initial = allUnassigned
      ? [canonicalUnassigned]
      : assignedEditors.map(a => ({
          editorId: a.editorId || '',
          label: (a.label && a.label.length > 0) ? a.label : 'Exterior',
          customLabel: a.customLabel || ''
        }));
    const initialString = JSON.stringify(initial);
    setMultiEditorAssignments(initial);
    setOriginalAssignments(initialString);
    setAssignmentModalError("");
    setPhotographer(viewTask?.assignedPhotographer || "");
    setOriginalPhotographer(viewTask?.assignedPhotographer || "");
    setTimeout(() => setShowReassign(true), 0);
  }

  function handleEditorChange(idx, editorId) {
    setMultiEditorAssignments(prev => (Array.isArray(prev) ? prev : []).map((a, i) => i === idx ? { ...a, editorId } : a));
  }
  function handleLabelChange(idx, label) {
    setMultiEditorAssignments(prev => (Array.isArray(prev) ? prev : []).map((a, i) => i === idx ? { ...a, label, customLabel: label === 'Custom' ? a.customLabel : '' } : a));
  }
  function handleCustomLabelChange(idx, customLabel) {
    setMultiEditorAssignments(prev => (Array.isArray(prev) ? prev : []).map((a, i) => i === idx ? { ...a, customLabel } : a));
  }
  function addEditorAssignment() {
    setMultiEditorAssignments(prev => {
      const prevList = Array.isArray(prev) ? prev : [];
      const assignedIds = prevList.map(a => a && a.editorId).filter(Boolean);
      const candidates = (Array.isArray(users) ? users : [])
        .map(u => (u && (u.uid || u.id)))
        .filter(Boolean);
      const defaultId = candidates.find(id => !assignedIds.includes(id)) || candidates[0] || '';
      return [
        ...prevList,
        { editorId: defaultId, label: 'Exterior', customLabel: '' }
      ];
    });
  }
  function removeEditorAssignment(idx) {
    setMultiEditorAssignments(prev => (Array.isArray(prev) ? prev : []).filter((_, i) => i !== idx));
  }
  async function handleMultiEditorAssign() {
    const safeAssignments = Array.isArray(multiEditorAssignments) ? multiEditorAssignments : [];
    setAssignmentModalError("");
    try {
      const assignedIds = safeAssignments.map(a => a.editorId).filter(Boolean);
      const hasDuplicates = assignedIds.length !== new Set(assignedIds).size;
      if (hasDuplicates) {
        setAssignmentModalError("Duplicate editors are not allowed.");
        return;
      }
      for (const a of safeAssignments) {
        if (a.label === 'Custom' && !a.customLabel.trim()) {
          setAssignmentModalError("Custom label cannot be blank.");
          return;
        }
      }
      // Prepare update object for Firestore (normalize and compare deterministically)
      const normalize = (arr) => {
        const list = Array.isArray(arr) ? arr : [];
        const normalized = list
          .filter(x => x && x.editorId)
          .map(x => {
            const label = x.label && x.label.length > 0 ? x.label : 'Exterior';
            const customLabel = label === 'Custom' ? (x.customLabel || '').trim() : '';
            return { editorId: x.editorId, label, customLabel };
          });
        normalized.sort((a, b) => {
          if (String(a.editorId) !== String(b.editorId)) return String(a.editorId).localeCompare(String(b.editorId));
          if (a.label !== b.label) return a.label.localeCompare(b.label);
          return a.customLabel.localeCompare(b.customLabel);
        });
        return normalized;
      };
      const normalizedForCompare = normalize(safeAssignments);
      const newAssignments = (Array.isArray(safeAssignments) ? safeAssignments : [])
        .filter(x => x && x.editorId)
        .map(x => {
          const label = x.label && x.label.length > 0 ? x.label : 'Exterior';
          const customLabel = label === 'Custom' ? (x.customLabel || '').trim() : '';
          return { editorId: x.editorId, label, customLabel };
        });
      let prevParsed = [];
      try {
        const parsed = JSON.parse(originalAssignments);
        prevParsed = normalize(parsed);
      } catch (e) { prevParsed = []; }
      const updateObj = {};
      if (JSON.stringify(normalizedForCompare) !== JSON.stringify(prevParsed)) {
        updateObj.assignedEditors = newAssignments;
        updateObj.assignedEditorIds = newAssignments.map(a => a.editorId);
      }
      if (photographer !== originalPhotographer) {
        updateObj.assignedPhotographer = photographer || null;
      }
      if (Object.keys(updateObj).length === 0) {
        setAssignmentModalError("No changes to save.");
        return;
      }

      const db = getFirestore();
      const taskRef = doc(db, "tasks", viewTask.id);
      await updateDoc(taskRef, updateObj);

      // Build change summary for logging
      let prevEditors = [];
      try {
        const parsed = JSON.parse(originalAssignments);
        prevEditors = normalize(parsed).map(a => a.editorId);
      } catch (e) { prevEditors = []; }
      const newEditorIds = newAssignments.map(a => a.editorId);
      const addedEditors = newEditorIds.filter(id => !prevEditors.includes(id));
      const removedEditors = prevEditors.filter(id => !newEditorIds.includes(id));
      const getName = (uid) => {
        if (!uid) return 'Unassigned';
        const u = (Array.isArray(users) ? users : []).find(u => (u.uid || u.id) === uid);
        return u ? (u.displayName || u.email || u.uid || u.id) : uid;
      };
      const deltaParts = [];
      if (addedEditors.length > 0) deltaParts.push(`Added editor(s): ${addedEditors.map(getName).join(", ")}`);
      if (removedEditors.length > 0) deltaParts.push(`Removed editor(s): ${removedEditors.map(getName).join(", ")}`);
      let photographerChangeDesc = "";
      if (photographer !== originalPhotographer) {
        const prevPhotog = getName(originalPhotographer);
        const newPhotog = getName(photographer);
        photographerChangeDesc = `Photographer changed: ${prevPhotog || 'Unassigned'} → ${newPhotog || 'Unassigned'}`;
      }
      const descParts = [...deltaParts];
      if (photographerChangeDesc) descParts.push(photographerChangeDesc);
      const summary = descParts.length > 0 ? descParts.join(", ") : "No changes.";

      await addTaskLog(viewTask.id, {
        type: "assignment_update",
        user: {
          uid: auth.userData?.id || auth.userData?.uid || "unknown",
          displayName: auth.userData?.displayName || auth.userData?.email || auth.userData?.id || "Unknown User"
        },
        timestamp: new Date().toISOString(),
        description: `Task assignments updated: ${summary}`
      });

      // Close modal and notify
      setShowReassign(false);
      showBanner && showBanner("Assignments updated", "success");
      if (typeof onTaskUpdated === 'function') {
        onTaskUpdated({ id: viewTask.id, action: 'reassign', changes: updateObj });
      }
    } catch (e) {
      setAssignmentModalError("Failed to update assignments: " + (e.message || e));
    }
  }

  // Fetch users if needed (simplified)
  useEffect(() => {
    async function fetchUsers() {
      try {
        const db = getFirestore();
        const q = await getDocs(collection(db, "users"));
        setUsers(q.docs.map(doc => ({ ...doc.data(), uid: doc.id })));
      } catch (e) {}
    }
    fetchUsers();
  }, []);


  // --- Progress Bar Editing State ---
  const [isEditingProgress, setIsEditingProgress] = useState(false);
  const [pendingProgressState, setPendingProgressState] = useState(null);
  // Local display of current stage to reflect immediate changes without waiting for parent re-render
  const [currentStage, setCurrentStage] = useState(getCurrentStage(viewTask));
  const [progressSuccess, setProgressSuccess] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [submittingComplete, setSubmittingComplete] = useState(false);
  // Managers can edit. Support either explicit role prop or user_manager flag in userData
  const canEditProgress = role === "manager" || auth?.userData?.role === "manager" || auth?.userData?.user_manager === true;
  // Visibility for Schedule & Assign button: managers only (new multi-role aware, with legacy fallbacks)
  const isManager = (auth?.hasRole && auth.hasRole('manager'))
    || (Array.isArray(auth?.roles) && auth.roles.includes('manager'))
    || role === 'manager'
    || auth?.userData?.role === 'manager'
    || auth?.userData?.user_manager === true;
  // Keep local currentStage in sync when a new task arrives or its stage changes
  useEffect(() => {
    setCurrentStage(getCurrentStage(viewTask));
  }, [viewTask?.stage, viewTask?.mediaType]);

  if (!viewTask) {
    return (
        <div style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#888",
            fontSize: 22,
            fontWeight: 500,
            flexDirection: "column",
            opacity: 0.8,
          }}>
            <div>No task selected</div>
            <div style={{ fontSize: 14, marginTop: 8, color: "#aaa" }}>
              Select a task from the left to view details here.
            </div>
          </div>
    );
  }

  return (
    <div className={`scheduling-window${isMobile ? ' mobile' : ''}`}>
      {/* Back button moved to global MobileTopNav */}
      {/* Modern header */}
      <div className="sw-header">
        {/* Top-left: Open on Dashboard link */}
        {viewTask?.publicId && (
          <div style={{ gridColumn: '1 / -1', marginBottom: 10 }}>
            <a
              href={`/dashboard/tasks/${viewTask.publicId}`}
              title="Open on Dashboard"
              style={{
                position: 'absolute',
                  top: 20,
                  right: 60,
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
              <FiExternalLink size={20} color="var(--text-main)"/>
            </a>
          </div>
        )}
        <div className="sw-title-row" style={{ gridColumn: '1 / -1', marginBottom: 20 }}>
          <div className="sw-title" title={viewTask.propertyName || ''}>
            {viewTask.propertyName || 'Untitled'}
          </div>
          <span
            className="sw-chip"
            style={{ background: getMediaTypeColor(viewTask.mediaType) }}
          >
            {getMediaTypeLabel(viewTask.mediaType)}
          </span>
        </div>

        <div className="sw-progress-row">
          <StageProgressBar
            stage={isEditingProgress && pendingProgressState !== null ? pendingProgressState : currentStage}
            mediaType={viewTask.mediaType}
            editable={isEditingProgress && canEditProgress}
            onStageChange={(newStage) => {
              if (!isEditingProgress || !canEditProgress) return;
              const { NAMES: stageNames } = getStagesForMediaType(viewTask?.mediaType);
              if (!stageNames.includes(newStage)) return;
              setPendingProgressState(newStage);
            }}
            hideStageLabel={true}
          />
          {canEditProgress && (
            <button
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                marginLeft: 4,
                color: isEditingProgress ? '#3b82f6' : '#888',
                fontSize: 22,
                display: 'flex',
                alignItems: 'center',
              }}
              title={isEditingProgress ? "Lock progress bar (save)" : "Unlock to edit progress"}
              onClick={async () => {
                if (!isEditingProgress) {
                  setPendingProgressState(getCurrentStage(viewTask));
                  setIsEditingProgress(true);
                } else {
                  const current = currentStage;
                  if (pendingProgressState === 'Completed' && pendingProgressState !== current) {
                    setShowCompleteModal(true);
                    return;
                  }
                  setIsEditingProgress(false);
                  if (pendingProgressState !== null && pendingProgressState !== current) {
                    try {
                      const db = getFirestore();
                      const taskRef = doc(db, "tasks", viewTask.id);
                      await updateDoc(taskRef, {
                        stage: pendingProgressState,
                        lastProgressUpdate: new Date().toISOString(),
                      });
                      await addTaskLog(viewTask.id, {
                        type: "progress_update",
                        user: {
                          uid: auth.userData?.id || auth.userData?.uid || "unknown",
                          displayName: auth.userData?.displayName || auth.userData?.email || auth.userData?.id || "Unknown User"
                        },
                        timestamp: new Date().toISOString(),
                        description: `Progress updated to ${pendingProgressState}`
                      });
                      setCurrentStage(pendingProgressState);
                      showBanner && showBanner("Progress updated", "success");
                      if (typeof onTaskUpdated === 'function') {
                        onTaskUpdated({ id: viewTask.id, action: 'progress', changes: { stage: pendingProgressState } });
                      }
                    } catch (e) {
                      showBanner && showBanner("Failed to update progress: " + (e.message || e), "error");
                    }
                  }
                  setPendingProgressState(null);
                }
              }}
            >
              {isEditingProgress ? <FiUnlock /> : <FiLock />}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 20}}>
          {isManager ? (
            <button style={{ ...iconBtn, background: '#3b82f6', color: '#fff' }} onClick={openEditShootingDate} title="Schedule and Assign"><FiCalendar />Schedule & Assign</button>
          ) : null}
        </div>
      </div>

      {/* Flexible info blocks for custom arrangement */}
      <div className="scheduling-window-blocks" style={{ margin: '12px 24px 0' }}>
        {/* Full-width segmented control tabs (outside of panel) */}
        <div
          className="sw-segmented"
          style={{ '--active-index': (activeTab === 'info' ? '0' : activeTab === 'comments' ? '1' : '2') }}
        >
          <div className="sw-thumb" />
          {['info','comments','history'].map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`sw-seg${activeTab === t ? ' active' : ''}`}
              aria-pressed={activeTab === t}
            >
              {t[0].toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab content panel with fixed height and internal scroll */}
        <div className="sw-tabpanel">
          <div className="sw-scroll">
            {activeTab === 'info' && ((Array.isArray(infoBlocks) ? infoBlocks : []).length > 0 ? (Array.isArray(infoBlocks) ? infoBlocks : []) : (
              <>
                <div className="scheduling-window-section">
                  <strong>Update Type:</strong> {viewTask.updateType || 'N/A'}
                </div>
                <div className="scheduling-window-section">
                  <strong>Property Type:</strong> {viewTask.propertyType || 'N/A'}
                </div>
                <div className="scheduling-window-section">
                  <strong>Created Date:</strong> {viewTask?.createdAt?.seconds
                    ? new Date(viewTask.createdAt.seconds * 1000).toLocaleDateString()
                    : (typeof viewTask?.createdAt === 'string' ? viewTask.createdAt : 'N/A')}
                </div>
                <div className="scheduling-window-section" style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div>
                    <strong>Shooting Date:</strong>{' '}
                    {(() => {
                      const val = viewTask.scheduledShootDate;
                      if (!val) return 'Not set';
                      const fmt = (v) => {
                        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
                        const d = new Date(v);
                        if (isNaN(d)) return '-';
                        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                      };
                      if (typeof val === 'object' && val.start && val.end) {
                        const s = fmt(val.start);
                        const e = fmt(val.end);
                        return `${s} – ${e}`;
                      }
                      if (typeof val === 'string') return val;
                      return 'Not set';
                    })()}
                  </div>
                  {viewTask.scheduledShootDate && (
                    <button style={iconBtn} onClick={handleClearScheduledDate} title="Clear shooting date">Clear</button>
                  )}
                </div>
                <div className="scheduling-window-section" style={{ marginTop: 40 }}>
                  <strong>Assigned Photographer:</strong> {viewTask.assignedPhotographer
                    ? getUserDisplayName(viewTask.assignedPhotographer, Array.isArray(users) ? users : [])
                    : 'Unassigned'}
                </div>
                <div className="scheduling-window-section">
                  <strong>Location:</strong> {addressCity || 'N/A'}
                </div>
                <div className="scheduling-window-section" style={{ marginTop: 40 }}>
                  <strong>Notes:</strong> {notes}
                </div>
              </>
            ))}

            {activeTab === 'comments' && (
              <div className="scheduling-window-section sw-comments-section">
                <div className="sw-comments-list">
                  {(Array.isArray(comments) ? comments : []).map(c => {
                    const author = getUserDisplayName(c.user, Array.isArray(users) ? users : []);
                    const text = c.text || c.message || "";
                    return (
                      <div key={c.id} className="sw-comment">
                        {text ? (
                          <div className="sw-comment-text">
                            {text.split(/(@\[[^\]]+\]\([^\)]+\))/g).map((part, idx) => {
                              const match = part.match(/^@\[([^\]]+)\]\(([^)]+)\)$/);
                              if (match) {
                                return <span key={idx} style={{ color: '#3b82f6', fontWeight: 600 }}>{match[1]}</span>;
                              } else {
                                return part;
                              }
                            })}
                          </div>
                        ) : null}
                        <div className="sw-comment-byline">
                          {c.user && <span>{author}</span>} { (c.timestamp || c.createdAt) ? <span> | {formatDate(c.timestamp || c.createdAt)}</span> : null }
                        </div>
                      </div>
                    );
                  })}
                  {(!comments || comments.length === 0) && (
                    <div style={{ color: '#94a3b8' }}>No comments yet</div>
                  )}
                </div>
                <div className="sw-actions-row sw-comments-input">
                  <input
                    type="text"
                    value={commentInput}
                    onChange={e => setCommentInput(e.target.value)}
                    placeholder="Add a comment..."
                    className="sw-input"
                  />
                  <button onClick={handleAddComment} disabled={commentSubmitting || !commentInput.trim()} style={iconBtn}>Post</button>
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="scheduling-window-section sw-history-section">
                <div className="sw-history-list">
                  {(Array.isArray(viewTask?.log) ? viewTask.log : []).map((l, idx) => {
                    const actor = getUserDisplayName(l.user, Array.isArray(users) ? users : []);
                    const tsv = l.timestamp ? (typeof l.timestamp === 'string' ? new Date(l.timestamp) : (l.timestamp.seconds ? new Date(l.timestamp.seconds * 1000) : null)) : null;
                    const tss = tsv && !isNaN(tsv) ? tsv.toLocaleString() : '';
                    return (
                      <div key={idx} className="sw-history-item">
                        <div className="sw-history-desc">{l.description || l.type}</div>
                        <div className="sw-history-byline">{actor ? `${actor} · ` : ''}{tss}</div>
                      </div>
                    );
                  })}
                  {(!viewTask?.log || viewTask.log.length === 0) && (
                    <div style={{ color: '#94a3b8' }}>No history yet</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      

      {/* Archive Modal */}
      {showArchiveModal && (
        <ArchiveConfirmModal
          open={showArchiveModal}
          submitting={archiving}
          onConfirm={handleArchiveTask}
          onCancel={() => setShowArchiveModal(false)}
        />
      )}

      {/* Reassign Modal */}
      {showReassign && (
        <ReassignModal
          open={showReassign}
          onClose={() => setShowReassign(false)}
          multiEditorAssignments={Array.isArray(multiEditorAssignments) ? multiEditorAssignments : []}
          users={Array.isArray(users) ? users : []}
          handleEditorChange={handleEditorChange}
          handleLabelChange={handleLabelChange}
          handleCustomLabelChange={handleCustomLabelChange}
          addEditorAssignment={addEditorAssignment}
          removeEditorAssignment={removeEditorAssignment}
          assignmentModalError={assignmentModalError}
          originalAssignments={originalAssignments}
          iconBtn={iconBtn}
          handleMultiEditorAssign={handleMultiEditorAssign}
          photographer={photographer}
          setPhotographer={setPhotographer}
          originalPhotographer={originalPhotographer}
        />
      )}

      {/* Complete Task Modal */}
      {showCompleteModal && (
        <CompleteTaskModal
          open={showCompleteModal}
          submitting={submittingComplete}
          onClose={() => {
            setShowCompleteModal(false);
            // keep edit mode; user might continue adjusting
          }}
          onConfirm={async (notes) => {
            if (submittingComplete) return;
            setSubmittingComplete(true);
            try {
              const db = getFirestore();
              const taskRef = doc(db, "tasks", viewTask.id);
              const uid = auth.userData?.id || auth.userData?.uid || "unknown";
              const displayName = auth.userData?.displayName || auth.userData?.email || auth.userData?.id || "Unknown User";
              const now = new Date().toISOString();
              await updateDoc(taskRef, {
                stage: 'Completed',
                completedDate: now,
                completedBy: uid,
                lastProgressUpdate: now
              });
              await addTaskLog(viewTask.id, {
                type: 'progress_update',
                user: { uid, displayName },
                timestamp: now,
                description: `Progress updated to Completed${notes ? ` — Notes: ${notes}` : ''}`
              });
              setIsEditingProgress(false);
              setPendingProgressState(null);
              setShowCompleteModal(false);
              setCurrentStage('Completed');
              showBanner && showBanner("Task marked complete", "success");
              if (typeof onTaskUpdated === 'function') {
                onTaskUpdated({ id: viewTask.id, action: 'complete', changes: { stage: 'Completed', completedDate: now, completedBy: uid, lastProgressUpdate: now } });
              }
            } catch (e) {
              showBanner && showBanner('Failed to complete task: ' + (e.message || e), 'error');
            }
            setSubmittingComplete(false);
          }}
        />
      )}

      {/* Combined Schedule + Assign panel (via portal to cover full viewport) */}
      {showScheduleAssignPanel && (
        ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.24)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 100090,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflowY: 'auto',
            padding: 20,
            marginLeft: 68
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowScheduleAssignPanel(false); }}
          aria-modal="true"
          role="dialog"
        >
          <div
            style={{
              background: 'var(--bg-card)',
              borderRadius: 16,
              boxShadow: '0 6px 36px rgba(60,80,130,0.18)',
              padding: 24,
              width: '95vw',
              maxWidth: 1200
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-main)', marginBottom: 20, marginLeft: 20 }}>Schedule & Assign</div>
              <button
                onClick={() => setShowScheduleAssignPanel(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: 20 }}
                aria-label="Close"
              >×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div style={{ paddingRight: 12, borderRight: '1px solid var(--button-border)' }}>
                <DateAssignmentModal
                  inline={true}
                  open={true}
                  onClose={() => setShowScheduleAssignPanel(false)}
                  onSave={() => { /* disabled via hideActions */ }}
                  onClear={async () => { await handleClearScheduledDate(); setShowScheduleAssignPanel(false); }}
                  value={scheduledShootDateEdit}
                  firestoreValue={viewTask?.scheduledShootDate || null}
                  loading={savingScheduledDate}
                  error={scheduledDateError}
                  success={scheduledDateSuccess}
                  onChange={(val) => setScheduledShootDateEdit({ start: val.start || '', end: val.end || '' })}
                  rangeEnabled={true}
                  title={'Select Shooting Date Range'}
                  unitCode={viewTask?.unitCode || viewTask?.propertyName || ''}
                  currentUserEmail={auth?.userData?.email || ''}
                  photographerEmail={(Array.isArray(users) ? users : []).find(u => (u.uid || u.id) === (photographer || viewTask?.assignedPhotographer || ''))?.email || ''}
                  hideActions={true}
                  embeddedStyle={true}
                  onCalendarOptionsChange={opts => setCombinedCalendarOpts(opts || { enabled: false, recipients: [] })}
                  invitePortalEl={invitePortalRef.current}
                />
              </div>
              <div style={{ paddingLeft: 12 }}>
                <ReassignModal
                  inline={true}
                  open={true}
                  onClose={() => setShowScheduleAssignPanel(false)}
                  multiEditorAssignments={multiEditorAssignments}
                  users={Array.isArray(users) ? users : []}
                  handleEditorChange={handleEditorChange}
                  handleLabelChange={handleLabelChange}
                  handleCustomLabelChange={handleCustomLabelChange}
                  addEditorAssignment={addEditorAssignment}
                  removeEditorAssignment={removeEditorAssignment}
                  assignmentModalError={assignmentModalError}
                  originalAssignments={originalAssignments}
                  iconBtn={iconBtn}
                  handleMultiEditorAssign={handleMultiEditorAssign}
                  photographer={photographer}
                  setPhotographer={setPhotographer}
                  originalPhotographer={originalPhotographer}
                  hideActions={true}
                  embeddedStyle={true}
                />
                {/* Host the Google Calendar invite controls below the assignment panel */}
                <div ref={invitePortalRef} style={{ marginTop: 16 }} />
              </div>
            </div>
            {/* Unified actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
              <button
                style={{ ...iconBtn, background: 'var(--sidebar-bg)', color: 'var(--text-main)' }}
                onClick={() => setShowScheduleAssignPanel(false)}
              >
                Cancel
              </button>
              <button
                style={{ ...iconBtn, background: '#3b82f6', color: '#fff' }}
                onClick={async () => {
                  const selectedPhotographer = photographer || viewTask?.assignedPhotographer || '';
                  if (!selectedPhotographer) {
                    // Defer actual save until user confirms
                    setPendingSaveRequested(true);
                    setShowNoPhotogConfirm(true);
                    return;
                  }
                  await handleMultiEditorAssign();
                  await handleSaveScheduledDateRange(combinedCalendarOpts);
                  setShowScheduleAssignPanel(false);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>, document.body)
      )}

      {/* Confirm overlay: proceed without photographer */}
      {showNoPhotogConfirm && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.45)',
            zIndex: 100120,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowNoPhotogConfirm(false); }}
          aria-modal="true"
          role="dialog"
        >
          <div
            style={{
              background: 'var(--bg-card)',
              color: 'var(--text-main)',
              border: '1.5px solid var(--button-border)',
              borderRadius: 12,
              width: '92vw',
              maxWidth: 520,
              padding: 22,
              boxShadow: '0 10px 40px rgba(0,0,0,0.25)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 10 }}>Proceed without assigning a photographer?</div>
            <div style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.9 }}>
              You are about to schedule this task without assigning a photographer. You can assign one now in the panel, or continue without assigning.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button
                style={{ ...iconBtn, background: 'var(--sidebar-bg)', color: 'var(--text-main)' }}
                onClick={() => { setShowNoPhotogConfirm(false); setPendingSaveRequested(false); }}
              >
                Cancel
              </button>
              <button
                style={{ ...iconBtn, background: '#3b82f6', color: '#fff' }}
                onClick={async () => {
                  // Proceed with save even without photographer
                  setShowNoPhotogConfirm(false);
                  if (!pendingSaveRequested) return;
                  setPendingSaveRequested(false);
                  await handleMultiEditorAssign();
                  await handleSaveScheduledDateRange(combinedCalendarOpts);
                  setShowScheduleAssignPanel(false);
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>, document.body)}
    </div>
  );
};

const infoRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  marginBottom: 4,
  fontSize: 16,
  fontWeight: 400,
  color: 'var(--text-main)'
};

const infoLabel = {
  color: "#6b7a90",
  fontWeight: 500
};

SchedulingWindow.propTypes = {
  taskId: PropTypes.string,
  task: PropTypes.object,
  role: PropTypes.string,
  onTaskUpdated: PropTypes.func,
  isMobile: PropTypes.bool,
  infoBlocks: PropTypes.arrayOf(PropTypes.node),
  preselectDateRange: PropTypes.shape({ start: PropTypes.string, end: PropTypes.string }),
  autoOpenDateModal: PropTypes.bool,
  assignmentOrigin: PropTypes.string,
};

export default SchedulingWindow;