// UploadProgressPopup.js
import React from 'react';
import { useUploadManager } from '../context/UploadManagerContext';

const popupStyle = {
  position: 'fixed',
  right: 24,
  bottom: 24,
  zIndex: 9999,
  minWidth: 320,
  maxWidth: 400,
  background: 'var(--bg-card, #222)',
  color: 'var(--text-main, #fff)',
  borderRadius: 12,
  boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
  padding: 20,
  fontSize: 15,
};
const barOuter = {
  width: '100%',
  height: 8,
  background: 'rgba(255,255,255,0.10)',
  borderRadius: 4,
  margin: '8px 0',
};
const barInner = percent => ({
  width: percent + '%',
  height: '100%',
  background: 'linear-gradient(90deg, #4fc3f7, #1976d2)',
  borderRadius: 4,
  transition: 'width 0.2s',
});

function UploadProgressPopup() {
  const { uploads, pauseUpload, resumeUpload, cancelUpload, removeUpload } = useUploadManager();
  if (!uploads.length) return null;
  return (
    <div style={popupStyle}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Uploading Files</div>
      {uploads.map(u => (
        <div key={u.id} style={{ marginBottom: 18, background: 'rgba(0,0,0,0.04)', borderRadius: 8, padding: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 500 }}>{u.file.name}</span>
            <span style={{ fontSize: 13, color: '#aaa', marginLeft: 12 }}>{u.status === 'done' ? 'Done' : u.status === 'error' ? 'Error' : Math.round(u.progress) + '%'}</span>
          </div>
          <div style={barOuter}><div style={barInner(u.progress)} /></div>
          {u.status === 'error' && <div style={{ color: '#d32f2f', fontSize: 13, marginTop: 4 }}>{u.error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            {u.status === 'uploading' && !u.control.paused && <button onClick={() => pauseUpload(u.id)} style={btnStyle}>Pause</button>}
            {u.status === 'uploading' && u.control.paused && <button onClick={() => resumeUpload(u.id)} style={btnStyle}>Resume</button>}
            {u.status === 'uploading' && <button onClick={() => cancelUpload(u.id)} style={btnStyle}>Cancel</button>}
            {(u.status === 'done' || u.status === 'error') && <button onClick={() => removeUpload(u.id)} style={btnStyle}>Dismiss</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

const btnStyle = {
  fontSize: 13,
  padding: '5px 12px',
  background: 'var(--bg-btn, #1976d2)',
  color: 'var(--text-main, #fff)',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  boxShadow: '0 1px 2px rgba(0,0,0,0.07)',
  marginRight: 4,
};

export default UploadProgressPopup;
