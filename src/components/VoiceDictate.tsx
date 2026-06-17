import { useEffect, useRef, useState } from "react";

// Browser-native voice dictation (Web Speech API). Free, no API key, no backend.
// Renders nothing on browsers without SpeechRecognition (e.g. most Firefox), so
// the textarea keeps working normally everywhere. On Chrome / Edge / Safari it
// shows a mic button: tap to talk and speech streams into the field via
// onAppend, with a live caption of what's currently being heard.
export default function VoiceDictate({
  onAppend,
  lang = "en-US",
}: {
  onAppend: (text: string) => void;
  lang?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const recRef = useRef<any>(null);

  // Keep the latest onAppend in a ref so the recognition callback (bound once)
  // never calls a stale closure.
  const onAppendRef = useRef(onAppend);
  useEffect(() => { onAppendRef.current = onAppend; });

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;

    rec.onresult = (e: any) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalChunk += t;
        else interimChunk += t;
      }
      if (finalChunk.trim()) onAppendRef.current(finalChunk.trim());
      setInterim(interimChunk);
    };
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed")
        setError("Microphone blocked - allow mic access in your browser to dictate.");
      else if (e.error === "no-speech")
        setError("Didn't catch that - tap the mic and try again.");
      else setError("");
      setListening(false);
    };
    rec.onend = () => { setListening(false); setInterim(""); };

    recRef.current = rec;
    return () => { try { rec.stop(); } catch (_) {} };
  }, [lang]);

  if (!supported) return null;

  const toggle = () => {
    const rec = recRef.current;
    if (!rec) return;
    setError("");
    if (listening) {
      try { rec.stop(); } catch (_) {}
      setListening(false);
    } else {
      try { rec.start(); setListening(true); } catch (_) {}
    }
  };

  return (
    <div style={{ marginTop: "0.5rem" }}>
      <style>{".ffvd-pulse{animation:ffvdPulse 1.2s ease-in-out infinite}@keyframes ffvdPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.5)}50%{box-shadow:0 0 0 6px rgba(239,68,68,0)}}"}</style>
      <button
        type="button"
        onClick={toggle}
        className={listening ? "ffvd-pulse" : ""}
        aria-pressed={listening}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 0.9rem",
          borderRadius: "999px",
          border: "1px solid " + (listening ? "rgba(239,68,68,.7)" : "rgba(234,107,20,.55)"),
          background: listening ? "rgba(239,68,68,.16)" : "rgba(234,107,20,.12)",
          color: listening ? "#fca5a5" : "#ea6b14",
          fontSize: "0.85rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <line x1="12" y1="17" x2="12" y2="22" />
        </svg>
        {listening ? "Listening... tap to stop" : "Speak instead of typing"}
      </button>
      {listening && interim && (
        <p style={{ margin: "0.4rem 0 0", fontSize: "0.85rem", color: "rgba(190,205,235,.65)", fontStyle: "italic" }}>
          {interim}
        </p>
      )}
      {error && (
        <p style={{ margin: "0.4rem 0 0", fontSize: "0.8rem", color: "#fca5a5" }}>{error}</p>
      )}
    </div>
  );
}
