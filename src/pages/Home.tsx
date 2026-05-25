import { useLocation } from "wouter";
import { motion } from "framer-motion";

export default function Home() {
  const [, setLocation] = useLocation();

  return (
    <div className="ff-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap');

        .ff-root {
          min-height: 100vh;
          background: #1a2236;
          background-image:
            radial-gradient(ellipse 80% 60% at 50% -10%, rgba(234,107,20,0.18) 0%, transparent 70%),
            radial-gradient(ellipse 40% 40% at 80% 80%, rgba(60,80,120,0.25) 0%, transparent 60%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem;
          font-family: 'DM Sans', sans-serif;
          position: relative;
          overflow: hidden;
        }

        .ff-root::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 60px,
            rgba(255,255,255,0.015) 60px,
            rgba(255,255,255,0.015) 61px
          ),
          repeating-linear-gradient(
            90deg,
            transparent,
            transparent 60px,
            rgba(255,255,255,0.015) 60px,
            rgba(255,255,255,0.015) 61px
          );
          pointer-events: none;
        }

        .ff-inner {
          max-width: 680px;
          width: 100%;
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .ff-logo-mark {
          width: 80px;
          height: 80px;
          margin-bottom: 1.5rem;
          filter: drop-shadow(0 0 18px rgba(234,107,20,0.6));
        }

        .ff-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(3.5rem, 10vw, 6rem);
          letter-spacing: 0.08em;
          line-height: 0.9;
          text-align: center;
          margin: 0 0 0.5rem;
          color: #f0f4ff;
          text-shadow: 0 0 40px rgba(234,107,20,0.3);
        }

        .ff-title span {
          color: #ea6b14;
          text-shadow: 0 0 30px rgba(234,107,20,0.7), 0 0 60px rgba(234,107,20,0.3);
        }

        .ff-tagline {
          font-size: 1rem;
          font-weight: 300;
          color: rgba(190,205,235,0.75);
          text-align: center;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-bottom: 3rem;
        }

        .ff-divider {
          width: 48px;
          height: 2px;
          background: linear-gradient(90deg, transparent, #ea6b14, transparent);
          margin: 0 auto 3rem;
        }

        .ff-cards {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          width: 100%;
          margin-bottom: 1.5rem;
        }

        @media (max-width: 480px) {
          .ff-cards { grid-template-columns: 1fr; }
        }

        .ff-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          padding: 2rem 1.5rem;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          transition: all 0.25s ease;
          position: relative;
          overflow: hidden;
          text-align: center;
        }

        .ff-card::before {
          content: '';
          position: absolute;
          inset: 0;
          opacity: 0;
          transition: opacity 0.25s ease;
          border-radius: 12px;
        }

        .ff-card-contractor::before {
          background: radial-gradient(ellipse at 50% 0%, rgba(234,107,20,0.15) 0%, transparent 70%);
        }

        .ff-card-client::before {
          background: radial-gradient(ellipse at 50% 0%, rgba(100,150,220,0.15) 0%, transparent 70%);
        }

        .ff-card:hover {
          transform: translateY(-3px);
          border-color: rgba(234,107,20,0.4);
          box-shadow: 0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(234,107,20,0.15);
        }

        .ff-card:hover::before { opacity: 1; }

        .ff-card-icon {
          font-size: 2.2rem;
          line-height: 1;
        }

        .ff-card-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.4rem;
          letter-spacing: 0.08em;
          color: #f0f4ff;
        }

        .ff-card-sub {
          font-size: 0.8rem;
          color: rgba(190,205,235,0.55);
          font-weight: 300;
          line-height: 1.4;
        }

        .ff-card-cta {
          margin-top: 0.5rem;
          font-size: 0.78rem;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #ea6b14;
          display: flex;
          align-items: center;
          gap: 0.3rem;
        }

        .ff-browse {
          background: none;
          border: none;
          color: rgba(190,205,235,0.5);
          font-family: 'DM Sans', sans-serif;
          font-size: 0.85rem;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 3px;
          padding: 0.5rem;
          transition: color 0.2s;
          margin-bottom: 0.5rem;
        }

        .ff-browse:hover { color: rgba(190,205,235,0.85); }

        .ff-whatsapp {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(37,211,102,0.12);
          border: 1px solid rgba(37,211,102,0.25);
          border-radius: 999px;
          padding: 0.6rem 1.4rem;
          color: #25d366;
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.2s;
          margin-top: 1rem;
        }

        .ff-whatsapp:hover {
          background: rgba(37,211,102,0.2);
          box-shadow: 0 0 16px rgba(37,211,102,0.2);
        }

        .ff-footer {
          margin-top: 3rem;
          font-size: 0.75rem;
          color: rgba(190,205,235,0.3);
          text-align: center;
          letter-spacing: 0.05em;
        }
      `}</style>

      <motion.div
        className="ff-inner"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        {/* Logo icon */}
        <motion.svg
          className="ff-logo-mark"
          viewBox="0 0 80 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <polygon points="40,8 72,28 72,60 40,72 8,60 8,28" fill="none" stroke="#ea6b14" strokeWidth="2" opacity="0.4"/>
          <path d="M40 18 L62 30 L62 58 L40 65 L18 58 L18 30 Z" fill="rgba(234,107,20,0.08)" stroke="#ea6b14" strokeWidth="1.5"/>
          <path d="M32 48 L32 36 L36 32 L44 32 L48 36 L48 48" stroke="#f0f4ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <path d="M28 48 L52 48" stroke="#ea6b14" strokeWidth="2.5" strokeLinecap="round"/>
          <circle cx="40" cy="26" r="3" fill="#ea6b14"/>
        </motion.svg>

        {/* Title */}
        <motion.h1
          className="ff-title"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          FREDDY<br /><span>FIXIT</span>
        </motion.h1>

        <motion.p
          className="ff-tagline"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.35 }}
        >
          Calgary's On-Demand Repair & Maintenance Platform
        </motion.p>

        <div className="ff-divider" />

        {/* Role cards */}
        <motion.div
          className="ff-cards"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
        >
          <div
            className="ff-card ff-card-contractor"
            onClick={() => setLocation("/contractor-onboarding")}
          >
            <div className="ff-card-icon">🔧</div>
            <div className="ff-card-title">I'm a Contractor</div>
            <div className="ff-card-sub">Join our network and get more clients in Calgary</div>
            <div className="ff-card-cta">Get started →</div>
          </div>

          <div
            className="ff-card ff-card-client"
            onClick={() => setLocation("/client-onboarding")}
          >
            <div className="ff-card-icon">🏠</div>
            <div className="ff-card-title">I Need a Fix</div>
            <div className="ff-card-sub">Home repairs, vehicle maintenance — we've got you</div>
            <div className="ff-card-cta">Book now →</div>
          </div>
        </motion.div>

        <motion.button
          className="ff-browse"
          onClick={() => setLocation("/search")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          Browse available contractors
        </motion.button>

        {/* WhatsApp CTA */}
        <motion.a
          href="https://wa.me/14031234567"
          target="_blank"
          rel="noopener noreferrer"
          className="ff-whatsapp"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.65 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Chat with us on WhatsApp
        </motion.a>

        <p className="ff-footer">Calgary, AB · Home Repairs · Vehicle Maintenance · Trusted Tradespeople</p>
      </motion.div>
    </div>
  );
}
