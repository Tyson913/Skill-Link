
/* ================= API CLIENT =================
   The only code that knows about fetch(), the /api prefix, tokens and error shapes.
   Everything else in the page calls API.get / API.post / ... and never touches fetch directly. */
const API = (() => {
    // Same origin: server.js serves this page AND /api, so no CORS and no hard-coded host.
    // Only set a host (e.g. "http://localhost:3000") if the page is hosted elsewhere,
    // and then add that origin to CORS_ORIGINS in the server's .env.
    const BASE = "";
    const KEY = "sl-session", AKEY = "sl-admin-api-session";
    let session = null, admin = null;     // { accessToken, refreshToken } ; admin also { email, seen }
    try { session = JSON.parse(localStorage.getItem(KEY)); } catch (e) { }
    try { admin = JSON.parse(sessionStorage.getItem(AKEY)); } catch (e) { }

    const keep = (storage, key, value) => { try { value ? storage.setItem(key, JSON.stringify(value)) : storage.removeItem(key); } catch (e) { } };
    const setSession = v => { session = v; keep(localStorage, KEY, v); };
    const setAdmin = v => { admin = v; keep(sessionStorage, AKEY, v); };

    class ApiError extends Error {
        constructor(status, code, message) { super(message); this.status = status; this.code = code; }
    }

    // Several requests can hit a 401 at once; they all share ONE refresh call.
    let refreshing = null;
    function refresh() {
        if (!session || !session.refreshToken) return Promise.resolve(false);
        if (!refreshing) {
            refreshing = fetch(BASE + "/api/auth/refresh", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refreshToken: session.refreshToken })
            })
                .then(async res => { if (!res.ok) return false; setSession((await res.json()).session); return true; })
                .catch(() => false)
                .finally(() => { refreshing = null; });
        }
        return refreshing;
    }

    // as: "user" (default) or "admin". The two logins never share a token.
    async function request(method, path, { body, query, auth = true, as = "user" } = {}, retried = false) {
        const isAdmin = as === "admin", who = isAdmin ? admin : session;
        const params = new URLSearchParams();
        Object.entries(query || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") params.set(k, v); });
        const url = BASE + "/api" + path + (params.toString() ? "?" + params : "");

        const headers = {};
        let payload;
        if (body instanceof FormData) payload = body;   // the browser adds the multipart boundary itself
        else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
        if (auth && who) headers.Authorization = "Bearer " + who.accessToken;

        let res;
        try { res = await fetch(url, { method, headers, body: payload }); }
        catch (e) { throw new ApiError(0, "network", "Cannot reach the server. Check your connection and try again."); }

        if (res.status === 401 && auth && who) {
            if (isAdmin) { setAdmin(null); window.dispatchEvent(new Event("sl:admin-expired")); }
            else if (!retried && await refresh()) return request(method, path, { body, query, auth, as }, true);   // refresh once, replay once
            else { setSession(null); window.dispatchEvent(new Event("sl:session-expired")); }
        }

        const data = await res.json().catch(() => null);   // may be empty or not JSON; never trust the shape
        if (!res.ok) {
            const err = (data && data.error) || {};         // server errors look like { error: { code, message } }
            throw new ApiError(res.status, err.code || "error", err.message || "Something went wrong. Please try again.");
        }
        if (isAdmin && admin) setAdmin({ ...admin, seen: Date.now() });
        return data;
    }

    return {
        ApiError,
        get signedIn() { return !!session; },
        get: (path, query) => request("GET", path, { query }),
        post: (path, body) => request("POST", path, { body }),
        put: (path, body) => request("PUT", path, { body }),
        patch: (path, body) => request("PATCH", path, { body }),
        del: path => request("DELETE", path),
        // EventSource cannot send an Authorization header, so the server also accepts ?access_token= on the stream.
        sseUrl: path => BASE + "/api" + path + "?access_token=" + encodeURIComponent(session ? session.accessToken : ""),
        async login(email, password) {
            const out = await request("POST", "/auth/login", { body: { email, password }, auth: false });
            setSession(out.session);
            return out;
        },
        async signup(email, password) {
            const out = await request("POST", "/auth/signup", { body: { email, password }, auth: false });
            setSession(out.session);
            return out;
        },
        async logout() {
            try { if (session) await request("POST", "/auth/logout"); } catch (e) { /* best effort */ }
            setSession(null);
        },
        admin: {
            get signedIn() { return !!admin; },
            get email() { return admin ? admin.email : ""; },
            get seen() { return admin ? admin.seen : 0; },
            get: (path, query) => request("GET", path, { query, as: "admin" }),
            post: (path, body) => request("POST", path, { body, as: "admin" }),
            async login(email, password) {
                const out = await request("POST", "/admin/login", { body: { email, password }, auth: false });
                setAdmin({ ...out.session, email: out.user.email, seen: Date.now() });
                return out;
            },
            async logout() {
                try { if (admin) await request("POST", "/admin/logout", { as: "admin" }); } catch (e) { /* best effort */ }
                setAdmin(null);
            },
            clear() { setAdmin(null); }
        }
    };
})();

/* Small formatting helpers shared by every screen. */
const fmtDate = iso => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
function timeAgo(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "Just now";
    if (s < 3600) return Math.floor(s / 60) + " min ago";
    if (s < 86400) return Math.floor(s / 3600) + " hr ago";
    if (s < 7 * 86400) return Math.floor(s / 86400) + " d ago";
    return fmtDate(iso);
}

/* ---------- Ionic overlays ----------
   toast(message)  -> <ion-toast>, a non-blocking message (replaces alert)
   ask(message)    -> <ion-alert>, resolves true/false     (replaces confirm)
   If the Ionic script hasn't loaded (offline, blocked), they fall back to the browser's own alert/confirm,
   so a failed CDN never swallows an error message. */
const ionicReady = () => !!(window.customElements && customElements.get("ion-toast"));

function toast(message, kind = "error") {
    if (!ionicReady()) { window.alert(message); return Promise.resolve(); }
    const el = document.createElement("ion-toast");
    Object.assign(el, {
        message: String(message),               // plain text: Ionic does not render HTML in messages by default
        duration: kind === "error" ? 6000 : 3500,
        position: "bottom",
        cssClass: ["sl-toast", "sl-toast-" + kind],
        buttons: [{ text: "Dismiss", role: "cancel" }]
    });
    el.addEventListener("didDismiss", () => el.remove());
    document.body.appendChild(el);              // overlays must live directly in <body>
    return el.present();
}

function ask(message, { header = "Please confirm", confirmText = "Yes", cancelText = "Cancel" } = {}) {
    if (!ionicReady()) return Promise.resolve(window.confirm(message));
    return new Promise(resolve => {
        const el = document.createElement("ion-alert");
        Object.assign(el, {
            header, message, cssClass: "sl-alert",
            buttons: [{ text: cancelText, role: "cancel" }, { text: confirmText, role: "confirm" }]
        });
        el.addEventListener("didDismiss", e => { resolve(e.detail && e.detail.role === "confirm"); el.remove(); });   // backdrop tap = "backdrop" = no
        document.body.appendChild(el);
        el.present();
    });
}

const landingPage = document.getElementById("landingPage");
const mainPage = document.getElementById("mainPage");
const auths = document.getElementById("authModal");

const userProfilePage = document.getElementById("userProfilePage");
const serviceProviderFormPage = document.getElementById("serviceProviderFormPage");
const notificationPage = document.getElementById("notificationPage");
const notificationDetailPage = document.getElementById("notificationDetailPage");
const cartPage = document.getElementById("cartPage");
const historyPage = document.getElementById("historyPage");
const providerDashboardPage = document.getElementById("providerDashboardPage");
const providerServicesPage = document.getElementById("providerServicesPage");
const loaderPage = document.getElementById("loaderPage");
const serviceDetailPage = document.getElementById("serviceDetailPage");
const infoPage = document.getElementById("infoPage");
const requestServicePage = document.getElementById("requestServicePage");
const checkoutPage = document.getElementById("checkoutPage");
const trackingPage = document.getElementById("trackingPage");
const providerProfilePage = document.getElementById("providerProfilePage");
const reportPage = document.getElementById("reportPage");
const providerBookingsPage = document.getElementById("providerBookingsPage");

const appPages = [
    userProfilePage,
    serviceProviderFormPage,
    notificationPage,
    notificationDetailPage,
    historyPage,
    providerDashboardPage,
    providerServicesPage,
    providerBookingsPage,
    cartPage,
    loaderPage,
    serviceDetailPage,
    infoPage,
    requestServicePage,
    checkoutPage,
    trackingPage,
    providerProfilePage,
    reportPage
];

const loginButton = document.getElementById("loginButton");
const signupButton = document.getElementById("signupButton");

const loggedOutHeader = document.getElementById("loggedOutHeader");
const loggedInHeader = document.getElementById("loggedInHeader");
const userAvatar = document.getElementById("userAvatar");
const notificationButton = document.getElementById("notificationButton");
const cartButton = document.getElementById("cartButton");
const providerButton = document.getElementById("providerButton");
const logoutButton = document.getElementById("logoutButton");

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const providerRegistrationForm = document.getElementById("providerRegistrationForm");
const profileImage = document.getElementById("profileImage");
const profileImageInput = document.getElementById("profileImageInput");
const profileImageButton = document.getElementById("profileImageButton");
const profileDetails = document.getElementById("profileDetails");
const notificationListEl = document.getElementById("notificationList");

const footerLanding = document.querySelector(".footer-for-landing-page");
const footerMain = document.querySelector(".footer-for-mainpage");

const mainPageTrigger = document.getElementById("mainPageTrigger");

// Mock profile data used for the front-end demo.
const mockUserProfile = {
    name: "",
    age: 0,
    contact: "",
    email: "",
    location: "",
    bio: "",
    avatar: "https://i.pravatar.cc/240?img=12"
};
const defaultUserProfile = { ...mockUserProfile };

// Editable profile fields, rendered as grid rows (label | value | action).
const profileFields = [
    { key: "name", label: "Name", type: "text" },
    { key: "age", label: "Age", type: "number" },
    { key: "contact", label: "Contact Number", type: "tel" },
    { key: "email", label: "Email Address", type: "email" },
    { key: "location", label: "Location", type: "text" },
    // Optional: can be left empty, and does not count toward "profile complete"
    { key: "bio", label: "Bio", type: "textarea", optional: true, max: 200, placeholder: "Tell people about yourself (max 200 characters)" }
];
let editingProfileKey = null;

// Notifications come from GET /api/notifications (loadNotifications below).
const mockNotifications = [];

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
}

/* ---------- Stars (read-only display) ---------- */
const STAR_SVG = '<svg viewBox="0 0 24 24" stroke-linejoin="round" aria-hidden="true"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>';
const starsStatic = n => `<span class="stars" role="img" aria-label="${n} out of 5 stars">${[1, 2, 3, 4, 5].map(k => `<span class="star${k <= n ? " on" : ""}">${STAR_SVG}</span>`).join("")}</span>`;

/* ---------- Page switching ---------- */

function hideAllAppPages() {
    appPages.forEach(page => {
        page.classList.remove("active");
        page.style.display = "none";
    });
}

function closeAuthModal() {
    auths.classList.remove("open");
}

function hideAllContent() {
    landingPage.style.display = "none";
    mainPage.style.display = "none";
    closeAuthModal();
    hideAllAppPages();
}

function showMainPage() {
    hideAllContent();
    mainPage.style.display = "flex";

    footerLanding.style.display = "none";
    footerMain.style.display = "flex";
}

function showLandingPage() {
    hideAllContent();
    landingPage.style.display = "flex";

    footerMain.style.display = "none";
    footerLanding.style.display = "flex";

    window.scrollTo(0, 0);
}

// Auth forms open as an overlay, so the current page stays visible behind them.
function openAuthModal(showSignup) {
    loginForm.style.display = showSignup ? "none" : "flex";
    signupForm.style.display = showSignup ? "flex" : "none";
    auths.classList.add("open");
    (showSignup ? signupForm : loginForm).querySelector("input").focus();
}

function showLoginForm() { openAuthModal(false); }
function showSignupForm() { openAuthModal(true); }

function showAppPage(page) {
    hideAllContent();
    page.classList.add("active");
    page.style.display = "flex";

    footerLanding.style.display = "none";
    footerMain.style.display = "none";

    window.scrollTo(0, 0);
    lucide.createIcons();

    // Leaflet can only measure its container once it is visible
    if (page === serviceProviderFormPage) initProviderMap();
}

function showLoggedInHeader(email) {
    const firstLetter = (email || "U").trim().charAt(0).toUpperCase() || "U";

    userAvatar.textContent = firstLetter;
    userAvatar.title = email || "User";

    loggedOutHeader.style.display = "none";
    loggedInHeader.style.display = "flex";

    mockUserProfile.email = email || mockUserProfile.email;
    mockUserProfile.name =
        email && email.includes("@")
            ? email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, char => char.toUpperCase())
            : mockUserProfile.name;

    populateProfile();
    populateProviderForm();
}



/* ---------- Profile (editable rows) ---------- */

function populateProfile() {
    profileImage.src = mockUserProfile.avatar;
    document.getElementById("profileName").textContent = mockUserProfile.name;
    document.getElementById("profileEmailSummary").textContent = mockUserProfile.email;
    renderProfileDetails();
}

function renderProfileDetails() {
    profileDetails.innerHTML = profileFields.map(field => {
        const value = escapeHtml(mockUserProfile[field.key]);
        const editing = editingProfileKey === field.key;
        const limits = field.type === "number" ? ' min="1" max="120"' : "";
        const multiline = field.type === "textarea";
        const control = multiline
            ? `<textarea id="profileEditInput" rows="3" maxlength="${field.max}" placeholder="${field.placeholder}" aria-label="${field.label}">${value}</textarea>`
            : `<input id="profileEditInput" type="${field.type}" value="${value}" aria-label="${field.label}" required${limits}>`;

        return `
                    <div class="profile-row">
                        <span class="profile-label">${field.label}</span>
                        <div class="profile-value${multiline ? " is-multiline" : ""}">${editing ? control : (value || "Not set")}</div>
                        <div class="profile-actions">${editing
                ? `<button type="button" data-save aria-label="Save" title="Save"><i data-lucide="check"></i></button><button type="button" data-cancel aria-label="Cancel" title="Cancel"><i data-lucide="x"></i></button>`
                : `<button type="button" data-edit="${field.key}" aria-label="Edit ${field.label}" title="Edit"><i data-lucide="pencil"></i></button>`}</div>
                    </div>`;
    }).join("");
    lucide.createIcons();

    if (editingProfileKey) {
        const input = document.getElementById("profileEditInput");
        input.focus();
        input.select();
    }
}

async function saveProfileField() {
    const input = document.getElementById("profileEditInput");
    const field = profileFields.find(item => item.key === editingProfileKey);
    if (!input || !field || !input.reportValidity()) return;

    const value = input.value.trim();
    if (!value && !field.optional) {
        input.focus();
        return;
    }

    try {
        // The server validates again (age 1-120, bio <= 200 chars, unique email...) and answers with the saved profile.
        const out = await API.patch("/me", { [field.key]: field.type === "number" ? Number(value) : value });
        editingProfileKey = null;
        applyProfile(out.profile);
    } catch (e) {
        toast(e.message);
        input.focus();
    }
}

profileDetails.addEventListener("click", function (event) {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.dataset.edit) {
        editingProfileKey = button.dataset.edit;
        renderProfileDetails();
    } else if ("save" in button.dataset) {
        saveProfileField();
    } else if ("cancel" in button.dataset) {
        editingProfileKey = null;
        renderProfileDetails();
    }
});

profileDetails.addEventListener("keydown", function (event) {
    if (event.target.id !== "profileEditInput") return;

    // Enter saves; in the bio box, Shift+Enter starts a new line
    if (event.key === "Enter" && !(event.shiftKey && event.target.tagName === "TEXTAREA")) {
        event.preventDefault();
        saveProfileField();
    } else if (event.key === "Escape") {
        editingProfileKey = null;
        renderProfileDetails();
    }
});

function populateProviderForm() {
    document.getElementById("providerName").value = mockUserProfile.name;
    document.getElementById("providerEmail").value = mockUserProfile.email;
    document.getElementById("providerContact").value = mockUserProfile.contact || "";
}

/* ---------- Provider location map (Leaflet + OpenStreetMap Nominatim) ----------
   Two directions, one marker:
     map -> inputs : click / drag pin / "Use my location"  -> reverse geocode -> fill inputs
     inputs -> map : type in an input (debounced)           -> forward geocode -> fly + mark
   Setting input.value in code does NOT fire an "input" event, so filling the inputs
   from the map can never trigger the inputs -> map direction (no feedback loop). */
const MAP_COUNTRY = "ph";                       // limit searches to one country ("" = worldwide)
const MAP_DEFAULT = { lat: 7.0644, lng: 125.6079, zoom: 12 };   // Davao City
const NOMINATIM = "https://nominatim.openstreetmap.org";

const providerAddressEl = document.getElementById("providerAddress");
const providerCityEl = document.getElementById("providerCity");
const providerProvinceEl = document.getElementById("providerProvince");
const mapStatusEl = document.getElementById("providerMapStatus");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let pinIcon = null, providerMap = null, providerMarker = null, mapAbort = null, typingTimer = null;
let providerCoords = null;                      // { lat, lng } of the pin, ready for submit/saving


function setMapStatus(text, isError) {
    mapStatusEl.textContent = text;
    mapStatusEl.classList.toggle("error", !!isError);
}

function initProviderMap() {
    if (providerMap) {                          // already built: just re-measure after being hidden
        providerMap.invalidateSize();
        return;
    }

    // Leaflet comes from a CDN: if it failed to load, say so instead of breaking the page
    if (typeof L === "undefined") {
        setMapStatus("The map could not load. Check your connection; you can still type your address.", true);
        return;
    }

    pinIcon = L.divIcon({
        className: "map-pin",
        html: '<svg viewBox="0 0 24 32" width="30" height="40" aria-hidden="true">' +
            '<path d="M12 .75C5.8.75.75 5.7.75 11.8.75 20 12 31.25 12 31.25S23.25 20 23.25 11.8C23.25 5.7 18.2.75 12 .75z"/>' +
            '<circle cx="12" cy="11.8" r="4.4"/></svg>',
        iconSize: [30, 40],
        iconAnchor: [15, 40]
    });

    providerMap = L.map("providerMap").setView([MAP_DEFAULT.lat, MAP_DEFAULT.lng], MAP_DEFAULT.zoom);

    // OpenStreetMap's tile servers refuse requests that arrive without a Referer header, so the tiles must
    // send one even if the page itself is served with Referrer-Policy: no-referrer.
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        referrerPolicy: "strict-origin-when-cross-origin",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(providerMap);

    // If the tiles are refused or the connection drops, say so once instead of showing a silent grey box.
    let tileFailed = false;
    tiles.on("tileerror", () => {
        if (tileFailed) return;
        tileFailed = true;
        setMapStatus("Map tiles could not load. You can still type your address.", true);
    });

    // MAP -> INPUTS: click anywhere
    providerMap.on("click", event => {
        placeMarker(event.latlng);
        fillInputsFromMap(event.latlng);
    });
}

function placeMarker(latlng) {
    providerCoords = { lat: latlng.lat, lng: latlng.lng };

    if (providerMarker) {
        providerMarker.setLatLng(latlng);
        return;
    }
    providerMarker = L.marker(latlng, { icon: pinIcon, draggable: true, keyboard: false }).addTo(providerMap);

    // MAP -> INPUTS: drag the pin
    providerMarker.on("dragend", () => {
        const latlng = providerMarker.getLatLng();
        providerCoords = { lat: latlng.lat, lng: latlng.lng };
        fillInputsFromMap(latlng);
    });
}

// Only one lookup is allowed to be "live": starting a new one cancels the previous one,
// so a slow old response can never overwrite a newer choice.
function newLookup() {
    if (mapAbort) mapAbort.abort();
    mapAbort = new AbortController();
    return mapAbort.signal;
}

async function nominatim(path, params, signal) {
    const query = new URLSearchParams({ format: "jsonv2", "accept-language": "en", ...params });
    // Nominatim, like the tile servers, wants to know which site is calling (the Referer header).
    const response = await fetch(`${NOMINATIM}/${path}?${query}`, { signal, referrerPolicy: "strict-origin-when-cross-origin" });
    if (!response.ok) throw new Error("Lookup failed (" + response.status + ")");
    return response.json();
}

