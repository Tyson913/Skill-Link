const crypto = require('crypto');
const { createId, readData, updateData } = require('./db');

const publicUserFields = ['id', 'name', 'email', 'createdAt'];

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function sanitizeUser(user) {
    return publicUserFields.reduce((safeUser, key) => {
        safeUser[key] = user[key];
        return safeUser;
    }, {});
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto
        .pbkdf2Sync(String(password), salt, 100000, 64, 'sha512')
        .toString('hex');

    return { salt, hash };
}

function verifyPassword(password, user) {
    const { hash } = hashPassword(password, user.passwordSalt);
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(user.passwordHash));
}

function createSession(userId) {
    return {
        id: createId('session'),
        userId,
        token: crypto.randomBytes(32).toString('hex'),
        createdAt: new Date().toISOString()
    };
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

    return updateData((data) => {
        const existingUser = data.users.find((user) => user.email === cleanEmail);

        if (existingUser) {
            const error = new Error('An account with that email already exists.');
            error.status = 409;
            throw error;
        }

        const passwordRecord = hashPassword(password);
        const user = {
            id: createId('user'),
            name: cleanName,
            email: cleanEmail,
            passwordSalt: passwordRecord.salt,
            passwordHash: passwordRecord.hash,
            createdAt: new Date().toISOString()
        };
        const session = createSession(user.id);

        data.users.push(user);
        data.sessions.push(session);

        return {
            user: sanitizeUser(user),
            token: session.token
        };
    });
}

async function login({ email, password }) {
    const cleanEmail = normalizeEmail(email);

    return updateData((data) => {
        const user = data.users.find((candidate) => candidate.email === cleanEmail);

        if (!user || !verifyPassword(password || '', user)) {
            const error = new Error('Invalid email or password.');
            error.status = 401;
            throw error;
        }

        const session = createSession(user.id);
        data.sessions.push(session);

        return {
            user: sanitizeUser(user),
            token: session.token
        };
    });
}

async function logout(token) {
    await updateData((data) => {
        data.sessions = data.sessions.filter((session) => session.token !== token);
        return null;
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

    const data = await readData();
    const session = data.sessions.find((candidate) => candidate.token === token);

    if (!session) {
        return null;
    }

    const user = data.users.find((candidate) => candidate.id === session.userId);
    return user ? sanitizeUser(user) : null;
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
