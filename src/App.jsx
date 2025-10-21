/**
 * App.jsx — Fotoperiodo (Versión final extendida y corregida)
 * - Mantiene toda la lógica original
 * - Mejoras visuales (Inter, indigo + acentos rosados)
 * - Superciclo en rojo, ON/OFF con emoji
 * - Celda actual con contorno llamativo
 * - Export PNG/JPEG del calendario con html2canvas (scale=3)
 * - CSS separado en src/App.css
 *
 * Requisitos:
 * npm i html2canvas lucide-react
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sun, Moon, Download, Upload, RefreshCw, Zap } from "lucide-react";
import html2canvas from "html2canvas";
import "./App.css";
import domtoimage from "dom-to-image-more";
import html2pdf from "html2pdf.js";

const STORAGE_KEY = "fotoperiodo_settings_v1";

/* ---------- Helpers ---------- */
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function safeParseJSON(str, fallback) {
  try { return JSON.parse(str); } catch (e) { return fallback; }
}

function fmtDateTimeLocal(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  const pad = (n) => n.toString().padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${y}-${m}-${day}T${h}:${min}`;
}

/* ---------- Component ---------- */
export default function App() {
  // ---- State ----
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return fmtDateTimeLocal(d);
  });

  const [hoursLight, setHoursLight] = useState(13);
  const [hoursDark, setHoursDark] = useState(14);
  const [durationDays, setDurationDays] = useState(60);

  const [now, setNow] = useState(new Date());
  const [errorMsg, setErrorMsg] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  // ref for calendar export
  const calendarRef = useRef(null);


  // ---- Load saved settings on mount ----
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const obj = safeParseJSON(raw, null);
    if (!obj) return;
    if (obj.startDate) setStartDate(String(obj.startDate));
    if (Number.isFinite(Number(obj.hoursLight))) setHoursLight(Number(obj.hoursLight));
    if (Number.isFinite(Number(obj.hoursDark))) setHoursDark(Number(obj.hoursDark));
    if (Number.isFinite(Number(obj.durationDays))) setDurationDays(Number(obj.durationDays));
  }, []);

  // ---- Autosave (debounced simple) ----
  useEffect(() => {
    const payload = { startDate, hoursLight, hoursDark, durationDays };
    const id = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); }
      catch (e) { console.warn("No se pudo guardar en localStorage:", e); }
    }, 300);
    return () => clearTimeout(id);
  }, [startDate, hoursLight, hoursDark, durationDays]);

  // ---- Tick for 'now' ----
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000); // every 30s
    return () => clearInterval(id);
  }, []);

  // ---- Validation helpers ----
  const validateInputs = useCallback(() => {
    setErrorMsg("");
    if (!startDate) { setErrorMsg("La fecha de inicio es requerida."); return false; }
    const d = new Date(startDate);
    if (isNaN(d.getTime())) { setErrorMsg("Formato de fecha inválido."); return false; }
    if (!Number.isFinite(Number(hoursLight)) || Number(hoursLight) < 0) { setErrorMsg("Horas de luz inválidas."); return false; }
    if (!Number.isFinite(Number(hoursDark)) || Number(hoursDark) < 0) { setErrorMsg("Horas de oscuridad inválidas."); return false; }
    if (!Number.isFinite(Number(durationDays)) || Number(durationDays) < 1) { setErrorMsg("Duración debe ser >= 1 día."); return false; }
    return true;
  }, [startDate, hoursLight, hoursDark, durationDays]);

  // ---- Derived / computed values (same logic original) ----
  const startDateObj = useMemo(() => {
    const d = new Date(startDate);
    if (isNaN(d.getTime())) return new Date();
    return d;
  }, [startDate]);

  const cycleLength = useMemo(() => {
    const sum = Number(hoursLight) + Number(hoursDark);
    return sum > 0 ? sum : 0.0000001; // avoid zero
  }, [hoursLight, hoursDark]);

  const fractionalStartOffset = useMemo(() => {
    return startDateObj.getHours() + startDateObj.getMinutes() / 60 + startDateObj.getSeconds() / 3600;
  }, [startDateObj]);

  const hoursSinceStartNow = useMemo(() => {
    return (now.getTime() - startDateObj.getTime()) / (1000 * 60 * 60);
  }, [now, startDateObj]);

  const currentInCycle = useMemo(() => {
    return ((hoursSinceStartNow % cycleLength) + cycleLength) % cycleLength;
  }, [hoursSinceStartNow, cycleLength]);

  const isNowLight = useMemo(() => currentInCycle < Number(hoursLight), [currentInCycle, hoursLight]);

  // Días "superciclo" (ciclos custom completos)
  const customCycleDayIndex = useMemo(() => Math.floor(hoursSinceStartNow / cycleLength), [hoursSinceStartNow, cycleLength]);

// === calendar helpers (24h-based) ===

// Cuántas horas reales transcurrieron desde el inicio del ciclo
const currentHoursElapsed = useMemo(() => {
  return (now.getTime() - startDateObj.getTime()) / (1000 * 60 * 60);
}, [now, startDateObj]);

// Día actual dentro del ciclo
const currentDayIndex24h = Math.floor(currentHoursElapsed / 24);

// Hora actual dentro del ciclo (0–23)
const currentHourIndex = Math.floor(currentHoursElapsed % 24);

// Determina si en esa hora del ciclo hay luz u oscuridad
function isLightAtAbsoluteHours(hoursSinceStart) {
  const inCycle = ((hoursSinceStart % cycleLength) + cycleLength) % cycleLength;
  return inCycle < Number(hoursLight);
}


  // energy balance vs 12/12
  const energyBalance = useMemo(() => {
    if (hoursSinceStartNow < 0) return 0;
    const hoursLightCustom = Number(hoursLight);
    const cycleLenCustom = cycleLength;
    const lightHoursConsumedCustom = (hoursLightCustom / cycleLenCustom) * hoursSinceStartNow;
    const lightHoursConsumedStandard = 0.5 * hoursSinceStartNow;
    const totalBalance = lightHoursConsumedStandard - lightHoursConsumedCustom;
    return totalBalance;
  }, [hoursLight, hoursSinceStartNow, cycleLength]);

  // formatted time elapsed
  const formattedTimeElapsed = useMemo(() => {
    if (hoursSinceStartNow < 0) return { days: 0, hours: 0, minutes: 0, display: "0 d" };
    let totalMinutes = Math.floor(hoursSinceStartNow * 60);
    const days = Math.floor(totalMinutes / (24 * 60));
    totalMinutes %= (24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    let parts = [];
    if (days > 0) parts.push(`${days} d`);
    if (hours > 0 || (days === 0 && minutes > 0)) parts.push(`${hours} h`);
    if (minutes > 0 && days === 0 && hours === 0) parts.push(`${minutes} m`);
    return { days, hours, minutes, display: parts.length > 0 ? parts.join(' y ') : '0 d' };
  }, [hoursSinceStartNow]);

  // ---- Build calendar data (days x 24) ----
  const calendar = useMemo(() => {
    const rows = [];
    const days = clamp(Number(durationDays) || 0, 1, 9999);
    const startOfDayStart = new Date(startDateObj);
    startOfDayStart.setHours(0, 0, 0, 0);
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    for (let d = 0; d < days; d++) {
      const row = [];
      const dateForDay = new Date(startOfDayStart.getTime() + d * MS_PER_DAY);
      const dateDisplay = dateForDay.toLocaleDateString([], { day: '2-digit', month: '2-digit' }).replace(/\//g, '/');
      for (let h = 0; h < 24; h++) {
        const hoursSinceStart = d * 24 + h + fractionalStartOffset;
        row.push({
          isLight: Boolean(isLightAtAbsoluteHours(hoursSinceStart)),
          dateDisplay
        });
      }

      rows.push(row);
    }
    return rows;
  }, [durationDays, fractionalStartOffset, hoursLight, hoursDark, cycleLength, startDateObj]);

  // next event calc
  const nextChangeEvent = useMemo(() => {
    let hoursToNext;
    let nextState;
    if (isNowLight) {
      hoursToNext = Number(hoursLight) - currentInCycle;
      nextState = 'OFF';
    } else {
      hoursToNext = cycleLength - currentInCycle;
      nextState = 'ON';
    }
    if (!Number.isFinite(hoursToNext) || hoursToNext < 0) hoursToNext = 0;
    const nextDate = new Date(now.getTime() + Math.round(hoursToNext * 3600000));
    return {
      hoursToNext: hoursToNext,
      date: nextDate.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      time: nextDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      nextState,
      action: nextState === 'ON' ? 'Encendido' : 'Apagado'
    };
  }, [now, isNowLight, currentInCycle, hoursLight, hoursDark, cycleLength]);

  // export / import / reset
  const handleExport = useCallback(() => {
    const payload = { startDate, hoursLight, hoursDark, durationDays };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'fotoperiodo-config.json'; a.click();
    URL.revokeObjectURL(url);
  }, [startDate, hoursLight, hoursDark, durationDays]);

  const handleImport = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const obj = JSON.parse(e.target.result);
        if (obj.startDate) setStartDate(String(obj.startDate));
        if (Number.isFinite(Number(obj.hoursLight))) setHoursLight(Number(obj.hoursLight));
        if (Number.isFinite(Number(obj.hoursDark))) setHoursDark(Number(obj.hoursDark));
        if (Number.isFinite(Number(obj.durationDays))) setDurationDays(Number(obj.durationDays));
      } catch (err) {
        alert('Archivo inválido o con formato incorrecto.');
      }
    };
    reader.readAsText(file);
  }, []);

  const resetDefaults = useCallback(() => {
    const d = new Date(); d.setHours(0,0,0,0);
    setStartDate(fmtDateTimeLocal(d));
    setHoursLight(13); setHoursDark(14); setDurationDays(60);
  }, []);

  const formatStartDate = useCallback((dObj) => {
    if (!dObj || isNaN(dObj.getTime())) return '--';
    return dObj.toLocaleString();
  }, []);

  // run validation to show errors early
  useEffect(() => { validateInputs(); }, [validateInputs]);

// === Descargar calendario en PDF (sin márgenes, fondo uniforme, 100% visible en mobile y desktop) ===
const downloadCalendarPDF = useCallback(() => {
  const node = document.querySelector(".calendar-wrapper");
  if (!node) {
    alert("❌ No se encontró el calendario para exportar.");
    return;
  }

  // Guardar estilos previos
  const prev = {
    width: node.style.width,
    background: node.style.background,
    padding: node.style.padding,
    margin: node.style.margin,
    transform: node.style.transform,
  };

  // Aplicar fondo y ajustes base
  Object.assign(node.style, {
    background: "#111827",
    margin: "0 auto",
    padding: "40px 60px",
    borderRadius: "0",
    boxSizing: "border-box",
    overflow: "hidden",
    transform: "scale(1)",
    width: "max-content",
    maxWidth: "none",
  });
  
 // === 🔹 Eliminar sombra y borde del contenedor durante exportación ===
const section = document.querySelector("#export-area");
const prevSection = {
  boxShadow: section.style.boxShadow,
  borderRadius: section.style.borderRadius,
  overflow: section.style.overflow, 
};
section.style.boxShadow = "none";
section.style.borderRadius = "0";
section.style.overflow = "hidden";



// === Calcular dimensiones exactas ===
const rect = node.getBoundingClientRect();
const isMobile = window.innerWidth < 768;

// 🔹 En mobile ampliamos un poco el ancho para evitar recorte derecho
const realWidth = Math.ceil(rect.width + (isMobile ? 150 : 0));

// 🔹 Altura: usamos Math.floor para evitar 1px extra que crea página vacía
let realHeight = Math.floor(rect.height);

// 🔹 En mobile ajustamos el alto para eliminar el espacio blanco final
if (isMobile) {
  realHeight = realHeight - 20;
}

// 🔹 Conversión px → mm
const wMM = realWidth * 0.2646;
const hMM = realHeight * 0.2646 ; // 🔹 resta 2 mm para evitar salto de página



  // === Configuración PDF ===
  const opt = {
    margin: [0, 0, 0, 0],
    filename: "calendario_superciclo.pdf",
    image: { type: "jpeg", quality: 1 },
    html2canvas: {
      scale: 3,
      useCORS: true,
      backgroundColor: "#111827",
      scrollX: 0,
      scrollY: 0,
      width: realWidth,
      height: realHeight,
      windowWidth: realWidth,
      windowHeight: realHeight,
      x: 0,
      y: 0,
      letterRendering: true,
      dpi: 300,
      logging: false,
    },
    jsPDF: {
      unit: "mm",
       format: [wMM, hMM + 0.1],
      orientation: wMM > hMM ? "landscape" : "portrait",
      compress: true,
      precision: 16,
      autoPaging: "none",

    },
  };

  // === Generar PDF ===
  setTimeout(() => {
    html2pdf()
      .set(opt)
      .from(node)
      .save()
      .then(() => {
        Object.assign(node.style, prev);
    section.style.boxShadow = prevSection.boxShadow;
    section.style.borderRadius = prevSection.borderRadius;
    section.style.overflow = prevSection.overflow;
      })
      .catch((err) => {
        console.error("❌ Error al generar PDF:", err);
        alert("Error al generar el PDF.");
        Object.assign(node.style, prev);
      });
  }, 400);
}, []);




// === Controlador visual para exportar PDF o JPG (optimizado y con feedback visual) ===
const handleDownloadPDF = async () => {
  if (isExporting) return;
  setIsExporting(true);

  const node = document.querySelector(".calendar-wrapper");
  if (!node) {
    alert("❌ No se encontró el calendario.");
    return;
  }

  const isMobile = window.innerWidth <= 768;

  // Mostrar overlay temporal
  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    color: "#fff",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontSize: "1.1rem",
    fontWeight: "600",
    zIndex: 9999,
    backdropFilter: "blur(4px)",
  });
  overlay.textContent = isMobile ? "📸 Generando imagen HD..." : "📄 Generando PDF HD...";
  document.body.appendChild(overlay);

  try {
  if (isMobile) {
    // === MOBILE: exporta imagen JPG completa y nítida ===
    const prev = {
      width: node.style.width,
      overflowX: node.style.overflowX,
      transform: node.style.transform,
    };

    // 🔹 Expande el calendario para capturarlo entero
    Object.assign(node.style, {
      width: "max-content",
      overflowX: "visible",
      transform: "scale(1)",
    });

    // 🔹 Captura completa con buena resolución
    const canvas = await html2canvas(node, {
      scale: 2.5,
      backgroundColor: "#111827",
      useCORS: true,
      scrollX: 0,
      scrollY: 0,
      windowWidth: node.scrollWidth,
      windowHeight: node.scrollHeight,
    });

    // === Agrega un pequeño borde oscuro alrededor ===
const margin = 40; // en píxeles — podés ajustar (20 = más fino)
const borderedCanvas = document.createElement("canvas");
borderedCanvas.width = canvas.width + margin * 2;
borderedCanvas.height = canvas.height + margin * 2;
const ctx = borderedCanvas.getContext("2d");

// Fondo oscuro uniforme
ctx.fillStyle = "#111827";
ctx.fillRect(0, 0, borderedCanvas.width, borderedCanvas.height);

// Dibuja el calendario centrado dentro del margen
ctx.drawImage(canvas, margin, margin);

    // 🔹 Restaura los estilos originales
    Object.assign(node.style, prev);

    // 🔹 Genera la descarga
    const link = document.createElement("a");
    link.download = "calendario_superciclo_hd.jpg";
    link.href = borderedCanvas.toDataURL("image/jpeg", 0.95);
    link.click();
  } else {
    // === DESKTOP: usa tu función PDF original ===
    await downloadCalendarPDF();
  }
} catch (err) {
  console.error("❌ Error durante exportación:", err);
  alert("Ocurrió un error al generar la descarga.");
} finally {
  // Elimina overlay y desbloquea botón
  document.body.removeChild(overlay);
  setTimeout(() => setIsExporting(false), 800);
}

};





  // UI helpers
  const balanceColor = energyBalance > 0 ? 'text-emerald-400' : energyBalance < 0 ? 'text-rose-400' : 'text-gray-400';
  const balanceIcon = energyBalance > 0 ? '▲' : energyBalance < 0 ? '▼' : '—';
  const balanceText = energyBalance > 0 ? 'Ahorro de' : energyBalance < 0 ? 'Gasto Extra de' : 'Balance Neutral de';

  /* ----------------- JSX ----------------- */
  return (
    <div className="app-root min-h-screen font-inter" style={{ backgroundColor: "#0b1020" }}>
      <div className="max-w-6xl mx-auto rounded-3xl shadow-2xl p-4 sm:p-8 border border-gray-700" style={{ background: 'transparent' }}>
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-xl" style={{ background: 'linear-gradient(135deg, rgba(79,70,229,0.12), rgba(244,114,182,0.06))' }}>
              <Sun className="w-8 h-8 text-yellow-300" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight" style={{ color: 'var(--accent)' }}>SUPERCICLO</h1>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Configura tu SuperCiclo y visualiza tu calendario</p>

            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="text-sm text-gray-400 hide-sm"></div>
          </div>
        </header>

        <main className="grid lg:grid-cols-2 gap-6 items-stretch">


{/* === CONFIGURACIÓN === */}
<section
  id="export-area"
  className="p-6 rounded-xl border shadow-lg flex flex-col justify-between items-center text-center min-h-[480px]"
  style={{
    background: "rgba(255,255,255,0.02)",
    boxShadow: "0 0 15px rgba(147, 51, 234, 0.15), inset 0 0 15px rgba(255,255,255,0.05)",
    borderColor: "rgba(147, 51, 234, 0.3)",
  }}
>
  <h2 className="section-title mb-4 tracking-wide">Configuración</h2>

  {/* Inputs agrupados */}
  <div className="w-full max-w-md mx-auto flex flex-col gap-6">
    <div>
      <label className="text-sm block mb-1 uppercase font-semibold text-gray-400">
        Fecha y hora de inicio
      </label>
      <input
        type="datetime-local"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        className="w-full p-3 rounded-lg border border-transparent outline-none text-center font-medium"
        style={{ background: "rgba(255,255,255,0.04)", color: "#fff" }}
      />
    </div>

    <div className="grid grid-cols-3 gap-3">
      {[
        { label: <>HORAS<br />ON</>, value: hoursLight, setter: setHoursLight },
        { label: <>HORAS<br />OFF</>, value: hoursDark, setter: setHoursDark },
        { label: "Duración (días)", value: durationDays, setter: setDurationDays },
      ].map((f, i) => (
        <div key={i}>
          <label className="text-sm block mb-1 uppercase font-semibold text-gray-400">
            {f.label}
          </label>
          <input
            type="number"
            min={i === 2 ? "1" : "0"}
            step="0.5"
            value={f.value}
            onChange={(e) => f.setter(clamp(Number(e.target.value), 0, 9999))}
            className="w-full p-3 rounded-lg border border-transparent outline-none text-center font-medium"
            style={{ background: "rgba(255,255,255,0.04)", color: "#fff" }}
          />
        </div>
      ))}
    </div>
  </div>

  {/* Botones */}
  <div className="flex flex-wrap justify-center gap-3 mt-8">
    <label className="flex items-center gap-2 px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg cursor-pointer shadow-md hover:bg-emerald-700 transition">
      <Upload className="w-4 h-4" /> Importar
      <input
        type="file"
        accept="application/json"
        onChange={(e) => handleImport(e.target.files?.[0])}
        className="hidden"
      />
    </label>

    <button
      onClick={handleExport}
      className="flex items-center gap-2 px-3 py-2 text-sm bg-indigo-500 text-white rounded-lg shadow-md hover:bg-indigo-600 transition"
    >
      Exportar JSON
    </button>

    <button
      onClick={handleDownloadPDF}
      disabled={isExporting}
      className={`transition-all duration-300 text-white font-bold py-3 px-6 rounded-xl shadow-md ${
        isExporting
          ? "bg-gray-600 cursor-not-allowed opacity-70"
          : "bg-pink-500 hover:bg-pink-600 active:bg-pink-700"
      }`}
    >
      {isExporting ? "📄 Generando PDF…" : "⬇️ Descargar PDF"}
    </button>

    <div className="mt-4 p-3 rounded-xl border border-pink-500/30 bg-gradient-to-b from-indigo-950/40 to-pink-900/10 text-xs text-gray-200 text-center max-w-sm mx-auto leading-relaxed space-y-2 shadow-[0_0_20px_rgba(236,72,153,0.15)]">
      <p>
        ⚙️ <b>Recomendación:</b> para obtener el <b>PDF en máxima calidad</b>, realiza la descarga desde un ordenador o laptop.
      </p>
      <p>
        📱 Si usas un smartphone, el calendario se descargará automáticamente como <b>imagen JPG</b> para una exportación más rápida y estable.
      </p>
      <p className="text-pink-300 font-semibold">
        🚫 Si usas un móvil en modo escritorio, la exportación PDF puede tardar mucho o fallar. Usa un ordenador para mejor resultado.
      </p>
    </div>

    <button
      onClick={resetDefaults}
      className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
    >
      <RefreshCw className="w-4 h-4" /> Reset
    </button>
  </div>

  {errorMsg && (
    <div className="text-sm text-red-400 mt-2 p-2 bg-red-900/20 rounded-lg w-full max-w-md">
      {errorMsg}
    </div>
  )}
</section>

{/* === PANEL DE ESTADO — versión final equilibrada === */}
<aside
  className="p-8 rounded-xl border border-white/10 shadow-lg flex flex-col justify-between items-center text-center"
  style={{
    background:
      "radial-gradient(circle at 30% 20%, rgba(17,24,39,0.9), rgba(9,12,26,0.96))",
    minHeight: "100%",
  }}
>
  {/* --- Título --- */}
  <h2 className="section-title mb-4 tracking-wide">ESTADO</h2>


  {/* --- Contenido expandido para ocupar todo el alto --- */}
  <div className="flex flex-col justify-evenly w-full max-w-md flex-1 text-gray-200">

    {/* Inicio y tiempo */}
    <div className="pb-6 border-b border-white/10">
      <div className="flex justify-between items-center">
        <div className="text-left">
          <p className="text-sm text-gray-400 uppercase tracking-wider mb-1">Inicio</p>
          <p className="font-mono text-lg text-white font-semibold">
            {formatStartDate(startDateObj)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-400 uppercase tracking-wider mb-1">
            Tiempo transcurrido
          </p>
          <p className="font-mono text-xl text-indigo-200 font-bold">
            {formattedTimeElapsed.days}d {formattedTimeElapsed.hours}h {formattedTimeElapsed.minutes}m
          </p>
          <p className="text-[12px] text-gray-500">(equivalente a días 24h)</p>
        </div>
      </div>
    </div>

    {/* Ciclos y energía */}
    <div className="grid grid-cols-2 border-b border-white/10 pb-6 pt-4">
      <div>
        <p className="text-sm text-rose-400 font-bold uppercase tracking-wide">Días Super Ciclo</p>
        <p className="text-4xl font-extrabold text-rose-500 mt-1 leading-none flex items-center justify-center gap-2">
  <span className="emoji-fuego">🔥</span>
  <span>{Math.max(0, customCycleDayIndex)}</span>
</p>



        <p className="text-[12px] text-gray-400 mt-1">Ciclos de {cycleLength.toFixed(1)}h</p>
      </div>
      <div>
        <p className="text-sm text-indigo-400 font-semibold uppercase tracking-wide">
          Balance Energético
        </p>
        <p
  className={`font-extrabold text-4xl mt-1 leading-none ${
    energyBalance > 0
      ? "text-emerald-400"
      : energyBalance < 0
      ? "text-rose-400"
      : "text-gray-300"
  }`}
>

          {energyBalance > 0 ? "▲" : energyBalance < 0 ? "▼" : "•"}{" "}
          {Math.abs(energyBalance).toFixed(2)}h
        </p>
        <p className="text-[12px] text-gray-400 mt-1">vs ciclo estándar 12L / 12D</p>
      </div>
    </div>

    {/* Hora actual */}
    <div className="border-b border-white/10 py-5">
      <p className="text-sm text-gray-400 uppercase tracking-wider mb-1">Hora actual</p>
      <p className="font-mono text-3xl text-white font-semibold">
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>

    {/* Estado del ciclo */}
    <div className="border-b border-white/10 py-5">
      <p className="text-sm text-gray-400 uppercase tracking-wider mb-2">Estado del ciclo</p>
      <div
        className={`inline-flex items-center justify-center gap-2 px-8 py-3 rounded-full font-semibold text-base shadow-lg transition-all ${
          isNowLight
            ? "bg-yellow-300/90 text-black glow-anim-on"
            : "bg-indigo-600/90 text-white glow-anim-off"
        }`}
      >
        {isNowLight ? "ON 🔆" : "OFF 🌙"}
      </div>
    </div>

    {/* Próximo evento */}
    <div className="pt-4">
      <p className="text-sm text-gray-400 uppercase tracking-wider mb-1">
        Próximo evento ({nextChangeEvent.action})
      </p>
      <p className="text-xl font-bold text-white">
        {nextChangeEvent.nextState} — {nextChangeEvent.time} ({nextChangeEvent.date})
      </p>
      <p className="text-[13px] text-indigo-300 mt-1 font-medium">
        En {nextChangeEvent.hoursToNext?.toFixed(2)} hrs
      </p>
    </div>
  </div>
</aside>







          {/* Calendar full width below */}
<section
   id="export-area"
   className="lg:col-span-3 mt-4 mb p-0 rounded-xl border shadow-lg overflow-hidden"
   style={{ background: "rgba(255,255,255,0.02)" }}
 >

  {/* Contenedor con scroll controlado */}
<div className="calendar-wrapper calendar" ref={calendarRef}>
  <table className="min-w-full text-xs">
    <thead>
      {/* === Título principal === */}
      <tr>
         <th colSpan={26} className="calendar-title" data-text="CALENDARIO SUPERCICLO">
            CALENDARIO SUPERCICLO
          </th>

      </tr>

  {/* === Encabezado de Día / Fecha / Horas === */}
  <tr>
    <th
      className="text-center sticky-col font-bold uppercase tracking-wide"
      style={{
        background: "rgba(30,30,63,0.95)",
        zIndex: 51,
        color: "#a5b4fc",
        fontSize: "1rem",
        padding: "0.75rem 0.5rem",
      }}
    >
      Día
    </th>
    <th
      className="text-center sticky-col-2 font-bold uppercase tracking-wide"
      style={{
        background: "rgba(30,30,63,0.95)",
        zIndex: 51,
        color: "#f9a8d4",
        fontSize: "1rem",
        padding: "0.75rem 0.5rem",
      }}
    >
      Fecha
    </th>
    {Array.from({ length: 24 }).map((_, h) => (
      <th
        key={h}
        className="text-center text-gray-200 font-semibold"
        style={{
          background: "rgba(30,30,63,0.95)",
          position: "sticky",
          top: "56px",
          zIndex: 49,
          fontSize: "0.9rem",
          padding: "0.6rem 0.3rem",
          color: "#cbd5e1",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {h}h
      </th>
    ))}
  </tr>
</thead>


    <tbody>
      {calendar.map((row, d) => (
        <tr
          key={d}
          className={`${
            d === currentDayIndex24h ? "current-day-row" : ""
          } transition-all duration-500`}
        >
        {/* Columna fija: Día */}
          <td className="p-1 sticky-col font-semibold">
            {d + 1}
          </td>

          {/* Columna fija: Fecha */}
          <td className="p-1 sticky-col-2 font-semibold">
            {row[0].dateDisplay}
          </td>

            {/* Horas */}
            {row.map((cell, h) => {
  // 🔹 Hora actual del sistema
  const currentDate = new Date();

  // 🔹 Calcular día actual respecto al inicio del calendario (00:00 del día inicial)
  const startOfDayStart = new Date(startDateObj);
  startOfDayStart.setHours(0, 0, 0, 0);
  const diffHours = (currentDate - startOfDayStart) / (1000 * 60 * 60);
  const currentDayCycle = Math.floor(diffHours / 24);

  // 🔹 Hora actual del sistema (0–23)
  const currentHourCycle = currentDate.getHours();

  // 🔹 Determina si esta celda es la actual (día y hora reales)
  const isCurrent = d === currentDayCycle && h === currentHourCycle;

  return (
    <td key={h} className="p-0.5">
      <div
        className={`w-full h-7 rounded-sm flex items-center justify-center text-xs font-mono font-semibold calendar-cell-text ${
          isCurrent ? "now-cell-active" : ""
        }`}
        style={{
          background: cell.isLight
            ? "linear-gradient(90deg,#f59e0b,#f472b6)"
            : "linear-gradient(90deg,#4338ca,#4338ca99)",
          color: "#fff",
          transition: "all .12s ease",
        }}
      >
        {cell.isLight ? "ON" : "OFF "}
      </div>
    </td>
  );
})}






        </tr>
      ))}
    </tbody>
  </table>
</div>


          <div className="p-3 text-xs border-t text-center text-gray-400">
        🔆 <span className="text-yellow-300 font-semibold">ON</span> = Luz · 
        🌙 <span className="text-indigo-300 font-semibold">OFF</span> = Oscuridad · 
        <span className="text-pink-400 font-semibold">Celda resaltada</span> = hora actual del día · 
        <span className="text-gray-300">Descargable como PDF (PC) o JPG (móvil)</span>
      </div>

        </section>

        </main>
      </div>
    </div>
  );
}

