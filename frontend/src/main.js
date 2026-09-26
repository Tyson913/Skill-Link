const API_BASE = '/api';
const authStorageKey = 'skilllinkToken';

let authToken = localStorage.getItem(authStorageKey) || '';
let currentUser = null;
let services = [];
let categories = [];

const mainPageTrigger = document.getElementById('main-page-trigger');
const mainPage = document.getElementById('mainPage');
const landingPage = document.getElementById('landingPage');
const authFormContainer = document.getElementById('authFormContainer');
const authFormOverlay = document.getElementById('authFormOverlay');
const authFormClose = document.getElementById('authFormClose');
const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const switchToSignup = document.getElementById('switchToSignup');
const switchToLogin = document.getElementById('switchToLogin');
const usernameBttn = document.getElementById('usernameBttn');
const logoutBtn = document.getElementById('logout');
const filterToggle = document.getElementById('filterToggle');
const filterForm = document.getElementById('filter-form');
const filterCategory = document.getElementById('filterCategory');
const filterLocation = document.getElementById('filterLocation');
const serviceSearch = document.getElementById('serviceSearch');
const appStatus = document.getElementById('appStatus');
const loginStatus = document.getElementById('loginStatus');
const signupStatus = document.getElementById('signupStatus');
const categoryPage = document.getElementById('categoryPage');
const categoryList = document.querySelector('.service-category-container');

// --- New feature DOM refs ---
const becomeProviderNav = document.getElementById('becomeProviderNav');
const dashboardNavBtn = document.getElementById('dashboardNavBtn');
const notifWrap = document.getElementById('notifWrap');
const notifBell = document.getElementById('notifBell');
const notifBadge = document.getElementById('notifBadge');
const notifPanel = document.getElementById('notifPanel');
const notifList = document.getElementById('notifList');
const notifMarkAll = document.getElementById('notifMarkAll');
const notifViewAll = document.getElementById('notifViewAll');
const notifPageList = document.getElementById('notifPageList');
const nearMeToggle = document.getElementById('nearMeToggle');
const recommendSection = document.getElementById('recommendSection');
const recommendTrack = document.getElementById('recommendTrack');
const recommendSubtitle = document.getElementById('recommendSubtitle');
const adminFooterLink = document.getElementById('adminFooterLink');
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const mobileMenuPanel = document.getElementById('mobileMenuPanel');
const mobileBecomeProviderLink = document.getElementById('mobileBecomeProviderLink');
const mobileDashboardLink = document.getElementById('mobileDashboardLink');
const toastStack = document.getElementById('toastStack');

const providerProfilePage = document.getElementById('providerProfilePage');
const providerProfileBack = document.getElementById('providerProfileBack');
const providerAvatar = document.getElementById('providerAvatar');
const providerName = document.getElementById('providerName');
const providerVerifiedBadge = document.getElementById('providerVerifiedBadge');
const providerRatingSummary = document.getElementById('providerRatingSummary');
const providerLocation = document.getElementById('providerLocation');
const providerMemberSince = document.getElementById('providerMemberSince');
const providerBio = document.getElementById('providerBio');
const providerReputationStrip = document.getElementById('providerReputationStrip');
const providerStrikeText = document.getElementById('providerStrikeText');
const providerSaveBtn = document.getElementById('providerSaveBtn');
const providerReportBtn = document.getElementById('providerReportBtn');
const providerTabs = document.getElementById('providerTabs');
const providerServiceList = document.getElementById('providerServiceList');
const availabilityGrid = document.getElementById('availabilityGrid');
const availabilityActions = document.getElementById('availabilityActions');
const selectedSlotLabel = document.getElementById('selectedSlotLabel');
const requestSlotBtn = document.getElementById('requestSlotBtn');
const reviewAvgScore = document.getElementById('reviewAvgScore');
const reviewAvgStars = document.getElementById('reviewAvgStars');
const reviewCount = document.getElementById('reviewCount');
const reviewBreakdown = document.getElementById('reviewBreakdown');
const writeReviewBtn = document.getElementById('writeReviewBtn');
const reviewForm = document.getElementById('reviewForm');
const reviewStarInput = document.getElementById('reviewStarInput');
const reviewComment = document.getElementById('reviewComment');
const cancelReviewBtn = document.getElementById('cancelReviewBtn');
const reviewList = document.getElementById('reviewList');

const becomeProviderPage = document.getElementById('becomeProviderPage');
const becomeProviderBack = document.getElementById('becomeProviderBack');
const providerForm = document.getElementById('providerForm');
const availabilityPicker = document.getElementById('availabilityPicker');
const providerVerificationFile = document.getElementById('providerVerificationFile');
const dropzoneLabel = document.getElementById('dropzoneLabel');
const providerFormStatus = document.getElementById('providerFormStatus');
const providerSuccessPanel = document.getElementById('providerSuccessPanel');
const providerSuccessDone = document.getElementById('providerSuccessDone');

const dashboardPage = document.getElementById('dashboardPage');
const dashboardNav = document.getElementById('dashboardNav');
const overviewStats = document.getElementById('overviewStats');
const overviewActivity = document.getElementById('overviewActivity');
const requestStatusFilter = document.getElementById('requestStatusFilter');
const requestList = document.getElementById('requestList');
const historyList = document.getElementById('historyList');
const favoritesList = document.getElementById('favoritesList');
const myReviewList = document.getElementById('myReviewList');
const disputeList = document.getElementById('disputeList');
const newDisputeBtn = document.getElementById('newDisputeBtn');
const strikeTracker = document.getElementById('strikeTracker');

const adminDashboardPage = document.getElementById('adminDashboardPage');
const adminNav = document.getElementById('adminNav');
const adminStats = document.getElementById('adminStats');
const adminBarChart = document.getElementById('adminBarChart');
const adminTopCategories = document.getElementById('adminTopCategories');
const adminUserSearch = document.getElementById('adminUserSearch');
const adminUserTableBody = document.getElementById('adminUserTableBody');
const verifyQueue = document.getElementById('verifyQueue');
const adminDisputeList = document.getElementById('adminDisputeList');

const disputeFormContainer = document.getElementById('disputeFormContainer');
const disputeFormOverlay = document.getElementById('disputeFormOverlay');
const disputeFormClose = document.getElementById('disputeFormClose');
const disputeForm = document.getElementById('disputeForm');
const disputeFormTitle = document.getElementById('disputeFormTitle');
const disputeFormStatus = document.getElementById('disputeFormStatus');

const categoryLabels = {
    'home-repair': 'Home & Repair',
    technology: 'Technology',
    automotive: 'Automotive',
    cleaning: 'Cleaning',
    'beauty-wellness': 'Beauty & Wellness',
    education: 'Education',
    creative: 'Creative',
    construction: 'Construction',
    'delivery-moving': 'Delivery & Moving',
    professional: 'Professional Services'
};

const categoryIcons = {
    'home-and-repair': 'construct-outline',
    'home-repair': 'construct-outline',
    technology: 'laptop-outline',
    automotive: 'car-outline',
    cleaning: 'sparkles-outline',
    'beauty-and-wellness': 'heart-outline',
    'beauty-wellness': 'heart-outline',
    education: 'book-outline',
    creative: 'color-palette-outline',
    construction: 'hammer-outline',
    'delivery-and-moving': 'cube-outline',
    'delivery-moving': 'cube-outline',
    professional: 'briefcase-outline',
    'professional-services': 'briefcase-outline',
    uncategorized: 'layers-outline'
};

function refreshIcons() {
    // Ionic icons render themselves once the web components are hydrated.
}

/* =========================================================
   DEMO DATA — the features below (matching, scheduling,
   reviews, notifications, disputes, admin) don't have backend
   endpoints yet. Everything in this block is placeholder data
   shaped like what a real API response would look like, so the
   UI is fully navigable now. Swap each render function's data
   source for an apiRequest() call once the routes exist —
   the spots to change are marked "REPLACE WITH API".
   ========================================================= */

