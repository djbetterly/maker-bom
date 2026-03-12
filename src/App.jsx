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

const COMMON_PARTS = [
  "M3 Socket Head Cap Screw", "M4 Socket Head Cap Screw", "M5 Socket Head Cap Screw",
  "Heat-Set Insert M3", "Heat-Set Insert M4", "Compression Spring",
  "Hex Nut M3", "Hex Nut M4", "Leveling Foot", "T-Nut", "Linear Rail",
];

const DEFAULT_SETTINGS = {
  laborRate: 65,
  printerWatts: 250,
  electricityRate: 0.14,
  wearTearRate: 0.50,
  defaultMarkup: 35,
  spoolCost: 22,
  spoolSize: 1000,
};

const EMPTY_PART = {
  id: null, name: "", type: "purchased", qty: 1, unit: "ea",
  vendor: "mcmaster", partNumber: "", url: "", files: "",
  notes: "", unitCost: "", isStock: false, assemblyMins: 0,
};

const EMPTY_CALC = {
  filamentGrams: "", printTimeHrs: "", hasSupports: false,
  supportRemovalMins: 15, setupMins: 10, cleanupMins: 5,
  markup: "", overrideSpoolCost: "", overrideSpoolSize: "",
};

function uid() { return Math.random().toString(36).slice(2, 10); }
function n2(v) { const f = parseFloat(v); return isNaN(f) ? 0 : f; }

