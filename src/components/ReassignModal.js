import React from 'react';
import ReactDOM from 'react-dom';

/**
 * Props:
 * - open (bool): whether modal is open
 * - onClose (func): close handler
 * - multiEditorAssignments (array): assignments state
 * - users (array): list of users
 * - handleEditorChange (func): change editor handler
 * - handleLabelChange (func): change label handler
 * - handleCustomLabelChange (func): change custom label handler
 * - addEditorAssignment (func): add assignment row
 * - removeEditorAssignment (func): remove assignment row
 * - assignmentModalError (string): error message
 * - originalAssignments (string): JSON string of original assignments
 * - iconBtn (object): style object for buttons
 * - handleMultiEditorAssign (func): confirm handler
 */
export default function ReassignModal({
  open,
  onClose,
  multiEditorAssignments = [],
  users = [],
  handleEditorChange,
  handleLabelChange,
  handleCustomLabelChange,
  addEditorAssignment,
  removeEditorAssignment,
  assignmentModalError,
  originalAssignments,
  iconBtn,
  handleMultiEditorAssign,
  photographer,
  setPhotographer,
  originalPhotographer,
  inline = false,
  hideActions = false,
  embeddedStyle = false
}) {
  // Helper: normalize assignments for robust equality (filter blanks, normalize labels, sort)
  function normalizeAssignmentsForCompare(arr) {
    const list = Array.isArray(arr) ? arr : [];
    const normalized = list
      .filter(a => a && a.editorId)
      .map(a => {
        const rawLabel = (a.label || '').trim();
        const label = rawLabel && rawLabel.length > 0 ? rawLabel : 'Exterior';
        const customLabel = label === 'Custom' ? (a.customLabel || '').trim() : '';
        return { editorId: a.editorId, label, customLabel };
      });
    normalized.sort((a, b) => {
      if (String(a.editorId) !== String(b.editorId)) return String(a.editorId).localeCompare(String(b.editorId));
      if (a.label !== b.label) return a.label.localeCompare(b.label);
      return a.customLabel.localeCompare(b.customLabel);
    });
    return normalized;
  }

  // Memoized deep equality for stability
  const noChange = React.useMemo(() => {
    const current = normalizeAssignmentsForCompare(multiEditorAssignments);
    let prev = [];
    try {
      const parsed = JSON.parse(originalAssignments);
      prev = normalizeAssignmentsForCompare(parsed);
    } catch (e) { prev = []; }
    const editorNoChange = JSON.stringify(current) === JSON.stringify(prev);
    const photographerNoChange = photographer === originalPhotographer;
    return editorNoChange && photographerNoChange;
  }, [multiEditorAssignments, originalAssignments, photographer, originalPhotographer]);

  // Guard: must have data ready
  if ((!open && !inline) || !multiEditorAssignments || multiEditorAssignments.length === 0) return null;

  const card = (
      <div
        style={{
          background: embeddedStyle ? 'transparent' : 'var(--bg-card)',
          color: 'var(--text-main)',
          border: embeddedStyle ? 'none' : '1.5px solid var(--button-border)',
          borderRadius: embeddedStyle ? 0 : 10,
          padding: embeddedStyle ? 0 : 24,
          maxWidth: inline ? '100%' : 480,
          width: inline ? '100%' : '94vw',
          boxShadow: embeddedStyle ? 'none' : '0 4px 24px rgba(80,120,200,0.12)',
          zIndex: 1100,
          position: 'relative',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Photographer Assignment Section (moved above editors) */}
        <div style={{ marginBottom: 15 }}>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>Assign Photographer</div>
          <select
            value={photographer || ''}
            onChange={e => setPhotographer(e.target.value)}
            style={{ width: '100%', minWidth: 120, padding: '8px 8px', borderRadius: 6, border: '1.5px solid var(--sidebar-border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: 15, marginBottom: 15 }}
          >
            <option value=''>Unassigned</option>
            {users
              .filter(u => (u.displayName || u.email || u.uid || u.id))
              .filter(u => Array.isArray(u.roles) ? u.roles.includes('photographer') : u.role === 'photographer')
              .map(u => (
              <option key={u.uid || u.id} value={u.uid || u.id}>{u.displayName || u.email || u.uid || u.id}</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 20, fontWeight: 600, fontSize: 17 }}>Assign Editors</div>
        {multiEditorAssignments.map((assignment, idx) => {
          // Remove already-selected editors from other dropdowns
          const assignedIds = multiEditorAssignments.map((a, i) => i !== idx ? a.editorId : null).filter(Boolean);
          const availableEditors = users
            .filter(u => (u.displayName || u.email || u.uid || u.id))
            .filter(u => Array.isArray(u.roles) ? u.roles.includes('editor') : u.role === 'editor')
            .filter(u => !assignedIds.includes(u.uid || u.id));
          // Unassigned logic: only show Unassigned if idx === 0 and NOT already assigned
          /* eslint-disable no-unused-vars */
          const firstIsAssigned = multiEditorAssignments[0] && multiEditorAssignments[0].editorId;
          return (
            <div key={idx} style={{ width: '100%', marginBottom: 30 }}>
              <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <select
                  value={assignment.editorId}
                  onChange={e => {
                    handleEditorChange(idx, e.target.value);
                    if (e.target.value === "") handleLabelChange(idx, "");
                  }}
                  style={{ width: (multiEditorAssignments.length === 1 && idx === 0 && assignment.editorId === '') ? '100%' : '55%', minWidth: 120, padding: '8px 8px', borderRadius: 6, border: '1.5px solid var(--sidebar-border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: 15, flexShrink: 0 }}
                >
                  {multiEditorAssignments.length === 1 && idx === 0 && <option value="">Unassigned</option>}
                  {availableEditors.map(u => (
                    <option key={u.uid || u.id} value={u.uid || u.id}>{u.displayName || u.email || u.uid || u.id}</option>
                  ))}
                </select>
                {(multiEditorAssignments.length > 1 || idx !== 0 || assignment.editorId !== '') && (
                  <select
                    value={assignment.label}
                    onChange={e => handleLabelChange(idx, e.target.value)}
                    style={{ width: '30%', padding: '8px 8px', borderRadius: 6, border: '1.5px solid var(--sidebar-border)', color: 'var(--text-main)', background: 'var(--bg-main)', fontSize: 15, flexShrink: 0 }}
                  >
                    <option value="All">All</option>
                    <option value="Interior">Interior</option>
                    <option value="Exterior">Exterior</option>
                    <option value="Custom">Custom</option>
                  </select>
                )} 
                <div style={{ flex: 1 }} />
                {(multiEditorAssignments.length > 1 || idx !== 0 || assignment.editorId !== '') && (
                  <div style={{ width: '15%', display: 'flex', gap: 2, marginLeft: 12 }}>
                    {multiEditorAssignments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeEditorAssignment(idx)}
                        style={{ background: 'none', border: 'none', color: '#c00', cursor: 'pointer', fontSize: 18, width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Remove"
                      >✕</button>
                    )}
                    {idx === multiEditorAssignments.length - 1 && (
                      <button
                        type="button"
                        onClick={addEditorAssignment}
                        style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 18, width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Add Editor"
                      >＋</button>
                    )}
                  </div>
                )}
              </div>
              {assignment.label === 'Custom' && (
                <input
                  type="text"
                  value={assignment.customLabel || ''}
                  onChange={e => handleCustomLabelChange(idx, e.target.value)}
                  placeholder="Enter label"
                  style={{
                    marginTop: 5,
                    width: '85%',
                    padding: '8px 8px',
                    borderRadius: 6,
                    border: '1.5px solid var(--input-border, #b8c6e6)',
                    fontSize: 15,
                    boxSizing: 'border-box',
                    flexShrink: 0
                  }}
                  required
                />
              )}
            </div>
          );
        })}

        {(!hideActions && noChange) && (
          <div style={{ color: '#e38e4d', background: 'rgba(255,184,117,0.14)', borderRadius: 6, padding: '6px 12px', marginBottom: 8, fontSize: 14, textAlign: 'center' }}>
            No change to assignment.
          </div>
        )}
         {/* Validation error message */}
         {!hideActions && assignmentModalError && (
           <div style={{ color: '#e74c3c', marginBottom: 8 }}>{assignmentModalError}</div>
         )}
         {!hideActions && (
           <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 25 }}>
             <button style={{ ...iconBtn, background: 'var(--sidebar-bg)', color: 'var(--text-main)', fontWeight: 600, padding: '7px 18px', border: '1.5px solid var(--sidebar-border)' }} onClick={onClose}>Cancel</button>
            <button
              style={{ ...iconBtn, background: '#3b82f6', color: '#fff', fontWeight: 600, padding: '7px 18px' }}
              onClick={handleMultiEditorAssign}
              disabled={noChange}
            >
              Confirm
            </button>
           </div>
         )}
      </div>
  );

  if (inline) {
    return card;
  }

  const overlay = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.32)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-modal="true"
      role="dialog"
    >
      {card}
    </div>
  );
  return typeof document !== 'undefined' ? ReactDOM.createPortal(overlay, document.body) : overlay;
}
