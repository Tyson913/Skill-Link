const API_BASE = '/api';
const authStorageKey = 'skilllinkToken';

let authToken = localStorage.getItem(authStorageKey) || '';
let currentUser = null;
let services = [];

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
const serviceSearch = document.getElementById('serviceSearch');
const appStatus = document.getElementById('appStatus');
const loginStatus = document.getElementById('loginStatus');
const signupStatus = document.getElementById('signupStatus');
const categoryPage = document.getElementById('categoryPage');
const categorySpans = document.querySelectorAll('.service-category-container span');
const serviceSections = document.querySelectorAll('.services');
const closeButtons = document.querySelectorAll('.service-close');

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

function refreshIcons() {
    if (window.lucide) {
        window.lucide.createIcons();
    }
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
    return Object.fromEntries(new FormData(form).entries());
}

function setBusy(form, isBusy) {
    const button = form.querySelector('button[type="submit"]');

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
    closeAuthForm();
}

function setLoggedOut() {
    currentUser = null;
    authToken = '';
    localStorage.removeItem(authStorageKey);
    usernameBttn.hidden = true;
    logoutBtn.hidden = true;
    loginBtn.hidden = false;
    signupBtn.hidden = false;
}

function formatPrice(price) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        maximumFractionDigits: 0
    }).format(price);
}

function clearServiceLists() {
    document.querySelectorAll('.service-list').forEach((list) => {
        list.textContent = 'No listings yet - check back soon.';
        list.classList.add('is-empty');
    });
}

function buildServiceCard(service) {
    const card = document.createElement('article');
    card.className = 'service-card';

    const header = document.createElement('div');
    header.className = 'service-card-header';

    const titleGroup = document.createElement('div');

    const title = document.createElement('h3');
    title.textContent = service.title;

    const provider = document.createElement('p');
    provider.className = 'service-provider';
    provider.textContent = service.providerName;

    titleGroup.append(title, provider);

    const price = document.createElement('span');
    price.className = 'service-price';
    price.textContent = formatPrice(service.price);

    header.append(titleGroup, price);

    const description = document.createElement('p');
    description.className = 'service-description';
    description.textContent = service.description;

    const meta = document.createElement('div');
    meta.className = 'service-meta';

    const location = document.createElement('span');
    location.innerHTML = '<i data-lucide="map-pin"></i>';
    location.append(` ${service.location}`);

    const rating = document.createElement('span');
    rating.innerHTML = '<i data-lucide="star"></i>';
    rating.append(` ${service.rating.toFixed(1)}`);

    meta.append(location, rating);

    const footer = document.createElement('div');
    footer.className = 'service-card-footer';

    const category = document.createElement('span');
    category.className = 'service-tag';
    category.textContent = categoryLabels[service.category] || service.category;

    const hireButton = document.createElement('button');
    hireButton.type = 'button';
    hireButton.className = 'btn btn-primary';
    hireButton.dataset.hireServiceId = service.id;
    hireButton.textContent = 'Hire';

    footer.append(category, hireButton);
    card.append(header, description, meta, footer);

    return card;
}

function renderServices() {
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

    refreshIcons();
}

function collectServiceQuery() {
    const formData = new FormData(filterForm);
    const params = new URLSearchParams();
    const query = serviceSearch.value.trim();

    if (query) {
        params.set('q', query);
    }

    for (const [key, value] of formData.entries()) {
        if (String(value).trim()) {
            params.set(key, String(value).trim());
        }
    }

    return params.toString();
}

async function loadServices() {
    const queryString = collectServiceQuery();

    try {
        setStatus(appStatus, 'Loading services...');
        const payload = await apiRequest(`/services${queryString ? `?${queryString}` : ''}`);
        services = payload.services || [];
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
    landingPage.style.display = 'none';
    mainPage.style.display = 'block';
    loadServices();
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
        loginForm.reset();
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

        authToken = payload.token;
        localStorage.setItem(authStorageKey, authToken);
        setLoggedIn(payload.user);
        signupForm.reset();
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
    window.setTimeout(loadServices, 0);
});

serviceSearch.addEventListener('input', queueServiceLoad);

categorySpans.forEach((span) => {
    span.addEventListener('click', () => {
        const serviceId = span.dataset.service;
        const selectedService = document.getElementById(serviceId);

        if (!selectedService) {
            return;
        }

        categoryPage.hidden = true;

        serviceSections.forEach((service) => {
            service.hidden = true;
        });

        selectedService.hidden = false;
        refreshIcons();
    });
});

closeButtons.forEach((button) => {
    button.addEventListener('click', () => {
        serviceSections.forEach((service) => {
            service.hidden = true;
        });

        categoryPage.hidden = false;
        refreshIcons();
    });
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
    } catch (error) {
        hireButton.disabled = false;
        hireButton.textContent = 'Hire';
        setStatus(appStatus, getErrorMessage(error), 'error');
    }
});

clearServiceLists();
refreshIcons();
restoreSession();
