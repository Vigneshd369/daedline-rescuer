const KEY = "deadline-rescuer-v1";
const $ = (id) => document.getElementById(id);
let state = JSON.parse(localStorage.getItem(KEY) || '{"tasks":[],"capacity":5}');

const save = () => localStorage.setItem(KEY, JSON.stringify(state));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const DAY = 86400000;

const remaining = (t) => t.hours * (1 - t.progress / 100);
const msLeft = (t) => new Date(t.due).getTime() - Date.now();

// Hours per day you must spend on this task to finish on time
function perDay(t) {
  const days = Math.max(msLeft(t) / DAY, 0.25);
  return remaining(t) / days;
}
function risk(t) {
  if (t.done) return "done";
  if (msLeft(t) <= 0) return "bad";
  const need = perDay(t);
  if (need > state.capacity || msLeft(t) < DAY) return need > state.capacity * 0.6 ? "bad" : "warn";
  if (need > state.capacity * 0.5) return "warn";
  return "ok";
}
const urgency = (t) => (t.done ? Infinity : msLeft(t) / Math.max(remaining(t), 0.25));

function fmtLeft(ms) {
  if (ms <= 0) return "Overdue";
  const d = Math.floor(ms / DAY), h = Math.floor((ms % DAY) / 36e5), m = Math.floor((ms % 36e5) / 6e4);
  return d ? `${d}d ${h}h left` : h ? `${h}h ${m}m left` : `${m}m left`;
}
const pad = (n) => String(n).padStart(2, "0");

function tickClock() {
  const active = state.tasks.filter((t) => !t.done).sort((a, b) => msLeft(a) - msLeft(b));
  const next = active.find((t) => msLeft(t) > 0) || active[0];
  const clock = $("clock");
  if (!next) {
    clock.textContent = "--:--:--";
    clock.classList.remove("critical");
    $("heroLabel").textContent = "Add a deadline to start the clock";
    $("heroSub").textContent = "Nothing is due yet. Enjoy it while it lasts.";
    return;
  }
  const ms = msLeft(next);
  $("heroLabel").textContent = `Next up: ${next.title}`;
  if (ms <= 0) {
    clock.textContent = "OVERDUE";
    clock.classList.add("critical");
    $("heroSub").textContent = "Submit what you have, then message your teacher.";
    return;
  }
  const d = Math.floor(ms / DAY), h = Math.floor((ms % DAY) / 36e5);
  const m = Math.floor((ms % 36e5) / 6e4), s = Math.floor((ms % 6e4) / 1e3);
  clock.textContent = (d ? `${d}d ` : "") + `${pad(h)}:${pad(m)}:${pad(s)}`;
  clock.classList.toggle("critical", ms < DAY);
  $("heroSub").textContent = `${active.length} deadline${active.length > 1 ? "s" : ""} still open`;
}

function renderPlan() {
  const active = state.tasks.filter((t) => !t.done && msLeft(t) > -DAY * 30);
  let html = "<h2>Today's rescue plan</h2>";
  if (!active.length) {
    $("plan").innerHTML = html + '<p class="empty">No open deadlines. Add one on the left.</p>';
    return;
  }
  const share = (t) => remaining(t) / Math.max(1, Math.ceil(Math.max(msLeft(t), 0) / DAY));
  const rows = active.sort((a, b) => urgency(a) - urgency(b)).map((t) => ({ t, h: share(t) }));
  const total = rows.reduce((s, r) => s + r.h, 0);
  const cap = state.capacity;
  let cls = "ok", msg = `This fits inside your ${cap}h day. Work in order and you will make it.`;
  if (total > cap * 1.5) { cls = "bad"; msg = `That is ${(total - cap).toFixed(1)}h more than you can do. Ask for an extension on the lowest-value task, or cut scope.`; }
  else if (total > cap) { cls = "warn"; msg = `About ${(total - cap).toFixed(1)}h over your limit. Start now and trim the smallest task.`; }
  html += `<div class="plan-total">${total.toFixed(1)}h today</div>`;
  html += `<div class="verdict ${cls}">${msg}</div>`;
  html += rows.map((r) => `<div class="today"><span>${esc(r.t.title)}</span><strong>${r.h.toFixed(1)}h</strong></div>`).join("");
  $("plan").innerHTML = html;
}