const demoProviders = [
    { id: 'prov-1', name: 'Marco Villanueva', initials: 'MV', category: 'home-repair', verified: true, strikes: 0, location: 'Davao City', memberSince: 'Jan 2024', bio: 'Licensed electrician and general home repair specialist with 8 years of field experience.', avgRating: 4.8, reviewCount: 34, price: 850 },
    { id: 'prov-2', name: 'Aira Santos', initials: 'AS', category: 'technology', verified: true, strikes: 1, location: 'Davao City', memberSince: 'Mar 2023', bio: 'Full-stack developer offering website builds, bug fixes, and technical consulting.', avgRating: 4.6, reviewCount: 21, price: 1500 },
    { id: 'prov-3', name: 'Jun Dela Cruz', initials: 'JD', category: 'automotive', verified: false, strikes: 0, location: 'Tagum City', memberSince: 'Jul 2024', bio: 'Mobile mechanic for car and motorcycle repairs — I come to you.', avgRating: 4.9, reviewCount: 12, price: 600 },
    { id: 'prov-4', name: 'Liza Ramos', initials: 'LR', category: 'cleaning', verified: true, strikes: 0, location: 'Davao City', memberSince: 'Nov 2022', bio: 'Deep-cleaning specialist for homes and small offices.', avgRating: 4.7, reviewCount: 58, price: 1200 }
];

const demoReviews = {
    'prov-1': [
        { author: 'Ken T.', rating: 5, date: '2026-08-14', comment: 'Fixed our wiring issue fast and explained everything clearly.' },
        { author: 'Mae O.', rating: 4, date: '2026-07-02', comment: 'Good work, arrived a bit later than scheduled.' }
    ],
    'prov-2': [
        { author: 'Renz A.', rating: 5, date: '2026-08-30', comment: 'Rebuilt our checkout flow in a weekend. Highly recommend.' }
    ],
    'prov-3': [
        { author: 'Bea L.', rating: 5, date: '2026-09-01', comment: 'Came to the house same day and diagnosed the issue in minutes.' }
    ],
    'prov-4': [
        { author: 'Carlo R.', rating: 5, date: '2026-08-20', comment: 'Spotless. Booking again next month.' },
        { author: 'Nina P.', rating: 4, date: '2026-07-11', comment: 'Great job overall, missed one corner of the kitchen.' }
    ]
};

let demoNotifications = [
    { id: 'n1', type: 'request', title: 'Marco Villanueva accepted your request', time: '2h ago', unread: true },
    { id: 'n2', type: 'review', title: 'You have a new 5-star review', time: '1d ago', unread: true },
    { id: 'n3', type: 'system', title: 'Your provider profile was verified', time: '3d ago', unread: false },
    { id: 'n4', type: 'strike', title: 'A dispute against your account was resolved', time: '5d ago', unread: false }
];

const notifIcons = {
    request: 'briefcase-outline',
    review: 'star-outline',
    system: 'checkmark-circle-outline',
    strike: 'alert-circle-outline'
};

let demoRequests = [
    { id: 'r1', serviceTitle: 'Home rewiring', providerName: 'Marco Villanueva', status: 'in-progress', price: 3500, date: '2026-09-20' },
    { id: 'r2', serviceTitle: 'Laptop screen repair', providerName: 'Aira Santos', status: 'pending', price: 1800, date: '2026-09-24' },
    { id: 'r3', serviceTitle: 'Car AC check-up', providerName: 'Jun Dela Cruz', status: 'accepted', price: 1200, date: '2026-09-25' }
];

const demoHistory = [
    { id: 'h1', serviceTitle: 'Deep house cleaning', providerName: 'Liza Ramos', status: 'completed', price: 2500, date: '2026-08-30' },
    { id: 'h2', serviceTitle: 'Motorcycle tune-up', providerName: 'Jun Dela Cruz', status: 'completed', price: 900, date: '2026-08-10' }
];

const demoMyReviews = [
    { author: 'You', providerName: 'Liza Ramos', rating: 5, date: '2026-08-31', comment: 'Spotless work, will book again.' }
];

let demoDisputes = [
    { id: 'd1', subject: 'Provider no-show', status: 'open', date: '2026-09-18' },
    { id: 'd2', subject: 'Billing discrepancy', status: 'resolved', date: '2026-08-05' }
];

const requestStatusSteps = ['pending', 'accepted', 'in-progress', 'completed'];
const requestStatusLabels = {
    pending: 'Pending',
    accepted: 'Accepted',
    'in-progress': 'In progress',
    completed: 'Completed',
    cancelled: 'Cancelled'
};

const demoAdminStats = [
    { label: 'Total users', value: '4,218', trend: '+6.4%' },
    { label: 'Active providers', value: '612', trend: '+3.1%' },
    { label: 'Requests this month', value: '1,904', trend: '+11%' },
    { label: 'Avg. rating', value: '4.7', trend: '+0.1' }
];

const demoBarChart = [
    { label: 'Jun', value: 62 }, { label: 'Jul', value: 74 }, { label: 'Aug', value: 58 },
    { label: 'Sep', value: 91 }, { label: 'Oct*', value: 40 }
];

const demoTopCategories = [
    { label: 'Home & Repair', value: 82 },
    { label: 'Cleaning', value: 68 },
    { label: 'Technology', value: 54 },
    { label: 'Automotive', value: 41 }
];

let demoAdminUsers = [
    { name: 'Marco Villanueva', role: 'Provider', strikes: 0, status: 'active' },
    { name: 'Aira Santos', role: 'Provider', strikes: 1, status: 'active' },
    { name: 'Jun Dela Cruz', role: 'Provider', strikes: 0, status: 'pending' },
    { name: 'Renz Aquino', role: 'Client', strikes: 2, status: 'active' },
    { name: 'Bea Lopez', role: 'Client', strikes: 3, status: 'suspended' }
];

let demoVerifyQueue = [
    { name: 'Jun Dela Cruz', category: 'Automotive', submitted: '2 days ago' },
    { name: 'Carlo Reyes', category: 'Construction', submitted: '4 days ago' }
];

let demoAdminDisputes = [
    { id: 'ad1', subject: 'Client vs. Marco Villanueva — no-show claim', status: 'open', date: '2026-09-18' },
    { id: 'ad2', subject: 'Client vs. Aira Santos — billing discrepancy', status: 'open', date: '2026-09-15' },
    { id: 'ad3', subject: 'Client vs. Bea Lopez — conduct complaint (3rd strike)', status: 'resolved', date: '2026-08-05' }
];

const savedProviderIds = new Set(['prov-4']);
const myStrikes = 0; // REPLACE WITH API: currentUser.strikes

let activeProviderId = null;
let selectedAvailabilitySlot = null;
let selectedReviewRating = 0;

function toast(message, type = '') {
    const el = document.createElement('div');
    el.className = `toast${type ? ` toast-${type}` : ''}`;
    el.innerHTML = `${iconMarkup(type === 'error' ? 'alert-circle' : 'checkmark-circle')}<span>${message}</span>`;
    toastStack.append(el);

    window.setTimeout(() => {
        el.classList.add('is-leaving');
        window.setTimeout(() => el.remove(), 200);
    }, 2600);
}

function timeAgoLabel(dateStr) {
    return dateStr;
}

/* =========================================================
   VIEW MANAGEMENT — full-page views (landing, browse,
   provider profile, become-a-provider, dashboard, admin).
   Static info pages (about/terms/etc.) keep their own
   showPage()/closePage() system further below.
   ========================================================= */

const appViews = {
    landing: landingPage,
    main: mainPage,
    provider: providerProfilePage,
    becomeProvider: becomeProviderPage,
    dashboard: dashboardPage,
    admin: adminDashboardPage
};

let currentViewKey = 'landing';

function showView(key, afterShow) {
    Object.values(appViews).forEach((view) => {
        view.style.display = 'none';
    });

    const target = appViews[key];

    if (!target) {
        return;
    }

    target.style.display = 'block';
    currentViewKey = key;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (typeof afterShow === 'function') {
        afterShow();
    }
}

/* ---------- notifications ---------- */

