// ---------- Views: only one <section> inside <main> is visible at a time ----------
const views = document.querySelectorAll('main > section');

// ---------- Ionic: tab bar + toast ----------
const tabbar = document.querySelector('#tabbar');
tabbar.addEventListener('click', (e) => { const b = e.target.closest('ion-tab-button'); if (b) go(b.getAttribute('tab')); });
async function toast(message) {
  const t = document.createElement('ion-toast');
  Object.assign(t, { message, duration: 2200, position: 'bottom' });
  document.body.append(t); await t.present();
  t.addEventListener('didDismiss', () => t.remove());
}

function showView(id) {
  views.forEach((view) => { view.hidden = view.id !== id; });
  document.body.dataset.view = id; // CSS uses this to style the header per view
  tabbar.selectedTab = id;
  if (id !== 'profile') window.lastView = id;
  syncHeader();
  window.scrollTo({ top: 0 });
  if (id === 'landingPage') replayLanding(); // re-arm the entrance animations every time we arrive
}

// ---------- Auth state ----------
// One source of truth: the session in localStorage. renderAuth() reads it and
// sets <html data-auth="user|guest">; CSS shows/hides header items from that.
// TEMP: replace with Supabase (getSession / onAuthStateChange) when it's wired in.
const SESSION_KEY = 'skilllink.session', PROV_KEY = 'skilllink.provider', UINFO_KEY = 'skilllink.userinfo';
const PROFILES_KEY = 'skilllink.profiles'; // temporary email -> name lookup for login
const SVC_KEY = 'skilllink.services', HIRE_KEY = 'skilllink.hires', NOTIF_KEY = 'skilllink.notifs', CART_KEY = 'skilllink.cart';

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked: session lasts until refresh */ }
}

const getSession = () => {
  const session = readJSON(SESSION_KEY);
  return session && session.name ? session : null;
};

function renderAuth() {
  const session = getSession();
  document.documentElement.dataset.auth = session ? 'user' : 'guest';
  syncHeader();
  document.querySelector('#adminLink').hidden = !isAdmin();
  renderBadges();
}

function signIn(session) { writeJSON(SESSION_KEY, session); renderAuth(); }
function signOut() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  renderAuth();
}

// Keep every tab and the back/forward cache in sync with the stored session.
window.addEventListener('storage', (e) => {
  if (e.key !== null && e.key !== SESSION_KEY) return;
  renderAuth();
  if (!getSession()) go('landingPage');
});
window.addEventListener('pageshow', renderAuth);
renderAuth();

let pending = null; // view id (or function) to continue with once login finishes
function isAdmin() { return /^admin@/i.test(getSession()?.email || ''); }
function mineN(n) { return !n.to || n.to === getSession()?.email; }
function myNotifs() { return load(NOTIF_KEY).filter(mineN); }

// ---------- Dialogs ----------
const authDialog = document.querySelector('#auths');
const switcher = document.querySelector('.switcher');

function setAuthMode(mode) {
  switcher.dataset.active = mode;
  switcher.querySelectorAll('[role="tab"]').forEach((tab) => {
    const on = tab.dataset.mode === mode;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  });
  document.querySelector('#signupPanel').hidden = mode !== 'signup';
  document.querySelector('#loginPanel').hidden = mode !== 'login';
}

function openAuth(mode) {
  setAuthMode(mode);
  authDialog.showModal();
}

switcher.addEventListener('click', (e) => {
  const tab = e.target.closest('[role="tab"]');
  if (tab) setAuthMode(tab.dataset.mode);
});
switcher.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const mode = switcher.dataset.active === 'signup' ? 'login' : 'signup';
  setAuthMode(mode);
  switcher.querySelector(`[data-mode="${mode}"]`).focus();
});

document.querySelector('#signup').addEventListener('click', () => openAuth('signup'));
document.querySelector('#login').addEventListener('click', () => openAuth('login'));


// Close via the X button, or by clicking the dark backdrop.
document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
  });
  // Whenever a dialog closes, wipe its forms (including typed passwords) and errors.
  dialog.addEventListener('close', () => { dialog.querySelectorAll('form').forEach(resetForm); dialog.querySelectorAll('.pw-toggle').forEach((b) => setPw(b, false)); });
});

// ---------- Filter panel toggle ----------
const filterBtn = document.querySelector('#filterBttnToggle');
const filterForm = document.querySelector('#filterForm');
filterBtn.addEventListener('click', () => {
  filterForm.hidden = !filterForm.hidden;
  filterBtn.setAttribute('aria-expanded', String(!filterForm.hidden));
});

// ---------- Form validation ----------
// The browser still does the checking (input.validity); we only replace its
// popup bubbles with inline messages that match the site's design.
function errorFor(input) {
  const v = input.validity;
  if (v.valid) return '';
  const label = document.querySelector(`label[for="${input.id}"]`)?.textContent.replace(/\s*\(optional\)/i, '').trim().toLowerCase() || 'value';
  if (v.valueMissing && input.type === 'checkbox') return 'Please confirm to continue.';
  if (v.valueMissing) return `Enter your ${label}.`;
  if (v.patternMismatch) return 'Enter a valid phone number.';
  if (v.typeMismatch) return 'Enter a valid email address.';
  if (v.tooShort) return `Use at least ${input.minLength} characters.`;
  if (v.rangeUnderflow) return `You must be at least ${input.min}.`;
  return input.validationMessage;
}

function showError(input, message) {
  const field = input.closest('.field');
  let err = field.querySelector('.field-error');
  if (!message) {
    err?.remove();
    field.classList.remove('invalid');
    field.classList.toggle('valid', input.type !== 'checkbox' && input.value !== '' && input.validity.valid);
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    return;
  }
  if (!err) {
    err = document.createElement('p');
    err.className = 'field-error';
    err.id = `${input.id}-error`;
    field.append(err);
  }
  err.textContent = message;
  field.classList.add('invalid');
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', err.id);
}

function validateField(input) {
  const message = errorFor(input);
  showError(input, message);
  return !message;
}

function validateForm(form) {
  const invalid = [...form.querySelectorAll('input, select')].filter((input) => !validateField(input));
  invalid[0]?.focus();
  return invalid.length === 0;
}

function resetForm(form) {
  form.reset();
  form.querySelectorAll('input, select').forEach((input) => showError(input, ''));
}

function wireForm(form) {
  form.noValidate = true; // we show our own messages
  form.addEventListener('submit', (e) => e.preventDefault());
  // Check a field when the user leaves it (if they typed something), and
  // clear its error as soon as they fix it.
  form.addEventListener('focusout', (e) => {
    if (e.target.matches('input, select') && e.target.value !== '') validateField(e.target);
  });
  form.addEventListener('input', (e) => {
    if (e.target.closest('.field')?.classList.contains('invalid')) validateField(e.target);
  });
}
document.querySelectorAll('form').forEach(wireForm);