/* ----- MAP -> INPUTS ----- */
async function fillInputsFromMap(latlng) {
    const signal = newLookup();
    setMapStatus("Finding address…");

    try {
        const result = await nominatim("reverse", {
            lat: latlng.lat, lon: latlng.lng, zoom: 18, addressdetails: 1
        }, signal);

        if (result.error || !result.address) {
            setMapStatus("No address found here. Pin saved; fill in the fields manually.", true);
            return;
        }

        const a = result.address;
        // OSM tags differ by place, so take the first one that exists.
        // In the Philippines "barangay" usually arrives as suburb / quarter / village.
        const barangay = a.suburb || a.quarter || a.neighbourhood || a.village || a.hamlet || "";
        const street = [a.house_number, a.road].filter(Boolean).join(" ");

        providerAddressEl.value = [street, barangay].filter(Boolean).join(", ");
        providerCityEl.value = a.city || a.town || a.municipality || a.city_district || "";
        providerProvinceEl.value = a.province || a.state || a.county || a.region || "";

        setMapStatus("Location set from the map.");
    } catch (error) {
        if (error.name === "AbortError") return;        // replaced by a newer lookup
        setMapStatus("Could not look up that address. Check your connection and try again.", true);
    }
}

/* ----- INPUTS -> MAP ----- */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function searchFromInputs() {
    const address = providerAddressEl.value.trim();
    const city = providerCityEl.value.trim();
    const province = providerProvinceEl.value.trim();
    if (!(address || city || province)) return;

    // Street-level text often has no match, so retry with less detail
    // (street + city + province -> city + province -> province).
    const attempts = [
        [address, city, province],
        [city, province],
        [province]
    ].map(parts => parts.filter(Boolean).join(", "))
        .filter((text, i, all) => text && all.indexOf(text) === i);

    const signal = newLookup();
    setMapStatus("Searching…");

    try {
        for (let i = 0; i < attempts.length; i++) {
            if (i > 0) await sleep(1100);               // Nominatim allows ~1 request per second
            if (signal.aborted) return;

            const params = { q: attempts[i], limit: 1 };
            if (MAP_COUNTRY) params.countrycodes = MAP_COUNTRY;
            const results = await nominatim("search", params, signal);

            if (results.length) {
                showSearchResult(results[0], i > 0);
                return;
            }
        }
        setMapStatus("Couldn't find that place on the map. Try a nearby landmark or check the spelling.", true);
    } catch (error) {
        if (error.name === "AbortError") return;
        setMapStatus("Search failed. Check your connection and try again.", true);
    }
}

function showSearchResult(result, wasApproximate) {
    const latlng = L.latLng(parseFloat(result.lat), parseFloat(result.lon));
    placeMarker(latlng);

    // boundingbox = [south, north, west, east] as strings: a street zooms in close, a province zooms out
    const [south, north, west, east] = result.boundingbox.map(Number);
    const bounds = [[south, west], [north, east]];

    if (reduceMotion) {
        providerMap.fitBounds(bounds, { maxZoom: 17, animate: false });
    } else {
        providerMap.flyToBounds(bounds, { maxZoom: 17, padding: [24, 24], duration: 1.6 });
    }

    setMapStatus(wasApproximate
        ? "Exact address not found; showing the nearest area. Drag the pin to adjust."
        : "Location found. Drag the pin to fine-tune it.");
}

// Debounce: wait until the user pauses typing before calling the geocoder
[providerAddressEl, providerCityEl, providerProvinceEl].forEach(input => {
    input.addEventListener("input", () => {
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            initProviderMap();
            if (providerMap) searchFromInputs();
        }, 900);
    });
});

/* ----- "Use my location" ----- */
document.getElementById("providerLocateBtn").addEventListener("click", () => {
    if (!navigator.geolocation) {
        setMapStatus("Your browser does not support location.", true);
        return;
    }
    initProviderMap();
    if (!providerMap) return;
    setMapStatus("Waiting for your location…");

    navigator.geolocation.getCurrentPosition(position => {
        const latlng = L.latLng(position.coords.latitude, position.coords.longitude);
        placeMarker(latlng);
        if (reduceMotion) providerMap.setView(latlng, 17, { animate: false });
        else providerMap.flyTo(latlng, 17, { duration: 1.6 });
        fillInputsFromMap(latlng);
    }, error => {
        setMapStatus(error.code === error.PERMISSION_DENIED
            ? "Location permission was blocked. Allow it in your browser, or click the map instead."
            : "Couldn't get your location. Click the map instead.", true);
    }, { enableHighAccuracy: true, timeout: 10000 });
});

// Form reset (e.g. on log out): drop the pin and go back to the default view
providerRegistrationForm.addEventListener("reset", () => {
    clearTimeout(typingTimer);
    if (mapAbort) mapAbort.abort();
    if (providerMarker) { providerMarker.remove(); providerMarker = null; }
    providerCoords = null;
    if (providerMap) providerMap.setView([MAP_DEFAULT.lat, MAP_DEFAULT.lng], MAP_DEFAULT.zoom, { animate: false });
    setMapStatus("Click the map, drag the pin, or type an address above.");
});

/* ---------- Notifications ---------- */

const DOTS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';
let openNotifMenu = null;   // index of the notification whose "..." menu is open

function renderNotifications() {
    if (!mockNotifications.length) {
        notificationListEl.innerHTML = '<p class="dash-sub notification-empty">You have no notifications.</p>';
        return;
    }

    notificationListEl.innerHTML = mockNotifications.map((notification, index) => {
        const menuOpen = openNotifMenu === index;
        const title = escapeHtml(notification.title);
        return `
                <article class="notification-item ${notification.unread ? "notification-unread" : ""} ${menuOpen ? "menu-open" : ""}"
                    role="button" tabindex="0" data-index="${index}"
                    aria-label="Open notification: ${title}">
                    <div class="notification-icon" aria-hidden="true">
                        <i data-lucide="${notification.icon}"></i>
                    </div>
                    <div class="notification-content">
                        <h3>${title}</h3>
                        <p>${escapeHtml(notification.message)}</p>
                    </div>
                    <div class="notification-side">
                        <time class="notification-time">${escapeHtml(notification.time)}</time>
                        <div class="notif-more-wrap">
                            <button type="button" class="notif-more" data-notif-more="${index}"
                                aria-label="More options for ${title}" aria-haspopup="menu" aria-expanded="${menuOpen}">${DOTS_ICON}</button>
                            ${menuOpen ? `
                            <div class="notif-menu" role="menu">
                                <button type="button" role="menuitem" data-notif-act="${notification.unread ? "read" : "unread"}" data-index="${index}">${notification.unread ? "Mark as read" : "Mark as unread"}</button>
                                <button type="button" role="menuitem" class="danger" data-notif-act="delete" data-index="${index}">Delete</button>
                            </div>` : ""}
                        </div>
                    </div>
                </article>`;
    }).join("");

    lucide.createIcons();

    // Flip the menu upwards when it would run off the bottom of the screen
    const menu = notificationListEl.querySelector(".notif-menu");
    if (menu && menu.getBoundingClientRect().bottom > window.innerHeight - 8) menu.classList.add("up");
}

async function loadNotifications() {
    if (!API.signedIn) return;
    try {
        const out = await API.get("/notifications");
        const items = (out.items || []).map(n => ({
            id: n.id, title: n.title, message: n.message, icon: n.icon || "bell", unread: !!n.unread, time: timeAgo(n.createdAt)
        }));
        mockNotifications.splice(0, mockNotifications.length, ...items);
        if (notificationPage.classList.contains("active") && openNotifMenu === null) renderNotifications();
        syncBell();
    } catch (e) { /* keep what is on screen */ }
}

function focusNotifMore(index) {
    const target = notificationListEl.querySelector(`[data-notif-more="${index}"]`);
    if (target) target.focus();
}

function closeNotifMenu(restoreFocus) {
    if (openNotifMenu === null) return;
    const index = openNotifMenu;
    openNotifMenu = null;
    renderNotifications();
    if (restoreFocus) focusNotifMore(index);
}

function openNotification(index) {
    const notification = mockNotifications[index];
    if (!notification) return;

    openNotifMenu = null;
    if (notification.unread && notification.id) API.patch("/notifications/" + notification.id, { unread: false }).catch(() => { });
    notification.unread = false;
    document.getElementById("notificationDetailTitle").textContent = notification.title;
    document.getElementById("notificationDetailTime").textContent = notification.time;
    document.getElementById("notificationDetailMessage").textContent = notification.message;

    showAppPage(notificationDetailPage);
}

notificationListEl.addEventListener("click", function (event) {
    // "..." button: open / close this notification's menu
    const more = event.target.closest("[data-notif-more]");
    if (more) {
        event.stopPropagation();
        const index = Number(more.dataset.notifMore);
        openNotifMenu = openNotifMenu === index ? null : index;
        renderNotifications();
        const first = notificationListEl.querySelector(".notif-menu button");
        if (first) first.focus(); else focusNotifMore(index);
        return;
    }

    // Menu item: mark as read / unread, or delete
    const act = event.target.closest("[data-notif-act]");
    if (act) {
        const index = Number(act.dataset.index);
        const target = mockNotifications[index];
        if (target && target.id) {                                  // optimistic: the list updates now, the server catches up
            if (act.dataset.notifAct === "delete") API.del("/notifications/" + target.id).catch(() => loadNotifications());
            else API.patch("/notifications/" + target.id, { unread: act.dataset.notifAct === "unread" }).catch(() => loadNotifications());
        }
        if (act.dataset.notifAct === "delete") mockNotifications.splice(index, 1);
        else if (target) target.unread = act.dataset.notifAct === "unread";

        openNotifMenu = null;
        renderNotifications();
        syncBell();
        focusNotifMore(Math.min(index, mockNotifications.length - 1));
        return;
    }

    if (event.target.closest(".notif-menu")) return;

    const item = event.target.closest(".notification-item");
    if (item) openNotification(Number(item.dataset.index));
});

notificationListEl.addEventListener("keydown", function (event) {
    if (openNotifMenu !== null) {
        if (event.key === "Escape") { event.preventDefault(); closeNotifMenu(true); return; }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            const items = Array.from(notificationListEl.querySelectorAll(".notif-menu button"));
            const at = items.indexOf(document.activeElement);
            if (at !== -1) {
                event.preventDefault();
                items[(at + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
            }
            return;
        }
    }

    if (event.key !== "Enter" && event.key !== " ") return;
    // Buttons inside the row (the "..." button and its menu) handle their own keys
    if (event.target.closest(".notification-side")) return;
    const item = event.target.closest(".notification-item");
    if (!item) return;

    event.preventDefault();
    openNotification(Number(item.dataset.index));
});

// Click anywhere outside an open menu closes it
document.addEventListener("click", function (event) {
    if (openNotifMenu !== null && !event.target.closest(".notif-more-wrap")) closeNotifMenu(false);
});

document.getElementById("notificationDetailBack").addEventListener("click", function () {
    renderNotifications();
    showAppPage(notificationPage);
});

/* ---------- History ---------- */

// The person's bookings come from GET /api/bookings. This array is the in-page cache of them.
const mockHistory = [];

const toHistory = b => ({
    id: b.id, ref: b.ref, serviceId: b.serviceId, service: b.service, category: b.category,
    providerId: b.providerId, provider: b.provider, date: fmtDate(b.createdAt), status: b.status,
    location: b.location, when: b.when, destination: b.destination || null,
    rated: Number(b.rated) || 0, reviewed: !!b.reviewed, reported: !!b.reported, report: b.report || null,
    payment: b.payment ? { ...b.payment, subtotal: Number(b.payment.subtotal), fee: Number(b.payment.fee), total: Number(b.payment.total) } : null,
    track: b.status === "Ongoing" ? {} : null               // a truthy track shows the "Track provider" button
});

async function loadHistory() {
    if (!API.signedIn) return;
    try {
        const out = await API.get("/bookings");
        mockHistory.splice(0, mockHistory.length, ...(out.items || []).map(toHistory));
        hiredIds.clear();
        mockHistory.forEach(h => { if (h.status !== "Cancelled" && h.serviceId) hiredIds.add(h.serviceId); });
        if (historyPage.classList.contains("active")) renderHistory();
    } catch (e) { /* keep what is on screen */ }
}

function renderHistory() {
    document.getElementById("historyList").innerHTML = mockHistory.map((item, i) => {
        const btn = (act, label) => `<button type="button" class="dash-button" data-act="${act}" data-i="${i}">${label}</button>`;
        let actions = "";

        if (item.status === "Ongoing") {
            actions = (item.track ? btn("track", "Track provider") : "") + btn("finish", "Mark as finished") + btn("cancel", "Cancel booking");
        } else if (item.status === "Completed") {
            const rate = item.rated
                ? `<span class="rated-note">${starsStatic(item.rated)}</span>`
                + (item.reviewed ? `<span class="service-meta">Reviewed</span>` : item.serviceId ? btn("write-review", "Write a review") : "")
                : btn("rate", "Rate");
            const report = item.reported ? `<span class="service-meta">Reported</span>` : btn("report", "Report");
            actions = rate + report;
        }
        if (item.payment) actions = `<span class="pay-chip" data-state="${item.payment.status}">${escapeHtml(paymentText(item.payment))}</span>` + actions;

        return `
                <article class="history-item">
                    <h3>${escapeHtml(item.service)}</h3>
                    <p>${providerLink(item.provider, item.providerId)}</p>
                    <time class="history-date">${escapeHtml(item.date)}</time>
                    <span class="history-status" data-status="${escapeHtml(item.status).toLowerCase()}">${escapeHtml(item.status)}</span>
                    ${actions ? `<div class="history-actions">${actions}</div>` : ""}
                </article>`;
    }).join("") || '<p class="dash-sub">No bookings yet.</p>';
}

document.getElementById("historyList").addEventListener("click", function (event) {
    const button = event.target.closest("button");
    if (!button) return;

    const item = mockHistory[button.dataset.i];
    const act = button.dataset.act;

    // Rating happens in a pop-up: pick the stars first, then the review step appears
    if (act === "rate" || act === "write-review") {
        return openRateModal(item, act === "rate" ? "stars" : "review", button);
    }
    if (act === "track") return openTracking(item);
    if (act === "report") return openReport(item, button);
    if (act === "finish") return finishBooking(item);
    if (act === "cancel") return cancelBooking(item);
    renderHistory();
});

document.getElementById("profileHistoryButton").addEventListener("click", function () {
    renderHistory();
    showAppPage(historyPage);
    loadHistory();
});

document.getElementById("historyBack").addEventListener("click", function () {
    editingProfileKey = null;
    populateProfile();
    showAppPage(userProfilePage);
});

/* ---------- Report page ---------- */

const reportForm = document.getElementById("reportForm");
const reportDetails = document.getElementById("reportDetails");
const reportCount = document.getElementById("reportCount");
const reportConfirm = document.getElementById("reportConfirm");
const reportError = document.getElementById("reportError");
const reportDone = document.getElementById("reportDone");
const reportPicker = makeImagePicker(reportForm);
const REPORT_MIN_CHARS = 20;
let reportItem = null;     // the history entry being reported
let reportOpener = null;   // the button that opened the page (focus returns there)

function showReportError(message, target) {
    reportError.textContent = message;
    reportError.hidden = false;
    if (target) target.focus();
}

function openReport(item, opener) {
    reportItem = item;
    reportOpener = opener || null;
    reportForm.reset();
    reportPicker.clear();
    reportCount.textContent = "0 / " + reportDetails.maxLength;
    reportError.hidden = true;
    reportForm.hidden = false;
    reportDone.hidden = true;
    document.getElementById("reportSub").textContent = `${item.service} with ${item.provider}, ${item.date}`;
    showAppPage(reportPage);
    reportForm.querySelector("input[name=reportReason]").focus({ preventScroll: true });
}

function closeReport() {
    reportPicker.clear();
    reportItem = null;
    renderHistory();
    showAppPage(historyPage);
    const opener = reportOpener;
    reportOpener = null;
    const again = opener && document.querySelector(`#historyList [data-i="${opener.dataset.i}"]`);
    if (again) again.focus();
}

reportDetails.addEventListener("input", function () {
    reportCount.textContent = reportDetails.value.length + " / " + reportDetails.maxLength;
    reportError.hidden = true;
});
reportForm.addEventListener("change", () => { reportError.hidden = true; });

reportForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const item = reportItem;
    if (!item) return;

    const reason = reportForm.querySelector("input[name=reportReason]:checked");
    const details = reportDetails.value.trim();

    if (!reason) return showReportError("Choose what went wrong.", reportForm.querySelector("input[name=reportReason]"));
    if (details.length < REPORT_MIN_CHARS) return showReportError(`Describe what happened in at least ${REPORT_MIN_CHARS} characters.`, reportDetails);
    if (!reportPicker.count()) return showReportError("Add at least one photo or screenshot as evidence.", reportForm.querySelector("[data-attach-btn]"));
    if (!reportConfirm.checked) return showReportError("Confirm that your report is true.", reportConfirm);

    const submit = reportForm.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
        // Two steps: the photos go to private storage first, then the report refers to them by path.
        const form = new FormData();
        reportPicker.files().forEach(file => form.append("images", file));
        const up = await API.post("/uploads/evidence", form);
        await API.post(`/bookings/${item.id}/report`, { reason: reason.value, details, evidence: up.paths });
        item.reported = true;
        loadHistory();
        loadNotifications();
    } catch (e) {
        if (submit) submit.disabled = false;
        return showReportError(e.message);
    }
    if (submit) submit.disabled = false;

    document.getElementById("reportDoneText").textContent = `Thank you. We will review your report about ${item.provider} and let you know the outcome in your notifications.`;
    reportError.hidden = true;
    reportForm.hidden = true;
    reportDone.hidden = false;
    window.scrollTo(0, 0);
    document.getElementById("reportDoneTitle").focus();
});

document.getElementById("reportBack").addEventListener("click", closeReport);
document.getElementById("reportCancel").addEventListener("click", closeReport);
document.getElementById("reportDoneBack").addEventListener("click", closeReport);

/* ---------- Image attachments (review forms) ---------- */

// Wires up one ".attach" block inside `root`. Images stay in the browser (object URLs) in this demo.
function makeImagePicker(root) {
    const input = root.querySelector("input[type=file]");
    const list = root.querySelector(".attach-previews");
    const note = root.querySelector(".attach-note");
    const MAX_FILES = 4, MAX_MB = 5;
    let items = [];

    function render() {
        list.innerHTML = items.map((entry, i) => `
                    <li><img src="${entry.url}" alt="Attached image ${i + 1}"><button type="button" data-attach-remove="${i}" aria-label="Remove image ${i + 1}">&times;</button></li>`).join("");
        list.hidden = !items.length;
    }

    root.querySelector("[data-attach-btn]").addEventListener("click", () => input.click());

    input.addEventListener("change", function () {
        let message = "";
        Array.from(input.files).forEach(file => {
            if (!file.type.startsWith("image/")) message = "Only image files can be attached.";
            else if (file.size > MAX_MB * 1048576) message = `Each image must be under ${MAX_MB} MB.`;
            else if (items.length >= MAX_FILES) message = `You can attach up to ${MAX_FILES} images.`;
            else items.push({ url: URL.createObjectURL(file), file });
        });
        note.textContent = message;
        input.value = "";   // lets the same file be chosen again after removing it
        render();
    });

    list.addEventListener("click", function (event) {
        const remove = event.target.closest("[data-attach-remove]");
        if (!remove) return;
        const [gone] = items.splice(Number(remove.dataset.attachRemove), 1);
        URL.revokeObjectURL(gone.url);
        note.textContent = "";
        render();
    });

    return {
        count() { return items.length; },
        files() { return items.map(entry => entry.file); },   // the real File objects, for uploading
        // hand the images over to a posted review (they must stay alive, so no revoke)
        take() { const urls = items.map(entry => entry.url); items = []; note.textContent = ""; render(); return urls; },
        clear() { items.forEach(entry => URL.revokeObjectURL(entry.url)); items = []; note.textContent = ""; render(); }
    };
}

const attachHtml = `<div class="attach">
                        <button type="button" class="dash-button attach-btn" data-attach-btn><i data-lucide="image-plus"></i> Attach images</button>
                        <input type="file" accept="image/*" multiple hidden aria-label="Choose images to attach">
                        <p class="service-meta attach-note" aria-live="polite"></p>
                        <ul class="attach-previews" hidden></ul>
                    </div>`;

// Photos are uploaded first (POST /uploads/review -> public URLs), then the review refers to those URLs.
// target is { bookingId } from History, or { serviceId } from the service page.
async function submitReview(target, text, picker) {
    let images = [];
    const files = picker ? picker.files() : [];
    if (files.length) {
        const form = new FormData();
        files.forEach(file => form.append("images", file));
        images = (await API.post("/uploads/review", form)).urls;
    }
    const path = target.bookingId ? `/bookings/${target.bookingId}/review` : `/services/${target.serviceId}/reviews`;
    await API.post(path, { text, images });
    if (picker) picker.clear();
    loadHistory();
    loadNotifications();
}

/* ---------- Rating pop-up ---------- */

