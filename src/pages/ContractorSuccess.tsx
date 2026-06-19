import { Ic } from "@/components/Ic";
import { useLocation } from "wouter";
import { motion } from "framer-motion";

export default function ContractorSuccess() {
  const [, setLocation] = useLocation();

  const steps = [
    { iconName: "search", title: "Profile Review", desc: "We'll review your details and verify your specialties — usually within 24 hours." },
    { iconName: "user-check", title: "Account Activated", desc: "You'll get an email once your profile is live and visible to clients." },
    { iconName: "smartphone", title: "Start Getting Jobs", desc: "We'll match you with clients in your area based on your specialties and availability." },
    { iconName: "sparkles", title: "Build Your Reputation", desc: "Complete jobs, collect 5-star reviews, and move to the top of our contractor list." },
  ];

  return (
    <div className="ff-wrap">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap');
        .ff-wrap { min-height: 100vh; background: #1a2236;
          background-image: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(234,107,20,0.15) 0%, transparent 70%);
          padding: 3rem 1rem; font-family: 'DM Sans', sans-serif; color: #f0f4ff; position: relative; overflow: hidden; }
        .ff-wrap::before { content: ''; position: absolute; inset: 0;
          background-image: repeating-linear-gradient(0deg, transparent, transparent 60px, rgba(255,255,255,0.015) 60px, rgba(255,255,255,0.015) 61px),
            repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(255,255,255,0.015) 60px, rgba(255,255,255,0.015) 61px);
          pointer-events: none; }
        .ff-container { max-width: 560px; margin: 0 auto; position: relative; z-index: 1; }
        .ff-check { width: 72px; height: 72px; background: rgba(234,107,20,0.15); border: 2px solid rgba(234,107,20,0.4);
          border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 2rem;
          box-shadow: 0 0 32px rgba(234,107,20,0.25); }
        .ff-check svg { color: #ea6b14; }
        .ff-title { font-family: 'Bebas Neue', sans-serif; font-size: clamp(2.4rem, 8vw, 3.5rem);
          letter-spacing: 0.06em; color: #f0f4ff; text-align: center; margin: 0 0 0.5rem; line-height: 1; }
        .ff-title span { color: #ea6b14; }
        .ff-subtitle { text-align: center; color: rgba(190,205,235,0.65); font-size: 1rem; font-weight: 300; margin-bottom: 2.5rem; }
        .ff-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 2rem; margin-bottom: 1.5rem; }
        .ff-card-title { font-family: 'Bebas Neue', sans-serif; font-size: 1.3rem; letter-spacing: 0.06em; color: #ea6b14; margin-bottom: 1.5rem; }
        .ff-step { display: flex; gap: 1rem; margin-bottom: 1.25rem; align-items: flex-start; }
        .ff-step:last-child { margin-bottom: 0; }
        .ff-step-icon { font-size: 1.4rem; flex-shrink: 0; width: 36px; text-align: center; }
        .ff-step-title { font-size: 0.95rem; font-weight: 500; color: #f0f4ff; margin-bottom: 0.2rem; }
        .ff-step-desc { font-size: 0.85rem; color: rgba(190,205,235,0.6); font-weight: 300; line-height: 1.5; }
        .ff-notice { background: rgba(234,107,20,0.08); border: 1px solid rgba(234,107,20,0.2); border-radius: 10px; padding: 1.25rem 1.5rem; margin-bottom: 1.5rem; }
        .ff-notice-title { font-size: 0.85rem; font-weight: 500; color: #ea6b14; margin-bottom: 0.4rem; letter-spacing: 0.05em; text-transform: uppercase; }
        .ff-notice-text { font-size: 0.85rem; color: rgba(190,205,235,0.7); font-weight: 300; line-height: 1.5; }
        .ff-nav { display: flex; gap: 0.75rem; flex-wrap: wrap; }
        .ff-btn { flex: 1; min-width: 140px; padding: 0.85rem 1.5rem; border-radius: 8px; font-family: 'DM Sans', sans-serif;
          font-size: 0.9rem; font-weight: 500; cursor: pointer; border: none; transition: all 0.2s;
          display: flex; align-items: center; justify-content: center; gap: 0.5rem; }
        .ff-btn-secondary { background: rgba(255,255,255,0.06); color: rgba(190,205,235,0.8); border: 1px solid rgba(255,255,255,0.1); }
        .ff-btn-secondary:hover { background: rgba(255,255,255,0.1); }
        .ff-btn-primary { background: #ea6b14; color: #fff; }
        .ff-btn-primary:hover { background: #f07a28; box-shadow: 0 4px 20px rgba(234,107,20,0.35); }
        .ff-whatsapp { display: flex; align-items: center; justify-content: center; gap: 0.5rem;
          background: rgba(37,211,102,0.1); border: 1px solid rgba(37,211,102,0.25); border-radius: 8px;
          padding: 0.85rem 1.5rem; color: #25d366; font-size: 0.9rem; font-weight: 500;
          cursor: pointer; text-decoration: none; transition: all 0.2s; margin-bottom: 1rem; width: 100%; box-sizing: border-box; }
        .ff-whatsapp:hover { background: rgba(37,211,102,0.18); }
        .ff-footer { text-align: center; font-size: 0.78rem; color: rgba(190,205,235,0.3); margin-top: 2rem; }
      `}</style>

      <div className="ff-container">
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 180, damping: 14 }}>
          <div className="ff-check">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h1 className="ff-title">Welcome to <span>the Team!</span></h1>
          <p className="ff-subtitle">Your contractor profile has been submitted. Here's what's next.</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <div className="ff-card">
            <div className="ff-card-title">What Happens Next</div>
            {steps.map((s, i) => (
              <motion.div key={s.title} className="ff-step" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.08 }}>
                <span className="ff-step-icon"><Ic name={s.iconName as any} size={28} color="#ea6b14" /></span>
                <div>
                  <div className="ff-step-title">{s.title}</div>
                  <div className="ff-step-desc">{s.desc}</div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="ff-notice">
            <div className="ff-notice-title"><Ic name="bell" size={14} style={{ marginRight:6 }} /> Check Your Dashboard</div>
            <div className="ff-notice-text">New jobs in your area show up in your dashboard, and we'll email you when one's available. Accept, schedule, and complete every job right from your dashboard.</div>
          </div>


          <div className="ff-nav">
            <button className="ff-btn ff-btn-secondary" onClick={() => setLocation("/")}>← Back to Home</button>
            <button className="ff-btn ff-btn-primary" onClick={() => setLocation("/contractor-dashboard")}>My Dashboard →</button>
          </div>

          <p className="ff-footer">Questions? Email us at hello@freddyfixit.ca</p>
        </motion.div>
      </div>
    </div>
  );
}