// ---------- Submit handlers ----------
function finishAuth() {
  const p = pending; pending = null;
  authDialog.close();
  if (typeof p === 'function') p(); else go(p || 'mainPage');
}
authDialog.addEventListener('close', () => { if (!getSession()) pending = null; });

document.querySelector('#signupPanel form').addEventListener('submit', (e) => {
  const form = e.currentTarget;
  if (!validateForm(form)) return;
  const name = form.querySelector('#s-name').value.trim();
  const email = form.querySelector('#s-email').value.trim().toLowerCase();
  // TODO: await Supabase signUp here. Only continue if it succeeded.
  writeJSON(PROFILES_KEY, { ...readJSON(PROFILES_KEY), [email]: name });
  signIn({ name, email });
  notify('Welcome to SkillLink', 'Browse services or list your own.');
  finishAuth();
});

document.querySelector('#loginPanel form').addEventListener('submit', (e) => {
  const form = e.currentTarget;
  if (!validateForm(form)) return;
  const email = form.querySelector('#l-email').value.trim().toLowerCase();
  // TODO: await Supabase signInWithPassword here. Only continue if it succeeded.
  const fallback = email.split('@')[0].replace(/^./, (c) => c.toUpperCase());
  signIn({ name: readJSON(PROFILES_KEY)?.[email] || fallback, email });
  finishAuth();
});


document.querySelector('#logout').addEventListener('click', () => {
  signOut();
  go('landingPage');
});

document.querySelector('#year').textContent = new Date().getFullYear();
// ================= Pages, data and header controls =================
// TEMP: services, hires, notifications and cart live in localStorage until Supabase is wired in.
const INFO = {
  about: ['About SkillLink', 'SkillLink connects people who need a job done with providers who have the skill, from home repair to web design.', [
    ['Our purpose', 'Every problem has a solution. SkillLink is a marketplace where members find the right service to get a problem solved, or offer the skill someone else is looking for. Manual and technical work live in one place.'],
    ['One account, two roles', 'Hire when you need help. Become a provider when you have a skill and time to give. Both roles use the same account, so you never start over.'],
    ['What you can do', ['Search or browse services by category.', 'Filter by location, service type (manual or technical), minimum rating, verified providers and availability today.', 'Compare providers by experience, ratings and reviews. Best matches are listed first.', 'Send a request with your preferred date and time.', 'Track each request from Pending to Accepted, In progress and Completed.', 'Save providers and receive notifications about your requests.', 'Rate and review a provider once the job is completed.']],
    ['Service categories', 'CATS'],
    ['A trusted community', 'Providers can request a verified badge, which our admin team reviews. Members can report problems after a job. A listing with three upheld reports is suspended.'],
  ]],
  guidelines: ['Provider guidelines', 'What we ask of every provider on SkillLink, so members can hire with confidence.', [
    ['Getting started', ['Register as a provider from the header with your basic details, availability and location.', 'Open your Provider dashboard and add each service you offer under the right category.', 'Choose the service type that fits: manual for hands-on work, technical for skill-based or digital work.']],
    ['Handling requests', ['Members send a request with a date and time within your availability.', 'Accept or decline promptly, then move the request to In progress and Completed as the job moves along.', 'Agree on price, scope and timing with the member before work starts.']],
    ['Be honest and reliable', ['Describe your service accurately, including what it does not cover.', 'Only offer work you are qualified and permitted to do.', 'Show up on time and communicate changes early.']],
    ['Reviews, verification and reports', ['Members can rate you after a completed job. Reviews build your reputation and ranking.', 'Request a verified badge from your dashboard. An admin reviews it.', 'Upheld reports add a strike. Three strikes suspend the listing.']],
    ['Categories you can list under', 'CATS'],
  ]],
  help: ['Help center', 'Answers to common questions about hiring, offering services and managing your account.', [
    ['Hiring a service', ['Log in, then browse a category or use search.', 'Open filters to narrow by location, type, rating, verified or available today.', 'Choose Request, pick a date and time, and add job details.', 'Follow progress under My requests. Rate the provider when the job is completed.']],
    ['Offering a service', ['Choose Become a provider in the header and submit your details.', 'You are taken to your Provider dashboard, where you add, edit, pause or remove services.', 'Manage requests you receive and the services you have hired from the same place.']],
    ['Request statuses', 'A request moves through Pending, Accepted, In progress and Completed. Either side can cancel before work begins.'],
    ['Your account', 'Use the Profile button in the header to update your name, phone number and location. Your email is your login and cannot be changed here.'],
    ['Service categories', 'CATS'],
    ['Something not working?', 'Reach us from the Contact page and tell us what you were trying to do.'],
  ]],
  contact: ['Contact', 'Questions, feedback or a problem with a job? We are happy to help.', [
    ['Email us', 'Write to support@skilllink.example. We reply within two working days.'],
    ['What to include', ['The email address on your account.', 'The service or request involved, with its date and time.', 'A short description of what happened.']],
    ['Common topics', ['Account and login help.', 'Requests, schedules and cancellations.', 'Provider verification and listings.', 'Reports about a completed job.']],
    ['Reporting a problem with a job', 'After a job is completed, use Report in My requests so our admin team can review it. This is faster than email.'],
  ]],
  terms: ['Terms', 'Draft terms of use. Please read them before using SkillLink.', [
    ['Using SkillLink', 'You agree to provide accurate information and to treat other members fairly. You are responsible for activity on your account.'],
    ['Members and providers', 'SkillLink connects members with providers. Agreements about work, scope and payment are between the people involved. Providers must be qualified and permitted to offer their services.'],
    ['Requests and reviews', 'Requests, ratings and reviews must be honest. We may remove reviews that are abusive or not based on a real job.'],
    ['Reports and suspension', 'We may verify providers, review reports and suspend a listing after three upheld reports, or an account that breaks these terms.'],
    ['Changes', 'We may update these terms as SkillLink grows. Continued use means you accept the changes.'],
  ]],
  privacy: ['Privacy', 'Draft policy. We collect only what is needed to run your account and your listings.', [
    ['What we collect', ['Account details: name, email and optional phone and location.', 'Provider details: availability, service area and services offered.', 'Activity: requests, notifications, saved providers and reviews.']],
    ['How we use it', ['To show providers to members who search.', 'To let members and providers coordinate a job.', 'To keep the community safe through verification and reports.']],
    ['What others can see', 'Members see a provider\'s name, services, general location, availability and reviews. Your email and phone number are used for your account and are not shown publicly.'],
    ['Your choices', 'You can edit your details from your Profile at any time. We do not sell your personal information.'],
  ]],
};
function renderInfo(id) {
  const [title, lead, secs] = INFO[id], body = $('#infoBody');
  $('#infoTitle').textContent = title;
  body.replaceChildren(h('p', 'lead', lead));
  secs.forEach(([hd, c]) => {
    body.append(h('h2', null, hd));
    if (c === 'CATS') { const d = h('div', 'chips'); CATS.forEach((x) => d.append(h('span', null, x))); body.append(d); }
    else if (Array.isArray(c)) { const u = h('ul'); c.forEach((x) => u.append(h('li', null, x))); body.append(u); }
    else body.append(h('p', null, c));
  });
  const a = h('a', 'btn primary', 'Find a service'); a.href = '#mainPage';
  const w = h('div', 'cta'); w.append(a); body.append(w);
}
const GUARDED = ['providerPage', 'dashboard', 'profile', 'notifications', 'services', 'admin'];
let curView = '', flash = '';
let dashTab = 'profile', reqTab = 'hires';

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function load(key) { return readJSON(key) || []; }
function h(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text; // textContent, never innerHTML: values are user input
  return el;
}

