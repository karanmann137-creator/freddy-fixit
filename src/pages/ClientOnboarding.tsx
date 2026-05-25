import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";

const SERVICES = [
  { icon: "🔧", label: "General Handyman" },
  { icon: "🚿", label: "Plumbing Repair" },
  { icon: "⚡", label: "Electrical Work" },
  { icon: "🌡️", label: "HVAC Maintenance" },
  { icon: "🪵", label: "Carpentry" },
  { icon: "🎨", label: "Painting" },
  { icon: "🏠", label: "Drywall / Flooring" },
  { icon: "🚗", label: "Oil Change" },
  { icon: "🛞", label: "Tire Swap / Rotation" },
  { icon: "🔋", label: "Battery / Brakes" },
  { icon: "🧰", label: "Vehicle Maintenance" },
  { icon: "📦", label: "Other" },
];

const SCHEDULE_OPTIONS = [
  { icon: "⚡", label: "Urgent / ASAP", sub: "Within 24 hours" },
  { icon: "📅", label: "This Week", sub: "Next 2–5 days" },
  { icon: "🗓️", label: "Flexible", sub: "I'm not in a rush" },
  { icon: "🔁", label: "Recurring", sub: "Regular maintenance" },
];

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  serviceNeeded: string;
  location: string;
  preferredSchedule: string;
  jobDescription: string;
}

const TOTAL_STEPS = 3;

const sharedStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap');

  .ff-wrap {
    min-height: 100vh;
    background: #1a2236;
    background-image: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(234,107,20,0.15) 0%, transparent 70%);
    padding: 2.5rem 1rem;
    font-family: 'DM Sans', sans-serif;
    color: #f0f4ff;
    position: relative;
    overflow: hidden;
  }

  .ff-wrap::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: repeating-linear-gradient(0deg, transparent, transparent 60px, rgba(255,255,255,0.015) 60px, rgba(255,255,255,0.015) 61px),
      repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(255,255,255,0.015) 60px, rgba(255,255,255,0.015) 61px);
    pointer-events: none;
  }

  .ff-container { max-width: 580px; margin: 0 auto; position: relative; z-index: 1; }

  .ff-back-home {
    display: inline-flex; align-items: center; gap: 0.4rem;
    color: rgba(190,205,235,0.5); font-size: 0.82rem;
    background: none; border: none; cursor: pointer;
    font-family: 'DM Sans', sans-serif; padding: 0;
    margin-bottom: 2rem; transition: color 0.2s; text-transform: uppercase; letter-spacing: 0.08em;
  }
  .ff-back-home:hover { color: #ea6b14; }

  .ff-header { margin-bottom: 2rem; }
  .ff-step-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: #ea6b14; margin-bottom: 0.4rem; }
  .ff-heading { font-family: 'Bebas Neue', sans-serif; font-size: 2.6rem; letter-spacing: 0.06em; color: #f0f4ff; margin: 0; line-height: 1; }
  .ff-subhead { font-size: 0.9rem; color: rgba(190,205,235,0.6); margin-top: 0.4rem; font-weight: 300; }

  .ff-progress { display: flex; gap: 6px; margin-bottom: 2.5rem; }
  .ff-progress-bar { height: 3px; flex: 1; border-radius: 99px; background: rgba(255,255,255,0.1); transition: background 0.4s; }
  .ff-progress-bar.active { background: #ea6b14; box-shadow: 0 0 8px rgba(234,107,20,0.5); }
  .ff-progress-bar.done { background: rgba(234,107,20,0.45); }

  .ff-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 2rem; }

  .ff-label { display: block; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(190,205,235,0.6); margin-bottom: 0.6rem; }
  .ff-input {
    width: 100%; padding: 0.75rem 1rem; background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;
    color: #f0f4ff; font-family: 'DM Sans', sans-serif; font-size: 0.95rem;
    outline: none; transition: border-color 0.2s, box-shadow 0.2s; box-sizing: border-box;
  }
  .ff-input:focus { border-color: rgba(234,107,20,0.5); box-shadow: 0 0 0 3px rgba(234,107,20,0.1); }
  .ff-input.error { border-color: rgba(239,68,68,0.6); }
  .ff-input::placeholder { color: rgba(190,205,235,0.3); }
  .ff-textarea { resize: vertical; min-height: 120px; }
  .ff-error { font-size: 0.78rem; color: #f87171; margin-top: 0.35rem; }
  .ff-field { margin-bottom: 1.2rem; }
  .ff-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }

  .ff-service-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .ff-service-btn {
    display: flex; align-items: center; gap: 0.65rem;
    padding: 0.9rem 1rem; background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;
    color: rgba(190,205,235,0.8); font-family: 'DM Sans', sans-serif;
    font-size: 0.88rem; cursor: pointer; transition: all 0.2s; text-align: left;
  }
  .ff-service-btn:hover { border-color: rgba(234,107,20,0.3); color: #f0f4ff; }
  .ff-service-btn.selected {
    background: rgba(234,107,20,0.12); border-color: rgba(234,107,20,0.5);
    color: #f0f4ff; box-shadow: 0 0 12px rgba(234,107,20,0.1);
  }
  .ff-service-icon { font-size: 1.2rem; flex-shrink: 0; }

  .ff-schedule-grid { display: flex; flex-direction: column; gap: 0.75rem; }
  .ff-schedule-btn {
    display: flex; align-items: center; gap: 1rem;
    padding: 1rem 1.2rem; background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;
    color: rgba(190,205,235,0.8); font-family: 'DM Sans', sans-serif;
    cursor: pointer; transition: all 0.2s; text-align: left;
  }
  .ff-schedule-btn:hover { border-color: rgba(234,107,20,0.3); color: #f0f4ff; }
  .ff-schedule-btn.selected {
    background: rgba(234,107,20,0.12); border-color: rgba(234,107,20,0.5);
    color: #f0f4ff;
  }
  .ff-schedule-icon { font-size: 1.5rem; flex-shrink: 0; }
  .ff-schedule-label { font-size: 0.95rem; font-weight: 500; }
  .ff-schedule-sub { font-size: 0.78rem; color: rgba(190,205,235,0.5); margin-top: 0.1rem; }

  .ff-nav { display: flex; gap: 0.75rem; margin-top: 2rem; }
  .ff-btn {
    flex: 1; padding: 0.85rem 1.5rem; border-radius: 8px;
    font-family: 'DM Sans', sans-serif; font-size: 0.9rem; font-weight: 500;
    cursor: pointer; border: none; transition: all 0.2s;
    display: flex; align-items: center; justify-content: center; gap: 0.4rem;
    letter-spacing: 0.05em;
  }
  .ff-btn-secondary { background: rgba(255,255,255,0.06); color: rgba(190,205,235,0.8); border: 1px solid rgba(255,255,255,0.1); }
  .ff-btn-secondary:hover { background: rgba(255,255,255,0.1); }
  .ff-btn-primary { background: #ea6b14; color: #fff; }
  .ff-btn-primary:hover { background: #f07a28; box-shadow: 0 4px 20px rgba(234,107,20,0.35); }
  .ff-btn-primary:disabled { background: rgba(234,107,20,0.35); cursor: not-allowed; }
  .ff-btn-submit { background: linear-gradient(135deg, #ea6b14, #f09020); color: #fff; }
  .ff-btn-submit:hover { box-shadow: 0 4px 24px rgba(234,107,20,0.4); }
`;

export default function ClientOnboarding() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<FormData>({
    firstName: "", lastName: "", email: "", phone: "",
    serviceNeeded: "", location: "", preferredSchedule: "", jobDescription: "",
  });

  const set = (field: keyof FormData, value: string) => {
    setForm(p => ({ ...p, [field]: value }));
    setErrors(p => { const n = { ...p }; delete n[field]; return n; });
  };

  const validate = (s: number) => {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!form.firstName.trim()) e.firstName = "Required";
      if (!form.lastName.trim()) e.lastName = "Required";
      if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Valid email required";
      if (form.phone.replace(/\D/g, "").length < 10) e.phone = "10-digit phone required";
    } else if (s === 2) {
      if (!form.serviceNeeded) e.serviceNeeded = "Please select a service";
      if (!form.preferredSchedule) e.preferredSchedule = "Please select a schedule";
    } else if (s === 3) {
      if (!form.location.trim()) e.location = "Location required";
      if (form.jobDescription.trim().length < 10) e.jobDescription = "Please describe the job (min 10 chars)";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => { if (validate(step)) setStep(s => s + 1); };
  const prev = () => { setStep(s => s - 1); setErrors({}); };

  const handleSubmit = async () => {
    if (!validate(3)) return;
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("clients").insert({
        user_id: user?.id ?? null,
        first_name: form.firstName,
        last_name: form.lastName,
        email: form.email,
        phone: form.phone,
      });
      if (error) throw error;

      // Create the job request
      const { data: client } = await supabase
        .from("clients")
        .select("id")
        .eq("email", form.email)
        .single();

      if (client) {
        await supabase.from("jobs").insert({
          client_id: client.id,
          service_needed: form.serviceNeeded,
          location: form.location,
          preferred_schedule: form.preferredSchedule,
          job_description: form.jobDescription,
          status: "pending",
        });
      }

      toast.success("Request submitted!");
      setLocation("/client-success");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepTitles = ["Your Details", "What Do You Need?", "Job Details"];
  const stepSubs = [
    "Tell us a bit about yourself",
    "Choose a service and your preferred timing",
    "Where and what needs fixing?",
  ];

  return (
    <div className="ff-wrap">
      <style>{sharedStyles}</style>
      <div className="ff-container">
        <button className="ff-back-home" onClick={() => setLocation("/")}>
          ← Home
        </button>

        <div className="ff-header">
          <p className="ff-step-label">Step {step} of {TOTAL_STEPS}</p>
          <h1 className="ff-heading">{stepTitles[step - 1]}</h1>
          <p className="ff-subhead">{stepSubs[step - 1]}</p>
        </div>

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
                      <input className={`ff-input${errors.firstName ? " error" : ""}`} value={form.firstName} onChange={e => set("firstName", e.target.value)} placeholder="Alex" />
                      {errors.firstName && <p className="ff-error">{errors.firstName}</p>}
                    </div>
                    <div className="ff-field">
                      <label className="ff-label">Last Name</label>
                      <input className={`ff-input${errors.lastName ? " error" : ""}`} value={form.lastName} onChange={e => set("lastName", e.target.value)} placeholder="Johnson" />
                      {errors.lastName && <p className="ff-error">{errors.lastName}</p>}
                    </div>
                  </div>
                  <div className="ff-field">
                    <label className="ff-label">Email</label>
                    <input className={`ff-input${errors.email ? " error" : ""}`} type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="alex@email.com" />
                    {errors.email && <p className="ff-error">{errors.email}</p>}
                  </div>
                  <div className="ff-field">
                    <label className="ff-label">Phone</label>
                    <input className={`ff-input${errors.phone ? " error" : ""}`} type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="403-555-0100" />
                    {errors.phone && <p className="ff-error">{errors.phone}</p>}
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="ff-field">
                    <label className="ff-label">Service Needed</label>
                    <div className="ff-service-grid">
                      {SERVICES.map(s => (
                        <button
                          key={s.label}
                          className={`ff-service-btn${form.serviceNeeded === s.label ? " selected" : ""}`}
                          onClick={() => set("serviceNeeded", s.label)}
                        >
                          <span className="ff-service-icon">{s.icon}</span>
                          {s.label}
                        </button>
                      ))}
                    </div>
                    {errors.serviceNeeded && <p className="ff-error">{errors.serviceNeeded}</p>}
                  </div>

                  <div className="ff-field" style={{ marginTop: "1.5rem" }}>
                    <label className="ff-label">When Do You Need It?</label>
                    <div className="ff-schedule-grid">
                      {SCHEDULE_OPTIONS.map(o => (
                        <button
                          key={o.label}
                          className={`ff-schedule-btn${form.preferredSchedule === o.label ? " selected" : ""}`}
                          onClick={() => set("preferredSchedule", o.label)}
                        >
                          <span className="ff-schedule-icon">{o.icon}</span>
                          <div>
                            <div className="ff-schedule-label">{o.label}</div>
                            <div className="ff-schedule-sub">{o.sub}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                    {errors.preferredSchedule && <p className="ff-error">{errors.preferredSchedule}</p>}
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div className="ff-field">
                    <label className="ff-label">Your Address / Location in Calgary</label>
                    <input className={`ff-input${errors.location ? " error" : ""}`} value={form.location} onChange={e => set("location", e.target.value)} placeholder="e.g. 123 Main St NW, Calgary" />
                    {errors.location && <p className="ff-error">{errors.location}</p>}
                  </div>
                  <div className="ff-field">
                    <label className="ff-label">Describe the Job</label>
                    <textarea className={`ff-input ff-textarea${errors.jobDescription ? " error" : ""}`} value={form.jobDescription} onChange={e => set("jobDescription", e.target.value)} placeholder="Tell us what's broken or what you need done. The more detail, the better." />
                    {errors.jobDescription && <p className="ff-error">{errors.jobDescription}</p>}
                  </div>
                </>
              )}

            </div>
          </motion.div>
        </AnimatePresence>

        <div className="ff-nav">
          {step > 1 ? (
            <button className="ff-btn ff-btn-secondary" onClick={prev}>
              <ChevronLeft size={16} /> Back
            </button>
          ) : (
            <button className="ff-btn ff-btn-secondary" onClick={() => setLocation("/")}>
              ← Home
            </button>
          )}

          {step < TOTAL_STEPS ? (
            <button className="ff-btn ff-btn-primary" onClick={next}>
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button className="ff-btn ff-btn-submit" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 size={16} className="animate-spin" /> Submitting...</> : "Submit Request →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