const rateModal = document.getElementById("rateModal");
const rateStarsStep = document.getElementById("rateStarsStep");
const rateReviewForm = document.getElementById("rateReviewForm");
const rateStarsGroup = document.getElementById("rateStars");
const rateStarButtons = Array.from(rateStarsGroup.querySelectorAll("[data-rate-star]"));
const ratePicker = makeImagePicker(rateReviewForm);
let rateItem = null;       // the history entry being rated
let rateOpener = null;     // the button that opened the pop-up (focus returns there)
let rateBusy = false;      // true for a moment after a star is chosen

function paintRateStars(n) {
    rateStarButtons.forEach((star, k) => star.classList.toggle("on", k < n));
}

function showRateStep(step) {
    rateStarsStep.hidden = step !== "stars";
    rateReviewForm.hidden = step !== "review";
    if (step === "stars") {
        paintRateStars(0);
        rateStarButtons[0].focus();
    } else {
        document.getElementById("rateDone").innerHTML = `You rated ${escapeHtml(rateItem.service)} ${starsStatic(rateItem.rated)}`;
        document.getElementById("rateReviewText").focus();
    }
}

function openRateModal(item, stage, opener) {
    rateItem = item;
    rateOpener = opener || null;
    rateBusy = false;
    rateReviewForm.reset();
    ratePicker.clear();
    document.getElementById("rateSub").textContent = `${item.service} with ${item.provider}`;
    rateModal.classList.add("open");
    showRateStep(stage === "review" && item.rated ? "review" : "stars");
}

function closeRateModal() {
    if (!rateModal.classList.contains("open")) return;
    rateModal.classList.remove("open");
    ratePicker.clear();
    const opener = rateOpener;
    rateItem = null; rateOpener = null; rateBusy = false;
    renderHistory();
    const again = opener && document.querySelector(`#historyList [data-i="${opener.dataset.i}"]`);
    if (again) again.focus();
}

rateStarButtons.forEach((star, k) => {
    star.addEventListener("mouseenter", () => { if (!rateBusy) paintRateStars(k + 1); });
    star.addEventListener("click", async function () {
        if (!rateItem || rateBusy) return;
        rateBusy = true;
        paintRateStars(k + 1);
        try {
            await API.post(`/bookings/${rateItem.id}/rating`, { stars: k + 1 });   // saved the moment a star is chosen
            if (rateItem) rateItem.rated = k + 1;
        } catch (e) {
            toast(e.message);
            rateBusy = false;
            paintRateStars(0);
            return;
        }
        setTimeout(function () {          // a short beat so the filled stars are seen
            if (!rateItem) return;
            rateBusy = false;
            if (rateItem.reviewed || !rateItem.serviceId) closeRateModal();
            else showRateStep("review");
        }, 450);
    });
});

rateStarsGroup.addEventListener("mouseleave", () => { if (!rateBusy) paintRateStars(0); });
rateStarsGroup.addEventListener("keydown", function (event) {
    const at = rateStarButtons.indexOf(document.activeElement);
    if (at === -1 || rateBusy) return;
    const step = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const to = (at + step + 5) % 5;
    rateStarButtons[to].focus();
    paintRateStars(to + 1);
});

rateModal.addEventListener("click", function (event) {
    if (event.target === rateModal || event.target.closest("[data-rate-close]")) closeRateModal();
});

rateModal.addEventListener("keydown", function (event) {
    if (event.key === "Escape") { event.stopPropagation(); closeRateModal(); return; }
    if (event.key !== "Tab") return;
    // keep Tab inside the pop-up
    const focusable = Array.from(rateModal.querySelectorAll("button, textarea")).filter(el => !el.disabled && el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

rateReviewForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const field = document.getElementById("rateReviewText");
    if (!rateItem || !field.value.trim()) { field.focus(); return; }
    const submit = rateReviewForm.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
        await submitReview({ bookingId: rateItem.id }, field.value.trim(), ratePicker);
        if (rateItem) rateItem.reviewed = true;
        closeRateModal();
    } catch (e) {
        toast(e.message);
    } finally {
        if (submit) submit.disabled = false;
    }
});

/* ---------- Provider dashboard ---------- */

const serviceCategories = ["Home & Repair", "Technology", "Automotive", "Cleaning", "Beauty & Wellness",
    "Education", "Creative", "Construction", "Delivery & Moving", "Professional Services"];

// The provider's services come from GET /api/provider/dashboard (loadProviderDashboard below).
const defaultProviderServices = [];
const cloneServices = () => defaultProviderServices.map(item => ({ ...item, skills: [...item.skills] }));

let providerServices = cloneServices();
let providerData = { salary: 0, rating: 0, reviews: 0, demand: [] };   // the rest of the dashboard payload
let isProvider = false;
let providerName = "";
let editingServiceId = null;   // null while adding a new service
let deletingServiceId = null;

const serviceEditor = document.getElementById("serviceEditor");
const serviceList = document.getElementById("serviceList");

document.getElementById("serviceCategory").innerHTML =
    '<option value="">Select category</option>' +
    serviceCategories.map(category => `<option>${escapeHtml(category)}</option>`).join("");

function renderRate() {
    const reviews = providerData.reviews, rating = Number(providerData.rating);

    document.getElementById("dashRate").textContent = reviews ? rating.toFixed(1) : "None";
    document.getElementById("dashRateSub").textContent = reviews
        ? `out of 5, from ${reviews} reviews`
        : "Ratings appear after your first review.";
}

/* ---------- In-demand: what customers asked for through "Request a Service" ----------
   The server groups the requests (case- and spacing-insensitively) and ranks them: GET /api/provider/dashboard -> demand. */
function renderDemand() {
    const ranked = providerData.demand || [];
    const max = ranked.length ? ranked[0].count : 1;

    document.getElementById("dashDemand").innerHTML = ranked.length ? ranked.map(item => {
        const details = [item.category, item.avgBudget ? `avg budget ${peso(item.avgBudget)}` : ""].filter(Boolean).join(" \u00b7 ");

        return `
                <div class="demand-item">
                    <div class="demand-row">
                        <span>${escapeHtml(item.name.charAt(0).toUpperCase() + item.name.slice(1))}</span>
                        <span>${item.count} ${item.count === 1 ? "request" : "requests"}</span>
                    </div>
                    <div class="demand-bar"><span style="width:${Math.round(item.count / max * 100)}%"></span></div>
                    ${details ? `<p>${escapeHtml(details)}</p>` : ""}
                </div>`;
    }).join("") : '<p class="dash-sub">No customer requests yet.</p>';
}

function renderServices() {
    serviceList.innerHTML = providerServices.length ? providerServices.map(item => {
        const confirming = deletingServiceId === item.id;

        return `
                    <article class="service-item" data-open-service="${item.id}" tabindex="0" role="link" aria-label="View details and reviews for ${escapeHtml(item.name)}">
                        <div class="service-main">
                            <div class="service-head">
                                <h3>${escapeHtml(item.name)}</h3>
                                <span class="service-price-tag">\u20b1${Number(item.price).toLocaleString("en-PH")} <small>${escapeHtml(item.unit)}</small></span>
                            </div>
                            <p class="service-category">${escapeHtml(item.category)}${item.status === "removed" ? " · Removed by an administrator" : ""}</p>
                            <p class="service-desc">${escapeHtml(item.description)}</p>
                            ${item.skills.length ? `<ul class="skill-chips" aria-label="Skills">${item.skills.map(skill => `<li>${escapeHtml(skill)}</li>`).join("")}</ul>` : ""}
                            <dl class="service-stats">
                                <div><dt>Rating</dt><dd>${item.reviews ? `${item.rating.toFixed(1)} <small>(${item.reviews})</small>` : "None yet"}</dd></div>
                                <div><dt>Hired</dt><dd>${item.hired ? `${item.hired} ${item.hired === 1 ? "time" : "times"}` : "Not yet"}</dd></div>
                                <div><dt>Earned</dt><dd>\u20b1${item.earned.toLocaleString("en-PH")}</dd></div>
                            </dl>
                        </div>
                        <div class="service-actions">${confirming
                ? `<span>Delete this service?</span>
                               <button type="button" class="dash-button" data-confirm-delete="${item.id}">Yes, delete</button>
                               <button type="button" class="dash-button" data-cancel-delete>Keep</button>`
                : `<button type="button" class="dash-button" data-edit-service="${item.id}">Edit</button>
                               <button type="button" class="dash-button" data-delete-service="${item.id}">Delete</button>`}</div>
                    </article>`;
    }).join("") : '<p class="dash-sub">No services yet. Add your first service.</p>';
}

/* ---------- Skill-based recommendations: POST /api/provider/recommendations ----------
   The server asks Gemini (or falls back to a rule-based matcher), anchors prices to what other providers charge,
   and adds the real number of customer requests. Answer: { source, note?, groups: [{ skill, items }] }. */
let recGroups = [], recNote = "", recBusy = false;

function renderRecs() {
    const el = document.getElementById("dashRecs");
    if (recBusy) { el.innerHTML = '<p class="dash-sub sl-loading" role="status"><ion-spinner name="dots" aria-hidden="true"></ion-spinner>Finding services that fit your skills\u2026</p>'; return; }
    const note = recNote ? `<p class="dash-sub">${escapeHtml(recNote)}</p>` : "";
    el.innerHTML = note + (recGroups.length ? recGroups.map(group => {
        return `<section class="rec-group"><h3>${escapeHtml(group.skill)}</h3>` + (group.items.length ? `<div class="rec-list">${group.items.map(r => `
                    <article class="rec-item">
                        <div class="rec-top"><h3>${escapeHtml(r.name)}</h3><span class="rec-match">${escapeHtml(r.category)}</span></div>
                        <p>${escapeHtml(r.description)}</p>
                        <p class="service-meta">${r.demand ? `${r.demand} customer requests this month.` : "No customer requests this month yet."}</p>
                        <div class="rec-actions"><button type="button" class="dash-button" data-rec-add="${escapeHtml(r.id)}">Add this service</button></div>
                    </article>`).join("")}</div>`
            : `<p class="dash-sub">No services match this skill yet. Try a more specific skill.</p>`) + `</section>`;
    }).join("") : `<p class="dash-sub">Add your skills above to see services that fit each one.</p>`);
}

document.getElementById("recForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    const seen = new Set();
    const skills = document.getElementById("recSkills").value.split(/[,\n]/).map(s => s.trim()).filter(s => {
        const k = s.toLowerCase();
        if (!s || seen.has(k)) return false;
        seen.add(k); return true;
    }).slice(0, 8);

    const submit = this.querySelector('[type="submit"]');
    submit.disabled = true;
    recBusy = true; renderRecs();
    try {
        const out = await API.post("/provider/recommendations", { skills });
        recGroups = out.groups || [];
        recNote = out.note || "";
    } catch (e) {
        recGroups = []; recNote = e.message;
    }
    recBusy = false; renderRecs();
    submit.disabled = false;
});

document.getElementById("dashRecs").addEventListener("click", function (event) {
    const b = event.target.closest("button");
    if (!b || !b.dataset.recAdd) return;
    const r = recGroups.flatMap(g => g.items).find(item => item.id === b.dataset.recAdd);
    if (!r) return;
    // Pre-fill the existing editor so the provider reviews everything before saving.
    openServicesPage();
    openServiceEditor();
    document.getElementById("serviceName").value = r.name;
    document.getElementById("serviceCategory").value = r.category;
    document.getElementById("servicePrice").value = "";     // prices are the provider's own decision, not a suggestion
    document.getElementById("serviceUnit").value = r.unit;
    document.getElementById("serviceSkills").value = (r.skills || []).join(", ");
    document.getElementById("serviceDescription").value = r.description;
    serviceEditor.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("servicePrice").focus({ preventScroll: true });   // the one thing left to fill in
});

function renderDashboard() {
    document.getElementById("dashProvider").textContent =
        `Managing services as ${providerName || mockUserProfile.name}.`;
    document.getElementById("dashSalary").textContent = peso(providerData.salary);
    renderRate();
    renderDemand();
    renderRecs();
    renderServicesOverview();
    renderServices();
}

function renderServicesOverview() {
    const count = providerServices.length;
    const hires = providerServices.reduce((sum, item) => sum + item.hired, 0);
    const summary = count
        ? `${count} ${count === 1 ? "service" : "services"} listed, hired ${hires} ${hires === 1 ? "time" : "times"} in total.`
        : "You have not listed any services yet.";

    document.getElementById("servicesPageSub").textContent = summary;
}

function openServicesPage() {
    deletingServiceId = null;
    closeServiceEditor();
    renderServicesOverview();
    renderServices();
    showAppPage(providerServicesPage);
}

function openServiceEditor(id) {
    const service = providerServices.find(item => item.id === id);
    editingServiceId = service ? service.id : null;

    document.getElementById("serviceEditorTitle").textContent = service ? "Edit service" : "Add service";
    document.getElementById("serviceName").value = service ? service.name : "";
    document.getElementById("serviceCategory").value = service ? service.category : "";
    document.getElementById("servicePrice").value = service ? service.price : "";
    document.getElementById("serviceUnit").value = service ? service.unit : "per hour";
    document.getElementById("serviceSkills").value = service ? service.skills.join(", ") : "";
    document.getElementById("serviceDescription").value = service ? service.description : "";

    serviceEditor.style.display = "block";
    document.getElementById("addServiceButton").hidden = true;
    document.getElementById("serviceName").focus();
}

function closeServiceEditor() {
    serviceEditor.style.display = "none";
    document.getElementById("addServiceButton").hidden = false;
    serviceEditor.reset();
    editingServiceId = null;
}

// GET /api/provider/dashboard: { provider, salary, rating, reviews, services[], demand[] }
async function loadProviderDashboard() {
    try {
        const d = await API.get("/provider/dashboard");
        providerData = { salary: Number(d.salary) || 0, rating: Number(d.rating) || 0, reviews: Number(d.reviews) || 0, demand: d.demand || [] };
        if (d.provider && d.provider.fullName) providerName = d.provider.fullName;
        providerServices = (d.services || []).map(item => ({
            ...normService(item), description: item.description || "", hired: Number(item.hired) || 0, earned: Number(item.earned) || 0, status: item.status
        }));
        renderDashboard();
    } catch (e) { toast(e.message); }
}

function openDashboard() {
    deletingServiceId = null;
    closeServiceEditor();
    renderDashboard();                 // what we already have, immediately
    showAppPage(providerDashboardPage);
    loadProviderDashboard();           // then the fresh numbers
}

async function deleteProviderService(id) {
    try {
        await API.del(`/provider/services/${id}`);
        await loadProviderDashboard();
        loadCatalog();
    } catch (e) { toast(e.message); }
}

/* ---------- Customer bookings (provider side) ----------
   GET /api/provider/bookings lists the jobs customers booked. For an ongoing job the provider can share the
   phone's position: it is posted to /provider/bookings/:id/location and shows up on the customer's live map. */
let providerJobs = [], sharing = null;   // sharing: { id, watchId }

function stopSharing() {
    if (sharing) navigator.geolocation.clearWatch(sharing.watchId);
    sharing = null;
}

function toggleShare(id) {
    if (sharing && sharing.id === id) { stopSharing(); return renderProviderJobs(); }
    stopSharing();
    if (!navigator.geolocation) return toast("This device cannot share its location.");
    const mine = { id, last: 0, watchId: 0 };
    mine.watchId = navigator.geolocation.watchPosition(pos => {
        const now = Date.now();
        if (now - mine.last < 3000) return;                      // one update every 3 s is plenty for a map
        mine.last = now;
        API.post(`/provider/bookings/${id}/location`, {
            lat: pos.coords.latitude, lng: pos.coords.longitude,
            speed: Math.max(0, (pos.coords.speed || 0) * 3.6)    // the browser reports m/s, the server stores km/h
        }).catch(e => { if (e.status === 404 || e.status === 409) { stopSharing(); loadProviderJobs(); } });
    }, err => {
        toast("Could not read your location: " + err.message);
        stopSharing(); renderProviderJobs();
    }, { enableHighAccuracy: true, maximumAge: 2000 });
    sharing = mine;
    renderProviderJobs();
}

function openProviderBookings() {
    renderProviderJobs();               // what we already have, immediately
    showAppPage(providerBookingsPage);
    loadProviderJobs();                 // then the fresh list
}

// The navigation under the header of the three provider pages
document.addEventListener("click", function (event) {
    const link = event.target.closest("[data-provider-nav]");
    if (!link || link.getAttribute("aria-current") === "page") return;
    const target = link.dataset.providerNav;
    if (target === "dashboard") openDashboard();
    else if (target === "bookings") openProviderBookings();
    else if (target === "services") openServicesPage();
});

async function loadProviderJobs() {
    try { providerJobs = (await API.get("/provider/bookings")).items || []; }
    catch (e) { return; }
    renderProviderJobs();
}

function renderProviderJobs() {
    const ongoing = providerJobs.filter(job => job.status === "Ongoing").length;
    document.getElementById("dashJobsSummary").textContent = providerJobs.length
        ? `${ongoing} ongoing, ${providerJobs.length} in total.` : "Bookings from customers appear here.";
    document.getElementById("dashJobsList").innerHTML = providerJobs.length ? providerJobs.map(job => `
                <li class="offered-row">
                    <div class="offered-main">
                        <span class="offered-name">${escapeHtml(job.service)} for ${escapeHtml(job.customer)}</span>
                        <span class="offered-meta">${escapeHtml(job.ref)} \u00b7 ${escapeHtml(job.when)} \u00b7 ${escapeHtml(job.location)} \u00b7 ${escapeHtml(job.status)} \u00b7 ${peso(job.payment.total)}</span>
                    </div>
                    <span class="service-actions">
                        ${job.status === "Ongoing" ? `
                        <button type="button" class="dash-button" data-job-share="${escapeHtml(job.id)}">${sharing && sharing.id === job.id ? "Stop sharing location" : "Share my location"}</button>
                        <button type="button" class="dash-button" data-job-cancel="${escapeHtml(job.id)}">Cancel</button>` : ""}
                        <button type="button" class="dash-button" data-job-chat="${escapeHtml(job.customerId)}" data-name="${escapeHtml(job.customer)}">Message</button>
                    </span>
                </li>`).join("") : '<li class="offered-row dash-sub">No bookings yet.</li>';
}

document.getElementById("dashJobsList").addEventListener("click", async function (event) {
    const b = event.target.closest("button");
    if (!b) return;
    if (b.dataset.jobShare) return toggleShare(b.dataset.jobShare);
    if (b.dataset.jobChat) { showMainPage(); return openChat(b.dataset.jobChat, undefined, b.dataset.name); }
    if (b.dataset.jobCancel) {
        if (!(await ask("The customer is refunded.", { header: "Cancel this booking?", confirmText: "Cancel booking", cancelText: "Keep it" }))) return;
        if (sharing && sharing.id === b.dataset.jobCancel) stopSharing();
        try { await API.post(`/bookings/${b.dataset.jobCancel}/cancel`); } catch (e) { toast(e.message); }
        loadProviderJobs();
        loadNotifications();
    }
});

serviceEditor.addEventListener("submit", async function (event) {
    event.preventDefault();

    const data = {
        name: document.getElementById("serviceName").value.trim(),
        category: document.getElementById("serviceCategory").value,
        price: Number(document.getElementById("servicePrice").value),
        unit: document.getElementById("serviceUnit").value,
        description: document.getElementById("serviceDescription").value.trim(),
        skills: document.getElementById("serviceSkills").value.split(",").map(skill => skill.trim()).filter(Boolean)
    };

    const editId = editingServiceId;
    const submit = serviceEditor.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
        if (editId) await API.put(`/provider/services/${editId}`, data);
        else {
            await API.post("/provider/services", data);
            loadNotifications();       // customers who asked for something like it are notified by the server
        }
        closeServiceEditor();
        await loadProviderDashboard();
        loadCatalog();                 // the public directory changed too
    } catch (e) {
        toast(e.message);
    } finally {
        if (submit) submit.disabled = false;
    }
});

serviceList.addEventListener("click", function (event) {
    const button = event.target.closest("button");
    if (!button) {
        const card = event.target.closest("[data-open-service]");
        if (card) openServiceDetail(Number(card.dataset.openService), { own: true });
        return;
    }

    if (button.dataset.editService) {
        deletingServiceId = null;
        renderServices();
        openServiceEditor(Number(button.dataset.editService));
    } else if (button.dataset.deleteService) {
        deletingServiceId = Number(button.dataset.deleteService);
        renderServices();
    } else if (button.dataset.confirmDelete) {
        const id = Number(button.dataset.confirmDelete);
        deletingServiceId = null;
        if (editingServiceId === id) closeServiceEditor();
        deleteProviderService(id);
    } else if ("cancelDelete" in button.dataset) {
        deletingServiceId = null;
        renderServices();
    }
});

document.getElementById("addServiceButton").addEventListener("click", function () {
    deletingServiceId = null;
    renderServices();
    openServiceEditor(null);
});