// ---------- Router: the URL hash is the source of truth, so Back/Forward work ----------
function go(id) { if (location.hash === '#' + id) route(); else location.hash = id; }

// Each history entry is stamped with its position, so Back knows whether an earlier page exists in this session.
let navIdx = -1;
function stamp() { const st = history.state; navIdx = st && st.i != null ? st.i : navIdx + 1; history.replaceState({ i: navIdx }, ''); }
function swap(id) { history.replaceState({ i: navIdx }, '', '#' + id); route(); } // redirect without adding a history entry
document.addEventListener('click', (e) => { if (e.target.closest('[data-back]')) { if (navIdx > 0) history.back(); else go('mainPage'); } });

function route() {
  stamp();
  const id = decodeURIComponent(location.hash.slice(1)) || 'landingPage';
  if (INFO[id]) {
    renderInfo(id);
    return showView('infoPage');
  }
  const target = document.getElementById(id);
  const view = target?.closest('main > section');
  if (!view) return showView('landingPage');
  if (GUARDED.includes(view.id) && !getSession()) {
    pending = view.id; openAuth('login');
    return history.replaceState({ i: navIdx }, '', '#' + document.body.dataset.view); // stay on the current page
  }
  if (view.id === 'admin' && !isAdmin()) return go('mainPage');
  if (view.id === 'providerPage' && getProvider()) return swap('dashboard');
  if (view.id === 'dashboard' && !getProvider()) return swap('providerPage');
  curView = view.id;
  ({ mainPage: renderResults, notifications: renderNotifs, services: renderServices, dashboard: () => { renderDash(); fillDash(); }, profile: renderProfile, providerPage: prepProvider, admin: renderAdmin })[view.id]?.();
  showView(view.id);
  if (target !== view) target.scrollIntoView();
}
window.addEventListener('hashchange', route);

// ---------- Header: profile toggle, provider button, badges ----------
function syncHeader() {
  const v = document.body.dataset.view, b = document.querySelector('#become'), p = document.querySelector('#profileBtn');
  const label = getProvider() ? 'Provider dashboard' : 'Become a provider';
  b.querySelector('.btn-label').textContent = label; b.setAttribute('aria-label', label);
  const on = v === 'profile'; p.classList.toggle('on', on); p.setAttribute('aria-pressed', String(on));
}


// ---------- Theme switch: saved choice wins, otherwise follow the system ----------
(() => {
  const root = document.documentElement, btn = document.querySelector('#themeBtn'), mq = matchMedia('(prefers-color-scheme: dark)');
  const apply = (t) => {
    root.dataset.theme = t;
    root.classList.toggle('ion-palette-dark', t === 'dark');
    const next = t === 'dark' ? 'light' : 'dark';
    btn.setAttribute('aria-pressed', String(t === 'dark'));
    btn.setAttribute('aria-label', `Switch to ${next} mode`); btn.title = `Switch to ${next} mode`;
  };
  apply(root.dataset.theme === 'dark' ? 'dark' : 'light');
  btn.addEventListener('click', () => {
    const t = root.dataset.theme === 'dark' ? 'light' : 'dark';
    apply(t); try { localStorage.setItem('skilllink.theme', t); } catch { /* not saved */ }
  });
  mq.addEventListener('change', (e) => { let saved = null; try { saved = localStorage.getItem('skilllink.theme'); } catch { } if (!saved) apply(e.matches ? 'dark' : 'light'); });
})();
// Keep the profile toggle icon-only: remove any initial another script writes into it.
(() => {
  const pb = document.querySelector('#profileBtn');
  const clean = () => { if (pb.childNodes.length) pb.replaceChildren(); };
  clean(); new MutationObserver(clean).observe(pb, { childList: true, characterData: true, subtree: true });
})();
document.querySelector('#profileBtn').addEventListener('click', () => {
  const back = window.lastView && window.lastView !== 'landingPage' ? window.lastView : 'mainPage';
  go(document.body.dataset.view === 'profile' ? back : 'profile');
});

function setBadge(sel, n) {
  const el = document.querySelector(sel);
  el.textContent = n > 9 ? '9+' : n;
  el.hidden = !n;
}
function renderBadges() {
  setBadge('#notifCount', myNotifs().filter((n) => !n.read).length);
  setBadge('#cartCount', load(CART_KEY).length);
}
function notify(title, text, to = getSession()?.email) {
  writeJSON(NOTIF_KEY, [{ id: uid(), title, text, to, time: Date.now(), read: false }, ...load(NOTIF_KEY)]);
  renderBadges();
}
document.querySelector('#notif').addEventListener('click', () => go('notifications'));
document.querySelector('#cart').addEventListener('click', () => { reqTab = 'hires'; go('services'); });
document.querySelector('#become').addEventListener('click', () => go(getProvider() ? 'dashboard' : 'providerPage'));

// ---------- Notifications ----------
function renderNotifs() {
  const list = document.querySelector('#notifList');
  const items = myNotifs();
  list.replaceChildren();
  document.querySelector('#markAll').hidden = !items.some((n) => !n.read);
  if (!items.length) { list.append(h('p', 'empty', 'Nothing here yet. Updates about your services and hires will appear here.')); return; }
  [['Unread', items.filter((n) => !n.read)], ['Read', items.filter((n) => n.read)]].forEach(([label, group]) => {
    if (!group.length) return;
    list.append(h('h2', 'group-label', label));
    group.forEach((n) => {
      const row = h('button', 'notif ' + (n.read ? 'read' : 'unread'));
      row.type = 'button';
      row.dataset.id = n.id;
      row.append(h('strong', null, n.title), h('span', null, n.text), h('small', null, new Date(n.time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })));
      list.append(row);
    });
  });
}
document.querySelector('#notifList').addEventListener('click', (e) => {
  const row = e.target.closest('.notif.unread');
  if (!row) return;
  row.classList.add('fading');
  setTimeout(() => {
    writeJSON(NOTIF_KEY, load(NOTIF_KEY).map((n) => (n.id === row.dataset.id ? { ...n, read: true } : n)));
    renderNotifs(); renderBadges();
  }, 180);
});
document.querySelector('#markAll').addEventListener('click', () => {
  writeJSON(NOTIF_KEY, load(NOTIF_KEY).map((n) => (mineN(n) ? { ...n, read: true } : n)));
  renderNotifs(); renderBadges();
});

