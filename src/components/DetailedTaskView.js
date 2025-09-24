import React, { useState, useEffect, useRef } from 'react';
import { useUndo } from './UndoProvider';
import { useParams, useNavigate } from "react-router-dom";
// Cleaned up unused imports and variables
import { useAuth } from "../context/AuthContext";
import { getUserDisplayName } from "../utils/userDisplayName";
import FloatingBanner from "./FloatingBanner";
import { useBanner } from "../context/BannerContext";
import StageProgressBar from "./StageProgressBar";
import DateAssignmentModal from "./DateAssignmentModal";
import { onSnapshot, getFirestore, doc, getDoc, getDocs, updateDoc, collection, addDoc, query, orderBy, where } from "firebase/firestore";
import { logAction } from "../utils/logAction";
import { addTaskLog } from "../taskLogs";
import { FiUserPlus, FiAlertCircle, FiUser, FiLock, FiUnlock, FiPlus, FiArchive, FiLink, FiInfo  } from "react-icons/fi";
import InfoModal from "./InfoModal";
import ArchiveConfirmModal from "./ArchiveConfirmModal";
import ReassignModal from "./ReassignModal";
// import ReportIssueModal from "./ReportIssueModal";
import { getStagesForMediaType } from "../constants/stages";
import { getMediaTypeLabel, getMediaTypeColor } from "../constants/mediaTypes";
import AccessDeniedPage from "./AccessDeniedPage";
import CompleteTaskModal from "./CompleteTaskModal";

// role: 'manager' | 'photographer' | 'editor' | 'user'
// NOTE: role is now passed as a prop from the parent. Do not use /* useAuth removed: now using role prop from parent */ here.
// Helper to format Firestore Timestamp or ISO string
function formatDate(val) {
  if (!val) return "-";
  if (typeof val === "object" && val.seconds) {
    const d = new Date(val.seconds * 1000);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString();
  }
  // If val is YYYY-MM-DD, show as-is (or prettify)
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
    // Optionally prettify: e.g., July 22, 2025
    const [y, m, d] = val.split('-');
    return `${Number(m)}/${Number(d)}/${y}`;
  }
  if (typeof val === "string" && !isNaN(Date.parse(val))) {
    return new Date(val).toLocaleString();
  }
  return val.toString();
}

// Helper to format Firestore Timestamp or ISO string as date only
function formatDateOnly(val) {
  if (!val) return "-";
  if (typeof val === "object" && val.seconds) {
    const d = new Date(val.seconds * 1000);
    return d.toLocaleDateString();
  }
  // If val is YYYY-MM-DD, show as-is (or prettify)
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-');
    return `${Number(m)}/${Number(d)}/${y}`;
  }
  if (typeof val === "string" && !isNaN(Date.parse(val))) {
    return new Date(val).toLocaleDateString();
  }
  return val.toString();
}

function getCurrentStage(task) {
  const { NAMES: stageNames } = getStagesForMediaType(task?.mediaType);
  if (!task) return stageNames[0];
  if (typeof task.stage === "string" && stageNames.includes(task.stage)) return task.stage;
  return stageNames[0];
}

// Helpers for Google Calendar all-day event URL building (end-exclusive)
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
function buildGoogleCalendarURL(task, usersArr, recipientEmails) {
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
  const endExclusive = addDaysYmd(endYmd, 1);

  const mediaLabel = getMediaTypeLabel(task?.mediaType) || 'Media';
  const title = `${task?.propertyName || 'Shoot'} — ${mediaLabel}`;
  const photographerName = task?.assignedPhotographer
    ? getUserDisplayName(task.assignedPhotographer, Array.isArray(usersArr) ? usersArr : [])
    : 'Unassigned';
  const detailsParts = [];
  detailsParts.push(`Assigned photographer: ${photographerName}`);
  if (task?.updateType) detailsParts.push(`Update type: ${task.updateType}`);
  if (task?.id) detailsParts.push(`Task ID: ${task.id}`);
  const details = detailsParts.join('\n');
  const location = task?.propertyName || '';

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${startYmd}/${endExclusive}`,
    details,
    location,
  });
  let url = `https://calendar.google.com/calendar/render?${params.toString()}`;
  const guests = Array.isArray(recipientEmails) ? recipientEmails.filter(Boolean) : [];
  if (guests.length > 0) {
    url += guests.map(e => `&add=${encodeURIComponent(e)}`).join('');
  }
  return url;
}

const DetailedTaskView = (props) => {
  // --- Archive State ---
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiving, setArchiving] = useState(false);
  // Property metadata for website link
  const [propNames, setPropNames] = useState(null);
  const [orUrl, setOrUrl] = useState("");
  const [securityCodes, setSecurityCodes] = useState([]);
  const [showSecurityCodes, setShowSecurityCodes] = useState(false);
  const [securityCodesUpdatedAt, setSecurityCodesUpdatedAt] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);

  // Archive handler
  async function handleArchiveTask() {
    if (!task || archiving) return;
    setArchiving(true);
    try {
      const db = getFirestore();
      const taskRef = doc(db, "tasks", task.id);
      await updateDoc(taskRef, { archived: true });
      // Action log: task archived (best-effort)
      try {
        const device = { ua: (typeof navigator!== 'undefined' && navigator.userAgent) || '', platform: (typeof navigator!== 'undefined' && navigator.platform) || '', lang: (typeof navigator!== 'undefined' && navigator.language) || '', w: (typeof window!=='undefined' && window.innerWidth) || null, h: (typeof window!=='undefined' && window.innerHeight) || null };
        await logAction({
          action: 'task_archived',
          userId: auth.user?.uid || '',
          userEmail: auth.user?.email || '',
          actingRoles: Array.isArray(auth.userData?.roles) ? auth.userData.roles : (auth.userData?.role ? [auth.userData.role] : []),
          permissionsSnapshot: { adminTrackingLog: !!auth.userData?.permissions?.adminTrackingLog },
          targetType: 'task',
          targetId: task.id,
          context: 'detailed_task_view',
          severity: 'info',
          message: `Archived task ${task.id}`,
          metadata: { propertyName: task.propertyName || '', mediaType: task.mediaType || '', device },
        });
      } catch (_) {}
      setShowArchiveModal(false);
      addUndoAction({
        description: "Task archived.",
        onUndo: async () => {
          await updateDoc(taskRef, { archived: false });
        },
        onFinalize: async () => {
          await addTaskLog(task.id, {
            type: "archived",
            user: {
              uid: auth.userData?.id || auth.userData?.uid || "unknown",
              displayName: auth.userData?.displayName || auth.userData?.email || auth.userData?.id || "Unknown User"
            },
            timestamp: new Date().toISOString(),
            description: `Task archived`
          });
        },
        duration: 10000
      });
    } catch (e) {
      setErrorBanner("Failed to archive task: " + (e.message || e));
      setTimeout(() => setErrorBanner(null), 2000);
    }
    setArchiving(false);
  }

  // Handler for completing shooting (moves to next stage; optionally attaches file links)
  async function handleCompleteShooting() {
    if (!task || submittingShooting) return;
    setSubmittingShooting(true);
    try {
      const db = getFirestore();
      const taskRef = doc(db, "tasks", task.id);
      const now = new Date().toISOString();
      // Determine next stage after 'Shooting' based on mediaType stages
      const { NAMES: stageNames } = getStagesForMediaType(task?.mediaType);
      const currentIdx = stageNames.indexOf('Shooting');
      const nextStage = currentIdx >= 0 && currentIdx < stageNames.length - 1
        ? stageNames[currentIdx + 1]
        : 'Editing';
      // Update task: set stage to nextStage and record timestamp
      await updateDoc(taskRef, {
        stage: nextStage,
        lastProgressUpdate: now
      });
      // Attach any file links provided
      const filesToAdd = Array.isArray(shootingFileLinks)
        ? shootingFileLinks.filter(f => f && typeof f.url === 'string' && f.url.trim().length > 0)
        : [];
      if (filesToAdd.length > 0) {
        const filesRef = collection(db, 'tasks', task.id, 'files');
        for (const f of filesToAdd) {
          try {
            await addDoc(filesRef, {
              url: f.url.trim(),
              label: (f.label || '').trim(),
              createdAt: now,
            });
          } catch (_) {}
        }
        try {
          await addTaskLog(task.id, {
            type: 'file_links_added',
            user: { uid: auth.userData?.id || auth.userData?.uid || "unknown", displayName: auth.userData?.displayName || auth.userData?.email || auth.userData?.id || "Unknown User" },
            timestamp: now,
            description: `Photographer attached ${filesToAdd.length} file link(s) when marking shooting complete`
          });
        } catch (_) {}
      }
      // Add task log entry for shooting completion
      await addTaskLog(task.id, {
        type: 'shooting_completed',
        user: {
          uid: auth.userData?.id || auth.userData?.uid || 'unknown',
          displayName: auth.userData?.displayName || auth.userData?.email || auth.userData?.id || 'Unknown User'
        },
        timestamp: now,
        description: `Shooting marked complete; advanced to ${nextStage}`,
        notes: shootingNotes || ''
      });
      // Persist notes as a comment (optional)
      if (shootingNotes && shootingNotes.trim().length > 0) {
        try {
          const commentsRef = collection(db, 'tasks', task.id, 'comments');
          await addDoc(commentsRef, {
            user: {
              uid: auth.userData?.id || auth.userData?.uid || 'unknown',
              displayName: auth.userData?.displayName || auth.userData?.email || auth.userData?.id || 'Unknown User',
            },
            text: `Shooting Completion Notes: ${shootingNotes.trim()}`,
            taggedUsers: [],
            createdAt: now,
            timestamp: now,
          });
        } catch (_) {}
      }
      // Optimistically update local task state
      setTask(prev => prev ? { ...prev, stage: nextStage, lastProgressUpdate: now } : prev);
      // Close modal and reset
      setShowCompleteShootingModal(false);
      setShootingNotes("");
      setShootingFileLinks([{ url: '', label: '' }]);
      showBanner && showBanner('Shooting marked complete', 'success');
      // Force a full page refresh to ensure all lists and views reflect changes
      try { window.location.reload(); } catch (_) {}
    } catch (e) {
      setErrorBanner('Failed to submit shooting completion: ' + (e.message || e));
      setTimeout(() => setErrorBanner(null), 2000);
    }
    setSubmittingShooting(false);
  }

  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showCompleteTaskModal, setShowCompleteTaskModal] = useState(false);
  // --- File hover state for x button ---
  const [hoveredFileId, setHoveredFileId] = useState(null);
  const { addUndoAction } = useUndo();
  
  const { showBanner } = useBanner();

  const navigate = useNavigate();
  const {
    task: taskFromProps,
    taskId,
    role,
    currentUser,
    usePublicId = false,
    users = [],
  } = props;

  // --- Task State ---
  const [task, setTask] = useState(taskFromProps || null);
  // If no task is provided, fetch from Firestore
  useEffect(() => {
    if (!taskFromProps && taskId) {
      const db = getFirestore();
      const ref = doc(db, "tasks", taskId);
      getDoc(ref).then(snap => {
        if (snap.exists()) {
          setTask({ id: snap.id, ...snap.data() });
        }
      });
    }
  }, [taskFromProps, taskId]);
  const { publicId } = useParams();
  const auth = useAuth();

  // --- File Links State and Firestore Fetch ---
  const [fileLinks, setFileLinks] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false); // TODO: remove if not used

  // Fetch files from Firestore subcollection when taskId changes
  useEffect(() => {
    if (!taskId) {
      setFileLinks([]);
      return;
    }
    setFilesLoading(true);
    const db = getFirestore();
    const filesRef = collection(db, "tasks", taskId, "files");
    // Order by createdAt descending for most recent first (if field exists)
    const q = query(filesRef, orderBy("createdAt", "desc"));
    getDocs(q)
      .then(snapshot => {
        const files = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setFileLinks(files);
      })
      .catch(err => {
        setFileLinks([]);
        // Optionally log or show error
        console.error("Failed to fetch files for task", taskId, err);
      })
      .finally(() => setFilesLoading(false));
  }, [taskId]);

  // Use fileLinks from Firestore if present, else fallback to props or task
  const visibleFiles = Array.isArray(fileLinks) && fileLinks.length > 0
    ? fileLinks.filter(f => f.deleted !== true)
    : Array.isArray(props.fileLinks) && props.fileLinks.length > 0
      ? props.fileLinks.filter(f => f.deleted !== true)
      : Array.isArray(task?.fileLinks)
        ? task.fileLinks.filter(f => f.deleted !== true)
        : [];
  // This will show all files unless 'deleted' is explicitly true, making the logic robust to missing fields.

  // --- Error Banner State ---
  const [errorBanner, setErrorBanner] = useState(null);

  // --- Progress Bar Editing State ---
  const [isEditingProgress, setIsEditingProgress] = useState(false);

  // --- Complete Editing Modal File Links State ---
  const [completeFileLinks, setCompleteFileLinks] = useState([{ url: '', label: '' }]);
  const [pendingProgressState, setPendingProgressState] = useState(null);
  const [progressSuccess, setProgressSuccess] = useState(false);
  const canEditProgress = role === "manager";

  // --- Complete Shooting Modal State ---
  const [showCompleteShootingModal, setShowCompleteShootingModal] = useState(false);
  const [shootingNotes, setShootingNotes] = useState("");
  const [shootingFileLinks, setShootingFileLinks] = useState([{ url: '', label: '' }]);
  const [submittingShooting, setSubmittingShooting] = useState(false);

  // --- Scheduled Shoot Date State ---
  // State for shooting date range picker modal