document.getElementById("serviceEditorCancel").addEventListener("click", closeServiceEditor);


document.querySelectorAll("[data-back-to-dashboard]").forEach(button => {
    button.addEventListener("click", openDashboard);
});

/* ---------- Events ---------- */

// FIND A SERVICE → MAIN PAGE
mainPageTrigger.addEventListener("click", showMainPage);

// HEADER LOGIN / SIGNUP → AUTH OVERLAY
loginButton.addEventListener("click", showLoginForm);
signupButton.addEventListener("click", showSignupForm);

// CLOSE AUTH OVERLAY (close button, backdrop click, Escape key)
document.querySelectorAll("[data-close-auth]").forEach(button => {
    button.addEventListener("click", closeAuthModal);
});
auths.addEventListener("click", function (event) {
    if (event.target === auths) closeAuthModal();
});
document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeAuthModal();
});

// LOGO → LANDING PAGE
document.querySelectorAll("[data-logo-home]").forEach(link => {
    link.addEventListener("click", function (event) {
        event.preventDefault();
        showLandingPage();
    });
});

// AVATAR → USER PROFILE PAGE
userAvatar.addEventListener("click", function () {
    editingProfileKey = null;
    populateProfile();
    showAppPage(userProfilePage);
});

// NOTIFICATIONS → NOTIFICATION PAGE
notificationButton.addEventListener("click", function () {
    openNotifMenu = null;
    renderNotifications();
    showAppPage(notificationPage);
});

// CART → CART PAGE
cartButton.addEventListener("click", function () {
    renderCart();
    showAppPage(cartPage);
    loadCart().then(renderCart);
});

// The loading screen. It stays up for at least LOADER_MS, even when the server answers sooner, so it can be read.
const LOADER_MS = 2000;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function showLoader(text) {
    document.getElementById("loaderText").textContent = text;
    showAppPage(loaderPage);
}

// BECOME A PROVIDER → loading screen, then the dashboard (or the registration form if the profile is incomplete)
providerButton.addEventListener("click", async function () {
    if (isProvider) {
        openDashboard();
        return;
    }

    showLoader("Getting your details from your profile\u2026");
    const minimum = pause(LOADER_MS);
    let failure = null;

    if (profileComplete()) {
        // A complete profile is enough: POST /api/provider/register with an empty body reuses the profile's details.
        try {
            const out = await API.post("/provider/register", {});
            isProvider = true;
            providerName = out.provider.fullName;
            providerButton.textContent = "Manage Services";
        } catch (e) { failure = e; }
    }

    await minimum;
    if (!loaderPage.classList.contains("active")) return;               // user navigated away

    if (isProvider) {
        openDashboard();
    } else {
        populateProviderForm();
        showAppPage(serviceProviderFormPage);
        if (failure) toast(failure.message);
    }
});

// BACK BUTTONS → MAIN PAGE
document.querySelectorAll("[data-back-to-main]").forEach(button => {
    button.addEventListener("click", showMainPage);
});

// Fill the UI from the server's copy of the profile (login, signup, session restore and profile edits all use this).
function applyProfile(p) {
    p = p || {};
    showLoggedInHeader(p.email || mockUserProfile.email);          // letter + title; also derives a display name from the email
    if (p.name) mockUserProfile.name = p.name;
    for (const key of ["age", "contact", "location", "bio"]) mockUserProfile[key] = p[key] ?? "";
    mockUserProfile.avatar = p.avatar || defaultUserProfile.avatar;
    populateProfile();
    populateProviderForm();
}

// `me` is the answer of GET /api/me or the login/signup response: { profile, isProvider, provider, cartCount, ... }
function applyMe(me, fallbackEmail) {
    const profile = { ...((me && me.profile) || {}) };
    if (!profile.email) profile.email = fallbackEmail;
    applyProfile(profile);
    isProvider = !!(me && me.isProvider);
    providerName = isProvider && me.provider ? me.provider.fullName : "";
    providerButton.textContent = isProvider ? "Manage Services" : "Become a provider";
    loadAfterLogin();
}

// Everything that belongs to a signed-in person is fetched here, once, right after login or session restore.
let notifTimer = null;
function loadAfterLogin() {
    loadCart();
    loadNotifications();
    loadHistory();
    clearInterval(notifTimer);
    notifTimer = setInterval(loadNotifications, 15000);   // new notifications arrive without a page reload
}

// Forget everything about the previous person (logout or an expired session).
function resetSessionState() {
    clearInterval(notifTimer);
    mockNotifications.length = 0; mockHistory.length = 0; cartIds.length = 0; hiredIds.clear();
    Object.keys(chats).forEach(k => { if (k !== AGENT) delete chats[k]; });
    chats[AGENT] = [{ ...WELCOME }];
    Object.keys(chatMeta).forEach(k => delete chatMeta[k]);
    Object.keys(chatLast).forEach(k => delete chatLast[k]);
    chatWith = AGENT; chatView = "list"; chatPanel.hidden = true;
    providerData = { salary: 0, rating: 0, reviews: 0, demand: [] };
    providerJobs = []; recGroups = []; recNote = "";
    stopSharing(); stopTracking();
    syncBell(); syncCartBadge();
}

// LOGIN SUBMIT → POST /api/auth/login → LOGGED-IN MAIN PAGE
loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const submit = loginForm.querySelector('[type="submit"]');
    submit.disabled = true;                                        // no double-submits while the request is in flight
    try {
        const out = await API.login(
            document.getElementById("loginEmail").value,
            document.getElementById("loginPassword").value);
        applyMe(out.me, out.user.email);
        showMainPage();
    } catch (e) {
        toast(e.message);
    } finally {
        submit.disabled = false;
    }
});

// SIGNUP SUBMIT → POST /api/auth/signup → LOGGED-IN MAIN PAGE
signupForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (document.getElementById("signupPassword").value !==
        document.getElementById("confirmPassword").value) {
        toast("Passwords do not match.");
        return;
    }

    const submit = signupForm.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
        const out = await API.signup(
            document.getElementById("signupEmail").value,
            document.getElementById("signupPassword").value);
        applyMe(out.me, out.user.email);
        showMainPage();
    } catch (e) {
        toast(e.message);
    } finally {
        submit.disabled = false;
    }
});

// PROFILE IMAGE UPLOAD
profileImageButton.addEventListener("click", function () {
    profileImageInput.click();
});

profileImageInput.addEventListener("change", async function () {
    const file = this.files && this.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        toast("Please select an image file.");
        this.value = "";
        return;
    }

    const form = new FormData();
    form.append("image", file);                                    // field name the server's multer expects
    try {
        const out = await API.put("/me/avatar", form);
        mockUserProfile.avatar = out.profile.avatar || defaultUserProfile.avatar;
        profileImage.src = mockUserProfile.avatar;
    } catch (e) {
        toast(e.message);
    }
    this.value = "";
});

// PROVIDER FORM SUBMIT → PROVIDER DASHBOARD
providerRegistrationForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const value = id => document.getElementById(id).value.trim();
    const body = {
        fullName: value("providerName"), contact: value("providerContact"), email: value("providerEmail"),
        availability: value("providerAvailability"), address: value("providerAddress"),
        city: value("providerCity"), province: value("providerProvince"), about: value("providerAbout"),
        ...(providerCoords ? { lat: providerCoords.lat, lng: providerCoords.lng } : {})
    };
    const submit = providerRegistrationForm.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;

    showLoader("Setting up your provider profile\u2026");
    const minimum = pause(LOADER_MS);
    let failure = null;
    try {
        const out = await API.post("/provider/register", body);
        isProvider = true;
        providerName = out.provider.fullName;
        providerButton.textContent = "Manage Services";
        API.get("/me").then(me => applyProfile(me.profile)).catch(() => { });   // the server filled any blank profile fields
    } catch (e) { failure = e; }

    await minimum;
    if (submit) submit.disabled = false;
    if (!loaderPage.classList.contains("active")) return;                    // user navigated away
    if (failure) {
        showAppPage(serviceProviderFormPage);                                // back to the form, with what they typed
        toast(failure.message);
    } else openDashboard();
});

// LOG OUT → MAIN PAGE (stays logged-out inside the app)
logoutButton.addEventListener("click", function () {
    API.logout();                                                  // revoke server-side; the UI doesn't wait for it
    loggedInHeader.style.display = "none";
    loggedOutHeader.style.display = "flex";

    showMainPage();

    loginForm.reset();
    signupForm.reset();
    providerRegistrationForm.reset();

    Object.assign(mockUserProfile, defaultUserProfile);
    resetSessionState();
    isProvider = false;
    providerName = "";
    providerServices = cloneServices();
    providerButton.textContent = "Become a provider";
    editingProfileKey = null;
    profileImageInput.value = "";
    profileImage.src = mockUserProfile.avatar;
});

renderNotifications();
populateProfile();
populateProviderForm();
/* ---------- Service directory ---------- */

const isLoggedIn = () => loggedInHeader.style.display === "flex";

// The service catalog now comes from GET /api/services. It stays a plain array so the cart, detail page,
// assistant and admin code keep working unchanged; loadCatalog() refills it in place.
const serviceCatalog = [];

const servicesEl = document.querySelector(".services");
const searchInput = document.getElementById("searchInput");
const filterPanel = document.getElementById("filterPanel");
const categorySlider = document.querySelector(".category-horizontal-slider");
const hiredIds = new Set();
let activeCategory = "";

// Services arrive as JSON: make sure the numbers are numbers before the UI calls .toFixed() on them.
const normService = i => ({ ...i, id: Number(i.id), price: Number(i.price), rating: Number(i.rating) || 0, reviews: Number(i.reviews) || 0, skills: i.skills || [] });

async function loadCatalog() {
    if (!serviceCatalog.length) servicesEl.innerHTML = '<p class="dash-sub sl-loading" role="status"><ion-spinner name="dots" aria-hidden="true"></ion-spinner>Loading services\u2026</p>';
    servicesEl.setAttribute("aria-busy", "true");
    try {
        const out = await API.get("/services", { limit: 100 });
        const items = (out.items || []).map(normService);
        serviceCatalog.splice(0, serviceCatalog.length, ...items);   // mutate in place; other code holds this same array
        renderCatalog();
    } catch (e) {
        servicesEl.innerHTML = `
                    <div class="no-results">
                        <p>${escapeHtml(e.message)}</p>
                        <p><a href="#" class="text-link" data-retry-catalog>Try again</a></p>
                    </div>`;
    } finally {
        servicesEl.removeAttribute("aria-busy");
    }
}

function renderCatalog() {
    const query = searchInput.value.trim();
    const maxPrice = Number(document.getElementById("fMaxPrice").value) || Infinity;
    const minRating = Number(document.getElementById("fRating").value) || 0;
    const unit = document.getElementById("fUnit").value;

    const list = serviceCatalog.filter(item =>
        (!activeCategory || item.category === activeCategory) &&
        (!query || [item.name, item.provider, item.category].join(" ").toLowerCase().includes(query.toLowerCase())) &&
        item.price <= maxPrice && item.rating >= minRating && (!unit || item.unit === unit));

    servicesEl.innerHTML = list.length ? list.map(item => serviceCardHtml(item)).join("") : `
                <div class="no-results">
                    <p>No services found${query ? ` for "${escapeHtml(query)}"` : " with these filters"}.</p>
                    <p>${query ? `Would you like to request "${escapeHtml(query)}"?` : "Would you like to request a service that isn't listed?"} <a href="#/request-service" class="text-link" data-request-service>Request this service</a></p>
                </div>`;
}

// One directory card. The provider's name links to their profile page.
function serviceCardHtml(item, { provider = true, own = false } = {}) {
    return `
                <article class="service-item" data-id="${item.id}"${own ? " data-own" : ""} tabindex="0" role="link" aria-label="View details for ${escapeHtml(item.name)}">
                    <span class="rating-pill" title="${item.rating.toFixed(1)} rating">${item.rating.toFixed(1)}</span>
                    <div class="service-main">
                        <h3>${escapeHtml(item.name)}</h3>
                        <p class="service-meta">${escapeHtml(item.category)}${provider ? `, ${providerLink(item.provider, item.providerId)}` : ""}</p>
                        <p class="service-price"><strong>\u20b1${item.price.toLocaleString("en-PH")}</strong> ${item.unit}</p>
                    </div>
                </article>`;
}

// Opens the Request a Service form, carrying over what the person was searching for.
function requestMissingService() {
    footerReturn = "main";
    openFooterPage("request");
    const query = searchInput.value.trim();
    if (query) document.getElementById("reqName").value = query;
    if (activeCategory) document.getElementById("reqCategory").value = activeCategory;
}

servicesEl.addEventListener("click", function (event) {
    if (event.target.closest("[data-retry-catalog]")) {
        event.preventDefault();
        return loadCatalog();
    }
    if (event.target.closest("[data-request-service]")) {
        event.preventDefault();
        return requestMissingService();
    }
    // A provider-name link opens that provider's profile (handled by the document-level listener)
    if (event.target.closest("[data-provider-profile]")) return;

    const card = event.target.closest("[data-id]");
    if (card) openServiceDetail(Number(card.dataset.id));
});

servicesEl.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && event.target.matches("[data-id]")) openServiceDetail(Number(event.target.dataset.id));
});

function hireService(service) {
    if (!isLoggedIn()) return showLoginForm();
    openCheckout(service);   // the booking itself is created when checkout is confirmed
}

function askProvider(service) {
    openChat(service.providerId, `Hi ${service.provider}, I have a question about ${service.name}.`, service.provider);
}

/* ---------- Cart ---------- */

const cartIds = [];
const cartBadge = document.getElementById("cartBadge");
const cartContent = document.getElementById("cartContent");

async function loadCart() {
    if (!API.signedIn) return;
    try { applyCart(await API.get("/cart")); } catch (e) { /* the badge keeps its last value */ }
}

// Every cart endpoint answers with the whole cart: { count, items }.
function applyCart(out) {
    const items = (out && out.items) || [];
    items.forEach(i => { if (!serviceCatalog.some(s => s.id === Number(i.id))) serviceCatalog.push(normService(i)); });
    cartIds.splice(0, cartIds.length, ...items.map(i => Number(i.id)));
    syncCartBadge();
    return out;
}

function syncCartBadge() {
    cartBadge.textContent = cartIds.length;
    cartBadge.hidden = !cartIds.length;
    cartButton.setAttribute("aria-label", cartIds.length ? `Cart, ${cartIds.length} item${cartIds.length > 1 ? "s" : ""}` : "Cart");
}

function renderCart() {
    const services = cartIds.map(id => serviceCatalog.find(item => item.id === id)).filter(Boolean);

    cartContent.innerHTML = services.length ? `<ul class="cart-list">${services.map(service => `
                <li class="cart-item">
                    <div class="cart-item-main">
                        <h3>${escapeHtml(service.name)}</h3>
                        <p class="service-meta">${providerLink(service.provider, service.providerId)}, ${escapeHtml(service.category)}</p>
                        <p class="cart-price">\u20b1${Number(service.price).toLocaleString("en-PH")} ${escapeHtml(service.unit)}</p>
                    </div>
                    <div class="cart-item-actions">
                        <button type="button" class="dash-button" data-cart-view="${service.id}">Details</button>
                        <button type="button" class="dash-button" data-cart-remove="${service.id}">Remove</button>
                        <button type="button" class="provider-submit-button" data-cart-hire="${service.id}">Hire</button>
                    </div>
                </li>`).join("")}</ul>` : `
                <div class="empty-cart-message">
                    <i data-lucide="shopping-cart"></i>
                    <h2>Cart is empty</h2>
                    <p>Add a service from the directory to see it here.</p>
                    <button type="button" class="provider-submit-button" data-cart-browse>Browse services</button>
                </div>`;
    lucide.createIcons();
}

cartContent.addEventListener("click", function (event) {
    const button = event.target.closest("button");
    if (!button) return;
    const data = button.dataset;

    if ("cartBrowse" in data) return showMainPage();
    if (data.cartView) return openServiceDetail(Number(data.cartView));
    if (data.cartHire) {
        const service = serviceCatalog.find(item => item.id === Number(data.cartHire));
        return service && hireService(service);
    }
    if (data.cartRemove) {
        API.del("/cart/" + Number(data.cartRemove)).then(applyCart).then(renderCart).catch(e => toast(e.message));
    }
});

/* ---------- Service detail ---------- */

let reviewPicker = null;   // image picker of the review form currently on screen
let detailId = null, detailOwn = false, detailSvc = null, replyingTo = null;

