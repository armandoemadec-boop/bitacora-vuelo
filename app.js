'use strict';
/* Bitácora de Vuelo – MVP (DAN 61, Apéndice D, DGAC Chile)
   Datos guardados localmente en el dispositivo (localStorage). */

const KEY = 'bitacora.v1';

const AC_TYPES = {
  LSA: 'Aeronave deportiva liviana (LSA)',
  SEP: 'Avión monomotor',
  MEP: 'Avión multimotor',
  TURBOPROP: 'Avión turbohélice',
  TURBOJET: 'Avión turbojet',
  HELI: 'Helicóptero',
  GLIDER: 'Planeador',
  ULM: 'Ultraliviano motorizado (ULM)',
  UL: 'Ultraliviano no motorizado (UL)',
  FSTD: 'Simulador / FTD / entrenador IFR'
};
const AC_SHORT = { LSA: 'LSA', SEP: 'Mono', MEP: 'Multi', TURBOPROP: 'T.Hél', TURBOJET: 'T.Jet', HELI: 'Heli', GLIDER: 'Plan', ULM: 'ULM', UL: 'UL', FSTD: 'Sim' };
const FUNCS = {
  dual: 'Instrucción recibida (doble mando)',
  solo: 'Solo',
  pic: 'Piloto al mando (PIC)',
  sic: 'Copiloto (SIC)',
  instr: 'Instructor de vuelo'
};
const FUNC_SHORT = { dual: 'Instrucción', solo: 'Solo', pic: 'PIC', sic: 'SIC', instr: 'Instructor' };
const LIC = {
  alumno: 'Alumno piloto',
  privado: 'Piloto privado',
  comercial: 'Piloto comercial',
  tla: 'Transporte de línea aérea',
  planeador: 'Piloto de planeador',
  ulm: 'Piloto ULM'
};
const ROLE_KEYS = ['dual', 'solo', 'pic', 'sic', 'instr'];
const TIME_KEYS = [...ROLE_KEYS, 'night', 'ifr', 'xc'];

/* ---------- Persistencia ---------- */
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.flights)) return normalize(d);
  } catch (e) { /* datos corruptos: se parte vacío */ }
  return { version: 1, profile: {}, aircraft: [], flights: [] };
}
function normalize(d) {
  return { version: 1, profile: d.profile || {}, aircraft: d.aircraft || [], flights: d.flights || [] };
}
function save() { localStorage.setItem(KEY, JSON.stringify(db)); }

let db = load();
const state = { tab: 'resumen', editId: null, acEditId: null, q: '' };

/* ---------- Utilidades ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r1 = n => Math.round(n * 10) / 10;
function num(v) {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
const int = v => Math.max(0, Math.round(num(v)));
const fmtH = n => r1(n || 0).toFixed(1).replace('.', ',');
const fv = n => (n ? String(r1(n)).replace('.', ',') : '');
function fmtD(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}
function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function isoOf(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function addDays(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d); }
function addMonths(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + n); return isoOf(d); }
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const byDateDesc = (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
const byDateAsc = (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt;

/* ---------- Cálculos ---------- */
function totals(flights) {
  const t = { n: 0, total: 0, sim: 0, landDay: 0, landNight: 0, appNum: 0, soloXc: 0 };
  TIME_KEYS.forEach(k => (t[k] = 0));
  for (const f of flights) {
    t.n++;
    if (f.sim) { t.sim += f.total; continue; } // el simulador no es tiempo de vuelo
    t.total += f.total;
    TIME_KEYS.forEach(k => (t[k] += f[k] || 0));
    t.landDay += f.landDay || 0;
    t.landNight += f.landNight || 0;
    t.appNum += f.appNum || 0;
    if (f.solo > 0) t.soloXc += Math.min(f.xc || 0, f.solo);
  }
  for (const k in t) if (k !== 'n') t[k] = r1(t[k]);
  return t;
}

// Fecha hasta la que se cumplen "3 aterrizajes en N días" (DAN 61, 61.037)
function recency(flights, count, days) {
  const fl = flights.filter(f => !f.sim && count(f) > 0).sort(byDateDesc);
  let c = 0;
  for (const f of fl) {
    c += count(f);
    if (c >= 3) return addDays(f.date, days);
  }
  return null;
}

