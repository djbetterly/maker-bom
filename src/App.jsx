import { useState, useEffect, useCallback } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const VENDORS = [
  { id: "mcmaster",    label: "McMaster-Carr",  color: "#e8a020", short: "MC"  },
  { id: "sendcutsend", label: "Send Cut Send",   color: "#3ba55c", short: "SCS" },
  { id: "framingtech", label: "FramingTech",     color: "#5865f2", short: "FT"  },
  { id: "bambu",       label: "Bambu Labs",      color: "#e05252", short: "BL"  },
  { id: "other",       label: "Other",           color: "#888",    short: "OTH" },
];

const PART_TYPES = [
  { id: "purchased",  label: "Purchased",   icon: "🛒" },
  { id: "3d_printed", label: "3D Printed",  icon: "🖨️" },
  { id: "custom_cut", label: "Custom Cut",  icon: "✂️" },
  { id: "drawing",    label: "Drawing/Doc", icon: "📐" },
];

const DEFAULT_SETTINGS = {
  laborRate: 65,
  printerWatts: 250,
  electricityRate: 0.14,
  wearTearRate: 0.50,
  defaultMarkup: 35,
};

const SEED_FILAMENTS = [
  { id: "f1", name: "Bambu PLA Basic",  brand: "Bambu Labs", material: "PLA",  color: "#e8e8e8", spoolCost: 19.99, spoolSize: 1000 },
  { id: "f2", name: "Bambu PETG Basic", brand: "Bambu Labs", material: "PETG", color: "#7aafcc", spoolCost: 21.99, spoolSize: 1000 },
  { id: "f3", name: "Bambu ABS",        brand: "Bambu Labs", material: "ABS",  color: "#888",    spoolCost: 24.99, spoolSize: 1000 },
  { id: "f4", name: "eSUN TPU 95A",     brand: "eSUN",       material: "TPU",  color: "#3ba55c", spoolCost: 28.99, spoolSize: 1000 },
];

const SEED_CATALOG = [
  { id:"cat1", name:"M3×8 SHCS",          vendor:"mcmaster",   partNumber:"91292A113", url:"https://www.mcmaster.com/91292A113/", pkgQty:100, pkgPrice:"8.74",  unitCost:"0.09", isStock:true,  notes:"Socket head cap screw" },
  { id:"cat2", name:"M3×12 SHCS",         vendor:"mcmaster",   partNumber:"91292A115", url:"",                                    pkgQty:100, pkgPrice:"9.84",  unitCost:"0.10", isStock:true,  notes:"" },
  { id:"cat3", name:"M3×16 SHCS",         vendor:"mcmaster",   partNumber:"91292A117", url:"",                                    pkgQty:100, pkgPrice:"10.70", unitCost:"0.11", isStock:true,  notes:"" },
  { id:"cat4", name:"M4×10 SHCS",         vendor:"mcmaster",   partNumber:"91292A194", url:"",                                    pkgQty:100, pkgPrice:"13.97", unitCost:"0.14", isStock:true,  notes:"" },
  { id:"cat5", name:"M5×16 SHCS",         vendor:"mcmaster",   partNumber:"91292A128", url:"",                                    pkgQty:50,  pkgPrice:"9.17",  unitCost:"0.18", isStock:true,  notes:"" },
  { id:"cat6", name:"Heat-Set Insert M3", vendor:"mcmaster",   partNumber:"94180A333", url:"",                                    pkgQty:50,  pkgPrice:"10.84", unitCost:"0.22", isStock:true,  notes:"For 3D printed parts" },
  { id:"cat7", name:"Heat-Set Insert M4", vendor:"mcmaster",   partNumber:"94180A353", url:"",                                    pkgQty:50,  pkgPrice:"17.62", unitCost:"0.35", isStock:true,  notes:"" },
  { id:"cat8", name:"Hex Nut M3",         vendor:"mcmaster",   partNumber:"90592A085", url:"",                                    pkgQty:100, pkgPrice:"3.76",  unitCost:"0.04", isStock:true,  notes:"" },
  { id:"cat9", name:"Hex Nut M4",         vendor:"mcmaster",   partNumber:"90592A105", url:"",                                    pkgQty:100, pkgPrice:"5.81",  unitCost:"0.06", isStock:true,  notes:"" },
  { id:"catA", name:"M3 Flat Washer",     vendor:"mcmaster",   partNumber:"91166A210", url:"",                                    pkgQty:100, pkgPrice:"2.96",  unitCost:"0.03", isStock:true,  notes:"" },
  { id:"catB", name:"M4 T-Nut",          vendor:"framingtech", partNumber:"",          url:"",                                    pkgQty:20,  pkgPrice:"3.00",  unitCost:"0.15", isStock:true,  notes:"For aluminum extrusion" },
  { id:"catC", name:"Leveling Foot",      vendor:"mcmaster",   partNumber:"60945K52",  url:"",                                    pkgQty:1,   pkgPrice:"1.45",  unitCost:"1.45", isStock:false, notes:"M4 thread, 30mm dia" },
];

const EMPTY_PART = {
  id: null, name: "", type: "purchased", qty: 1, unit: "ea",
  vendor: "mcmaster", partNumber: "", url: "", files: "",
  notes: "", unitCost: "", isStock: false, assemblyMins: 0,
};

const EMPTY_CALC = {
  filamentId: "", filamentGrams: "", printTimeHrs: "", hasSupports: false,
  supportRemovalMins: 15, setupMins: 10, cleanupMins: 5, markup: "",
};

function uid() { return Math.random().toString(36).slice(2, 10); }
function n2(v) { const f = parseFloat(v); return isNaN(f) ? 0 : f; }

// ─── PART RESOLVER ────────────────────────────────────────────────────────────
function resolvePart(part, catalog) {
  if (!part.catalogId) return part;
  const cat = catalog.find(c => c.id === part.catalogId);
  if (!cat) return { ...part, name: "[Deleted catalog item]", type: "purchased" };
  return {
    type: "purchased",
    name:       cat.name,
    vendor:     cat.vendor,
    partNumber: cat.partNumber,
    url:        cat.url,
    unitCost:   cat.unitCost,
    isStock:    cat.isStock,
    notes:      cat.notes,
    ...part,
  };
}

// ─── STORAGE ──────────────────────────────────────────────────────────────────
function lsGet(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
  catch { return null; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
async function apiGet() {
  try { const r = await fetch("/api/data"); if (!r.ok) return null; return await r.json(); }
  catch { return null; }
}
async function apiSet(key, value) {
  try {
    await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) });
  } catch {}
}

// ─── SEED PROJECT ─────────────────────────────────────────────────────────────
const SEED = [{
  id: "p1", name: "Filament Dry Box",
  description: "Airtight enclosure with humidity sensor mount",
  created: "2024-11-03",
  delivery: [
    { id: "d1", vendor: "sendcutsend", amount: "8.50" },
    { id: "d2", vendor: "mcmaster",    amount: "0"    },
  ],
  parts: [
    { id:"a1", catalogId:"cat1", qty:12, unit:"ea", notes:"Lid fasteners", assemblyMins:0.5, files:"" },
    { id:"a2", catalogId:"cat6", qty:12, unit:"ea", notes:"",              assemblyMins:1,   files:"" },
    { id:"a3", catalogId:null, name:"Lid Panel",       type:"custom_cut", qty:1, unit:"ea", vendor:"sendcutsend", partNumber:"", url:"", files:"lid_panel.dxf",       notes:"3mm acrylic",      unitCost:"4.80", isStock:false, assemblyMins:5  },
    { id:"a4", catalogId:null, name:"Main Body Shell", type:"3d_printed",  qty:1, unit:"ea", vendor:"bambu",       partNumber:"", url:"", files:"dry_box_body.stl",    notes:"PETG, 40% infill", unitCost:"3.45", isStock:false, assemblyMins:10 },
    { id:"a5", catalogId:null, name:"Sensor Bracket",  type:"3d_printed",  qty:2, unit:"ea", vendor:"bambu",       partNumber:"", url:"", files:"sensor_bracket.stl", notes:"PLA+",             unitCost:"1.20", isStock:false, assemblyMins:3  },
  ],
}];

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg: "#080e16", surface: "#060d14", border: "#0e2235", border2: "#1e3a52",
  accent: "#00d4ff", text: "#c8d8e8", muted: "#3a5a72", dim: "#2a4a62", faint: "#4a6a82",
  green: "#3ba55c", red: "#e05252", yellow: "#e8a020", purple: "#a78bfa",
};
const baseBtn  = { border: `1px solid ${C.border2}`, borderRadius: 4, padding: "8px 14px", cursor: "pointer", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: "0.05em", transition: "opacity 0.1s" };
const btnPrimary  = { ...baseBtn, background: C.accent,     color: "#041219", border: "none" };
const btnGhost    = { ...baseBtn, background: "transparent", color: "#6b8fa8" };
const btnDanger   = { ...baseBtn, background: "transparent", color: C.red,   borderColor: C.red   + "44" };
const btnGreenOut = { ...baseBtn, background: "transparent", color: C.green, borderColor: C.green + "44" };
const inp = { width: "100%", boxSizing: "border-box", background: "#0a131c", border: `1px solid ${C.border2}`, borderRadius: 4, color: C.text, padding: "8px 10px", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: "none" };
const sel = { ...inp, cursor: "pointer" };