// One service page. The directory only has the summary; GET /api/services/:id adds the description, skills,
// reviews and what this viewer may do (hired, inCart, canReview...). The owner's view comes from the provider API.
async function openServiceDetail(id, opts = {}) {
    const own = !!opts.own;
    let svc;
    try { svc = await API.get(own ? `/provider/services/${id}/reviews` : `/services/${id}`); }
    catch (e) { toast(e.message); return; }
    if (!own && svc.isOwn) return openServiceDetail(id, { ...opts, own: true });
    svc = { ...normService(svc), reviewList: svc.reviewList || [] };
    detailId = id;
    detailOwn = own;
    detailSvc = svc;
    if (!opts.keep) replyingTo = null;

    const rows = [
        ["Provider", { html: own ? `${providerLink(svc.provider, svc.providerId)} (you)` : providerLink(svc.provider, svc.providerId) }],
        ["Price", `\u20b1${Number(svc.price).toLocaleString("en-PH")} ${svc.unit}`],
        ["Rating", svc.reviews ? `${svc.rating.toFixed(1)} from ${svc.reviews} reviews` : "No ratings yet"],
        ["Description", svc.description || "No description"],
        ["Skills", svc.skills.length ? svc.skills.join(", ") : "None listed"],
        ["Availability", svc.availability || "Not set"],
        ["Location", svc.location || "Not set"]
    ];
    const hired = !own && !!svc.hired;
    const reviewForm = own ? "" : opts.posted ? '<p role="status">Thanks! Your review was posted.</p>'
        : !isLoggedIn() ? '<p class="dash-sub">Log in to write a review.</p>'
            : svc.canReview ? `
                <form id="reviewForm" class="service-editor">
                    <h3>Write a review</h3>
                    <p class="service-meta rate-line">Your rating ${starsStatic(svc.myRating)}</p>
                    <div class="provider-form-grid">
                        <div class="provider-field">
                            <label for="reviewText">Your review</label>
                            <textarea id="reviewText" required></textarea>
                        </div>
                    </div>
                    ${attachHtml}
                    <div class="provider-form-actions"><button class="provider-submit-button" type="submit">Post review</button></div>
                </form>`
                : svc.myRating ? '<p class="dash-sub">You already reviewed this service.</p>'
                    : '<p class="dash-sub">Rate this service from your History to write a review.</p>';

    const reviewItems = svc.reviewList.map(r => {
        const reply = r.reply && r.reply.text;
        const replyHtml = reply
            ? `<div class="review-reply"><span class="service-meta">Reply from ${escapeHtml(svc.provider)}</span><p>${escapeHtml(reply)}</p></div>`
            : !own ? ""
                : replyingTo === String(r.id)
                    ? `<span class="inline-form"><input id="replyText" type="text" maxlength="1000" placeholder="Write a reply" aria-label="Reply"><button type="button" class="dash-button" data-reply-send="${r.id}">Send</button><button type="button" class="dash-button" data-reply-cancel>Cancel</button></span>`
                    : `<div><button type="button" class="dash-button" data-reply="${r.id}">Reply</button></div>`;
        const images = r.images || [];
        return `
                    <article class="review">
                        <div class="review-head"><h3>${escapeHtml(r.name)}</h3>${starsStatic(r.stars)}</div>
                        <p>${escapeHtml(r.comment || "")}</p>
                        ${images.length ? `<div class="review-images">${images.map((url, n) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener"><img src="${escapeHtml(url)}" alt="Photo ${n + 1} attached by ${escapeHtml(r.name)}"></a>`).join("")}</div>` : ""}
                        <p class="service-meta">${escapeHtml(fmtDate(r.date))}</p>
                        ${replyHtml}
                    </article>`;
    }).join("");

    document.getElementById("detailName").textContent = svc.name;
    document.getElementById("detailMeta").innerHTML = own
        ? `${escapeHtml(svc.category)}, your service`
        : `${escapeHtml(svc.category)}, offered by ${providerLink(svc.provider, svc.providerId)}`;
    document.getElementById("detailBody").innerHTML = `
                <div class="profile-details">${rows.map(([label, value]) => `
                    <div class="profile-row">
                        <span class="profile-label">${label}</span>
                        <div class="profile-value">${typeof value === "object" ? value.html : escapeHtml(value)}</div>
                    </div>`).join("")}
                </div>
                ${own ? "" : `<div class="service-actions">
                    <button type="button" class="dash-button" data-detail-hire ${hired ? "disabled" : ""}>${hired ? "Hired, see History" : "Hire"}</button>
                    <button type="button" class="dash-button" data-detail-cart><i data-lucide="shopping-cart"></i>${svc.inCart || cartIds.includes(id) ? "In cart, view cart" : "Add to cart"}</button>
                    <button type="button" class="dash-button" data-detail-ask>Ask ${escapeHtml(svc.provider)} about this service</button>
                    <span class="sr-only" id="cartNote" aria-live="polite"></span>
                </div>`}
                <div class="dash-block" id="reviewSection">
                    <h2>Reviews</h2>
                    <p class="dash-sub">${svc.reviews ? `${svc.rating.toFixed(1)} out of 5, from ${svc.reviews} reviews` : "No reviews yet."}</p>
                </div>
                ${reviewForm}
                <div class="review-list">${reviewItems}</div>`;
    if (svc.inCart && !cartIds.includes(id)) cartIds.push(id), syncCartBadge();
    if (reviewPicker) reviewPicker.clear();
    const reviewFormEl = document.getElementById("reviewForm");
    reviewPicker = reviewFormEl ? makeImagePicker(reviewFormEl) : null;
    showAppPage(serviceDetailPage);
    lucide.createIcons();

    if (opts.keep) window.scrollTo(0, opts.keep);
    if (opts.scroll) document.getElementById("reviewSection").scrollIntoView();
    const focusField = document.getElementById("replyText") || document.getElementById("reviewText");
    if (focusField && (opts.scroll || replyingTo)) focusField.focus({ preventScroll: true });
}

document.getElementById("detailBack").addEventListener("click", () => detailOwn ? openServicesPage() : showMainPage());

document.getElementById("detailBody").addEventListener("click", async function (event) {
    const button = event.target.closest("button");
    if (!button || !detailOwn) return;
    const data = button.dataset;

    if (data.reply !== undefined) replyingTo = data.reply;
    else if (data.replyCancel !== undefined) replyingTo = null;
    else if (data.replySend !== undefined) {
        const text = document.getElementById("replyText");
        if (!text.value.trim()) { text.focus(); return; }
        try { await API.post(`/provider/reviews/${data.replySend}/reply`, { text: text.value.trim() }); }
        catch (e) { toast(e.message); return; }
        replyingTo = null;
    } else return;

    openServiceDetail(detailId, { own: true, keep: window.scrollY });
});

document.getElementById("serviceList").addEventListener("keydown", function (event) {
    if (event.key === "Enter" && event.target.matches("[data-open-service]")) {
        openServiceDetail(Number(event.target.dataset.openService), { own: true });
    }
});

document.getElementById("detailBody").addEventListener("click", async function (event) {
    const button = event.target.closest("button");
    const service = detailSvc;
    if (!button || !service || detailOwn) return;

    if ("detailHire" in button.dataset) {
        hireService(service);
    } else if ("detailCart" in button.dataset) {
        if (!isLoggedIn()) return showLoginForm();
        if (cartIds.includes(service.id)) {
            renderCart();
            return showAppPage(cartPage);
        }
        try { applyCart(await API.post("/cart", { serviceId: service.id })); }
        catch (e) { toast(e.message); return; }
        button.innerHTML = '<i data-lucide="shopping-cart"></i>In cart, view cart';
        document.getElementById("cartNote").textContent = "Added to cart.";
        lucide.createIcons();
    } else if ("detailAsk" in button.dataset) {
        showMainPage();
        askProvider(service);
    }
});

searchInput.addEventListener("input", renderCatalog);
document.getElementById("filterButton").addEventListener("click", () => { filterPanel.hidden = !filterPanel.hidden; });
filterPanel.addEventListener("input", renderCatalog);
document.getElementById("filterReset").addEventListener("click", function () {
    filterPanel.querySelectorAll("input,select").forEach(field => { field.value = ""; });
    renderCatalog();
});

categorySlider.querySelectorAll("span").forEach(span => { span.setAttribute("role", "button"); span.tabIndex = 0; });
categorySlider.addEventListener("click", function (event) {
    const span = event.target.closest("span");
    if (!span) return;
    const name = span.textContent.trim();
    activeCategory = name === "All" || name === activeCategory ? "" : name;
    categorySlider.querySelectorAll("span").forEach(item => item.classList.toggle("active", item.textContent.trim() === (activeCategory || "All")));
    renderCatalog();
});
categorySlider.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.target.click(); }
});

/* ---------- Provider profiles (public view) ---------- */

// A provider's name, as a link to their profile page. Used everywhere a provider is shown.
// The id (a UUID from the API) is what opens the page; the name is only what people read.
function providerLink(name, id) {
    return `<a href="#/provider/${encodeURIComponent(name)}" class="text-link" data-provider-profile="${escapeHtml(name)}"${id ? ` data-provider-id="${escapeHtml(id)}"` : ""}>${escapeHtml(name)}</a>`;
}

let providerProfileBack = showMainPage;   // where the Back button returns to

// GET /api/providers/:id already returns the rating, services, skills, categories and latest reviews.
async function openProviderProfile(id) {
    let p;
    try { p = await API.get("/providers/" + id); }
    catch (e) { toast(e.message); return; }

    // Remember the page we came from (page contents stay in the DOM, so showing it again restores it)
    const previous = appPages.find(page => page.classList.contains("active"));
    if (previous !== providerProfilePage) providerProfileBack = previous ? () => showAppPage(previous) : showMainPage;

    const profile = {
        id: p.id, name: p.name, own: !!p.own, avatar: p.avatar || "", bio: p.bio || "", location: p.location || "Not set",
        services: (p.services || []).map(normService), reviews: Number(p.reviews) || 0, rating: Number(p.rating) || 0
    };
    const categories = p.categories || [];
    const skills = p.skills || [];
    const reviews = (p.latestReviews || []).map(r => ({ name: r.name, stars: r.stars, date: fmtDate(r.date), comment: r.comment || "", service: r.service }));
    const cheapest = p.cheapest;
    const memberSince = p.memberSince ? new Date(p.memberSince).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "\u2014";
    const availability = p.availability || "Not set";
    const firstName = profile.name.split(" ")[0];

    document.getElementById("providerProfileSub").textContent = categories.length ? `Offers ${categories.join(", ")}` : "Service provider";

    const avatar = profile.avatar
        ? `<img class="profile-image" src="${escapeHtml(profile.avatar)}" alt="${escapeHtml(profile.name)}">`
        : `<span class="provider-avatar" aria-hidden="true">${escapeHtml(initials(profile.name))}</span>`;

    const factRows = [
        ["map-pin", "Location", profile.location],
        ["calendar-check", "Availability", availability],
        ["clock", "Responds", p.responds || "Not enough data yet"],
        ["calendar", "Member since", memberSince],
        ["tag", "Categories", categories.join(", ") || "None yet"]
    ];

    const stats = [
        ["Rating", profile.reviews ? `\u2605 ${profile.rating.toFixed(1)}` : "\u2014"],
        ["Reviews", String(profile.reviews)],
        ["Services", String(profile.services.length)],
        ["Starting at", cheapest ? `\u20b1${Number(cheapest.price).toLocaleString("en-PH")} <small>${escapeHtml(cheapest.unit)}</small>` : "\u2014"]
    ];

    document.getElementById("providerProfileBody").innerHTML = `
                <div class="pp">
                    <div class="pp-hero">
                        ${avatar}
                        <div>
                            <h2 class="pp-name">${escapeHtml(profile.name)}</h2>
                            <p class="pp-tagline">${categories.length ? escapeHtml(categories.join(" \u00b7 ")) : "Service provider"}</p>
                            <ul class="pp-meta">
                                <li>${profile.reviews ? `<strong>\u2605 ${profile.rating.toFixed(1)}</strong> (${profile.reviews} reviews)` : "No ratings yet"}</li>
                                <li><i data-lucide="map-pin"></i>${escapeHtml(profile.location)}</li>
                                <li><i data-lucide="calendar-check"></i>${escapeHtml(availability)}</li>
                            </ul>
                            ${profile.own ? '<p class="pp-note">This is how other people see your profile.</p>' : ""}
                        </div>
                        <div class="pp-actions">
                            ${profile.own
            ? `<button type="button" class="dash-button is-primary" data-provider-edit><i data-lucide="pencil"></i>Edit profile</button>
                                   <button type="button" class="dash-button" data-provider-manage><i data-lucide="briefcase-business"></i>Manage services</button>`
            : `<button type="button" class="dash-button is-primary" data-provider-message="${escapeHtml(profile.id)}" data-provider-name="${escapeHtml(profile.name)}"><i data-lucide="message-circle"></i>Message ${escapeHtml(firstName)}</button>`}
                        </div>
                    </div>

                    <dl class="pp-stats">${stats.map(([label, value]) => `
                        <div class="pp-stat"><dt>${label}</dt><dd>${value}</dd></div>`).join("")}
                    </dl>

                    <div class="pp-grid">
                        <div class="pp-main">
                            <section class="pp-section" aria-labelledby="ppAbout">
                                <h2 id="ppAbout">About</h2>
                                ${profile.bio
            ? `<p class="pp-about">${escapeHtml(profile.bio)}</p>`
            : `<p class="pp-empty">${profile.own ? "You haven't added a bio yet. Add one from your profile." : `This provider hasn't added a bio yet.`}</p>`}
                            </section>

                            <section class="pp-section pp-services-sec" aria-labelledby="ppServices">
                                <h2 id="ppServices">Services offered <span class="pp-count">${profile.services.length}</span></h2>
                                <div class="services">${profile.services.length
            ? profile.services.map(item => serviceCardHtml(item, { provider: false, own: profile.own })).join("")
            : '<p class="pp-empty">No services listed yet.</p>'}</div>
                            </section>

                            <section class="pp-section pp-reviews-sec" aria-labelledby="ppReviews">
                                <h2 id="ppReviews">Reviews ${profile.reviews ? `<span class="pp-count">${profile.rating.toFixed(1)} out of 5, from ${profile.reviews} reviews</span>` : ""}</h2>
                                ${reviews.length ? `<div class="pp-reviews">${reviews.map(r => `
                                    <article class="review">
                                        <div class="review-head"><h3>${escapeHtml(r.name)}</h3>${starsStatic(r.stars)}</div>
                                        <p>${escapeHtml(r.comment)}</p>
                                        <p class="service-meta">${escapeHtml(r.date)} \u00b7 ${escapeHtml(r.service)}</p>
                                    </article>`).join("")}</div>` : '<p class="pp-empty">No reviews yet.</p>'}
                            </section>
                        </div>

                        <aside class="pp-aside" aria-label="Provider details">
                            <div class="pp-card">
                                <h2>Details</h2>
                                <dl class="pp-facts">${factRows.map(([icon, label, value]) => `
                                    <div class="pp-fact"><dt><i data-lucide="${icon}"></i>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
                                </dl>
                            </div>
                            <div class="pp-card">
                                <h2>Skills</h2>
                                ${skills.length
            ? `<ul class="skill-chips" aria-label="Skills">${skills.map(skill => `<li>${escapeHtml(skill)}</li>`).join("")}</ul>`
            : '<p class="pp-empty">No skills listed yet.</p>'}
                            </div>
                        </aside>
                    </div>
                </div>`;
    showAppPage(providerProfilePage);
    lucide.createIcons();
}

// Any provider-name link, anywhere in the app
document.addEventListener("click", function (event) {
    const link = event.target.closest("a[data-provider-profile]");
    if (!link) return;
    event.preventDefault();
    if (link.dataset.providerId) openProviderProfile(link.dataset.providerId);
});

document.getElementById("providerProfileBack").addEventListener("click", () => providerProfileBack());

document.getElementById("providerProfileBody").addEventListener("click", function (event) {
    const message = event.target.closest("[data-provider-message]");
    if (message) {
        const name = message.dataset.providerName;
        showMainPage();
        return openChat(message.dataset.providerMessage, `Hi ${name}, I have a question about your services.`, name);
    }
    if (event.target.closest("[data-provider-manage]")) return openDashboard();
    if (event.target.closest("[data-provider-edit]")) {
        editingProfileKey = null;
        populateProfile();
        return showAppPage(userProfilePage);
    }
    const card = event.target.closest("[data-id]");
    if (card) openServiceDetail(Number(card.dataset.id), card.dataset.own !== undefined ? { own: true } : {});
});

document.getElementById("providerProfileBody").addEventListener("keydown", function (event) {
    if (event.key === "Enter" && event.target.matches("[data-id]")) event.target.click();
});

/* ---------- Chat ---------- */

const chatPanel = document.getElementById("chatPanel");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");
const AGENT = "SkillLink Assistant";
const WELCOME = { who: "bot", text: "Hi! I can find a provider, prepare a booking, check your payments or show where your provider is. I never charge anything without your confirmation." };
// Threads are keyed by the other person's user id (a UUID). The assistant's thread is keyed by AGENT.
const chats = { [AGENT]: [{ ...WELCOME }] };
const chatMeta = {};   // user id -> { name, avatar, isProvider }
const chatLast = {};   // user id -> preview text, used by the list before a thread has been opened
let chatWith = AGENT;
let chatView = "list";

const initials = n => n.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
const chatName = k => k === AGENT ? AGENT : (chatMeta[k] && chatMeta[k].name) || "Chat";
const avatarHtml = k => k === AGENT
    ? '<span class="chat-avatar assistant" aria-hidden="true"><i data-lucide="sparkles"></i></span>'
    : `<span class="chat-avatar" aria-hidden="true">${escapeHtml(initials(chatName(k)))}</span>`;
function lastText(k) {
    const thread = chats[k] || [];
    for (let i = thread.length - 1; i >= 0; i--) {
        const m = thread[i];
        if (m.typing) continue;
        return (m.who === "me" ? "You: " : "") + (m.text || "");
    }
    return chatLast[k] || "";
}

function renderChat() {
    const thread = chatView === "thread";
    chatPanel.dataset.view = chatView;
    const chatTitle = document.getElementById("chatWith");
    if (thread && chatWith !== AGENT) {
        const meta = chatMeta[chatWith] || {};
        chatTitle.innerHTML = meta.isProvider ? providerLink(chatName(chatWith), chatWith) : escapeHtml(chatName(chatWith));   // provider threads link to the profile
    } else chatTitle.textContent = thread ? chatWith : "Chats";
    document.getElementById("chatBack").hidden = !thread;
    document.getElementById("chatChips").hidden = !(thread && chatWith === AGENT);
    // Assistant stays first, then everyone else who has a conversation.
    const keys = [AGENT, ...Object.keys(chats).filter(k => k !== AGENT && (chats[k].length || chatLast[k]))];
    document.getElementById("chatList").innerHTML = keys.map(k => `
                <button type="button" class="chat-row" data-chat="${escapeHtml(k)}">${avatarHtml(k)}
                    <span class="chat-row-text"><strong>${escapeHtml(chatName(k))}</strong><span>${escapeHtml(lastText(k))}</span></span>
                </button>`).join("");
    if (thread) {
        chatMessages.innerHTML = (chats[chatWith] || []).map(msgHtml).join("")
            || '<p class="dash-sub">Start the conversation.</p>';
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    lucide.createIcons();
}

// GET /api/chats: one row per person you have talked to.
async function loadChatList() {
    if (!API.signedIn) return;
    try {
        const out = await API.get("/chats");
        (out.items || []).forEach(c => {
            chatMeta[c.userId] = { name: c.name, avatar: c.avatar, isProvider: c.isProvider };
            chatLast[c.userId] = (c.lastMine ? "You: " : "") + (c.lastText || "");
            chats[c.userId] = chats[c.userId] || [];
        });
        if (chatView === "list" && !chatPanel.hidden) renderChat();
    } catch (e) { /* keep the list as it is */ }
}

// GET /api/chats/:id/messages. Opening a thread also marks their messages read.
// incremental: only ask for messages newer than the last one we have.
async function loadThread(id, incremental) {
    const thread = chats[id] = chats[id] || [];
    const lastId = incremental ? Math.max(0, ...thread.map(m => m.id || 0)) : 0;
    try {
        const out = await API.get(`/chats/${id}/messages`, lastId ? { after: lastId } : undefined);
        chatMeta[id] = { ...(chatMeta[id] || {}), ...out.with };
        const fresh = (out.messages || []).map(m => ({ id: m.id, who: m.mine ? "me" : "bot", text: m.text }));
        if (lastId) fresh.forEach(m => { if (!thread.some(x => x.id === m.id)) thread.push(m); });
        else thread.splice(0, thread.length, ...fresh);
        if (chatView === "thread" && chatWith === id) renderChat();
    } catch (e) { /* offline: keep what is shown */ }
}

// Called without a target, opens the conversation list. With a user id (or AGENT), opens that thread.
async function openChat(target, prefill, name) {
    if (!isLoggedIn()) return showLoginForm();
    chatView = target ? "thread" : "list";
    if (target) {
        chatWith = target;
        chats[target] = chats[target] || [];
        if (name && !chatMeta[target]) chatMeta[target] = { name };
    }
    renderChat();
    chatPanel.hidden = false;
    if (target) {
        chatInput.value = prefill || "";
        chatInput.focus();
        if (target !== AGENT) await loadThread(target);
    } else loadChatList();
}

// New messages from the other person arrive by polling while the panel is open.
setInterval(() => {
    if (chatPanel.hidden || !API.signedIn) return;
    if (chatView === "list") loadChatList();
    else if (chatWith !== AGENT) loadThread(chatWith, true);
}, 5000);

document.getElementById("chatButton").addEventListener("click", () => chatPanel.hidden ? openChat() : (chatPanel.hidden = true));
document.getElementById("chatClose").addEventListener("click", () => { chatPanel.hidden = true; });
document.getElementById("chatBack").addEventListener("click", () => { chatView = "list"; renderChat(); loadChatList(); });
document.getElementById("chatList").addEventListener("click", function (event) {
    const row = event.target.closest("[data-chat]");
    if (!row) return;
    chatWith = row.dataset.chat; chatView = "thread";
    renderChat(); chatInput.focus();
    if (chatWith !== AGENT) loadThread(chatWith);
});
document.getElementById("chatForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    const key = chatWith;
    if (key === AGENT) {
        chats[AGENT].push({ who: "me", text });
        chatInput.value = "";
        renderChat();
        return agentRespond(text);
    }
    chatInput.value = "";
    try {
        const m = await API.post(`/chats/${key}/messages`, { text });
        const thread = chats[key] = chats[key] || [];
        if (!thread.some(x => x.id === m.id)) thread.push({ id: m.id, who: "me", text: m.text });
        renderChat();
    } catch (e) {
        chatInput.value = text;           // give the text back so nothing is lost
        toast(e.message);
    }
});

/* ---------- Payments, bookings and live tracking ---------- */

let PLATFORM_FEE = 0.05;   // replaced by GET /api/config at start-up (the server is the source of truth)
const PAY_METHODS = {
    gcash: ["GCash", "smartphone", "Pay with your GCash wallet. Held until the job is finished."],
    maya: ["Maya", "wallet", "Pay with your Maya wallet. Held until the job is finished."],
    card: ["Credit or debit card", "credit-card", "Held until the job is finished."],
    cash: ["Cash", "banknote", "Pay the provider in cash after the job."]
};
const peso = n => "\u20b1" + Math.round(n).toLocaleString("en-PH");
const unitWord = service => ({ "per hour": "Hours", "per day": "Days" }[service.unit]);
function quote(service, qty) {
    const subtotal = service.price * qty, fee = Math.round(subtotal * PLATFORM_FEE);
    return { subtotal, fee, total: subtotal + fee };
}
function paymentText(p) {
    const via = p.method === "card" ? "card" + (p.last4 ? " \u2022\u2022\u2022\u2022 " + p.last4 : "") : PAY_METHODS[p.method][0];
    return {
        held: `${peso(p.total)} via ${via}, held until the job is finished`,
        released: `${peso(p.total)} via ${via}, released to provider`,
        "due-cash": `${peso(p.total)} in cash, pay the provider after the job`,
        "paid-cash": `${peso(p.total)} in cash, paid`,
        refunded: `${peso(p.total)} via ${via}, refunded`,
        void: `${peso(p.total)} in cash, booking cancelled, nothing to pay`
    }[p.status] || p.status;
}
// The server creates the notifications itself (booking confirmed, payment released...), so this only refetches.
function notify() { loadNotifications(); }

// POST /api/bookings. The server re-checks everything (availability, future time, fee) and does the maths.
// Card numbers never leave the browser: only the last 4 digits are sent.
async function createBooking(service, o) {
    const body = {
        serviceId: service.id, location: o.location, date: o.date, time: o.time, qty: o.qty || 1, method: o.method,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
    if (o.last4) body.last4 = o.last4;
    if (Number.isFinite(o.lat) && Number.isFinite(o.lng)) { body.lat = o.lat; body.lng = o.lng; }
    const item = toHistory(await API.post("/bookings", body));
    mockHistory.unshift(item);
    hiredIds.add(service.id);
    renderCatalog();
    loadNotifications();                      // "Booking confirmed" is created by the server
    return item;
}

async function finishBooking(item) {
    try {
        await API.post(`/bookings/${item.id}/finish`);   // releases held money / records the cash payment
        await loadHistory();
    } catch (e) { toast(e.message); }
    renderHistory();
    loadNotifications();
}

async function cancelBooking(item) {
    if (!(await ask("Money held for this booking is returned to you.", { header: "Cancel this booking?", confirmText: "Cancel booking", cancelText: "Keep it" }))) return;
    try {
        await API.post(`/bookings/${item.id}/cancel`);
        await loadHistory();
    } catch (e) { toast(e.message); }
    renderHistory();
    loadNotifications();
}

// Best-effort address -> coordinates so the provider's live position can be measured against the destination.
async function geocode(text) {
    try {
        const hits = await nominatim("search", { q: text, limit: 1, ...(MAP_COUNTRY ? { countrycodes: MAP_COUNTRY } : {}) }, AbortSignal.timeout(4000));
        return hits && hits[0] ? { lat: Number(hits[0].lat), lng: Number(hits[0].lon) } : null;
    } catch (e) { return null; }          // no pin is fine: the booking works, only the distance readout is missing
}

/* Checkout */
let checkoutService = null;
const localDate = offsetDays => {
    const d = new Date(Date.now() + offsetDays * 864e5 - new Date().getTimezoneOffset() * 6e4);
    return d.toISOString().slice(0, 10);
};
const whenLabel = (date, time) => new Date(date + "T" + time).toLocaleString("en-PH", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function openCheckout(service, pre = {}) {
    checkoutService = service;
    const unit = unitWord(service), method = pre.method || "gcash";
    document.getElementById("checkoutTitle").textContent = "Book and pay";
    document.getElementById("checkoutSub").textContent = `${service.name} with ${service.provider}`;
    document.getElementById("checkoutBody").innerHTML = `
                <form id="checkoutForm" class="co-grid" novalidate>
                    <div>
                        <div class="provider-form-grid">
                            <div class="provider-field"><label for="coLocation">Service location</label>
                                <input id="coLocation" type="text" required value="${escapeHtml(pre.location || mockUserProfile.location)}"></div>
                            <div class="provider-field"><label for="coDate">Date</label>
                                <input id="coDate" type="date" required min="${localDate(0)}" value="${pre.date || localDate(1)}"></div>
                            <div class="provider-field"><label for="coTime">Time</label>
                                <input id="coTime" type="time" required value="${pre.time || "09:00"}"></div>
                            ${unit ? `<div class="provider-field"><label for="coQty">${unit}</label>
                                <input id="coQty" type="number" min="1" max="30" value="${pre.qty || 1}"></div>` : ""}
                        </div>
                        <fieldset class="pay-options"><legend>Payment method</legend>
                            ${Object.entries(PAY_METHODS).map(([key, [name, icon, desc]]) => `
                            <label class="pay-opt"><input type="radio" name="coMethod" value="${key}" ${key === method ? "checked" : ""}>
                                <i data-lucide="${icon}"></i><span>${name}<small>${desc}</small></span></label>`).join("")}
                        </fieldset>
                    </div>
                    <div class="co-side">
                        <div id="coCard" hidden>
                            <h2 class="co-h">Card details</h2>
                            <div class="provider-form-grid">
                            <div class="provider-field"><label for="coNum">Card number</label>
                                <input id="coNum" type="text" inputmode="numeric" autocomplete="cc-number" placeholder="1234 5678 9012 3456"></div>
                            <div class="provider-field"><label for="coExp">Expiry</label>
                                <input id="coExp" type="text" autocomplete="cc-exp" placeholder="MM/YY"></div>
                            <div class="provider-field"><label for="coCvc">CVC</label>
                                <input id="coCvc" type="password" inputmode="numeric" autocomplete="cc-csc" maxlength="4"></div>
                            </div>
                        </div>
                        <p id="coError" class="co-error" role="alert" hidden></p>
                    <aside class="dash-block">
                        <h2>Summary</h2>
                        <div id="coSummary"></div>
                        <button class="provider-submit-button" type="submit" id="coSubmit">Confirm and book</button>
                        <p class="dash-sub" id="coNote"></p>
                    </aside>
                    </div>
                </form>`;
    showAppPage(checkoutPage);
    syncCheckout();
}

const coMethod = () => document.querySelector('input[name="coMethod"]:checked').value;

function syncCheckout() {
    const s = checkoutService, qtyEl = document.getElementById("coQty"), m = coMethod();
    const q = quote(s, qtyEl ? Math.max(1, Number(qtyEl.value) || 1) : 1), qty = qtyEl ? Math.max(1, Number(qtyEl.value) || 1) : 1;
    document.getElementById("coCard").hidden = m !== "card";
    document.getElementById("coSummary").innerHTML = `
                <div class="sum-row"><span>${peso(s.price)} ${s.unit}${qty > 1 ? " \u00d7 " + qty : ""}</span><span>${peso(q.subtotal)}</span></div>
                <div class="sum-row"><span>Platform fee (${PLATFORM_FEE * 100}%)</span><span>${peso(q.fee)}</span></div>
                <div class="sum-row total"><span>Total</span><span>${peso(q.total)}</span></div>`;
    document.getElementById("coNote").textContent = m === "cash"
        ? `You pay ${peso(q.total)} in cash to ${s.provider} after the job.`
        : `Your payment is held by SkillLink and released to ${s.provider} when you mark the job as finished.`;
    document.getElementById("coSubmit").textContent = m === "cash" ? "Confirm booking" : `Pay ${peso(q.total)}`;
}

document.getElementById("checkoutBody").addEventListener("input", e => { if (e.target.closest("#checkoutForm")) syncCheckout(); });
document.getElementById("checkoutBack").addEventListener("click", () => checkoutService && openServiceDetail(checkoutService.id));

document.getElementById("checkoutBody").addEventListener("submit", async function (event) {
    event.preventDefault();
    const $ = id => document.getElementById(id), m = coMethod(), err = $("coError"), btn = $("coSubmit");
    const fail = (msg, field) => { err.textContent = msg; err.hidden = false; $(field).focus(); };
    err.hidden = true;
    if (!$("coLocation").value.trim()) return fail("Enter the service location.", "coLocation");
    if (!$("coDate").value || !$("coTime").value) return fail("Choose a date and time.", "coDate");
    if (new Date($("coDate").value + "T" + $("coTime").value) < new Date()) return fail("Choose a time in the future.", "coDate");
    let last4 = "";
    if (m === "card") {
        const digits = $("coNum").value.replace(/\s/g, "");
        if (!/^\d{13,19}$/.test(digits)) return fail("Enter a valid card number.", "coNum");
        if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test($("coExp").value.trim())) return fail("Enter the expiry as MM/YY.", "coExp");
        if (!/^\d{3,4}$/.test($("coCvc").value)) return fail("Enter the 3 or 4 digit CVC.", "coCvc");
        last4 = digits.slice(-4);   // only the last 4 digits are ever kept
    }
    btn.disabled = true;
    btn.textContent = "Booking\u2026";
    try {
        const qtyEl = $("coQty"), location = $("coLocation").value.trim();
        const place = await geocode(location);
        const item = await createBooking(checkoutService, {
            location, date: $("coDate").value, time: $("coTime").value,
            qty: qtyEl ? Math.max(1, Number(qtyEl.value) || 1) : 1, method: m, last4, ...(place || {})
        });
        showReceipt(item);
    } catch (e) {
        btn.disabled = false;
        syncCheckout();                  // restores the button label
        fail(e.message, "coLocation");
    }
});

function showReceipt(item) {
    document.getElementById("checkoutTitle").textContent = "Booking confirmed";
    const rows = [["Reference", item.ref], ["Service", `${item.service} with ${item.provider}`], ["When", item.when], ["Where", item.location], ["Payment", paymentText(item.payment)]];
    document.getElementById("checkoutBody").innerHTML = `
                <div class="profile-details">${rows.map(([l, v]) => `
                    <div class="profile-row"><span class="profile-label">${l}</span><div class="profile-value">${escapeHtml(v)}</div></div>`).join("")}
                </div>
                <div class="service-actions">
                    <button type="button" class="provider-submit-button" id="receiptTrack">Track provider</button>
                    <button type="button" class="dash-button" id="receiptHistory">View history</button>
                </div>`;
    document.getElementById("receiptTrack").onclick = () => openTracking(item);
    document.getElementById("receiptHistory").onclick = () => { renderHistory(); showAppPage(historyPage); };
    document.getElementById("checkoutTitle").focus();
}

/* Live tracking.
   GET /api/bookings/:id/track gives the first snapshot, then the server's event stream
   (/track/stream) pushes a new one whenever the provider's phone reports a position.
   If the stream cannot connect, the page falls back to polling the same endpoint. */
let trackItem = null, trackSnap = null, trackES = null, trackPoll = null, trackStart = 0;

function meters(a, b) {
    const R = 6371000, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

// Fits the points into the 600x360 drawing, with a minimum zoom so a single point still looks sensible.
function makeProjector(points) {
    const W = 600, H = 360, pad = 50, MIN = 0.004;
    let minLat = Math.min(...points.map(p => p.lat)), maxLat = Math.max(...points.map(p => p.lat));
    let minLng = Math.min(...points.map(p => p.lng)), maxLng = Math.max(...points.map(p => p.lng));
    if (maxLat - minLat < MIN) { const c = (maxLat + minLat) / 2; minLat = c - MIN / 2; maxLat = c + MIN / 2; }
    if (maxLng - minLng < MIN) { const c = (maxLng + minLng) / 2; minLng = c - MIN / 2; maxLng = c + MIN / 2; }
    const s = Math.min((W - 2 * pad) / (maxLng - minLng), (H - 2 * pad) / (maxLat - minLat));
    const ox = (W - (maxLng - minLng) * s) / 2, oy = (H - (maxLat - minLat) * s) / 2;
    return p => [ox + (p.lng - minLng) * s, oy + (maxLat - p.lat) * s];
}

function stopTracking() {
    if (trackES) trackES.close();
    trackES = null;
    clearInterval(trackPoll);
    trackPoll = null;
}

function startTrackPolling(id) {
    if (trackPoll) return;
    trackPoll = setInterval(async () => { try { applyTrack(await API.get(`/bookings/${id}/track`)); } catch (e) { /* try again next tick */ } }, 4000);
}

function startTrackStream(id) {
    try {
        trackES = new EventSource(API.sseUrl(`/bookings/${id}/track/stream`));
        trackES.addEventListener("track", e => applyTrack(JSON.parse(e.data)));
        trackES.addEventListener("end", () => { stopTracking(); loadHistory(); });
        trackES.onerror = () => {
            if (!trackES) return;                 // we closed it ourselves
            trackES.close(); trackES = null;
            startTrackPolling(id);                // e.g. an expired token: the polling path refreshes it
        };
    } catch (e) { startTrackPolling(id); }
}

async function openTracking(item) {
    stopTracking();
    trackItem = item; trackSnap = null; trackStart = 0;
    document.getElementById("trackSub").textContent = `${item.service} with ${item.provider}`;
    buildTracking();
    showAppPage(trackingPage);
    try { applyTrack(await API.get(`/bookings/${item.id}/track`)); }
    catch (e) { toast(e.message); return; }
    if (trackItem === item && item.status === "Ongoing") startTrackStream(item.id);
}

function buildTracking() {
    const item = trackItem;
    let grid = "";
    for (let x = 25; x < 600; x += 75) grid += `M${x} 0V360`;
    for (let y = 20; y < 360; y += 60) grid += `M0 ${y}H600`;
    document.getElementById("trackBody").innerHTML = `
                <div class="trk-grid">
                    <div>
                        <svg class="trk-map" viewBox="0 0 600 360" role="img" aria-label="Map: ${escapeHtml(item.provider)} travelling to ${escapeHtml(item.location)}">
                            <path class="road" d="${grid}"/>
                            <polyline class="trail" id="trkTrail" points=""/>
                            <g id="trkDest" style="display:none"><circle r="16" class="trk-dest-ring"/><circle r="6" class="trk-dest"/></g>
                            <g class="trk-me" id="trkMe" style="display:none"><circle class="trk-pulse" r="12"/><circle class="trk-dot" r="9"/></g>
                        </svg>
                        <p class="dash-sub" id="trkNote">Position shared live by the provider's phone.</p>
                    </div>
                    <div class="dash-block">
                        <h2 id="trkStatus" aria-live="polite"></h2>
                        <span class="trk-live" id="trkLive"></span>
                        <div class="trk-stats">
                            <div><strong id="trkEta"></strong><span>Arrival</span></div>
                            <div><strong id="trkDist"></strong><span>Away</span></div>
                            <div><strong id="trkSpeed"></strong><span>Speed</span></div>
                        </div>
                        <div class="trk-bar"><span id="trkBar"></span></div>
                        <ol class="trk-steps" id="trkSteps"><li>Accepted</li><li>On the way</li><li>Arrived</li></ol>
                        <dl class="trk-meta"><dt>Meeting at</dt><dd>${escapeHtml(item.location)}</dd><dt>Scheduled</dt><dd>${escapeHtml(item.when)}</dd></dl>
                        <p><span class="pay-chip" id="trkPay"></span></p>
                        <div class="service-actions"><button type="button" class="dash-button" id="trkChat">Message ${escapeHtml(item.provider)}</button></div>
                    </div>
                </div>`;
    document.getElementById("trkChat").onclick = () => { showMainPage(); openChat(item.providerId, undefined, item.provider); };
}

function applyTrack(t) {
    trackSnap = { ...t, at: Date.now() };
    if (trackItem) {
        trackItem.status = t.status;
        if (t.payment) trackItem.payment = { ...t.payment, subtotal: Number(t.payment.subtotal), fee: Number(t.payment.fee), total: Number(t.payment.total) };
    }
    updateTracking();
    if (t.status !== "Ongoing") { stopTracking(); loadHistory(); }
}

function updateTracking() {
    const t = trackSnap;
    if (!t || !trackItem || !document.getElementById("trkMe")) return;
    const $ = id => document.getElementById(id), step = t.step, done = !!t.done;
    const age = t.last ? Math.round((t.ageSeconds || 0) + (Date.now() - t.at) / 1000) : null;
    const stale = !done && age !== null && age > 15;
    const dist = t.distanceM;

    $("trkStatus").textContent = ["Accepted, getting ready", "On the way", done ? "Job completed" : "Arrived"][step];
    $("trkEta").textContent = step === 2 ? (done ? "Done" : "Here") : t.etaMin != null ? t.etaMin + " min" : step === 0 ? "Soon" : "\u2014";
    $("trkDist").textContent = dist == null ? "\u2014" : step === 2 ? "0 m" : dist >= 1000 ? (dist / 1000).toFixed(1) + " km" : Math.round(dist / 10) * 10 + " m";
    $("trkSpeed").textContent = (step === 1 ? t.speedKmh || 0 : 0) + " km/h";
    $("trkLive").textContent = done ? "Trip ended" : age === null ? "Waiting for the provider to share their location"
        : stale ? "Connection lost, showing last known location" : `Live, updated ${age}s ago`;
    $("trkLive").dataset.state = done ? "off" : age === null || stale ? "stale" : "live";
    if (dist != null) trackStart = Math.max(trackStart, dist);
    $("trkBar").style.width = (step === 2 ? 100 : dist != null && trackStart ? Math.round(100 * Math.min(1, Math.max(0, 1 - dist / trackStart))) : 0) + "%";
    [...$("trkSteps").children].forEach((li, i) => li.classList.toggle("done", i <= step));
    $("trkPay").textContent = t.payment ? paymentText({ ...t.payment, total: Number(t.payment.total) }) : "";
    $("trkPay").dataset.state = t.payment ? t.payment.status : "";
    $("trkNote").textContent = t.destination ? "Position shared live by the provider's phone."
        : "This address has no map pin, so distance and arrival time are not available.";

    // Redraw: the drawing is fitted to every point we know, so it re-zooms as the provider approaches.
    const pts = [...(t.crumbs || [])];
    if (t.destination) pts.push(t.destination);
    if (t.last) pts.push(t.last);
    if (!pts.length) return;
    const P = makeProjector(pts), at = p => P(p).map(n => n.toFixed(1));
    $("trkTrail").setAttribute("points", (t.crumbs || []).map(p => at(p).join(",")).join(" "));
    if (t.destination) { const [x, y] = at(t.destination); $("trkDest").setAttribute("transform", `translate(${x} ${y})`); $("trkDest").style.display = ""; }
    if (t.last) { const [x, y] = at(t.last); $("trkMe").style.transform = `translate(${x}px,${y}px)`; $("trkMe").style.display = ""; }
}

// Keeps "updated Ns ago" ticking between server events, and closes the stream when the page is left.
setInterval(() => {
    if (trackingPage.classList.contains("active")) updateTracking();
    else if (trackES || trackPoll) stopTracking();
}, 1000);
document.getElementById("trackBack").addEventListener("click", () => { stopTracking(); renderHistory(); showAppPage(historyPage); });

/* ---------- Chat assistant: POST /api/assistant/chat (Gemini with a rule-based fallback, both on the server) ---------- */

// The reply is { who: "bot", steps, text, card?, source }. Cards: "book" (a proposal to confirm),
// "results" (service ids) and "track" (a booking reference). Nothing is charged until the person confirms.
async function agentReply(request) {
    const thread = chats[AGENT], typing = { who: "bot", typing: true };
    thread.push(typing);
    renderChat();
    let msg;
    try { msg = (await request()).reply; }
    catch (e) { msg = { who: "bot", text: e.message }; }
    thread[thread.indexOf(typing)] = msg || { who: "bot", text: "I could not do that right now. Please try again." };
    renderChat();
}

function agentRespond(text) {
    // The server wants the earlier turns (not the one just typed), at most 10, with role "user" or "bot".
    const history = chats[AGENT].filter(m => !m.typing && m.text).slice(0, -1).slice(-10)
        .map(m => ({ role: m.who === "me" ? "user" : "bot", text: m.text }));
    return agentReply(() => API.post("/assistant/chat", { message: text, history }));
}

function msgHtml(m, i) {
    if (typeof m === "string") m = { who: "me", text: m };
    if (m.who === "me") return `<p class="msg">${escapeHtml(m.text)}</p>`;
    if (m.typing) return '<p class="msg bot typing" role="status" aria-label="Assistant is typing"><span></span><span></span><span></span></p>';
    const steps = m.steps ? `<ul class="agent-steps">${m.steps.map(s => `<li><i data-lucide="check"></i>${escapeHtml(s)}</li>`).join("")}</ul>` : "";
    return `<div class="msg bot">${steps}<p>${escapeHtml(m.text)}</p>${m.card ? cardHtml(m.card, i) : ""}</div>`;
}
function cardHtml(c, i) {
    const row = (l, v) => `<div class="sum-row"><span>${l}</span><span>${escapeHtml(v)}</span></div>`;
    if (c.type === "book") {
        const s = serviceCatalog.find(x => x.id === c.serviceId);
        if (!s) return "";
        const q = quote(s, c.qty), cash = c.method === "cash";
        const actions = c.state === "proposed"
            ? `<div class="row-actions"><button type="button" class="dash-button" data-card-act="confirm" data-mi="${i}">${cash ? "Confirm booking" : "Review and pay"}</button><button type="button" class="dash-button" data-card-act="cancel" data-mi="${i}">Cancel</button></div>`
            : `<span class="pay-chip">${{ done: "Booked", handoff: "Opened checkout", cancelled: "Cancelled" }[c.state]}</span>`;
        return `<div class="agent-card">${row("Service", s.name)}${row("When", c.whenLabel)}${row("Where", mockUserProfile.location)}${row("Pay with", PAY_METHODS[c.method][0])}${row("Estimated total", peso(q.total))}${actions}</div>`;
    }
    if (c.type === "results") return `<div class="agent-card">${c.ids.map(id => {
        const s = serviceCatalog.find(x => x.id === id);
        if (!s) return "";
        return `<div class="sum-row"><span>${escapeHtml(s.name)}<br><small class="service-meta">${escapeHtml(s.provider)}, ${s.rating.toFixed(1)}, ${peso(s.price)} ${s.unit}</small></span><button type="button" class="dash-button" data-card-act="propose" data-sid="${id}">Book</button></div>`;
    }).join("")}</div>`;
    if (c.type === "track") return `<div class="agent-card"><div class="row-actions"><button type="button" class="dash-button" data-card-act="track" data-ref="${escapeHtml(c.ref)}">Open live map</button></div></div>`;
    return "";
}

chatMessages.setAttribute("role", "log");
chatMessages.addEventListener("click", async function (event) {
    const b = event.target.closest("[data-card-act]");
    if (!b) return;
    const act = b.dataset.cardAct, thread = chats[chatWith], m = thread[Number(b.dataset.mi)];
    // "Book" on a result card: the server prepares a proposal (POST /assistant/propose), no AI involved.
    if (act === "propose") return agentReply(() => API.post("/assistant/propose", { serviceId: Number(b.dataset.sid) }));
    if (act === "track") { const item = mockHistory.find(h => h.ref === b.dataset.ref); return item && openTracking(item); }

    const c = m && m.card, s = c && serviceCatalog.find(x => x.id === c.serviceId);
    if (!c || !s) return;
    if (act === "cancel") { c.state = "cancelled"; return renderChat(); }
    if (c.method === "cash" && mockUserProfile.location) {
        // Cash needs no authorisation step, so the assistant can book it after one confirmation.
        try {
            const item = await createBooking(s, { location: mockUserProfile.location, date: c.date, time: c.time, qty: c.qty, method: "cash" });
            c.state = "done";
            thread.push({ who: "bot", text: `Booked. Reference ${item.ref}. Pay ${peso(item.payment.total)} in cash to ${s.provider} after the job.`, card: { type: "track", ref: item.ref } });
        } catch (e) {
            thread.push({ who: "bot", text: e.message });
        }
        return renderChat();
    }
    // Online payments (and cash with no saved address) always go through checkout, so the person reviews every field.
    c.state = "handoff"; renderChat();
    openCheckout(s, { date: c.date, time: c.time, qty: c.qty, method: c.method });
});
document.getElementById("chatChips").innerHTML = ["Book a plumber tomorrow 9am, pay with GCash", "Cheap cleaning under \u20b11000", "Where is my provider?", "Show my payments"]
    .map(t => `<button type="button">${escapeHtml(t)}</button>`).join("");
document.getElementById("chatChips").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (b) { chatInput.value = b.textContent; document.getElementById("chatForm").requestSubmit(); }
});

function profileComplete() {
    return profileFields.filter(field => !field.optional).every(field => String(mockUserProfile[field.key]).trim() !== "");
}

/* ---------- Footer pages ---------- */

// Mock content for the footer pages: [label, text] rows.
const infoPages = {
    "how-it-works": ["Find, hire and review a service in four steps.", [
        ["1. Search", "Browse categories or search for the service you need."],
        ["2. Compare", "Open a service to see its price, rating, skills and availability."],
        ["3. Hire", "Hire the provider, or ask them a question first through chat."],
        ["4. Review", "After the job is finished, rate the provider or report a problem."]]],
    "help": ["Answers to common questions.", [
        ["How do I hire a provider?", "Open a service from the directory, then press Hire on its page."],
        ["How do I pay?", "Choose GCash, Maya, card or cash at checkout. Online payments are held until the job is finished, then released to the provider."],
        ["Can I cancel a hire?", "Message the provider through chat before the job starts to agree on a cancellation."],
        ["How do I become a provider?", "Log in, press Become a provider and complete your profile."],
        ["My service is not listed", "Use Request Service in the footer and we will notify you when a provider offers it."]]],
    "safety": ["Simple habits for safer hiring.", [
        ["Verify the provider", "Check ratings, reviews and the skills listed on the service page."],
        ["Keep chats in the app", "Use chat to agree on price and schedule so there is a record."],
        ["Stay safe at home", "For first jobs, have another person present and share the schedule with them."],
        ["Report problems", "After a job, use Report in your History to flag unsafe or unfair behavior."]]],
    "contact": ["We usually reply within one business day.", [
        ["Email", "support@skilllink.example"],
        ["Phone", "+63 82 555 0100"],
        ["Address", "Roxas Avenue, Davao City, Davao Region"],
        ["Hours", "Monday to Saturday, 8:00 AM to 6:00 PM"]]],
    "about": ["Local services, made easy to find.", [
        ["Who we are", "Skill Link connects people in Davao with local service providers."],
        ["Our mission", "Every problem has a solution, and the right person to solve it should be easy to find."],
        ["Founded", "2026, in Davao City."],
        ["Team", "A small team of designers and engineers based in Davao."]]],
    "terms": ["Last updated October 1, 2026.", [
        ["1. Using Skill Link", "You must be 18 or older and provide accurate account information."],
        ["2. Hiring and payment", "Skill Link connects you with providers. Agreements and payments are between you and the provider."],
        ["3. Provider conduct", "Providers must describe their services honestly and complete the work they accept."],
        ["4. Reviews and reports", "Ratings must reflect your real experience. Abuse of reports may lead to account removal."],
        ["5. Changes", "We may update these terms. Continued use means you accept the changes."]]],
    "privacy": ["Last updated October 1, 2026.", [
        ["Information we collect", "Your name, age, contact number, email address and location."],
        ["How we use it", "To show your profile to providers you hire and to match you with services."],
        ["Sharing", "We share your contact details only with providers you choose to hire or message."],
        ["Your choices", "You can edit your information anytime from your profile page."],
        ["Questions", "Send privacy questions to support@skilllink.example."]]]
};
let footerReturn = "landing";

document.getElementById("reqCategory").innerHTML =
    '<option value="">Select category</option>' +
    serviceCategories.map(category => `<option>${escapeHtml(category)}</option>`).join("");

function openFooterPage(key, title) {
    if (key === "browse") return showMainPage();

    if (key === "request") {
        document.getElementById("requestStatus").hidden = true;
        return showAppPage(requestServicePage);
    }

    const [sub, rows] = infoPages[key];
    document.getElementById("infoTitle").textContent = title;
    document.getElementById("infoSub").textContent = sub;
    document.getElementById("infoBody").innerHTML = `<div class="profile-details">${rows.map(([label, text]) => `
                <div class="profile-row">
                    <span class="profile-label">${escapeHtml(label)}</span>
                    <div class="profile-value">${escapeHtml(text)}</div>
                </div>`).join("")}</div>`;
    showAppPage(infoPage);
}

document.querySelector("footer").addEventListener("click", function (event) {
    const link = event.target.closest("[data-footer]");
    if (!link) return;

    event.preventDefault();
    footerReturn = footerMain.style.display === "flex" ? "main" : "landing";
    openFooterPage(link.dataset.footer, link.textContent.trim());
});

document.querySelectorAll("[data-footer-back]").forEach(button => {
    button.addEventListener("click", () => footerReturn === "main" ? showMainPage() : showLandingPage());
});

document.getElementById("requestServiceForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!isLoggedIn()) return showLoginForm();

    const form = this;
    try {
        await API.post("/service-requests", {
            name: document.getElementById("reqName").value.trim(),
            category: document.getElementById("reqCategory").value,
            budget: Number(document.getElementById("reqBudget").value) || 0,
            location: document.getElementById("reqLocation").value.trim(),
            description: document.getElementById("reqDescription").value.trim()
        });
    } catch (e) {
        toast(e.message);
        return;
    }
    loadNotifications();                  // the server confirms with a "Service request sent" notification
    form.reset();
    document.getElementById("requestStatus").hidden = false;
});

document.getElementById("detailBody").addEventListener("submit", async function (event) {
    if (event.target.id !== "reviewForm") return;
    event.preventDefault();

    const submit = event.target.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
        await submitReview({ serviceId: detailId }, document.getElementById("reviewText").value.trim(), reviewPicker);
        openServiceDetail(detailId, { scroll: true, posted: true });
    } catch (e) {
        toast(e.message);
        if (submit) submit.disabled = false;
    }
});

/* ---------- Dark / light mode ---------- */
const slRoot = document.documentElement;
const slThemeBtn = document.getElementById("themeToggle");

function applyTheme(theme, save) {
    slRoot.dataset.theme = theme;
    slThemeBtn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    if (save) { try { localStorage.setItem("sl-theme", theme); } catch (e) { } }
}
applyTheme(slRoot.dataset.theme, false);
slThemeBtn.addEventListener("click", () => applyTheme(slRoot.dataset.theme === "dark" ? "light" : "dark", true));

/* ---------- Mobile account menu ---------- */
(function () {
    const header = document.querySelector("header");
    const btn = document.getElementById("menuButton");
    const menu = document.getElementById("mobileMenu");
    const actions = {
        profile: () => userAvatar.click(),
        cart: () => document.getElementById("cartButton").click(),
        provider: () => providerButton.click(),
        theme: () => slThemeBtn.click(),
        logout: () => logoutButton.click()
    };
    function setOpen(open) {
        menu.hidden = !open;
        btn.setAttribute("aria-expanded", String(open));
        btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }
    function syncMenu() {
        document.getElementById("menuAvatar").textContent = userAvatar.textContent;
        document.getElementById("menuProfileLabel").textContent = userAvatar.title && userAvatar.title !== "User" ? userAvatar.title : "Profile";
        document.getElementById("menuProviderLabel").textContent = providerButton.textContent;
        document.getElementById("menuThemeLabel").textContent = slRoot.dataset.theme === "dark" ? "Light mode" : "Dark mode";
    }
    btn.addEventListener("click", () => { if (menu.hidden) syncMenu(); setOpen(menu.hidden); });
    menu.addEventListener("click", function (event) {
        const item = event.target.closest("[data-menu]");
        if (!item) return;
        setOpen(false);
        actions[item.dataset.menu]();
    });
    document.addEventListener("click", e => { if (!menu.hidden && !header.contains(e.target)) setOpen(false); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !menu.hidden) { setOpen(false); btn.focus(); } });
    window.matchMedia("(min-width: 720px)").addEventListener("change", e => { if (e.matches) setOpen(false); });
    // Follow the login state that the existing code keeps on #loggedInHeader.
    const sync = () => { const on = isLoggedIn(); header.classList.toggle("signed-in", on); if (!on) setOpen(false); };
    new MutationObserver(sync).observe(loggedInHeader, { attributes: true, attributeFilter: ["style"] });
    sync();
})();

/* ---------- Show / hide password ---------- */
function hidePasswords() {
    document.querySelectorAll(".pw-toggle").forEach(btn => {
        btn.classList.remove("is-shown");
        btn.setAttribute("aria-label", "Show " + btn.dataset.name);
        btn.parentElement.querySelector("input").type = "password";
    });
}
document.querySelectorAll(".pw-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
        const input = btn.parentElement.querySelector("input");
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.classList.toggle("is-shown", show);
        btn.setAttribute("aria-label", (show ? "Hide " : "Show ") + btn.dataset.name);
    });
});
document.querySelectorAll("[data-close-auth]").forEach(btn => btn.addEventListener("click", hidePasswords));
[loginForm, signupForm].forEach(form => form.addEventListener("reset", hidePasswords));

/* ---------- Login / Signup switcher inside the auth forms ---------- */
document.querySelectorAll("[data-auth-tab]").forEach(tab => {
    tab.addEventListener("click", () => {
        hidePasswords();
        openAuthModal(tab.dataset.authTab === "signup");
    });
});

/* ---------- Category slider: arrows, drag, fades, center active chip ---------- */
(function () {
    const track = categorySlider;
    const wrap = track.parentElement;
    const prev = wrap.querySelector("[data-cat-prev]");
    const next = wrap.querySelector("[data-cat-next]");
    let raf = 0;

    function update() {
        const max = track.scrollWidth - track.clientWidth;
        const x = track.scrollLeft;
        const atStart = x <= 2, atEnd = x >= max - 2;
        wrap.classList.toggle("no-overflow", max <= 2);
        prev.disabled = atStart;
        next.disabled = atEnd;
        track.style.setProperty("--fl", atStart ? "0px" : "2.5rem");
        track.style.setProperty("--fr", atEnd ? "0px" : "2.5rem");
    }
    const queueUpdate = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };

    track.addEventListener("scroll", queueUpdate, { passive: true });
    window.addEventListener("resize", queueUpdate);
    if ("ResizeObserver" in window) new ResizeObserver(queueUpdate).observe(track); /* also fires when the main page becomes visible */

    [[prev, -1], [next, 1]].forEach(([button, dir]) =>
        button.addEventListener("click", () => track.scrollBy({ left: dir * Math.max(160, track.clientWidth * 0.8) })));

    /* Mouse drag (touch already swipes natively) */
    let down = false, moved = false, startX = 0, startLeft = 0;
    track.addEventListener("pointerdown", event => {
        if (event.pointerType !== "mouse" || event.button !== 0) return;
        down = true; moved = false; startX = event.clientX; startLeft = track.scrollLeft;
    });
    track.addEventListener("pointermove", event => {
        if (!down) return;
        const dx = event.clientX - startX;
        if (!moved && Math.abs(dx) > 5) {
            moved = true;
            track.classList.add("dragging");
            track.setPointerCapture(event.pointerId);
        }
        if (moved) track.scrollTo({ left: startLeft - dx, behavior: "instant" });
    });
    function endDrag(event) {
        if (!down) return;
        down = false;
        track.classList.remove("dragging");
        if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
        setTimeout(() => { moved = false; });
    }
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);
    /* A drag must not count as picking a category */
    track.addEventListener("click", event => { if (moved) { event.stopPropagation(); event.preventDefault(); } }, true);

    /* Keep the chosen chip centered */
    track.addEventListener("click", event => {
        const chip = event.target.closest("span");
        if (!chip) return;
        const t = track.getBoundingClientRect(), c = chip.getBoundingClientRect();
        track.scrollBy({ left: c.left - t.left - (t.width - c.width) / 2 });
    });

    update();
})();