// ---------- Provider registration ----------
const pForm = document.querySelector('#providerForm');
const CATS = [...document.querySelectorAll('#categories .category')].map((b) => b.dataset.cat);
function getProvider() { return readJSON(PROV_KEY)?.[getSession()?.email] || null; }
function prepProvider() {
  resetForm(pForm);
  const s = getSession();
  pForm.elements['name'].value = s.name;
  const u = readJSON(UINFO_KEY)?.[s.email];
  if (u?.phone) pForm.elements['phone'].value = u.phone;
}
pForm.addEventListener('submit', () => {
  if (!validateForm(pForm)) return;
  const d = Object.fromEntries(new FormData(pForm)); delete d.agree;
  // TODO: insert the provider row in Supabase here and continue only on success.
  writeJSON(PROV_KEY, { ...readJSON(PROV_KEY), [getSession().email]: { ...d, since: Date.now() } });
  notify('You are now a provider', 'Add your first service from your dashboard.');
  flash = 'Registration complete. Add your first service to go live.';
  swap('dashboard');
});

// ---------- Provider dashboard ----------
function stars(v) {
  const el = h('span', 'stars'); el.setAttribute('role', 'img'); el.setAttribute('aria-label', `${v.toFixed(1)} out of 5`); el.style.setProperty('--p', (v / 5 * 100) + '%');
  el.append('\u2605\u2605\u2605\u2605\u2605', h('i', null, '\u2605\u2605\u2605\u2605\u2605')); return el;
}
function renderDash() {
  const m = me(), reqs = load(REQ_KEY), done = (r) => r.status === 'Completed' || r.status === 'Cancelled', st = $('#dashStats');
  const mine = load(SVC_KEY).filter((s) => s.owner === m), rs = mine.map(rep), n = rs.reduce((a, r) => a + r.n, 0), avg = n ? rs.reduce((a, r) => a + r.avg * r.n, 0) / n : 0;
  $('#dashSub').textContent = flash || 'Manage your profile, services and requests in one place.'; flash = '';
  st.replaceChildren();
  [['Services', mine.length], ['Open requests', reqs.filter((r) => r.to === m && !done(r)).length], ['Completed jobs', reqs.filter((r) => r.to === m && r.status === 'Completed').length], ['My hires', reqs.filter((r) => r.by === m && !done(r)).length]]
    .forEach(([k, v]) => { const d = h('div'); d.append(h('strong', null, String(v)), h('span', null, k)); st.append(d); });
  const num = h('div', 'rating-num'); num.append(h('strong', null, avg.toFixed(1)), h('span', null, '/ 5.0'));
  $('#ratingBox').replaceChildren(num, stars(avg), h('p', 'rating-count', `${n} review${n === 1 ? '' : 's'}`));
  const cats = [...new Set(mine.map((s) => s.cat))];
  $('#dashCats').replaceChildren(...(cats.length ? cats.map((c) => h('span', null, c)) : [h('span', 'muted', 'No services yet. Add your first one to go live.')]));
  const rv = mine.flatMap((s) => reviewsOf(s.id).map((r) => ({ ...r, svc: s.title }))).sort((a, b) => b.time - a.time).slice(0, 10);
  $('#revList').replaceChildren(...(rv.length ? rv.map((r) => { const d = h('div', 'rv'); d.append(stars(r.stars), h('p', 'meta', `${r.svc}, ${r.by}, ${new Date(r.time).toLocaleDateString()}`)); if (r.text) d.append(h('p', null, r.text)); return d; }) : [h('p', 'hint', 'No reviews yet. Reviews appear here after a completed job.')]));
  renderServices();
}
const dForm = document.querySelector('#dashForm');
function fillDash() {
  const p = getProvider(); if (!p) return;
  resetForm(dForm); $('#saveMsg').textContent = '';
  Object.entries(p).forEach(([k, v]) => { const f = dForm.elements[k]; if (f && k !== 'since') f.value = v; });
  $('#d-email').value = getSession().email;
}
dForm.addEventListener('submit', () => {
  if (!validateForm(dForm)) return;
  const all = readJSON(PROV_KEY) || {}, cur = all[me()]; if (!cur) return;
  const next = { ...cur, ...Object.fromEntries(new FormData(dForm)) };
  writeJSON(PROV_KEY, { ...all, [me()]: next });
  writeJSON(SVC_KEY, load(SVC_KEY).map((x) => (x.owner === me() ? { ...x, name: next.name, city: next.city, province: next.province, days: next.days, from: next.from, to: next.to } : x)));
  toast('Changes saved.');
});
document.querySelector('#manageSvc').addEventListener('click', () => { dashTab = 'mine'; renderDash(); });
function openServiceModal(svc) {
  const p = getProvider(); if (!p) return go('providerPage');
  openModal(svc ? 'Edit service' : 'Add a service', [
    { id: 'title', label: 'Service title' }, { id: 'cat', label: 'Category', options: CATS }, { id: 'type', label: 'Type', options: ['Manual', 'Technical'] },
  ], svc ? 'Save changes' : 'Add service', (d) => {
    if (svc) { writeJSON(SVC_KEY, load(SVC_KEY).map((x) => (x.id === svc.id ? { ...x, ...d } : x))); notify('Service updated', `${d.title} was updated.`); }
    else { writeJSON(SVC_KEY, [{ ...d, name: p.name, city: p.city, province: p.province, days: p.days, from: p.from, to: p.to, id: uid(), status: 'Active', owner: me() }, ...load(SVC_KEY)]); notify('Service listed', `${d.title} is now live.`); }
    dashTab = 'mine'; renderDash();
  }, svc);
}
document.querySelector('#addSvc').addEventListener('click', () => openServiceModal());