// ─── MICRO COMPONENTS ─────────────────────────────────────────────────────────
function Badge({ vendorId }) {
  const v = VENDORS.find(x => x.id === vendorId);
  if (!v) return null;
  return <span style={{ background: v.color + "22", color: v.color, border: `1px solid ${v.color}55`, borderRadius: 3, padding: "2px 6px", fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{v.short}</span>;
}
function F({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", color: "#6b8fa8", fontSize: 10, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>{label}</label>
      {children}
      {hint && <div style={{ color: "#445", fontSize: 10, marginTop: 3 }}>{hint}</div>}
    </div>
  );
}
function HR({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 14px" }}>
      <div style={{ flex: 1, height: 1, background: C.border }} />
      {label && <span style={{ color: "#6b8fa8", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>}
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  );
}
function Modal({ title, onClose, width = 540, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#00000099", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(3px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#0a1520", border: `1px solid ${C.border2}`, borderRadius: 8, width: `min(96vw, ${width}px)`, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 64px #000e" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 22px 12px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ color: C.accent, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6b8fa8", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "20px 22px" }}>{children}</div>
      </div>
    </div>
  );
}
function Stat({ label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ color: "#6b8fa8", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color ?? C.muted, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}

// ─── URL EXTRACTOR ────────────────────────────────────────────────────────────
function extractFromUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace("www.", "");
    const path = u.pathname.replace(/\/+$/, "");
    if (host.includes("mcmaster.com")) { const m = path.match(/\/([A-Z0-9]{5,12})\/?$/i); if (m) return { vendor: "mcmaster", partNumber: m[1].toUpperCase() }; }
    if (host.includes("sendcutsend.com")) return { vendor: "sendcutsend", partNumber: "" };
    if (host.includes("framingtech.com")) { const m = path.match(/\/([A-Z0-9\-]{3,20})\/?$/i); return { vendor: "framingtech", partNumber: m ? m[1].toUpperCase() : "" }; }
    if (host.includes("bambulab.com")) return { vendor: "bambu", partNumber: "" };
    return null;
  } catch { return null; }
}

// ─── INVOICE IMPORT MODAL ────────────────────────────────────────────────────
function InvoiceImportModal({ catalog, onImport, onClose }) {
  const [stage, setStage]     = useState("upload"); // upload | processing | review
  const [items, setItems]     = useState([]);
  const [selected, setSelected] = useState({});
  const [error, setError]     = useState(null);
  const [filename, setFilename] = useState("");

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFilename(file.name);
    setStage("processing");
    setError(null);

    // Read as base64
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    try {
      const res = await fetch("/api/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64: base64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      // Match against existing catalog by part number
      const enriched = data.parts.map(p => {
        const existing = catalog.find(c => c.partNumber && c.partNumber === p.partNumber);
        let status = "new";
        if (existing) {
          const oldCost = parseFloat(existing.unitCost);
          const newCost = parseFloat(p.unitCost);
          status = Math.abs(oldCost - newCost) > 0.0001 ? "price_changed" : "exists";
        }
        return { ...p, status, existingId: existing?.id ?? null };
      });

      setItems(enriched);
      // Pre-select new and price_changed items
      const sel = {};
      enriched.forEach((item, i) => {
        if (item.status !== "exists") sel[i] = true;
      });
      setSelected(sel);
      setStage("review");
    } catch (err) {
      setError(err.message);
      setStage("upload");
    }
  }

  function toggleAll(val) {
    const sel = {};
    items.forEach((_, i) => { sel[i] = val; });
    setSelected(sel);
  }

  function confirm() {
    const toImport = items.filter((_, i) => selected[i]);
    onImport(toImport);
  }

  const statusLabel = {
    new:           { label: "New",           color: C.green  },
    price_changed: { label: "Price changed", color: C.yellow },
    exists:        { label: "Already exists",color: C.faint  },
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <Modal title="📄  Import McMaster Invoice" onClose={onClose} width={780}>
      {stage === "upload" && (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📄</div>
          <div style={{ color: C.text, fontSize: 14, marginBottom: 8 }}>Upload a McMaster-Carr invoice PDF</div>
          <div style={{ color: "#6b8fa8", fontSize: 11, marginBottom: 24 }}>Claude will extract all line items and match them against your catalog</div>
          {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 16, background: C.red + "18", border: `1px solid ${C.red}44`, borderRadius: 6, padding: "10px 16px" }}>⚠ {error}</div>}
          <label style={{ ...btnPrimary, display: "inline-block", cursor: "pointer", padding: "10px 24px" }}>
            Choose PDF
            <input type="file" accept=".pdf" onChange={handleFile} style={{ display: "none" }} />
          </label>
        </div>
      )}

      {stage === "processing" && (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ color: C.accent, fontSize: 13, marginBottom: 8 }}>Reading {filename}…</div>
          <div style={{ color: "#6b8fa8", fontSize: 11 }}>Claude is extracting line items from your invoice</div>
          <div style={{ marginTop: 24, display: "flex", justifyContent: "center", gap: 6 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: C.accent, opacity: 0.4, animation: `pulse 1.2s ${i*0.2}s infinite` }} />
            ))}
          </div>
          <style>{`@keyframes pulse { 0%,100%{opacity:0.2} 50%{opacity:1} }`}</style>
        </div>
      )}

      {stage === "review" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ color: "#6b8fa8", fontSize: 11 }}>
              Found <strong style={{ color: C.text }}>{items.length}</strong> line items in <strong style={{ color: C.text }}>{filename}</strong>
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={() => toggleAll(true)}  style={{ ...btnGhost, padding: "4px 10px", fontSize: 10 }}>Select all</button>
            <button onClick={() => toggleAll(false)} style={{ ...btnGhost, padding: "4px 10px", fontSize: 10 }}>Clear</button>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
            <thead>
              <tr style={{ color: "#6b8fa8", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                <th style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}`, width: 28 }}></th>
                {["Status","Name","Part #","Pkg","Unit Cost","Notes"].map((h,i) => (
                  <th key={i} style={{ padding: "6px 8px", textAlign: "left", borderBottom: `1px solid ${C.border}`, fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const st = statusLabel[item.status];
                const isChecked = !!selected[i];
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, opacity: item.status === "exists" && !isChecked ? 0.45 : 1 }}>
                    <td style={{ padding: "9px 8px" }}>
                      <input type="checkbox" checked={isChecked} onChange={() => setSelected(s => ({ ...s, [i]: !s[i] }))} />
                    </td>
                    <td style={{ padding: "9px 8px" }}>
                      <span style={{ background: st.color + "22", color: st.color, border: `1px solid ${st.color}44`, borderRadius: 3, padding: "2px 6px", fontSize: 9, fontWeight: 700, whiteSpace: "nowrap" }}>
                        {st.label}
                      </span>
                    </td>
                    <td style={{ padding: "9px 8px", color: C.text, fontSize: 12, fontWeight: 500 }}>{item.name}</td>
                    <td style={{ padding: "9px 8px", color: "#6b8fa8", fontSize: 11, fontFamily: "monospace" }}>{item.partNumber || "—"}</td>
                    <td style={{ padding: "9px 8px", color: "#6b8fa8", fontSize: 11, fontFamily: "monospace" }}>
                      {item.pkgQty > 1 ? `${item.pkgQty} @ $${n2(item.pkgPrice).toFixed(2)}` : "—"}
                    </td>
                    <td style={{ padding: "9px 8px", color: C.accent, fontSize: 12, fontFamily: "monospace" }}>${n2(item.unitCost).toFixed(4)}/ea</td>
                    <td style={{ padding: "9px 8px", color: "#6b8fa8", fontSize: 11 }}>{item.notes || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ display: "flex", alignItems: "center", gap: 10, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
            <div style={{ color: "#6b8fa8", fontSize: 11 }}>
              {selectedCount} item{selectedCount !== 1 ? "s" : ""} selected —&nbsp;
              <span style={{ color: C.green }}>{items.filter((_,i) => selected[i] && items[i].status === "new").length} new</span>,&nbsp;
              <span style={{ color: C.yellow }}>{items.filter((_,i) => selected[i] && items[i].status === "price_changed").length} price updates</span>
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={onClose} style={btnGhost}>Cancel</button>
            <button onClick={confirm} style={{ ...btnPrimary, opacity: selectedCount ? 1 : 0.4 }} disabled={!selectedCount}>
              Import {selectedCount} part{selectedCount !== 1 ? "s" : ""} → Catalog
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ─── PARTS CATALOG MODAL ──────────────────────────────────────────────────────
function CatalogModal({ catalog, onSave, onClose }) {
  const [list, setList]       = useState(catalog);
  const [editing, setEditing] = useState(null);
  const [form, setForm]       = useState({});
  const [search, setSearch]   = useState("");
  const setF = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  const tog  = k => () => setForm(p => ({ ...p, [k]: !p[k] }));

  function startNew() { setForm({ name: "", vendor: "mcmaster", partNumber: "", url: "", pkgQty: "1", pkgPrice: "", unitCost: "", isStock: false, notes: "" }); setEditing("new"); }
  function startEdit(c) { setForm({ pkgQty: "1", pkgPrice: "", ...c }); setEditing(c); }
  function saveForm() {
    if (!form.name.trim()) return;
    const pq = parseFloat(form.pkgQty) || 1;
    const pp = parseFloat(form.pkgPrice) || 0;
    const derived = pp > 0 ? (pp / pq).toFixed(4) : form.unitCost;
    const entry = { ...form, pkgQty: pq, unitCost: derived };
    if (editing === "new") setList(l => [...l, { ...entry, id: uid() }]);
    else setList(l => l.map(x => x.id === editing.id ? { ...x, ...entry } : x));
    setEditing(null);
  }
  function remove(id) { setList(l => l.filter(x => x.id !== id)); }
  const handleUrl = e => {
    const url = e.target.value;
    const ex = url ? extractFromUrl(url) : null;
    setForm(p => ({ ...p, url, ...(ex ? { vendor: ex.vendor || p.vendor, partNumber: ex.partNumber || p.partNumber } : {}) }));
  };
  const [showImport, setShowImport] = useState(false);
  const filtered = list.filter(c => !search || [c.name, c.partNumber, c.notes].some(v => v?.toLowerCase().includes(search.toLowerCase())));

  function handleInvoiceImport(items) {
    setList(existing => {
      let updated = [...existing];
      items.forEach(item => {
        const idx = updated.findIndex(c => c.partNumber && c.partNumber === item.partNumber);
        if (idx >= 0) {
          // Update price on existing
          updated[idx] = { ...updated[idx], pkgQty: item.pkgQty, pkgPrice: String(item.pkgPrice), unitCost: String(item.unitCost) };
        } else {
          // Add new
          updated.push({
            id: uid(),
            name: item.name,
            vendor: "mcmaster",
            partNumber: item.partNumber || "",
            url: item.partNumber ? `https://www.mcmaster.com/${item.partNumber}/` : "",
            pkgQty: item.pkgQty || 1,
            pkgPrice: String(item.pkgPrice || ""),
            unitCost: String(item.unitCost || ""),
            isStock: true,
            notes: item.notes || "",
          });
        }
      });
      return updated;
    });
    setShowImport(false);
  }

  return (
    <Modal title="🗂  Parts Catalog" onClose={onClose} width={760}>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
        <input style={{ ...inp, width: 220 }} placeholder="Search by name or part #…" value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ flex: 1 }} />
        <span style={{ color: "#6b8fa8", fontSize: 11 }}>{list.length} parts</span>
        {!editing && <><button onClick={() => setShowImport(true)} style={{ ...btnGhost, color: C.yellow, borderColor: C.yellow + "44" }}>📄 Import Invoice</button><button onClick={startNew} style={btnPrimary}>+ Add Part</button></>}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <thead>
          <tr style={{ color: "#6b8fa8", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {["Name","Vendor","Part #","Pkg","Unit Cost","","Notes",""].map((h,i) => (
              <th key={i} style={{ padding: "6px 8px", textAlign: "left", borderBottom: `1px solid ${C.border}`, fontWeight: 700 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map(c => (
            <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: "9px 8px", color: C.text, fontSize: 12, fontWeight: 500 }}>{c.name}</td>
              <td style={{ padding: "9px 8px" }}><Badge vendorId={c.vendor} /></td>
              <td style={{ padding: "9px 8px", color: "#6b8fa8", fontSize: 11, fontFamily: "monospace" }}>{c.partNumber || <span style={{ color: C.faint }}>—</span>}</td>
              <td style={{ padding: "9px 8px" }}>
                {c.pkgQty > 1 ? (
                  <span style={{ color: "#6b8fa8", fontSize: 11, fontFamily: "monospace" }}>
                    {c.pkgQty} @ ${n2(c.pkgPrice).toFixed(2)}
                  </span>
                ) : <span style={{ color: C.faint }}>—</span>}
              </td>
              <td style={{ padding: "9px 8px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <span style={{ color: C.accent, fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}>${n2(c.unitCost).toFixed(4)}/ea</span>
                  {c.pkgQty > 1 && <span style={{ color: C.faint, fontSize: 9 }}>pkg: ${n2(c.pkgPrice).toFixed(2)}</span>}
                </div>
              </td>
              <td style={{ padding: "9px 8px" }}>{c.isStock && <span style={{ background: C.yellow + "22", color: C.yellow, border: `1px solid ${C.yellow}44`, borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700 }}>STOCK</span>}</td>
              <td style={{ padding: "9px 8px", color: "#6b8fa8", fontSize: 11, maxWidth: 180 }}>{c.notes || <span style={{ color: C.faint }}>—</span>}</td>
              <td style={{ padding: "9px 8px" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => startEdit(c)} style={{ ...btnGhost, padding: "3px 8px", fontSize: 9 }}>edit</button>
                  <button onClick={() => remove(c.id)} style={{ ...btnDanger, padding: "3px 8px", fontSize: 9 }}>✕</button>
                </div>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan={7} style={{ padding: "24px 8px", color: "#6b8fa8", fontSize: 12, textAlign: "center" }}>{search ? "No parts match." : "No parts yet."}</td></tr>}
        </tbody>
      </table>

      {editing && (
        <div style={{ background: "#040b12", border: `1px solid ${C.border2}`, borderRadius: 6, padding: 16, marginBottom: 16 }}>
          <div style={{ color: C.accent, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>{editing === "new" ? "New Catalog Part" : "Edit Catalog Part"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "0 16px" }}>
            <div style={{ gridColumn: "1/-1" }}><F label="Part Name"><input style={inp} value={form.name} onChange={setF("name")} placeholder="e.g. M3×8 SHCS" autoFocus /></F></div>
            <F label="Vendor"><select style={sel} value={form.vendor} onChange={setF("vendor")}>{VENDORS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select></F>
            <F label="Part Number"><input style={inp} value={form.partNumber} onChange={setF("partNumber")} placeholder="e.g. 91292A113" /></F>
            <F label="Unit Cost ($)"><input style={inp} type="number" step="0.01" value={form.unitCost} onChange={setF("unitCost")} placeholder="0.00" /></F>
            <div style={{ gridColumn: "1/-1" }}>
              <F label="URL — paste to auto-detect vendor & part #">
                <div style={{ display: "flex", gap: 8 }}>
                  <input style={{ ...inp, flex: 1 }} value={form.url} onChange={handleUrl} placeholder="https://www.mcmaster.com/…" />
                  <button type="button" onClick={() => form.url && window.open(form.url, "_blank")}
                    style={{ ...btnGhost, padding: "7px 12px", fontSize: 11, opacity: form.url ? 1 : 0.3, cursor: form.url ? "pointer" : "default", whiteSpace: "nowrap", flexShrink: 0 }}
                    disabled={!form.url} title="Open URL">↗ Open</button>
                </div>
              </F>
            </div>
            <F label="Pkg Qty (units per package)">
              <input style={inp} type="number" min="1" value={form.pkgQty} onChange={setF("pkgQty")} placeholder="e.g. 100" />
            </F>
            <F label="Pkg Price ($)">
              <input style={inp} type="number" step="0.01" value={form.pkgPrice} onChange={setF("pkgPrice")} placeholder="e.g. 8.74" />
            </F>
            <F label="Unit Cost ($/ea)" hint={form.pkgQty && form.pkgPrice && parseFloat(form.pkgPrice) > 0 ? `Auto: $${(parseFloat(form.pkgPrice) / (parseFloat(form.pkgQty)||1)).toFixed(4)}/ea` : "Or enter manually if no pkg data"}>
              <input style={{ ...inp, opacity: (form.pkgPrice && parseFloat(form.pkgPrice) > 0) ? 0.5 : 1 }}
                type="number" step="0.0001" value={
                  form.pkgPrice && parseFloat(form.pkgPrice) > 0
                    ? (parseFloat(form.pkgPrice) / (parseFloat(form.pkgQty)||1)).toFixed(4)
                    : form.unitCost
                }
                onChange={setF("unitCost")}
                readOnly={!!(form.pkgPrice && parseFloat(form.pkgPrice) > 0)}
                placeholder="0.0000"
              />
            </F>
            <div style={{ gridColumn: "1/-1" }}><F label="Notes"><input style={inp} value={form.notes} onChange={setF("notes")} placeholder="Material, spec, application…" /></F></div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: C.text, fontSize: 12, marginBottom: 14 }}>
                <input type="checkbox" checked={!!form.isStock} onChange={tog("isStock")} />
                Stock item — kept on hand, not procured per-build
              </label>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setEditing(null)} style={btnGhost}>Cancel</button>
            <button onClick={saveForm} style={btnPrimary}>Save to Catalog</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
        <button onClick={onClose} style={btnGhost}>Cancel</button>
        <button onClick={() => onSave(list)} style={btnPrimary}>Save Catalog</button>
      </div>

      {showImport && (
        <InvoiceImportModal
          catalog={list}
          onImport={handleInvoiceImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </Modal>
  );
}

// ─── FILAMENT LIBRARY MODAL ───────────────────────────────────────────────────
const MATERIALS = ["PLA","PETG","ABS","ASA","TPU","TPE","Nylon","PC","HIPS","PVA","CF-PLA","CF-PETG","Other"];
function FilamentLibraryModal({ filaments, onSave, onClose }) {
  const [list, setList]       = useState(filaments);
  const [editing, setEditing] = useState(null);
  const [form, setForm]       = useState({});
  const setF = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  function startNew() { setForm({ name: "", brand: "", material: "PLA", color: "#e8e8e8", spoolCost: "", spoolSize: 1000 }); setEditing("new"); }
  function startEdit(f) { setForm({ ...f }); setEditing(f); }
  function saveForm() {
    if (!form.name.trim()) return;
    const entry = { ...form, spoolCost: parseFloat(form.spoolCost)||0, spoolSize: parseFloat(form.spoolSize)||1000 };
    if (editing === "new") setList(l => [...l, { ...entry, id: uid() }]);
    else setList(l => l.map(x => x.id === editing.id ? { ...x, ...entry } : x));
    setEditing(null);
  }
  function remove(id) { setList(l => l.filter(x => x.id !== id)); }
  const gpg = f => f.spoolSize > 0 ? (f.spoolCost / f.spoolSize) : 0;

  return (
    <Modal title="🧵  Filament Library" onClose={onClose} width={620}>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <thead><tr style={{ color: "#6b8fa8", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>{["","Name","Brand","Material","Spool","$/g",""].map((h,i) => <th key={i} style={{ padding: "6px 8px", textAlign: "left", borderBottom: `1px solid ${C.border}`, fontWeight: 700 }}>{h}</th>)}</tr></thead>
        <tbody>
          {list.map(f => (
            <tr key={f.id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: "9px 8px", width: 16 }}><div style={{ width: 12, height: 12, borderRadius: "50%", background: f.color, border: `1px solid ${C.border2}` }} /></td>
              <td style={{ padding: "9px 8px", color: C.text, fontSize: 12, fontWeight: 500 }}>{f.name}</td>
              <td style={{ padding: "9px 8px", color: "#6b8fa8", fontSize: 12 }}>{f.brand}</td>
              <td style={{ padding: "9px 8px" }}><span style={{ background: C.border2, color: C.text, borderRadius: 3, padding: "2px 6px", fontSize: 10, fontFamily: "monospace" }}>{f.material}</span></td>
              <td style={{ padding: "9px 8px", color: "#6b8fa8", fontSize: 12 }}>${n2(f.spoolCost).toFixed(2)} / {f.spoolSize}g</td>
              <td style={{ padding: "9px 8px", color: C.accent, fontSize: 11, fontFamily: "monospace" }}>${gpg(f).toFixed(4)}</td>
              <td style={{ padding: "9px 8px" }}><div style={{ display: "flex", gap: 6 }}><button onClick={() => startEdit(f)} style={{ ...btnGhost, padding: "3px 8px", fontSize: 9 }}>edit</button><button onClick={() => remove(f.id)} style={{ ...btnDanger, padding: "3px 8px", fontSize: 9 }}>✕</button></div></td>
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={7} style={{ padding: "24px 8px", color: "#6b8fa8", fontSize: 12, textAlign: "center" }}>No filaments yet</td></tr>}
        </tbody>
      </table>
      {editing ? (
        <div style={{ background: "#040b12", border: `1px solid ${C.border2}`, borderRadius: 6, padding: 16, marginBottom: 16 }}>
          <div style={{ color: C.accent, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>{editing === "new" ? "New Filament" : "Edit Filament"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 16px" }}>
            <div style={{ gridColumn: "1/-1" }}><F label="Name"><input style={inp} value={form.name} onChange={setF("name")} placeholder="e.g. Bambu PLA Basic - White" /></F></div>
            <F label="Brand"><input style={inp} value={form.brand} onChange={setF("brand")} placeholder="e.g. Bambu Labs" /></F>
            <F label="Material"><select style={sel} value={form.material} onChange={setF("material")}>{MATERIALS.map(m => <option key={m}>{m}</option>)}</select></F>
            <F label="Color (hex)"><div style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="color" value={form.color} onChange={setF("color")} style={{ width: 36, height: 34, border: `1px solid ${C.border2}`, borderRadius: 4, background: "none", cursor: "pointer", padding: 2 }} /><input style={{ ...inp, flex: 1 }} value={form.color} onChange={setF("color")} /></div></F>
            <F label="Spool Cost ($)"><input style={inp} type="number" step="0.01" value={form.spoolCost} onChange={setF("spoolCost")} /></F>
            <F label="Spool Size (g)"><input style={inp} type="number" value={form.spoolSize} onChange={setF("spoolSize")} /></F>
            <F label="Cost per gram"><div style={{ color: C.accent, fontSize: 13, fontFamily: "monospace", paddingTop: 8 }}>${form.spoolCost && form.spoolSize ? (n2(form.spoolCost) / (n2(form.spoolSize) || 1)).toFixed(4) : "—"}/g</div></F>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button onClick={() => setEditing(null)} style={btnGhost}>Cancel</button><button onClick={saveForm} style={btnPrimary}>Save Filament</button></div>
        </div>
      ) : (
        <button onClick={startNew} style={{ ...btnGreenOut, marginBottom: 16 }}>+ Add Filament</button>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><button onClick={onClose} style={btnGhost}>Cancel</button><button onClick={() => onSave(list)} style={btnPrimary}>Save Library</button></div>
    </Modal>
  );
}

// ─── PRINT CALC ───────────────────────────────────────────────────────────────
function PrintCalc({ settings, filaments, onApply, onClose }) {
  const [c, setC] = useState(EMPTY_CALC);
  const s   = k => e => setC(p => ({ ...p, [k]: e.target.value }));
  const tog = k => () => setC(p => ({ ...p, [k]: !p[k] }));
  const filament = filaments.find(f => f.id === c.filamentId);
  const gpg    = filament ? n2(filament.spoolCost) / (n2(filament.spoolSize) || 1) : 0;
  const fCost  = n2(c.filamentGrams) * gpg;
  const hrs    = n2(c.printTimeHrs);
  const elec   = (settings.printerWatts / 1000) * hrs * settings.electricityRate;
  const wear   = hrs * settings.wearTearRate;
  const lr     = settings.laborRate;
  const setup  = (n2(c.setupMins)   / 60) * lr;
  const cleanup= (n2(c.cleanupMins) / 60) * lr;
  const support= c.hasSupports ? (n2(c.supportRemovalMins) / 60) * lr : 0;
  const sub    = fCost + elec + wear + setup + cleanup + support;
  const mu     = n2(c.markup !== "" ? c.markup : settings.defaultMarkup);
  const total  = sub * (1 + mu / 100);
  const rows   = [
    { l: "Filament",    v: fCost,   d: `${n2(c.filamentGrams).toFixed(1)}g × $${gpg.toFixed(4)}/g${filament ? ` (${filament.name})` : ""}` },
    { l: "Electricity", v: elec,    d: `${hrs}h × ${settings.printerWatts}W @ $${settings.electricityRate}/kWh` },
    { l: "Wear & Tear", v: wear,    d: `${hrs}h × $${settings.wearTearRate}/hr` },
    { l: "Setup",       v: setup,   d: `${c.setupMins}min @ $${lr}/hr` },
    { l: "Cleanup",     v: cleanup, d: `${c.cleanupMins}min @ $${lr}/hr` },
    ...(c.hasSupports ? [{ l: "Support Removal", v: support, d: `${c.supportRemovalMins}min @ $${lr}/hr` }] : []),
  ];
  return (
    <Modal title="🖨️  3D Print Cost Calculator" onClose={onClose} width={620}>
      <HR label="Filament" />
      {filaments.length === 0 ? (
        <div style={{ color: C.yellow, fontSize: 12, marginBottom: 14 }}>⚠ No filaments — add some in the Filament Library</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, marginBottom: 16 }}>
          {filaments.map(f => (
            <div key={f.id} onClick={() => setC(p => ({ ...p, filamentId: f.id }))}
              style={{ border: `1px solid ${c.filamentId === f.id ? C.accent : C.border2}`, background: c.filamentId === f.id ? C.accent + "12" : "#040b12", borderRadius: 5, padding: "10px 12px", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: f.color, flexShrink: 0 }} />
                <span style={{ color: C.text, fontSize: 11, fontWeight: 700 }}>{f.name}</span>
              </div>
              <div style={{ color: "#6b8fa8", fontSize: 10 }}>{f.material} · ${n2(f.spoolCost).toFixed(2)}/{f.spoolSize}g</div>
              <div style={{ color: C.accent, fontSize: 10, fontFamily: "monospace", marginTop: 2 }}>${(n2(f.spoolCost)/(n2(f.spoolSize)||1)).toFixed(4)}/g</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 22px" }}>
        <div>
          <HR label="Print Details" />
          <F label="Filament Used (grams)"><input style={inp} type="number" step="0.1" value={c.filamentGrams} onChange={s("filamentGrams")} placeholder="e.g. 48" /></F>
          <F label="Print Time (hours)"><input style={inp} type="number" step="0.25" value={c.printTimeHrs} onChange={s("printTimeHrs")} placeholder="e.g. 3.5" /></F>
        </div>
        <div>
          <HR label="Labor" />
          <F label="Setup Time (mins)"><input style={inp} type="number" value={c.setupMins} onChange={s("setupMins")} /></F>
          <F label="Cleanup Time (mins)"><input style={inp} type="number" value={c.cleanupMins} onChange={s("cleanupMins")} /></F>
          <div style={{ marginBottom: 14 }}><label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: C.text, fontSize: 12 }}><input type="checkbox" checked={c.hasSupports} onChange={tog("hasSupports")} />Part has supports</label></div>
          {c.hasSupports && <F label="Support Removal (mins)"><input style={inp} type="number" value={c.supportRemovalMins} onChange={s("supportRemovalMins")} /></F>}
          <F label={`Markup % (default ${settings.defaultMarkup}%)`}><input style={inp} type="number" value={c.markup} onChange={s("markup")} placeholder={`${settings.defaultMarkup}`} /></F>
        </div>
      </div>
      <div style={{ background: "#040b12", border: `1px solid ${C.border}`, borderRadius: 6, padding: 16, marginTop: 8 }}>
        <div style={{ color: "#6b8fa8", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Cost Breakdown</div>
        {rows.map(r => (
          <div key={r.l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: 12 }}>
            <span style={{ color: "#6b8fa8" }}>{r.l} <span style={{ color: C.faint, fontSize: 10 }}>({r.d})</span></span>
            <span style={{ color: C.text, fontFamily: "monospace" }}>${r.v.toFixed(4)}</span>
          </div>
        ))}
        <div style={{ height: 1, background: C.border2, margin: "10px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b8fa8", marginBottom: 5 }}><span>Subtotal</span><span style={{ fontFamily: "monospace" }}>${sub.toFixed(4)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b8fa8", marginBottom: 5 }}><span>Markup ({mu}%)</span><span style={{ fontFamily: "monospace" }}>+${(total - sub).toFixed(4)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700, marginTop: 6 }}><span style={{ color: C.text }}>Unit Cost</span><span style={{ color: C.accent, fontFamily: "'JetBrains Mono', monospace" }}>${total.toFixed(2)}</span></div>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
        <button onClick={onClose} style={btnGhost}>Cancel</button>
        <button onClick={() => onApply(total.toFixed(2))} style={{ ...btnPrimary, opacity: (!c.filamentGrams || !c.printTimeHrs || !c.filamentId) ? 0.4 : 1 }} disabled={!c.filamentGrams || !c.printTimeHrs || !c.filamentId}>Apply → ${total.toFixed(2)}</button>
      </div>
    </Modal>
  );
}

// ─── SETTINGS MODAL ───────────────────────────────────────────────────────────
function SettingsModal({ settings, onSave, onClose }) {
  const [s, setS] = useState(settings);
  const set = k => e => setS(p => ({ ...p, [k]: parseFloat(e.target.value) || 0 }));
  return (
    <Modal title="⚙️  Global Settings" onClose={onClose} width={460}>
      <HR label="Labor" />
      <F label="Labor Rate ($/hr)" hint="Assembly time, print setup, cleanup, support removal"><input style={inp} type="number" step="1" value={s.laborRate} onChange={set("laborRate")} /></F>
      <HR label="Printer" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <F label="Printer Wattage (W)"><input style={inp} type="number" value={s.printerWatts} onChange={set("printerWatts")} /></F>
        <F label="Electricity ($/kWh)"><input style={inp} type="number" step="0.01" value={s.electricityRate} onChange={set("electricityRate")} /></F>
        <F label="Wear & Tear ($/hr)"><input style={inp} type="number" step="0.05" value={s.wearTearRate} onChange={set("wearTearRate")} /></F>
        <F label="Default Markup (%)"><input style={inp} type="number" value={s.defaultMarkup} onChange={set("defaultMarkup")} /></F>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><button onClick={onClose} style={btnGhost}>Cancel</button><button onClick={() => onSave(s)} style={btnPrimary}>Save Settings</button></div>
    </Modal>
  );
}

// ─── PART MODAL ───────────────────────────────────────────────────────────────
function PartModal({ initial, settings, filaments, catalog, onSave, onClose }) {
  const [catalogId, setCatalogId] = useState(initial?.catalogId ?? null);
  const [form, setForm]           = useState({ ...EMPTY_PART, ...(initial ?? {}) });
  const [catSearch, setCatSearch] = useState("");
  const [showCalc, setShowCalc]   = useState(false);
  const [urlHint, setUrlHint]     = useState(null);

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  const tog = k => () => setForm(p => ({ ...p, [k]: !p[k] }));

  const catalogItem   = catalogId ? catalog.find(c => c.id === catalogId) : null;
  const effectiveType = catalogItem ? "purchased" : form.type;
  const is3D          = effectiveType === "3d_printed";
  const isPurchased   = effectiveType === "purchased";
  const hasFiles      = ["3d_printed", "custom_cut", "drawing"].includes(effectiveType);

  const filteredCatalog = catalog.filter(c =>
    !catSearch || [c.name, c.partNumber, c.notes].some(v => v?.toLowerCase().includes(catSearch.toLowerCase()))
  );

  const handleUrl = e => {
    const url = e.target.value;
    const ex = url ? extractFromUrl(url) : null;
    setForm(p => ({ ...p, url, ...(ex ? { vendor: ex.vendor || p.vendor, partNumber: ex.partNumber || p.partNumber } : {}) }));
    setUrlHint(ex || null);
  };

  function pickFromCatalog(item) { setCatalogId(item.id); setCatSearch(""); }

  function clearCatalog() {
    if (catalogItem) setForm(p => ({ ...p, name: catalogItem.name, vendor: catalogItem.vendor, partNumber: catalogItem.partNumber, url: catalogItem.url, unitCost: catalogItem.unitCost, isStock: catalogItem.isStock, type: "purchased" }));
    setCatalogId(null);
  }

  function save() {
    if (catalogId) {
      onSave({ id: form.id ?? uid(), catalogId, qty: form.qty || 1, unit: form.unit || "ea", assemblyMins: form.assemblyMins || 0, files: form.files || "", notes: form.notes || "" });
    } else {
      if (!form.name?.trim()) return;
      onSave({ ...form, id: form.id ?? uid(), catalogId: null });
    }
  }

  const canSave = catalogId ? true : !!form.name?.trim();

  return (
    <>
      <Modal title={initial ? "Edit Part" : "Add Part"} onClose={onClose} width={640}>

        {/* Catalog picker — shown for purchased type */}
        {isPurchased && (
          <>
            {catalogItem ? (
              <div style={{ background: C.accent + "0e", border: `1px solid ${C.accent}44`, borderRadius: 6, padding: "12px 16px", marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ color: "#6b8fa8", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>FROM CATALOG</span>
                    <Badge vendorId={catalogItem.vendor} />
                    {catalogItem.isStock && <span style={{ background: C.yellow + "22", color: C.yellow, border: `1px solid ${C.yellow}44`, borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700 }}>STOCK</span>}
                  </div>
                  <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{catalogItem.name}</div>
                  <div style={{ color: "#6b8fa8", fontSize: 11, marginTop: 2 }}>
                    {catalogItem.partNumber && <span style={{ fontFamily: "monospace" }}>#{catalogItem.partNumber} · </span>}
                    <span style={{ color: C.accent, fontFamily: "monospace" }}>${n2(catalogItem.unitCost).toFixed(2)}/ea</span>
                    {catalogItem.notes && <span> · {catalogItem.notes}</span>}
                  </div>
                </div>
                <button onClick={clearCatalog} style={{ ...btnGhost, fontSize: 10, whiteSpace: "nowrap", flexShrink: 0 }}>✕ Detach</button>
              </div>
            ) : (
              <div style={{ background: "#040b12", border: `1px solid ${C.border2}`, borderRadius: 6, padding: 14, marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ color: "#6b8fa8", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>From Parts Catalog</span>
                  <span style={{ color: C.faint, fontSize: 10 }}>{catalog.length} parts available</span>
                </div>
                <input style={{ ...inp, marginBottom: 10 }} placeholder="Search catalog by name or part #…" value={catSearch} onChange={e => setCatSearch(e.target.value)} autoFocus />
                {catalog.length === 0 ? (
                  <div style={{ color: C.yellow, fontSize: 11, padding: "8px 0" }}>⚠ Parts catalog is empty — add parts via 🗂 Parts Catalog.</div>
                ) : (
                  <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                    {filteredCatalog.slice(0, 20).map(c => (
                      <div key={c.id} onClick={() => pickFromCatalog(c)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 4, cursor: "pointer", border: `1px solid ${C.border}`, background: "#060d14" }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = C.accent + "55"}
                        onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
                      >
                        <Badge vendorId={c.vendor} />
                        <span style={{ color: C.text, fontSize: 12, fontWeight: 600, flex: 1 }}>{c.name}</span>
                        {c.partNumber && <span style={{ color: "#6b8fa8", fontSize: 10, fontFamily: "monospace" }}>#{c.partNumber}</span>}
                        {c.isStock && <span style={{ background: C.yellow + "22", color: C.yellow, border: `1px solid ${C.yellow}44`, borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700 }}>STOCK</span>}
                        <span style={{ color: C.accent, fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}>${n2(c.unitCost).toFixed(2)}</span>
                      </div>
                    ))}
                    {filteredCatalog.length === 0 && <div style={{ color: "#6b8fa8", fontSize: 11, padding: "8px 0" }}>No catalog parts match "{catSearch}"</div>}
                  </div>
                )}
                <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 10, paddingTop: 10, color: C.faint, fontSize: 10 }}>Or skip the catalog and fill in the form below for a one-off part.</div>
              </div>
            )}
          </>
        )}

        {/* Form fields */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
          {!catalogItem && (
            <div style={{ gridColumn: "1/-1" }}>
              <F label="Part Name"><input style={inp} value={form.name} onChange={set("name")} placeholder="e.g. Main Body Shell" /></F>
            </div>
          )}
          {!catalogItem && (
            <F label="Type"><select style={sel} value={form.type} onChange={set("type")}>{PART_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}</select></F>
          )}
          {!catalogItem && (
            <F label="Vendor"><select style={sel} value={form.vendor} onChange={set("vendor")}>{VENDORS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select></F>
          )}

          <F label="Qty"><input style={inp} type="number" min="1" value={form.qty} onChange={set("qty")} /></F>
          <F label="Unit"><select style={sel} value={form.unit} onChange={set("unit")}>{["ea","in","mm","ft","m","oz","g","pkg"].map(u => <option key={u}>{u}</option>)}</select></F>

          {!catalogItem && (
            <div style={{ gridColumn: is3D ? "1/-1" : undefined }}>
              <F label="Unit Cost ($)">
                <div style={{ display: "flex", gap: 8 }}>
                  <input style={{ ...inp, flex: 1 }} type="number" step="0.01" value={form.unitCost} onChange={set("unitCost")} placeholder="0.00" />
                  {is3D && <button onClick={() => setShowCalc(true)} style={{ ...btnPrimary, padding: "7px 12px", fontSize: 11, whiteSpace: "nowrap" }}>🖨️ Calculate</button>}
                </div>
              </F>
            </div>
          )}

          {!catalogItem && isPurchased && (
            <F label="Part Number"><input style={inp} value={form.partNumber} onChange={set("partNumber")} placeholder="e.g. 91292A113" /></F>
          )}

          {hasFiles && (
            <div style={{ gridColumn: "1/-1" }}>
              <F label="File References" hint="STL, DXF, or drawing filenames — comma-separated"><input style={inp} value={form.files} onChange={set("files")} placeholder="body.stl, lid_panel.dxf" /></F>
            </div>
          )}
          {/* Also allow files for catalog parts (project-specific STL overrides etc.) */}
          {catalogItem && (
            <div style={{ gridColumn: "1/-1" }}>
              <F label="File References" hint="Project-specific files — comma-separated"><input style={inp} value={form.files} onChange={set("files")} placeholder="custom_bracket.stl" /></F>
            </div>
          )}

          {!catalogItem && isPurchased && (
            <div style={{ gridColumn: "1/-1" }}>
              <F label="URL — paste to auto-detect vendor & part number">
                <input style={inp} value={form.url} onChange={handleUrl} placeholder="https://www.mcmaster.com/91292A113/" />
                {urlHint && <div style={{ marginTop: 5, fontSize: 10, color: C.green, fontFamily: "monospace" }}>✓ Detected {VENDORS.find(v => v.id === urlHint.vendor)?.label ?? urlHint.vendor}{urlHint.partNumber ? ` · Part # ${urlHint.partNumber}` : " · no part number in URL"}</div>}
              </F>
            </div>
          )}

          <div style={{ gridColumn: "1/-1" }}>
            <F label={catalogItem ? "Notes (project-specific, overrides catalog default)" : "Notes"}>
              <input style={inp} value={form.notes} onChange={set("notes")} placeholder={catalogItem ? "Leave blank to use catalog default" : "Material, finish, spec…"} />
            </F>
          </div>
        </div>

        <HR label="Assembly & Inventory" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
          <F label="Assembly Time (mins/unit)" hint="Time to install per unit produced"><input style={inp} type="number" step="0.5" min="0" value={form.assemblyMins} onChange={set("assemblyMins")} placeholder="0" /></F>
          {!catalogItem && isPurchased && (
            <F label="Inventory Status">
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: C.text, fontSize: 12, marginTop: 8 }}>
                <input type="checkbox" checked={!!form.isStock} onChange={tog("isStock")} />
                From stock (not tracked per-build)
              </label>
              <div style={{ color: "#445", fontSize: 10, marginTop: 4 }}>Cost counts toward BOM total</div>
            </F>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button onClick={save} style={{ ...btnPrimary, opacity: canSave ? 1 : 0.4 }} disabled={!canSave}>Save Part</button>
        </div>
      </Modal>

      {showCalc && (
        <PrintCalc settings={settings} filaments={filaments ?? []}
          onApply={cost => { setForm(p => ({ ...p, unitCost: cost })); setShowCalc(false); }}
          onClose={() => setShowCalc(false)} />
      )}
    </>
  );
}

// ─── PROJECT MODAL ────────────────────────────────────────────────────────────
function ProjectModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial ?? { name: "", description: "" });
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  return (
    <Modal title={initial ? "Edit Project" : "New Project"} onClose={onClose} width={440}>
      <F label="Project Name"><input style={inp} value={form.name} onChange={set("name")} placeholder="e.g. Enclosure v2" autoFocus /></F>
      <F label="Description"><textarea style={{ ...inp, minHeight: 70, resize: "vertical" }} value={form.description} onChange={set("description")} /></F>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><button onClick={onClose} style={btnGhost}>Cancel</button><button onClick={() => form.name.trim() && onSave(form)} style={btnPrimary}>Save</button></div>
    </Modal>
  );
}

// ─── DELIVERY MODAL ───────────────────────────────────────────────────────────
function DeliveryModal({ delivery, onSave, onClose }) {
  const [fees, setFees] = useState(delivery?.length ? delivery : VENDORS.map(v => ({ id: uid(), vendor: v.id, amount: "" })));
  const setAmt = (id, val) => setFees(f => f.map(x => x.id === id ? { ...x, amount: val } : x));
  const total = fees.reduce((s, f) => s + n2(f.amount), 0);
  return (
    <Modal title="🚚  Delivery Fees" onClose={onClose} width={380}>
      <div style={{ color: "#6b8fa8", fontSize: 11, marginBottom: 16 }}>Shipping & handling per vendor for this project.</div>
      {fees.map(fee => {
        const v = VENDORS.find(x => x.id === fee.vendor);
        return (
          <div key={fee.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <span style={{ color: "#6b8fa8", fontSize: 12, minWidth: 130 }}>{v?.label}</span>
            <span style={{ color: "#6b8fa8" }}>$</span>
            <input style={{ ...inp, width: 100 }} type="number" step="0.01" value={fee.amount} onChange={e => setAmt(fee.id, e.target.value)} placeholder="0.00" />
          </div>
        );
      })}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#6b8fa8", fontSize: 12 }}>Total Delivery</span>
        <span style={{ color: C.accent, fontFamily: "monospace", fontWeight: 700, fontSize: 16 }}>${total.toFixed(2)}</span>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}><button onClick={onClose} style={btnGhost}>Cancel</button><button onClick={() => onSave(fees)} style={btnPrimary}>Save Fees</button></div>
    </Modal>
  );
}

// ─── QUOTE PANEL ──────────────────────────────────────────────────────────────
function QuoteModal({ project, settings, catalog, onClose }) {
  const rawParts  = project.parts    ?? [];
  const delivery  = project.delivery ?? [];
  const parts     = rawParts.map(p => resolvePart(p, catalog));
  const partsCost = parts.reduce((s, p) => s + n2(p.unitCost) * n2(p.qty || 1), 0);
  const asmMins   = parts.reduce((s, p) => s + n2(p.assemblyMins) * n2(p.qty || 1), 0);
  const asmCost   = (asmMins / 60) * settings.laborRate;
  const delCost   = delivery.reduce((s, d) => s + n2(d.amount), 0);
  const totalCost = partsCost + asmCost + delCost;
  const mu        = settings.defaultMarkup;
  const price     = totalCost * (1 + mu / 100);
  const byVendor  = VENDORS.map(v => ({ ...v, parts: parts.filter(p => p.vendor === v.id).reduce((s,p) => s + n2(p.unitCost)*n2(p.qty||1), 0), delivery: delivery.filter(d => d.vendor === v.id).reduce((s,d) => s + n2(d.amount), 0) })).filter(v => v.parts + v.delivery > 0);
  const stockParts = parts.filter(p => p.isStock);
  const printParts = parts.filter(p => p.type === "3d_printed");
  const catParts   = rawParts.filter(p => p.catalogId);
  const Line = ({ label, value, sub }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
      <div><div style={{ color: "#6b8fa8", fontSize: 13 }}>{label}</div>{sub && <div style={{ color: C.faint, fontSize: 10 }}>{sub}</div>}</div>
      <div style={{ color: "#6b8fa8", fontSize: 14, fontFamily: "monospace" }}>${value.toFixed(2)}</div>
    </div>
  );
  return (
    <Modal title="📋  Quote Summary" onClose={onClose} width={480}>
      <div style={{ background: "#040b12", border: `1px solid ${C.border}`, borderRadius: 6, padding: "14px 16px", marginBottom: 20 }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 18, color: "#e0f4ff" }}>{project.name}</div>
        {project.description && <div style={{ color: "#6b8fa8", fontSize: 11, marginTop: 3 }}>{project.description}</div>}
        <div style={{ color: "#6b8fa8", fontSize: 10, marginTop: 6 }}>Generated {new Date().toLocaleDateString()}</div>
      </div>
      <Line label="Parts & Materials" value={partsCost} sub={`${parts.length} line items${catParts.length ? ` · ${catParts.length} from catalog` : ""}`} />
      <Line label="Assembly Labor"    value={asmCost}   sub={`${asmMins.toFixed(0)} min @ $${settings.laborRate}/hr`} />
      <Line label="Delivery / Shipping" value={delCost} sub={`${delivery.filter(d => n2(d.amount) > 0).length} vendor(s)`} />
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ color: "#6b8fa8", fontSize: 13 }}>Total Cost</span><span style={{ color: C.text, fontSize: 15, fontWeight: 700, fontFamily: "monospace" }}>${totalCost.toFixed(2)}</span></div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}><span style={{ color: "#6b8fa8", fontSize: 12 }}>Markup ({mu}%)</span><span style={{ color: "#6b8fa8", fontSize: 12, fontFamily: "monospace" }}>+${(price - totalCost).toFixed(2)}</span></div>
      <div style={{ background: C.accent + "18", border: `1px solid ${C.accent}44`, borderRadius: 6, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{ color: C.accent, fontWeight: 700, fontSize: 12, letterSpacing: "0.06em" }}>SUGGESTED PRICE</span>
        <span style={{ color: C.accent, fontSize: 26, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>${price.toFixed(2)}</span>
      </div>
      <HR label="By Vendor" />
      {byVendor.map(v => (
        <div key={v.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 9, fontSize: 12, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Badge vendorId={v.id} /><span style={{ color: "#6b8fa8" }}>parts + ship</span></div>
          <span style={{ color: C.text, fontFamily: "monospace" }}>${(v.parts + v.delivery).toFixed(2)}</span>
        </div>
      ))}
      {(catParts.length > 0 || stockParts.length > 0 || printParts.length > 0) && (
        <>
          <HR label="Notes" />
          {catParts.length > 0   && <div style={{ color: C.accent, fontSize: 11, marginBottom: 7 }}>🗂 {catParts.length} part(s) resolved live from Parts Catalog</div>}
          {stockParts.length > 0 && <div style={{ color: C.yellow, fontSize: 11, marginBottom: 7 }}>⚡ {stockParts.length} stock hardware item(s) — cost baked in, not tracked per-build</div>}
          {printParts.length > 0 && <div style={{ color: C.green,  fontSize: 11 }}>🖨️ {printParts.length} 3D printed part(s) — includes filament, electricity, wear & labor</div>}
        </>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}><button onClick={onClose} style={btnGhost}>Close</button></div>
    </Modal>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [projects,        setProjects]        = useState([]);
  const [settings,        setSettings]        = useState(DEFAULT_SETTINGS);
  const [filaments,       setFilaments]       = useState([]);
  const [catalog,         setCatalog]         = useState([]);
  const [selected,        setSelected]        = useState(null);
  const [loaded,          setLoaded]          = useState(false);
  const [syncStatus,      setSyncStatus]      = useState("idle");
  const [search,          setSearch]          = useState("");
  const [showAddProj,     setShowAddProj]     = useState(false);
  const [editProj,        setEditProj]        = useState(null);
  const [showAddPart,     setShowAddPart]     = useState(false);
  const [editPart,        setEditPart]        = useState(null);
  const [showSettings,    setShowSettings]    = useState(false);
  const [showFilamentLib, setShowFilamentLib] = useState(false);
  const [showCatalog,     setShowCatalog]     = useState(false);
  const [showInvoice,    setShowInvoice]    = useState(false);
  const [showDelivery,    setShowDelivery]    = useState(false);
  const [showQuote,       setShowQuote]       = useState(false);
  const [deleteConfirm,   setDeleteConfirm]   = useState(null);

  // Load: Redis first, fall back to localStorage
  useEffect(() => {
    (async () => {
      const remote = await apiGet();
      const p  = remote?.projects  ?? lsGet("maker_bom_projects");
      const s  = remote?.settings  ?? lsGet("maker_bom_settings");
      const fl = remote?.filaments ?? lsGet("maker_bom_filaments");
      const ct = remote?.catalog   ?? lsGet("maker_bom_catalog");
      const projs = p ?? SEED;
      setProjects(projs);
      if (s)  setSettings({ ...DEFAULT_SETTINGS, ...s });
      setFilaments(fl ?? SEED_FILAMENTS);
      setCatalog(ct ?? SEED_CATALOG);
      if (projs.length) setSelected(projs[0].id);
      if (remote?.projects)  lsSet("maker_bom_projects",  remote.projects);
      if (remote?.settings)  lsSet("maker_bom_settings",  remote.settings);
      if (remote?.filaments) lsSet("maker_bom_filaments", remote.filaments);
      if (remote?.catalog)   lsSet("maker_bom_catalog",   remote.catalog);
      setLoaded(true);
    })();
  }, []);

  const syncToRedis = useCallback(async (key, value) => {
    setSyncStatus("syncing");
    try { await apiSet(key, value); setSyncStatus("ok"); setTimeout(() => setSyncStatus("idle"), 2000); }
    catch { setSyncStatus("error"); }
  }, []);

  const persist       = useCallback((next) => { setProjects(next);  lsSet("maker_bom_projects",  next); syncToRedis("maker_bom_projects",  next); }, [syncToRedis]);
  const saveSettings  = useCallback((s)    => { setSettings(s);     lsSet("maker_bom_settings",  s);   syncToRedis("maker_bom_settings",  s);   }, [syncToRedis]);
  const saveFilaments = useCallback((fl)   => { setFilaments(fl);   lsSet("maker_bom_filaments", fl);  syncToRedis("maker_bom_filaments", fl);  }, [syncToRedis]);
  const saveCatalog   = useCallback((ct)   => { setCatalog(ct);     lsSet("maker_bom_catalog",   ct);  syncToRedis("maker_bom_catalog",   ct);  }, [syncToRedis]);

  const active        = projects.find(p => p.id === selected);
  const rawParts      = active?.parts    ?? [];
  const delivery      = active?.delivery ?? [];
  const resolvedParts = rawParts.map(p => resolvePart(p, catalog));

  const filtered = resolvedParts.filter(p =>
    !search || [p.name, p.partNumber, p.notes, p.files].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  const partsCost = resolvedParts.reduce((s, p) => s + n2(p.unitCost) * n2(p.qty || 1), 0);
  const asmMins   = resolvedParts.reduce((s, p) => s + n2(p.assemblyMins) * n2(p.qty || 1), 0);
  const asmCost   = (asmMins / 60) * settings.laborRate;
  const delCost   = delivery.reduce((s, d) => s + n2(d.amount), 0);
  const totalCost = partsCost + asmCost + delCost;
  const suggested = totalCost * (1 + settings.defaultMarkup / 100);

  function addProject(form)    { const p = { id: uid(), created: new Date().toISOString().slice(0, 10), parts: [], delivery: [], ...form }; const next = [...projects, p]; persist(next); setSelected(p.id); setShowAddProj(false); }
  function updateProject(form) { persist(projects.map(p => p.id === editProj.id ? { ...p, ...form } : p)); setEditProj(null); }
  function deleteProject(id)   { const next = projects.filter(p => p.id !== id); persist(next); setSelected(next[0]?.id ?? null); setDeleteConfirm(null); }
  function addPart(form)       { persist(projects.map(p => p.id === selected ? { ...p, parts: [...p.parts, { ...form, id: uid() }] } : p)); setShowAddPart(false); }
  function updatePart(form)    { persist(projects.map(p => p.id === selected ? { ...p, parts: p.parts.map(x => x.id === editPart.id ? { ...x, ...form } : x) } : p)); setEditPart(null); }
  function deletePart(id)      { persist(projects.map(p => p.id === selected ? { ...p, parts: p.parts.filter(x => x.id !== id) } : p)); }
  function saveDelivery(fees)  { persist(projects.map(p => p.id === selected ? { ...p, delivery: fees } : p)); setShowDelivery(false); }

  function exportCSV() {
    if (!active) return;
    const blank = ["", "", "", "", "", "", ""];
    const rows = [
      ["Part", "Type", "Qty", "Unit", "Vendor", "Part #", "Files", "Unit Cost", "Total", "Asm Mins", "Stock", "Notes"],
      ...resolvedParts.map(p => [p.name, p.type, p.qty, p.unit, VENDORS.find(v => v.id === p.vendor)?.label ?? "", p.partNumber, p.files, n2(p.unitCost).toFixed(2), (n2(p.unitCost) * n2(p.qty || 1)).toFixed(2), p.assemblyMins, p.isStock ? "Yes" : "", p.notes]),
      blank,
      [...blank, "Parts Cost",      "", partsCost.toFixed(2), "", "", ""],
      [...blank, "Assembly",        `${asmMins.toFixed(0)}min`, asmCost.toFixed(2), "", "", ""],
      [...blank, "Delivery",        "", delCost.toFixed(2), "", "", ""],
      [...blank, "TOTAL COST",      "", totalCost.toFixed(2), "", "", ""],
      [...blank, "SUGGESTED PRICE", `${settings.defaultMarkup}% markup`, suggested.toFixed(2), "", "", ""],
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: `${active.name.replace(/\s+/g, "_")}_BOM.csv` });
    a.click();
  }

  if (!loaded) return <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.accent, fontFamily: "monospace" }}>Loading…</div>;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Space+Grotesk:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border2}; border-radius: 3px; }
        .prow:hover { background: #0c1a26 !important; }
        .prow:hover .acts { opacity: 1 !important; }
        .si:hover { background: #0d1a26 !important; }
        input:focus, textarea:focus, select:focus { outline: none; border-color: ${C.accent}55 !important; }
        input[type=checkbox] { accent-color: ${C.accent}; }
        button:hover { opacity: 0.85; }
      `}</style>

      <div style={{ display: "flex", height: "100vh", background: C.bg, fontFamily: "'JetBrains Mono', monospace", overflow: "hidden" }}>

        {/* ── SIDEBAR ── */}
        <div style={{ width: 228, background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "18px 16px 12px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 16, color: C.accent }}>MAKER BOM</div>
              <span title={syncStatus === "syncing" ? "Syncing…" : syncStatus === "ok" ? "Synced" : syncStatus === "error" ? "Sync error" : ""}
                style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: syncStatus === "syncing" ? C.yellow : syncStatus === "ok" ? C.green : syncStatus === "error" ? C.red : C.border2 }} />
            </div>
            <div style={{ color: "#4a6a82", fontSize: 10, letterSpacing: "0.14em", marginTop: 2 }}>BUILD CATALOG v3.0</div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            <div style={{ padding: "4px 16px 6px", color: "#6b8fa8", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Projects</div>
            {projects.map(p => {
              const res = (p.parts ?? []).map(x => resolvePart(x, catalog));
              const pc  = res.reduce((s, x) => s + n2(x.unitCost) * n2(x.qty || 1), 0);
              return (
                <div key={p.id} className="si" onClick={() => { setSelected(p.id); setSearch(""); }}
                  style={{ padding: "9px 16px", cursor: "pointer", background: selected === p.id ? "#0d1a26" : "transparent", borderLeft: selected === p.id ? `2px solid ${C.accent}` : "2px solid transparent" }}>
                  <div style={{ color: selected === p.id ? "#e0f4ff" : C.muted, fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>{p.name}</div>
                  <div style={{ color: "#6b8fa8", fontSize: 11, fontWeight: 700, marginTop: 3 }}>{(p.parts ?? []).length} parts · ${pc.toFixed(2)}</div>
                </div>
              );
            })}
          </div>

          <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => setShowAddProj(true)}    style={{ ...btnPrimary,  width: "100%", textAlign: "center" }}>+ New Project</button>
            <button onClick={() => setShowCatalog(true)}    style={{ ...btnGhost,    width: "100%", textAlign: "center", fontSize: 10, color: C.accent, borderColor: C.accent + "44" }}>🗂 Parts Catalog · {catalog.length} parts</button>
            <button onClick={() => setShowSettings(true)}   style={{ ...btnGhost,    width: "100%", textAlign: "center", fontSize: 10, color: "#6b8fa8" }}>⚙️ Settings · ${settings.laborRate}/hr · {settings.defaultMarkup}% markup</button>
            <button onClick={() => setShowFilamentLib(true)} style={{ ...btnGhost,   width: "100%", textAlign: "center", fontSize: 10, color: C.green, borderColor: C.green + "44" }}>🧵 Filament Library · {filaments.length} profiles</button>
          </div>
        </div>

        {/* ── MAIN ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {active ? (
            <>
              <div style={{ padding: "15px 22px 12px", borderBottom: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                  <div>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 20, color: "#e0f4ff" }}>{active.name}</div>
                    {active.description && <div style={{ color: "#6b8fa8", fontSize: 11, fontWeight: 700, marginTop: 2 }}>{active.description}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 7, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button onClick={() => setShowQuote(true)}           style={btnPrimary}>📋 Quote</button>
                    <button onClick={() => setShowDelivery(true)}        style={btnGreenOut}>🚚 Delivery</button>
                    <button onClick={exportCSV}                          style={{ ...btnGhost, color: C.green, borderColor: C.green + "44" }}>CSV</button>
                    <button onClick={() => setEditProj(active)}          style={btnGhost}>Edit</button>
                    <button onClick={() => setDeleteConfirm(active.id)}  style={btnDanger}>✕</button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 22, marginTop: 14, flexWrap: "wrap" }}>
                  <Stat label="Parts Cost"                               value={`$${partsCost.toFixed(2)}`} color={C.text} />
                  <Stat label={`Assembly (${asmMins.toFixed(0)}min)`}   value={`$${asmCost.toFixed(2)}`}   color={C.purple} />
                  <Stat label="Delivery"                                 value={`$${delCost.toFixed(2)}`}   color={C.yellow} />
                  <Stat label="Total Cost"                               value={`$${totalCost.toFixed(2)}`} color={C.accent} />
                  <Stat label={`Price (${settings.defaultMarkup}% up)`} value={`$${suggested.toFixed(2)}`} color={C.green} />
                </div>
              </div>

              <div style={{ padding: "10px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 10, alignItems: "center", background: C.bg, flexShrink: 0 }}>
                <input style={{ ...inp, width: 220 }} placeholder="Search parts…" value={search} onChange={e => setSearch(e.target.value)} />
                <div style={{ flex: 1 }} />
                <button onClick={() => setShowAddPart(true)} style={btnPrimary}>+ Add Part</button>
              </div>

              <div style={{ flex: 1, overflowY: "auto" }}>
                {filtered.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#6b8fa8", padding: "60px 0", fontSize: 12 }}>
                    {search ? "No parts match." : "No parts yet — click Add Part to start your BOM."}
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: "#6b8fa8", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", position: "sticky", top: 0, background: C.bg, zIndex: 1 }}>
                        {["", "Name", "Vendor", "Qty", "Part # / Files", "Unit $", "Total", "Asm", "Notes", ""].map((h, i) => (
                          <th key={i} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(part => {
                        const rawPart    = rawParts.find(rp => rp.id === part.id);
                        const isCatalog  = !!rawPart?.catalogId;
                        const cost       = n2(part.unitCost);
                        const tot        = cost * n2(part.qty || 1);
                        const asm        = n2(part.assemblyMins) * n2(part.qty || 1);
                        return (
                          <tr key={part.id} className="prow" style={{ borderBottom: `1px solid #0a1a28` }}>
                            <td style={{ padding: "9px 10px", width: 22 }}><span title={PART_TYPES.find(t => t.id === part.type)?.label}>{PART_TYPES.find(t => t.id === part.type)?.icon}</span></td>
                            <td style={{ padding: "9px 10px", color: "#c8d8e8", fontSize: 12, fontWeight: 500 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                {part.name}
                                {isCatalog && <span style={{ background: C.accent + "18", color: C.accent, border: `1px solid ${C.accent}33`, borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em" }}>CAT</span>}
                                {part.isStock && <span style={{ background: C.yellow + "22", color: C.yellow, border: `1px solid ${C.yellow}44`, borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em" }}>STOCK</span>}
                              </div>
                            </td>
                            <td style={{ padding: "9px 10px" }}><Badge vendorId={part.vendor} /></td>
                            <td style={{ padding: "9px 10px", color: "#6b8fa8", fontSize: 12, fontWeight: 700 }}>{part.qty} <span style={{ fontSize: 11 }}>{part.unit}</span></td>
                            <td style={{ padding: "9px 10px", fontSize: 11, maxWidth: 180 }}>
                              {part.partNumber && <div style={{ color: "#6b8fa8", fontWeight: 700 }}>{part.partNumber}</div>}
                              {part.files && <div style={{ color: C.green, marginTop: 2, fontSize: 10 }}>{part.files.split(",").map((f, i) => <span key={i} style={{ marginRight: 6 }}>📄 {f.trim()}</span>)}</div>}
                              {!part.partNumber && !part.files && <span style={{ color: C.faint }}>—</span>}
                            </td>
                            <td style={{ padding: "9px 10px", color: "#6b8fa8", fontSize: 12, fontWeight: 700 }}>{cost > 0 ? `$${cost.toFixed(2)}` : <span style={{ color: C.faint }}>—</span>}</td>
                            <td style={{ padding: "9px 10px", color: tot > 0 ? C.accent : C.faint, fontSize: 12, fontWeight: 700 }}>{tot > 0 ? `$${tot.toFixed(2)}` : "—"}</td>
                            <td style={{ padding: "9px 10px", fontSize: 11 }}>{asm > 0 ? <span style={{ color: C.purple }}>{asm.toFixed(0)}m</span> : <span style={{ color: C.faint }}>—</span>}</td>
                            <td style={{ padding: "9px 10px", color: "#6b8fa8", fontSize: 11, maxWidth: 160 }}>{part.notes || <span style={{ color: C.faint }}>—</span>}</td>
                            <td style={{ padding: "9px 10px" }}>
                              <div className="acts" style={{ display: "flex", gap: 5, opacity: 0, transition: "opacity 0.15s" }}>
                                <button onClick={() => setEditPart(rawPart)} style={{ ...btnGhost, padding: "3px 8px", fontSize: 9 }}>edit</button>
                                <button onClick={() => deletePart(part.id)}  style={{ ...btnDanger, padding: "3px 8px", fontSize: 9 }}>✕</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4} style={{ padding: "12px 10px", borderTop: `1px solid ${C.border2}`, color: "#6b8fa8", fontSize: 12, fontWeight: 700 }}>{filtered.length} parts · {filtered.reduce((s, p) => s + n2(p.assemblyMins) * n2(p.qty || 1), 0).toFixed(0)} min assembly</td>
                        <td colSpan={2} style={{ padding: "12px 10px", borderTop: `1px solid ${C.border2}`, color: "#6b8fa8", fontSize: 12, fontWeight: 700 }}>Parts subtotal</td>
                        <td style={{ padding: "12px 10px", borderTop: `1px solid ${C.border2}`, color: C.accent, fontSize: 14, fontWeight: 700 }}>${filtered.reduce((s, p) => s + n2(p.unitCost) * n2(p.qty || 1), 0).toFixed(2)}</td>
                        <td colSpan={3} style={{ borderTop: `1px solid ${C.border2}` }} />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, color: "#6b8fa8" }}>
              <div style={{ fontSize: 40 }}>🔩</div>
              <div style={{ fontSize: 12 }}>No project selected</div>
              <button onClick={() => setShowAddProj(true)} style={btnPrimary}>+ Create First Project</button>
            </div>
          )}
        </div>
      </div>

      {/* ── MODALS ── */}
      {showSettings    && <SettingsModal settings={settings} onSave={s => { saveSettings(s); setShowSettings(false); }} onClose={() => setShowSettings(false)} />}
      {showFilamentLib && <FilamentLibraryModal filaments={filaments} onSave={fl => { saveFilaments(fl); setShowFilamentLib(false); }} onClose={() => setShowFilamentLib(false)} />}
      {showCatalog     && <CatalogModal catalog={catalog} onSave={ct => { saveCatalog(ct); setShowCatalog(false); }} onClose={() => setShowCatalog(false)} />}
      {showAddProj     && <ProjectModal onSave={addProject} onClose={() => setShowAddProj(false)} />}
      {editProj        && <ProjectModal initial={editProj} onSave={updateProject} onClose={() => setEditProj(null)} />}
      {showAddPart     && <PartModal settings={settings} filaments={filaments} catalog={catalog} onSave={addPart} onClose={() => setShowAddPart(false)} />}
      {editPart        && <PartModal initial={editPart} settings={settings} filaments={filaments} catalog={catalog} onSave={updatePart} onClose={() => setEditPart(null)} />}
      {showDelivery    && <DeliveryModal delivery={active?.delivery} onSave={saveDelivery} onClose={() => setShowDelivery(false)} />}
      {showQuote && active && <QuoteModal project={active} settings={settings} catalog={catalog} onClose={() => setShowQuote(false)} />}

      {deleteConfirm && (
        <Modal title="Delete Project" onClose={() => setDeleteConfirm(null)} width={360}>
          <p style={{ color: "#6b8fa8", fontSize: 13, marginBottom: 20 }}>Delete <strong style={{ color: "#e0f4ff" }}>{projects.find(p => p.id === deleteConfirm)?.name}</strong>? This cannot be undone.</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setDeleteConfirm(null)} style={btnGhost}>Cancel</button>
            <button onClick={() => deleteProject(deleteConfirm)} style={{ ...baseBtn, background: C.red, color: "#fff", border: "none" }}>Delete</button>
          </div>
        </Modal>
      )}
    </>
  );
}
