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

 // calendar helpers (24h-based)
const currentHourIndex = useMemo(() => now.getHours(), [now]);
const currentDayIndex24h = useMemo(() => {
  const startOfDayNow = new Date(now);
  startOfDayNow.setHours(0, 0, 0, 0);
  const startOfDayStart = new Date(startDateObj);
  startOfDayStart.setHours(0, 0, 0, 0);
  const daysSinceStart =
    (startOfDayNow.getTime() - startOfDayStart.getTime()) /
    (1000 * 60 * 60 * 24);
  return Math.floor(daysSinceStart);
}, [now, startDateObj]);

function isLightAtAbsoluteHours(hoursSinceStart) {
  const inCycle = ((hoursSinceStart % cycleLength) + cycleLength) % cycleLength;
  return inCycle < Number(hoursLight);
}

// === Centrar automáticamente la celda actual del calendario al abrir ===
useEffect(() => {
  if (!calendarRef.current) return;

  const el = calendarRef.current.querySelector(".now-cell");
  if (el) {
    // Evita mover el scroll si el usuario ya desplazó manualmente
    const alreadyScrolled =
      calendarRef.current.scrollTop > 50 || calendarRef.current.scrollLeft > 50;

    if (!alreadyScrolled) {
      el.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    }
  }
}, []); // ← Solo se ejecuta una vez al montar



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
        const hoursSinceStart = d * 24 + h - fractionalStartOffset;
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