function renderNotifBadge() {
    const unreadCount = demoNotifications.filter((n) => n.unread).length;
    notifBadge.textContent = String(unreadCount);
    notifBadge.hidden = unreadCount === 0;
}

function buildNotifItem(notif) {
    const item = document.createElement('div');
    item.className = `notif-item${notif.unread ? ' is-unread' : ''}`;
    item.innerHTML = `
        <span class="notif-icon">${iconMarkup(notifIcons[notif.type] || 'notifications-outline')}</span>
        <div class="notif-body">
            <p>${notif.title}</p>
            <time>${notif.time}</time>
        </div>
    `;
    return item;
}

function renderNotifications() {
    notifList.textContent = '';
    notifPageList.textContent = '';

    if (demoNotifications.length === 0) {
        notifList.innerHTML = '<p class="notif-empty">You\'re all caught up.</p>';
        notifPageList.innerHTML = '<p class="list-empty">No notifications yet.</p>';
    } else {
        demoNotifications.slice(0, 5).forEach((notif) => notifList.append(buildNotifItem(notif)));
        demoNotifications.forEach((notif) => notifPageList.append(buildNotifItem(notif)));
    }

    renderNotifBadge();
}

function toggleNotifPanel(forceState) {
    const willOpen = typeof forceState === 'boolean' ? forceState : notifPanel.hidden;
    notifPanel.hidden = !willOpen;
    notifBell.setAttribute('aria-expanded', String(willOpen));
}

/* ---------- recommended-for-you ---------- */

function renderRecommendations() {
    if (!currentUser) {
        recommendSection.hidden = true;
        return;
    }

    recommendSection.hidden = false;
    recommendTrack.textContent = '';

    const ranked = [...demoProviders].sort((a, b) => b.avgRating - a.avgRating);

    ranked.forEach((provider) => {
        const card = document.createElement('div');
        card.className = 'recommend-card';
        card.dataset.providerId = provider.id;
        card.innerHTML = `
            <div class="recommend-card-top">
                <div class="recommend-avatar">${provider.initials}</div>
                <div>
                    <h4>${provider.name}</h4>
                    <p class="recommend-sub">${categoryLabels[provider.category] || provider.category} • ${provider.location}</p>
                </div>
            </div>
            <p class="recommend-rating">${iconMarkup('star')} ${provider.avgRating.toFixed(1)} (${provider.reviewCount})</p>
        `;
        card.addEventListener('click', () => openProviderProfile(provider.id));
        recommendTrack.append(card);
    });
}

function updateNearMeState(isOn) {
    nearMeToggle.setAttribute('aria-pressed', String(isOn));

    if (isOn) {
        filterLocation.value = 'Davao City';
        recommendSubtitle.textContent = 'Top-rated providers near Davao City.';
    } else {
        filterLocation.value = '';
        recommendSubtitle.textContent = 'Based on top-rated providers on SkillLink.';
    }

    loadServices();
}

/* ---------- provider profile ---------- */

function getProviderById(id) {
    return demoProviders.find((p) => p.id === id) || null;
}

function findProviderByName(name) {
    return demoProviders.find((p) => p.name === name) || null;
}

function openProviderProfile(providerId) {
    const provider = getProviderById(providerId);

    if (!provider) {
        return;
    }

    activeProviderId = providerId;

    providerAvatar.textContent = provider.initials;
    providerName.textContent = provider.name;
    providerVerifiedBadge.hidden = !provider.verified;
    providerRatingSummary.innerHTML = `${iconMarkup('star')} ${provider.avgRating.toFixed(1)} <span class="provider-rating-count">(${provider.reviewCount} reviews)</span>`;
    providerLocation.innerHTML = `${iconMarkup('location-outline')} ${provider.location}`;
    providerMemberSince.textContent = `Member since ${provider.memberSince}`;
    providerBio.textContent = provider.bio;

    if (provider.strikes > 0) {
        providerReputationStrip.hidden = false;
        providerStrikeText.textContent = `${provider.strikes} of 3 strikes on record`;
    } else {
        providerReputationStrip.hidden = true;
    }

    providerSaveBtn.setAttribute('aria-pressed', String(savedProviderIds.has(providerId)));
    providerSaveBtn.querySelector('ion-icon').setAttribute('name', savedProviderIds.has(providerId) ? 'heart' : 'heart-outline');

    renderProviderServices(provider);
    renderAvailabilityGrid();
    renderReviewsTab(provider);
    switchProviderTab('services');

    showView('provider');
}

function renderProviderServices(provider) {
    providerServiceList.textContent = '';

    const matching = services.filter((s) => s.providerName === provider.name);
    const list = matching.length > 0 ? matching : [{
        id: `${provider.id}-default`,
        title: `${categoryLabels[provider.category] || 'General'} service`,
        providerName: provider.name,
        price: provider.price,
        description: provider.bio,
        location: provider.location,
        rating: provider.avgRating,
        category: provider.category,
        categoryName: categoryLabels[provider.category]
    }];

    list.forEach((service) => providerServiceList.append(buildServiceCard(service)));
}

const availabilityDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const availabilitySlots = ['9–11am', '11am–1pm', '2–4pm', '4–6pm'];

function seedAvailability(providerId) {
    // Deterministic pseudo-random booked slots so the grid looks
    // realistic and stays stable per provider across re-renders.
    let seed = 0;
    for (let i = 0; i < providerId.length; i += 1) {
        seed += providerId.charCodeAt(i);
    }

    const booked = new Set();
    availabilityDays.forEach((_, dayIndex) => {
        availabilitySlots.forEach((_, slotIndex) => {
            if ((seed + dayIndex * 3 + slotIndex * 7) % 5 === 0) {
                booked.add(`${dayIndex}-${slotIndex}`);
            }
        });
    });

    return booked;
}

function renderAvailabilityGrid() {
    availabilityGrid.textContent = '';
    selectedAvailabilitySlot = null;
    availabilityActions.hidden = true;

    const booked = seedAvailability(activeProviderId || 'default');

    availabilityDays.forEach((day, dayIndex) => {
        const col = document.createElement('div');
        col.className = 'avail-day';

        const label = document.createElement('div');
        label.className = 'avail-day-label';
        label.textContent = day;
        col.append(label);

        availabilitySlots.forEach((slot, slotIndex) => {
            const key = `${dayIndex}-${slotIndex}`;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'avail-slot';
            btn.textContent = slot;
            btn.dataset.key = key;

            if (booked.has(key)) {
                btn.classList.add('is-booked');
                btn.disabled = true;
            } else {
                btn.addEventListener('click', () => selectAvailabilitySlot(key, `${day}, ${slot}`, btn));
            }

            col.append(btn);
        });

        availabilityGrid.append(col);
    });
}

function selectAvailabilitySlot(key, label, btnEl) {
    availabilityGrid.querySelectorAll('.avail-slot.is-selected').forEach((el) => el.classList.remove('is-selected'));
    btnEl.classList.add('is-selected');
    selectedAvailabilitySlot = { key, label };
    selectedSlotLabel.textContent = `Selected: ${label}`;
    availabilityActions.hidden = false;
}

function switchProviderTab(tabName) {
    providerTabs.querySelectorAll('.profile-tab').forEach((tab) => {
        const isActive = tab.dataset.tab === tabName;
        tab.classList.toggle('is-active', isActive);
        tab.setAttribute('aria-selected', String(isActive));
    });

    document.querySelectorAll('.profile-tab-panel').forEach((panel) => {
        panel.hidden = panel.dataset.panel !== tabName;
    });
}