// Format: { start: ISOString, end: ISOString } or null
const [scheduledShootDateEdit, setScheduledShootDateEdit] = useState(null);
const [showEditScheduledDate, setShowEditScheduledDate] = useState(false);

// Debug: log all changes to showEditScheduledDate
const setShowEditScheduledDateDebug = (val, source = 'unknown') => {
  setShowEditScheduledDate(val);
};
// Close shooting date modal when task changes
useEffect(() => {
  setShowEditScheduledDateDebug(false, 'task?.id useEffect');
}, [task?.id]);

// Defensive: Always close modal on unmount
useEffect(() => {
  return () => {
    setShowEditScheduledDate(false);
  };
}, []);
// Sync scheduledShootDateEdit with task.scheduledShootDate when modal opens
useEffect(() => {
  if (showEditScheduledDate) {
    // Only initialize from task when modal is opened
    if (task && task.scheduledShootDate && typeof task.scheduledShootDate === 'object') {
      setScheduledShootDateEdit({
        start: task.scheduledShootDate.start?.slice(0, 10) || "",
        end: task.scheduledShootDate.end?.slice(0, 10) || ""
      });
    } else {
      setScheduledShootDateEdit(null);
    }
    } else {
      setScheduledShootDateEdit(null);
    }
  }, [showEditScheduledDate, task]);
  const [savingScheduledDate, setSavingScheduledDate] = useState(false);
  // Removed scheduledDateSuccess state, replaced with global banner
  const [scheduledDateError, setScheduledDateError] = useState("");
  // --- Add Files Modal State ---
  const [showAddFilesModal, setShowAddFilesModal] = useState(false);
  // --- Add Files Loading State ---
  const [addingFiles, setAddingFiles] = useState(false);
  const [addFileLinks, setAddFileLinks] = useState([""]); // for modal input
  // (Removed duplicate declaration of fileLinks here to avoid redeclaration errors.)
  // --- Report Issue Modal State ---
  const [showReportIssueModal, setShowReportIssueModal] = useState(false);
  const [reportIssueSubmitting] = useState(false);
  const [handleReportIssueSubmit] = useState(false);
  const [reportIssueText, setReportIssueText] = useState("");
  // --- Expected Completion Date Edit State ---
  const [showEditExpectedDate, setShowEditExpectedDate] = useState(false);
  const [editExpectedDate, setEditExpectedDate] = useState("");
  useEffect(() => {
    if (showEditExpectedDate) {
      if (task && task.expectedCompletion) {
        // Convert to YYYY-MM-DD
        const d = new Date(task.expectedCompletion);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        setEditExpectedDate(`${yyyy}-${mm}-${dd}`);
      } else {
        setEditExpectedDate("");
      }
    }
  }, [showEditExpectedDate, task]);


  // Load property names once to resolve OR website URL and capture security code timestamp
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

  // Resolve OR URL and capture security codes for current task by matching property (case-insensitive)
  useEffect(() => {
    if (!propNames || !task) { setOrUrl(""); return; }
    const norm = (s) => (s || "").toString().trim().toLowerCase();
    const loose = (s) => norm(s).replace(/[^a-z0-9]/g, "");
    const keyName = norm(task.propertyName);
    const keyLoose = loose(task.propertyName);
    const keyUnit = norm(task.unitCode || task.unit || task.unit_code);
    // Some tasks use the unit code in propertyName; try that too
    const keyUnitFromName = norm(task.propertyName);
    const keyUnitLoose = loose(task.unitCode || task.unit || task.unit_code);
    const keyUnitFromNameLoose = loose(task.propertyName);
    let found = "";
    let matchedItem = null;
    for (const item of propNames) {
      const nm = norm(item && item.name);
      const nmLoose = loose(item && item.name);
      const uc = norm(item && item.unitCode);
      const ucLoose = loose(item && item.unitCode);
      if (
        (nm && (nm === keyName || nmLoose === keyLoose)) ||
        (uc && (uc === keyUnit || uc === keyUnitFromName)) ||
        (ucLoose && (ucLoose === keyUnitLoose || ucLoose === keyUnitFromNameLoose))
      ) {
        found = (item && item.orUrl) || "";
        matchedItem = item;
        if (found) break;
      }
    }
    // Fallback to task.orUrl if present directly on the task
    if (!found && task && task.orUrl) {
      found = String(task.orUrl).trim();
    }
    // Debug logging to help verify matching in dev
    try {
      // eslint-disable-next-line no-console
      console.debug('[DetailedTaskView] OR URL resolution', {
        taskPropertyName: task.propertyName,
        taskUnitCode: task.unitCode,
        resolved: found,
        namesCount: Array.isArray(propNames) ? propNames.length : 0
      });
    } catch (_) {}
    setOrUrl(found);
    setSecurityCodes(Array.isArray(matchedItem?.securityCodes) ? matchedItem.securityCodes : []);
    const fullAddress = matchedItem && (matchedItem.address || [matchedItem.addressStreet, matchedItem.addressCity, matchedItem.addressZip].filter(Boolean).join(', ')) || "";
    setPropertyAddress(fullAddress);
  }, [propNames, task?.propertyName, task?.unitCode]);
  const [savingExpectedDate, setSavingExpectedDate] = useState(false);
  const [expectedDateSuccess] = useState(false);
  const [expectedDateError, setExpectedDateError] = useState("");

  // State for Complete Editing modal
  const [completeNotes, setCompleteNotes] = useState("");
  const [submittingComplete, setSubmittingComplete] = useState(false);

  // Reset shooting arrays when opening/closing modal
  useEffect(() => {
    if (showCompleteShootingModal) {
      setShootingFileLinks([{ url: '', label: '' }]);
    }
  }, [showCompleteShootingModal]);

  // Reset file links when opening/closing modal
  useEffect(() => {
    if (showCompleteModal) {
      setCompleteFileLinks([{ url: '', label: '' }]);
    }
  }, [showCompleteModal]);

  // Handler to clear expected completion date in Firestore
  async function handleClearExpectedDate() {
    setSavingExpectedDate(true);
    setExpectedDateError("");
    try {
      const db = getFirestore();
      const taskRef = doc(db, "tasks", task.id);
      await updateDoc(taskRef, { expectedCompletion: null });
      await addTaskLog(task.id, {
        type: "expected_completion_update",
        user: {
          uid: auth.userData?.id || auth.userData?.uid || "unknown",
          displayName: auth.userData?.displayName || auth.userData?.email || auth.userData?.id || "Unknown User"
        },
        timestamp: new Date().toISOString(),
        description: `Expected completion date cleared`
      });
      setShowEditExpectedDate(false);
      showBanner("Expected completion date cleared!", "success");
    } catch (e) {
      setExpectedDateError("Failed to clear date: " + (e.message || e));
    }
    setSavingExpectedDate(false);
  }