// ─── LOCAL STORAGE ────────────────────────────────────────────────────────────
function lsGet(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
  catch { return null; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const SEED = [{
  id: "p1",
  name: "Filament Dry Box",
  description: "Airtight enclosure with humidity sensor mount",
  created: "2024-11-03",
  delivery: [
    { id: "d1", vendor: "sendcutsend", amount: "8.50" },
    { id: "d2", vendor: "mcmaster",    amount: "0"    },
  ],
  parts: [
    { id:"a1", name:"M3×8 SHCS",           type:"purchased",  qty:12, unit:"ea", vendor:"mcmaster",    partNumber:"91292A113", url:"", files:"",                    notes:"Lid fasteners",    unitCost:"0.09", isStock:true,  assemblyMins:0.5 },
    { id:"a2", name:"Heat-Set Insert M3",   type:"purchased",  qty:12, unit:"ea", vendor:"mcmaster",    partNumber:"94180A333", url:"", files:"",                    notes:"",                 unitCost:"0.22", isStock:true,  assemblyMins:1   },
    { id:"a3", name:"Lid Panel",            type:"custom_cut", qty:1,  unit:"ea", vendor:"sendcutsend", partNumber:"",          url:"", files:"lid_panel.dxf",       notes:"3mm acrylic",      unitCost:"4.80", isStock:false, assemblyMins:5   },
    { id:"a4", name:"Main Body Shell",      type:"3d_printed", qty:1,  unit:"ea", vendor:"bambu",       partNumber:"",          url:"", files:"dry_box_body.stl",    notes:"PETG, 40% infill", unitCost:"3.45", isStock:false, assemblyMins:10  },
    { id:"a5", name:"Sensor Mount Bracket", type:"3d_printed", qty:2,  unit:"ea", vendor:"bambu",       partNumber:"",          url:"", files:"sensor_bracket.stl", notes:"PLA+",             unitCost:"1.20", isStock:false, assemblyMins:3   },
  ],
}];

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg: "#080e16", surface: "#060d14", border: "#0e2235", border2: "#1e3a52",
  accent: "#00d4ff", text: "#c8d8e8", muted: "#3a5a72", dim: "#2a4a62", faint: "#1a3040",
  green: "#3ba55c", red: "#e05252", yellow: "#e8a020", purple: "#a78bfa",
};

const baseBtn = {
  border: `1px solid ${C.border2}`, borderRadius: 4, padding: "8px 14px",
  cursor: "pointer", fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
  fontWeight: 700, letterSpacing: "0.05em", transition: "opacity 0.1s",
};
const btnPrimary  = { ...baseBtn, background: C.accent,       color: "#041219",  border: "none" };
const btnGhost    = { ...baseBtn, background: "transparent",   color: C.muted };
const btnDanger   = { ...baseBtn, background: "transparent",   color: C.red,     borderColor: C.red    + "44" };
const btnGreenOut = { ...baseBtn, background: "transparent",   color: C.green,   borderColor: C.green  + "44" };

const inp = {
  width: "100%", boxSizing: "border-box", background: "#0a131c",
  border: `1px solid ${C.border2}`, borderRadius: 4, color: C.text,
  padding: "8px 10px", fontSize: 12,
  fontFamily: "'JetBrains Mono', monospace", outline: "none",
};
const sel = { ...inp, cursor: "pointer" };

// ─── MICRO COMPONENTS ─────────────────────────────────────────────────────────
function Badge({ vendorId }) {
  const v = VENDORS.find(x => x.id === vendorId);
  if (!v) return null;
  return (
    <span style={{
      background: v.color + "22", color: v.color,
      border: `1px solid ${v.color}55`, borderRadius: 3,
      padding: "2px 6px", fontSize: 10,
      fontFamily: "'JetBrains Mono', monospace",
      fontWeight: 700, letterSpacing: "0.04em", whiteSpace: "nowrap",
    }}>{v.short}</span>
  );
}

function F({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: "block", color: C.dim, fontSize: 10,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5,
      }}>{label}</label>
      {children}
      {hint && <div style={{ color: "#445", fontSize: 10, marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function HR({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 14px" }}>
      <div style={{ flex: 1, height: 1, background: C.border }} />
      {label && <span style={{ color: C.dim, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>}
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  );
}

function Modal({ title, onClose, width = 540, children }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "#00000099", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(3px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "#0a1520", border: `1px solid ${C.border2}`, borderRadius: 8,
        width: `min(96vw, ${width}px)`, maxHeight: "92vh", overflowY: "auto",
        boxShadow: "0 24px 64px #000e",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 22px 12px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ color: C.accent, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "20px 22px" }}>{children}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ color: C.dim, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color ?? C.muted, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}

// ─── PRINT CALCULATOR ─────────────────────────────────────────────────────────
function PrintCalc({ settings, onApply, onClose }) {
  const [c, setC] = useState(EMPTY_CALC);
  const s   = k => e => setC(p => ({ ...p, [k]: e.target.value }));
  const tog = k => () => setC(p => ({ ...p, [k]: !p[k] }));

  const spoolCost = n2(c.overrideSpoolCost) || settings.spoolCost;
  const spoolSize = n2(c.overrideSpoolSize) || settings.spoolSize;
  const gpg       = spoolSize > 0 ? spoolCost / spoolSize : 0;
  const filament  = n2(c.filamentGrams) * gpg;
  const hrs       = n2(c.printTimeHrs);
  const elec      = (settings.printerWatts / 1000) * hrs * settings.electricityRate;
  const wear      = hrs * settings.wearTearRate;
  const lr        = settings.laborRate;
  const setup     = (n2(c.setupMins)   / 60) * lr;
  const cleanup   = (n2(c.cleanupMins) / 60) * lr;
  const support   = c.hasSupports ? (n2(c.supportRemovalMins) / 60) * lr : 0;
  const sub       = filament + elec + wear + setup + cleanup + support;
  const mu        = n2(c.markup !== "" ? c.markup : settings.defaultMarkup);
  const total     = sub * (1 + mu / 100);

  const rows = [
    { l: "Filament",        v: filament, d: `${n2(c.filamentGrams).toFixed(1)}g × $${gpg.toFixed(4)}/g` },
    { l: "Electricity",     v: elec,     d: `${hrs}h × ${settings.printerWatts}W @ $${settings.electricityRate}/kWh` },
    { l: "Wear & Tear",     v: wear,     d: `${hrs}h × $${settings.wearTearRate}/hr` },
    { l: "Setup",           v: setup,    d: `${c.setupMins}min @ $${lr}/hr` },
    { l: "Cleanup",         v: cleanup,  d: `${c.cleanupMins}min @ $${lr}/hr` },
    ...(c.hasSupports ? [{ l: "Support Removal", v: support, d: `${c.supportRemovalMins}min @ $${lr}/hr` }] : []),
  ];

  return (
    <Modal title="🖨️  3D Print Cost Calculator" onClose={onClose} width={600}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 22px" }}>
        <div>
          <HR label="Print Details" />
          <F label="Filament Used (grams)"><input style={inp} type="number" step="0.1" value={c.filamentGrams} onChange={s("filamentGrams")} placeholder="e.g. 48" /></F>
          <F label="Print Time (hours)"><input style={inp} type="number" step="0.25" value={c.printTimeHrs} onChange={s("printTimeHrs")} placeholder="e.g. 3.5" /></F>
          <HR label="Spool Override (optional)" />
          <F label="Spool Cost ($)" hint={`Default: $${settings.spoolCost}`}>
            <input style={inp} type="number" step="0.01" value={c.overrideSpoolCost} onChange={s("overrideSpoolCost")} placeholder={`$${settings.spoolCost}`} />
          </F>
          <F label="Spool Size (g)" hint={`Default: ${settings.spoolSize}g`}>
            <input style={inp} type="number" value={c.overrideSpoolSize} onChange={s("overrideSpoolSize")} placeholder={`${settings.spoolSize}`} />
          </F>
        </div>
        <div>
          <HR label="Labor" />
          <F label="Setup Time (mins)"><input style={inp} type="number" value={c.setupMins} onChange={s("setupMins")} /></F>
          <F label="Cleanup Time (mins)"><input style={inp} type="number" value={c.cleanupMins} onChange={s("cleanupMins")} /></F>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: C.text, fontSize: 12 }}>
              <input type="checkbox" checked={c.hasSupports} onChange={tog("hasSupports")} />
              Part has supports
            </label>
          </div>
          {c.hasSupports && (
            <F label="Support Removal (mins)">
              <input style={inp} type="number" value={c.supportRemovalMins} onChange={s("supportRemovalMins")} />
            </F>
          )}
          <F label={`Markup % (default ${settings.defaultMarkup}%)`}>
            <input style={inp} type="number" value={c.markup} onChange={s("markup")} placeholder={`${settings.defaultMarkup}`} />
          </F>
        </div>
      </div>

      {/* Breakdown */}
      <div style={{ background: "#040b12", border: `1px solid ${C.border}`, borderRadius: 6, padding: 16, marginTop: 8 }}>
        <div style={{ color: C.dim, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Cost Breakdown</div>
        {rows.map(r => (
          <div key={r.l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: 12 }}>
            <span style={{ color: C.muted }}>{r.l} <span style={{ color: C.faint, fontSize: 10 }}>({r.d})</span></span>
            <span style={{ color: C.text, fontFamily: "monospace" }}>${r.v.toFixed(4)}</span>
          </div>
        ))}
        <div style={{ height: 1, background: C.border2, margin: "10px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted, marginBottom: 5 }}>
          <span>Subtotal</span><span style={{ fontFamily: "monospace" }}>${sub.toFixed(4)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted, marginBottom: 5 }}>
          <span>Markup ({mu}%)</span><span style={{ fontFamily: "monospace" }}>+${(total - sub).toFixed(4)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700, marginTop: 6 }}>
          <span style={{ color: C.text }}>Unit Cost</span>
          <span style={{ color: C.accent, fontFamily: "'JetBrains Mono', monospace" }}>${total.toFixed(2)}</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
        <button onClick={onClose} style={btnGhost}>Cancel</button>
        <button
          onClick={() => onApply(total.toFixed(2))}
          style={{ ...btnPrimary, opacity: (!c.filamentGrams || !c.printTimeHrs) ? 0.4 : 1 }}
          disabled={!c.filamentGrams || !c.printTimeHrs}
        >
          Apply → ${total.toFixed(2)}
        </button>
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
      <F label="Labor Rate ($/hr)" hint="Used for assembly time, print setup, cleanup, and support removal">
        <input style={inp} type="number" step="1" value={s.laborRate} onChange={set("laborRate")} />
      </F>
      <HR label="Printer" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <F label="Printer Wattage (W)"><input style={inp} type="number" value={s.printerWatts} onChange={set("printerWatts")} /></F>
        <F label="Electricity ($/kWh)"><input style={inp} type="number" step="0.01" value={s.electricityRate} onChange={set("electricityRate")} /></F>
        <F label="Wear & Tear ($/hr)"><input style={inp} type="number" step="0.05" value={s.wearTearRate} onChange={set("wearTearRate")} /></F>
        <F label="Default Markup (%)"><input style={inp} type="number" value={s.defaultMarkup} onChange={set("defaultMarkup")} /></F>
      </div>
      <HR label="Default Filament Spool" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <F label="Spool Cost ($)"><input style={inp} type="number" step="0.01" value={s.spoolCost} onChange={set("spoolCost")} /></F>
        <F label="Spool Size (g)"><input style={inp} type="number" value={s.spoolSize} onChange={set("spoolSize")} /></F>
      </div>
      <div style={{ color: C.dim, fontSize: 11, marginTop: -8, marginBottom: 16 }}>
        → ${(n2(s.spoolCost) / (n2(s.spoolSize) || 1)).toFixed(4)} per gram
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnGhost}>Cancel</button>
        <button onClick={() => onSave(s)} style={btnPrimary}>Save Settings</button>
      </div>
    </Modal>
  );
}

// ─── PART MODAL ───────────────────────────────────────────────────────────────
function PartModal({ initial, settings, onSave, onClose }) {
  const [form, setForm]     = useState(initial ?? EMPTY_PART);
  const [showCalc, setShowCalc] = useState(false);
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  const tog = k => () => setForm(p => ({ ...p, [k]: !p[k] }));
  const is3D        = form.type === "3d_printed";
  const isPurchased = form.type === "purchased";
  const hasFiles    = ["3d_printed", "custom_cut", "drawing"].includes(form.type);

  return (
    <>
      <Modal title={initial ? "Edit Part" : "Add Part"} onClose={onClose} width={600}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
          <div style={{ gridColumn: "1/-1" }}>
            <F label="Part Name">
              <input style={inp} list="cp" value={form.name} onChange={set("name")} placeholder="e.g. M3×8 SHCS" />
              <datalist id="cp">{COMMON_PARTS.map(p => <option key={p} value={p} />)}</datalist>
            </F>
          </div>

          <F label="Type">
            <select style={sel} value={form.type} onChange={set("type")}>
              {PART_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
            </select>
          </F>

          <F label="Vendor">
            <select style={sel} value={form.vendor} onChange={set("vendor")}>
              {VENDORS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </F>

          <F label="Qty">
            <input style={inp} type="number" min="1" value={form.qty} onChange={set("qty")} />
          </F>

          <F label="Unit">
            <select style={sel} value={form.unit} onChange={set("unit")}>
              {["ea","in","mm","ft","m","oz","g","pkg"].map(u => <option key={u}>{u}</option>)}
            </select>
          </F>

          <div style={{ gridColumn: is3D ? "1/-1" : undefined }}>
            <F label="Unit Cost ($)">
              <div style={{ display: "flex", gap: 8 }}>
                <input style={{ ...inp, flex: 1 }} type="number" step="0.01" value={form.unitCost} onChange={set("unitCost")} placeholder="0.00" />
                {is3D && (
                  <button onClick={() => setShowCalc(true)} style={{ ...btnPrimary, padding: "7px 12px", fontSize: 11, whiteSpace: "nowrap" }}>
                    🖨️ Calculate
                  </button>
                )}
              </div>
            </F>
          </div>

          {isPurchased && (
            <F label="Part Number">
              <input style={inp} value={form.partNumber} onChange={set("partNumber")} placeholder="e.g. 91292A113" />
            </F>
          )}

          {hasFiles && (
            <div style={{ gridColumn: "1/-1" }}>
              <F label="File References" hint="STL, DXF, or drawing filenames — comma-separated">
                <input style={inp} value={form.files} onChange={set("files")} placeholder="body.stl, lid_panel.dxf" />
              </F>
            </div>
          )}

          {isPurchased && (
            <div style={{ gridColumn: "1/-1" }}>
              <F label="URL"><input style={inp} value={form.url} onChange={set("url")} placeholder="https://…" /></F>
            </div>
          )}

          <div style={{ gridColumn: "1/-1" }}>
            <F label="Notes">
              <input style={inp} value={form.notes} onChange={set("notes")} placeholder="Material, finish, spec…" />
            </F>
          </div>
        </div>

        <HR label="Assembly & Inventory" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
          <F label="Assembly Time (mins/unit)" hint="Time to install this part per unit produced">
            <input style={inp} type="number" step="0.5" min="0" value={form.assemblyMins} onChange={set("assemblyMins")} placeholder="0" />
          </F>

          {isPurchased && (
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
          <button onClick={() => form.name.trim() && onSave(form)} style={btnPrimary}>Save Part</button>
        </div>
      </Modal>

      {showCalc && (
        <PrintCalc
          settings={settings}
          onApply={cost => { setForm(p => ({ ...p, unitCost: cost })); setShowCalc(false); }}
          onClose={() => setShowCalc(false)}
        />
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
      <F label="Project Name">
        <input style={inp} value={form.name} onChange={set("name")} placeholder="e.g. Enclosure v2" />
      </F>
      <F label="Description">
        <textarea style={{ ...inp, minHeight: 70, resize: "vertical" }} value={form.description} onChange={set("description")} />
      </F>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnGhost}>Cancel</button>
        <button onClick={() => form.name.trim() && onSave(form)} style={btnPrimary}>Save</button>
      </div>
    </Modal>
  );
}

// ─── DELIVERY FEES ────────────────────────────────────────────────────────────
function DeliveryModal({ delivery, onSave, onClose }) {
  const [fees, setFees] = useState(
    delivery?.length ? delivery : VENDORS.map(v => ({ id: uid(), vendor: v.id, amount: "" }))
  );
  const setAmt = (id, val) => setFees(f => f.map(x => x.id === id ? { ...x, amount: val } : x));
  const total = fees.reduce((s, f) => s + n2(f.amount), 0);
  return (
    <Modal title="🚚  Delivery Fees" onClose={onClose} width={380}>
      <div style={{ color: C.muted, fontSize: 11, marginBottom: 16 }}>
        Shipping & handling per vendor for this project.
      </div>
      {fees.map(fee => {
        const v = VENDORS.find(x => x.id === fee.vendor);
        return (
          <div key={fee.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <span style={{ color: C.muted, fontSize: 12, minWidth: 130 }}>{v?.label}</span>
            <span style={{ color: C.dim }}>$</span>
            <input style={{ ...inp, width: 100 }} type="number" step="0.01" value={fee.amount} onChange={e => setAmt(fee.id, e.target.value)} placeholder="0.00" />
          </div>
        );
      })}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: C.muted, fontSize: 12 }}>Total Delivery</span>
        <span style={{ color: C.accent, fontFamily: "monospace", fontWeight: 700, fontSize: 16 }}>${total.toFixed(2)}</span>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
        <button onClick={onClose} style={btnGhost}>Cancel</button>
        <button onClick={() => onSave(fees)} style={btnPrimary}>Save Fees</button>
      </div>
    </Modal>
  );
}

// ─── QUOTE PANEL ──────────────────────────────────────────────────────────────
function QuoteModal({ project, settings, onClose }) {
  const parts     = project.parts    ?? [];
  const delivery  = project.delivery ?? [];
  const partsCost = parts.reduce((s, p) => s + n2(p.unitCost) * n2(p.qty || 1), 0);
  const asmMins   = parts.reduce((s, p) => s + n2(p.assemblyMins) * n2(p.qty || 1), 0);
  const asmCost   = (asmMins / 60) * settings.laborRate;
  const delCost   = delivery.reduce((s, d) => s + n2(d.amount), 0);
  const totalCost = partsCost + asmCost + delCost;
  const mu        = settings.defaultMarkup;
  const price     = totalCost * (1 + mu / 100);

  const byVendor = VENDORS.map(v => ({
    ...v,
    parts:    parts.filter(p => p.vendor === v.id).reduce((s, p) => s + n2(p.unitCost) * n2(p.qty || 1), 0),
    delivery: n2(delivery.find(d => d.vendor === v.id)?.amount),
  })).filter(v => v.parts > 0 || v.delivery > 0);

  const stockParts = parts.filter(p => p.isStock);
  const printParts = parts.filter(p => p.type === "3d_printed");

  const Line = ({ label, value, sub }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
      <div>
        <div style={{ color: C.text, fontSize: 13 }}>{label}</div>
        {sub && <div style={{ color: C.dim, fontSize: 10, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ color: C.muted, fontSize: 14, fontFamily: "monospace" }}>${value.toFixed(2)}</div>
    </div>
  );

  return (
    <Modal title="📋  Quote Summary" onClose={onClose} width={480}>
      <div style={{ background: "#040b12", border: `1px solid ${C.border}`, borderRadius: 6, padding: "14px 16px", marginBottom: 20 }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 18, color: "#e0f4ff" }}>{project.name}</div>
        {project.description && <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>{project.description}</div>}
        <div style={{ color: C.dim, fontSize: 10, marginTop: 6 }}>Generated {new Date().toLocaleDateString()}</div>
      </div>

      <Line label="Parts & Materials"   value={partsCost} sub={`${parts.length} line items`} />
      <Line label="Assembly Labor"      value={asmCost}   sub={`${asmMins.toFixed(0)} min @ $${settings.laborRate}/hr`} />
      <Line label="Delivery / Shipping" value={delCost}   sub={`${delivery.filter(d => n2(d.amount) > 0).length} vendor(s)`} />

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: C.muted, fontSize: 13 }}>Total Cost</span>
        <span style={{ color: C.text, fontSize: 15, fontWeight: 700, fontFamily: "monospace" }}>${totalCost.toFixed(2)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ color: C.dim, fontSize: 12 }}>Markup ({mu}%)</span>
        <span style={{ color: C.dim, fontSize: 12, fontFamily: "monospace" }}>+${(price - totalCost).toFixed(2)}</span>
      </div>

      <div style={{ background: C.accent + "18", border: `1px solid ${C.accent}44`, borderRadius: 6, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{ color: C.accent, fontWeight: 700, fontSize: 12, letterSpacing: "0.06em" }}>SUGGESTED PRICE</span>
        <span style={{ color: C.accent, fontSize: 26, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>${price.toFixed(2)}</span>
      </div>

      <HR label="By Vendor" />
      {byVendor.map(v => (
        <div key={v.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 9, fontSize: 12, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Badge vendorId={v.id} />
            <span style={{ color: C.dim }}>parts + ship</span>
          </div>
          <span style={{ color: C.text, fontFamily: "monospace" }}>${(v.parts + v.delivery).toFixed(2)}</span>
        </div>
      ))}

      {(stockParts.length > 0 || printParts.length > 0) && (
        <>
          <HR label="Notes" />
          {stockParts.length > 0 && <div style={{ color: C.yellow, fontSize: 11, marginBottom: 7 }}>⚡ {stockParts.length} stock hardware item(s) — cost baked in, not tracked per-build</div>}
          {printParts.length > 0 && <div style={{ color: C.green, fontSize: 11 }}>🖨️ {printParts.length} 3D printed part(s) — includes filament, electricity, wear & labor</div>}
        </>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
        <button onClick={onClose} style={btnGhost}>Close</button>
      </div>
    </Modal>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [projects,      setProjects]      = useState([]);
  const [settings,      setSettings]      = useState(DEFAULT_SETTINGS);
  const [selected,      setSelected]      = useState(null);
  const [loaded,        setLoaded]        = useState(false);
  const [search,        setSearch]        = useState("");
  const [showAddProj,   setShowAddProj]   = useState(false);
  const [editProj,      setEditProj]      = useState(null);
  const [showAddPart,   setShowAddPart]   = useState(false);
  const [editPart,      setEditPart]      = useState(null);
  const [showSettings,  setShowSettings]  = useState(false);
  const [showDelivery,  setShowDelivery]  = useState(false);
  const [showQuote,     setShowQuote]     = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Load from localStorage
  useEffect(() => {
    const p = lsGet("maker_bom_projects");
    const s = lsGet("maker_bom_settings");
    const projs = p ?? SEED;
    setProjects(projs);
    if (s) setSettings({ ...DEFAULT_SETTINGS, ...s });
    if (projs.length) setSelected(projs[0].id);
    setLoaded(true);
  }, []);

  const persist      = useCallback((next) => { setProjects(next); lsSet("maker_bom_projects", next); }, []);
  const saveSettings = useCallback((s)    => { setSettings(s);    lsSet("maker_bom_settings", s);   }, []);

  const active   = projects.find(p => p.id === selected);
  const parts    = active?.parts    ?? [];
  const delivery = active?.delivery ?? [];

  const filtered = parts.filter(p =>
    !search || [p.name, p.partNumber, p.notes, p.files]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  const partsCost = parts.reduce((s, p) => s + n2(p.unitCost) * n2(p.qty || 1), 0);
  const asmMins   = parts.reduce((s, p) => s + n2(p.assemblyMins) * n2(p.qty || 1), 0);
  const asmCost   = (asmMins / 60) * settings.laborRate;
  const delCost   = delivery.reduce((s, d) => s + n2(d.amount), 0);
  const totalCost = partsCost + asmCost + delCost;
  const suggested = totalCost * (1 + settings.defaultMarkup / 100);

  function addProject(form) {
    const p = { id: uid(), created: new Date().toISOString().slice(0, 10), parts: [], delivery: [], ...form };
    const next = [...projects, p];
    persist(next); setSelected(p.id); setShowAddProj(false);
  }
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
      ...active.parts.map(p => [
        p.name, p.type, p.qty, p.unit,
        VENDORS.find(v => v.id === p.vendor)?.label ?? "",
        p.partNumber, p.files, p.unitCost,
        (n2(p.unitCost) * n2(p.qty || 1)).toFixed(2),
        p.assemblyMins, p.isStock ? "Yes" : "", p.notes,
      ]),
      blank,
      [...blank, "Parts Cost",    "", partsCost.toFixed(2), "", "", ""],
      [...blank, "Assembly",      `${asmMins.toFixed(0)}min`, asmCost.toFixed(2), "", "", ""],
      [...blank, "Delivery",      "", delCost.toFixed(2), "", "", ""],
      [...blank, "TOTAL COST",    "", totalCost.toFixed(2), "", "", ""],
      [...blank, "SUGGESTED PRICE", `${settings.defaultMarkup}% markup`, suggested.toFixed(2), "", "", ""],
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: `${active.name.replace(/\s+/g, "_")}_BOM.csv`,
    });
    a.click();
  }

  if (!loaded) return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.accent, fontFamily: "monospace" }}>
      Loading…
    </div>
  );

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
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 16, color: C.accent }}>MAKER BOM</div>
            <div style={{ color: C.border2, fontSize: 9, letterSpacing: "0.14em", marginTop: 2 }}>BUILD CATALOG v2.0</div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            <div style={{ padding: "4px 16px 6px", color: C.border2, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase" }}>Projects</div>
            {projects.map(p => {
              const pc = (p.parts ?? []).reduce((s, x) => s + n2(x.unitCost) * n2(x.qty || 1), 0);
              return (
                <div key={p.id} className="si"
                  onClick={() => { setSelected(p.id); setSearch(""); }}
                  style={{ padding: "9px 16px", cursor: "pointer", background: selected === p.id ? "#0d1a26" : "transparent", borderLeft: selected === p.id ? `2px solid ${C.accent}` : "2px solid transparent", transition: "all 0.1s" }}
                >
                  <div style={{ color: selected === p.id ? "#e0f4ff" : C.muted, fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>{p.name}</div>
                  <div style={{ color: C.dim, fontSize: 10, marginTop: 3 }}>{(p.parts ?? []).length} parts · ${pc.toFixed(2)}</div>
                </div>
              );
            })}
          </div>

          <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => setShowAddProj(true)} style={{ ...btnPrimary, width: "100%", textAlign: "center" }}>+ New Project</button>
            <button onClick={() => setShowSettings(true)} style={{ ...btnGhost, width: "100%", textAlign: "center", fontSize: 10 }}>
              ⚙️ Settings · ${settings.laborRate}/hr · {settings.defaultMarkup}% markup
            </button>
          </div>
        </div>

        {/* ── MAIN ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {active ? (
            <>
              {/* Header */}
              <div style={{ padding: "15px 22px 12px", borderBottom: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                  <div>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 20, color: "#e0f4ff" }}>{active.name}</div>
                    {active.description && <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>{active.description}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 7, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button onClick={() => setShowQuote(true)}    style={btnPrimary}>📋 Quote</button>
                    <button onClick={() => setShowDelivery(true)} style={btnGreenOut}>🚚 Delivery</button>
                    <button onClick={exportCSV}                   style={{ ...btnGhost, color: C.green, borderColor: C.green + "44" }}>CSV</button>
                    <button onClick={() => setEditProj(active)}   style={btnGhost}>Edit</button>
                    <button onClick={() => setDeleteConfirm(active.id)} style={btnDanger}>✕</button>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 22, marginTop: 14, flexWrap: "wrap" }}>
                  <Stat label="Parts Cost"                         value={`$${partsCost.toFixed(2)}`} color={C.text} />
                  <Stat label={`Assembly (${asmMins.toFixed(0)}min)`} value={`$${asmCost.toFixed(2)}`}  color={C.purple} />
                  <Stat label="Delivery"                           value={`$${delCost.toFixed(2)}`}   color={C.yellow} />
                  <Stat label="Total Cost"                         value={`$${totalCost.toFixed(2)}`} color={C.accent} />
                  <Stat label={`Price (${settings.defaultMarkup}% up)`} value={`$${suggested.toFixed(2)}`} color={C.green} />
                </div>
              </div>

              {/* Toolbar */}
              <div style={{ padding: "10px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 10, alignItems: "center", background: C.bg, flexShrink: 0 }}>
                <input style={{ ...inp, width: 220 }} placeholder="Search parts…" value={search} onChange={e => setSearch(e.target.value)} />
                <div style={{ flex: 1 }} />
                <button onClick={() => setShowAddPart(true)} style={btnPrimary}>+ Add Part</button>
              </div>

              {/* Table */}
              <div style={{ flex: 1, overflowY: "auto" }}>
                {filtered.length === 0 ? (
                  <div style={{ textAlign: "center", color: C.dim, padding: "60px 0", fontSize: 12 }}>
                    {search ? "No parts match." : "No parts yet — click Add Part to start your BOM."}
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: C.dim, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", position: "sticky", top: 0, background: C.bg, zIndex: 1 }}>
                        {["", "Name", "Vendor", "Qty", "Part # / Files", "Unit $", "Total", "Asm", "Notes", ""].map((h, i) => (
                          <th key={i} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(part => {
                        const cost = n2(part.unitCost);
                        const tot  = cost * n2(part.qty || 1);
                        const asm  = n2(part.assemblyMins) * n2(part.qty || 1);
                        return (
                          <tr key={part.id} className="prow" style={{ borderBottom: `1px solid #0a1a28`, transition: "background 0.1s" }}>
                            <td style={{ padding: "9px 10px", width: 22 }}>
                              <span title={PART_TYPES.find(t => t.id === part.type)?.label}>
                                {PART_TYPES.find(t => t.id === part.type)?.icon}
                              </span>
                            </td>
                            <td style={{ padding: "9px 10px", color: "#c8d8e8", fontSize: 12, fontWeight: 500 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                {part.name}
                                {part.isStock && (
                                  <span style={{ background: C.yellow + "22", color: C.yellow, border: `1px solid ${C.yellow}44`, borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em" }}>STOCK</span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: "9px 10px" }}><Badge vendorId={part.vendor} /></td>
                            <td style={{ padding: "9px 10px", color: "#7aafcc", fontSize: 12 }}>{part.qty} <span style={{ color: C.dim, fontSize: 10 }}>{part.unit}</span></td>
                            <td style={{ padding: "9px 10px", fontSize: 11, maxWidth: 180 }}>
                              {part.partNumber && <div style={{ color: C.muted }}>{part.partNumber}</div>}
                              {part.files && (
                                <div style={{ color: C.green, marginTop: 2, fontSize: 10 }}>
                                  {part.files.split(",").map((f, i) => <span key={i} style={{ marginRight: 6 }}>📄 {f.trim()}</span>)}
                                </div>
                              )}
                              {!part.partNumber && !part.files && <span style={{ color: C.faint }}>—</span>}
                            </td>
                            <td style={{ padding: "9px 10px", color: C.muted, fontSize: 12 }}>
                              {cost > 0 ? `$${cost.toFixed(2)}` : <span style={{ color: C.faint }}>—</span>}
                            </td>
                            <td style={{ padding: "9px 10px", color: tot > 0 ? C.accent : C.faint, fontSize: 12, fontWeight: 700 }}>
                              {tot > 0 ? `$${tot.toFixed(2)}` : "—"}
                            </td>
                            <td style={{ padding: "9px 10px", fontSize: 11 }}>
                              {asm > 0 ? <span style={{ color: C.purple }}>{asm.toFixed(0)}m</span> : <span style={{ color: C.faint }}>—</span>}
                            </td>
                            <td style={{ padding: "9px 10px", color: C.muted, fontSize: 11, maxWidth: 160 }}>
                              {part.notes || <span style={{ color: C.faint }}>—</span>}
                            </td>
                            <td style={{ padding: "9px 10px" }}>
                              <div className="acts" style={{ display: "flex", gap: 5, opacity: 0, transition: "opacity 0.15s" }}>
                                <button onClick={() => setEditPart(part)} style={{ ...btnGhost, padding: "3px 8px", fontSize: 9 }}>edit</button>
                                <button onClick={() => deletePart(part.id)} style={{ ...btnDanger, padding: "3px 8px", fontSize: 9 }}>✕</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4} style={{ padding: "12px 10px", borderTop: `1px solid ${C.border2}`, color: C.dim, fontSize: 10 }}>
                          {filtered.length} parts · {filtered.reduce((s, p) => s + n2(p.assemblyMins) * n2(p.qty || 1), 0).toFixed(0)} min assembly
                        </td>
                        <td colSpan={2} style={{ padding: "12px 10px", borderTop: `1px solid ${C.border2}`, color: C.muted, fontSize: 12 }}>Parts subtotal</td>
                        <td style={{ padding: "12px 10px", borderTop: `1px solid ${C.border2}`, color: C.accent, fontSize: 14, fontWeight: 700 }}>
                          ${filtered.reduce((s, p) => s + n2(p.unitCost) * n2(p.qty || 1), 0).toFixed(2)}
                        </td>
                        <td colSpan={3} style={{ borderTop: `1px solid ${C.border2}` }} />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, color: C.dim }}>
              <div style={{ fontSize: 40 }}>🔩</div>
              <div style={{ fontSize: 12 }}>No project selected</div>
              <button onClick={() => setShowAddProj(true)} style={btnPrimary}>+ Create First Project</button>
            </div>
          )}
        </div>
      </div>

      {/* ── MODALS ── */}
      {showSettings  && <SettingsModal settings={settings} onSave={s => { saveSettings(s); setShowSettings(false); }} onClose={() => setShowSettings(false)} />}
      {showAddProj   && <ProjectModal onSave={addProject} onClose={() => setShowAddProj(false)} />}
      {editProj      && <ProjectModal initial={editProj} onSave={updateProject} onClose={() => setEditProj(null)} />}
      {showAddPart   && <PartModal settings={settings} onSave={addPart} onClose={() => setShowAddPart(false)} />}
      {editPart      && <PartModal initial={editPart} settings={settings} onSave={updatePart} onClose={() => setEditPart(null)} />}
      {showDelivery  && <DeliveryModal delivery={active?.delivery} onSave={saveDelivery} onClose={() => setShowDelivery(false)} />}
      {showQuote && active && <QuoteModal project={active} settings={settings} onClose={() => setShowQuote(false)} />}

      {deleteConfirm && (
        <Modal title="Delete Project" onClose={() => setDeleteConfirm(null)} width={360}>
          <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>
            Delete <strong style={{ color: "#e0f4ff" }}>{projects.find(p => p.id === deleteConfirm)?.name}</strong>? This cannot be undone.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setDeleteConfirm(null)} style={btnGhost}>Cancel</button>
            <button onClick={() => deleteProject(deleteConfirm)} style={{ ...baseBtn, background: C.red, color: "#fff", border: "none" }}>Delete</button>
          </div>
        </Modal>
      )}
    </>
  );
}