/* ---------- Navegación ---------- */
function setTitle(t) { document.getElementById('title').textContent = t; }
function go(tab, opts = {}) {
  Object.assign(state, { tab, editId: null, acEditId: null }, opts);
  render();
}
function render() {
  document.querySelectorAll('#tabs button').forEach(b => {
    const on = b.dataset.tab === state.tab && !(state.tab === 'vuelo' && state.editId);
    b.classList.toggle('on', on || (state.tab === 'vuelo' && state.editId && b.dataset.tab === 'vuelos'));
  });
  const v = document.getElementById('view');
  const ta = document.getElementById('topaction');
  ta.innerHTML = '';
  ({ resumen: viewResumen, vuelos: viewVuelos, vuelo: viewVuelo, aeronaves: viewAeronaves, perfil: viewPerfil })[state.tab](v, ta);
  window.scrollTo(0, 0);
}
document.getElementById('tabs').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) go(b.dataset.tab);
});
document.getElementById('view').addEventListener('click', e => {
  const a = e.target.closest('[data-go]');
  if (a) { e.preventDefault(); go(a.dataset.go); }
});

/* ---------- Resumen ---------- */
function stat(label, value, unit = 'h') {
  return `<div class="stat"><div class="v">${unit === 'h' ? fmtH(value) : value}</div><div class="l">${label}</div></div>`;
}
function statusRow(label, sub, until, emptyMsg) {
  let cls = 'none', txt = emptyMsg || 'Sin datos';
  if (until) {
    const left = daysBetween(today(), until);
    cls = left < 0 ? 'bad' : left <= 30 ? 'warn' : 'ok';
    txt = left < 0 ? `Vencido el ${fmtD(until)}` : `Hasta ${fmtD(until)} · ${left} día${left === 1 ? '' : 's'}`;
  } else if (emptyMsg) cls = 'bad';
  return `<li class="status ${cls}"><div><b>${label}</b><small>${sub}</small></div><span>${txt}</span></li>`;
}
function bar(label, have, need, unit = 'h') {
  const pct = Math.min(100, Math.round((have / need) * 100));
  const val = unit === 'h' ? `${fmtH(have)} / ${need} h` : `${have} / ${need}`;
  return `<div class="bar"><div class="bl"><span>${label}</span><span>${val}</span></div><div class="track"><div class="fill ${pct >= 100 ? 'done' : ''}" style="width:${pct}%"></div></div></div>`;
}
function viewResumen(v) {
  setTitle('Resumen');
  const p = db.profile, lic = p.license || 'alumno';
  const t = totals(db.flights);
  const has = db.flights.some(f => !f.sim);
  const days = ['alumno', 'privado', 'planeador'].includes(lic) ? 180 : 90;
  const rec = recency(db.flights, f => (f.landDay || 0) + (f.landNight || 0), days);
  const recN = recency(db.flights, f => f.landNight || 0, 180);
  let h = '';
  if (!p.name) h += `<div class="card notice">Completa tu <a href="#" data-go="perfil">perfil</a> (datos personales, licencia y vencimientos) para activar las alertas.</div>`;
  h += `<section class="card"><h2>Horas de vuelo</h2><div class="grid">
    ${stat('Total vuelo', t.total)}${stat('PIC', t.pic)}${stat('Solo', t.solo)}
    ${stat('Instrucción', t.dual)}${stat('Noche', t.night)}${stat('Travesía', t.xc)}
    ${stat('IFR', t.ifr)}${stat('SIC', t.sic)}${stat('Simulador', t.sim)}
    ${stat('Aterr. día', t.landDay, '')}${stat('Aterr. noche', t.landNight, '')}${stat('Vuelos', t.n, '')}
  </div></section>`;
  h += `<section class="card"><h2>Vigencias</h2><ul class="list">
    ${statusRow('Experiencia reciente', `3 despegues y aterrizajes en ${days} días`, rec, has ? 'No cumple' : '')}
    ${p.ifrValid
      ? `<li class="status ok"><div><b>Experiencia nocturna</b><small>3 aterrizajes de noche en 180 días</small></div><span>Cubierta por habilitación IFR</span></li>`
      : statusRow('Experiencia nocturna', '3 aterrizajes de noche en 180 días', recN, has ? 'No cumple' : '')}
    ${statusRow('Certificado médico', p.medicalClass ? `Clase ${esc(p.medicalClass)}` : 'Fecha de vencimiento', p.medicalExpiry)}
    ${statusRow('Licencia', LIC[lic], p.licenseExpiry)}
    ${statusRow('Estandarización', 'Cada 24 meses (61.035)', p.lastStd ? addMonths(p.lastStd, 24) : null)}
  </ul></section>`;
  if (lic === 'alumno') {
    const need = p.ciac ? 35 : 40;
    const longXc = db.flights.some(f => f.longXc && f.solo > 0);
    h += `<section class="card"><h2>Progreso licencia Piloto Privado – Avión</h2>
      ${bar(`Tiempo total${t.sim ? ' (incl. máx. 5 h simulador)' : ''}`, r1(t.total + Math.min(t.sim, 5)), need)}
      ${bar('Instrucción con instructor', t.dual, 20)}
      ${bar('Vuelo solo', t.solo, 10)}
      ${bar('Travesía solo', t.soloXc, 5)}
      <div class="check ${longXc ? 'done' : ''}">${longXc ? '✔' : '○'} Travesía solo de 150 NM (270 km) con aterrizajes completos en 2 aeródromos distintos</div>
      <p class="hint">Requisitos DAN 61 para Piloto Privado – Avión: ${need} h ${p.ciac ? '(curso en CIAC)' : '(35 h si el curso es en un CIAC)'}. Verifica siempre con tu instructor.</p>
    </section>`;
  }
  const last = [...db.flights].sort(byDateDesc).slice(0, 3);
  h += `<section class="card"><h2>Últimos vuelos</h2>${last.length ? `<ul class="list flights">${last.map(flightItem).join('')}</ul>` : `<p class="hint">Aún no hay vuelos. Toca <b>Nuevo</b> para registrar el primero.</p>`}</section>`;
  v.innerHTML = h;
  bindFlightList(v);
}