function renderList() {
  const sorted = [...state.tasks].sort((a, b) => urgency(a) - urgency(b));
  $("list").innerHTML = sorted.length ? sorted.map((t) => {
    const r = risk(t), left = msLeft(t);
    const label = t.done ? "Done" : left <= 0 ? "Overdue" : r === "bad" ? "Critical" : r === "warn" ? "Tight" : "On track";
    return `<li class="item ${r}" data-id="${t.id}">
      <div class="row"><span class="t">${esc(t.title)}</span><span class="badge">${label}</span></div>
      <div class="meta">${esc(t.subject || "No subject")} · Due ${new Date(t.due).toLocaleString([], {dateStyle:"medium", timeStyle:"short"})} · ${fmtLeft(left)}</div>
      <div class="bar"><span style="width:${t.progress}%"></span></div>
      <div class="meta">${t.progress}% done · ${remaining(t).toFixed(1)}h of ${t.hours}h left${t.done ? "" : ` · needs ${perDay(t).toFixed(1)}h/day`}</div>
      <div class="controls">
        <input type="range" min="0" max="100" step="5" value="${t.progress}" aria-label="Progress" data-act="progress">
        <button class="small" data-act="done">${t.done ? "Reopen" : "Mark done"}</button>
        <button class="small" data-act="delete">Delete</button>
      </div></li>`;
  }).join("") : '<li class="empty">No deadlines yet. Add one or load the samples.</li>';
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function render() { renderPlan(); renderList(); tickClock(); }

$("taskForm").addEventListener("submit", (e) => {
  e.preventDefault();
  state.tasks.push({ id: uid(), title: $("title").value.trim(), subject: $("subject").value.trim(),
    due: $("due").value, hours: parseFloat($("hours").value), progress: 0, done: false });
  save(); e.target.reset(); $("hours").value = 4; render();
});
$("capacity").value = state.capacity;
$("capacity").addEventListener("change", () => { state.capacity = parseFloat($("capacity").value) || 5; save(); render(); });

$("list").addEventListener("click", (e) => {
  const act = e.target.dataset.act, li = e.target.closest("li");
  if (!act || !li) return;
  const t = state.tasks.find((x) => x.id === li.dataset.id);
  if (act === "done") { t.done = !t.done; if (t.done) t.progress = 100; }
  if (act === "delete") state.tasks = state.tasks.filter((x) => x !== t);
  save(); render();
});
$("list").addEventListener("change", (e) => {
  if (e.target.dataset.act !== "progress") return;
  const t = state.tasks.find((x) => x.id === e.target.closest("li").dataset.id);
  t.progress = +e.target.value; t.done = t.progress === 100; save(); render();
});
$("clearDone").addEventListener("click", () => { state.tasks = state.tasks.filter((t) => !t.done); save(); render(); });
$("sampleBtn").addEventListener("click", () => {
  const at = (days, h) => { const d = new Date(Date.now() + days * DAY); d.setHours(h, 0, 0, 0); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };
  state.tasks.push(
    { id: uid(), title: "OOSE project report", subject: "Software Engineering", due: at(1, 23), hours: 6, progress: 20, done: false },
    { id: uid(), title: "ML lab record", subject: "Machine Learning", due: at(3, 17), hours: 5, progress: 0, done: false },
    { id: uid(), title: "Environment presentation", subject: "Environmental Studies", due: at(6, 10), hours: 4, progress: 50, done: false });
  save(); render();
});

render();
setInterval(tickClock, 1000);
setInterval(render, 60000);
