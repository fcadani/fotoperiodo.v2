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

  // ref for calendar export
  const calendarRef = useRef(null);
  // Centrar automáticamente la celda actual en el calendario
useEffect(() => {
  if (!calendarRef.current) return;
  const el = calendarRef.current.querySelector(".now-cell");
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }
}, [currentDayIndex24h, currentHourIndex]);


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

  // download calendar image using html2canvas (scale = 3 for higher res)
  const downloadCalendarImage = useCallback(async (format = "png", scale = 3) => {
    if (!calendarRef.current) return;
    try {
      const canvas = await html2canvas(calendarRef.current, {
        backgroundColor: null,
        useCORS: true,
        scale
      });
      const mime = format === "jpeg" ? "image/jpeg" : "image/png";
      const dataUrl = canvas.toDataURL(mime, format === "jpeg" ? 0.92 : 1.0);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `fotoperiodo_calendar.${format}`;
      a.click();
    } catch (err) {
      console.error("Error exportando calendario:", err);
      alert("No se pudo exportar la imagen. Ver consola para más info.");
    }
  }, []);

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

        <main className="grid lg:grid-cols-3 gap-6">
          {/* Configuration */}
          <section className="lg:col-span-2 p-4 sm:p-6 rounded-xl border shadow-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--accent-700)' }}>Configuración</h2>

            <div className="space-y-4">
              <div>
                <label className="text-sm block mb-1" style={{ color: 'var(--muted)' }}>Fecha y hora de inicio</label>
                <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  className="w-full p-3 rounded-lg border border-transparent outline-none" style={{ background: 'rgba(255,255,255,0.02)' }} />
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm block mb-1" style={{ color: 'var(--muted)' }}>ON (hs)</label>
                  <input type="number" min="0" step="0.5" value={hoursLight}
                    onChange={(e) => setHoursLight(clamp(Number(e.target.value), 0, 9999))}
                    className="w-full p-3 rounded-lg border border-transparent outline-none" style={{ background: 'rgba(255,255,255,0.02)' }} />
                </div>

                <div>
                  <label className="text-sm block mb-1" style={{ color: 'var(--muted)' }}>OFF (hs)</label>
                  <input type="number" min="0" step="0.5" value={hoursDark}
                    onChange={(e) => setHoursDark(clamp(Number(e.target.value), 0, 9999))}
                    className="w-full p-3 rounded-lg border border-transparent outline-none" style={{ background: 'rgba(255,255,255,0.02)' }} />
                </div>

                <div>
                  <label className="text-sm block mb-1" style={{ color: 'var(--muted)' }}>Duración (días)</label>
                  <input type="number" min="1" max="9999" value={durationDays}
                    onChange={(e) => setDurationDays(clamp(Number(e.target.value), 1, 9999))}
                    className="w-full p-3 rounded-lg border border-transparent outline-none" style={{ background: 'rgba(255,255,255,0.02)' }} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-2">                
                <label className="flex items-center gap-2 px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg cursor-pointer shadow-md hover:bg-emerald-700 transition">
                  <Upload className="w-4 h-4"/> Importar config
                  <input type="file" accept="application/json" onChange={(e) => handleImport(e.target.files?.[0])} className="hidden" />
                </label>

                <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 text-sm bg-indigo-500 text-white rounded-lg shadow-md hover:bg-indigo-600 transition"> Exportar JSON </button>

                <button onClick={resetDefaults} className="ml-auto flex items-center gap-2 px-3 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"> <RefreshCw className="w-4 h-4"/> Reset</button>
              </div>

              {errorMsg && <div className="text-sm text-red-400 mt-2 p-2 bg-red-900/20 rounded-lg">{errorMsg}</div>}
            </div>
          </section>

          {/* Status */}
          <aside className="p-4 sm:p-6 rounded-xl border shadow-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--accent-700)' }}>Estado</h3>

            <div className="space-y-4 text-sm">
              <div className="border-b border-white/5 pb-2">
                <div className="text-xs text-gray-400">Inicio:</div>
                <div className="font-mono text-sm">{formatStartDate(startDateObj)}</div>
              </div>

              <div className="border-b border-white/5 pb-2 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-extrabold" style={{ color: 'var(--superciclo-red)' }}>DÍAS SUPER CICLO</div>
                  <div className="font-extrabold text-3xl" style={{ color: 'var(--superciclo-red)' }}>
                    {Math.max(0, customCycleDayIndex)}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">(Ciclos completos de {cycleLength.toFixed(1)}h)</div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-extrabold text-white">TIEMPO TRANSCURRIDO</div>
                  <div className="font-mono text-xl text-white mt-1">
                    {formattedTimeElapsed.display}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">(Equivalente en días 24h)</div>
                </div>
              </div>

              <div className="border-b border-white/5 pb-2">
                <div className="text-xs text-gray-400 flex items-center gap-1"><Zap className="w-3 h-3 text-yellow-500"/> Balance Energético (vs 12L/12D):</div>
                <div className={`font-extrabold text-xl ${balanceColor}`}>
                  {balanceIcon} {Math.abs(energyBalance).toFixed(2)} hrs
                </div>
                <div className="text-xs text-gray-400"> {balanceText} luz acumulado desde el inicio.</div>
              </div>

              <div className="border-b border-white/5 pb-2">
                <div className="text-xs text-gray-400">Hora actual:</div>
                <div className="font-mono text-lg text-white">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>

              <div className="border-b border-white/5 pb-2">
                <div className="text-xs text-gray-400">Estado del ciclo</div>
                <div
                  className={`inline-block px-3 py-1 rounded-full text-sm font-bold transition-all duration-300 ease-out`}
                  style={{
                    background: isNowLight
                      ? "linear-gradient(90deg,#facc15,#f472b6)"
                      : "var(--accent)",
                    color: isNowLight ? "#111827" : "#fff",
                    transform: isNowLight ? "scale(1.05)" : "scale(1)",
                    boxShadow: isNowLight
                      ? "0 0 15px rgba(244,114,182,0.4)"
                      : "0 0 10px rgba(99,102,241,0.3)",
                  }}
                >
                  {isNowLight ? "ON 🔆" : "OFF 🌙"}
                </div>

              </div>

              <div>
                <div className="text-xs text-gray-400">Próximo evento ({nextChangeEvent.action})</div>
                <div className="font-semibold text-white text-base">{nextChangeEvent.nextState} — {nextChangeEvent.time} ({nextChangeEvent.date})</div>
                <div className="text-xs text-gray-400">En {nextChangeEvent.hoursToNext?.toFixed(2) ?? '--'} hrs</div>
              </div>
            </div>
          </aside>

          {/* Calendar full width below */}