/* ---------- Lista de vuelos ---------- */
function flightItem(f) {
  const land = (f.landDay || 0) + (f.landNight || 0);
  return `<li class="flight" data-id="${f.id}">
    <div class="r1"><b>${fmtD(f.date)}</b><span class="route">${esc(f.dep) || '—'} → ${esc(f.arr) || '—'}</span><span class="h">${fmtH(f.total)}</span></div>
    <div class="r2"><span>${esc(f.ac.reg)} · ${esc([f.ac.make, f.ac.model].filter(Boolean).join(' '))}</span>
      <span class="badge ${f.sim ? 'sim' : f.func}">${f.sim ? 'Simulador' : FUNC_SHORT[f.func] || ''}</span>
      ${land ? `<span class="muted">${land} aterr.</span>` : ''}</div>
  </li>`;
}
function bindFlightList(root) {
  root.querySelectorAll('li.flight').forEach(li => li.addEventListener('click', () => go('vuelo', { editId: li.dataset.id })));
}
function viewVuelos(v, ta) {
  setTitle('Bitácora');
  ta.innerHTML = `<button class="link" id="btnExport">Exportar</button>`;
  ta.querySelector('#btnExport').onclick = () => {
    const m = document.getElementById('exportMenu');
    m.hidden = !m.hidden;
  };
  const q = state.q.trim().toUpperCase();
  const fl = [...db.flights].sort(byDateDesc).filter(f => !q ||
    [f.date, fmtD(f.date), f.dep, f.arr, f.ac.reg, f.ac.make, f.ac.model, f.instructor, f.remarks].join(' ').toUpperCase().includes(q));
  const t = totals(fl);
  v.innerHTML = `
    <div class="card menu" id="exportMenu" hidden>
      <button class="btn" id="btnPrint">Imprimir / guardar PDF (formato bitácora)</button>
      <button class="btn" id="btnCsv">Exportar planilla CSV (Excel)</button>
    </div>
    <input class="search" type="search" placeholder="Buscar matrícula, aeródromo, instructor…" value="${esc(state.q)}" id="q">
    <div class="sumline">${t.n} vuelo${t.n === 1 ? '' : 's'} · ${fmtH(t.total)} h de vuelo${t.sim ? ` · ${fmtH(t.sim)} h simulador` : ''}</div>
    ${fl.length ? `<ul class="list flights card">${fl.map(flightItem).join('')}</ul>` : `<p class="hint center">${db.flights.length ? 'Sin resultados.' : 'Aún no hay vuelos registrados.'}</p>`}`;
  const qi = v.querySelector('#q');
  qi.addEventListener('input', () => {
    state.q = qi.value;
    const pos = qi.selectionStart;
    render();
    const n = document.getElementById('q');
    n.focus(); n.setSelectionRange(pos, pos);
  });
  v.querySelector('#btnPrint').onclick = printLog;
  v.querySelector('#btnCsv').onclick = exportCsv;
  bindFlightList(v);
}

/* ---------- Formulario de vuelo ---------- */
function opt(value, label, sel) { return `<option value="${esc(value)}"${value === sel ? ' selected' : ''}>${esc(label)}</option>`; }
function datalist(id, values) { return `<datalist id="${id}">${[...new Set(values.filter(Boolean))].map(x => `<option value="${esc(x)}">`).join('')}</datalist>`; }

