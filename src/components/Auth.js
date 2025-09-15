import React, { useEffect, useState } from "react";
import { auth, googleProvider } from "../firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { useAuth } from "../context/AuthContext";


const Auth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isHover, setIsHover] = useState(false);
  const { role, roleLoading } = useAuth();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    setError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      setError(error.message);
    }
  };

  const handleSignOut = async () => {
    setError("");
    try {
      await signOut(auth);
    } catch (error) {
      setError(error.message);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", width: "100vw", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)" }}>
        <div className="spinner" aria-label="Loading..." style={{ fontSize: 32 }}>
          <span role="img" aria-label="hourglass">⏳</span>
        </div>
      </div>
    );
  }

  if (!user) {
        const googleGrayIcon = (
      <svg width="20" height="20" viewBox="0 0 48 48" style={{ verticalAlign: "middle", marginRight: 10 }}>
        <g>
          <path fill="#888" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.3-5.7 7.5-11.3 7.5-6.6 0-12-5.4-12-12s5.4-12 12-12c2.8 0 5.4 1 7.5 2.7l6.1-6.1C34.1 5.1 29.3 3 24 3 12.9 3 4 11.9 4 23s8.9 20 20 20c11 0 19.8-8 19.8-20 0-1.3-.1-2.5-.2-3.5z"/>
        </g>
      </svg>
    );
    return (
      <div style={{
        minHeight: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#49668a",
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: 0,
      }}>
        <img
          src={require("../assets/ortools_logo.png")}
          alt="Media Tracker Logo"
          style={{
            marginBottom: 15,
            width: "min(420px, 80vw)",
            maxWidth: 540,
            display: "block",
            borderRadius: 18,
            marginTop: 32,
          }}
        />
        <h1 style={{
          color: "#1a2440",
          fontWeight: 800,
          letterSpacing: 0.5,
          fontSize: 38,
          marginBottom: 8,
          textAlign: "center",
          textShadow: "0 2px 12px rgba(80,120,200,0.10)",
        }}>
          Media Tracker
        </h1>
        <div style={{ color: '#fff', fontSize: 20, marginBottom: 40, textAlign: 'center', fontWeight: 500 }}>
          Sign in to access your workflow dashboard
        </div>
        <button
          onClick={handleSignIn}
          style={{
            padding: "18px 0",
            width: "min(340px, 90vw)",
            fontSize: "1.18rem",
            background: isHover ? "#243b57" : "#a8c7ed",
            color: isHover ? "#fff" : "#1a2440",
            border: "2.5px solid #243b57",
            borderRadius: 12,
            cursor: "pointer",
            fontWeight: 700,
            fontFamily: 'Inter, system-ui, sans-serif',
            boxShadow: isHover ? "0 4px 24px rgba(80,120,200,0.10)" : "0 2px 8px rgba(80,120,200,0.06)",
            transition: "background 0.18s, color 0.18s, box-shadow 0.18s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto",
            outline: isHover ? "2px solid #b5c7e6" : "none",
            marginBottom: 12,
          }}
          onMouseEnter={() => setIsHover(true)}
          onMouseLeave={() => setIsHover(false)}
          tabIndex={0}
          aria-label="Sign in with Google"
        >
          {googleGrayIcon}
          <span style={{ fontWeight: 500, fontSize: 19 }}>Sign in with Google</span>
        </button>
        {error && <div style={{ color: "#d32f2f", marginTop: 18, fontWeight: 600, fontSize: 16, textAlign: 'center', maxWidth: 360 }}>{error}</div>}
      </div>
    );
  }

  // If user is pending approval
  if (role === "pending" && !roleLoading) {
    return (
      <div style={{ minHeight: "100vh", width: "100vw", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)" }}>
        <div style={{ background: "#fff", padding: 48, borderRadius: 18, boxShadow: "0 8px 40px rgba(80,120,200,0.15)", textAlign: "center", minWidth: 340, maxWidth: 360 }}>
          <img src={user.photoURL} alt="profile" style={{ borderRadius: "50%", width: 68, height: 68, marginBottom: 18, border: "2.5px solid #eee" }} />
          <h2 style={{ margin: "0 0 8px 0", color: "#333", fontWeight: 600 }}>{user.displayName}</h2>
          <div style={{ color: "#888", fontSize: 15, marginBottom: 18 }}>{user.email}</div>
          <div style={{ color: "#f39c12", background: "#fff8e1", borderRadius: 6, padding: "14px 8px", fontWeight: 500, fontSize: 16, marginBottom: 18 }}>
            Your account is pending approval.<br />
            Please contact your administrator.
          </div>
          <button onClick={handleSignOut} style={{ padding: "10px 20px", fontSize: "1rem", background: "#e0e0e0", color: "#333", border: "none", borderRadius: 6, cursor: "pointer" }}>
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", width: "100vw", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-main)" }}>
      <div style={{ background: "var(--bg-card)", color: "var(--text-main)", padding: 48, borderRadius: 18, boxShadow: "0 2px 16px rgba(80,120,200,0.07)", minWidth: 340, maxWidth: 360 }}>
        <img src={user.photoURL} alt="profile" style={{ borderRadius: "50%", width: 68, height: 68, marginBottom: 18, border: "2.5px solid var(--bg-card)" }} />
        <h2 style={{ margin: "0 0 8px 0", color: "var(--text-main)", fontWeight: 600 }}>{user.displayName}</h2>
        <div style={{ color: "#888", fontSize: 15, marginBottom: 18 }}>{user.email}</div>
        <button onClick={handleSignOut} style={{ padding: "10px 20px", fontSize: "1rem", background: "var(--bg-card)", color: "var(--text-main)", border: "none", borderRadius: 6, cursor: "pointer" }}>
          Sign Out
        </button>
        {error && <div style={{ color: "#d32f2f", marginTop: 18, fontWeight: 500 }}>{error}</div>}
      </div>
    </div>
  );
};

export default Auth;