// ---------- Profile ----------
function profileCard(title, fields, get, save) {
  const c = h('section', 'pcard'), head = h('div', 'pcard-head'), edit = h('button', 'btn outline sm', 'Edit'), dl = h('dl');
  edit.type = 'button'; head.append(h('h2', null, title), edit);
  fields.forEach(([k, l]) => dl.append(h('dt', null, l), h('dd', get(k) ? '' : 'muted', get(k) || 'Not provided')));
  c.append(head, dl);
  edit.addEventListener('click', () => {
    const f = h('form', 'profile-form'); wireForm(f);
    fields.forEach(([k, l, t, req]) => {
      const w = h('div', 'field'), lb = h('label', null, l), i = h('input');
      lb.htmlFor = i.id = 'pf-' + title.replace(/\W/g, '') + k; i.name = k; i.type = t; i.value = get(k); i.required = !!req;
      if (t === 'tel') i.pattern = '[+0-9 \\-]{7,}';
      w.append(lb, i); f.append(w);
    });
    const acts = h('div', 'acts'), sv = h('button', 'btn primary', 'Save changes'), cn = h('button', 'btn outline', 'Cancel');
    sv.type = 'submit'; cn.type = 'button'; acts.append(sv, cn); f.append(acts);
    cn.addEventListener('click', renderProfile);
    f.addEventListener('submit', () => { if (!validateForm(f)) return; save(Object.fromEntries(new FormData(f))); renderProfile(); });
    dl.replaceWith(f); edit.hidden = true; f.querySelector('input').focus();
  });
  return c;
}
function renderProfile() {
  const s = getSession(), box = $('#profileBody'), u = readJSON(UINFO_KEY)?.[s.email] || {}, get = (k) => (k === 'name' ? s.name : u[k] || '');
  const save = (d) => {
    const { name, ...rest } = d, cur = getSession();
    if (name) { signIn({ ...cur, name: name.trim() }); writeJSON(PROFILES_KEY, { ...readJSON(PROFILES_KEY), [cur.email]: name.trim() }); }
    writeJSON(UINFO_KEY, { ...readJSON(UINFO_KEY), [cur.email]: { ...(readJSON(UINFO_KEY)?.[cur.email]), ...rest } });
  };
  box.replaceChildren(
    profileCard('Personal information', [['name', 'Full name', 'text', 1], ['phone', 'Mobile number', 'tel'], ['bio', 'About you', 'text']], get, save),
    profileCard('Location', [['city', 'City/Municipality', 'text'], ['province', 'Province', 'text'], ['address', 'Street and barangay', 'text']], get, save));
  const p = getProvider(), ac = h('section', 'pcard'), dl = h('dl'), acts = h('div', 'acts'), go1 = h('a', 'btn outline sm', p ? 'Open provider dashboard' : 'Become a provider');
  go1.href = p ? '#dashboard' : '#providerPage';
  dl.append(h('dt', null, 'Email'), h('dd', null, s.email), h('dt', null, 'Account type'), h('dd', null, p ? 'Member and provider' : 'Member'));
  if (p) dl.append(h('dt', null, 'Availability'), h('dd', null, `${p.days}, ${p.from} to ${p.to}`), h('dt', null, 'Service area'), h('dd', null, [p.city, p.province].join(', ')));
  acts.append(go1); ac.append(h('div', 'pcard-head', null), dl, acts); ac.firstChild.append(h('h2', null, 'Account'));
  box.append(ac);
}

// ================= Marketplace (frontend only; localStorage stands in for a backend) =================
const REQ_KEY = 'skilllink.requests', REV_KEY = 'skilllink.reviews', REP_KEY = 'skilllink.reports', FAV_KEY = 'skilllink.favs', ADM_KEY = 'skilllink.admin';
const $ = (s) => document.querySelector(s);
const STEPS = ['Pending', 'Accepted', 'In progress', 'Completed'];
const DAYS = { Weekdays: [1, 2, 3, 4, 5], Weekends: [0, 6], 'Every day': [0, 1, 2, 3, 4, 5, 6] };
const SEED = [
  ['s1', 'Home plumbing', 'Home & Repair', 'Manual', 'Davao City', 'Marco Reyes', 4.8, 31, 'yes', 'Weekdays', '08:00', '17:00'],
  ['s2', 'Website design', 'Technology', 'Technical', 'Cebu City', 'Ana Cruz', 4.9, 18, 'yes', 'Every day', '09:00', '18:00'],
  ['s3', 'Aircon cleaning', 'Cleaning', 'Manual', 'Davao City', 'Joel Tan', 4.5, 12, '', 'Weekends', '08:00', '16:00'],
  ['s4', 'Motorcycle repair', 'Automotive', 'Manual', 'Tagum', 'Ben Uy', 4.2, 7, 'yes', 'Weekdays', '08:00', '17:00'],
  ['s5', 'Math tutoring', 'Education', 'Technical', 'Quezon City', 'Lea Santos', 4.7, 22, '', 'Every day', '15:00', '20:00'],
  ['s6', 'Logo and branding', 'Creative', 'Technical', 'Davao City', 'Kim Lao', 4.6, 9, '', 'Weekdays', '10:00', '19:00'],
  ['s7', 'Electrical repair', 'Home & Repair', 'Manual', 'Davao City', 'Rico Dela Cruz', 4.6, 14, 'yes', 'Weekdays', '08:00', '17:00'],
  ['s8', 'Carpentry and cabinets', 'Home & Repair', 'Manual', 'Tagum', 'Nilo Abad', 4.4, 8, '', 'Every day', '07:00', '16:00'],
  ['s9', 'Bridal makeup', 'Beauty & Wellness', 'Manual', 'Davao City', 'Mia Flores', 4.9, 26, 'yes', 'Every day', '09:00', '18:00'],
  ['s10', 'House painting', 'Construction', 'Manual', 'Cebu City', 'Tony Go', 4.3, 10, '', 'Weekdays', '08:00', '17:00'],
  ['s11', 'Same-day parcel delivery', 'Delivery & Moving', 'Manual', 'Davao City', 'Rey Pineda', 4.5, 19, '', 'Every day', '08:00', '20:00'],
  ['s12', 'Bookkeeping', 'Professional Services', 'Technical', 'Quezon City', 'Grace Lim', 4.8, 15, 'yes', 'Weekdays', '09:00', '17:00'],
].map(([id, title, cat, type, city, name, r, n, verify, days, from, to]) => ({ id, title, cat, type, city, name, owner: id + '@seed', seed: { r, n }, verify, days, from, to, status: 'Active' }));
const F = { q: '', cat: 'Home & Repair', loc: '', type: 'Any', min: 0, ver: false, avail: false };

