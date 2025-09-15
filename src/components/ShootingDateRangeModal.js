import React from "react";
import { DateRange } from "react-date-range";
import { enUS } from "date-fns/locale";
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";
import { FiX } from "react-icons/fi";
import "../styles/dateRangeVars.css";

export default function ShootingDateRangeModal({
  open,
  onClose,
  onSave,
  onClear,
  value,
  loading,
  error,
  success,
  onChange
}) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0,0,0,0.32)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-modal="true"
      role="dialog"
    >
      <div
        style={{
          background: "var(--bg-card, #181e29)",
          borderRadius: 18,
          boxShadow: "0 4px 32px rgba(60,80,130,0.13)",
          padding: 32,
          minWidth: 340,
          maxWidth: "90vw",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          position: "relative",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ marginBottom: 18, fontWeight: 600, fontSize: 18, color: "var(--text-main)" }}>
          Select Shooting Date Range
        </div>
        <DateRange
          months={1}
          direction="horizontal"
          locale={enUS}
          editableDateInputs={true}
          onChange={item => {
            // item.selection is the { startDate, endDate, key } object
            // Convert to { start, end }
            if (onChange) {
              onChange({
                start: item.selection.startDate.toISOString(),
                end: item.selection.endDate.toISOString(),
              });
            }
          }}
          moveRangeOnFirstSelection={false}
          ranges={[
            value && value.start && value.end
              ? {
                  startDate: new Date(value.start),
                  endDate: new Date(value.end),
                  key: "selection",
                }
              : {
                  startDate: new Date(),
                  endDate: new Date(),
                  key: "selection",
                }
          ]}
          minDate={new Date('2025-07-19T00:00:00-05:00')}
          maxDate={new Date('2026-07-19T00:00:00-05:00')}
          showDateDisplay={false}
          style={{
            borderRadius: 14,
            boxShadow: "0 2px 16px rgba(60,80,130,0.08)",
            background: "var(--bg-card, #fff)",
            color: "var(--text-main)",
            fontSize: 16,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
          <button
            style={{ padding: "7px 18px", borderRadius: 7, background: "#3b82f6", color: "#fff", border: "none", fontWeight: 600, fontSize: 15, cursor: "pointer" }}
            onClick={onSave}
            disabled={loading}
          >
            {loading ? "Saving..." : "Save"}
          </button>
          <button
            style={{ padding: "7px 18px", borderRadius: 7, background: "var(--sidebar-bg)", color: "var(--text-main)", border: "none", fontWeight: 600, fontSize: 15, cursor: "pointer" }}
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          {(value && value.startDate) && (
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear date"
              style={{ background: "none", border: "none", color: "#c00", cursor: "pointer", fontSize: 18, marginLeft: 8, padding: 0, lineHeight: 1 }}
              title="Clear date"
            >
              <FiX />
            </button>
          )}
        </div>
        {success && (
          <div style={{ color: "#22c55e", fontWeight: 500, fontSize: 15, marginTop: 10 }}>{success}</div>
        )}
        {error && (
          <div style={{ color: "#e74c3c", fontWeight: 500, fontSize: 15, marginTop: 10 }}>{error}</div>
        )}
      </div>
    </div>
  );
}