// Handler to update expected completion date in Firestore
  async function handleSaveExpectedDate() {
    
    setSavingExpectedDate(true);
    setExpectedDateError("");
    try {
      const db = getFirestore();
      const taskRef = doc(db, "tasks", task.id);
      let newDateISO = null;
      let logDescription = "Expected completion date cleared";
      if (editExpectedDate) {
        // Defensive: check format YYYY-MM-DD
        const match = /^\d{4}-\d{2}-\d{2}$/.test(editExpectedDate);
        if (!match) {
          setExpectedDateError("Date format invalid: " + editExpectedDate);
          setSavingExpectedDate(false);
          return;
        }
        const [year, month, day] = editExpectedDate.split('-');
        if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) {
          setExpectedDateError("Date split invalid: " + [year, month, day].join(", "));
          setSavingExpectedDate(false);
          return;
        }
        const localDate = new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
        if (isNaN(localDate.getTime())) {
          setExpectedDateError("Invalid time value after Date construction");
          setSavingExpectedDate(false);
          return;
        }
        newDateISO = localDate.toISOString();
        logDescription = `Expected completion date updated to ${editExpectedDate}`;
      }
      await updateDoc(taskRef, { expectedCompletion: newDateISO });
      await addTaskLog(task.id, {
        type: "expected_completion_update",
        user: {
          uid: auth.userData?.id || auth.userData?.uid || "unknown",
          displayName: auth.userData?.displayName || auth.userData?.email || auth.userData?.id || "Unknown User"
        },
        timestamp: new Date().toISOString(),
        description: logDescription
      });
      setShowEditExpectedDate(false);
      showBanner("Expected completion date updated!", "success");
    } catch (e) {
      setExpectedDateError("Failed to update date: " + (e.message || e));
    }
    setSavingExpectedDate(false);
  }

  const [loading, setLoading] = useState(true);
  // Helper: is the task completed?
  const isTaskCompleted = task && typeof task.progressState === 'number' && task.progressState === 6;

  // --- Comment Input State (must be before tagging logic) ---
  const [commentInput, setCommentInput] = useState("");

  // --- Tagging Autocomplete State (must be inside component) ---
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [highlightedUserIdx, setHighlightedUserIdx] = useState(0);
  const [taggedUsers, setTaggedUsers] = useState(new Set());
  const commentInputRef = useRef();
  const [tagAutocompletePos, setTagAutocompletePos] = useState(null); // position of '@' for replacement

  // --- Helper: Find last @ and word after it before cursor ---
  const getTagQuery = (input, cursorPos) => {
    const upToCursor = input.slice(0, cursorPos);
    const match = /(^|\s)@(\w*)$/.exec(upToCursor);
    if (match) {
      return {
        query: match[2] || '',
        start: match.index + match[1].length,
        end: cursorPos
      };
    }
    return null;
  };

  // --- Autocomplete Trigger ---
  const handleTagAutocomplete = (input, cursorPos) => {
    const tag = getTagQuery(input, cursorPos);
    if (tag) {
      // Filter users by displayName or email
      const lower = tag.query.toLowerCase();
      const filtered = users.filter(u =>
        (u.displayName || u.name || '').toLowerCase().includes(lower) ||
        (u.email || '').toLowerCase().includes(lower)
      );
      setFilteredUsers(filtered);
      setShowUserDropdown(true);
      setHighlightedUserIdx(0);
      setTagAutocompletePos({ start: tag.start, end: tag.end });
    } else {
      setShowUserDropdown(false);
      setFilteredUsers([]);
      setTagAutocompletePos(null);
    }
  };

  // --- Multi-Editor & Photographer Assignment Modal State ---
  const [multiEditorAssignments, setMultiEditorAssignments] = useState([]);
  const [originalAssignments, setOriginalAssignments] = useState("");
  const [assignmentModalError, setAssignmentModalError] = useState("");
  const [showReassign, setShowReassign] = useState(false);
  // Photographer assignment state for modal
  const [photographer, setPhotographer] = useState("");
  const [originalPhotographer, setOriginalPhotographer] = useState("");

  // Defensive: Ensure modal always has at least one assignment
  useEffect(() => {
    if (showReassign && Array.isArray(multiEditorAssignments) && multiEditorAssignments.length === 0) {
      setMultiEditorAssignments([{ editorId: '', label: 'Exterior', customLabel: '' }]);
    }
  }, [showReassign, multiEditorAssignments]);

  // Open modal: prefill assignments and photographer
  function openMultiEditorModal() {
    // Treat blank, empty, or only-unassigned assignedEditors as unassigned
    const allUnassigned = !Array.isArray(task.assignedEditors) || task.assignedEditors.length === 0 ||
      task.assignedEditors.every(a => !a || !a.editorId);
    // Always use a stable, canonical object for unassigned
    const canonicalUnassigned = { editorId: '', label: 'Exterior', customLabel: '' };
    const initial = allUnassigned
      ? [canonicalUnassigned]
      : task.assignedEditors.map(a => ({
          editorId: a.editorId || '',
          label: (a.label && a.label.length > 0) ? a.label : 'Exterior',
          customLabel: a.customLabel || ''
        }));
    // Use a stable stringification for comparison
    const initialString = JSON.stringify(initial);
    setMultiEditorAssignments(initial);
    setOriginalAssignments(initialString);
    setAssignmentModalError("");
    // Prefill photographer state
    setPhotographer(task.assignedPhotographer || "");
    setOriginalPhotographer(task.assignedPhotographer || "");
    setTimeout(() => setShowReassign(true), 0);
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
    setMultiEditorAssignments(prev => prev.filter((_, i) => i !== idx));
  }

  function handleEditorChange(idx, editorId) {
    setMultiEditorAssignments(prev => prev.map((a, i) => i === idx ? { ...a, editorId } : a));
  }

  function handleLabelChange(idx, label) {
    setMultiEditorAssignments(prev => prev.map((a, i) => i === idx ? { ...a, label, customLabel: label === 'Custom' ? a.customLabel : '' } : a));
  }

  function handleCustomLabelChange(idx, customLabel) {
    setMultiEditorAssignments(prev => prev.map((a, i) => i === idx ? { ...a, customLabel } : a));
  }

  // Unified handler for both editors and photographer assignment
  async function handleMultiEditorAssign() {
    setAssignmentModalError("");
    try {
      // Validate editor assignments
      const assignedIds = multiEditorAssignments.map(a => a.editorId).filter(Boolean);
      const hasDuplicates = assignedIds.length !== new Set(assignedIds).size;
      if (hasDuplicates) {
        setAssignmentModalError("Duplicate editors are not allowed.");
        return;
      }
      for (const a of multiEditorAssignments) {
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
      const newAssignments = normalize(multiEditorAssignments);
      let prev = [];
      try {
        const parsed = JSON.parse(originalAssignments);
        prev = normalize(parsed);
      } catch (e) { prev = []; }
      const updateObj = {};
      if (JSON.stringify(newAssignments) !== JSON.stringify(prev)) {
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
      const taskRef = doc(db, "tasks", task.id);
      await updateDoc(taskRef, updateObj);

      // Compute delta for editors and photographer
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
        const u = users.find(u => (u.uid || u.id) === uid);
        return u ? (u.displayName || u.email || u.uid || u.id) : uid;
      };
      let deltaParts = [];
      if (addedEditors.length > 0) {
        deltaParts.push(`Added editor(s): ${addedEditors.map(getName).join(", ")}`);
      }
      if (removedEditors.length > 0) {
        deltaParts.push(`Removed editor(s): ${removedEditors.map(getName).join(", ")}`);
      }
      let photographerChangeDesc = "";
      if (photographer !== originalPhotographer) {
        const prevPhotog = getName(originalPhotographer);
        const newPhotog = getName(photographer);
        photographerChangeDesc = `Photographer changed: ${prevPhotog || 'Unassigned'} → ${newPhotog || 'Unassigned'}`;
      }
      // Join delta parts and photographer change with commas, remove empty parts
      const descParts = [...deltaParts];
      if (photographerChangeDesc) descParts.push(photographerChangeDesc);
      const summary = descParts.length > 0 ? descParts.join(", ") : "No changes.";
      await addTaskLog(task.id, {
        type: "assignment_update",
        user: {
          uid: auth.userData?.id || auth.userData?.uid || "unknown",
          displayName: auth.userData?.displayName || auth.userData?.email || auth.userData?.id || "Unknown User"
        },
        timestamp: new Date().toISOString(),
        description: `Task assignments updated: ${summary}`
      });
      // Update local UI state
      setTask(prev => prev ? { ...prev, assignedEditors: newAssignments, assignedPhotographer: photographer || null } : prev);
      // Success banner
      showBanner && showBanner("Assignments updated", "success");
      setShowReassign(false);
    } catch (e) {
      setAssignmentModalError("Failed to update assignments: " + (e.message || e));
    }
  }

  // --- Dropdown Selection ---
  const selectUserFromDropdown = idx => {
    if (!filteredUsers[idx] || !tagAutocompletePos) return;
    const user = filteredUsers[idx];
    // Insert mention at the @ position
    const before = commentInput.slice(0, tagAutocompletePos.start);
    const after = commentInput.slice(tagAutocompletePos.end);
    // Use the same markup as elsewhere: @[display](id)
    // Use only first name for mention display
    const displayName = (user.displayName || user.name || user.email || '').split(' ')[0];
    const mentionText = `@${displayName}`;
    const newInput = before + mentionText + ' ' + after;
    setCommentInput(newInput);
    setShowUserDropdown(false);
    setFilteredUsers([]);
    setTagAutocompletePos(null);
    // Keep a map of firstName to UID for backend tagging
    setTaggedUsers(prev => {
      const map = new Map(prev instanceof Map ? Array.from(prev.entries()) : []);
      map.set(displayName, user.id || user.uid || user.email);
      return map;
    });
    // Restore focus and move cursor after inserted mention
    setTimeout(() => {
      if (commentInputRef.current) {
        commentInputRef.current.focus();
        const pos = (before + mentionText + ' ').length;
        commentInputRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  // --- Keyboard Navigation ---
  const handleCommentInputKeyDown = e => {
    if (showUserDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedUserIdx(i => Math.min(i + 1, filteredUsers.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedUserIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        if (filteredUsers[highlightedUserIdx]) {
          e.preventDefault();
          selectUserFromDropdown(highlightedUserIdx);
        }
      } else if (e.key === 'Escape') {
        setShowUserDropdown(false);
      }
    } else if (e.key === 'Enter') {
      // Extract all unique @FirstName in the comment
      const firstNames = Array.from(new Set((commentInput.match(/@\w+/g) || []).map(s => s.slice(1))));
      // Map to UIDs using taggedUsers Map
      const taggedUserIds = firstNames.map(fn => taggedUsers instanceof Map ? taggedUsers.get(fn) : undefined).filter(Boolean);
      handleAddComment(commentInput, taggedUserIds);
    }
  };

  // --- On submit: extract all @FirstName from commentInput and map to UIDs ---
  // (If user edits input, we re-extract tagged user IDs)
  // taggedUsers is now a Map: firstName -> UID
  // On submit, get all unique @FirstName and map to UID


  

  // Real-time Firestore subscription for task by publicId or taskId
  useEffect(() => {
    const db = getFirestore();
    let unsubscribe;
    setLoading(true);
    if (usePublicId && publicId) {
      // Query for task with this publicId
      const tasksRef = collection(db, "tasks");
      const q = query(tasksRef, where("publicId", "==", Number(publicId)));
      unsubscribe = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          const incoming = { id: docSnap.id, ...docSnap.data() };
          // Enforce access for photographers
          if (role === 'photographer') {
            const uid = auth.userData?.id || auth.userData?.uid;
            const allowed =
              incoming.assignedPhotographer === uid &&
              (incoming.stage === 'Scheduling' || incoming.stage === 'Shooting');
            if (!allowed) {
              setAccessDenied(true);
              setTask(null);
              setLoading(false);
              return;
            }
          }
          setAccessDenied(false);
          setTask(incoming);
        } else {
          setTask(null);
        }
        setLoading(false);
      });
    } else if (taskId) {
      const taskRef = doc(db, "tasks", taskId);
      unsubscribe = onSnapshot(taskRef, (snap) => {
        if (!snap.exists()) {
          setTask(null);
          setLoading(false);
          return;
        }
        const incoming = { id: snap.id, ...snap.data() };
        if (role === 'photographer') {
          const uid = auth.userData?.id || auth.userData?.uid;
          const allowed =
            incoming.assignedPhotographer === uid &&
            (incoming.stage === 'Scheduling' || incoming.stage === 'Shooting');
          if (!allowed) {
            setAccessDenied(true);
            setTask(null);
            setLoading(false);
            return;
          }
        }
        setAccessDenied(false);
        setTask(incoming);
        setLoading(false);
      });
    } else {
      setTask(null);
      setLoading(false);
    }
    return () => unsubscribe && unsubscribe();
  }, [usePublicId, publicId, taskId]);
  // DEBUG LOGGING
  
  

  // --- New state for tabs and comments ---
  const [activeTab, setActiveTab] = useState('files');
  const [comments, setComments] = useState([]);
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  // Fetch comments from Firestore subcollection in real-time
  useEffect(() => {
    if (!task || !task.id) return;
    const db = getFirestore();
    const commentsRef = collection(db, "tasks", task.id, "comments");
    // Order by createdAt ascending (oldest first)
    const q = query(commentsRef, orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Normalize createdAt across legacy Firestore Timestamp and ISO string
      const getMillis = (c) => {
        const v = c && c.createdAt;
        if (!v) {
          // Fallback to legacy 'timestamp' field if present
          const t = c && c.timestamp;
          if (typeof t === 'string' && !isNaN(Date.parse(t))) return Date.parse(t);
          return 0;
        }
        if (typeof v === 'object' && v.seconds) return v.seconds * 1000;
        if (typeof v === 'string' && !isNaN(Date.parse(v))) return Date.parse(v);
        return 0;
      };
      const sorted = fetched.slice().sort((a, b) => getMillis(a) - getMillis(b));
      setComments(sorted);
    });
    return () => unsubscribe();
  }, [task]);

  useEffect(() => {
    if (!task || !task.id) return;
    const db = getFirestore();
    const filesRef = collection(db, "tasks", task.id, "files");
    const unsubscribe = onSnapshot(filesRef, (snapshot) => {
      setFileLinks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [task]);

  const [priorityRequest, setPriorityRequest] = useState(false);
  const [priorityUpdateSuccess, setPriorityUpdateSuccess] = useState(false);
  const [userNames, setUserNames] = useState({});
  const [assignedEditorName, setAssignedEditorName] = useState(""); /* eslint-disable-line no-unused-vars */
  const [assignedPhotographerName, setAssignedPhotographerName] = useState("");
  const [setShowEditPhotographer] = useState(false); /* eslint-disable-line no-unused-vars */
  const [selectedPhotographer] = useState(""); /* eslint-disable-line no-unused-vars */
  const [setPhotographerUpdateError] = useState(""); /* eslint-disable-line no-unused-vars */
  const [setPhotographerUpdateSuccess] = useState(false); /* eslint-disable-line no-unused-vars */
  const [creatorName, setCreatorName] = useState("");

  // Sync state from loaded task (remove comments sync)
  useEffect(() => {
  if (task) {
    setPriorityRequest(!!task.priorityRequest);
console.log('Loaded task.priorityRequest:', task.priorityRequest);
    // Sync scheduled shoot date (range or legacy)
    if (task.scheduledShootDate && typeof task.scheduledShootDate === 'object' && task.scheduledShootDate.start && task.scheduledShootDate.end) {
      setScheduledShootDateEdit({
        start: new Date(task.scheduledShootDate.start).toISOString(),
        end: new Date(task.scheduledShootDate.end).toISOString(),
      });
    } else if (typeof task.scheduledShootDate === 'string' && !isNaN(Date.parse(task.scheduledShootDate))) {
      // Legacy: treat as single day range
      const iso = new Date(task.scheduledShootDate).toISOString();
      setScheduledShootDateEdit({ start: iso, end: iso });
    } else {
      setScheduledShootDateEdit(null);
    }
  }
}, [task]);

  useEffect(() => {
    if (!task) return;
    const db = getFirestore();
    const uids = new Set();
    if (Array.isArray(comments)) {
      comments.forEach(c => c.user && typeof c.user === 'string' && uids.add(c.user));
    }
    if (Array.isArray(task.log)) {
      task.log.forEach(l => l.user && typeof l.user === 'string' && uids.add(l.user));
    }
    // Remove already fetched
    const toFetch = Array.from(uids).filter(uid => !userNames[uid]);
    if (toFetch.length === 0) return;
    let ignore = false;
    Promise.all(toFetch.map(async uid => {
      try {
        const userRef = doc(db, "users", uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const data = snap.data();
          // Prefer first name, then displayName, then email, then UID
          let name = data.firstName || (data.displayName ? data.displayName.split(' ')[0] : null) || data.email || uid;
          return [uid, name];
        }
      } catch (e) {}
      return [uid, uid];
    })).then(results => {
      if (!ignore) {
        setUserNames(prev => ({ ...prev, ...Object.fromEntries(results) }));
      }
    });
    return () => { ignore = true; };
    /* eslint-disable react-hooks/exhaustive-deps */
  }, [comments, task]);

  // Fetch editor, photographer, and creator display names
  useEffect(() => {
    if (!task) return;
    let ignore = false;
    async function fetchEditorName() {
      if (!task.assignedEditor) {
        setAssignedEditorName("");
      } else {
        try {
          const db = getFirestore();
          const userRef = doc(db, "users", task.assignedEditor);
          const userSnap = await getDoc(userRef);
          if (!ignore) {
            if (userSnap.exists()) {
              setAssignedEditorName(userSnap.data().displayName || userSnap.data().email || task.assignedEditor);
            } else {
              setAssignedEditorName(task.assignedEditor);
            }
          }
        } catch (e) {
          if (!ignore) setAssignedEditorName(task.assignedEditor);
        }
      }
      // Fetch photographer name
      if (!task.assignedPhotographer) {
        setAssignedPhotographerName("");
      } else {
        try {
          const db = getFirestore();
          const userRef = doc(db, "users", task.assignedPhotographer);
          const userSnap = await getDoc(userRef);
          if (!ignore) {
            if (userSnap.exists()) {
              setAssignedPhotographerName(userSnap.data().displayName || userSnap.data().email || task.assignedPhotographer);
            } else {
              setAssignedPhotographerName(task.assignedPhotographer);
            }
          }
        } catch (e) {
          if (!ignore) setAssignedPhotographerName(task.assignedPhotographer);
        }
      }
      // Fetch creator name
      let creatorUid = null;
      if (task.log && Array.isArray(task.log)) {
        const createdLog = task.log.find(l => l.type === "created" && l.user);
        if (createdLog) creatorUid = createdLog.user;
      }
      if (!creatorUid) {
        setCreatorName("");
        return;
      }
      try {
        const db = getFirestore();
        const userRef = doc(db, "users", creatorUid);
        const userSnap = await getDoc(userRef);
        if (!ignore) {
          if (userSnap.exists()) {
            setCreatorName(getUserDisplayName(creatorUid, users));
          } else {
            setCreatorName(getUserDisplayName(creatorUid, users));
          }
        }
      } catch (e) {
        if (!ignore) setCreatorName(getUserDisplayName(creatorUid, users));
      }
    }
    fetchEditorName();
    return () => { ignore = true; };
  }, [task, users]);

  useEffect(() => {
    if (!task) return;
    let ignore = false;
    async function fetchUserNames() {
      try {
        const db = getFirestore();
        const promises = users.map(u => {
          const uid = u.uid || u.id;
          return getDoc(doc(db, "users", uid)).then(snap => {
            const data = snap.data();
            // Prefer first name, then displayName, then email, then UID
            let name = data.firstName || (data.displayName ? data.displayName.split(' ')[0] : null) || data.email || uid;
            return [uid, name];
          });
        });
        const results = await Promise.all(promises);
        if (!ignore) {
          setUserNames(prev => ({ ...prev, ...Object.fromEntries(results) }));
        }
      } catch (e) {}
      return () => { ignore = true; };
    }
    fetchUserNames();
    return () => { ignore = true; };
  }, [users, task]);

  // Fetch issues from Firestore issues subcollection
  const [issues, setIssues] = useState([]);
  useEffect(() => {
    if (!task || !task.id) return;
    const db = getFirestore();
    const issuesRef = collection(db, "tasks", task.id, "issues");
    const q = query(issuesRef, orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setIssues(fetched);
    });
    return () => unsubscribe();
  }, [task]);

  // Merge Firestore comments with issue comments from issues subcollection and task.log
  useEffect(() => {
    if (!task) return;
    // Get issue comments from task.log for type+timestamp
    let issueLogComments = [];
    if (Array.isArray(task.log)) {
      issueLogComments = task.log.filter(entry => entry.type === 'issue_reported' || entry.type === 'issue_resolved')
        .map(entry => ({
          ...entry,
          id: entry.id || entry.timestamp || Math.random().toString(36).slice(2),
          createdAt: entry.timestamp || entry.createdAt,
          user: entry.user || '',
          type: entry.type,
        }));
    }
    // Attach description/resolveNotes from issues collection to log entries using fuzzy timestamp match
    const mergedIssueComments = issueLogComments.map(entry => {
      let matchedDescription = '';
      if (issues.length && entry.createdAt) {
        const entryTime = new Date(entry.createdAt).getTime();
        for (const issue of issues) {
          // For 'issue_reported', match to issue.createdAt; for 'issue_resolved', match to issue.resolvedAt
          let issueTime = null;
          if (entry.type === 'issue_reported' && issue.createdAt) {
            issueTime = new Date(issue.createdAt).getTime();
            if (Math.abs(issueTime - entryTime) <= 10000) {
              matchedDescription = issue.description;
              break;
            }
          } else if (entry.type === 'issue_resolved' && issue.resolvedAt) {
            issueTime = new Date(issue.resolvedAt).getTime();
            if (Math.abs(issueTime - entryTime) <= 10000) {
              matchedDescription = issue.resolveNotes || '[No description]';
              break;
            }
          }
        }
      }
      return {
        ...entry,
        description: matchedDescription || entry.description || '',
      };
    });
    // Merge, avoiding duplicates (by timestamp+user+type)
    const unique = {};
    [...comments, ...mergedIssueComments].forEach(c => {
      const key = `${c.createdAt || ''}_${c.user || ''}_${c.type || ''}`;
      if (!unique[key]) unique[key] = c;
    });
    // Sort by createdAt/timestamp ascending
    const merged = Object.values(unique).sort((a, b) => {
      const aTime = a.createdAt || a.timestamp;
      const bTime = b.createdAt || b.timestamp;
      return new Date(aTime) - new Date(bTime);
    });
    setMergedComments(merged);
  }, [task, comments, issues]);

  // Add a new state for merged comments
  const [mergedComments, setMergedComments] = useState([]);

  // Helper for scheduled date success
  function handleScheduledDateSuccess(message) {
    setShowEditScheduledDate(false);
    showBanner(message, "success");
  }

// Handler to update scheduled shoot date RANGE in Firestore (and stage + calendar)
  async function handleSaveScheduledDateRange(calendarOpts) {
    if (!scheduledShootDateEdit || !scheduledShootDateEdit.start || !scheduledShootDateEdit.end) return;
    setSavingScheduledDate(true);
    setScheduledDateError("");
    try {
      const db = getFirestore();
      const taskRef = doc(db, "tasks", task.id);
      // Store as {start, end} ISO strings at noon local time to avoid timezone drift
      function toLocalNoonISOString(dateStr) {
        // dateStr is YYYY-MM-DD
        const [y, m, d] = dateStr.split('-');
        // Set time to noon local to avoid UTC shift
        const date = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0, 0);
        return date.toISOString();
      }
      const range = {
        start: toLocalNoonISOString(scheduledShootDateEdit.start),
        end: toLocalNoonISOString(scheduledShootDateEdit.end),
      };
      const now = new Date().toISOString();
      const scheduledByUid = auth.userData?.id || auth.userData?.uid || "unknown";
      await updateDoc(taskRef, { scheduledShootDate: range, stage: 'Shooting', lastProgressUpdate: now, scheduledByUid });
      // Optimistically update local state
      setTask(prev => prev ? { ...prev, scheduledShootDate: range, stage: 'Shooting', lastProgressUpdate: now, scheduledByUid } : prev);
      await addTaskLog(task.id, {
        type: "scheduled_shoot_date_update",
        user: {
          uid: auth.userData?.id || auth.userData?.uid || "unknown",
          displayName: auth.userData?.displayName || auth.userData?.email || auth.userData?.id || "Unknown User"
        },
        timestamp: new Date().toISOString(),
        description: `Scheduled shoot date updated to ${range.start} – ${range.end}`
      });
      // Log progress update to Shooting
      try {
        await addTaskLog(task.id, {
          type: "progress_update",
          user: {
            uid: auth.userData?.id || auth.userData?.uid || "unknown",
            displayName: auth.userData?.displayName || auth.userData?.email || auth.userData?.id || "Unknown User"
          },
          timestamp: now,
          description: `Progress updated to Shooting`
        });
      } catch (e) {}
      handleScheduledDateSuccess("Shooting date updated!");
      // Open Google Calendar invite if requested
      if (calendarOpts && calendarOpts.enabled) {
        const recipients = Array.isArray(calendarOpts.recipients) ? calendarOpts.recipients.filter(Boolean) : [];
        const virtualTask = { ...task, scheduledShootDate: range };
        const url = buildGoogleCalendarURL(virtualTask, Array.isArray(users) ? users : [], recipients);
        if (url) {
          try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (e) {}
        }
      }
    } catch (e) {
      setScheduledDateError("Failed to update date: " + (e.message || e));
    } finally {
      setSavingScheduledDate(false);
    }
  }

  // Handler to clear scheduled shoot date RANGE in Firestore
  async function handleClearScheduledDate() {
    setSavingScheduledDate(true);
    setScheduledDateError("");
    try {
      const db = getFirestore();
      const taskRef = doc(db, "tasks", task.id);
      const now = new Date().toISOString();
      await updateDoc(taskRef, { scheduledShootDate: null, stage: 'Scheduling', lastProgressUpdate: now });
      // Optimistically update local task state for immediate UI feedback
      setTask(prev => prev ? { ...prev, scheduledShootDate: null, stage: 'Scheduling', lastProgressUpdate: now } : prev);
      await addTaskLog(task.id, {
        type: "scheduled_shoot_date_update",
        user: {
          uid: auth.userData?.id || auth.userData?.uid || "unknown",
          displayName: auth.userData?.displayName || auth.userData?.email || auth.userData?.id || "Unknown User"
        },
        timestamp: now,
        description: `Scheduled shoot date cleared`
      });
      // Log progress stage change to Scheduling
      try {
        await addTaskLog(task.id, {
          type: "progress_update",
          user: {
            uid: auth.userData?.id || auth.userData?.uid || "unknown",
            displayName: auth.userData?.displayName || auth.userData?.email || auth.userData?.id || "Unknown User"
          },
          timestamp: now,
          description: `Progress updated to Scheduling`
        });
      } catch (e) {}
      handleScheduledDateSuccess("Shooting date cleared!");
    } catch (e) {
      setScheduledDateError("Failed to clear date: " + (e.message || e));
    } finally {
      setSavingScheduledDate(false);
    }
  }

    // Handler to complete the task (confirmation modal logic)
    const handleCompleteTask = async (notes) => {
      if (submittingComplete) return;
      setSubmittingComplete(true);
    try {
      const db = getFirestore();
      const user = currentUser || (auth && auth.user);
      const displayName = user?.displayName || user?.email || user?.uid || "Unknown User";
      const uid = user?.uid || "unknown";
      const now = new Date().toISOString();
      // Update task status
      const taskRef = doc(db, "tasks", task.id);
      await updateDoc(taskRef, {
        stage: 'Completed',
        completedDate: now,
        completedBy: uid,
        completedByDisplayName: displayName,
        completionNotes: notes,
        lastProgressUpdate: now,
      });
      // Add to log
      let log = Array.isArray(task.log) ? [...task.log] : [];
      log.push({
        type: 'completed',
        user: { uid, displayName },
        timestamp: now,
        description: `${displayName} marked task as completed.${notes ? ` Notes: ${notes}` : ''}`
      });
      await updateDoc(taskRef, { log });
      // Add attached file links (if any)
      const validLinks = completeFileLinks.filter(f => f.url && f.url.trim());
      if (validLinks.length > 0) {
        await Promise.all(validLinks.map(async file => {
          await addDoc(collection(db, "tasks", task.id, "files"), {
            url: file.url.trim(),
            label: file.label ? file.label.trim() : '',
            addedBy: uid,
            addedByDisplayName: displayName,
            createdAt: now,
          });
          // Add to log
          let log = Array.isArray(task.log) ? [...task.log] : [];
          log.push({
            type: 'file_added',
            user: { uid, displayName },
            timestamp: now,
            description: `${displayName} added a file (on completion)`
          });
          await updateDoc(taskRef, { log });
        }));
      }
      setShowCompleteTaskModal(false);
      setCompleteNotes("");
      setCompleteFileLinks([{ url: '', label: '' }]);
      // Optionally trigger parent refresh or notification here
    } catch (e) {
      setErrorBanner("Failed to complete task: " + (e.message || e));
      setTimeout(() => setErrorBanner(null), 2000);
    }
    setSubmittingComplete(false);
  };



  // Helper functions
  const tabBtn = (active) => ({
    background: active ? 'var(--button-bg-hover)' : 'var(--button-bg)',
    border: 'none',
    borderBottom: active ? '2.5px solid #3b82f6' : '2.5px solid transparent',
    color: active ? 'var(--button-text-hover)' : 'var(--button-text)',
    fontWeight: 600,
    fontSize: 15,
    padding: '10px 24px',
    borderRadius: '12px 12px 0 0',
    cursor: 'pointer',
    outline: 'none',
    transition: 'background 0.15s, color 0.15s, border 0.15s'
  });

  const canTogglePriority = role === "manager" || role === "photographer";
  async function handlePriorityToggle() {
    if (!canTogglePriority) return;
    const newValue = !priorityRequest;
    setPriorityRequest(newValue);
    console.log('Toggling priorityRequest to:', newValue);
    try {
      const db = getFirestore();
      const taskRef = doc(db, "tasks", task.id);
      await updateDoc(taskRef, { priorityRequest: newValue });
      await addTaskLog(task.id, {
        type: "priority_request_change",
        user: {
          uid: auth.userData?.id || auth.userData?.uid || "unknown",
          displayName: auth.userData?.displayName || auth.userData?.email || auth.userData?.id || "Unknown User"
        },
        timestamp: new Date().toISOString(),
        description: `Priority request set to ${newValue ? "True" : "False"}`
      });
      setPriorityUpdateSuccess(true);
      setTimeout(() => setPriorityUpdateSuccess(false), 2000);
    } catch (e) {
      setErrorBanner("Failed to update priority request: " + (e.message || e));
      setTimeout(() => setErrorBanner(null), 2000);
      setPriorityRequest(!newValue); // revert on error
    }
  }

  async function handleAddComment(commentText, taggedUserIds = []) {
    if (!commentText.trim()) return;
    setCommentSubmitting(true);
    try {
      const db = getFirestore();
      const commentsRef = collection(db, "tasks", task.id, "comments");
      const now = new Date().toISOString();
      await addDoc(commentsRef, {
        user: {
          uid: auth.userData?.id || auth.userData?.uid || "unknown",
          displayName: auth.userData?.displayName || auth.userData?.email || auth.userData?.id || "Unknown User"
        },
        text: commentText.trim(),
        taggedUsers: Array.isArray(taggedUserIds) ? taggedUserIds : [],
        createdAt: now,
        timestamp: now, // keep for legacy/compatibility
      });
      setCommentInput("");
    } catch (e) {
      setErrorBanner("Failed to post comment: " + (e.message || e));
      setTimeout(() => setErrorBanner(null), 2000);
    }
    setCommentSubmitting(false);
  }

  // Handler for completing editing (moves to Publishing; optionally attaches file links)
  async function handleCompleteEditing() {
    if (!task) return;
    setSubmittingComplete(true);
    try {
      const db = getFirestore();
      const taskRef = doc(db, "tasks", task.id);
      const now = new Date().toISOString();
      const userMeta = {
        uid: auth.userData?.id || auth.userData?.uid || "unknown",
        displayName: auth.userData?.displayName || auth.userData?.email || auth.userData?.id || "Unknown User"
      };
      // Update task: remove assignedEditor, set stage, add pendingApproval
      await updateDoc(taskRef, {
        assignedEditor: "",
        stage: 'Publishing',
        pendingApproval: true
      });
      // If the editor added any file links, save them to subcollection
      const filesToAdd = Array.isArray(completeFileLinks)
        ? completeFileLinks.filter(f => f && typeof f.url === 'string' && f.url.trim().length > 0)
        : [];
      if (filesToAdd.length > 0) {
        const filesRef = collection(db, 'tasks', task.id, 'files');
        for (const f of filesToAdd) {
          try {
            await addDoc(filesRef, {
              url: f.url.trim(),
              label: (f.label || '').trim(),
              createdAt: now,
              createdBy: userMeta.uid,
            });
          } catch (err) {
            // continue on individual add errors
          }
        }
        // Add a single log entry summarizing attachment action
        try {
          await addTaskLog(task.id, {
            type: 'file_links_added',
            user: { uid: userMeta.uid, displayName: userMeta.displayName },
            timestamp: now,
            description: `Editor attached ${filesToAdd.length} file link(s) when submitting for review`
          });
        } catch (_) {}
      }
      // Add task log entry
      await addTaskLog(task.id, {
        type: "editing_completed",
        user: {
          uid: auth.userData?.id || auth.userData?.uid || "unknown",
          displayName: auth.userData?.displayName || auth.userData?.email || auth.userData?.id || "Unknown User"
        },
        timestamp: now,
        description: "Edits submitted for review",
        notes: completeNotes || ""
      });
      // Persist notes as a comment for notifications/history
      if (completeNotes && completeNotes.trim().length > 0) {
        try {
          const commentsRef = collection(db, "tasks", task.id, "comments");
          await addDoc(commentsRef, {
            user: {
              uid: userMeta.uid,
              displayName: userMeta.displayName,
            },
            text: `Editing Completion Notes: ${completeNotes.trim()}`,
            taggedUsers: [],
            createdAt: now,
            timestamp: now,
          });
        } catch (_) {}
      }
      setShowCompleteModal(false);
      setCompleteNotes("");
      setCompleteFileLinks([{ url: '', label: '' }]);
      // Force a full page refresh to ensure all lists and views reflect changes
      try { window.location.reload(); } catch (_) {}
    } catch (e) {
      setErrorBanner("Failed to submit completion: " + (e.message || e));
      setTimeout(() => setErrorBanner(null), 2000);
    }
    setSubmittingComplete(false);
  }

  // Permissions
  const canAddFiles = ["manager", "photographer", "editor"].includes(role);
  const canCloseTask = ["manager", "photographer"].includes(role);
  const canReassign = role === "manager"; // Only managers can reassign and archive
  const canReportIssue = role === "editor";
  const canView = ["manager", "photographer", "editor"].includes(role);

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-main)' }}>Loading task...</div>;
  }
  if (!task) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-main)' }}>Task not found.</div>;
  }

  if (!canView) {
    return <div style={{ padding: 32, color: "#888" }}>You do not have permission to view this task.</div>;
  }

  return (
    <>
      
      <FloatingBanner
        visible={progressSuccess}
        process="Progress update"
        type="success"
        onClose={() => setProgressSuccess(false)}
      />
      <FloatingBanner
        visible={priorityUpdateSuccess}
        process="Priority update"
        type="success"
        onClose={() => setPriorityUpdateSuccess(false)}
      />

      <div style={getContainerStyle(props.noMargin)}>
      <div style={{ ...headerStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: '1 1 0%', justifyContent: 'space-between' }}>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 700,
              margin: "10px 0",
              maxWidth: "auto",
              minWidth: 0,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
              whiteSpace: 'normal',
              flex: '1 1 0%',
              lineHeight: 1.18,
              display: 'block',
            }}
          >
            {task.propertyName}
            <span style={{
              display: 'inline-block',
              background: getMediaTypeColor(task.mediaType),
              color: '#fff',
              borderRadius: 12,
              padding: '3px 12px',
              fontSize: 13,
              fontWeight: 600,
              marginRight: 8,
              verticalAlign: 'middle',
              minWidth: 0,
              maxWidth: 120,
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              marginLeft: "16px"
            }}>{getMediaTypeLabel(task.mediaType)}</span>
          </h2>
          <div style={{ marginLeft: 24, display: 'flex', alignItems: 'center', minWidth: 180, flexShrink: 0 }}>
            <StageProgressBar
              stage={isEditingProgress && pendingProgressState !== null ? pendingProgressState : getCurrentStage(task)}
              mediaType={task.mediaType}
              editable={isEditingProgress && canEditProgress}
              onStageChange={(newStage) => {
                if (!isEditingProgress || !canEditProgress) return;
                const { NAMES: stageNames } = getStagesForMediaType(task?.mediaType);
                if (!stageNames.includes(newStage)) return;
                setPendingProgressState(newStage);
              }}
            />
            {canEditProgress && (
              <>
                {/* Progress Bar Edit Button */}
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
                      setPendingProgressState(getCurrentStage(task));
                      setIsEditingProgress(true);
                    } else {
                      if (pendingProgressState === 'Completed' && pendingProgressState !== getCurrentStage(task)) {
                        setShowCompleteTaskModal(true);
                        return;
                      }
                      setIsEditingProgress(false);
                      if (pendingProgressState !== null && pendingProgressState !== getCurrentStage(task)) {
                        try {
                          const db = getFirestore();
                          const taskRef = doc(db, "tasks", task.id);
                          await updateDoc(taskRef, {
                            stage: pendingProgressState,
                            lastProgressUpdate: new Date().toISOString(),
                          });
                          await addTaskLog(task.id, {
                            type: "progress_update",
                            user: {
                              uid: auth.userData?.id || auth.userData?.uid || "unknown",
                              displayName: auth.userData?.displayName || auth.userData?.email || auth.userData?.id || "Unknown User"
                            },
                            timestamp: new Date().toISOString(),
                            description: `Progress updated to ${pendingProgressState}`
                          });
                          setProgressSuccess(true);
                          setTimeout(() => setProgressSuccess(false), 1500);
                        } catch (e) {
                          setErrorBanner("Failed to update progress: " + (e.message || e));
                          setTimeout(() => setErrorBanner(null), 2000);
                        }
                      }
                      setPendingProgressState(null);
                    }
                  }}
                >
                  {isEditingProgress ? <FiUnlock /> : <FiLock />}
                </button>
                <ArchiveConfirmModal
                  open={showArchiveModal}
                  onConfirm={handleArchiveTask}
                  onCancel={() => setShowArchiveModal(false)}
                  submitting={archiving}
                />
              </>
            )}

      {/* Complete Task Modal (triggered when progress is set to Completed) */}
      <CompleteTaskModal
        open={showCompleteTaskModal}
        onClose={() => setShowCompleteTaskModal(false)}
        onConfirm={handleCompleteTask}
        submitting={submittingComplete}
      />

          {/* Complete Shooting Modal */}
          {showCompleteShootingModal && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
                zIndex: 2000,
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
              }}
              onClick={() => setShowCompleteShootingModal(false)}
            >
              <div
                style={{
                  background: 'var(--bg-card)',
                  color: 'var(--text-main)',
                  borderRadius: 12,
                  padding: '20px 20px 16px',
                  width: '100%',
                  maxWidth: 520,
                  boxShadow: '0 10px 30px rgba(0,0,0,0.18)'
                }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 6, color: 'var(--text-main)' }}>Complete Shooting</div>
                <div style={{ fontSize: 13.5, color: '#6b7280', marginBottom: 12 }}>
                  Add an optional message and file links to include with this completion.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Message (optional)</div>
                    <textarea
                      value={shootingNotes}
                      onChange={e => setShootingNotes(e.target.value)}
                      rows={4}
                      placeholder="Anything the team should know?"
                      style={{ width: '95%', resize: 'vertical', padding: 10, borderRadius: 8, border: '1.5px solid var(--button-border)', background: 'var(--bg-input)', color: 'var(--text-main)' }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Attach file links (optional)</div>
                    {shootingFileLinks.map((f, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <input
                          type="url"
                          value={f.url}
                          onChange={e => setShootingFileLinks(prev => prev.map((x, i) => i === idx ? { ...x, url: e.target.value } : x))}
                          placeholder="https://..."
                          style={{ flex: 2, padding: 8, borderRadius: 8, border: '1.5px solid var(--button-border)', background: 'var(--bg-input)', color: 'var(--text-main)' }}
                        />
                        <input
                          type="text"
                          value={f.label}
                          onChange={e => setShootingFileLinks(prev => prev.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))}
                          placeholder="Label (optional)"
                          style={{ flex: 1, padding: 8, borderRadius: 8, border: '1.5px solid var(--button-border)', background: 'var(--bg-input)', color: 'var(--text-main)' }}
                        />
                        <button
                          onClick={() => setShootingFileLinks(prev => prev.filter((_, i) => i !== idx))}
                          style={{ background: 'var(--button-bg)', border: '1.5px solid var(--button-border)', color: 'var(--button-text)', borderRadius: 8, padding: '8px 10px', fontWeight: 600 }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setShootingFileLinks(prev => [...prev, { url: '', label: '' }])}
                      style={{ background: 'var(--button-bg)', border: '1.5px solid var(--button-border)', color: 'var(--button-text)', borderRadius: 8, padding: '8px 10px', fontWeight: 600 }}
                    >
                      + Add Link
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                  <button
                    disabled={submittingShooting}
                    style={{
                      background: 'var(--button-bg)',
                      border: '1.5px solid var(--button-border)',
                      color: 'var(--button-text)',
                      borderRadius: 8,
                      padding: '8px 14px',
                      fontWeight: 700,
                      fontSize: 15,
                      cursor: 'pointer',
                    }}
                    onClick={() => setShowCompleteShootingModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    disabled={submittingShooting}
                    onClick={handleCompleteShooting}
                    style={{
                      background: submittingShooting ? '#86efac' : '#22c55e',
                      border: '1.5px solid #16a34a',
                      color: '#fff',
                      borderRadius: 8,
                      padding: '8px 14px',
                      fontWeight: 800,
                      fontSize: 15,
                      cursor: submittingShooting ? 'default' : 'pointer',
                      boxShadow: '0 2px 10px rgba(34,197,94,0.20)'
                    }}
                  >
                    {submittingShooting ? 'Submitting...' : 'Submit Completion'}
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "10px 0" }}>
            {/* Error Floating Banner */}
            {errorBanner && (
              <FloatingBanner
                type="error"
                message={errorBanner}
                style={{ top: 24, zIndex: 99999 }}
              />
            )}
            {/* Live website (OR URL) button: visible to all users */}
            {(() => {
              const resolvedUrl = orUrl || (task && task.liveWebsiteUrl) || "";
              const hasUrl = !!resolvedUrl;
              return (
                <button
                  style={{
                    ...iconBtn,
                    opacity: hasUrl ? 1 : 0.5,
                    cursor: hasUrl ? 'pointer' : 'not-allowed'
                  }}
                  title={hasUrl ? "View live website" : "No website URL available"}
                  disabled={!hasUrl}
                  onClick={() => {
                    if (!hasUrl) return;
                    const safeUrl = /^https?:\/\//i.test(resolvedUrl)
                      ? resolvedUrl
                      : `https://${resolvedUrl.replace(/^\/+/, '')}`;
                    try { window.open(safeUrl, '_blank', 'noopener,noreferrer'); } catch (e) {}
                  }}
                >
                  <FiLink size={22} />
                </button>
              );
            })()}
            {/* Security Codes View Button: visible to all users while in Scheduling/Shooting */}
            {(getCurrentStage(task) === "Scheduling" || getCurrentStage(task) === "Shooting") && (
              <button
                style={iconBtn}
                title="View security codes"
                onClick={() => setShowSecurityCodes(true)}
              >
                <FiInfo size={22} />
              </button>
            )}
            {/* Complete Shooting (Photographer only when in Shooting stage) */}
            {role === 'photographer' && getCurrentStage(task) === 'Shooting' && (
              <button
                style={{
                  background: '#10b981',
                  border: '1.5px solid #059669',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '8px 14px',
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(16,185,129,0.15)'
                }}
                onClick={() => setShowCompleteShootingModal(true)}
                title="Complete Shooting"
              >
                Complete Shooting
              </button>
            )}
            
            {/* Manager-only actions */}
            {canReassign && (
            <>
              {/* Archive Button (iconBtn style, left of Reassign) */}
              <button
                style={{
                  ...iconBtn,
                  color: task.archived ? '#b82e2e' : 'var(--button-text)',
                }}
                title={task.archived ? "Task is archived" : "Archive task"}
                aria-label="Archive task"
                disabled={task.archived}
                onClick={() => setShowArchiveModal(true)}
              >
                <FiArchive size={22} />
              </button>
              <button style={iconBtn} title="Reassign Task" onClick={openMultiEditorModal}>
                <FiUserPlus size={22} />
              </button>
              {showReassign && (
                <ReassignModal
                   open={showReassign}
                   onClose={() => setShowReassign(false)}
                   multiEditorAssignments={multiEditorAssignments}
                   users={users}
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
            </>
          )}

          {/* Removed for now */}

          {/* {canReportIssue && (
            <>
              <button style={iconBtn} title="Report Issue" onClick={() => setShowReportIssueModal(true)}>
                <FiAlertCircle size={22} /> Report Issue
              </button>
              <ReportIssueModal
                open={showReportIssueModal}
                onClose={() => setShowReportIssueModal(false)}
                reportIssueText={reportIssueText}
                setReportIssueText={setReportIssueText}
                onSubmit={handleReportIssueSubmit}
                submitting={reportIssueSubmitting}
                errorBanner={errorBanner}
              />
            </>
          )}
          */}
        </div>
        {/* Info modal: always rendered; visibility controlled by showSecurityCodes */}
        <InfoModal
          open={showSecurityCodes}
          onClose={() => setShowSecurityCodes(false)}
          codes={securityCodes}
          propertyName={task?.propertyName}
          updatedAtISO={securityCodesUpdatedAt}
          address={propertyAddress}
        />
        {/* Complete Editing (Editors/Managers only when in In House Edits stage) */}
        {(role === 'editor' || role === 'manager') && getCurrentStage(task) === 'In House Edits' && (
              <button
                style={{
                  background: '#10b981',
                  border: '1.5px solid #059669',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '8px 14px',
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(16,185,129,0.15)'
                }}
                onClick={() => setShowCompleteModal(true)}
                title="Complete Editing"
              >
                Complete Editing
              </button>
            )}
      </div>

      {/* Two-column info grid */}
      <div style={infoGridTwoCol}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={infoRow}><span style={infoLabel}>Update Type:</span> <span>{task.updateType}</span></div>
          {task.mediaType === "photos" && 
          <div style={infoRow}><span style={infoLabel}>Property Type:</span> <span>{task.propertyType || '-'}
          </span>
          </div>}
          <div style={infoRow}><span style={infoLabel}>Priority Request:</span>
            <span>
              <input
                type="checkbox"
                checked={priorityRequest}
                onChange={canTogglePriority ? handlePriorityToggle : undefined}
                readOnly={!canTogglePriority}
                style={{
                  accentColor: "#e74c3c",
                  width: 20,
                  height: 20,
                  cursor: canTogglePriority ? "pointer" : "default",
                  marginRight: 8,
                  verticalAlign: "middle"
                }}
              />
            </span>
          </div>
          <div style={infoRow}><span style={infoLabel}>Created by:</span> <span style={{ display: "flex", alignItems: "center", gap: 6 }}><FiUser size={16} /> {creatorName || "Unknown"}</span></div>

        </div>
        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={infoRow}><span style={infoLabel}>Created Date:</span> <span>{formatDateOnly(task.createdAt)}</span></div>
          <div style={infoRow}>
            <span style={infoLabel}>Expected Completion:</span>
            <span style={{ gap: 6, display: "flex", alignItems: "center" }}>{task.expectedCompletion ? formatDateOnly(task.expectedCompletion) : <span style={infoLabel}>Not Set</span>}</span>
            {/* Update Expected Completion Button (managers only) */}
          {(role === 'manager') && (
            <>
               <button
                  style={{
                    marginLeft: 4,
                    background: 'var(--button-bg)',
                    border: '1.5px solid var(--button-border)',
                    color: 'var(--button-text)',
                    borderRadius: 7,
                    padding: '4px 10px',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: 'pointer',
                    transition: 'background 0.15s, border 0.15s, color 0.15s'
                  }}
                  onClick={() => setShowEditExpectedDate(true)}
                >
                  Edit
                </button>
                <DateAssignmentModal
                  open={showEditExpectedDate}
                  onClose={() => setShowEditExpectedDate(false)}
                  onSave={handleSaveExpectedDate}
                  onClear={handleClearExpectedDate}
                  value={editExpectedDate ? { date: editExpectedDate } : null}
                  firestoreValue={task && task.expectedCompletion ? task.expectedCompletion : null}
                  loading={savingExpectedDate}
                  error={expectedDateError}
                  success={expectedDateSuccess ? 'Expected completion date updated!' : ''}
                  onChange={item => setEditExpectedDate(item?.date || "")}
                  rangeEnabled={false}
                  title="Select Expected Completion Date"
                />
            </>
          )}
          </div>
          {['Scheduling', 'Shooting'].includes(getCurrentStage(task)) && (
            <div style={infoRow}>
              <span style={infoLabel}>Shooting Date:</span>
              {(role === "manager") ? (
                <>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {task.scheduledShootDate && typeof task.scheduledShootDate === 'object' && task.scheduledShootDate.start && task.scheduledShootDate.end
                      ? `${new Date(task.scheduledShootDate.start).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} – ${new Date(task.scheduledShootDate.end).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`
                      : task.scheduledShootDate && typeof task.scheduledShootDate === 'string'
                        ? new Date(task.scheduledShootDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
                        : <span style={infoLabel}>Not scheduled</span>
                    }
                  </span>
                  <button
                    style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--button-bg)', color: 'var(--text-main)', border: '1.5px solid var(--sidebar-border)', fontWeight: 600, fontSize: 14, cursor: 'pointer', marginLeft: 4 }}
                    onClick={() => {
                      setShowEditScheduledDateDebug(true, 'shooting date button click');
                    }}
                  >{getCurrentStage(task) === 'Scheduling' ? 'Edit' : 'Edit'}</button>
                  <DateAssignmentModal
                    open={showEditScheduledDate}
                    onClose={() => {
                      setShowEditScheduledDateDebug(false, 'DateAssignmentModal onClose');
                    }}
                    onSave={(_payload, calendarOpts) => handleSaveScheduledDateRange(calendarOpts)}
                    onClear={handleClearScheduledDate}
                    value={scheduledShootDateEdit}
                    firestoreValue={task && typeof task.scheduledShootDate === 'object' ? task.scheduledShootDate : null}
                    loading={savingScheduledDate}
                    error={scheduledDateError}
                    onChange={item => setScheduledShootDateEdit(item)}
                    rangeEnabled={true}
                    title="Select Shooting Date Range"
                    unitCode={task.propertyName}
                    currentUserEmail={auth?.userData?.email || ""}
                    photographerEmail={(Array.isArray(users) ? users : []).find(u => (u.uid || u.id) === (task?.assignedPhotographer || ''))?.email || ""}
                  />
                </>
              ) : (
                <span style={{ fontSize: 15 }}>
                  {task.scheduledShootDate && typeof task.scheduledShootDate === 'object' && task.scheduledShootDate.start && task.scheduledShootDate.end
                    ? `${new Date(task.scheduledShootDate.start).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} – ${new Date(task.scheduledShootDate.end).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`
                    : task.scheduledShootDate && typeof task.scheduledShootDate === 'string'
                      ? new Date(task.scheduledShootDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
                      : 'Not scheduled'}
                </span>
              ) }
            </div>
          )}
          {['In House Edits', 'Publishing'].includes(getCurrentStage(task)) && (
            <div style={{ ...infoRow, display: 'flex', alignItems: 'flex-start' }}>
              <span style={{ ...infoLabel }}>
                Assigned Editor{Array.isArray(task.assignedEditors) && task.assignedEditors.length > 1 ? 's' : ''}:
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                {Array.isArray(task.assignedEditors) && task.assignedEditors.length > 0 ? (
                  task.assignedEditors.map((a, idx) => {
                    const u = users.find(u => (u.uid || u.id) === a.editorId);
                    const name = u ? (u.displayName || u.email || u.uid || u.id) : a.editorId;
                    const label = a.label === 'Custom' ? a.customLabel : a.label;
                    return (
                      <span key={a.editorId + '-' + (a.label || '')} style={{ display: 'block' }}>
                        {name} <span style={{ color: '#888', fontSize: 13 }}>({label})</span>
                      </span>
                    );
                  })
                ) : (
                  <span style={infoLabel}>Unassigned</span>
                )}
              </span>
            </div>
          )}
             {/* Assigned Photographer: Only show if progressState is Created, Scheduling, or Shooting */}
          {[ 'Scheduling', 'Shooting'].includes(getCurrentStage(task)) && (
            <div style={infoRow}>
              <span style={infoLabel}>Assigned Photographer:</span>
              {assignedPhotographerName ? (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <FiUser size={16} /> {assignedPhotographerName}
                </span>
              ) : (
                <span style={infoLabel}>
                  Unassigned
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {showCompleteModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: 'calc(100vw - 68px)',
            height: '100vh',
            background: 'rgba(0,0,0,0.24)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
          onClick={() => setShowCompleteModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              borderRadius: 16,
              padding: 32,
              minWidth: 340,
              width: '100%',
              maxWidth: 520,
              boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              alignItems: 'stretch',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 6, color: 'var(--text-main)' }}>Complete Editing</div>
            <div style={{ fontSize: 13.5, color: '#6b7280', marginBottom: 12 }}>
              Add an optional message and file links to include with this completion.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Message (optional)</div>
                <textarea
                  value={completeNotes}
                  onChange={e => setCompleteNotes(e.target.value)}
                  rows={4}
                  placeholder="Anything the team should know?"
                  style={{ width: '95%', resize: 'vertical', padding: 10, borderRadius: 8, border: '1.5px solid var(--button-border)', background: 'var(--bg-input)', color: 'var(--text-main)' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Attach file links (optional)</div>
                {completeFileLinks.map((f, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input
                      type="url"
                      value={f.url}
                      onChange={e => setCompleteFileLinks(prev => prev.map((x, i) => i === idx ? { ...x, url: e.target.value } : x))}
                      placeholder="https://..."
                      style={{ flex: 2, padding: 8, borderRadius: 8, border: '1.5px solid var(--button-border)', background: 'var(--bg-input)', color: 'var(--text-main)' }}
                    />
                    <input
                      type="text"
                      value={f.label}
                      onChange={e => setCompleteFileLinks(prev => prev.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))}
                      placeholder="Label (optional)"
                      style={{ flex: 1, padding: 8, borderRadius: 8, border: '1.5px solid var(--button-border)', background: 'var(--bg-input)', color: 'var(--text-main)' }}
                    />
                    <button
                      onClick={() => setCompleteFileLinks(prev => prev.filter((_, i) => i !== idx))}
                      style={{ background: 'var(--button-bg)', border: '1.5px solid var(--button-border)', color: 'var(--button-text)', borderRadius: 8, padding: '8px 10px', fontWeight: 600 }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setCompleteFileLinks(prev => [...prev, { url: '', label: '' }])}
                  style={{ background: 'var(--button-bg)', border: '1.5px solid var(--button-border)', color: 'var(--button-text)', borderRadius: 8, padding: '8px 10px', fontWeight: 600 }}
                >
                  + Add Link
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button
                disabled={submittingComplete}
                style={{
                  background: 'var(--button-bg)',
                  border: '1.5px solid var(--button-border)',
                  color: 'var(--button-text)',
                  borderRadius: 8,
                  padding: '8px 14px',
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: 'pointer',
                }}
                onClick={() => setShowCompleteModal(false)}
              >
                Cancel
              </button>
              <button
                disabled={submittingComplete}
                onClick={handleCompleteEditing}
                style={{
                  background: submittingComplete ? '#86efac' : '#22c55e',
                  border: '1.5px solid #16a34a',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '8px 14px',
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: submittingComplete ? 'default' : 'pointer',
                  boxShadow: '0 2px 10px rgba(34,197,94,0.20)'
                }}
              >
                {submittingComplete ? 'Submitting...' : 'Submit Completion'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs for Files, Comments and History */}
      <div style={{ marginTop: 10, width: "100%" }}>
        <div style={{ display: 'flex', borderBottom: '1.5px solid var(--sidebar-border)', gap: 0 }}>
            <button style={tabBtn(activeTab === 'files')} onClick={() => setActiveTab('files')}>Files</button>
            <button style={tabBtn(activeTab === 'comments')} onClick={() => setActiveTab('comments')}>
              Comments
              {mergedComments.length > 0 && (
                <span style={{
                  display: 'inline-block',
                  minWidth: 20,
                  padding: '0 7px',
                  marginLeft: 7,
                  fontSize: 13,
                  fontWeight: 600,
                  lineHeight: '20px',
                  borderRadius: 12,
                  background: 'var(--sidebar-border, #e0eafc)',
                  color: 'var(--text-main)',
                  boxShadow: '0 1px 4px rgba(80,120,200,0.08)',
                  verticalAlign: 'middle',
                  textAlign: 'center'
                }}>
                  {mergedComments.length}
                </span>
              )}
            </button>
            <button style={tabBtn(activeTab === 'history')} onClick={() => setActiveTab('history')}>History</button>
          </div>
        <div className="tab-scroll" style={{ background: 'var(--bg-card)', borderRadius: '0 0 12px 12px', minHeight: 120, marginTop: 0, padding: '20px 12px', border: '1.5px solid var(--button-border)', borderTop: 'none', maxHeight: 240, overflowY: 'auto' }}>
          {activeTab === 'files' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, minHeight: 80 }}>
              {visibleFiles.length > 0 ? (
                [...visibleFiles].sort((a, b) => {
                  // Use createdAt if present, fallback to id or 0
                  const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                  const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                  return bTime - aTime; // newest first
                }).map((file, idx) => {
                  // Color coding based on label (user-given name)
                  let borderColor = '#f7c948'; // yellow default
                  const label = (file.label || file.url || '').toLowerCase();
                  if (label === 'raw') borderColor = '#60a5fa'; // blue
                  else if (label === '1920') borderColor = '#34d399'; // green
                  else if (label === 'o' || label === 'original') borderColor = '#1e3a8a'; // darker blue
                  // Also match 'O', 'Original' (case-insensitive)
                  else if (file.label && ['o', 'original'].includes(file.label.trim().toLowerCase())) borderColor = '#1e3a8a';
                  return (
                    <div
                      key={file.url || file.name || idx}
                      style={{
                        border: `2.5px solid ${borderColor}`,
                        borderRadius: 18,
                        padding: '10px 10px',
                        width: '16%',
                        minWidth: 120,
                        minHeight: 90,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        background: 'var(--bg-card, #fff)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                        position: 'relative',
                        overflow: 'visible',
                      }}
                      title={file.name}
                      onClick={() => {
                        const a = document.createElement('a');
                        a.href = file.url;
                        a.target = '_blank';
                        a.rel = 'noopener noreferrer';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                      }}
                      onMouseEnter={() => setHoveredFileId(file.id || idx)}
                      onMouseLeave={() => setHoveredFileId(null)}
                      >
                    {canAddFiles && (
                      <button
                        style={{
                          position: 'absolute',
                          top: 10,
                          right: 10,
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: 'var(--bg-card)',
                          border: '1.5px solid #ccc',
                          color: '#c00',
                          fontWeight: 700,
                          fontSize: 15,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          opacity: hoveredFileId === (file.id || idx) ? 1 : 0,
                          pointerEvents: 'auto',
                          transition: 'opacity 0.18s',
                          zIndex: 2,
                        }}
                        title="Remove file"
                        onClick={e => {
                          e.stopPropagation();
                          // Optimistically hide file
                          if (typeof setFileLinks === 'function') {
                            setFileLinks(prev => prev.map(f => f.id === file.id ? { ...f, deleted: true, deletedAt: new Date().toISOString() } : f));
                          }
                          // Add undo action (delays Firestore update)
                          if (typeof addUndoAction === 'function') {
                            addUndoAction({
                              description: `File removed.`,
                              onUndo: async () => {
                                if (typeof setFileLinks === 'function') {
                                  setFileLinks(prev => prev.map(f => f.id === file.id ? { ...f, deleted: false, deletedAt: null } : f));
                                }
                              },
                              onFinalize: async () => {
                                try {
                                  const db = getFirestore();
                                  const fileRef = file.id
                                    ? doc(db, 'tasks', task.id, 'files', file.id)
                                    : null;
                                  if (!fileRef) return;
                                  await updateDoc(fileRef, { deleted: true, deletedAt: new Date().toISOString() });
                                } catch (err) {
                                  setErrorBanner('Failed to remove file: ' + (err.message || err));
                                }
                              },
                              duration: 10000,
                            });
                          }
                        }}
                        tabIndex={-1}
                      >
                        ✕
                      </button>
                    )}
                    <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>
                      {file.label || file.url}
                    </div>
                    <div style={{ fontSize: 13, color: '#888', wordBreak: 'break-all' }}>
                      {file.url.length > 20 ? file.url.slice(0, 20) + '...' : file.url}
                    </div>
                    {file.addedByDisplayName && (
                      <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>Added by: {file.addedByDisplayName}</div>
                    )}
                  </div>
                )})
              ) : (
                // "No Files Available" text container, kept for formatting purposes
                <div style={{ color: '#888', textAlign: 'center', justifyContent: 'center', alignItems: 'center', display: 'flex', flexDirection: 'column', width: '39%' }}></div>
              )}
              {canAddFiles && (
                <>
                  <div
                    style={{
                      border: `2.5px solid transparent`,
                      borderRadius: 18,
                      padding: '10px 10px',
                      width: '16%',
                      minHeight: 90,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--bg-card, #fff)',
                    }}
                  >
                    <button
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 60,
                        height: 60,
                        borderRadius: '50%',
                        border: '2px solid var(--sidebar-border, #d1d5db)',
                        background: 'var(--button-bg, #f3f6ff)',
                        color: 'var(--text-main, #23272f)',
                        boxShadow: '0 2px 8px rgba(60,60,90,0.06)',
                        outline: 'none',
                        cursor: 'pointer',
                        fontSize: 24,
                        transition: 'background 0.18s, color 0.18s, border 0.18s, box-shadow 0.18s',
                        position: 'relative',
                      }}
                      title="Add Files"
                      onClick={() => setShowAddFilesModal(true)}
                      onMouseOver={e => {
                        e.currentTarget.style.background = 'var(--button-bg-hover, #e6eaff)';
                        e.currentTarget.style.color = 'var(--button-text-hover, #2563eb)';
                        e.currentTarget.style.border = '2px solid var(--button-text-hover, #2563eb)';
                        e.currentTarget.style.boxShadow = '0 4px 18px rgba(60,120,200,0.14)';
                      }}
                      onMouseOut={e => {
                        e.currentTarget.style.background = 'var(--button-bg, #f3f6ff)';
                        e.currentTarget.style.color = 'var(--text-main, #23272f)';
                        e.currentTarget.style.border = '2px solid var(--sidebar-border, #d1d5db)';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(60,60,90,0.06)';
                      }}
                    >
                      <FiPlus size={26} />
                    </button>
                  </div>
                {showAddFilesModal && (
                  <div
                    style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      width: '100vw',
                      height: '100vh',
                      background: 'rgba(0,0,0,0.32)',
                      zIndex: 1000,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onClick={() => setShowAddFilesModal(false)}
                  >
                    <div
                      style={{
                        background: 'var(--bg-card)',
                        borderRadius: 16,
                        padding: 32,
                        minWidth: 340,
                        maxWidth: 420,
                        boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 18,
                        alignItems: 'stretch',
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 6, color: 'var(--text-main)' }}>Add File Links</div>
                      {addFileLinks.map((file, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <input
                            type="text"
                            placeholder="Label (optional)"
                            value={file.label || ''}
                            onChange={e => {
                              const newLinks = [...addFileLinks];
                              newLinks[idx] = { ...newLinks[idx], label: e.target.value };
                              setAddFileLinks(newLinks);
                            }}
                            style={{ padding: '8px 10px', borderRadius: 7, border: '1.5px solid var(--sidebar-border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: 15, width: 130 }}
                          />
                          <input
                            type="url"
                            placeholder="Paste file URL (Dropbox, Google Drive, etc)"
                            value={file.url || ''}
                            onChange={e => {
                              const newLinks = [...addFileLinks];
                              newLinks[idx] = { ...newLinks[idx], url: e.target.value };
                              setAddFileLinks(newLinks);
                            }}
                            style={{ padding: '8px 12px', borderRadius: 7, border: '1.5px solid var(--sidebar-border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: 15, flex: 1 }}
                            autoFocus={idx === 0}
                          />
                          {addFileLinks.length > 1 && (
                            <button type="button" onClick={() => setAddFileLinks(addFileLinks.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', color: '#c00', cursor: 'pointer', fontSize: 18 }} title="Remove">✕</button>
                          )}
                          {idx === addFileLinks.length - 1 && (
                            <button type="button" onClick={() => setAddFileLinks([...addFileLinks, { url: '', label: '' }])} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 18 }} title="Add Link">＋</button>
                          )}
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 12, marginTop: 10, justifyContent: 'flex-end' }}>
                        <button
                          style={{
                            background: 'var(--sidebar-bg)',
                            color: 'var(--text-main)',
                            border: '1.5px solid var(--sidebar-border)',
                            borderRadius: 7,
                            padding: '8px 20px',
                            fontWeight: 600,
                            fontSize: 15,
                            cursor: 'pointer'
                          }}
                          onClick={() => setShowAddFilesModal(false)}
                        >
                          Cancel
                        </button>
                        <button
                          style={{
                            background: '#1d5413',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 7,
                            padding: '8px 20px',
                            fontWeight: 600,
                            fontSize: 15,
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.18)'
                          }}
                          onClick={async () => {
                            if (!addFileLinks.some(f => f.url && f.url.trim())) return;
                            setAddingFiles(true);
                            const db = getFirestore();
                            try {
                              const user = currentUser || (auth && auth.user);
                              const displayName = user?.displayName || user?.email || user?.uid || "Unknown User";
                              const uid = user?.uid || "unknown";
                              const now = new Date().toISOString();
                              const validLinks = addFileLinks.filter(f => f.url && f.url.trim());
                              await Promise.all(validLinks.map(async file => {
                                await addDoc(collection(db, "tasks", task.id, "files"), {
                                  url: file.url.trim(),
                                  label: file.label ? file.label.trim() : '',
                                  addedBy: uid,
                                  addedByDisplayName: displayName,
                                  createdAt: now,
                                });
                                // Add to log array
                                const taskRef = doc(db, "tasks", task.id);
                                // Get current log
                                const taskSnap = await getDoc(taskRef);
                                let log = Array.isArray(taskSnap.data().log) ? [...taskSnap.data().log] : [];
                                log.push({
                                  type: 'file_added',
                                  user: { uid, displayName },
                                  timestamp: now,
                                  description: `${displayName} added a file.`
                                });
                                await updateDoc(taskRef, { log });
                              }));
                              setAddFileLinks([{ url: '', label: '' }]);
                              setShowAddFilesModal(false);
                            } catch (e) {
                              setErrorBanner("Failed to add files: " + (e.message || e));
                            }
                            setAddingFiles(false);
                          }}
                          disabled={addFileLinks.every(f => !f.url || !f.url.trim()) || addingFiles}
                        >
                            {addingFiles ? 'Adding...' : 'Add Links'}
                        </button>
                    </div>
                </div>
            </div>
        )}
    </>
    )}
</div>
          )}
          {activeTab === 'history' && (
            <div>
              {Array.isArray(task.log) && task.log.length > 0 ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {task.log.map((entry, idx) => {
                    // Replace any usage of {entry.user} in description with getUserDisplayName
                    let desc = entry.description;
                    if (desc && desc.includes('{user}')) {
                      desc = desc.replace('{user}', getUserDisplayName(entry.user, users));
                    }
                    return (
                      <li key={idx} style={{ marginBottom: 10, padding: '0 0 6px 0', borderBottom: '1px solid var(--border, #d1d5db)' }}>
                        <div style={{ fontWeight: 400, fontSize: 15, color: 'var(--text-main, #23272f)', marginBottom: 2 }}>{desc}</div>
                        <div style={{ color: 'var(--text-secondary, #888)', fontSize: 12, marginTop: 2 }}>
                          {getUserDisplayName(entry.user, users) && <span>{getUserDisplayName(entry.user, users)}</span>}{getUserDisplayName(entry.user, users) && entry.timestamp ? <span> &bull; </span> : null}{entry.timestamp && <span>{formatDate(entry.timestamp)}</span>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div style={{ color: '#888', fontSize: 14 }}>No history logs found.</div>
              )}
            </div>
          )}
          {activeTab === 'comments' && (
            <div>
              {mergedComments && mergedComments.length > 0 ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {mergedComments.map((comment, idx) => {
                    // Identify issue reported/resolved
                    const isIssueReported = comment.type === 'issue_reported';
                    const isIssueResolved = comment.type === 'issue_resolved';
                    const rawText = (comment.text || comment.message || '');
                    const isCompletionNotes = /^Editing Completion Notes:\s*/.test(rawText);
                    return (
                      <div
                        key={comment.id || idx}
                        style={isIssueResolved ? {
                          marginBottom: 10,
                          background: 'rgba(40,167,69,0.07)',
                          border: '1.5px solid #28a745',
                          borderRadius: 8,
                          padding: '5px 14px',
                          boxShadow: '0 1px 4px rgba(40,167,69,0.08)'
                        } : isIssueReported ? {
                          marginBottom: 10,
                          background: 'rgba(184,46,46,0.07)',
                          border: '1.5px solid #b82e2e',
                          borderRadius: 8,
                          padding: '5px 14px',
                          boxShadow: '0 1px 4px rgba(184,46,46,0.08)'
                        } : isCompletionNotes ? {
                          marginBottom: 12,
                          background: 'rgba(16,185,129,0.10)',
                          border: '1.5px solid rgba(16,185,129,0.55)',
                          borderRadius: 10,
                          padding: '6px 14px',
                          boxShadow: '0 1px 4px rgba(16,185,129,0.10)'
                        } : { marginBottom: 18, marginLeft: 14 }}
                      >
                        {isIssueReported && (
                          <div style={{ color: '#b82e2e', fontWeight: 700, fontSize: 14, marginBottom: 2 }}>Issue Reported</div>
                        )}
                        {isIssueResolved && (
                          <div style={{ color: '#28a745', fontWeight: 700, fontSize: 14, marginBottom: 2 }}>Issue Resolved</div>
                        )}
                        {(isIssueReported || isIssueResolved) && (
                           <div style={{
                             fontSize: 14,
                             color: isIssueResolved ? "var(--text-main)" : "var(--text-main)",
                             marginBottom: comment.description ? 2 : 0,
                             fontWeight: 500,
                             whiteSpace: 'pre-line'
                           }}>
                             {comment.description || <span style={{ color: '#888', fontWeight: 400 }}>[No description]</span>}
                           </div>
                         )}
                         {comment.text || comment.message ? (
                           <div style={{ fontSize: 14, color: 'var(--text-main)', marginBottom: 3 }}>
                             {/* Render mentions as just the first name, styled */}
                             {(comment.text || comment.message).split(/(@\[[^\]]+\]\([^)]+\))/g).map((part, idx) => {
                               const match = part.match(/^@\[([^\]]+)\]\(([^)]+)\)$/);
                               if (match) {
                                 return <span key={idx} style={{ color: '#3b82f6', fontWeight: 600 }}>{match[1]}</span>;
                               } else {
                                 return part;
                               }
                             })}
                           </div>
                         ) : null}
                        <div style={{ color: '#888', fontSize: 12 }}>
                          {comment.user && <span>{getUserDisplayName(comment.user, users)}</span>} {comment.timestamp || comment.createdAt ? <span> | {formatDate(comment.timestamp || comment.createdAt)}</span> : null}
                        </div>
                      </div>
                    );
                  })}
                </ul>
              ) : (
                <div style={{ color: '#888', fontSize: 14 }}>No comments yet.</div>
              )}
            </div>
          )}
        </div>
        {/* Comment input */}
        {activeTab === 'comments' && (
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 10, gap: 8, position: 'relative' }}>
            <input
              type="text"
              value={commentInput}
              onChange={e => {
                setCommentInput(e.target.value);
                handleTagAutocomplete(e.target.value, e.target.selectionStart);
              }}
              placeholder="Add a comment..."
              style={{ flex: 1, padding: '8px 12px', borderRadius: 7, border: '1.5px solid var(--button-border)', fontSize: 15, background: 'var(--bg-card)', color: 'var(--text-main)' }}
              disabled={commentSubmitting}
              onKeyDown={handleCommentInputKeyDown}
              ref={commentInputRef}
              autoComplete="off"
            />
            <button
              style={{ ...iconBtn, minWidth: 80, opacity: commentSubmitting ? 0.6 : 1 }}
              onClick={() => {
                // Extract all unique @FirstName in the comment
                const firstNames = Array.from(new Set((commentInput.match(/@\w+/g) || []).map(s => s.slice(1))));
                // Map to UIDs using taggedUsers Map
                const taggedUserIds = firstNames.map(fn => taggedUsers instanceof Map ? taggedUsers.get(fn) : undefined).filter(Boolean);
                handleAddComment(commentInput, taggedUserIds);
              }}
              disabled={commentSubmitting || !commentInput.trim()}
            >
              {commentSubmitting ? 'Posting...' : 'Post'}
            </button>
            {showUserDropdown && (
              <div style={{
                position: 'absolute',
                left: 0,
                top: '100%',
                width: '100%',
                background: 'var(--bg-main)',
                border: '1.5px solid var(--sidebar-border)',
                borderRadius: 8,
                marginTop: 2,
                maxHeight: 180,
                overflowY: 'auto',
                boxShadow: '0 2px 12px rgba(80,120,200,0.09)',
                zIndex: 20
              }}>
                {filteredUsers.length === 0 ? (
                  <div style={{ padding: '10px 16px', color: '#888' }}>No users found</div>
                ) : (
                  filteredUsers.map((user, idx) => (
                    <div
                      key={user.id || user.uid || user.email}
                      style={{
                        padding: '10px 16px',
                        cursor: 'pointer',
                        fontSize: 16,
                        color: idx === highlightedUserIdx ? 'var(--primary, #3b82f6)' : 'var(--text-main)',
                        background: idx === highlightedUserIdx ? 'var(--add-row-bg-hover, rgba(79,140,255,0.18))' : 'transparent',
                        fontWeight: idx === highlightedUserIdx ? 600 : 400
                      }}
                      onMouseDown={e => {
                        e.preventDefault();
                        selectUserFromDropdown(idx);
                      }}
                      onMouseEnter={() => setHighlightedUserIdx(idx)}
                    >
                      {user.displayName || user.name || user.email}
                      {user.email && (
                        <span style={{ color: '#888', fontSize: 13, marginLeft: 6 }}>{user.email}</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  );
};

const getContainerStyle = (noMargin) => ({
  background: "var(--bg-card)",
  color: "var(--text-main)",
  borderRadius: 16,
  boxShadow: "0 2px 16px rgba(80,120,200,0.07)",
  padding: 32,
  margin: noMargin ? 0 : "32px 20px 40px",
  maxWidth: noMargin ? 'none' : 1200,
  display: "flex",
  flexDirection: "column",
  gap: 20
});

const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 12
};

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

// Responsive two-column grid for task details
const infoGridTwoCol = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '0 48px',
  margin: '18px 0 32px 0',
  width: '100%',
  minWidth: 0,
  alignItems: 'flex-start',
  // Responsive: stack columns on narrow screens
  ...(window.innerWidth < 650 ? { gridTemplateColumns: '1fr', gap: '0 0' } : {})
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

// --- Tagging Autocomplete Logic (local to comment input) ---
// All logic below must be placed inside the DetailedTaskView component, using the existing React import at the top.
// Remove any duplicate import React... lines.

export default DetailedTaskView;