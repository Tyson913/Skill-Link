const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { getTokenFromRequest, getUserByToken, login, logout, requireUser, signup } = require('./authentication');
const { createHire, listHiresForUser } = require('./hires');
const { readData } = require('./db');

const port = Number(process.env.PORT || 3000);
const publicDir = path.resolve(__dirname, '..', 'frontend', 'src');

const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
};

function sendJson(res, status, payload) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(payload));
}

function sendError(res, error) {
    const status = error.status || 500;
    const message = status === 500 ? 'Something went wrong.' : error.message;

    if (status === 500) {
        console.error(error);
    }

    sendJson(res, status, { error: message });
}

async function readBody(req) {
    const chunks = [];
    let size = 0;

    for await (const chunk of req) {
        size += chunk.length;

        if (size > 1_000_000) {
            const error = new Error('Request body is too large.');
            error.status = 413;
            throw error;
        }

        chunks.push(chunk);
    }

    const rawBody = Buffer.concat(chunks).toString('utf8');

    if (!rawBody) {
        return {};
    }

    try {
        return JSON.parse(rawBody);
    } catch {
        const error = new Error('Request body must be valid JSON.');
        error.status = 400;
        throw error;
    }
}

function filterServices(services, searchParams) {
    const query = String(searchParams.get('q') || '').trim().toLowerCase();
    const category = String(searchParams.get('category') || '').trim();
    const location = String(searchParams.get('location') || '').trim().toLowerCase();
    const minPrice = Number(searchParams.get('minPrice') || 0);
    const maxPrice = Number(searchParams.get('maxPrice') || 0);
    const sort = searchParams.get('sort') || 'relevance';

    const filtered = services.filter((service) => {
        const searchableText = [
            service.title,
            service.providerName,
            service.category,
            service.categoryName,
            service.location,
            service.description
        ].join(' ').toLowerCase();

        if (category && service.category !== category) {
            return false;
        }

        if (location && !String(service.location).toLowerCase().includes(location)) {
            return false;
        }

        if (query && !searchableText.includes(query)) {
            return false;
        }

        if (minPrice > 0 && service.price < minPrice) {
            return false;
        }

        if (maxPrice > 0 && service.price > maxPrice) {
            return false;
        }

        return true;
    });

    if (sort === 'price-asc') {
        filtered.sort((a, b) => a.price - b.price);
    } else if (sort === 'price-desc') {
        filtered.sort((a, b) => b.price - a.price);
    } else if (sort === 'rating') {
        filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    return filtered;
}

async function handleApi(req, res, url) {
    if (req.method === 'GET' && url.pathname === '/api/health') {
        sendJson(res, 200, { ok: true });
        return;
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/signup') {
        const body = await readBody(req);
        const authResult = await signup(body);
        sendJson(res, 201, authResult);
        return;
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
        const body = await readBody(req);
        const authResult = await login(body);
        sendJson(res, 200, authResult);
        return;
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
        await logout(getTokenFromRequest(req));
        sendJson(res, 200, { ok: true });
        return;
    }

    if (req.method === 'GET' && url.pathname === '/api/me') {
        const user = await getUserByToken(getTokenFromRequest(req));
        sendJson(res, 200, { user });
        return;
    }

    if (req.method === 'GET' && url.pathname === '/api/services') {
        const data = await readData();
        sendJson(res, 200, {
            categories: data.categories,
            services: filterServices(data.services, url.searchParams)
        });
        return;
    }

    if (req.method === 'GET' && url.pathname === '/api/hires') {
        const { user } = await requireUser(req);
        sendJson(res, 200, {
            hires: await listHiresForUser(user.id)
        });
        return;
    }

    if (req.method === 'POST' && url.pathname === '/api/hires') {
        const { user } = await requireUser(req);
        const body = await readBody(req);
        const hire = await createHire(user.id, body.serviceId);
        sendJson(res, 201, { hire });
        return;
    }

    sendJson(res, 404, { error: 'API route was not found.' });
}

async function serveStatic(req, res, url) {
    let requestPath = decodeURIComponent(url.pathname);

    if (requestPath === '/') {
        requestPath = '/index.html';
    }

    if (requestPath.startsWith('/frontend/src/')) {
        requestPath = requestPath.replace('/frontend/src/', '/');
    }

    const filePath = path.resolve(publicDir, `.${requestPath}`);
    const relativePath = path.relative(publicDir, filePath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        sendJson(res, 403, { error: 'Forbidden.' });
        return;
    }

    try {
        const file = await fs.readFile(filePath);
        const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': contentType
        });
        res.end(file);
    } catch {
        const indexFile = await fs.readFile(path.join(publicDir, 'index.html'));
        res.writeHead(200, {
            'Content-Type': mimeTypes['.html']
        });
        res.end(indexFile);
    }
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    try {
        if (url.pathname.startsWith('/api/')) {
            await handleApi(req, res, url);
            return;
        }

        await serveStatic(req, res, url);
    } catch (error) {
        sendError(res, error);
    }
});

server.listen(port, () => {
    console.log(`SkillLink is running at http://localhost:${port}`);
});
