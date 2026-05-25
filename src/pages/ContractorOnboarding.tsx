import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";

const SPECIALTIES = [
  { icon: "🔧", label: "General Repairs" },
  { icon: "🚿", label: "Plumbing" },
  { icon: "⚡", label: "Electrical" },
  { icon: "🌡️", label: "HVAC" },
  { icon: "🪵", label: "Carpentry" },
  { icon: "🎨", label: "Painting" },
  { icon: "🏠", label: "Drywall" },
  { icon: "🪟", label: "Flooring / Tile" },
  { icon: "🛞", label: "Tire Swap / Rotation" },
  { icon: "🚗", label: "Oil Change" },
  { icon: "🔋", label: "Battery / Brakes" },
  { icon: "🧰", label: "Vehicle Maintenance" },
];

const CALGARY_ZONES = [
  "NW Calgary", "NE Calgary", "SW Calgary", "SE Calgary",
  "Downtown / Beltline", "Airdrie", "Cochrane", "Chestermere",
];

const AVAILABILITY_SLOTS: Record<string, string[]> = {
  Monday: ["Morning", "Afternoon", "Evening"],
  Tuesday: ["Morning", "Afternoon", "Evening"],
  Wednesday: ["Morning", "Afternoon", "Evening"],
  Thursday: ["Morning", "Afternoon", "Evening"],
  Friday: ["Morning", "Afternoon", "Evening"],
  Saturday: ["Morning", "Afternoon"],
  Sunday: ["Morning", "Afternoon"],
};

interface FormData {
  firstName: string; lastName: string; email: string; phone: string;
  specialties: string[];
  yearsOfExperience: number;
  serviceArea: string[];
  availability: Record<string, string[]>;
  photoUrl: string;
}

const TOTAL_STEPS = 5;

const sharedStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap');

  .ff-wrap { min-height: 100vh; background: #1a2236;
    background-image: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(234,107,20,0.15) 0%, transparent 70%);
    padding: 2.5rem 1rem; font-family: 'DM Sans', sans-serif; color: #f0f4ff; position: relative; overflow: hidden; }
  .ff-wrap::before { content: ''; position: absolute; inset: 0;
    background-image: repeating-linear-gradient(0deg, transparent, transparent 60px, rgba(255,255,255,0.015) 60px, rgba(255,255,255,0.015) 61px),
      repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(255,255,255,0.015) 60px, rgba(255,255,255,0.015) 61px);
    pointer-events: none; }
  .ff-container { max-width: 580px; margin: 0 auto; position: relative; z-index: 1; }
  .ff-back-home { display: inline-flex; align-items: center; gap: 0.4rem; color: rgba(190,205,235,0.5); font-size: 0.82rem;
    background: none; border: none; cursor: pointer; font-family: 'DM Sans', sans-serif; padding: 0;
    margin-bottom: 2rem; transition: color 0.2s; text-transform: uppercase; letter-spacing: 0.08em; }
  .ff-back-home:hover { color: #ea6b14; }
  .ff-step-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: #ea6b14; margin-bottom: 0.4rem; }
  .ff-heading { font-family: 'Bebas Neue', sans-serif; font-size: 2.6rem; letter-spacing: 0.06em; color: #f0f4ff; margin: 0; line-height: 1; }
  .ff-subhead { font-size: 0.9rem; color: rgba(190,205,235,0.6); margin-top: 0.4rem; font-weight: 300; margin-bottom: 2rem; }
  .ff-progress { display: flex; gap: 6px; margin-bottom: 2.5rem; }
  .ff-progress-bar { height: 3px; flex: 1; border-radius: 99px; background: rgba(255,255,255,0.1); transition: background 0.4s; }
  .ff-progress-bar.active { background: #ea6b14; box-shadow: 0 0 8px rgba(234,107,20,0.5); }
  .ff-progress-bar.done { background: rgba(234,107,20,0.45); }
  .ff-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 2rem; }
  .ff-label { display: block; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(190,205,235,0.6); margin-bottom: 0.6rem; }
  .ff-input { width: 100%; padding: 0.75rem 1rem; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px; color: #f0f4ff; font-family: 'DM Sans', sans-serif; font-size: 0.95rem; outline: none;
    transition: border-color 0.2s, box-shadow 0.2s; box-sizing: border-box; }
  .ff-input:focus { border-color: rgba(234,107,20,0.5); box-shadow: 0 0 0 3px rgba(234,107,20,0.1); }
  .ff-input.error { border-color: rgba(239,68,68,0.6); }
  .ff-input::placeholder { color: rgba(190,205,235,0.3); }
  .ff-error { font-size: 0.78rem; color: #f87171; margin-top: 0.35rem; }
  .ff-field { margin-bottom: 1.2rem; }
  .ff-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }

  .ff-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
  .ff-chip {
    display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px; color: rgba(190,205,235,0.75); font-family: 'DM Sans', sans-serif;
    font-size: 0.85rem; cursor: pointer; transition: all 0.2s; text-align: left;
  }
  .ff-chip:hover { border-color: rgba(234,107,20,0.3); color: #f0f4ff; }
  .ff-chip.selected { background: rgba(234,107,20,0.12); border-color: rgba(234,107,20,0.5); color: #f0f4ff; }
  .ff-chip-icon { font-size: 1.1rem; flex-shrink: 0; }

  .ff-avail-day { margin-bottom: 1.2rem; }
  .ff-avail-day-name { font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(190,205,235,0.5); margin-bottom: 0.5rem; }
  .ff-avail-slots { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .ff-avail-slot {
    padding: 0.4rem 0.9rem; border-radius: 99px; font-size: 0.8rem; cursor: pointer;
    border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04);
    color: rgba(190,205,235,0.7); transition: all 0.2s; font-family: 'DM Sans', sans-serif;
  }
  .ff-avail-slot:hover { border-color: rgba(234,107,20,0.35); color: #f0f4ff; }
  .ff-avail-slot.selected { background: rgba(234,107,20,0.15); border-color: rgba(234,107,20,0.5); color: #f0f4ff; }

  .ff-photo-drop {
    border: 2px dashed rgba(255,255,255,0.12); border-radius: 12px; padding: 2.5rem 1.5rem;
    text-align: center; transition: border-color 0.2s;
  }
  .ff-photo-drop:hover { border-color: rgba(234,107,20,0.3); }
  .ff-photo-icon { font-size: 2.5rem; margin-bottom: 1rem; }
  .ff-photo-text { color: rgba(190,205,235,0.6); font-size: 0.9rem; margin-bottom: 0.5rem; }
  .ff-photo-sub { color: rgba(190,205,235,0.35); font-size: 0.8rem; }
  .ff-photo-or { color: rgba(190,205,235,0.4); font-size: 0.8rem; margin: 1rem 0; }

  .ff-nav { display: flex; gap: 0.75rem; margin-top: 2rem; }
  .ff-btn { flex: 1; padding: 0.85rem 1.5rem; border-radius: 8px; font-family: 'DM Sans', sans-serif;
    font-size: 0.9rem; font-weight: 500; cursor: pointer; border: none; transition: all 0.2s;
    display: flex; align-items: center; justify-content: center; gap: 0.4rem; letter-spacing: 0.05em; }
  .ff-btn-secondary { background: rgba(255,255,255,0.06); color: rgba(190,205,235,0.8); border: 1px solid rgba(255,255,255,0.1); }
  .ff-btn-secondary:hover { background: rgba(255,255,255,0.1); }
  .ff-btn-primary { background: #ea6b14; color: #fff; }
  .ff-btn-primary:hover { background: #f07a28; box-shadow: 0 4px 20px rgba(234,107,20,0.35); }
  .ff-btn-submit { background: linear-gradient(135deg, #ea6b14, #f09020); color: #fff; }
  .ff-btn-submit:hover { box-shadow: 0 4px 24px rgba(234,107,20,0.4); }
  .ff-btn:disabled { opacity: 0.5; cursor: not-allowed; }
`;

export default function ContractorOnboarding() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<FormData>({
    firstName: "", lastName: "", email: "", phone: "",
    specialties: [], yearsOfExperience: 0, serviceArea: [], availability: {}, photoUrl: "",
  });

  const set = (field: keyof FormData, value: any) => {
    setForm(p => ({ ...p, [field]: value }));
    setErrors(p => { const n = { ...p }; delete n[field]; return n; });
  };

  const toggleArr = (field: "specialties" | "serviceArea", val: string) => {
    setForm(p => ({
      ...p,
      [field]: (p[field] as string[]).includes(val)
        ? (p[field] as string[]).filter(v => v !== val)
        : [...(p[field] as string[]), val],
    }));
  };

  const toggleAvail = (day: string, slot: string) => {
    setForm(p => {
      const daySlots = p.availability[day] || [];
      return {
        ...p,
        availability: {
          ...p.availability,
          [day]: daySlots.includes(slot) ? daySlots.filter(s => s !== slot) : [...daySlots, slot],
        },
      };
    });
  };

  const validate = (s: number) => {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!form.firstName.trim()) e.firstName = "Required";
      if (!form.lastName.trim()) e.lastName = "Required";
      if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Valid email required";
      if (form.phone.replace(/\D/g, "").length < 10) e.phone = "10-digit phone required";
    } else if (s === 2) {
      if (form.specialties.length === 0) e.specialties = "Select at least one specialty";
    } else if (s === 3) {
      if (form.serviceArea.length === 0) e.serviceArea = "Select at least one area";
    } else if (s === 4) {
      const hasAny = Object.values(form.availability).some(sl => sl.length > 0);
      if (!hasAny) e.availability = "Select at least one time slot";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => { if (validate(step)) setStep(s => s + 1); };
  const prev = () => { setStep(s => s - 1); setErrors({}); };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("contractors").insert({
        user_id: user?.id ?? null,
        first_name: form.firstName,
        last_name: form.lastName,
        email: form.email,
        phone: form.phone,
        specialties: form.specialties,
        years_of_experience: form.yearsOfExperience,
        service_area: form.serviceArea,
        availability: form.availability,
        photo_url: form.photoUrl || null,
        is_approved: false,
      });
      if (error) throw error;
      toast.success("Registration complete!");
      setLocation("/contractor-success");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepTitles = ["Your Details", "Your Specialties", "Service Areas", "Availability", "Profile Photo"];
  const stepSubs = [
    "Basic contact information",
    "What services do you offer?",
    "Which parts of Calgary do you cover?",
    "When are you available for jobs?",
    "Add a profile photo (optional)",
  ];

  return (
    <div className="ff-wrap">
      <style>{sharedStyles}</style>
      <div className="ff-container">
        <button className="ff-back-home" onClick={() => setLocation("/")}>← Home</button>

        <p className="ff-step-label">Contractor Registration · Step {step} of {TOTAL_STEPS}</p>
        <h1 className="ff-heading">{stepTitles[step - 1]}</h1>
        <p className="ff-subhead">{stepSubs[step - 1]}</p>

        <div className="ff-progress">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} className={`ff-progress-bar ${i + 1 === step ? "active" : i + 1 < step ? "done" : ""}`} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.28 }}
          >
            <div className="ff-card">

              {step === 1 && (
                <>
                  <div className="ff-row">
                    <div className="ff-field">
                      <label className="ff-label">First Name</label>
                      <input className={`ff-input${errors.firstName ? " error" : ""}`} value={form.firstName} onChange={e => set("firstName", e.target.value)} placeholder="Mike" />
                      {errors.firstName && <p className="ff-error">{errors.firstName}</p>}
                    </div>
                    <div className="ff-field">
                      <label className="ff-label">Last Name</label>
                      <input className={`ff-input${errors.lastName ? " error" : ""}`} value={form.lastName} onChange={e => set("lastName", e.target.value)} placeholder="Taylor" />
                      {errors.lastName && <p className="ff-error">{errors.lastName}</p>}
                    </div>
                  </div>
                  <div className="ff-field">
                    <label className="ff-label">Email</label>
                    <input className={`ff-input${errors.email ? " error" : ""}`} type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="mike@email.com" />
                    {errors.email && <p className="ff-error">{errors.email}</p>}
                  </div>
                  <div className="ff-field">
                    <label className="ff-label">Phone</label>
                    <input className={`ff-input${errors.phone ? " error" : ""}`} type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="403-555-0100" />
                    {errors.phone && <p className="ff-error">{errors.phone}</p>}
                  </div>
                  <div className="ff-field">
                    <label className="ff-label">Years of Experience</label>
                    <input className="ff-input" type="number" min="0" max="50" value={form.yearsOfExperience}
                      onChange={e => set("yearsOfExperience", parseInt(e.target.value) || 0)} />
                  </div>
                </>
              )}

              {step === 2 && (
                <div className="ff-field">
                  <label className="ff-label">Select All That Apply</label>
                  <div className="ff-grid">
                    {SPECIALTIES.map(s => (
                      <button key={s.label} className={`ff-chip${form.specialties.includes(s.label) ? " selected" : ""}`}
                        onClick={() => toggleArr("specialties", s.label)}>
                        <span className="ff-chip-icon">{s.icon}</span>{s.label}
                      </button>
                    ))}
                  </div>
                  {errors.specialties && <p className="ff-error" style={{ marginTop: "1rem" }}>{errors.specialties}</p>}
                </div>
              )}

              {step === 3 && (
                <div className="ff-field">
                  <label className="ff-label">Calgary Zones You Serve</label>
                  <div className="ff-grid">
                    {CALGARY_ZONES.map(z => (
                      <button key={z} className={`ff-chip${form.serviceArea.includes(z) ? " selected" : ""}`}
                        onClick={() => toggleArr("serviceArea", z)}>
                        📍 {z}
                      </button>
                    ))}
                  </div>
                  {errors.serviceArea && <p className="ff-error" style={{ marginTop: "1rem" }}>{errors.serviceArea}</p>}
                </div>
              )}

              {step === 4 && (
                <div className="ff-field">
                  {Object.entries(AVAILABILITY_SLOTS).map(([day, slots]) => (
                    <div className="ff-avail-day" key={day}>
                      <div className="ff-avail-day-name">{day}</div>
                      <div className="ff-avail-slots">
                        {slots.map(slot => (
                          <button key={slot}
                            className={`ff-avail-slot${form.availability[day]?.includes(slot) ? " selected" : ""}`}
                            onClick={() => toggleAvail(day, slot)}>
                            {slot}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {errors.availability && <p className="ff-error">{errors.availability}</p>}
                </div>
              )}

              {step === 5 && (
                <div className="ff-field">
                  <div className="ff-photo-drop">
                    <div className="ff-photo-icon">📸</div>
                    <p className="ff-photo-text">A profile photo builds trust with clients</p>
                    <p className="ff-photo-sub">Photo upload coming soon — you can add one later from your dashboard</p>
                    <p className="ff-photo-or">— or paste a photo URL —</p>
                    <input className="ff-input" value={form.photoUrl} onChange={e => set("photoUrl", e.target.value)}
                      placeholder="https://your-photo-url.com/photo.jpg" />
                  </div>
                  <p style={{ fontSize: "0.8rem", color: "rgba(190,205,235,0.4)", marginTop: "1rem", textAlign: "center" }}>
                    This step is optional. You can skip and complete your profile later.
                  </p>
                </div>
              )}

            </div>
          </motion.div>
        </AnimatePresence>

        <div className="ff-nav">
          {step > 1 ? (
            <button className="ff-btn ff-btn-secondary" onClick={prev}><ChevronLeft size={16} /> Back</button>
          ) : (
            <button className="ff-btn ff-btn-secondary" onClick={() => setLocation("/")}>← Home</button>
          )}

          {step < TOTAL_STEPS ? (
            <button className="ff-btn ff-btn-primary" onClick={next}>Next <ChevronRight size={16} /></button>
          ) : (
            <button className="ff-btn ff-btn-submit" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 size={16} className="animate-spin" /> Submitting...</> : "Complete Registration →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
