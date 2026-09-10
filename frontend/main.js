        const loginBttn = document.getElementById('loginBttn');
        const signupBttn = document.getElementById('signupBttn');
        const overlay = document.getElementById('authOverlay');
        const closeAuth = document.getElementById('closeAuth');
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');

        function showPanel(panel) {
            const isLogin = panel === 'login';
            loginForm.hidden = !isLogin;
            signupForm.hidden = isLogin;
        }

        function openAuth(panel) {
            overlay.hidden = false;
            showPanel(panel);
            document.body.style.overflow = 'hidden';
            (panel === 'signup' ? signupForm : loginForm).querySelector('input').focus();
        }

        function closeAuthModal() {
            overlay.hidden = true;
            document.body.style.overflow = '';
        }

        loginBttn.addEventListener('click', () => openAuth('login'));
        signupBttn.addEventListener('click', () => openAuth('signup'));
        closeAuth.addEventListener('click', closeAuthModal);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeAuthModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !overlay.hidden) closeAuthModal();
        });

        document.querySelectorAll('[data-switch]').forEach((btn) => {
            btn.addEventListener('click', () => showPanel(btn.dataset.switch));
        });

        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            console.log('login submit', Object.fromEntries(new FormData(loginForm)));
        });

        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();

            console.log('signup submit', Object.fromEntries(new FormData(signupForm)));
        });