/* ---------- Hero background: needs find skills ---------- */
(function () {
    const canvas = document.getElementById("heroNet");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    /* [what someone needs, who can do it, rating] */
    const PAIRS = [
        ["Leaking sink", "Plumber", "4.9"], ["Shop website", "Web developer", "4.8"], ["Math tutor", "Tutor", "5.0"],
        ["Aircon not cooling", "Technician", "4.7"], ["Product photos", "Photographer", "4.9"], ["House cleaning", "Cleaner", "4.8"],
        ["Logo for my brand", "Designer", "5.0"], ["Broken laptop", "IT repair", "4.8"], ["Moving house", "Mover", "4.7"]
    ];
    const SIGNAL = "#7FE3B5", INK = "#0F1D18", PAPER = "#F4F1EA", MIST = "#CFE3D6";
    const DRAW = 1000, HOLD = 2700, FADE = 600, RING = 900;
    const FONT = px => `600 ${px}px 'Space Grotesk', system-ui, sans-serif`;
    let w = 0, h = 0, dpr = 1, nodes = [], matches = [], sparks = [], nextSpark = 0, clock = 0, raf = 0, running = false, last = 0, nextAt = 0, pairIdx = 0;
    let onScreen = false, S = 1, minD = 60, link = 150;   /* S scales nodes and pills on small screens */
    const c = { accent: "#2E6B52", soft: MIST, text: INK, dark: false };

    const rand = (a, b) => a + Math.random() * (b - a);
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    function readColors() {
        const root = document.documentElement, cs = getComputedStyle(root);
        c.accent = cs.getPropertyValue("--accent").trim() || c.accent;
        c.soft = cs.getPropertyValue("--accent-soft").trim() || c.soft;
        c.text = cs.getPropertyValue("--text").trim() || c.text;
        c.dark = root.getAttribute("data-theme") === "dark";
    }

    function build() {
        S = w < 600 ? 0.8 : 1;
        const count = clamp(Math.round((w * h) / 13000), 14, 32);
        minD = clamp(Math.sqrt((w * h) / count) * 0.75, 50, 140);
        link = Math.max(110, minD * 1.7);
        const lo = 32, hi = Math.max(lo + 1, w - 32), top = 46, bot = Math.max(top + 1, h - 54);
        /* One node per vertical slice, in random order, so the field spreads evenly across the width.
           Each node takes the best of a few random heights: the one farthest from the nodes already placed. */
        const slices = Array.from({ length: count }, (_, i) => i).sort(() => Math.random() - 0.5);
        const placed = [];
        slices.forEach(i => {
            let best = null, bestD = -1;
            for (let k = 0; k < 24; k++) {
                const x = lo + (i + rand(0.1, 0.9)) / count * (hi - lo), y = rand(top, bot);
                const d = placed.reduce((m, q) => Math.min(m, Math.hypot(q.x - x, q.y - y)), Infinity);
                if (d > bestD) { bestD = d; best = { x, y }; }
            }
            placed.push(best);
        });
        nodes = placed.map((q, i) => {
            const angle = rand(0, Math.PI * 2), speed = rand(7, 16);
            return { kind: i % 2 ? "skill" : "need", x: q.x, y: q.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, ph: rand(0, Math.PI * 2) };
        });
        matches = []; sparks = [];
    }

    function resize() {
        const r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return;
        if (Math.abs(r.width - w) < 8 && Math.abs(r.height - h) < 8 && nodes.length) return;
        w = r.width; h = r.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        build();
    }

    function spawnMatch(now) {
        const busy = new Set(matches.flatMap(m => [m.n, m.s]));
        const needs = nodes.filter(n => n.kind === "need" && !busy.has(n));
        if (!needs.length) return;
        const n = needs[Math.floor(Math.random() * needs.length)];
        const maxD = Math.max(260, w * 0.55);
        const options = nodes.filter(k => k.kind === "skill" && !busy.has(k))
            .map(k => ({ k, d: Math.hypot(k.x - n.x, k.y - n.y) }))
            .filter(o => o.d >= 80 * S && o.d <= maxD).sort((a, b) => a.d - b.d).slice(0, 3);
        if (!options.length) return;
        const best = options[Math.floor(Math.random() * options.length)].k;
        const mx = (n.x + best.x) / 2, my = (n.y + best.y) / 2;
        if (matches.some(m => Math.hypot((m.n.x + m.s.x) / 2 - mx, (m.n.y + m.s.y) / 2 - my) < 140)) return; /* keep labels apart */
        matches.push({ n, s: best, t0: now, pair: PAIRS[pairIdx++ % PAIRS.length] });
    }

    function roundRect(x, y, pw, ph, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + pw, y, x + pw, y + ph, r); ctx.arcTo(x + pw, y + ph, x, y + ph, r);
        ctx.arcTo(x, y + ph, x, y, r); ctx.arcTo(x, y, x + pw, y, r);
        ctx.closePath();
    }

    /* A small label that pops in above or below a node */
    function pill(text, x, y, fill, fg, alpha, k, below) {
        ctx.font = FONT(Math.max(10, 12 * S));
        const pw = ctx.measureText(text).width + 22 * S, ph = 24 * S;
        const cx = clamp(x, pw / 2 + 6, w - pw / 2 - 6), cy = y + (below ? 22 : -22) * S;
        const sc = reduce.matches ? 1 : 0.7 + 0.3 * ease(k) + 0.1 * Math.sin(Math.PI * k);
        ctx.save();
        ctx.globalAlpha = alpha * Math.min(1, k * 2);
        ctx.translate(cx, cy); ctx.scale(sc, sc);
        roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2);
        ctx.fillStyle = fill; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = c.dark ? "rgba(0,0,0,.25)" : c.accent; ctx.stroke();
        ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(text, 0, 0.5);
        ctx.restore();
    }

    const pulse = n => reduce.matches ? 0 : 0.7 * Math.sin(clock / 700 + n.ph);

    function drawNode(n, state) {
        ctx.beginPath();
        if (n.kind === "need") {
            ctx.arc(n.x, n.y, (state ? 7 : 5 + pulse(n)) * S, 0, Math.PI * 2);
            ctx.fillStyle = state === 2 ? SIGNAL : c.soft; ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = state ? (state === 2 ? c.text : SIGNAL) : c.accent;
            ctx.globalAlpha = state ? 1 : 0.8; ctx.stroke();
        } else {
            ctx.arc(n.x, n.y, (state ? 7 : 4.5 + pulse(n)) * S, 0, Math.PI * 2);
            ctx.fillStyle = state ? SIGNAL : c.accent; ctx.globalAlpha = state ? 1 : 0.7; ctx.fill();
            if (state) { ctx.lineWidth = 2; ctx.strokeStyle = c.text; ctx.stroke(); }
        }
        ctx.globalAlpha = 1;
    }

    function spawnSpark(now) {
        const a = nodes[Math.floor(Math.random() * nodes.length)];
        const near = nodes.filter(k => k !== a && Math.hypot(k.x - a.x, k.y - a.y) < link);
        if (!near.length) return;
        sparks.push({ a, b: near[Math.floor(Math.random() * near.length)], t0: now, dur: rand(650, 1000) });
    }

    function draw(now) {
        clock = now;
        ctx.clearRect(0, 0, w, h);
        /* faint constellation between close neighbours */
        ctx.lineWidth = 1; ctx.strokeStyle = c.accent;
        for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
            const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
            if (d < link) { ctx.globalAlpha = 0.22 * (1 - d / link); ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke(); }
        }
        ctx.globalAlpha = 1;

        sparks.forEach(k => {
            const p = clamp((now - k.t0) / k.dur, 0, 1), q = ease(p), glow = Math.sin(Math.PI * p);
            const x = k.a.x + (k.b.x - k.a.x) * q, y = k.a.y + (k.b.y - k.a.y) * q;
            ctx.globalAlpha = 0.55 * glow; ctx.strokeStyle = SIGNAL; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(k.a.x, k.a.y); ctx.lineTo(k.b.x, k.b.y); ctx.stroke();
            ctx.globalAlpha = glow; ctx.fillStyle = SIGNAL; ctx.strokeStyle = c.accent; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(x, y, 2.8 * S, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        });
        ctx.globalAlpha = 1;

        const state = new Map(), labels = [];
        matches.forEach(m => {
            const e = now - m.t0, fade = clamp((DRAW + HOLD - e) / FADE, 0, 1);
            const p = ease(clamp(e / DRAW, 0, 1));
            const tx = m.n.x + (m.s.x - m.n.x) * p, ty = m.n.y + (m.s.y - m.n.y) * p;
            state.set(m.n, 1);
            ctx.globalAlpha = 0.85 * fade; ctx.strokeStyle = c.accent; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(m.n.x, m.n.y); ctx.lineTo(tx, ty); ctx.stroke();
            labels.push({ text: m.pair[0], x: m.n.x, y: m.n.y, fill: c.dark ? MIST : INK, fg: c.dark ? INK : PAPER, alpha: fade, k: clamp(e / 320, 0, 1), below: false });
            if (p < 1) {
                ctx.globalAlpha = 1; ctx.fillStyle = SIGNAL; ctx.strokeStyle = c.text; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(tx, ty, 4 * S, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            } else {
                state.set(m.n, 2); state.set(m.s, 1);
                const ek = e - DRAW, k = ek / RING;
                if (k >= 0 && k <= 1) [m.n, m.s].forEach(n => {
                    ctx.lineWidth = 2; ctx.strokeStyle = SIGNAL; ctx.globalAlpha = (1 - k) * 0.9;
                    ctx.beginPath(); ctx.arc(n.x, n.y, (8 + k * 24) * S, 0, Math.PI * 2); ctx.stroke();
                });
                labels.push({ text: m.pair[1] + "  \u2605 " + m.pair[2], x: m.s.x, y: m.s.y, fill: SIGNAL, fg: INK, alpha: fade, k: clamp(ek / 320, 0, 1), below: true });
            }
            ctx.globalAlpha = 1;
        });
        nodes.forEach(n => drawNode(n, state.get(n) || 0));
        labels.forEach(l => pill(l.text, l.x, l.y, l.fill, l.fg, l.alpha, l.k, l.below));
    }

    function frame(ts) {
        if (!running) return;
        const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
        const busy = new Set(matches.flatMap(m => [m.n, m.s]));
        if (!reduce.matches) nodes.forEach(n => {
            if (busy.has(n)) return; /* matched people hold still so their labels stay readable */
            n.x += n.vx * dt; n.y += n.vy * dt;
            if (n.x < 32 || n.x > w - 32) { n.vx *= -1; n.x = clamp(n.x, 32, w - 32); }
            if (n.y < 46 || n.y > h - 54) { n.vy *= -1; n.y = clamp(n.y, 46, h - 54); }
        });
        /* Free nodes push each other apart, so they never settle into tight groups */
        if (!reduce.matches) for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
            if (d >= minD || d < 0.1) continue;
            const f = (minD - d) / d * dt * 4, wa = busy.has(a) ? 0 : (busy.has(b) ? 1 : 0.5), wb = busy.has(b) ? 0 : (busy.has(a) ? 1 : 0.5);
            a.x = clamp(a.x - dx * f * wa, 32, w - 32); a.y = clamp(a.y - dy * f * wa, 46, h - 54);
            b.x = clamp(b.x + dx * f * wb, 32, w - 32); b.y = clamp(b.y + dy * f * wb, 46, h - 54);
        }
        matches = matches.filter(m => ts - m.t0 < DRAW + HOLD);
        sparks = sparks.filter(k => ts - k.t0 < k.dur);
        const maxMatches = w > 500 ? 4 : 3;
        if (ts >= nextAt && matches.length < maxMatches) { spawnMatch(ts); nextAt = ts + (reduce.matches ? rand(1100, 1700) : rand(650, 1200)); }
        if (ts >= nextSpark && sparks.length < 12) { spawnSpark(ts); nextSpark = ts + (reduce.matches ? rand(450, 800) : rand(160, 380)); }
        draw(ts);
        raf = requestAnimationFrame(frame);
    }

    function sync() {
        const should = onScreen && !document.hidden;
        if (should && !running) { running = true; last = performance.now(); nextAt = last + 300; nextSpark = last; raf = requestAnimationFrame(frame); }
        else if (!should && running) { running = false; cancelAnimationFrame(raf); }
    }

    readColors();
    new MutationObserver(() => { readColors(); if (!running && w) draw(performance.now()); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas); else window.addEventListener("resize", resize);
    if ("IntersectionObserver" in window) new IntersectionObserver(entries => { onScreen = entries[0].isIntersecting; sync(); }).observe(canvas);
    else { onScreen = true; sync(); }
    document.addEventListener("visibilitychange", sync);
    resize();
})();

