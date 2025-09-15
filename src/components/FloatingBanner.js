import React, { useEffect, useRef, useState } from "react";
import { FiCheckCircle } from "react-icons/fi";

/**
 * FloatingBanner
 * Props:
 * - message: string (required)
 * - visible: boolean (required)
 * - type: "success" | "error" | "info" (default: "success")
 * - process: string (optional, for custom message)
 * - onClose: function (optional, for manual dismiss)
 * - autoHideDuration: number (ms, optional, default 4000)
 * - fade: boolean (default true)
 */
export default function FloatingBanner({ message, visible, type = "success", process, onClose, autoHideDuration = 4000, fade = true }) {
  const [show, setShow] = useState(visible);
  const [opacity, setOpacity] = useState(visible ? 1 : 0);
  const timerRef = useRef();
  const fadeTimerRef = useRef();

  useEffect(() => {
    if (visible) {
      setShow(true);
      setOpacity(1);
      // Start auto-hide timer
      if (autoHideDuration > 0) {
        timerRef.current = setTimeout(() => {
          if (fade) {
            setOpacity(0);
            fadeTimerRef.current = setTimeout(() => {
              setShow(false);
              if (onClose) onClose();
            }, 400); // 400ms fade duration
          } else {
            setShow(false);
            if (onClose) onClose();
          }
        }, autoHideDuration);
      }
    } else {
      setOpacity(0);
      setTimeout(() => setShow(false), 400);
    }
    return () => {
      clearTimeout(timerRef.current);
      clearTimeout(fadeTimerRef.current);
    };
  }, [visible, autoHideDuration, fade, onClose]);

  if (!show) return null;

  const colors = {
    success: {
      background: "#4a944e",
      border: "2px solid #0e300f",
      color: "#0e2e10"
    },
    error: {
      background: "#ffeaea",
      border: "2px solid #ef4444",
      color: "#991b1b"
    },
    info: {
      background: "#e0f2fe",
      border: "2px solid #38bdf8",
      color: "#0369a1"
    }
  };

  const style = {
    position: "fixed",
    top: 24,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 99999999,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minWidth: 320,
    maxWidth: 480,
    padding: "14px 32px 14px 24px",
    borderRadius: 10,
    boxShadow: "0 4px 24px rgba(34,197,94,0.10)",
    fontWeight: 600,
    fontSize: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    opacity,
    transition: fade ? "opacity 0.4s" : undefined,
    pointerEvents: opacity === 0 ? "none" : undefined,
    ...colors[type]
  };

  return (
    <div style={style}>
      {type === 'success' && (
        <FiCheckCircle size={24} color={colors.success.color} style={{ flexShrink: 0 }} />
      )}
      <span>
        {process ? `${process} was successful!` : message}
      </span>
      {onClose && (
        <button
          onClick={() => {
            setOpacity(0);
            setTimeout(() => {
              setShow(false);
              if (onClose) onClose();
            }, 400);
          }}
          style={{
            marginLeft: 12,
            background: "none",
            border: "none",
            color: colors[type].color,
            fontSize: 20,
            cursor: "pointer"
          }}
          title="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}