function viewVuelo(v, ta) {
  const existing = state.editId ? db.flights.find(f => f.id === state.editId) : null;
  setTitle(existing ? 'Editar vuelo' : 'Nuevo vuelo');
  const p = db.profile;
  const last = [...db.flights].sort(byDateDesc)[0];
  const f = existing || {
    date: today(),
    aircraftId: last ? last.aircraftId : (db.aircraft[0] && db.aircraft[0].id),
    dep: (last && last.arr) || p.homeBase || '',
    arr: (last && last.arr) || p.homeBase || '',
    func: (p.license || 'alumno') === 'alumno' ? 'dual' : 'pic',
    instructor: last && last.func === 'dual' ? last.instructor : '',
    landDay: 1
  };
  const acList = [...db.aircraft];
  if (existing && !acList.some(a => a.id === f.aircraftId)) acList.push({ id: f.aircraftId, ...f.ac });
  const places = db.flights.flatMap(x => [x.dep, x.arr]).concat(p.homeBase);

  v.innerHTML = `<form id="ff" class="form" autocomplete="off" novalidate>
    <section class="card"><h2>Vuelo</h2>
      <label>Fecha<input type="date" name="date" value="${esc(f.date)}" required></label>
      <label>Aeronave<select name="aircraftId">
        ${acList.map(a => opt(a.id, `${a.reg} – ${[a.make, a.model].filter(Boolean).join(' ')}`, f.aircraftId)).join('')}
        ${opt('__new', '+ Nueva aeronave…', acList.length ? '' : '__new')}
      </select></label>
      <div id="newAc" class="sub" hidden>
        <div class="row2c"><label>Matrícula<input name="newReg" placeholder="CC-ABC" autocapitalize="characters"></label>
        <label>Marca<input name="newMake" placeholder="Cessna"></label></div>
        <div class="row2c"><label>Modelo<input name="newModel" placeholder="172"></label>
        <label>Tipo<select name="newType">${Object.entries(AC_TYPES).map(([k, l]) => opt(k, l, 'SEP')).join('')}</select></label></div>
      </div>
      <div class="row2c">
        <label>Salida<input name="dep" list="dlPlaces" value="${esc(f.dep)}" placeholder="Aeródromo" autocapitalize="characters"></label>
        <label>Llegada<input name="arr" list="dlPlaces" value="${esc(f.arr)}" placeholder="Aeródromo" autocapitalize="characters"></label>
      </div>
      ${datalist('dlPlaces', places)}
    </section>

    <section class="card"><h2>Tiempo</h2>
      <div class="row2c">
        <label>Hobbs inicio<input name="hobbsStart" inputmode="decimal" value="${esc(fv(f.hobbsStart))}"></label>
        <label>Hobbs fin<input name="hobbsEnd" inputmode="decimal" value="${esc(fv(f.hobbsEnd))}"></label>
      </div>
      <div class="row2c">
        <label>Hora despegue<input type="time" name="timeOff" value="${esc(f.timeOff || '')}"></label>
        <label>Hora aterrizaje<input type="time" name="timeOn" value="${esc(f.timeOn || '')}"></label>
      </div>
      <label class="big">Tiempo total de vuelo (h)<input name="total" inputmode="decimal" value="${esc(fv(f.total))}" placeholder="0,0" required></label>
      <p class="hint">Se calcula con el Hobbs o con las horas; también puedes escribirlo.</p>
      <label>Función a bordo<select name="func">${Object.entries(FUNCS).map(([k, l]) => opt(k, l, f.func)).join('')}</select></label>
    </section>

    <section class="card"><h2>Desglose (h)</h2>
      <div class="row3c">
        <label>Instrucción<input name="dual" inputmode="decimal" value="${fv(f.dual)}"></label>
        <label>Solo<input name="solo" inputmode="decimal" value="${fv(f.solo)}"></label>
        <label>PIC<input name="pic" inputmode="decimal" value="${fv(f.pic)}"></label>
        <label>SIC<input name="sic" inputmode="decimal" value="${fv(f.sic)}"></label>
        <label>Instructor<input name="instr" inputmode="decimal" value="${fv(f.instr)}"></label>
        <label>Travesía<input name="xc" inputmode="decimal" value="${fv(f.xc)}"></label>
        <label>Noche<input name="night" inputmode="decimal" value="${fv(f.night)}"></label>
        <label>IFR<input name="ifr" inputmode="decimal" value="${fv(f.ifr)}"></label>
      </div>
      <p class="hint">Se llena solo según la función y la ruta; corrígelo si el vuelo fue mixto.</p>
    </section>

    <section class="card"><h2>Aterrizajes y aproximaciones</h2>
      <div class="row3c">
        <label>Aterr. día<input name="landDay" inputmode="numeric" value="${f.landDay || ''}"></label>
        <label>Aterr. noche<input name="landNight" inputmode="numeric" value="${f.landNight || ''}"></label>
        <label>Aprox. (nº)<input name="appNum" inputmode="numeric" value="${f.appNum || ''}"></label>
      </div>
      <label>Tipo de aproximación<input name="appType" value="${esc(f.appType || '')}" placeholder="ILS, RNAV, VOR…"></label>
    </section>

    <section class="card"><h2>Instrucción y observaciones</h2>
      <label>Instructor<input name="instructor" list="dlInstr" value="${esc(f.instructor || '')}" placeholder="Nombre del instructor"></label>
      ${datalist('dlInstr', db.flights.map(x => x.instructor))}
      <label class="cb"><input type="checkbox" name="longXc" ${f.longXc ? 'checked' : ''}> Travesía de 150 NM (270 km) con aterrizajes completos en 2 aeródromos distintos</label>
      <label>Observaciones / maniobras<textarea name="remarks" rows="3" placeholder="Ej.: virajes escarpados, pérdidas, circuitos…">${esc(f.remarks || '')}</textarea></label>
    </section>

    <div class="actions">
      <button type="submit" class="btn primary">Guardar vuelo</button>
      ${existing ? `<button type="button" class="btn danger" id="del">Eliminar vuelo</button>` : ''}
    </div>
  </form>`;

  const form = v.querySelector('#ff');
  const $ = n => form.elements[n];
  const setH = (n, val) => { $(n).value = val > 0 ? String(r1(val)).replace('.', ',') : ''; };

  const toggleNewAc = () => { v.querySelector('#newAc').hidden = $('aircraftId').value !== '__new'; };
  $('aircraftId').addEventListener('change', toggleNewAc);
  toggleNewAc();

  // Reparte el tiempo total en las columnas según función y ruta.
  const distribute = () => {
    const t = num($('total').value), fn = $('func').value;
    ROLE_KEYS.forEach(k => setH(k, 0));
    setH(fn, t);
    if (fn === 'instr') setH('pic', t); // el instructor anota PIC mientras instruye (DAN 61 Ap. D)
    const dep = $('dep').value.trim().toUpperCase(), arr = $('arr').value.trim().toUpperCase();
    setH('xc', dep && arr && dep !== arr ? t : 0);
    if (num($('night').value) > t) setH('night', t);
    if (num($('ifr').value) > t) setH('ifr', t);
  };
  const recompute = () => {
    let t = null;
    const hs = $('hobbsStart').value.trim(), he = $('hobbsEnd').value.trim();
    if (hs && he) {
      const d = num(he) - num(hs);
      if (d > 0) t = r1(d);
    } else if ($('timeOff').value && $('timeOn').value) {
      let m = toMin($('timeOn').value) - toMin($('timeOff').value);
      if (m <= 0) m += 1440;
      t = r1(m / 60);
    }
    if (t != null) { setH('total', t); distribute(); }
  };
  ['hobbsStart', 'hobbsEnd', 'timeOff', 'timeOn'].forEach(n => $(n).addEventListener('change', recompute));
  ['total', 'func', 'dep', 'arr'].forEach(n => $(n).addEventListener('change', distribute));

  if (existing) {
    v.querySelector('#del').onclick = () => {
      if (!confirm('¿Eliminar este vuelo de la bitácora? Esta acción no se puede deshacer.')) return;
      db.flights = db.flights.filter(x => x.id !== existing.id);
      save();
      go('vuelos');
    };
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const g = n => ($(n).value || '').trim();
    const date = g('date');
    if (!date) return alert('Indica la fecha del vuelo.');
    let acId = g('aircraftId'), ac;
    if (acId === '__new') {
      const reg = g('newReg').toUpperCase();
      if (!reg) return alert('Indica la matrícula de la nueva aeronave.');
      ac = { id: uid(), reg, make: g('newMake'), model: g('newModel'), type: g('newType') };
      db.aircraft.push(ac);
      acId = ac.id;
    } else {
      ac = db.aircraft.find(a => a.id === acId) || (existing && existing.ac);
    }
    if (!ac) return alert('Selecciona la aeronave.');
    const total = r1(num(g('total')));
    if (!(total > 0)) return alert('El tiempo total de vuelo debe ser mayor que 0.');
    const rec = {
      id: existing ? existing.id : uid(),
      createdAt: existing ? existing.createdAt : Date.now(),
      updatedAt: Date.now(),
      date,
      aircraftId: acId,
      ac: { reg: ac.reg, make: ac.make || '', model: ac.model || '', type: ac.type || 'SEP' },
      sim: ac.type === 'FSTD',
      dep: g('dep').toUpperCase(),
      arr: g('arr').toUpperCase(),
      hobbsStart: g('hobbsStart') ? num(g('hobbsStart')) : null,
      hobbsEnd: g('hobbsEnd') ? num(g('hobbsEnd')) : null,
      timeOff: g('timeOff'),
      timeOn: g('timeOn'),
      total,
      func: g('func'),
      landDay: int(g('landDay')),
      landNight: int(g('landNight')),
      appNum: int(g('appNum')),
      appType: g('appType'),
      instructor: g('instructor'),
      longXc: $('longXc').checked,
      remarks: g('remarks')
    };
    for (const k of TIME_KEYS) {
      rec[k] = r1(num(g(k)));
      if (rec[k] > total) return alert(`El tiempo de "${k === 'xc' ? 'travesía' : k}" no puede ser mayor que el tiempo total.`);
    }
    if (existing) Object.assign(existing, rec); else db.flights.push(rec);
    save();
    go('vuelos');
  });
}

