import React from "react";
import { FiLogOut } from "react-icons/fi";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";

const AccessDeniedPage = () => (
  <div style={{
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-main)',
    color: 'var(--text-main)',
    flexDirection: 'column',
    fontSize: 22,
    fontWeight: 500,
    textAlign: 'center',
    padding: 32
  }}>
    <div style={{
      background: 'var(--bg-card)',
      boxShadow: '0 2px 16px rgba(80,120,200,0.07)',
      borderRadius: 18,
      padding: '48px 32px',
      maxWidth: 420,
      width: '100%'
    }}>
      Access <b>Denied</b>.<br />
      You do not have permission to view this content.<br />
      <button
        onClick={() => signOut(auth)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '32px auto 0 auto',
          background: 'none',
          border: 'none',
          color: '#b82e2e',
          cursor: 'pointer',
          fontSize: 18,
          borderRadius: 8,
          padding: '10px 18px',
          transition: 'background 0.18s',
        }}
        aria-label="Log out"
        title="Log out"
      >
        <FiLogOut size={26} style={{ marginRight: 10 }} /> Log out
      </button>
    </div>
  </div>
);

export default AccessDeniedPage;
