import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AccessDeniedPage from "./AccessDeniedPage";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit as fbLimit,
  getDocs,
  startAfter,
  Timestamp,
} from "firebase/firestore";

const pageSize = 50;

// Static color rules. Adjust these lists/colors as needed.
// Each rule applies a background color to rows whose action matches.
// Fallback: if no rule matches, rows use the default background.
const COLOR_RULES = [
  { label: 'Alert', color: '#ef4444', alpha: 0.38, actions: ['user_deleted'] },
  { label: 'Admin',  color: '#f59e0b', alpha: 0.32, actions: ['admin_debug_toggle'] },
  { label: 'Info',     color: '#3b82f6', alpha: 0.15, actions: ['csv_upload_properties','notifications_update_recipients','user_permissions_changed','task_archived'] },
];
const DEFAULT_ROW_ALPHA = 0.12;

function getRuleForAction(actionName) {
  if (!actionName) return null;
  for (const r of COLOR_RULES) {
    if (Array.isArray(r.actions) && r.actions.includes(actionName)) return r;
  }
  return null;
}

function hexToRgba(hex, alpha) {
  try {
    let h = hex.replace('#','');
    if (h.length === 3) {
      h = h.split('').map(c => c + c).join('');
    }
    const num = parseInt(h, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  } catch (_) {
    return hex;
  }
}

export default function ActionLogPage() {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const canView = userData?.permissions?.adminTrackingLog === true;

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [logs, setLogs] = React.useState([]);
  const [lastDoc, setLastDoc] = React.useState(null);
  const [hasMore, setHasMore] = React.useState(false);

  // Basic filters
  const [action, setAction] = React.useState("");
  const [userId, setUserId] = React.useState("");
  const [targetId, setTargetId] = React.useState("");
  const [startDate, setStartDate] = React.useState(""); // yyyy-mm-dd
  const [endDate, setEndDate] = React.useState(""); // yyyy-mm-dd

  const buildQuery = (forNextPage = false, includeOrder = true) => {
    const db = getFirestore();
    const col = collection(db, "actionLogs");
    const clauses = [];
    // Filters
    if (action) clauses.push(where("action", "==", action));
    if (userId) clauses.push(where("userId", "==", userId));
    if (targetId) clauses.push(where("targetId", "==", targetId));
    if (startDate) {
      const startTs = Timestamp.fromDate(new Date(startDate + "T00:00:00"));
      clauses.push(where("ts", ">=", startTs));
    }
    if (endDate) {
      const endTs = Timestamp.fromDate(new Date(endDate + "T23:59:59"));
      clauses.push(where("ts", "<=", endTs));
    }
    if (includeOrder) clauses.push(orderBy("ts", "desc"));
    clauses.push(fbLimit(pageSize));
    if (forNextPage && lastDoc) clauses.splice(clauses.length - 1, 0, startAfter(lastDoc));
    return query(col, ...clauses);
  };

  const [clientSortTs, setClientSortTs] = React.useState(false);

  const sortByTsDesc = (items) => {
    return [...items].sort((a, b) => {
      const ta = a.ts?.toDate ? a.ts.toDate().getTime() : (a.ts ? new Date(a.ts).getTime() : 0);
      const tb = b.ts?.toDate ? b.ts.toDate().getTime() : (b.ts ? new Date(b.ts).getTime() : 0);
      return tb - ta;
    });
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setClientSortTs(false);
      const q = buildQuery(false, true);
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLogs(items);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === pageSize);
    } catch (e) {
      // Retry without orderBy if index is missing
      if (e && (e.code === 'failed-precondition' || /indexes required/i.test(e.message || ''))) {
        try {
          const q2 = buildQuery(false, false);
          const snap2 = await getDocs(q2);
          let items2 = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
          items2 = sortByTsDesc(items2);
          setLogs(items2);
          setLastDoc(snap2.docs[snap2.docs.length - 1] || null);
          setHasMore(snap2.docs.length === pageSize);
          setClientSortTs(true);
          setError("");
        } catch (e2) {
          setError("Failed to load action logs.");
        }
      } else {
        setError("Failed to load action logs.");
      }
    }
    setLoading(false);
  };

  const loadMore = async () => {
    if (!hasMore || !lastDoc) return;
    setLoading(true);
    setError("");
    try {
      if (!clientSortTs) {
        const q = buildQuery(true, true);
        const snap = await getDocs(q);
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setLogs(prev => [...prev, ...items]);
        setLastDoc(snap.docs[snap.docs.length - 1] || null);
        setHasMore(snap.docs.length === pageSize);
      } else {
        // Fallback path without orderBy; paginate by doc id, then client-sort
        const q2 = buildQuery(true, false);
        const snap2 = await getDocs(q2);
        let items2 = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
        setLogs(prev => sortByTsDesc([...prev, ...items2]));
        setLastDoc(snap2.docs[snap2.docs.length - 1] || null);
        setHasMore(snap2.docs.length === pageSize);
      }
    } catch (e) {
      setError("Failed to load more.");
    }
    setLoading(false);
  };

  const applyFilters = async (e) => {
    e?.preventDefault?.();
    setLastDoc(null);
    await load();
  };

  // CSV Export helpers
  const escapeCSV = (val) => {
    if (val === null || val === undefined) return "";
    const s = String(val);
    if (/[",\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const toCSV = (rows) => {
    const headers = [
      'tsISO','action','userId','userEmail','actingRoles','targetType','targetId','context','severity','message','metadata'
    ];
    const lines = [headers.join(',')];
    rows.forEach(r => {
      const ts = r.ts?.toDate ? r.ts.toDate().toISOString() : (r.ts ? new Date(r.ts).toISOString() : '');
      const actingRoles = Array.isArray(r.actingRoles) ? r.actingRoles.join(';') : '';
      const metadata = r.metadata ? JSON.stringify(r.metadata) : '';
      const values = [
        ts,
        r.action || '',
        r.userId || '',
        r.userEmail || '',
        actingRoles,
        r.targetType || '',
        r.targetId || '',
        r.context || '',
        r.severity || '',
        r.message || '',
        metadata,
      ].map(escapeCSV);
      lines.push(values.join(','));
    });
    return lines.join('\n');
  };

  const downloadCSV = (csv, filename = 'action-log.csv') => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportLoaded = () => {
    const csv = toCSV(logs);
    downloadCSV(csv, 'action-log-loaded.csv');
  };

  const exportAll = async () => {
    setLoading(true);
    setError("");
    try {
      const db = getFirestore();
      const col = collection(db, "actionLogs");
      const clauses = [];
      if (action) clauses.push(where("action", "==", action));
      if (userId) clauses.push(where("userId", "==", userId));
      if (targetId) clauses.push(where("targetId", "==", targetId));
      if (startDate) {
        const startTs = Timestamp.fromDate(new Date(startDate + "T00:00:00"));
        clauses.push(where("ts", ">=", startTs));
      }
      if (endDate) {
        const endTs = Timestamp.fromDate(new Date(endDate + "T23:59:59"));
        clauses.push(where("ts", "<=", endTs));
      }
      clauses.push(orderBy("ts", "desc"));

      try {
        let q = query(col, ...clauses, fbLimit(500));
        let snap = await getDocs(q);
        let all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        let last = snap.docs[snap.docs.length - 1] || null;
        // Cap at ~2000 rows to keep export reasonable
        while (last && all.length < 2000) {
          q = query(col, ...clauses, startAfter(last), fbLimit(500));
          snap = await getDocs(q);
          all = all.concat(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          last = snap.docs[snap.docs.length - 1] || null;
          if (snap.empty) break;
        }
        const csv = toCSV(all);
        downloadCSV(csv, 'action-log-all.csv');
      } catch (err1) {
        if (err1 && (err1.code === 'failed-precondition' || /indexes required/i.test(err1.message || ''))) {
          // Retry without orderBy and client-sort
          const clausesNoOrder = clauses.filter(c => c?.type !== 'orderBy');
          let q2 = query(col, ...clausesNoOrder, fbLimit(500));
          let snap2 = await getDocs(q2);
          let all2 = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
          let last2 = snap2.docs[snap2.docs.length - 1] || null;
          while (last2 && all2.length < 2000) {
            q2 = query(col, ...clausesNoOrder, startAfter(last2), fbLimit(500));
            snap2 = await getDocs(q2);
            all2 = all2.concat(snap2.docs.map(d => ({ id: d.id, ...d.data() })));
            last2 = snap2.docs[snap2.docs.length - 1] || null;
            if (snap2.empty) break;
          }
          all2 = sortByTsDesc(all2);
          const csv = toCSV(all2);
          downloadCSV(csv, 'action-log-all.csv');
        } else {
          throw err1;
        }
      }
    } catch (e) {
      setError('Failed to export CSV.');
    }
    setLoading(false);
  };

  React.useEffect(() => {
    if (canView) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  if (!canView) {
    return <AccessDeniedPage />;
  }

  return (
    <div style={{ padding: 24, background: '#a2d4a1', height: '100vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: 'var(--text-main)' }}>Action Log</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportLoaded} disabled={loading || logs.length === 0} style={loadMoreBtnStyle}>Export CSV (Loaded)</button>
          <button onClick={exportAll} disabled={loading} style={loadMoreBtnStyle}>Export CSV (All up to 2000)</button>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'var(--bg-main)', border: '1.5px solid var(--sidebar-border)', color: 'var(--text-main)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}
          >Back</button>
        </div>
      </div>

      <form onSubmit={applyFilters} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={labelStyle}>Action</label>
          <input className="global-input" value={action} onChange={e => setAction(e.target.value)} placeholder="e.g. role_edit" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={labelStyle}>User ID</label>
          <input className="global-input" value={userId} onChange={e => setUserId(e.target.value)} placeholder="uid" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={labelStyle}>Target ID</label>
          <input className="global-input" value={targetId} onChange={e => setTargetId(e.target.value)} placeholder="taskId / userId" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={labelStyle}>Start</label>
          <input className="global-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={labelStyle}>End</label>
          <input className="global-input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <button type="submit" style={applyBtnStyle} disabled={loading}>Apply</button>
      </form>

      {error && <div style={{ color: 'var(--error)', marginBottom: 10 }}>{error}</div>}

      <div style={{ border: '1px solid var(--sidebar-border)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-card)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1.2fr) 160px minmax(220px, 1.4fr) minmax(200px, 1.2fr) minmax(260px, 2fr)', gap: 0, background: 'var(--bg-card)', padding: '12px 14px', fontWeight: 700 }}>
          <div>Date</div>
          <div>Action</div>
          <div>User</div>
          <div>Target</div>
          <div>Message</div>
        </div>
        {loading && logs.length === 0 && (
          <div style={{ padding: 16 }}>Loading...</div>
        )}
        {!loading && logs.length === 0 && !error && (
          <div style={{ padding: 16, color: 'var(--text-main)' }}>No logs found.</div>
        )}
        <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
          {logs.map((l) => {
            const ts = l.ts?.toDate ? l.ts.toDate() : (l.ts ? new Date(l.ts) : null);
            const rule = getRuleForAction(l.action);
            const bgColor = rule?.color ? hexToRgba(rule.color, rule.alpha ?? DEFAULT_ROW_ALPHA) : 'var(--bg-main)';
            return (
              <div key={l.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1.2fr) 160px minmax(220px, 1.4fr) minmax(200px, 1.2fr) minmax(260px, 2fr)', gap: 0, padding: '10px 14px', borderTop: '1px solid var(--sidebar-border)', background: bgColor, alignItems: 'start' }}>
                <div style={{ color: 'var(--text-main)', wordBreak: 'break-word' }}>{ts ? ts.toLocaleString() : ''}</div>
                <div style={{ color: 'var(--text-main)', wordBreak: 'break-word' }}>{l.action || ''}</div>
                <div style={{ color: 'var(--text-main)', wordBreak: 'break-word' }}>{l.userEmail || l.userId || ''}</div>
                <div style={{ color: 'var(--text-main)', wordBreak: 'break-word' }}>{l.targetType ? `${l.targetType}:${l.targetId || ''}` : (l.targetId || '')}</div>
                <div style={{ color: 'var(--text-main)', whiteSpace: 'normal', wordBreak: 'break-word' }}>{l.message || ''}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button onClick={loadMore} disabled={!hasMore || loading} style={loadMoreBtnStyle}>{loading ? 'Loading...' : hasMore ? 'Load More' : 'No More'}</button>
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 12, color: 'var(--label-text, #6b7a90)', marginBottom: 4 };
const applyBtnStyle = { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', height: 38 };
const loadMoreBtnStyle = { background: 'var(--bg-main)', border: '1.5px solid var(--sidebar-border)', color: 'var(--text-main)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' };