/* ---------- Aeronaves ---------- */
function viewAeronaves(v) {
  setTitle('Aeronaves');
  const a = state.acEditId ? db.aircraft.find(x => x.id === state.acEditId) : null;
  const used = id => db.flights.filter(f => f.aircraftId === id);
  v.innerHTML = `
    <form id="af" class="form card" autocomplete="off">
      <h2>${a ? 'Editar aeronave' : 'Agregar aeronave'}</h2>
      <div class="row2c"><label>Matrícula<input name="reg" value="${esc(a?.reg)}" placeholder="CC-ABC" autocapitalize="characters" required></label>
      <label>Marca<input name="make" value="${esc(a?.make)}" placeholder="Cessna"></label></div>
      <div class="row2c"><label>Modelo<input name="model" value="${esc(a?.model)}" placeholder="172"></label>
      <label>Tipo<select name="type">${Object.entries(AC_TYPES).map(([k, l]) => opt(k, l, a?.type || 'SEP')).join('')}</select></label></div>
      <div class="actions inline">
        <button class="btn primary" type="submit">${a ? 'Guardar cambios' : 'Agregar'}</button>
        ${a ? `<button class="btn" type="button" id="cancel">Cancelar</button><button class="btn danger" type="button" id="del">Eliminar</button>` : ''}
      </div>
      ${a ? `<p class="hint">Los cambios no modifican los vuelos ya registrados (cada vuelo guarda los datos de la aeronave a esa fecha).</p>` : ''}
    </form>
    ${db.aircraft.length ? `<ul class="list card">${db.aircraft.map(x => {
      const fl = used(x.id), t = totals(fl);
      return `<li class="ac" data-id="${x.id}"><div><b>${esc(x.reg)}</b><small>${esc([x.make, x.model].filter(Boolean).join(' '))} · ${AC_TYPES[x.type] || ''}</small></div><span class="muted">${fl.length} vuelos · ${fmtH(x.type === 'FSTD' ? t.sim : t.total)} h</span></li>`;
    }).join('')}</ul>` : `<p class="hint center">Agrega los aviones que vuelas (por ejemplo los del club).</p>`}`;
  const form = v.querySelector('#af');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const g = n => form.elements[n].value.trim();
    const reg = g('reg').toUpperCase();
    if (!reg) return alert('Indica la matrícula.');
    const dup = db.aircraft.find(x => x.reg === reg && x.id !== a?.id);
    if (dup) return alert('Ya existe una aeronave con esa matrícula.');
    const data = { reg, make: g('make'), model: g('model'), type: g('type') };
    if (a) Object.assign(a, data); else db.aircraft.push({ id: uid(), ...data });
    save();
    go('aeronaves');
  });
  v.querySelectorAll('li.ac').forEach(li => li.addEventListener('click', () => go('aeronaves', { acEditId: li.dataset.id })));
  if (a) {
    v.querySelector('#cancel').onclick = () => go('aeronaves');
    v.querySelector('#del').onclick = () => {
      if (!confirm(`¿Eliminar ${a.reg} de la lista? Los vuelos ya registrados se conservan.`)) return;
      db.aircraft = db.aircraft.filter(x => x.id !== a.id);
      save();
      go('aeronaves');
    };
  }
}