<section
  className="lg:col-span-3 mt-4 p-0 rounded-xl border shadow-lg overflow-hidden"
  style={{ background: "rgba(255,255,255,0.02)" }}
>
  <div className="p-4 border-b flex items-center justify-between bg-slate-800/50">
    <h4 className="font-semibold text-white text-lg">
      Calendario (Día × Hora)
    </h4>

    <div className="flex items-center gap-3">
      <div className="text-sm text-gray-400">{durationDays} días</div>
      <div className="flex gap-2">
        <button
          onClick={() => downloadCalendarImage("jpeg")}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-pink-400 text-black rounded-lg shadow-md hover:brightness-95 transition"
        >
          <Download className="w-4 h-4" /> Descargar JPG
        </button>
      </div>
    </div>
  </div>

          {/* Contenedor con scroll controlado */}
          <div className="calendar-wrapper calendar" ref={calendarRef}>
            <table className="min-w-full text-xs">
              <thead>
                <tr>
                  <th className="p-2 text-left sticky-col">Día</th>
                  <th className="p-2 text-left sticky-col-2">Fecha</th>
                  {Array.from({ length: 24 }).map((_, h) => (
                    <th key={h} className="p-2 text-center text-sm text-gray-200 w-8">
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
                      d === currentDayIndex24h ? "bg-indigo-900/6" : ""
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

