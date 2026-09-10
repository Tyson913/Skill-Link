lucide.createIcons();
const mainPageBttnTrigger = document.getElementById("main-page-trigger");
const mainPage = document.getElementById("mainPage");
const landingPage = document.getElementById("landingPage");

mainPageBttnTrigger.addEventListener('click', () => {
    landingPage.style.display = 'none';
    mainPage.style.display = 'block';
});

const authFormContainer = document.getElementById('authFormContainer');
const authFormOverlay = document.getElementById('authFormOverlay');
const authFormClose = document.getElementById('authFormClose');
const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const switchToSignup = document.getElementById('switchToSignup');
const switchToLogin = document.getElementById('switchToLogin');

function openAuthForm(formName) {
    authFormContainer.classList.add('is-open');
    loginForm.classList.toggle('is-hidden', formName !== 'login');
    signupForm.classList.toggle('is-hidden', formName !== 'signup');
}

function closeAuthForm() {
    authFormContainer.classList.remove('is-open');
}

loginBtn.addEventListener('click', () => openAuthForm('login'));
signupBtn.addEventListener('click', () => openAuthForm('signup'));
authFormClose.addEventListener('click', closeAuthForm);
authFormOverlay.addEventListener('click', closeAuthForm);

switchToSignup.addEventListener('click', (e) => {
    e.preventDefault();
    openAuthForm('signup');
});

switchToLogin.addEventListener('click', (e) => {
    e.preventDefault();
    openAuthForm('login');
});