const me = () => getSession()?.email;
const providers = () => [...load(SVC_KEY), ...SEED];
const find = (id) => providers().find((s) => s.id === id);
const adm = () => readJSON(ADM_KEY) || {};
const ver = (s) => adm()[s.id] ?? s.verify; // 'yes' | 'pending' | ''
const setVer = (id, v) => writeJSON(ADM_KEY, { ...adm(), [id]: v });
const strikes = (id) => load(REP_KEY).filter((r) => r.svcId === id && r.status === 'Upheld').length; // 3 = suspended
const reviewsOf = (id) => load(REV_KEY).filter((r) => r.svcId === id);
const availOn = (s, d) => (DAYS[s.days] || DAYS['Every day']).includes(d.getDay());
const hours = (s) => { const a = +(s.from || '08:00').slice(0, 2), b = +(s.to || '17:00').slice(0, 2); return Array.from({ length: Math.max(b - a, 1) }, (_, i) => String(a + i).padStart(2, '0') + ':00'); };
function rep(s) { // reputation: seeded prior blended with real reviews
  const rv = reviewsOf(s.id), n = (s.seed?.n || 0) + rv.length;
  return { n, avg: n ? ((s.seed?.r || 0) * (s.seed?.n || 0) + rv.reduce((a, r) => a + r.stars, 0)) / n : 0 };
}
function score(s) { const { avg, n } = rep(s); return avg * 2 + Math.min(n, 20) / 10 + (ver(s) === 'yes' ? 1.5 : 0) + (availOn(s, new Date()) ? 1 : 0); } // smart recommendation
function needAuth(fn) { if (getSession()) fn(); else { pending = fn; openAuth('login'); } }
function toggleFav(id) { needAuth(() => { const f = load(FAV_KEY); writeJSON(FAV_KEY, f.includes(id) ? f.filter((x) => x !== id) : [...f, id]); renderResults(); }); }

// ---------- Generic modal form ----------
const modal = $('#modal'), mForm = $('#mForm');
let mSubmit = null;
function openModal(title, fields, label, onSubmit, vals) {
  mForm.replaceChildren(h('h2', null, title));
  fields.forEach((f) => {
    const w = h('div', 'field'), l = h('label', null, f.label), i = f.options ? h('select') : h('input');
    l.htmlFor = i.id = 'm-' + f.id; i.name = f.id;
    if (f.options) f.options.forEach((o) => i.append(new Option(o))); else i.type = f.type || 'text';
    if (f.min) i.min = f.min;
    i.required = f.req !== false;
    if (vals && vals[f.id] != null) i.value = vals[f.id];
    w.append(l, i); mForm.append(w);
  });
  const b = h('button', 'btn primary wide', label); b.type = 'submit'; mForm.append(b);
  mSubmit = onSubmit; modal.showModal();
}
mForm.addEventListener('submit', () => {
  if (!validateForm(mForm)) return;
  if (mSubmit(Object.fromEntries(new FormData(mForm))) !== false) modal.close();
});

// ---------- Directory: search, filters, location, recommendation ----------
function renderResults() {
  const box = $('#results'), q = F.q.toLowerCase(), favs = load(FAV_KEY), m = me();
  const list = providers().filter((s) => s.status === 'Active' && strikes(s.id) < 3
    && (!F.cat || s.cat === F.cat) && (F.type === 'Any' || s.type === F.type)
    && (!F.loc || [s.city, s.province, s.region].join(' ').toLowerCase().includes(F.loc.toLowerCase()))
    && (!F.ver || ver(s) === 'yes') && (!F.avail || availOn(s, new Date())) && rep(s).avg >= F.min
    && (!q || [s.title, s.cat, s.name, s.city].join(' ').toLowerCase().includes(q))).sort((a, b) => score(b) - score(a));
  $('#resCount').textContent = `${list.length} provider${list.length === 1 ? '' : 's'}${F.cat ? ' in ' + F.cat : ''}, best match first`;
  box.replaceChildren();
  if (!list.length) { box.append(h('p', 'empty', 'No providers here yet. Try another category, clear a filter or widen the location.')); return; }
  list.forEach((s, i) => {
    const { avg, n } = rep(s), latest = reviewsOf(s.id)[0], c = h('article', 'card');
    c.dataset.id = s.id;
    const top = h('div', 'card-top'), sv = h('button', 'btn text sm', favs.includes(s.id) ? 'Saved' : 'Save');
    sv.type = 'button'; sv.dataset.act = 'fav'; top.append(h('strong', null, s.title), sv);
    const tags = h('div', 'tags');
    [[i === 0 && list.length > 1 && 'Top match', 1], [ver(s) === 'yes' && 'Verified', 1], [n ? `${avg.toFixed(1)} of 5 from ${n}` : 'New']].forEach(([t, on]) => t && tags.append(h('span', 'tag' + (on ? ' on' : ''), t)));
    const rq = h('button', 'btn outline', s.owner === m ? 'Your listing' : 'Request'); rq.type = 'button'; rq.dataset.act = 'req'; rq.disabled = s.owner === m;
    c.append(top, h('span', 'muted', `${s.name}, ${s.city || 'Philippines'}`), h('span', 'muted', `${s.type}, ${s.days || 'Every day'} ${s.from || '08:00'} to ${s.to || '17:00'}`), tags);
    if (latest) c.append(h('span', 'muted', `Latest review: ${latest.text || latest.stars + ' of 5'}`));
    c.append(rq); box.append(c);
  });
}
$('#results').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.closest('.card').dataset.id;
  if (b.dataset.act === 'fav') toggleFav(id); else request(find(id));
});
function readF() { F.loc = $('#f-location').value.trim(); F.type = $('#f-type').value; F.min = +$('#f-min').value; F.ver = $('#f-ver').checked; F.avail = $('#f-avail').checked; renderResults(); }
filterForm.addEventListener('input', readF);
$('#clearF').addEventListener('click', () => { filterForm.reset(); readF(); });
$('#search').addEventListener('input', (e) => { F.q = e.target.value.trim(); renderResults(); });
function setCat(c) {
  F.cat = c;
  document.querySelectorAll('.category').forEach((x) => {
    const on = x.dataset.cat === c; x.setAttribute('aria-pressed', String(on));
    if (on) x.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  });
  renderResults();
}
$('#categories').addEventListener('click', (e) => { const b = e.target.closest('.category'); if (b) setCat(b.dataset.cat); });