/* ---------- Perfil y respaldo ---------- */
function viewPerfil(v) {
  setTitle('Perfil');
  const p = db.profile;
  const inp = (n, label, type = 'text', extra = '') => `<label>${label}<input type="${type}" name="${n}" value="${esc(p[n])}" ${extra}></label>`;
  v.innerHTML = `
    <form id="pf" class="form" autocomplete="off">
      <section class="card"><h2>Datos personales</h2>
        ${inp('name', 'Nombre completo')}
        <div class="row2c">${inp('rut', 'RUT')}${inp('birth', 'Fecha de nacimiento', 'date')}</div>
        ${inp('homeBase', 'Aeródromo base', 'text', 'autocapitalize="characters" placeholder="Aeródromo habitual"')}
      </section>
      <section class="card"><h2>Licencia y habilitaciones</h2>
        <label>Licencia<select name="license">${Object.entries(LIC).map(([k, l]) => opt(k, l, p.license || 'alumno')).join('')}</select></label>
        <div class="row2c">${inp('licenseNo', 'Número')}${inp('licenseExpiry', 'Vencimiento', 'date')}</div>
        <label>Habilitaciones<textarea name="ratings" rows="2" placeholder="Ej.: Monomotor terrestre, VFR">${esc(p.ratings)}</textarea></label>
        ${inp('lastStd', 'Última estandarización', 'date')}
        <label class="cb"><input type="checkbox" name="ifrValid" ${p.ifrValid ? 'checked' : ''}> Habilitación de vuelo por instrumentos vigente</label>
        <label class="cb"><input type="checkbox" name="ciac" ${p.ciac ? 'checked' : ''}> Curso en un CIAC (mínimo 35 h en lugar de 40 h)</label>
      </section>
      <section class="card"><h2>Certificado médico</h2>
        <div class="row2c">${inp('medicalClass', 'Clase')}${inp('medicalExpiry', 'Vencimiento', 'date')}</div>
      </section>
      <div class="actions"><button class="btn primary" type="submit">Guardar perfil</button></div>
    </form>
    <section class="card"><h2>Respaldo</h2>
      <p class="hint">Los datos se guardan solo en este teléfono. Haz un respaldo de vez en cuando y guárdalo en Archivos / iCloud Drive.</p>
      <div class="actions inline">
        <button class="btn" id="bk">Crear respaldo</button>
        <button class="btn" id="rs">Restaurar respaldo</button>
      </div>
      <input type="file" id="rsFile" accept=".json,application/json" hidden>
    </section>
    <p class="hint center">Bitácora de Vuelo · MVP · Basada en DAN 61 Ap. D (ED 2 Enm 5, jul-2025)</p>`;
  const form = v.querySelector('#pf');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const np = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      np[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
    }
    np.homeBase = (np.homeBase || '').toUpperCase();
    db.profile = np;
    save();
    go('resumen');
  });
  v.querySelector('#bk').onclick = () =>
    shareFile(`bitacora-respaldo-${today()}.json`, JSON.stringify(db, null, 1), 'application/json');
  const file = v.querySelector('#rsFile');
  v.querySelector('#rs').onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || !Array.isArray(d.flights)) throw new Error('formato');
      if (!confirm(`El respaldo tiene ${d.flights.length} vuelos. Reemplazará TODOS los datos actuales (${db.flights.length} vuelos). ¿Continuar?`)) return;
      db = normalize(d);
      save();
      alert('Respaldo restaurado.');
      go('resumen');
    } catch (err) {
      alert('El archivo no es un respaldo válido de la bitácora.');
    }
  };
}