/* ---------- Unread dot on the bell ---------- */
function syncBell() { notificationButton.classList.toggle("has-unread", mockNotifications.some(n => n.unread)); }
const nativeUnshift = mockNotifications.unshift.bind(mockNotifications);
mockNotifications.unshift = (...items) => { const total = nativeUnshift(...items); syncBell(); return total; };
document.addEventListener("click", () => setTimeout(syncBell));
syncBell();

/* ---------- Boot: load real data, restore a saved session ---------- */
window.addEventListener("sl:session-expired", function () {
    if (!isLoggedIn()) return;
    logoutButton.click();
    showLoginForm();
});

// The server owns the platform fee; the checkout summary must use the same number the booking will.
async function loadConfig() {
    try { const c = await API.get("/config"); if (Number.isFinite(Number(c.platformFee))) PLATFORM_FEE = Number(c.platformFee); }
    catch (e) { /* keep the built-in default */ }
}

(async function boot() {
    loadConfig();
    loadCatalog();                               // public data: don't wait for the login check
    if (!API.signedIn) return;
    try {
        const me = await API.get("/me");
        applyMe(me);
        showMainPage();
    } catch (e) { /* a dead session was already cleared by the API client */ }
})();

lucide.createIcons();

/* ================= ADMIN MODULE =================
   Talks to /api/admin/*. The login, the is_admin role check, the 30-minute idle limit and the audit log
   all live on the server now; this page only draws what the API returns and sends the admin's decisions back. */
