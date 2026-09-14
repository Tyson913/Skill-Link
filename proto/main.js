lucide.createIcons();

const mainPageTrigger =
    document.getElementById('main-page-trigger');

const mainPage =
    document.getElementById('mainPage');

const landingPage =
    document.getElementById('landingPage');


mainPageTrigger.addEventListener('click', () => {

    landingPage.style.display = 'none';
    mainPage.style.display = 'block';

});

const authFormContainer =
    document.getElementById('authFormContainer');

const authFormOverlay =
    document.getElementById('authFormOverlay');

const authFormClose =
    document.getElementById('authFormClose');

const loginBtn =
    document.getElementById('loginBtn');

const signupBtn =
    document.getElementById('signupBtn');

const loginForm =
    document.getElementById('loginForm');

const signupForm =
    document.getElementById('signupForm');

const switchToSignup =
    document.getElementById('switchToSignup');

const switchToLogin =
    document.getElementById('switchToLogin');


function openAuthForm(formName) {

    authFormContainer.classList.add('is-open');

    loginForm.classList.toggle(
        'is-hidden',
        formName !== 'login'
    );

    signupForm.classList.toggle(
        'is-hidden',
        formName !== 'signup'
    );

}


function closeAuthForm() {

    authFormContainer.classList.remove('is-open');

}


loginBtn.addEventListener(
    'click',
    () => openAuthForm('login')
);


signupBtn.addEventListener(
    'click',
    () => openAuthForm('signup')
);


authFormClose.addEventListener(
    'click',
    closeAuthForm
);


authFormOverlay.addEventListener(
    'click',
    closeAuthForm
);


switchToSignup.addEventListener(
    'click',
    (e) => {

        e.preventDefault();

        openAuthForm('signup');

    }
);


switchToLogin.addEventListener(
    'click',
    (e) => {

        e.preventDefault();

        openAuthForm('login');

    }
);

const usernameBttn =
    document.getElementById('usernameBttn');

const logoutBtn =
    document.getElementById('logout');


function setLoggedIn(username) {

    usernameBttn.textContent = username;

    usernameBttn.hidden = false;
    logoutBtn.hidden = false;

    loginBtn.hidden = true;
    signupBtn.hidden = true;

    closeAuthForm();

}


function setLoggedOut() {

    usernameBttn.hidden = true;
    logoutBtn.hidden = true;

    loginBtn.hidden = false;
    signupBtn.hidden = false;

}


loginForm.addEventListener(
    'submit',
    (e) => {

        e.preventDefault();

        const email =
            document.getElementById('loginEmail').value;

        const username =
            email.split('@')[0] || 'Account';

        setLoggedIn(username);

    }
);


signupForm.addEventListener(
    'submit',
    (e) => {

        e.preventDefault();

        const name =
            document.getElementById('signupName').value ||
            'Account';

        setLoggedIn(name);

    }
);


logoutBtn.addEventListener(
    'click',
    setLoggedOut
);

const filterToggle =
    document.getElementById('filterToggle');

const filterForm =
    document.getElementById('filter-form');


filterToggle.addEventListener(
    'click',
    () => {

        const willShow =
            filterForm.hidden;

        filterForm.hidden =
            !willShow;

        filterToggle.setAttribute(
            'aria-expanded',
            String(willShow)
        );

    }
);


filterForm.addEventListener(
    'submit',
    (e) => {

        e.preventDefault();

    }
);

document
    .querySelectorAll('.service-list')
    .forEach((list) => {

        list.textContent =
            'No listings yet — check back soon.';

        list.classList.add('is-empty');

    });


const categoryPage =
    document.getElementById('categoryPage');

const categorySpans =
    document.querySelectorAll(
        '.service-category-container span'
    );

const services =
    document.querySelectorAll('.services');

const closeButtons =
    document.querySelectorAll('.service-close');

categorySpans.forEach((span) => {

    span.addEventListener('click', () => {

        const serviceId =
            span.dataset.service;

        const selectedService =
            document.getElementById(serviceId);


        if (!selectedService) {
            return;
        }

        categoryPage.hidden = true;



        services.forEach((service) => {
            service.hidden = true;
        });


        selectedService.hidden = false;



        lucide.createIcons();

    });

});


closeButtons.forEach((button) => {

    button.addEventListener('click', () => {


        services.forEach((service) => {
            service.hidden = true;
        });

        categoryPage.hidden = false;

        lucide.createIcons();
    });
});