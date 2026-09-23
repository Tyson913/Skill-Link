const { anonKey, supabaseFetch } = require('./db');

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeUser(user) {
    const metadata = user.user_metadata || {};
    const email = user.email || '';

    return {
        id: user.id,
        name: metadata.name || metadata.full_name || email.split('@')[0] || 'Account',
        email,
        createdAt: user.created_at || user.createdAt || null
    };
}

async function upsertProfile(user) {
    const safeUser = sanitizeUser(user);

    await supabaseFetch('/rest/v1/profiles?on_conflict=id', {
        method: 'POST',
        headers: {
            Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: {
            id: safeUser.id,
            username: safeUser.name,
            location: null,
            status: 'active'
        }
    });

    return safeUser;
}

function extractToken(payload) {
    return payload.access_token ||
        (payload.session && payload.session.access_token) ||
        '';
}

function extractUser(payload) {
    return payload.user || payload;
}

async function signup({ name, email, password }) {
    const cleanName = String(name || '').trim();
    const cleanEmail = normalizeEmail(email);

    if (!cleanName) {
        const error = new Error('Name is required.');
        error.status = 400;
        throw error;
    }

    if (!validateEmail(cleanEmail)) {
        const error = new Error('Enter a valid email address.');
        error.status = 400;
        throw error;
    }

    if (String(password || '').length < 6) {
        const error = new Error('Password must be at least 6 characters.');
        error.status = 400;
        throw error;
    }

    await supabaseFetch('/auth/v1/admin/users', {
        method: 'POST',
        body: {
            email: cleanEmail,
            password,
            email_confirm: true,
            user_metadata: {
                name: cleanName,
                full_name: cleanName
            }
        }
    });

    return login({ email: cleanEmail, password });
}

async function login({ email, password }) {
    const cleanEmail = normalizeEmail(email);
    const payload = await supabaseFetch('/auth/v1/token?grant_type=password', {
        method: 'POST',
        key: anonKey,
        token: anonKey,
        body: {
            email: cleanEmail,
            password
        }
    });
    const user = extractUser(payload);
    const safeUser = await upsertProfile(user);

    return {
        user: safeUser,
        token: extractToken(payload)
    };
}

async function logout(token) {
    if (!token) {
        return;
    }

    await supabaseFetch('/auth/v1/logout', {
        method: 'POST',
        key: anonKey,
        token
    });
}

function getTokenFromRequest(req) {
    const authorization = req.headers.authorization || '';

    if (authorization.startsWith('Bearer ')) {
        return authorization.slice('Bearer '.length).trim();
    }

    return '';
}

async function getUserByToken(token) {
    if (!token) {
        return null;
    }

    const user = await supabaseFetch('/auth/v1/user', {
        key: anonKey,
        token
    });

    return sanitizeUser(user);
}

async function requireUser(req) {
    const token = getTokenFromRequest(req);
    const user = await getUserByToken(token);

    if (!user) {
        const error = new Error('Log in to continue.');
        error.status = 401;
        throw error;
    }

    return { user, token };
}

module.exports = {
    getTokenFromRequest,
    getUserByToken,
    login,
    logout,
    requireUser,
    signup
};
