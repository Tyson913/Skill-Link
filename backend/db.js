const fs = require('fs');
const path = require('path');

function loadEnvFile() {
    const envPath = path.resolve(__dirname, '..', '.env');

    if (!fs.existsSync(envPath)) {
        return {};
    }

    return fs
        .readFileSync(envPath, 'utf8')
        .split(/\r?\n/)
        .reduce((env, line) => {
            const trimmed = line.trim();

            if (!trimmed || trimmed.startsWith('#')) {
                return env;
            }

            const separatorIndex = trimmed.indexOf('=');

            if (separatorIndex === -1) {
                return env;
            }

            const key = trimmed.slice(0, separatorIndex).trim();
            let value = trimmed.slice(separatorIndex + 1).trim();

            if (
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }

            env[key] = value;
            return env;
        }, {});
}

const fileEnv = loadEnvFile();
const supabaseUrl = process.env.SUPABASE_URL ||
    process.env.supaprojectlink ||
    process.env['supa-project-link'] ||
    fileEnv.SUPABASE_URL ||
    fileEnv.supaprojectlink ||
    fileEnv['supa-project-link'];
const anonKey = process.env.SUPABASE_ANON_KEY ||
    process.env.sbpublishablekey ||
    process.env['sb-publishabl-ekey'] ||
    process.env['sb-anon-key'] ||
    fileEnv.SUPABASE_ANON_KEY ||
    fileEnv.sbpublishablekey ||
    fileEnv['sb-publishabl-ekey'] ||
    fileEnv['sb-anon-key'];
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env['sb-service-role-key'] ||
    fileEnv.SUPABASE_SERVICE_ROLE_KEY ||
    fileEnv['sb-service-role-key'];

function requireSupabaseConfig() {
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
        const error = new Error('Supabase URL, anon key, and service-role key are required in .env.');
        error.status = 500;
        throw error;
    }
}

function normalizeSupabaseError(pathname, payload) {
    const code = payload && payload.code;
    const message = payload && (payload.message || payload.msg || payload.error_description || payload.error);

    if (code === '42P01') {
        return `Supabase table is missing for ${pathname}. Run backend/supabase-schema.sql in the Supabase SQL editor.`;
    }

    return message || 'Supabase request failed.';
}