(function () {
    const $ = s => document.querySelector(s), esc = escapeHtml;
    const adminPage = $("#adminPage"), ov = $("#admOv"), panel = $("#admPanel"), modal = $("#adminAuthModal");
    appPages.push(adminPage);
    const A = API.admin;
    const IDLE = 30 * 60000;                       // the server enforces the same limit; this only mirrors it in the UI
    const REASONS = ["Repeated client complaints", "No-show or late arrivals", "Off-app payment requests", "Unsafe or rude behavior", "Misleading profile or listing", "Other"];
    let overview = null, rows = [], cur = null, curName = "", opener = null, qTimer = null;

    const badge = status => `<span class="adm-badge ${esc(status.kind)}">${esc(status.label)}</span>`;
    const filters = () => ({ q: $("#admQ").value.trim(), status: $("#admFilter").value, sort: $("#admSort").value });

    // 401 means the admin session ended: the API client already cleared it and fired sl:admin-expired.
    async function call(fn) {
        try { return await fn(); }
        catch (e) { if (e.status !== 401) toast(e.message); throw e; }
    }
    function lockOut(msg) { A.clear(); closeDetail(); showLandingPage(); openLogin(msg); }
    window.addEventListener("sl:admin-expired", () => { if (adminPage.classList.contains("active")) lockOut("Session expired. Please sign in again."); });

    async function refresh() {
        const [o, r] = await call(() => Promise.all([A.get("/admin/overview"), A.get("/admin/providers", filters())]));
        overview = o; rows = r.items || [];
        render();
    }
    async function refreshRows() {
        try { rows = (await call(() => A.get("/admin/providers", filters()))).items || []; } catch (e) { return; }
        renderRows();
    }

    function renderRows() {
        $("#admRows").innerHTML = rows.map(p => `<tr>
            <td>${esc(p.name)}</td><td>${p.services}</td><td>${p.reviews ? "\u2605 " + Number(p.rating).toFixed(1) : "None"}</td><td>${p.reviews}</td><td>${p.low}${p.flagged ? `<small>${p.flagged} to remove</small>` : ""}</td><td>${p.openReports}</td><td>${badge(p.status)}</td>
            <td><div class="adm-acts"><button type="button" class="dash-button" data-view="${esc(p.id)}">View</button><button type="button" class="dash-button adm-warnbtn" data-warn="${esc(p.id)}">Warn</button></div></td></tr>`).join("")
            || `<tr><td colspan="8">No providers match.</td></tr>`;
    }

    function render() {
        const k = overview.kpis, th = overview.thresholds;
        $("#admKpis").innerHTML = [[k.providers, "Service providers"], [k.services, "Listed services"], [Number(k.avgRating).toFixed(2), "Avg. client rating"], [k.reviews, "Client reviews"], [k.lowRatings, "Valid low ratings"], [k.openReports, "Open reports"], [k.warnings, "Warnings issued"]]
            .map(([n, l]) => `<div class="adm-kpi"><b>${n}</b><span>${l}</span></div>`).join("");
        renderRows();

        const low = overview.lowServices || [], gone = overview.removed || [];
        $("#admLow").innerHTML = `<h2 tabindex="-1">Low-rated services</h2>
            <p class="adm-note">A service can be removed once it has ${th.removeAt} valid low ratings (0 to ${th.lowMax} stars).</p>
            ${low.length ? `<div class="adm-lowgrid">${low.slice(0, 6).map(v => `<div class="adm-item adm-svc"><div><b>${esc(v.name)}</b><small>${esc(v.provider)} \u00b7 ${esc(v.category)}</small><small>${v.lowCount} valid low rating${v.lowCount === 1 ? "" : "s"}</small></div>${v.removable ? `<button type="button" class="dash-button adm-dangerbtn" data-remove="${v.id}" data-name="${esc(v.name)}" aria-label="Remove service ${esc(v.name)}">Remove service</button>` : ""}</div>`).join("")}</div>` : `<p class="adm-note">No low ratings yet.</p>`}
            ${gone.length ? `<h3>Removed services</h3><div class="adm-lowgrid">${gone.map(v => `<div class="adm-item adm-svc"><div>${esc(v.name)}<small>${esc(v.provider)} \u00b7 Removed ${fmtDate(v.removedAt)} after ${v.lowCount} valid low ratings</small></div><button type="button" class="dash-button" data-restore="${v.id}" aria-label="Restore service ${esc(v.name)}">Restore</button></div>`).join("")}</div>` : ""}`;

        const open = overview.openReports || [];
        $("#admReps").innerHTML = open.length ? open.slice(0, 6).map(r => `<div class="adm-item"><b>${esc(r.provider)}</b>, ${esc(r.reason)}<small>${esc(r.by)} \u00b7 ${fmtDate(r.at)} \u00b7 <button type="button" class="adm-link" data-view="${esc(r.providerId)}">Review</button></small></div>`).join("") : `<p class="adm-note">No open reports.</p>`;

        $("#admCats").innerHTML = (overview.categories || []).map(c => `<div class="adm-item"><b>${esc(c.name)}</b> <small style="display:inline">\u00b7 ${c.services} services \u00b7 \u2605 ${Number(c.rating).toFixed(1)}</small><div class="adm-bar"><i style="width:${Number(c.rating) / 5 * 100}%"></i></div></div>`).join("");
        $("#admLog").innerHTML = (overview.log || []).length ? overview.log.slice(0, 8).map(e => `<div class="adm-item">${esc(e.text)}<small>${fmtDate(e.at)}</small></div>`).join("") : `<p class="adm-note">Nothing yet.</p>`;
    }

    /* ---- Provider detail + warning ---- */
    async function openDetail(id, warn) {
        let d;
        try { d = await call(() => A.get("/admin/providers/" + id)); } catch (e) { return; }
        cur = id; curName = d.name;
        if (!ov.classList.contains("open")) opener = document.activeElement;
        const active = (d.services || []).filter(v => v.status === "active");
        panel.innerHTML = `
            <div class="adm-ph"><div><h2>${esc(d.name)}</h2>${badge(d.status)}</div><button type="button" class="dash-button" id="admClose">Close</button></div>
            <div class="adm-stats"><span><b>${d.reviews ? Number(d.rating).toFixed(1) : "\u2013"}</b> rating</span><span><b>${d.reviews}</b> reviews</span><span><b>${d.low}</b> low ratings</span><span><b>${active.length}</b> services</span><span><b>${d.openReports}</b> open reports</span><span><b>${d.warningCount}</b> warnings</span></div>
            <h3>Services</h3>${active.map(v => `<div class="adm-item adm-svc"><div>${esc(v.name)}<small>${esc(v.category)} \u00b7 \u2605 ${Number(v.rating).toFixed(1)} from ${v.reviews} reviews</small>${v.lowCount ? `<small>${v.lowCount} valid low rating${v.lowCount === 1 ? "" : "s"}</small>` : ""}</div>${v.removable ? `<button type="button" class="dash-button adm-dangerbtn" data-remove="${v.id}" data-name="${esc(v.name)}" aria-label="Remove service ${esc(v.name)}">Remove service</button>` : ""}</div>`).join("") || `<p class="adm-note">No active services.</p>`}
            ${d.removed.length ? `<h3>Removed services</h3>${d.removed.map(v => `<div class="adm-item adm-svc"><div>${esc(v.name)}<small>${esc(v.category)} \u00b7 Removed ${fmtDate(v.removedAt)} after ${v.lowCount} valid low ratings</small></div><button type="button" class="dash-button" data-restore="${v.id}" aria-label="Restore service ${esc(v.name)}">Restore</button></div>`).join("")}` : ""}
            <h3>Reports (${d.reports.length})</h3>${d.reports.length ? d.reports.map(r => `<div class="adm-item"><b>${esc(r.reason)}</b> <span class="adm-badge ${r.status === "open" ? "warn" : "ok"}">${r.status === "open" ? "Open" : "Resolved"}</span><br>${esc(r.details)}<small>${esc(r.by)} \u00b7 ${fmtDate(r.at)}</small>${r.evidence.length ? `<div class="adm-shots">${r.evidence.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Evidence"></a>`).join("")}</div>` : ""}${r.status === "open" ? `<button type="button" class="dash-button" data-resolve="${r.rawId}" style="margin-top:6px">Mark resolved</button>` : ""}</div>`).join("") : `<p class="adm-note">No reports.</p>`}
            <h3>Client reviews</h3>${d.reviewsList.length ? d.reviewsList.map(r => `<div class="adm-item"><b>${esc(r.name)}</b> ${starsStatic(r.stars)}<br>${esc(r.text)}<small>${esc(r.service)} \u00b7 ${fmtDate(r.date)}</small></div>`).join("") : `<p class="adm-note">No reviews yet.</p>`}
            <h3>Send a warning</h3>
            ${d.warnings.map(w => `<div class="adm-item">${esc(w.reason)}${w.message ? ": " + esc(w.message) : ""}<small>${fmtDate(w.at)} \u00b7 ${esc(w.by)}</small></div>`).join("")}
            <form id="admWarnForm"><label for="admWarnReason">Reason</label><select id="admWarnReason">${REASONS.map(r => `<option>${r}</option>`).join("")}</select>
            <label for="admWarnMsg">Message to the provider (optional)</label><textarea id="admWarnMsg" maxlength="300"></textarea>
            <button type="submit" class="provider-submit-button" style="margin-top:12px">Send warning</button></form>`;
        ov.classList.add("open");
        (warn ? $("#admWarnReason") : $("#admClose")).focus();
        if (warn) $("#admWarnForm").scrollIntoView({ block: "center" });
    }
    function closeDetail() { ov.classList.remove("open"); cur = null; if (opener && opener.isConnected) opener.focus(); }

    // Run one admin action, then redraw everything from the server's new state (and the public directory, which may have changed).
    async function act(fn) {
        try { await call(fn); } catch (e) { return; }
        await refresh().catch(() => { });
        loadCatalog();
        if (ov.classList.contains("open") && cur) openDetail(cur);
    }
    const removeService = async b => (await ask("It will no longer be listed. You can restore it later.", { header: "Remove \"" + (b.dataset.name || "this service") + "\"?", confirmText: "Remove" }))
        && act(() => A.post(`/admin/services/${b.dataset.remove}/remove`));
    const restoreService = b => act(() => A.post(`/admin/services/${b.dataset.restore}/restore`));

    panel.addEventListener("submit", async e => {
        if (e.target.id !== "admWarnForm") return; e.preventDefault();
        if (!(await ask("The provider is notified.", { header: "Send a warning to " + curName + "?", confirmText: "Send warning" }))) return;
        act(() => A.post(`/admin/providers/${cur}/warnings`, { reason: $("#admWarnReason").value, message: $("#admWarnMsg").value.trim() }));
    });
    panel.addEventListener("click", e => {
        if (e.target.closest("#admClose")) return closeDetail();
        const b = e.target.closest("[data-resolve],[data-remove],[data-restore]"); if (!b) return;
        if (b.dataset.remove) return removeService(b);
        if (b.dataset.restore) return restoreService(b);
        act(() => A.post(`/admin/reports/${b.dataset.resolve}/resolve`));
    });
    ov.addEventListener("click", e => { if (e.target === ov) closeDetail(); });
    adminPage.addEventListener("click", e => {
        const b = e.target.closest("[data-view],[data-warn],[data-remove],[data-restore]"); if (!b) return;
        if (b.dataset.remove) return removeService(b);
        if (b.dataset.restore) return restoreService(b);
        openDetail(b.dataset.view || b.dataset.warn, !!b.dataset.warn);
    });
    $("#admQ").addEventListener("input", () => { clearTimeout(qTimer); qTimer = setTimeout(refreshRows, 250); });   // wait for a pause in typing
    ["#admFilter", "#admSort"].forEach(sel => $(sel).addEventListener("input", refreshRows));

    /* ---- Open / lock / sign out ---- */
    const hide = hideAllContent;
    hideAllContent = function () { document.body.classList.remove("admin-mode"); closeDetail(); modal.classList.remove("open"); hide(); };
    async function openAdmin() {
        if (!A.signedIn) return openLogin();
        try { await refresh(); }
        catch (e) { if (!A.signedIn) openLogin("Session expired. Please sign in again."); return; }
        showAppPage(adminPage); document.body.classList.add("admin-mode");
        $("#admWho").textContent = "Logged in as " + A.email + ". Logs out after 30 minutes of inactivity.";
    }
    function openLogin(msg) {
        $("#admErr").hidden = !msg; if (msg) $("#admErr").textContent = msg;
        modal.classList.add("open"); $("#admEmail").focus();
    }

    $("#adminLoginForm").addEventListener("submit", async e => {
        e.preventDefault();
        const err = $("#admErr"), btn = e.target.querySelector("[type=submit]"); err.hidden = true; btn.disabled = true;
        try {
            await A.login($("#admEmail").value, $("#admPw").value);   // POST /api/admin/login: refused unless the account is an admin
            modal.classList.remove("open"); e.target.reset(); openAdmin();
        } catch (x) { err.textContent = x.message; err.hidden = false; $("#admPw").value = ""; }
        finally { btn.disabled = false; }
    });
    $("#admOut").addEventListener("click", async () => { await A.logout(); showLandingPage(); });
    // Shortcut in the login form: closes it and opens the admin sign-in (or the console itself when already signed in)
    $("#adminAuthLink").addEventListener("click", e => { e.preventDefault(); closeAuthModal(); openAdmin(); });
    document.querySelectorAll("[data-adm-close]").forEach(b => b.addEventListener("click", () => modal.classList.remove("open")));
    document.addEventListener("keydown", e => { if (e.key === "Escape") { closeDetail(); modal.classList.remove("open"); } });
    setInterval(() => { if (adminPage.classList.contains("active") && A.signedIn && Date.now() - A.seen > IDLE) lockOut("Session expired. Please sign in again."); }, 30000);

    /* ---- Entry points: footer link and #admin ---- */
    document.querySelectorAll(".footer-for-landing-page,.footer-for-mainpage").forEach(f => {
        const b = document.createElement("button"); b.type = "button"; b.className = "adm-entry"; b.textContent = "Admin";
        b.addEventListener("click", openAdmin);
        const row = f.querySelector(".footer-copy, :scope > p") || f;
        row.classList.add("adm-copyrow"); row.appendChild(b);
    });
    const route = () => { if (location.hash === "#admin") openAdmin(); };
    window.addEventListener("hashchange", route); route();
})();
