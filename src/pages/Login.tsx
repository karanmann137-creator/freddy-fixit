import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { supabase, getProfile } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap');

  .ff-wrap {
    min-height: 100vh;
    background: #1a2236;
    background-image: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(234,107,20,0.15) 0%, transparent 70%);
    display: flex; align-items: center; justify-content: center;
    padding: 2rem 1rem;
    font-family: 'DM Sans', sans-serif;
    color: #f0f4ff;
    position: relative; overflow: hidden;
  }
  .ff-wrap::before {
    content: ''; position: absolute; inset: 0;
    background-image:
      repeating-linear-gradient(0deg, transparent, transparent 60px, rgba(255,255,255,0.015) 60px, rgba(255,255,255,0.015) 61px),
      repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(255,255,255,0.015) 60px, rgba(255,255,255,0.015) 61px);
    pointer-events: none;
  }
  .ff-box {
    width: 100%; max-width: 420px; position: relative; z-index: 1;
  }
  .ff-logo {
    display: flex; flex-direction: column; align-items: center; margin-bottom: 2.5rem;
  }
  .ff-logo svg { filter: drop-shadow(0 0 14px rgba(234,107,20,0.5)); margin-bottom: 1rem; }
  .ff-logo-title {
    font-family: 'Bebas Neue', sans-serif; font-size: 2.2rem;
    letter-spacing: 0.1em; color: #f0f4ff; line-height: 1;
  }
  .ff-logo-title span { color: #ea6b14; }
  .ff-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px; padding: 2rem;
  }
  .ff-tabs {
    display: flex; gap: 0; margin-bottom: 2rem;
    background: rgba(255,255,255,0.04); border-radius: 8px; padding: 4px;
  }
  .ff-tab {
    flex: 1; padding: 0.55rem; border: none; background: none;
    font-family: 'DM Sans', sans-serif; font-size: 0.85rem; font-weight: 500;
    color: rgba(190,205,235,0.5); cursor: pointer; border-radius: 6px;
    transition: all 0.2s; letter-spacing: 0.05em;
  }
  .ff-tab.active { background: #ea6b14; color: #fff; box-shadow: 0 2px 12px rgba(234,107,20,0.3); }
  .ff-label {
    display: block; font-size: 0.78rem; text-transform: uppercase;
    letter-spacing: 0.1em; color: rgba(190,205,235,0.6); margin-bottom: 0.5rem;
  }
  .ff-input {
    width: 100%; padding: 0.75rem 1rem;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px; color: #f0f4ff;
    font-family: 'DM Sans', sans-serif; font-size: 0.95rem;
    outline: none; transition: border-color 0.2s, box-shadow 0.2s;
    box-sizing: border-box;
  }
  .ff-input:focus { border-color: rgba(234,107,20,0.5); box-shadow: 0 0 0 3px rgba(234,107,20,0.1); }
  .ff-input::placeholder { color: rgba(190,205,235,0.3); }
  .ff-field { margin-bottom: 1.2rem; }
  .ff-btn {
    width: 100%; padding: 0.85rem; border-radius: 8px;
    font-family: 'DM Sans', sans-serif; font-size: 0.95rem; font-weight: 500;
    cursor: pointer; border: none; transition: all 0.2s;
    display: flex; align-items: center; justify-content: center; gap: 0.5rem;
    background: linear-gradient(135deg, #ea6b14, #f09020); color: #fff;
    letter-spacing: 0.05em; margin-top: 0.5rem;
  }
  .ff-btn:hover { box-shadow: 0 4px 24px rgba(234,107,20,0.4); }
  .ff-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .ff-divider {
    display: flex; align-items: center; gap: 1rem;
    margin: 1.5rem 0; color: rgba(190,205,235,0.3); font-size: 0.8rem;
  }
  .ff-divider::before, .ff-divider::after {
    content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.08);
  }
  .ff-signup-link {
    text-align: center; margin-top: 1.5rem;
    font-size: 0.85rem; color: rgba(190,205,235,0.5);
  }
  .ff-signup-link button {
    background: none; border: none; color: #ea6b14; cursor: pointer;
    font-family: 'DM Sans', sans-serif; font-size: 0.85rem;
    text-decoration: underline; text-underline-offset: 3px; padding: 0;
  }
  .ff-back {
    background: none; border: none; color: rgba(190,205,235,0.4);
    font-family: 'DM Sans', sans-serif; font-size: 0.8rem;
    cursor: pointer; text-transform: uppercase; letter-spacing: 0.08em;
    padding: 0; margin-bottom: 2rem; transition: color 0.2s;
    display: flex; align-items: center; gap: 0.3rem;
  }
  .ff-back:hover { color: #ea6b14; }
  .ff-error-box {
    background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25);
    border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem;
    font-size: 0.85rem; color: #fca5a5;
  }
  .ff-role-row {
    display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1.2rem;
  }
  .ff-role-btn {
    padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.04); color: rgba(190,205,235,0.7);
    font-family: 'DM Sans', sans-serif; font-size: 0.85rem; cursor: pointer;
    transition: all 0.2s; text-align: center;
  }
  .ff-role-btn:hover { border-color: rgba(234,107,20,0.3); }
  .ff-role-btn.selected { background: rgba(234,107,20,0.12); border-color: rgba(234,107,20,0.5); color: #f0f4ff; }
  .ff-role-icon { font-size: 1.3rem; display: block; margin-bottom: 0.3rem; }
`;

type Tab = "signin" | "signup";

export default function Login() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"client" | "contractor">("client");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;

      const profile = await getProfile();
      if (!profile) throw new Error("Profile not found");

      if (profile.role === "admin") setLocation("/admin-dashboard");
      else if (profile.role === "contractor") setLocation("/contractor-dashboard");
      else setLocation("/client-dashboard");
    } catch (err: any) {
      setError(err.message || "Sign in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { role } },
      });
      if (authError) throw authError;
      toast.success("Account created! Check your email to confirm.");
      setTab("signin");
    } catch (err: any) {
      setError(err.message || "Sign up failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="ff-wrap">
      <style>{styles}</style>
      <motion.div
        className="ff-box"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <button className="ff-back" onClick={() => setLocation("/")}>← Home</button>

        <div className="ff-logo">
          <svg width="56" height="56" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="40,8 72,28 72,60 40,72 8,60 8,28" fill="none" stroke="#ea6b14" strokeWidth="2" opacity="0.4"/>
            <path d="M40 18 L62 30 L62 58 L40 65 L18 58 L18 30 Z" fill="rgba(234,107,20,0.08)" stroke="#ea6b14" strokeWidth="1.5"/>
            <path d="M32 48 L32 36 L36 32 L44 32 L48 36 L48 48" stroke="#f0f4ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M28 48 L52 48" stroke="#ea6b14" strokeWidth="2.5" strokeLinecap="round"/>
            <circle cx="40" cy="26" r="3" fill="#ea6b14"/>
          </svg>
          <div className="ff-logo-title">FREDDY <span>FIXIT</span></div>
        </div>

        <div className="ff-card">
          <div className="ff-tabs">
            <button className={`ff-tab${tab === "signin" ? " active" : ""}`} onClick={() => { setTab("signin"); setError(""); }}>
              Sign In
            </button>
            <button className={`ff-tab${tab === "signup" ? " active" : ""}`} onClick={() => { setTab("signup"); setError(""); }}>
              Create Account
            </button>
          </div>

          {error && <div className="ff-error-box">{error}</div>}

          {tab === "signin" ? (
            <form onSubmit={handleSignIn}>
              <div className="ff-field">
                <label className="ff-label">Email</label>
                <input
                  className="ff-input" type="email" required
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@email.com"
                />
              </div>
              <div className="ff-field">
                <label className="ff-label">Password</label>
                <input
                  className="ff-input" type="password" required
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <button className="ff-btn" type="submit" disabled={isLoading}>
                {isLoading ? <><Loader2 size={16} className="animate-spin" /> Signing in...</> : "Sign In →"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignUp}>
              <div className="ff-field">
                <label className="ff-label">I am a…</label>
                <div className="ff-role-row">
                  <button type="button" className={`ff-role-btn${role === "client" ? " selected" : ""}`} onClick={() => setRole("client")}>
                    <span className="ff-role-icon">🏠</span> Client
                  </button>
                  <button type="button" className={`ff-role-btn${role === "contractor" ? " selected" : ""}`} onClick={() => setRole("contractor")}>
                    <span className="ff-role-icon">🔧</span> Contractor
                  </button>
                </div>
              </div>
              <div className="ff-field">
                <label className="ff-label">Email</label>
                <input
                  className="ff-input" type="email" required
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@email.com"
                />
              </div>
              <div className="ff-field">
                <label className="ff-label">Password</label>
                <input
                  className="ff-input" type="password" required minLength={8}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                />
              </div>
              <button className="ff-btn" type="submit" disabled={isLoading}>
                {isLoading ? <><Loader2 size={16} className="animate-spin" /> Creating account...</> : "Create Account →"}
              </button>
            </form>
          )}
        </div>

        {tab === "signin" && (
          <p className="ff-signup-link">
            New here?{" "}
            <button onClick={() => { setTab("signup"); setError(""); }}>Create an account</button>
          </p>
        )}
      </motion.div>
    </div>
  );
}
