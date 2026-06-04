import { Ic } from "@/components/Ic";
import { useLocation } from "wouter";
import { motion } from "framer-motion";

export default function ContractorSuccess() {
  const [, setLocation] = useLocation();

  const steps = [
    { iconName: "search", title: "Profile Review", desc: "We'll review your details and verify your specialties — usually within 24 hours." },
    { iconName: "user-check", title: "Account Activated", desc: "You'll get a WhatsApp message or email once your profile is live and visible to clients." },
    { iconName: "smartphone", title: "Start Getting Jobs", desc: "We'll match you with clients in your area based on your specialties and availability." },
    { icon: "⭐", title: "Build Your Reputation", desc: "Complete jobs, collect 5-star reviews, and move to the top of our contractor list." },
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
            <div className="ff-notice-title"><Ic name="smartphone" size={14} style={{ marginRight:6 }} /> Stay Reachable</div>
            <div className="ff-notice-text">We coordinate most jobs over WhatsApp or phone. Make sure the number you provided is active — that's how we'll send you leads.</div>
          </div>

          <a href="https://wa.me/18255618331?text=Hi%2C%20I%20just%20signed%20up%20as%20a%20Freddy%20Fix%20It%20contractor!" target="_blank" rel="noopener noreferrer" className="ff-whatsapp">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Say hi on WhatsApp
          </a>

          <div className="ff-nav">
            <button className="ff-btn ff-btn-secondary" onClick={() => setLocation("/")}>← Back to Home</button>
            <button className="ff-btn ff-btn-primary" onClick={() => setLocation("/contractor-dashboard")}>My Dashboard →</button>
          </div>

          <p className="ff-footer">Questions? Email us at hello@freddyfixit.ca · Calgary, AB</p>
        </motion.div>
      </div>
    </div>
  );
}
