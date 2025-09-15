import React from "react";
import { groupActiveCodesByType, todayYmdCentral } from "../utils/securityCodes";

export default function InfoModal({ open, onClose, codes, propertyName, updatedAtISO, address }) {
  if (!open) return null;
  const asOf = updatedAtISO && typeof updatedAtISO === 'string' && !isNaN(Date.parse(updatedAtISO))
    ? new Date(updatedAtISO)
    : new Date();
  const asOfYmdCentral = todayYmdCentral(asOf);
  const grouped = groupActiveCodesByType(codes, asOfYmdCentral, asOf);

  const fmtOrdinal = (n) => {
    const sfx = (n % 10 === 1 && n % 100 !== 11) ? 'st'
      : (n % 10 === 2 && n % 100 !== 12) ? 'nd'
      : (n % 10 === 3 && n % 100 !== 13) ? 'rd'
      : 'th';
    return `${n}${sfx}`;
  };
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const niceDate = `${monthNames[asOf.getMonth()]} ${fmtOrdinal(asOf.getDate())}`;
  const hasAny = Object.keys(grouped).length > 0;
  const mapsUrl = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;

  const Overlay = ({ children }) => (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose && onClose();
      }}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "calc(100vw - 68px)",
        height: "100vh",
        background: "rgba(0,0,0,0.24)",
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-card)",
          color: "var(--text-main)",
          borderRadius: 12,
          padding: 24,
          minWidth: 360,
          maxWidth: 540,
          boxShadow: "0 2px 16px rgba(0,0,0,0.18)",
        }}
      >
        {children}
      </div>
    </div>
  );

  const Header = () => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Security Codes</div>
        <div style={{ fontSize: 13, color: "#90a4c5", marginBottom: 10 }}>
          {propertyName || "Property"} • Active as of {niceDate}
        </div>
      </div>
      <button
        onClick={onClose}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--button-text)",
          cursor: "pointer",
          fontSize: 16,
          padding: 6,
          borderRadius: 8
        }}
        aria-label="Close"
      >
        ✕
      </button>
    </div>
  );

  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, color: "#6b7a90", fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div>{children}</div>
    </div>
  );

  return (
    <Overlay>
      <Header />
      {!hasAny ? (
        <div style={{ fontSize: 16, color: "var(--text-main)" }}>No active codes for today.</div>
      ) : (
        Object.entries(grouped).map(([type, list]) => (
          <Section key={type} title={type}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {list.map((c, idx) => (
                <div key={idx} style={{
                  background: "var(--button-bg)",
                  border: "1px solid var(--button-border)",
                  color: "var(--button-text)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 600 }}>{c.code}</span>
                  <span style={{ fontSize: 12, color: '#90a4c5' }}>
                    {(c.startDate || '—')} – {(c.endDate || '—')}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        ))
      )}
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, marginTop: 30 }}>Address</div>
      </div>
      <div style={{ marginBottom: 22, fontSize: 16, marginTop: 10 }}>
        {address ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#3b82f6', textDecoration: 'underline', cursor: 'pointer' }}
          >
            {address}
          </a>
        ) : (
          "Address not available."
        )}
      </div>
    </Overlay>
  );
}