function renderReviewsTab(provider) {
    const reviews = demoReviews[provider.id] || [];

    reviewAvgScore.textContent = provider.avgRating.toFixed(1);
    reviewCount.textContent = `${provider.reviewCount} reviews`;
    reviewAvgStars.innerHTML = starsMarkup(Math.round(provider.avgRating));

    reviewBreakdown.textContent = '';
    [5, 4, 3, 2, 1].forEach((star) => {
        const count = reviews.filter((r) => r.rating === star).length;
        const pct = reviews.length ? Math.round((count / reviews.length) * 100) : 0;
        const row = document.createElement('div');
        row.className = 'review-breakdown-row';
        row.innerHTML = `<span>${star} star</span><span class="review-breakdown-bar"><span style="width:${pct}%"></span></span><span>${count}</span>`;
        reviewBreakdown.append(row);
    });

    reviewList.textContent = '';

    if (reviews.length === 0) {
        reviewList.innerHTML = '<p class="list-empty">No reviews yet — be the first to leave one.</p>';
        return;
    }

    reviews.forEach((review) => {
        const card = document.createElement('div');
        card.className = 'review-card';
        card.innerHTML = `
            <div class="review-card-head">
                <span class="review-card-author">${review.author}</span>
                <span class="review-card-date">${review.date}</span>
            </div>
            <div class="review-stars">${starsMarkup(review.rating)}</div>
            <p>${review.comment}</p>
        `;
        reviewList.append(card);
    });
}

function starsMarkup(count) {
    let markup = '';
    for (let i = 0; i < 5; i += 1) {
        markup += iconMarkup(i < count ? 'star' : 'star-outline');
    }
    return markup;
}

/* ---------- become a provider ---------- */

function renderAvailabilityPicker() {
    availabilityPicker.textContent = '';

    availabilityDays.forEach((day) => {
        const row = document.createElement('div');
        row.className = 'avail-pick-row';

        const label = document.createElement('span');
        label.className = 'avail-pick-day';
        label.textContent = day;
        row.append(label);

        availabilitySlots.forEach((slot) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'avail-pick-chip';
            chip.textContent = slot;
            chip.addEventListener('click', () => chip.classList.toggle('is-active'));
            row.append(chip);
        });

        availabilityPicker.append(row);
    });
}

/* ---------- dashboard ---------- */

function switchDashboardTab(tabName) {
    dashboardNav.querySelectorAll('.dashboard-nav-item').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.dtab === tabName);
    });

    document.querySelectorAll('.dashboard-panel').forEach((panel) => {
        panel.hidden = panel.dataset.dpanel !== tabName;
    });

    if (tabName === 'overview') renderDashboardOverview();
    if (tabName === 'requests') renderRequests('all');
    if (tabName === 'history') renderHistory();
    if (tabName === 'favorites') renderFavorites();
    if (tabName === 'notifications') renderNotifications();
    if (tabName === 'reviews') renderMyReviews();
    if (tabName === 'disputes') renderDisputes();
    if (tabName === 'trust') renderTrustTab();
}

function renderDashboardOverview() {
    const stats = [
        { label: 'Active requests', value: String(demoRequests.filter((r) => r.status !== 'completed').length), trend: '' },
        { label: 'Saved providers', value: String(savedProviderIds.size), trend: '' },
        { label: 'Unread notifications', value: String(demoNotifications.filter((n) => n.unread).length), trend: '' },
        { label: 'Completed services', value: String(demoHistory.length), trend: '' }
    ];

    overviewStats.innerHTML = stats.map((s) => `
        <div class="stat-card">
            <div class="stat-value">${s.value}</div>
            <div class="stat-label">${s.label}</div>
        </div>
    `).join('');

    overviewActivity.textContent = '';
    demoNotifications.slice(0, 4).forEach((n) => {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        item.innerHTML = `<p>${n.title}</p><time>${n.time}</time>`;
        overviewActivity.append(item);
    });
}

function buildRequestCard(request, { showReview } = {}) {
    const card = document.createElement('div');
    card.className = 'request-card';

    const stepIndex = requestStatusSteps.indexOf(request.status);

    const stepsMarkup = requestStatusSteps.map((step, i) => `
        <div class="request-progress-step${i <= stepIndex ? ' is-done' : ''}">
            <span class="dot"></span>
            <span>${requestStatusLabels[step]}</span>
        </div>
    `).join('');

    card.innerHTML = `
        <div class="request-card-head">
            <div>
                <h4>${request.serviceTitle}</h4>
                <p class="request-card-provider">with ${request.providerName} • ${request.date}</p>
            </div>
            <span class="status-pill status-${request.status}">${requestStatusLabels[request.status]}</span>
        </div>
        ${request.status !== 'cancelled' ? `<div class="request-progress">${stepsMarkup}</div>` : ''}
        <div class="request-card-footer">
            <span class="price">${formatPrice(request.price)}</span>
            <div class="request-card-actions">
                ${showReview ? '<button type="button" class="link-btn" data-action="review">Leave a review</button>' : ''}
                ${request.status === 'pending' ? '<button type="button" class="link-btn danger" data-action="cancel">Cancel</button>' : ''}
            </div>
        </div>
    `;

    if (showReview) {
        card.querySelector('[data-action="review"]')?.addEventListener('click', () => {
            const provider = findProviderByName(request.providerName);
            if (provider) {
                openProviderProfile(provider.id);
                switchProviderTab('reviews');
                writeReviewBtn.click();
            }
        });
    }

    card.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
        request.status = 'cancelled';
        renderRequests(requestStatusFilter.querySelector('.is-active')?.dataset.status || 'all');
        toast('Request cancelled.');
    });

    return card;
}

function renderRequests(filterStatus) {
    requestList.textContent = '';

    const filtered = filterStatus === 'all'
        ? demoRequests
        : demoRequests.filter((r) => r.status === filterStatus);

    if (filtered.length === 0) {
        requestList.innerHTML = '<p class="list-empty">No requests in this category.</p>';
        return;
    }

    filtered.forEach((r) => requestList.append(buildRequestCard(r)));
}

function renderHistory() {
    historyList.textContent = '';

    if (demoHistory.length === 0) {
        historyList.innerHTML = '<p class="list-empty">No completed services yet.</p>';
        return;
    }

    demoHistory.forEach((r) => historyList.append(buildRequestCard(r, { showReview: true })));
}

function renderFavorites() {
    favoritesList.textContent = '';

    const saved = demoProviders.filter((p) => savedProviderIds.has(p.id));

    if (saved.length === 0) {
        favoritesList.innerHTML = '<p class="list-empty">You haven\'t saved any providers yet.</p>';
        return;
    }

    saved.forEach((provider) => {
        const card = buildServiceCard({
            id: provider.id,
            title: `${categoryLabels[provider.category] || 'General'} service`,
            providerName: provider.name,
            price: provider.price,
            description: provider.bio,
            location: provider.location,
            rating: provider.avgRating,
            category: provider.category,
            categoryName: categoryLabels[provider.category]
        });
        favoritesList.append(card);
    });
}

function renderMyReviews() {
    myReviewList.textContent = '';

    if (demoMyReviews.length === 0) {
        myReviewList.innerHTML = '<p class="list-empty">You haven\'t written any reviews yet.</p>';
        return;
    }

    demoMyReviews.forEach((review) => {
        const card = document.createElement('div');
        card.className = 'review-card';
        card.innerHTML = `
            <div class="review-card-head">
                <span class="review-card-author">${review.providerName}</span>
                <span class="review-card-date">${review.date}</span>
            </div>
            <div class="review-stars">${starsMarkup(review.rating)}</div>
            <p>${review.comment}</p>
        `;
        myReviewList.append(card);
    });
}

function renderDisputes() {
    disputeList.textContent = '';

    if (demoDisputes.length === 0) {
        disputeList.innerHTML = '<p class="list-empty">No reports filed.</p>';
        return;
    }

    demoDisputes.forEach((d) => {
        const card = document.createElement('div');
        card.className = 'dispute-card';
        card.innerHTML = `
            <div>
                <h4>${d.subject}</h4>
                <time>Filed ${d.date}</time>
            </div>
            <span class="status-pill status-${d.status}">${d.status === 'open' ? 'Under review' : 'Resolved'}</span>
        `;
        disputeList.append(card);
    });
}