/* ---------- Exportación ---------- */
async function shareFile(name, text, type) {
  const blob = new Blob([text], { type });
  try {
    const file = new File([blob], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function exportCsv() {
  const cols = [
    ['Fecha', f => fmtD(f.date)], ['Marca', f => f.ac.make], ['Modelo', f => f.ac.model], ['Matrícula', f => f.ac.reg],
    ['Tipo aeronave', f => AC_TYPES[f.ac.type] || ''], ['Salida', f => f.dep], ['Llegada', f => f.arr],
    ['Hora despegue', f => f.timeOff], ['Hora aterrizaje', f => f.timeOn],
    ['Hobbs inicio', f => fv(f.hobbsStart)], ['Hobbs fin', f => fv(f.hobbsEnd)],
    ['Tiempo total vuelo', f => (f.sim ? '' : fmtH(f.total))], ['Simulador', f => (f.sim ? fmtH(f.total) : '')],
    ['Función', f => FUNCS[f.func] || ''],
    ['Instrucción recibida', f => fv(f.dual)], ['Solo', f => fv(f.solo)], ['PIC', f => fv(f.pic)], ['SIC', f => fv(f.sic)],
    ['Instructor (tiempo)', f => fv(f.instr)], ['Noche', f => fv(f.night)], ['IFR', f => fv(f.ifr)], ['Travesía', f => fv(f.xc)],
    ['Aterrizajes día', f => f.landDay || ''], ['Aterrizajes noche', f => f.landNight || ''],
    ['Aproximaciones', f => f.appNum || ''], ['Tipo aproximación', f => f.appType],
    ['Instructor', f => f.instructor], ['Travesía 150 NM', f => (f.longXc ? 'Sí' : '')], ['Observaciones', f => f.remarks]
  ];
  const cell = s => { s = String(s ?? ''); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [cols.map(c => c[0])].concat([...db.flights].sort(byDateAsc).map(f => cols.map(c => c[1](f))));
  const csv = '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n');
  shareFile(`bitacora-${today()}.csv`, csv, 'text/csv');
}

// Genera la bitácora con formato tipo libro (DAN 61 Ap. D) y abre la impresión / PDF.
function printLog() {
  const fl = [...db.flights].sort(byDateAsc);
  if (!fl.length) return alert('No hay vuelos para imprimir.');
  const p = db.profile;
  const SUM = ['total', 'landDay', 'landNight', 'day', 'night', 'ifr', 'appNum', 'sim', 'xc', 'solo', 'pic', 'sic', 'dual', 'instr'];
  const INT = new Set(['landDay', 'landNight', 'appNum']);
  const row = f => f.sim
    ? { total: 0, landDay: 0, landNight: 0, day: 0, night: 0, ifr: 0, appNum: f.appNum || 0, sim: f.total, xc: 0, solo: 0, pic: 0, sic: 0, dual: 0, instr: 0 }
    : { total: f.total, landDay: f.landDay || 0, landNight: f.landNight || 0, day: r1(f.total - (f.night || 0)), night: f.night || 0, ifr: f.ifr || 0, appNum: f.appNum || 0, sim: 0, xc: f.xc || 0, solo: f.solo || 0, pic: f.pic || 0, sic: f.sic || 0, dual: f.dual || 0, instr: f.instr || 0 };
  const zero = () => Object.fromEntries(SUM.map(k => [k, 0]));
  const fmt = (k, n) => (INT.has(k) ? (n || '') : (n ? fmtH(n) : ''));
  const fmtT = (k, n) => (INT.has(k) ? String(n) : fmtH(n));
  const PER = 14;
  let prev = zero(), html = '';
  const pages = Math.ceil(fl.length / PER);
  for (let i = 0; i < pages; i++) {
    const chunk = fl.slice(i * PER, (i + 1) * PER);
    const page = zero();
    const body = chunk.map(f => {
      const r = row(f);
      SUM.forEach(k => (page[k] += r[k]));
      const obs = [f.instructor && `Instr.: ${f.instructor}`, f.appType && `Aprox.: ${f.appType}`, f.longXc && 'Travesía 150 NM', f.remarks].filter(Boolean).join(' · ');
      return `<tr><td>${fmtD(f.date)}</td><td class="l">${esc([f.ac.make, f.ac.model].filter(Boolean).join(' '))}</td><td>${esc(f.ac.reg)}</td><td>${AC_SHORT[f.ac.type] || ''}</td><td>${esc(f.dep)}</td><td>${esc(f.arr)}</td>
        ${SUM.map(k => `<td class="n">${fmt(k, r[k])}</td>`).join('')}<td class="l obs">${esc(obs)}</td></tr>`;
    }).join('');
    const carry = Object.fromEntries(SUM.map(k => [k, r1(prev[k] + page[k])]));
    const foot = (label, o) => `<tr class="tot"><td colspan="6" class="l">${label}</td>${SUM.map(k => `<td class="n">${fmtT(k, r1(o[k]))}</td>`).join('')}<td></td></tr>`;
    html += `<div class="page">
      <div class="ph"><b>BITÁCORA PERSONAL DE VUELO</b><span>${esc(p.name || '')}${p.rut ? ' · RUT ' + esc(p.rut) : ''} · ${LIC[p.license || 'alumno']}${p.licenseNo ? ' Nº ' + esc(p.licenseNo) : ''}</span><span>Página ${i + 1} de ${pages}</span></div>
      <table>
        <colgroup><col style="width:16mm"><col style="width:22mm"><col style="width:14mm"><col style="width:9mm"><col style="width:12mm"><col style="width:12mm">${'<col style="width:11mm">'.repeat(SUM.length)}<col></colgroup>
        <thead>
          <tr><th rowspan="2">Fecha</th><th colspan="3">Aeronave</th><th colspan="2">Ruta</th><th rowspan="2">Tiempo total</th><th colspan="2">Aterrizajes</th>
              <th colspan="6">Condiciones de vuelo</th><th colspan="5">Función</th><th rowspan="2">Observaciones</th></tr>
          <tr><th>Marca / modelo</th><th>Matrícula</th><th>Tipo</th><th>Salida</th><th>Llegada</th><th>Día</th><th>Noche</th>
              <th>Día</th><th>Noche</th><th>IFR</th><th>Aprox.</th><th>Simul.</th><th>Travesía</th>
              <th>Solo</th><th>PIC</th><th>SIC</th><th>Instr. recibida</th><th>Como instr.</th></tr>
        </thead>
        <tbody>${body}</tbody>
        <tfoot>${foot('Total esta página', page)}${foot('Total páginas anteriores', prev)}${foot('Total a la fecha', carry)}</tfoot>
      </table>
      <div class="sign"><span>Certifico que las anotaciones de esta página son fidedignas.</span><span>Firma piloto: ____________________</span><span>Firma instructor: ____________________</span></div>
    </div>`;
    prev = carry;
  }
  document.getElementById('print').innerHTML = html;
  setTimeout(() => window.print(), 50);
}

/* ---------- Inicio ---------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
render();
