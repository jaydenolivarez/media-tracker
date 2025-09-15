import React from 'react';
import { FiX } from 'react-icons/fi';

/**
 * Props:
 * - open (bool): whether modal is open
 * - onClose (func): close handler
 * - reportIssueText (string): textarea value
 * - setReportIssueText (func): change handler
 * - onSubmit (func): submit handler
 * - submitting (bool): whether submit is in progress
 * - errorBanner (string): error message
 */
export default function ReportIssueModal({
  open,
  onClose,
  reportIssueText,
  setReportIssueText,
  onSubmit,
  submitting,
  errorBanner
}) {
  if (!open) return null;
  return (
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
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          color: 'var(--text-main)',
          border: '1.5px solid var(--button-border)',
          borderRadius: 10,
          padding: 24,
          maxWidth: 420,
          width: '94vw',
          boxShadow: '0 4px 24px rgba(80,120,200,0.12)',
          zIndex: 1100,
          position: 'relative',
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer' }}
          title="Close"
        >
          <FiX />
        </button>
        <div style={{ marginBottom: 16, fontWeight: 600, fontSize: 17 }}>Report Issue</div>
        <textarea
          value={reportIssueText}
          onChange={e => setReportIssueText(e.target.value)}
          rows={5}
          placeholder="Describe the issue..."
          style={{
            width: '100%',
            padding: 12,
            borderRadius: 8,
            border: '1.5px solid var(--input-border, #b8c6e6)',
            fontSize: 15,
            marginBottom: 12,
            background: 'var(--bg-main)',
            color: 'var(--text-main)',
            boxSizing: 'border-box',
            resize: 'vertical'
          }}
          disabled={submitting}
        />
        {errorBanner && <div style={{ color: '#e74c3c', marginBottom: 10 }}>{errorBanner}</div>}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            style={{ padding: '7px 18px', borderRadius: 6, border: '1.5px solid var(--sidebar-border)', background: 'var(--sidebar-bg)', color: 'var(--text-main)', fontWeight: 600 }}
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            style={{ padding: '7px 18px', borderRadius: 6, background: '#e74c3c', color: '#fff', fontWeight: 600, border: 'none', opacity: submitting || !reportIssueText.trim() ? 0.7 : 1 }}
            onClick={onSubmit}
            disabled={submitting || !reportIssueText.trim()}
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