function renderTrustTab() {
    strikeTracker.innerHTML = [0, 1, 2].map((i) => `
        <div class="strike-dot${i < myStrikes ? ' is-active' : ''}">
            <div class="shield">${iconMarkup(i < myStrikes ? 'alert-outline' : 'shield-checkmark-outline')}</div>
            <p>Strike ${i + 1}</p>
        </div>
    `).join('');
}

/* ---------- admin console ---------- */

function switchAdminTab(tabName) {
    adminNav.querySelectorAll('button').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.atab === tabName);
    });

    document.querySelectorAll('.admin-panel').forEach((panel) => {
        panel.hidden = panel.dataset.apanel !== tabName;
    });

    if (tabName === 'analytics') renderAdminAnalytics();
    if (tabName === 'users') renderAdminUsers();
    if (tabName === 'verification') renderVerifyQueue();
    if (tabName === 'reports') renderAdminDisputes();
}

function renderAdminAnalytics() {
    adminStats.innerHTML = demoAdminStats.map((s) => `
        <div class="stat-card">
            <div class="stat-value">${s.value}</div>
            <div class="stat-label">${s.label}</div>
            <div class="stat-trend">${iconMarkup('trending-up-outline')} ${s.trend}</div>
        </div>
    `).join('');

    const max = Math.max(...demoBarChart.map((b) => b.value));
    adminBarChart.innerHTML = demoBarChart.map((b) => `
        <div class="bar-chart-col">
            <div class="bar" style="height:${Math.round((b.value / max) * 100)}%"></div>
            <span>${b.label}</span>
        </div>
    `).join('');

    const maxCat = Math.max(...demoTopCategories.map((c) => c.value));
    adminTopCategories.innerHTML = demoTopCategories.map((c, i) => `
        <div class="rank-row">
            <span class="rank-index">${i + 1}</span>
            <span>${c.label}</span>
            <span class="rank-bar"><span style="width:${Math.round((c.value / maxCat) * 100)}%"></span></span>
        </div>
    `).join('');
}

function renderAdminUsers(filterText = '') {
    adminUserTableBody.textContent = '';

    const filtered = demoAdminUsers.filter((u) =>
        u.name.toLowerCase().includes(filterText.toLowerCase())
    );

    if (filtered.length === 0) {
        adminUserTableBody.innerHTML = '<tr><td colspan="5" class="list-empty">No matches.</td></tr>';
        return;
    }

    filtered.forEach((user, index) => {
        const row = document.createElement('tr');
        const statusBadgeClass = user.status === 'active' ? 'badge-verified' : user.status === 'suspended' ? 'badge-suspended' : 'badge-pending';
        row.innerHTML = `
            <td>${user.name}</td>
            <td>${user.role}</td>
            <td>${user.strikes} / 3</td>
            <td><span class="badge ${statusBadgeClass}">${user.status}</span></td>
            <td>
                <button type="button" class="link-btn${user.status === 'suspended' ? '' : ' danger'}" data-user-index="${index}">
                    ${user.status === 'suspended' ? 'Reinstate' : 'Suspend'}
                </button>
            </td>
        `;
        row.querySelector('[data-user-index]').addEventListener('click', () => {
            user.status = user.status === 'suspended' ? 'active' : 'suspended';
            renderAdminUsers(adminUserSearch.value);
            toast(`${user.name} ${user.status === 'suspended' ? 'suspended' : 'reinstated'}.`);
        });
        adminUserTableBody.append(row);
    });
}

function renderVerifyQueue() {
    verifyQueue.textContent = '';

    if (demoVerifyQueue.length === 0) {
        verifyQueue.innerHTML = '<p class="list-empty">No providers waiting on verification.</p>';
        return;
    }

    demoVerifyQueue.forEach((entry, index) => {
        const card = document.createElement('div');
        card.className = 'verify-card';
        card.innerHTML = `
            <div class="verify-card-info">
                <div class="recommend-avatar">${entry.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</div>
                <div>
                    <h4>${entry.name}</h4>
                    <p>${entry.category} • submitted ${entry.submitted}</p>
                </div>
            </div>
            <div class="verify-card-actions">
                <button type="button" class="btn btn-approve" data-verify-action="approve">Approve</button>
                <button type="button" class="btn btn-reject" data-verify-action="reject">Reject</button>
            </div>
        `;

        card.querySelector('[data-verify-action="approve"]').addEventListener('click', () => {
            demoVerifyQueue = demoVerifyQueue.filter((_, i) => i !== index);
            renderVerifyQueue();
            toast(`${entry.name} verified.`);
        });

        card.querySelector('[data-verify-action="reject"]').addEventListener('click', () => {
            demoVerifyQueue = demoVerifyQueue.filter((_, i) => i !== index);
            renderVerifyQueue();
            toast(`${entry.name}'s submission rejected.`, 'error');
        });

        verifyQueue.append(card);
    });
}

function renderAdminDisputes() {
    adminDisputeList.textContent = '';

    demoAdminDisputes.forEach((d, index) => {
        const card = document.createElement('div');
        card.className = 'dispute-card';
        card.innerHTML = `
            <div>
                <h4>${d.subject}</h4>
                <time>Filed ${d.date}</time>
            </div>
            <div class="verify-card-actions">
                <span class="status-pill status-${d.status}">${d.status === 'open' ? 'Open' : 'Resolved'}</span>
                ${d.status === 'open' ? '<button type="button" class="btn btn-approve" data-resolve>Resolve</button>' : ''}
            </div>
        `;

        card.querySelector('[data-resolve]')?.addEventListener('click', () => {
            demoAdminDisputes[index].status = 'resolved';
            renderAdminDisputes();
            toast('Dispute marked resolved.');
        });

        adminDisputeList.append(card);
    });
}

function iconMarkup(name) {
    return `<ion-icon name="${name}" aria-hidden="true"></ion-icon>`;
}

function setStatus(element, message, type = '') {
    if (!element) {
        return;
    }

    element.textContent = message;
    element.dataset.type = type;
}

function getErrorMessage(error) {
    return error && error.message ? error.message : 'Something went wrong.';
}

async function apiRequest(path, options = {}) {
    const headers = {
        Accept: 'application/json',
        ...(options.headers || {})
    };

    if (options.body) {
        headers['Content-Type'] = 'application/json';
    }

    if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(payload.error || 'Request failed.');
    }

    return payload;
}

function getFormData(form) {
    const data = {};

    form.querySelectorAll('[name]').forEach((field) => {
        if (field.disabled) {
            return;
        }

        data[field.name] = String(field.value || '').trim();
    });

    return data;
}

function resetFormControls(form) {
    form.querySelectorAll('ion-input').forEach((field) => {
        field.value = '';
    });

    form.querySelectorAll('ion-select').forEach((field) => {
        field.value = field.dataset.defaultValue || '';
    });
}

function setBusy(form, isBusy) {
    const button = form.querySelector('ion-button[type="submit"], button[type="submit"]');

    if (button) {
        button.disabled = isBusy;
        button.dataset.originalText = button.dataset.originalText || button.textContent;
        button.textContent = isBusy ? 'Please wait...' : button.dataset.originalText;
    }
}

function openAuthForm(formName) {
    authFormContainer.classList.add('is-open');

    loginForm.classList.toggle('is-hidden', formName !== 'login');
    signupForm.classList.toggle('is-hidden', formName !== 'signup');

    setStatus(loginStatus, '');
    setStatus(signupStatus, '');
}

function closeAuthForm() {
    authFormContainer.classList.remove('is-open');
}

function setLoggedIn(user) {
    currentUser = user;
    usernameBttn.textContent = user.name || user.email.split('@')[0] || 'Account';
    usernameBttn.hidden = false;
    logoutBtn.hidden = false;
    loginBtn.hidden = true;
    signupBtn.hidden = true;
    dashboardNavBtn.hidden = false;
    mobileDashboardLink.hidden = false;
    notifWrap.hidden = false;
    closeAuthForm();
    renderNotifications();
    renderRecommendations();
}