// === Descargar calendario completo centrado sin recortes ni bordes ===
const downloadCalendarImage = useCallback(async (format = "jpeg") => {
  if (isExporting) return;
  setIsExporting(true);

  const node = document.querySelector(".calendar-wrapper");
  if (!node) {
    alert("❌ No se encontró el calendario para exportar.");
    setIsExporting(false);
    return;
  }

  try {
    console.log("📸 Exportando calendario completo sin recortes...");

    // === Clonar el contenedor visible del calendario ===
        const clone = node.cloneNode(true);

        // === Buscar la tabla interna y forzar versión de escritorio ===
const table = clone.querySelector("table");
if (table) {
  const originalTable = node.querySelector("table");
  const fullWidth = originalTable ? originalTable.scrollWidth : node.scrollWidth;

  table.style.overflow = "visible";
  table.style.width = `${fullWidth}px`;
  table.style.minWidth = `${fullWidth}px`;
  table.style.maxWidth = `${fullWidth}px`;
  table.style.marginLeft = "0";
  table.style.paddingLeft = "0";
}

// === Forzar estilos de escritorio para export, incluso en móvil ===
clone.style.overflow = "visible";
clone.style.width = `${node.scrollWidth}px`;
clone.style.height = `${node.scrollHeight}px`;
clone.style.minWidth = `${node.scrollWidth}px`;
clone.style.maxWidth = "none";
clone.style.boxSizing = "border-box";
clone.scrollLeft = 0;
clone.style.backgroundColor = "#0b1020";

// 🔒 Forzar visualización estilo escritorio
clone.classList.add("export-desktop");
clone.querySelectorAll("*").forEach((el) => {
  el.style.overflow = "visible";
  el.style.maxWidth = "none";
  el.style.transform = "none";
  el.style.zoom = "1";
  el.style.fontSize = "inherit";
});

        // Forzar visibilidad total (incluyendo hora 0)
        if (table) {
          const originalTable = node.querySelector("table");
          const fullWidth = originalTable ? originalTable.scrollWidth : node.scrollWidth;

          table.style.overflow = "visible";
          table.style.width = `${fullWidth}px`;
          table.style.minWidth = `${fullWidth}px`;
          table.style.maxWidth = `${fullWidth}px`;
          table.style.marginLeft = "0"; // Asegura que no se recorte la columna 0h
          table.style.paddingLeft = "0";
        }

        // === Forzar export idéntico a escritorio (misma proporción en mobile) ===
          const originalTable = node.querySelector("table");
          if (originalTable) {
            const fullWidth = originalTable.scrollWidth; // ancho completo del calendario
            clone.style.width = `${fullWidth}px`;
            clone.style.minWidth = `${fullWidth}px`;
            clone.style.maxWidth = `${fullWidth}px`;
          }

          // Asegurar escala 1:1 como escritorio
          clone.style.transform = "scale(1)";
          clone.style.transformOrigin = "top left";
          clone.style.zoom = "1";

          // Evitar que el ancho se limite al viewport móvil
          clone.style.maxWidth = "none";
          clone.style.overflowX = "visible";
          clone.style.overflowY = "visible";



        // Ajustes del clon
        clone.style.overflow = "visible";
        clone.style.width = `${node.scrollWidth + 100}px`; // agrega margen de seguridad
        clone.style.height = `${node.scrollHeight}px`;
        clone.style.minWidth = `${node.scrollWidth}px`;
        clone.style.boxSizing = "border-box";
        clone.scrollLeft = 0;
        clone.style.backgroundColor = "#0b1020";



    // Fondo sólido
    clone.style.background = "#0b1020";
    clone.style.color = "#fff";
    clone.style.margin = "0 auto";
    clone.style.display = "flex";
    clone.style.alignItems = "center";
    clone.style.justifyContent = "center";

    // 🔽 LIMPIEZA de bordes blancos y sombras (modo export limpio)
    clone.classList.add("export-clean");
    clone.querySelectorAll("*").forEach((el) => {
      el.style.border = "none";
      el.style.boxShadow = "none";
      el.style.outline = "none";
      el.style.backgroundClip = "border-box";
      el.style.filter = "none";
    });
    // 🔼 FIN BLOQUE LIMPIEZA

    // Inyectar estilos para mantener colores y gradientes
    try {
      const style = document.createElement("style");
      style.textContent = Array.from(document.styleSheets)
        .map((sheet) => {
          try {
            return Array.from(sheet.cssRules).map((r) => r.cssText).join("\n");
          } catch {
            return "";
          }
        })
        .join("\n");
      clone.prepend(style);
    } catch (e) {}

    // Contenedor seguro fuera de pantalla
    const safeContainer = document.createElement("div");
    safeContainer.style.position = "fixed";
    safeContainer.style.left = "-9999px";
    safeContainer.style.top = "0";
    safeContainer.style.background = "#0b1020";
    safeContainer.style.padding = "50px 0px "; // margen uniforme alrededor
    safeContainer.style.display = "flex";
    safeContainer.style.alignItems = "center";
    safeContainer.style.justifyContent = "center";
    safeContainer.style.border = "none";
    safeContainer.style.boxShadow = "none";
    safeContainer.style.outline = "none";

    // Añadir clon
    safeContainer.appendChild(clone);
    document.body.appendChild(safeContainer);

    // Esperar render
    await new Promise((r) => setTimeout(r, 300));

    // 🔧 Corregir superposición y alineación de columnas sticky
clone.querySelectorAll(".sticky-col, .sticky-col-2, thead th").forEach((el) => {
  el.style.position = "static"; // elimina completamente el sticky
  el.style.left = "auto";
  el.style.top = "auto";
  el.style.zIndex = "auto";
  el.style.background = "#0b1020"; // fondo uniforme con el resto
  el.style.boxShadow = "none";
  el.style.transform = "none";
});

    // === FIX de nitidez para el título durante export ===
const title = clone.querySelector(".calendar-title");
if (title) {
  // 🔹 Versión export más nítida, con color sólido y contorno brillante
  title.style.background = "none";
  title.style.webkitBackgroundClip = "unset";
  title.style.webkitTextFillColor = "#fff";
  title.style.color = "#fff";
  title.style.textShadow = `
    0 0 8px rgba(255,255,255,0.9),
    0 0 14px rgba(168,85,247,0.8),
    0 0 25px rgba(236,72,153,0.6)
  `;
  title.style.filter = "none";
  title.style.opacity = "1";
  title.style.fontSmoothing = "antialiased";
}



// Captura completa sin cortar filas ni bordes
const scale = 3; // Aumenta la resolución (2 = HD, 3 = FullHD, 4 = 4K)

const blob =
  format === "jpeg"
    ? await domtoimage.toJpeg(safeContainer, {
        quality: 1,
        bgcolor: "#0b1020",
        style: {
          backgroundColor: "#0b1020",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: `${safeContainer.offsetWidth}px`,
          height: `${safeContainer.offsetHeight}px`,
        },
        width: safeContainer.offsetWidth * scale,
        height: safeContainer.offsetHeight * scale,
      })
    : await domtoimage.toPng(safeContainer, {
        quality: 1,
        bgcolor: "#0b1020",
        style: {
          backgroundColor: "#0b1020",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: `${safeContainer.offsetWidth}px`,
          height: `${safeContainer.offsetHeight}px`,
        },
        width: safeContainer.offsetWidth * scale,
        height: safeContainer.offsetHeight * scale,
      });




    // Limpieza
    document.body.removeChild(safeContainer);
    clone.classList.remove("export-clean");

    // Descargar
    const a = document.createElement("a");
    a.href = blob;
    a.download = `fotoperiodo_calendar.${format}`;
    a.click();

    console.log("✅ Exportación completa y centrada sin recortes ni contornos blancos.");
  } catch (err) {
    console.error("❌ Error al exportar calendario:", err);
    alert("No se pudo exportar correctamente la imagen.");
  } finally {
    setIsExporting(false);
  }
}, [isExporting]);



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
  <h2 className="section-title">CONFIGURACIÓN</h2>

  {/* Inputs agrupados y centrados */}
  <div className="w-full max-w-md mx-auto flex flex-col gap-5">
    <div>
      <label
        className="text-sm block mb-1 uppercase font-semibold"
        style={{ color: "var(--muted)" }}
      >
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
          <label
            className="text-sm block mb-1 uppercase font-semibold"
            style={{ color: "var(--muted)" }}
          >
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

  {/* Botones con estilo armonizado */}
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
      onClick={() => downloadCalendarImage("jpeg")}
      disabled={isExporting}
      className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg shadow-md transition ${
        isExporting
          ? "bg-gray-500 text-gray-300 cursor-wait"
          : "bg-pink-400 text-black hover:brightness-95"
      }`}
    >
      <Download className="w-4 h-4" />
      {isExporting ? "Exportando..." : "Descargar JPG"}
    </button>

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


          {/* Status */}
          {/* Panel de Estado mejorado */}
          <aside
            className="p-6 rounded-xl border shadow-lg flex flex-col gap-6"
            style={{
              background: "rgba(255,255,255,0.02)",
              minHeight: "100%",
            }}
          >
            <h2 className="section-title">Estado</h2>

            {/* Inicio y Tiempo */}
            <div className="flex justify-between items-start border-b border-white/10 pb-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Inicio</p>
                <p className="font-mono text-sm text-gray-200 mt-1">{formatStartDate(startDateObj)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 uppercase tracking-wider">Tiempo transcurrido</p>
                <p className="font-mono text-base text-white mt-1">
                  {formattedTimeElapsed.days}d {formattedTimeElapsed.hours}h {formattedTimeElapsed.minutes}m
                </p>
                <p className="text-[11px] text-gray-500">(equivalente a días 24h)</p>
              </div>
            </div>

            {/* Ciclos y energía */}
            <div className="grid grid-cols-2 text-sm border-b border-white/10 pb-4">
              <div className="text-left">
                <p className="text-xs text-rose-400 font-bold uppercase tracking-wide">Días Super Ciclo</p>
                <p className="text-4xl font-extrabold text-rose-500 mt-1">{Math.max(0, customCycleDayIndex)}</p>
                <p className="text-[11px] text-gray-400 mt-1">
                  Ciclos de {cycleLength.toFixed(1)}h
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-indigo-400 font-semibold uppercase tracking-wide">
                  Balance Energético
                </p>
                <p
                  className={`font-extrabold text-2xl ${
                    energyBalance > 0
                      ? "text-emerald-400"
                      : energyBalance < 0
                      ? "text-rose-400"
                      : "text-gray-300"
                  } mt-1`}
                >
                  {energyBalance > 0 ? "▲" : energyBalance < 0 ? "▼" : "•"}{" "}
                  {Math.abs(energyBalance).toFixed(2)} hrs
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  vs ciclo estándar 12L / 12D
                </p>
              </div>
            </div>

            {/* Hora actual */}
            <div className="border-b border-white/10 pb-4">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Hora actual</p>
              <p className="font-mono text-lg text-white mt-1">
                {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>

            {/* Estado del ciclo */}
            {/* Estado del ciclo */}
                <div className="border-b border-white/10 pb-4 text-center">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Estado del ciclo</p>
                  <div
                    className={`inline-flex items-center gap-2 px-5 py-2 mt-3 rounded-full font-semibold text-sm shadow-md 
                      ${isNowLight 
                        ? "bg-yellow-300/90 text-black glow-anim-on" 
                        : "bg-indigo-600/90 text-white glow-anim-off"}`}
                  >
                    {isNowLight ? "ON 🔆" : "OFF 🌙"}
                  </div>
                </div>


            {/* Próximo evento */}
            <div className="text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                Próximo evento ({nextChangeEvent.action})
              </p>
              <p className="text-base font-bold text-white">
                {nextChangeEvent.nextState} — {nextChangeEvent.time} ({nextChangeEvent.date})
              </p>
              <p className="text-[12px] text-gray-400 mt-1">
                En {nextChangeEvent.hoursToNext?.toFixed(2)} hrs
              </p>
            </div>
          </aside>

          {/* Calendar full width below */}
<section
   id="export-area"
   className="lg:col-span-3 mt-4 p-0 rounded-xl border shadow-lg overflow-hidden"
   style={{ background: "rgba(255,255,255,0.02)" }}
 >

  {/* Contenedor con scroll controlado */}
<div className="calendar-wrapper calendar" ref={calendarRef}>
  <table className="min-w-full text-xs">
    <thead>
  {/* === Título principal === */}
  <tr>
   <th colSpan={26} className="calendar-title">
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
          } hover:bg-white/2 transition`}
        >
          {/* Columna fija: Día */}
          <td
            className="p-1 sticky-col font-semibold"
            style={{
              background:
                d === currentDayIndex24h
                  ? "rgba(99,102,241,0.12)"
                  : "rgba(15,15,35,0.9)",
            }}
          >
            {d + 1}
          </td>

          {/* Columna fija: Fecha */}
          <td
            className="p-1 sticky-col-2 font-semibold"
            style={{
              background:
                d === currentDayIndex24h
                  ? "rgba(99,102,241,0.12)"
                  : "rgba(15,15,35,0.9)",
            }}
          >
            {row[0].dateDisplay}
          </td>

          {/* Horas */}
          {row.map((cell, h) => {
            const isCurrent =
              d === currentDayIndex24h && h === currentHourIndex;
            return (
              <td key={h} className="p-0.5">
                <div
                  className={`w-full h-7 rounded-sm flex items-center justify-center text-xs font-mono font-semibold calendar-cell-text ${
                    isCurrent ? "now-cell" : ""
                  }`}
                  style={{
                    background: cell.isLight
                      ? "linear-gradient(90deg,#f59e0b,#f472b6)"
                      : "linear-gradient(90deg,#4338ca,#4338ca99)",
                    color: "#fff",
                    transition: "all .12s ease",
                  }}
                >
                  {cell.isLight ? "L" : "D"}
                </div>
              </td>
            );
          })}
        </tr>
      ))}
    </tbody>
  </table>
</div>


          <div className="p-3 text-xs text-gray-400 border-t">
            Leyenda: L = Luz, D = Oscuridad. Celda actual marcada con contorno rosado
            brillante. Podés descargar el calendario como imagen (PNG/JPG) para usarlo
            de wallpaper.
          </div>
        </section>

        </main>
      </div>
    </div>
  );
}