// ---------- Requests: scheduling, status tracking, reviews, reports ----------
function request(s) {
  needAuth(() => openModal(`Request ${s.title}`, [
    { id: 'date', label: 'Date', type: 'date', min: new Date().toISOString().slice(0, 10) },
    { id: 'time', label: 'Time', options: hours(s) },
    { id: 'note', label: 'Job details (optional)', req: false },
  ], 'Send request', (d) => {
    if (!availOn(s, new Date(d.date + 'T00:00'))) { showError(mForm.elements.date, `Available ${s.days.toLowerCase()} only.`); return false; }
    const u = getSession();
    writeJSON(REQ_KEY, [{ id: uid(), svcId: s.id, title: s.title, cat: s.cat, provider: s.name, to: s.owner, by: u.email, byName: u.name, when: `${d.date} ${d.time}`, note: d.note, status: 'Pending', time: Date.now() }, ...load(REQ_KEY)]);
    notify('Request sent', `${s.title} on ${d.date} at ${d.time}.`);
    notify('New request', `${u.name} wants ${s.title} on ${d.date} at ${d.time}.`, s.owner);
    reqTab = 'hires'; go('services');
  }));
}
function setStatus(id, status) {
  const r = load(REQ_KEY).find((x) => x.id === id); if (!r) return;
  writeJSON(REQ_KEY, load(REQ_KEY).map((x) => (x.id === id ? { ...x, status } : x)));
  notify(`Request ${status.toLowerCase()}`, `${r.title}: ${status}.`, r.to === me() ? r.by : r.to);
}
function rate(id) {
  const r = load(REQ_KEY).find((x) => x.id === id);
  openModal(`Rate ${r.title}`, [{ id: 'stars', label: 'Rating (5 is best)', options: ['5', '4', '3', '2', '1'] }, { id: 'text', label: 'Review (optional)', req: false }], 'Post review', (d) => {
    writeJSON(REV_KEY, [{ svcId: r.svcId, stars: +d.stars, text: d.text, by: getSession().name, time: Date.now() }, ...load(REV_KEY)]);
    writeJSON(REQ_KEY, load(REQ_KEY).map((x) => (x.id === id ? { ...x, rated: 1 } : x)));
    notify('New review', `${getSession().name} rated ${r.title} ${d.stars} of 5.`, r.to); renderServices();
  });
}
function report(id) {
  const r = load(REQ_KEY).find((x) => x.id === id);
  openModal(`Report ${r.title}`, [{ id: 'reason', label: 'Reason', options: ['No show', 'Poor quality', 'Unsafe behavior', 'Overcharged', 'Other'] }, { id: 'text', label: 'What happened? (optional)', req: false }], 'Send report', (d) => {
    writeJSON(REP_KEY, [{ id: uid(), svcId: r.svcId, reason: d.reason, text: d.text, by: me(), status: 'Open', time: Date.now() }, ...load(REP_KEY)]);
    writeJSON(REQ_KEY, load(REQ_KEY).map((x) => (x.id === id ? { ...x, reported: 1 } : x)));
    notify('Report received', 'An admin will review it.'); renderServices();
  });
}

// ---------- Services page: listings, requests, hires, saved, history ----------
function row(main, sub, status, id, acts, extra) {
  const r = h('div', 'svc'), i = h('div'), a = h('div', 'acts');
  i.append(h('strong', null, main), h('span', null, sub)); if (extra) i.append(extra);
  r.append(i); if (status) r.append(h('span', 'status ' + status.toLowerCase().replace(/\W+/g, '-'), status));
  acts.forEach(([act, label]) => { const b = h('button', 'btn text', label); b.type = 'button'; b.dataset.act = act; b.dataset.id = id; a.append(b); });
  r.append(a); return r;
}
function renderServices() {
  const onDash = curView === 'dashboard', root = $(onDash ? '#dashboard' : '#services'), list = root.querySelector('.svc-list'), m = me(), reqs = load(REQ_KEY), done = (r) => r.status === 'Completed' || r.status === 'Cancelled';
  const tab = onDash ? dashTab : reqTab;
  list.replaceChildren();
  root.querySelectorAll('.seg [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  if (onDash) { $('#dashProfile').hidden = tab !== 'profile'; list.hidden = tab === 'profile'; if (tab === 'profile') return; }
  let rows = [], msg = ['Nothing here yet.'], cta = null;
  if (tab === 'mine') {
    rows = load(SVC_KEY).filter((s) => !s.owner || s.owner === m).map((s) => {
      const k = strikes(s.id), v = ver(s);
      return row(s.title, [s.cat, s.city, `${s.days || 'Every day'} ${s.from || '08:00'} to ${s.to || '17:00'}`, k && `${k} of 3 strikes`].filter(Boolean).join(', '), k >= 3 ? 'Suspended' : s.status, s.id,
        [['edit', 'Edit'], ['toggle', s.status === 'Active' ? 'Pause' : 'Activate'], ...(v ? [] : [['verify', 'Get verified']]), ['remove', 'Remove']], v && h('span', null, v === 'yes' ? 'Verified' : 'Verification pending'));
    });
    msg = ['You have not added any services yet.']; cta = ['Add a service', '#addsvc'];
  } else if (tab === 'saved') {
    const favs = load(FAV_KEY);
    rows = providers().filter((s) => favs.includes(s.id)).map((s) => row(s.title, `${s.name}, ${s.city || ''}`, null, s.id, [['req', 'Request'], ['unsave', 'Remove']]));
    msg = ['No saved providers yet.']; cta = ['Find a service', '#mainPage'];
  } else {
    const mine = tab === 'incoming' ? reqs.filter((r) => r.to === m && !done(r)) : tab === 'hires' ? reqs.filter((r) => r.by === m && !done(r)) : reqs.filter((r) => (r.by === m || r.to === m) && done(r));
    rows = mine.map((r) => {
      const acts = [], out = r.by === m;
      if (tab === 'incoming') { if (r.status === 'Pending') acts.push(['set:Accepted', 'Accept'], ['set:Cancelled', 'Decline']); if (r.status === 'Accepted') acts.push(['set:In progress', 'Start']); if (r.status === 'In progress') acts.push(['set:Completed', 'Complete']); }
      else if (tab === 'hires') { if (r.status === 'Pending' || r.status === 'Accepted') acts.push(['set:Cancelled', 'Cancel']); }
      else if (out && r.status === 'Completed') { if (!r.rated) acts.push(['rate', 'Rate']); if (!r.reported) acts.push(['report', 'Report']); }
      const track = h('div', 'track'); STEPS.forEach((x, i) => track.append(h('i', i <= STEPS.indexOf(r.status) ? 'on' : '')));
      return row(r.title, `${out ? r.provider : r.byName}, ${r.when}`, r.status, r.id, acts, r.status === 'Cancelled' ? null : track);
    });
    msg = [{ incoming: 'No open requests for your services.', hires: 'You have no active requests.', history: 'Completed and cancelled jobs appear here.' }[tab]];
    if (tab === 'hires') cta = ['Find a service', '#mainPage'];
  }
  if (!rows.length) {
    const box = h('div', 'empty'); box.append(h('p', null, msg[0]));
    if (cta) { const a = h(cta[1] === '#addsvc' ? 'button' : 'a', 'btn outline', cta[0]); if (cta[1] === '#addsvc') { a.type = 'button'; a.addEventListener('click', () => openServiceModal()); } else a.href = cta[1]; box.append(a); }
    return list.append(box);
  }
  list.append(...rows);
}
document.querySelectorAll('.seg').forEach((sg) => sg.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]'); if (!t) return;
  if (curView === 'dashboard') dashTab = t.dataset.tab; else reqTab = t.dataset.tab;
  renderServices();
}));
const onSvc = (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const { act, id } = b.dataset;
  if (act === 'edit') return openServiceModal(load(SVC_KEY).find((x) => x.id === id));
  if (act === 'req') return request(find(id));
  if (act === 'rate') return rate(id);
  if (act === 'report') return report(id);
  if (act === 'remove') writeJSON(SVC_KEY, load(SVC_KEY).filter((s) => s.id !== id));
  else if (act === 'toggle') writeJSON(SVC_KEY, load(SVC_KEY).map((s) => (s.id === id ? { ...s, status: s.status === 'Active' ? 'Paused' : 'Active' } : s)));
  else if (act === 'verify') { setVer(id, 'pending'); notify('Verification requested', 'An admin will review your listing.'); }
  else if (act === 'unsave') toggleFav(id);
  else if (act.startsWith('set:')) setStatus(id, act.slice(4));
  curView === 'dashboard' ? renderDash() : renderServices();
};
document.querySelectorAll('.svc-list').forEach((el) => el.addEventListener('click', onSvc));