function setLoggedOut() {
    currentUser = null;
    authToken = '';
    localStorage.removeItem(authStorageKey);
    usernameBttn.hidden = true;
    logoutBtn.hidden = true;
    loginBtn.hidden = false;
    signupBtn.hidden = false;
    dashboardNavBtn.hidden = true;
    mobileDashboardLink.hidden = true;
    notifWrap.hidden = true;
    toggleNotifPanel(false);
    toggleMobileMenu(false);
    recommendSection.hidden = true;
}

function formatPrice(price) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        maximumFractionDigits: 0
    }).format(price);
}

function normalizeCategorySlug(name) {
    return String(name || 'uncategorized')
        .trim()
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'uncategorized';
}

function normalizeCategories(apiCategories, apiServices) {
    const categoryMap = new Map();

    (apiCategories || []).forEach((category) => {
        const name = category.name || categoryLabels[category.slug] || category.slug || 'Uncategorized';
        const slug = category.slug || normalizeCategorySlug(name);
        categoryMap.set(slug, {
            id: category.id || slug,
            name,
            slug
        });
    });

    (apiServices || []).forEach((service) => {
        const name = service.categoryName || categoryLabels[service.category] || service.category || 'Uncategorized';
        const slug = service.category || normalizeCategorySlug(name);

        if (!categoryMap.has(slug)) {
            categoryMap.set(slug, {
                id: slug,
                name,
                slug
            });
        }
    });

    return [...categoryMap.values()];
}

function renderFilterOptions() {
    const selectedValue = filterCategory.value;
    filterCategory.textContent = '';

    const allOption = document.createElement('ion-select-option');
    allOption.value = '';
    allOption.textContent = 'All categories';
    filterCategory.append(allOption);

    categories.forEach((category) => {
        const option = document.createElement('ion-select-option');
        option.value = category.slug;
        option.textContent = category.name;
        filterCategory.append(option);
    });

    filterCategory.value = categories.some((category) => category.slug === selectedValue) ? selectedValue : '';
}

function renderCategoryNav() {
    categoryList.textContent = '';

    if (categories.length === 0) {
        categoryList.textContent = 'No categories available.';
        return;
    }

    categories.forEach((category) => {
        const item = document.createElement('ion-chip');
        item.dataset.service = `${category.slug}-services`;
        item.tabIndex = 0;
        item.setAttribute('role', 'button');
        item.innerHTML = iconMarkup(categoryIcons[category.slug] || 'briefcase-outline');
        item.append(` ${category.name}`);
        categoryList.append(item);
    });
}

function buildServiceSection(category) {
    const section = document.createElement('div');
    section.className = 'services';
    section.id = `${category.slug}-services`;
    section.hidden = true;

    const closeButton = document.createElement('ion-button');
    closeButton.type = 'button';
    closeButton.className = 'service-close';
    closeButton.setAttribute('fill', 'clear');
    closeButton.setAttribute('aria-label', 'Back to categories');
    closeButton.innerHTML = iconMarkup('close-outline');

    const header = document.createElement('div');
    header.className = 'service-header';
    header.innerHTML = iconMarkup(categoryIcons[category.slug] || 'briefcase-outline');

    const heading = document.createElement('h1');
    heading.textContent = category.name;
    header.append(heading);

    const list = document.createElement('div');
    list.className = 'service-list';

    section.append(closeButton, header, list);
    return section;
}

function renderCategorySections() {
    document.querySelectorAll('.services').forEach((section) => {
        section.remove();
    });

    const sections = categories.map(buildServiceSection);
    categoryPage.after(...sections);
}

function clearServiceLists() {
    document.querySelectorAll('.service-list').forEach((list) => {
        list.textContent = 'No listings yet - check back soon.';
        list.classList.add('is-empty');
    });
}

function buildServiceCard(service) {
    const card = document.createElement('ion-card');
    card.className = 'service-card';

    const header = document.createElement('div');
    header.className = 'service-card-header';

    const titleGroup = document.createElement('div');

    const title = document.createElement('h3');
    title.textContent = service.title;

    const provider = document.createElement('p');
    provider.className = 'service-provider';
    const linkedProvider = findProviderByName(service.providerName);

    if (linkedProvider) {
        provider.innerHTML = `<span class="provider-link" data-provider-id="${linkedProvider.id}">${service.providerName}</span>`;
    } else {
        provider.textContent = service.providerName;
    }

    titleGroup.append(title, provider);

    const price = document.createElement('span');
    price.className = 'service-price';
    price.textContent = formatPrice(service.price);

    const favoriteBtn = document.createElement('button');
    favoriteBtn.type = 'button';
    favoriteBtn.className = 'service-favorite-btn';
    favoriteBtn.setAttribute('aria-label', 'Save provider');
    const isSaved = linkedProvider && savedProviderIds.has(linkedProvider.id);
    favoriteBtn.classList.toggle('is-saved', Boolean(isSaved));
    favoriteBtn.innerHTML = iconMarkup(isSaved ? 'heart' : 'heart-outline');

    favoriteBtn.addEventListener('click', () => {
        if (!linkedProvider) {
            toast('This provider isn\'t linked to a profile yet.', 'error');
            return;
        }

        if (savedProviderIds.has(linkedProvider.id)) {
            savedProviderIds.delete(linkedProvider.id);
            favoriteBtn.classList.remove('is-saved');
            favoriteBtn.innerHTML = iconMarkup('heart-outline');
            toast('Removed from favorites.');
        } else {
            savedProviderIds.add(linkedProvider.id);
            favoriteBtn.classList.add('is-saved');
            favoriteBtn.innerHTML = iconMarkup('heart');
            toast('Saved to favorites.');
        }
    });

    header.append(titleGroup, price, favoriteBtn);

    const description = document.createElement('p');
    description.className = 'service-description';
    description.textContent = service.description;

    const meta = document.createElement('div');
    meta.className = 'service-meta';

    const location = document.createElement('span');
    location.innerHTML = iconMarkup('location-outline');
    location.append(` ${service.location}`);

    const rating = document.createElement('span');
    rating.innerHTML = iconMarkup('star-outline');
    rating.append(` ${typeof service.rating === 'number' ? service.rating.toFixed(1) : 'New'}`);

    meta.append(location, rating);

    const footer = document.createElement('div');
    footer.className = 'service-card-footer';

    const category = document.createElement('ion-chip');
    category.className = 'service-tag';
    category.textContent = service.categoryName || categoryLabels[service.category] || service.category;

    const hireButton = document.createElement('ion-button');
    hireButton.type = 'button';
    hireButton.className = 'btn btn-primary';
    hireButton.dataset.hireServiceId = service.id;
    hireButton.textContent = 'Hire';

    footer.append(category, hireButton);
    card.append(header, description, meta, footer);

    return card;
}

function renderServices() {
    const activeServiceId = document.querySelector('.services:not([hidden])')?.id || '';
    renderFilterOptions();
    renderCategoryNav();
    renderCategorySections();
    clearServiceLists();

    services.forEach((service) => {
        const list = document.querySelector(`#${service.category}-services .service-list`);

        if (!list) {
            return;
        }

        if (list.classList.contains('is-empty')) {
            list.textContent = '';
            list.classList.remove('is-empty');
        }

        list.append(buildServiceCard(service));
    });

    const activeService = activeServiceId ? document.getElementById(activeServiceId) : null;

    if (activeService) {
        categoryPage.hidden = true;
        activeService.hidden = false;
    } else {
        categoryPage.hidden = false;
    }

    refreshIcons();
}

function collectServiceQuery() {
    const formData = getFormData(filterForm);
    const params = new URLSearchParams();
    const query = String(serviceSearch.value || '').trim();

    if (query) {
        params.set('q', query);
    }

    Object.entries(formData).forEach(([key, value]) => {
        if (String(value).trim()) {
            params.set(key, String(value).trim());
        }
    });

    return params.toString();
}

async function loadServices() {
    const queryString = collectServiceQuery();

    try {
        setStatus(appStatus, 'Loading services...');
        const payload = await apiRequest(`/services${queryString ? `?${queryString}` : ''}`);
        services = payload.services || [];
        categories = normalizeCategories(payload.categories || [], services);
        renderServices();
        setStatus(appStatus, services.length ? `${services.length} services found.` : 'No services match your filters.');
    } catch (error) {
        clearServiceLists();
        setStatus(appStatus, getErrorMessage(error), 'error');
    }
}

