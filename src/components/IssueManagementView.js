import React, { useEffect, useState } from "react";
import { getFirestore, collectionGroup, query, where, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import FloatingBanner from "./FloatingBanner";
import { FiCheckCircle, FiAlertCircle, FiUpload } from "react-icons/fi";
import DetailedTaskView from "./DetailedTaskView";

const IssueManagementView = () => {
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tasksMap, setTasksMap] = useState({}); // { [taskId]: { ...task } }
  const [usersMap, setUsersMap] = useState({}); // { [uid]: { ...user } }
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [resolvingIssue, setResolvingIssue] = useState(null);
  const [resolveNotes, setResolveNotes] = useState("");
  const [resolveLinks, setResolveLinks] = useState([{ url: '', label: '' }]);
  const [resolveUploading, setResolveUploading] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const { role, user } = useAuth();

  useEffect(() => {
    const fetchIssues = async () => {
      setLoading(true);
      const db = getFirestore();
      const q = query(collectionGroup(db, "issues"), where("status", "==", "open"));
      const snap = await getDocs(q);
      // Extract taskId from document path
      const issuesList = snap.docs.map(docSnap => {
        const pathSegments = docSnap.ref.path.split("/");
        const taskId = pathSegments[pathSegments.indexOf("tasks") + 1];
        return { id: docSnap.id, ...docSnap.data(), taskId };
      });
      // If editor, filter issues to only those where the parent task is assigned to them and progressState is 4
      let filteredIssues = issuesList;
      if (role === "editor") {
        // Fetch task docs for all issues, then filter
        const uniqueTaskIds = [...new Set(issuesList.map(i => i.taskId))];
        const taskSnaps = await Promise.all(
          uniqueTaskIds.map(async tid => {
            try {
              const db = getFirestore();
              const docRef = doc(db, "tasks", tid);
              const docSnap = await getDoc(docRef);
              if (docSnap.exists()) {
                return { id: tid, ...docSnap.data() };
              }
            } catch (e) {}
            return { id: tid };
          })
        );
        const tasksObj = {};
        taskSnaps.forEach(t => { if (t && t.id) tasksObj[t.id] = t; });
        filteredIssues = issuesList.filter(issue => {
          const task = tasksObj[issue.taskId];
          return task && task.assignedEditor === user.uid && task.progressState === 4;
        });
        setTasksMap(tasksObj);
      }
      setIssues(filteredIssues);
      setLoading(false);
      // Fetch human-readable task and user info
      const uniqueTaskIds = [...new Set(filteredIssues.map(i => i.taskId))];
      const uniqueUserIds = [...new Set(issuesList.map(i => i.createdBy))];
      // Fetch all tasks
      const taskSnaps = await Promise.all(
        uniqueTaskIds.map(async tid => {
          try {
            const db = getFirestore();
            const docRef = doc(db, "tasks", tid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              return { id: tid, ...docSnap.data() };
            }
          } catch (e) {}
          return { id: tid };
        })
      );
      const tasksObj = {};
      taskSnaps.forEach(t => { if (t && t.id) tasksObj[t.id] = t; });
      setTasksMap(tasksObj);
      // Fetch all users
      const userSnaps = await Promise.all(
        uniqueUserIds.map(async uid => {
          try {
            const db = getFirestore();
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
    fetchIssues();
  }, []);

  // Open modal for resolving issue
  const handleResolve = (taskId, issueId) => {
    const issue = issues.find(i => i.id === issueId && i.taskId === taskId);
    setResolvingIssue(issue);
    setResolveNotes("");
    setResolveLinks([{ url: '', label: '' }]);
    setResolveError("");
  };

  // Submit resolve modal
  const handleSubmitResolve = async () => {
    if (!resolvingIssue) return;
    setResolveUploading(true);
    setResolveError("");
    try {
      const db = getFirestore();
      const issueRef = doc(db, "tasks", resolvingIssue.taskId, "issues", resolvingIssue.id);
      let uploadedFiles = [];
      // Upload files to Firebase Storage if any
      // Collect valid links (non-empty URLs)
      const validLinks = resolveLinks.filter(f => f.url && f.url.trim());
      // Update issue
      await updateDoc(issueRef, {
        status: "closed",
        resolvedAt: new Date().toISOString(),
        resolvedBy: {
          uid: user?.uid || "unknown",
          displayName: user?.displayName || user?.email || user?.uid || "Unknown User"
        },
        resolveNotes: resolveNotes || "",
        resolveLinks: validLinks,
      });
      // Add comment to parent task
      const taskRef = doc(db, "tasks", resolvingIssue.taskId);
      const commentText = `Issue resolved${resolveNotes ? ": " + resolveNotes : ""}`;
      // Add comment
      const { addTaskComment, addTaskLog } = await import("../taskLogs");
      await addTaskComment(resolvingIssue.taskId, {
        user: {
          uid: user?.uid || "unknown",
          displayName: user?.displayName || user?.email || user?.uid || "Unknown User"
        },
        message: resolveNotes || "",
        timestamp: new Date().toISOString(),
        type: "issue_resolved",
        files: uploadedFiles,
      });
      // Add history entry
      await addTaskLog(resolvingIssue.taskId, {
        type: "issue_resolved",
        user: {
          uid: user?.uid || "unknown",
          displayName: user?.displayName || user?.email || user?.uid || "Unknown User"
        },
        timestamp: new Date().toISOString(),
        files: uploadedFiles,
        description: "Issue resolved"
      });
      // Remove from open issues list
      setIssues(prev => prev.filter(issue => issue.id !== resolvingIssue.id || issue.taskId !== resolvingIssue.taskId));
      setResolvingIssue(null);
      setResolveNotes("");
      setResolveLinks([{ url: '', label: '' }]);
      setShowSuccessBanner(true);
    } catch (e) {
      setResolveError(e.message || "Failed to resolve issue.");
    }
    setResolveUploading(false);
  };

  // Cancel resolve modal
  const handleCancelResolve = () => {
    setResolvingIssue(null);
    setResolveNotes("");
    setResolveLinks([{ url: '', label: '' }]);
    setResolveError("");
  };

  if (loading) return <div style={{ padding: 32, alignItems: 'center' }}>Loading issues...</div>;

  return (
    <>
      <FloatingBanner
        type="success"
        visible={showSuccessBanner}
        message="Issue resolved successfully!"
        onClose={() => setShowSuccessBanner(false)}
        autoHideDuration={4000}
      />
      <div
      style={{
        marginLeft: '68px',
        padding: '20px 48px',
        height: '90vh',
        minHeight: 400,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'stretch',
      }}
    >
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 20 }}><FiAlertCircle style={{ color: '#b82e2e', marginRight: 8 }} /> Active Issues</h2>
      {issues.length === 0 ? (
        <div style={{ color: '#888', fontSize: 16 }}>No active issues found.</div>
      ) : (
        <div
          style={{
            flex: 1,
            borderRadius: 16,
            boxShadow: '0 2px 16px rgba(80,120,200,0.07)',
            background: 'var(--bg-card)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 300,
          }}
        >
          {/* Custom Scrollbar Styles */}
          <style>{`
            .issue-table-scroll::-webkit-scrollbar {
              width: 10px;
            }
            .issue-table-scroll::-webkit-scrollbar-thumb {
              background: var(--scrollbar-thumb, #c1c8d1);
              border-radius: 8px;
            }
            .issue-table-scroll::-webkit-scrollbar-track {
              background: var(--scrollbar-track, transparent);
            }
            .issue-table-scroll {
              scrollbar-width: thin;
              scrollbar-color: var(--scrollbar-thumb, #c1c8d1) var(--scrollbar-track, transparent);
            }
            .issue-row:hover {
              background: rgba(59, 130, 246, 0.08) !important;
              cursor: pointer;
            }
          `}</style>
          <div className="issue-table-scroll" style={{flex: 1, overflowY: 'auto', height: '100%'}}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card)', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{width: '14%'}}/>
                <col style={{width: '38%'}}/>
                <col style={{width: '15%'}}/>
                <col style={{width: '18%'}}/>
                <col style={{width: '15%'}}/>
              </colgroup>
              <thead>
                <tr style={{ background: 'var(--table-header-bg)' }}>
                  <th style={{ width: '14%', padding: '12px 10px', fontWeight: 600, fontSize: 15, textAlign: 'left' }}>Task</th>
                  <th style={{ width: '38%', padding: '12px 10px', fontWeight: 600, fontSize: 15, textAlign: 'left' }}>Description</th>
                  <th style={{ width: '15%', padding: '12px 10px', fontWeight: 600, fontSize: 15, textAlign: 'left' }}>Reported By</th>
                  <th style={{ width: '18%', padding: '12px 10px', fontWeight: 600, fontSize: 15, textAlign: 'left' }}>Created At</th>
                  <th style={{ width: '15%', padding: '12px 10px', fontWeight: 600, fontSize: 15, textAlign: 'left' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {issues.map(issue => (
                  <tr
                    key={issue.id + issue.taskId}
                    className="issue-row"
                    style={{
                      borderBottom: '1px solid #f1c4c4',
                      transition: 'background 0.18s',
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedTaskId(issue.taskId)}
                  >
                    <td style={{ width: '14%', padding: '10px 8px', fontWeight: 600, color: '#3b82f6', wordBreak: 'break-word', whiteSpace: 'pre-line', textAlign: 'left' }}>
                      {tasksMap[issue.taskId]?.propertyName || issue.taskId}
                    </td>
                    <td style={{ width: '38%', padding: '10px 8px', color: 'var(--text-main)', fontWeight: 500, wordBreak: 'break-word', whiteSpace: 'pre-line', textAlign: 'left' }}>{issue.description}</td>
                    <td style={{ width: '15%', padding: '10px 8px', wordBreak: 'break-word', whiteSpace: 'pre-line', textAlign: 'left' }}>
                      {usersMap[issue.createdBy]?.displayName || usersMap[issue.createdBy]?.email || issue.createdBy}
                    </td>
                    <td style={{ width: '18%', padding: '10px 8px', wordBreak: 'break-word', whiteSpace: 'pre-line', textAlign: 'left' }}>{issue.createdAt ? new Date(issue.createdAt).toLocaleString() : "-"}</td>
                    <td style={{ width: '15%', padding: '10px 8px', textAlign: 'left' }}>
                      <button
                        style={{
                          background: '#1d5413',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 6,
                          padding: '6px 16px',
                          fontWeight: 600,
                          fontSize: 14,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                        onClick={e => { e.stopPropagation(); handleResolve(issue.taskId, issue.id); }}
                      >
                        <FiCheckCircle size={16} style={{ marginRight: 2}} /> Resolve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Modal for resolving issue */}
      {resolvingIssue && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.35)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) handleCancelResolve(); }}
        >
          <div
            style={{
              background: 'var(--bg-card, #fff)',
              color: 'var(--text-main, #223)',
              borderRadius: 14,
              maxWidth: 420,
              width: '100%',
              minWidth: 0,
              margin: '40px 16px 0 16px',
              overflow: 'auto',
              position: 'relative',
              padding: '28px 20px 24px 20px',
              boxShadow: '0 4px 32px rgba(40,60,120,0.22)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              maxHeight: 'calc(100vh - 80px)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{marginBottom: 8}}>Resolve Issue</h3>
            <div style={{fontSize:15, marginBottom:6}}>You may add notes and/or upload files to attach to this resolution (optional).</div>
            <textarea
              style={{
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                minHeight: 70,
                borderRadius: 8,
                border: '1.5px solid var(--input-border, #b8c6e6)',
                background: 'var(--bg-main, #fff)',
                color: 'var(--text-main, #223)',
                padding: '10px 12px',
                fontSize: 15,
                marginBottom: 10,
                boxSizing: 'border-box',
                resize: 'vertical',
                overflowWrap: 'break-word',
              }}
              placeholder="Resolution notes (optional)"
              value={resolveNotes}
              onChange={e => setResolveNotes(e.target.value)}
              disabled={resolveUploading}
            />
            <label style={{ fontWeight: 500, color: 'var(--label-text, #6b7a90)', fontSize: 15, marginBottom: 6 }}>Attach Links:</label>
            {resolveLinks.map((file, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <input
                  type="text"
                  placeholder="Label (optional)"
                  value={file.label || ''}
                  onChange={e => {
                    const newLinks = [...resolveLinks];
                    newLinks[idx] = { ...newLinks[idx], label: e.target.value };
                    setResolveLinks(newLinks);
                  }}
                  style={{ padding: '8px 10px', borderRadius: 7, border: '1.5px solid var(--input-border, #b8c6e6)', fontSize: 15, width: 130 }}
                />
                <input
                  type="url"
                  placeholder="Paste file URL (Dropbox, Google Drive, etc)"
                  value={file.url || ''}
                  onChange={e => {
                    const newLinks = [...resolveLinks];
                    newLinks[idx] = { ...newLinks[idx], url: e.target.value };
                    setResolveLinks(newLinks);
                  }}
                  style={{ padding: '8px 12px', borderRadius: 7, border: '1.5px solid var(--input-border, #b8c6e6)', fontSize: 15, flex: 1 }}
                  autoFocus={idx === 0}
                />
                {resolveLinks.length > 1 && (
                  <button type="button" onClick={() => setResolveLinks(resolveLinks.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', color: '#c00', cursor: 'pointer', fontSize: 18 }} title="Remove">✕</button>
                )}
                {idx === resolveLinks.length - 1 && (
                  <button type="button" onClick={() => setResolveLinks([...resolveLinks, { url: '', label: '' }])} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 18 }} title="Add Link">＋</button>
                )}
              </div>
            ))}
            {resolveError && <div style={{ color: '#b82e2e', fontSize: 14, marginBottom: 6 }}>{resolveError}</div>}
            <div style={{ display: 'flex', gap: 12, marginTop: 10, justifyContent: 'flex-end' }}>
              <button
                style={{
                  background: 'var(--sidebar-bg, #e7eaf1)',
                  color: 'var(--text-main, #335)',
                  border: '1.5px solid var(--sidebar-border, #ccd4e2)',
                  borderRadius: 7,
                  padding: '8px 20px',
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: 'pointer',
                }}
                onClick={handleCancelResolve}
                disabled={resolveUploading}
              >Cancel</button>
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
                  boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                  opacity: resolveUploading ? 0.7 : 1,
                }}
                onClick={handleSubmitResolve}
                disabled={resolveUploading}
              >{resolveUploading ? 'Submitting...' : 'Submit & Resolve'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for DetailedTaskView */}
  {selectedTaskId && (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.35)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={e => {
        // Only close if clicking on the overlay, not the modal content
        if (e.target === e.currentTarget) setSelectedTaskId(null);
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 14,
          maxWidth: 1200,
          width: '100%',
          marginTop: 20,
          overflowY: 'auto',
          position: 'relative',
          padding: 24,
        }}
      >
        <DetailedTaskView taskId={selectedTaskId} role={role} users={Object.values(usersMap)} />
      </div>
    </div>
  )}
    </div>
    </>
  );
};

export default IssueManagementView;