// ---------- Admin: analytics, verification, reports, strikes ----------
function renderAdmin() {
  const box = $('#adminBody'), reqs = load(REQ_KEY), reps = load(REP_KEY), rv = load(REV_KEY), all = providers(), users = readJSON(PROFILES_KEY) || {};
  box.replaceChildren();
  const stats = h('div', 'stats');
  [['Users', Object.keys(users).length], ['Providers', all.length], ['Requests', reqs.length], ['Completed', reqs.filter((r) => r.status === 'Completed').length], ['Open reports', reps.filter((r) => r.status === 'Open').length], ['Avg review', rv.length ? (rv.reduce((a, r) => a + r.stars, 0) / rv.length).toFixed(1) : 'None yet']]
    .forEach(([k, v]) => { const d = h('div'); d.append(h('strong', null, String(v)), h('span', null, k)); stats.append(d); });
  box.append(stats, h('h2', 'group-label', 'Requests by category'));
  const by = {}; reqs.forEach((r) => { by[r.cat] = (by[r.cat] || 0) + 1; });
  const max = Math.max(1, ...Object.values(by));
  if (!reqs.length) box.append(h('p', 'muted', 'No requests yet.'));
  Object.entries(by).forEach(([k, v]) => { const r = h('div', 'bar'), f = h('i'); f.style.width = (v / max * 100) + '%'; r.append(h('span', null, k), f, h('b', null, String(v))); box.append(r); });
  box.append(h('h2', 'group-label', 'Open reports'));
  const open = reps.filter((r) => r.status === 'Open');
  if (!open.length) box.append(h('p', 'muted', 'No open reports.'));
  open.forEach((rp) => box.append(row(`${find(rp.svcId)?.title || 'Listing'}: ${rp.reason}`, `${rp.text || 'No details'}, reported by ${rp.by}`, 'Open', rp.id, [['uphold', 'Uphold, add strike'], ['dismiss', 'Dismiss']])));
  box.append(h('h2', 'group-label', 'Providers'));
  all.forEach((s) => {
    const v = ver(s), k = strikes(s.id);
    box.append(row(s.title, `${s.name}, ${s.cat}, ${k} of 3 strikes`, k >= 3 ? 'Suspended' : v === 'yes' ? 'Verified' : v === 'pending' ? 'Pending' : 'Unverified', s.id,
      v === 'yes' ? [['unver', 'Remove badge']] : v === 'pending' ? [['ver', 'Approve'], ['unver', 'Reject']] : [['ver', 'Verify']]));
  });
  box.append(h('h2', 'group-label', 'Users'));
  if (!Object.keys(users).length) box.append(h('p', 'muted', 'No registered users yet.'));
  Object.entries(users).forEach(([email, name]) => box.append(row(name, email, null, email, [])));
}
$('#adminBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const { act, id } = b.dataset;
  if (act === 'ver' || act === 'unver') {
    setVer(id, act === 'ver' ? 'yes' : ''); const p = find(id);
    if (p && act === 'ver') notify('Verified', `${p.title} now carries a verified badge.`, p.owner);
  } else {
    const rp = load(REP_KEY).find((x) => x.id === id);
    writeJSON(REP_KEY, load(REP_KEY).map((x) => (x.id === id ? { ...x, status: act === 'uphold' ? 'Upheld' : 'Dismissed' } : x)));
    if (act === 'uphold') {
      const n = strikes(rp.svcId), p = find(rp.svcId);
      notify(n >= 3 ? 'Listing suspended' : `Strike ${n} of 3`, n >= 3 ? `${p.title} is hidden after three upheld reports.` : `A report on ${p.title} was upheld (${rp.reason}). Three strikes suspend the listing.`, p.owner);
    }
  }
  renderAdmin();
});

// ---------- Landing: entrance animations, replayed on every visit ----------
const landing = document.querySelector('#landingPage');
const revealEls = [...document.querySelectorAll('#landingPage .section h2, .how-col, .principles > div')];
const io = new IntersectionObserver((entries) => entries.forEach((en) => {
  if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
}), { threshold: 0.15 });
revealEls.forEach((el) => el.classList.add('reveal'));

function replayLanding() {
  landing.classList.add('replay');                       // 1. switch animations/transitions off
  revealEls.forEach((el) => { io.unobserve(el); el.classList.remove('in'); }); // 2. snap reveals to hidden
  void landing.offsetWidth;                              // 3. force a reflow so the browser commits that state
  landing.classList.remove('replay');                    // 4. switch back on: hero animations restart
  revealEls.forEach((el) => io.observe(el));             // 5. observers re-fire for whatever is in view
}
function setPw(b, show) {
  b.parentElement.querySelector('input').type = show ? 'text' : 'password';
  b.setAttribute('aria-pressed', String(show)); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  b.innerHTML = `<i data-lucide="${show ? 'eye-off' : 'eye'}"></i>`; lucide.createIcons();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('.pw-toggle'); if (b) setPw(b, b.getAttribute('aria-pressed') !== 'true');
  const l = e.target.closest('[data-mode-link]'); if (l) setAuthMode(l.dataset.modeLink);
});
document.querySelector('#landingCats .cat-grid').addEventListener('click', (e) => {
  const t = e.target.closest('.cat-tile'); if (!t) return;
  setCat(t.dataset.cat); go('mainPage');
});
route();