async function restoreSession() {
    if (!authToken) {
        setLoggedOut();
        return;
    }

    try {
        const payload = await apiRequest('/me');

        if (payload.user) {
            setLoggedIn(payload.user);
        } else {
            setLoggedOut();
        }
    } catch {
        setLoggedOut();
    }
}

let searchTimer = null;

function queueServiceLoad() {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(loadServices, 250);
}

mainPageTrigger.addEventListener('click', () => {
    showView('main', loadServices);
});

loginBtn.addEventListener('click', () => openAuthForm('login'));
signupBtn.addEventListener('click', () => openAuthForm('signup'));
authFormClose.addEventListener('click', closeAuthForm);
authFormOverlay.addEventListener('click', closeAuthForm);

switchToSignup.addEventListener('click', (event) => {
    event.preventDefault();
    openAuthForm('signup');
});

switchToLogin.addEventListener('click', (event) => {
    event.preventDefault();
    openAuthForm('login');
});

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(loginStatus, '');
    setBusy(loginForm, true);

    try {
        const payload = await apiRequest('/auth/login', {
            method: 'POST',
            body: getFormData(loginForm)
        });

        authToken = payload.token;
        localStorage.setItem(authStorageKey, authToken);
        setLoggedIn(payload.user);
        resetFormControls(loginForm);
        setStatus(appStatus, 'Logged in.');
    } catch (error) {
        setStatus(loginStatus, getErrorMessage(error), 'error');
    } finally {
        setBusy(loginForm, false);
    }
});

signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(signupStatus, '');

    const formData = getFormData(signupForm);

    if (formData.password !== formData.confirmPassword) {
        setStatus(signupStatus, 'Passwords do not match.', 'error');
        return;
    }

    setBusy(signupForm, true);

    try {
        const payload = await apiRequest('/auth/signup', {
            method: 'POST',
            body: formData
        });

        resetFormControls(signupForm);

        authToken = payload.token;
        localStorage.setItem(authStorageKey, authToken);
        setLoggedIn(payload.user);
        setStatus(appStatus, 'Account created.');
    } catch (error) {
        setStatus(signupStatus, getErrorMessage(error), 'error');
    } finally {
        setBusy(signupForm, false);
    }
});

logoutBtn.addEventListener('click', async () => {
    try {
        if (authToken) {
            await apiRequest('/auth/logout', { method: 'POST' });
        }
    } finally {
        setLoggedOut();
        setStatus(appStatus, 'Logged out.');
    }
});

filterToggle.addEventListener('click', () => {
    const willShow = filterForm.hidden;
    filterForm.hidden = !willShow;
    filterToggle.setAttribute('aria-expanded', String(willShow));
});

filterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    loadServices();
});

filterForm.addEventListener('reset', () => {
    window.setTimeout(() => {
        resetFormControls(filterForm);
        const sortSelect = document.getElementById('filterSort');

        if (sortSelect) {
            sortSelect.value = 'relevance';
        }

        loadServices();
    }, 0);
});

serviceSearch.addEventListener('ionInput', queueServiceLoad);
serviceSearch.addEventListener('input', queueServiceLoad);

function openServiceSection(serviceId) {
    const selectedService = document.getElementById(serviceId);

    if (!selectedService) {
        return;
    }

    categoryPage.hidden = true;

    document.querySelectorAll('.services').forEach((service) => {
        service.hidden = true;
    });

    selectedService.hidden = false;
    refreshIcons();
}

categoryList.addEventListener('click', (event) => {
    const categoryItem = event.target.closest('[data-service]');

    if (categoryItem) {
        openServiceSection(categoryItem.dataset.service);
    }
});

categoryList.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
        return;
    }

    const categoryItem = event.target.closest('[data-service]');

    if (categoryItem) {
        event.preventDefault();
        openServiceSection(categoryItem.dataset.service);
    }
});

document.addEventListener('click', (event) => {
    const closeButton = event.target.closest('.service-close');

    if (!closeButton) {
        return;
    }

    document.querySelectorAll('.services').forEach((service) => {
        service.hidden = true;
    });

    categoryPage.hidden = false;
    refreshIcons();
});

document.addEventListener('click', async (event) => {
    const hireButton = event.target.closest('[data-hire-service-id]');

    if (!hireButton) {
        return;
    }

    if (!currentUser) {
        openAuthForm('login');
        setStatus(loginStatus, 'Log in before hiring a service.', 'error');
        return;
    }

    hireButton.disabled = true;
    hireButton.textContent = 'Requesting...';

    try {
        await apiRequest('/hires', {
            method: 'POST',
            body: {
                serviceId: hireButton.dataset.hireServiceId
            }
        });
        hireButton.textContent = 'Requested';
        setStatus(appStatus, 'Hire request sent.');

        const hiredService = services.find((s) => String(s.id) === String(hireButton.dataset.hireServiceId));
        if (hiredService) {
            demoRequests.unshift({
                id: `r${Date.now()}`,
                serviceTitle: hiredService.title,
                providerName: hiredService.providerName,
                status: 'pending',
                price: hiredService.price,
                date: new Date().toISOString().slice(0, 10)
            });
        }
    } catch (error) {
        hireButton.disabled = false;
        hireButton.textContent = 'Hire';
        setStatus(appStatus, getErrorMessage(error), 'error');
    }
});

// --- Footer pages: About / Terms / Privacy ---
const pageSections = document.querySelectorAll('.page-section');
const primaryViews = Object.values(appViews); // every full-page app view

let previousView = landingPage;

function showPage(id) {
    // remember which primary view was on screen, so Back can restore it
    previousView = primaryViews.find(view => view.style.display !== 'none') || landingPage;

    primaryViews.forEach(view => (view.style.display = 'none'));
    pageSections.forEach(section => (section.hidden = section.id !== id));
    window.scrollTo({ top: 0 });
}

function closePage() {
    pageSections.forEach(section => (section.hidden = true));
    primaryViews.forEach(view => (view.style.display = 'none'));
    previousView.style.display = '';
}

document.querySelectorAll('footer a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
        const id = link.getAttribute('href').slice(1);
        const target = document.getElementById(id);
        if (!target || !target.classList.contains('page-section')) return; // lets #help/#contact/#faq pass through untouched
        e.preventDefault();
        showPage(id);
        history.pushState(null, '', `#${id}`);
    });
});

// Scoped to .page-section descendants only — the provider-profile and
// become-a-provider "Back" buttons below are wired separately via showView().
document.querySelectorAll('.page-section .page-back').forEach(btn => {
    btn.addEventListener('click', () => {
        closePage();
        history.pushState(null, '', window.location.pathname);
    });
});

/* =========================================================
   NEW FEATURE EVENT WIRING
   ========================================================= */

function openBecomeProviderFlow() {
    if (!currentUser) {
        openAuthForm('login');
        setStatus(loginStatus, 'Log in before setting up a provider profile.', 'error');
        return;
    }
    renderAvailabilityPicker();
    providerForm.hidden = false;
    providerSuccessPanel.hidden = true;
    showView('becomeProvider');
}

function openDashboardFlow() {
    showView('dashboard', () => switchDashboardTab('overview'));
}

becomeProviderNav.addEventListener('click', openBecomeProviderFlow);
dashboardNavBtn.addEventListener('click', openDashboardFlow);

mobileBecomeProviderLink.addEventListener('click', () => {
    toggleMobileMenu(false);
    openBecomeProviderFlow();
});

mobileDashboardLink.addEventListener('click', () => {
    toggleMobileMenu(false);
    openDashboardFlow();
});

function toggleMobileMenu(forceState) {
    const willOpen = typeof forceState === 'boolean' ? forceState : mobileMenuPanel.hidden;
    mobileMenuPanel.hidden = !willOpen;
    mobileMenuToggle.setAttribute('aria-expanded', String(willOpen));
}

mobileMenuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleNotifPanel(false);
    toggleMobileMenu();
});

document.addEventListener('click', (e) => {
    if (!mobileMenuPanel.hidden && !mobileMenuPanel.contains(e.target) && e.target !== mobileMenuToggle) {
        toggleMobileMenu(false);
    }
});

adminFooterLink.addEventListener('click', (e) => {
    e.preventDefault();
    showView('admin', () => switchAdminTab('analytics'));
});

notifBell.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMobileMenu(false);
    toggleNotifPanel();
});

document.addEventListener('click', (e) => {
    if (!notifPanel.hidden && !notifPanel.contains(e.target) && e.target !== notifBell) {
        toggleNotifPanel(false);
    }
});

notifMarkAll.addEventListener('click', () => {
    demoNotifications = demoNotifications.map((n) => ({ ...n, unread: false }));
    renderNotifications();
    toast('All notifications marked as read.');
});

notifViewAll.addEventListener('click', () => {
    toggleNotifPanel(false);
    if (!currentUser) return;
    showView('dashboard', () => switchDashboardTab('notifications'));
});

nearMeToggle.addEventListener('click', () => {
    const isOn = nearMeToggle.getAttribute('aria-pressed') !== 'true';
    updateNearMeState(isOn);
});

// Provider name links inside service cards (browse grid, favorites, recommendations)
document.addEventListener('click', (e) => {
    const link = e.target.closest('.provider-link');
    if (link && link.dataset.providerId) {
        openProviderProfile(link.dataset.providerId);
    }
});

providerProfileBack.addEventListener('click', () => showView('main'));

providerTabs.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.profile-tab');
    if (tabBtn) switchProviderTab(tabBtn.dataset.tab);
});

providerSaveBtn.addEventListener('click', () => {
    if (!activeProviderId) return;
    const icon = providerSaveBtn.querySelector('ion-icon');
    const nowSaved = !savedProviderIds.has(activeProviderId);

    if (nowSaved) {
        savedProviderIds.add(activeProviderId);
        icon.setAttribute('name', 'heart');
        toast('Saved to favorites.');
    } else {
        savedProviderIds.delete(activeProviderId);
        icon.setAttribute('name', 'heart-outline');
        toast('Removed from favorites.');
    }

    providerSaveBtn.setAttribute('aria-pressed', String(nowSaved));
});

providerReportBtn.addEventListener('click', () => {
    if (!currentUser) {
        openAuthForm('login');
        return;
    }
    disputeFormTitle.textContent = `Report ${providerName.textContent}`;
    setStatus(disputeFormStatus, '');
    disputeFormContainer.classList.add('is-open');
});

requestSlotBtn.addEventListener('click', () => {
    if (!selectedAvailabilitySlot) return;

    if (!currentUser) {
        openAuthForm('login');
        return;
    }

    demoRequests.unshift({
        id: `r${Date.now()}`,
        serviceTitle: `${providerName.textContent} — booked slot`,
        providerName: providerName.textContent,
        status: 'pending',
        price: getProviderById(activeProviderId)?.price || 0,
        date: selectedAvailabilitySlot.label
    });

    toast(`Requested ${selectedAvailabilitySlot.label}.`);
    renderAvailabilityGrid();
});

writeReviewBtn.addEventListener('click', () => {
    if (!currentUser) {
        openAuthForm('login');
        return;
    }
    reviewForm.hidden = false;
    selectedReviewRating = 0;
    updateReviewStarInput();
});

cancelReviewBtn.addEventListener('click', () => {
    reviewForm.hidden = true;
    reviewComment.value = '';
});

function updateReviewStarInput() {
    reviewStarInput.querySelectorAll('ion-icon').forEach((icon) => {
        const starValue = Number(icon.dataset.star);
        icon.classList.toggle('is-filled', starValue <= selectedReviewRating);
        icon.setAttribute('name', starValue <= selectedReviewRating ? 'star' : 'star-outline');
    });
}

reviewStarInput.addEventListener('click', (e) => {
    const star = e.target.closest('[data-star]');
    if (star) {
        selectedReviewRating = Number(star.dataset.star);
        updateReviewStarInput();
    }
});

reviewForm.addEventListener('submit', (e) => {
    e.preventDefault();

    if (selectedReviewRating === 0) {
        toast('Pick a star rating first.', 'error');
        return;
    }

    const provider = getProviderById(activeProviderId);
    if (!provider) return;

    const reviews = demoReviews[provider.id] || (demoReviews[provider.id] = []);
    reviews.unshift({
        author: currentUser?.name || 'You',
        rating: selectedReviewRating,
        date: new Date().toISOString().slice(0, 10),
        comment: reviewComment.value.trim() || '(No comment provided.)'
    });

    provider.reviewCount += 1;
    provider.avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

    reviewForm.hidden = true;
    reviewComment.value = '';
    renderReviewsTab(provider);
    toast('Review posted — thank you!');
});

becomeProviderBack.addEventListener('click', () => showView('main'));

providerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    setStatus(providerFormStatus, '');

    const title = document.getElementById('providerServiceTitle').value.trim();
    const price = document.getElementById('providerServicePrice').value;
    const location = document.getElementById('providerServiceLocation').value.trim();

    if (!title || !price || !location) {
        setStatus(providerFormStatus, 'Please fill in the service title, price, and location.', 'error');
        return;
    }

    // REPLACE WITH API: POST /providers (title, category, price, location,
    // description, availability, verification file) once the endpoint exists.
    providerForm.hidden = true;
    providerSuccessPanel.hidden = false;
});

providerVerificationFile.addEventListener('change', () => {
    const file = providerVerificationFile.files?.[0];
    dropzoneLabel.textContent = file ? file.name : 'Click to upload, or drag a file here';
});

providerSuccessDone.addEventListener('click', () => {
    showView('dashboard', () => switchDashboardTab('overview'));
});

dashboardNav.addEventListener('click', (e) => {
    const btn = e.target.closest('.dashboard-nav-item');
    if (btn) switchDashboardTab(btn.dataset.dtab);
});

requestStatusFilter.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    requestStatusFilter.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === btn));
    renderRequests(btn.dataset.status);
});

newDisputeBtn.addEventListener('click', () => {
    disputeFormTitle.textContent = 'File a new report';
    setStatus(disputeFormStatus, '');
    disputeFormContainer.classList.add('is-open');
});

function closeDisputeForm() {
    disputeFormContainer.classList.remove('is-open');
}

disputeFormClose.addEventListener('click', closeDisputeForm);
disputeFormOverlay.addEventListener('click', closeDisputeForm);

disputeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const details = document.getElementById('disputeDetails').value.trim();

    if (!details) {
        setStatus(disputeFormStatus, 'Please add some details.', 'error');
        return;
    }

    const disputeReasonLabels = {
        'no-show': "Provider didn't show up",
        quality: 'Service quality issue',
        payment: 'Payment dispute',
        conduct: 'Inappropriate conduct',
        other: 'General report'
    };
    const reasonValue = document.getElementById('disputeReason').value;

    // REPLACE WITH API: POST /reports (reason, details, targetProviderId)
    demoDisputes.unshift({
        id: `d${Date.now()}`,
        subject: disputeReasonLabels[reasonValue] || 'General report',
        status: 'open',
        date: new Date().toISOString().slice(0, 10)
    });

    disputeForm.reset();
    closeDisputeForm();
    toast('Report submitted — our team will review it.');

    if (currentViewKey === 'dashboard') {
        renderDisputes();
    }
});

adminNav.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) switchAdminTab(btn.dataset.atab);
});

adminUserSearch?.addEventListener('input', () => renderAdminUsers(adminUserSearch.value));

// lets someone load the site at yoursite.com/#about directly
window.addEventListener('DOMContentLoaded', () => {
    const hash = window.location.hash.slice(1);
    if (hash && document.getElementById(hash)?.classList.contains('page-section')) {
        showPage(hash);
    }
});

clearServiceLists();
refreshIcons();
restoreSession();