async function supabaseFetch(pathname, options = {}) {
    requireSupabaseConfig();

    const key = options.key || serviceRoleKey;
    const headers = {
        apikey: key,
        Authorization: `Bearer ${options.token || key}`,
        Accept: 'application/json',
        ...(options.headers || {})
    };

    if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${supabaseUrl}${pathname}`, {
        method: options.method || 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
        const error = new Error(normalizeSupabaseError(pathname, payload));
        error.status = response.status >= 500 ? 502 : response.status;
        error.details = payload;
        throw error;
    }

    return payload;
}

function categorySlug(name) {
    return String(name || 'uncategorized')
        .trim()
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'uncategorized';
}

function mapCategory(row) {
    return {
        id: String(row.id),
        name: row.name,
        slug: categorySlug(row.name)
    };
}

function averageRating(ratings) {
    if (!ratings || ratings.length === 0) {
        return null;
    }

    const total = ratings.reduce((sum, rating) => sum + Number(rating || 0), 0);
    return Math.round((total / ratings.length) * 10) / 10;
}

function mapService(row, categoriesById, profilesById, ratingsByServiceId) {
    const category = categoriesById.get(Number(row.category_id));
    const profile = profilesById.get(row.user_id);
    const categoryName = category ? category.name : 'Uncategorized';

    return {
        id: String(row.id),
        title: row.service_name,
        providerName: profile && profile.username ? profile.username : 'Provider',
        category: categorySlug(categoryName),
        categoryName,
        location: profile && profile.location ? profile.location : 'Location not set',
        price: Number(row.price || 0),
        rating: averageRating(ratingsByServiceId.get(String(row.id))),
        description: row.description || ''
    };
}

async function listCategories() {
    const rows = await supabaseFetch('/rest/v1/categories?select=*&order=name.asc');
    return rows.map(mapCategory);
}

async function listProfiles() {
    return supabaseFetch('/rest/v1/profiles?select=*');
}

async function listServiceRows() {
    return supabaseFetch('/rest/v1/services?select=*&order=service_name.asc');
}

async function listRatingsByServiceId() {
    const [hires, reviews] = await Promise.all([
        supabaseFetch('/rest/v1/hires?select=id,service_id'),
        supabaseFetch('/rest/v1/reviews?select=hire_id,rating')
    ]);
    const hireServiceIds = new Map(hires.map((hire) => [String(hire.id), String(hire.service_id)]));
    const ratingsByServiceId = new Map();

    reviews.forEach((review) => {
        const serviceId = hireServiceIds.get(String(review.hire_id));

        if (!serviceId) {
            return;
        }

        if (!ratingsByServiceId.has(serviceId)) {
            ratingsByServiceId.set(serviceId, []);
        }

        ratingsByServiceId.get(serviceId).push(Number(review.rating));
    });

    return ratingsByServiceId;
}

async function listServices() {
    const [rows, categories, profiles, ratingsByServiceId] = await Promise.all([
        listServiceRows(),
        supabaseFetch('/rest/v1/categories?select=*'),
        listProfiles(),
        listRatingsByServiceId()
    ]);
    const categoriesById = new Map(categories.map((category) => [Number(category.id), category]));
    const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));

    return rows.map((row) => mapService(row, categoriesById, profilesById, ratingsByServiceId));
}

async function getServiceById(serviceId) {
    const encodedId = encodeURIComponent(serviceId);
    const rows = await supabaseFetch(`/rest/v1/services?select=*&id=eq.${encodedId}&limit=1`);
    return rows[0] || null;
}

async function listHiresForUser(userId) {
    const encodedUserId = encodeURIComponent(userId);
    const rows = await supabaseFetch(`/rest/v1/hires?select=*&client_id=eq.${encodedUserId}&order=created_at.desc`);
    const services = await listServices();
    const servicesById = new Map(services.map((service) => [String(service.id), service]));

    return rows.map((hire) => ({
        id: String(hire.id),
        userId: hire.client_id,
        serviceId: String(hire.service_id),
        status: hire.status,
        createdAt: hire.created_at,
        service: servicesById.get(String(hire.service_id)) || null
    }));
}

async function createHire(userId, serviceId) {
    const service = await getServiceById(serviceId);

    if (!service) {
        const error = new Error('Service was not found.');
        error.status = 404;
        throw error;
    }

    const encodedUserId = encodeURIComponent(userId);
    const encodedServiceId = encodeURIComponent(serviceId);
    const existingRows = await supabaseFetch(
        `/rest/v1/hires?select=*&client_id=eq.${encodedUserId}&service_id=eq.${encodedServiceId}&status=eq.requested&limit=1`
    );

    if (existingRows.length > 0) {
        return {
            id: String(existingRows[0].id),
            userId: existingRows[0].client_id,
            serviceId: String(existingRows[0].service_id),
            status: existingRows[0].status,
            createdAt: existingRows[0].created_at,
            service: (await listServices()).find((candidate) => candidate.id === String(serviceId)) || null
        };
    }

    const insertedRows = await supabaseFetch('/rest/v1/hires', {
        method: 'POST',
        headers: {
            Prefer: 'return=representation'
        },
        body: {
            id: Date.now(),
            client_id: userId,
            service_id: Number(serviceId),
            agreed_price: Number(service.price || 0),
            status: 'requested'
        }
    });
    const publicService = (await listServices()).find((candidate) => candidate.id === String(serviceId)) || null;

    return {
        id: String(insertedRows[0].id),
        userId: insertedRows[0].client_id,
        serviceId: String(insertedRows[0].service_id),
        status: insertedRows[0].status,
        createdAt: insertedRows[0].created_at,
        service: publicService
    };
}

async function readData() {
    const [categories, services] = await Promise.all([
        listCategories(),
        listServices()
    ]);

    return {
        categories,
        services
    };
}

module.exports = {
    anonKey,
    createHire,
    listCategories,
    listHiresForUser,
    listServices,
    readData,
    supabaseFetch,
    supabaseUrl
};
