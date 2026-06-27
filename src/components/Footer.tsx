// Site-wide footer — the same footer that used to live only on the home page.
// Styles are inline (not a CSS class) so it renders identically on every page,
// regardless of which page-level <style> blocks are present. Rendered once,
// globally, from App.tsx beneath the router.
export default function Footer() {
  const bar: React.CSSProperties = {
    background: "#111827",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    padding: "2rem 1.5rem",
    textAlign: "center",
    fontSize: "0.75rem",
    color: "rgba(190,205,235,0.25)",
    letterSpacing: "0.05em",
    fontFamily: "'DM Sans', sans-serif",
  };
  const link: React.CSSProperties = { color: "rgba(190,205,235,.45)", textDecoration: "underline" };

  return (
    <div style={bar}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={{ fontSize: "1rem", fontWeight: 500, color: "rgba(190,205,235,0.6)", marginBottom: "0.75rem" }}>
        Contact us: <a href="mailto:hello@freddyfixit.ca" style={{ color: "#ea6b14", textDecoration: "none" }}>hello@freddyfixit.ca</a>
      </div>
      <div>Home Repairs · Vehicle Maintenance · Trusted Tradespeople</div>
      <div style={{ marginTop: "0.85rem", fontSize: "0.72rem", maxWidth: "760px", margin: "0.85rem auto 0", lineHeight: 1.9 }}>
        {[
          ["Handyman", "handyman"], ["Plumbers", "plumbing"], ["Electricians", "electrical"],
          ["HVAC & Furnace", "hvac"], ["Painters", "painting"], ["Drywall & Flooring", "drywall-flooring"],
          ["Landscaping", "landscaping"], ["Snow Removal", "snow-removal"], ["Roofing & Siding", "siding-roofing"],
          ["Concrete", "concrete-masonry"], ["Appliance Repair", "appliance-repair"], ["Vehicle Maintenance", "vehicle-maintenance"],
        ].map(([label, slug], i) => (
          <span key={slug}>
            {i > 0 ? " · " : ""}
            <a href={"/services/" + slug} style={link}>{label} Calgary</a>
          </span>
        ))}
        {" · "}<a href="/services" style={link}>All services</a>{" · "}<a href="/for-contractors" style={link}>For Contractors</a>
      </div>
      <div style={{ marginTop: "0.75rem", fontSize: "0.65rem", color: "rgba(190,205,235,0.2)", maxWidth: "700px", margin: "0.75rem auto 0", lineHeight: 1.6 }}>
        Freddy Fix It is a platform that connects clients with independent contractors. We are not liable for any damages, defects, injury, or loss arising from services booked through this platform. All contractors are independent professionals. Use of this platform constitutes acceptance of our{" "}
        <a href="/user-agreement" target="_blank" rel="noopener noreferrer" style={link}>User Agreement</a>,{" "}
        <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={link}>Privacy Policy</a>,{" "}and{" "}
        <a href="/homeowner-protection-promise" target="_blank" rel="noopener noreferrer" style={link}>Homeowner Protection Promise</a>.
      </div>
    </div>
  );
}
