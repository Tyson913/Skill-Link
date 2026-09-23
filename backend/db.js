const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const seedServices = [
    {
        id: 'svc-home-001',
        title: 'Pipe leak repair',
        provider_name: 'Miguel Santos',
        category: 'home-repair',
        location: 'Cebu City',
        price: 850,
        rating: 4.8,
        description: 'Same-day plumbing help for leaks, clogged drains, and fixture replacements.'
    },
    {
        id: 'svc-tech-001',
        title: 'Laptop tune-up',
        provider_name: 'Ari Cruz',
        category: 'technology',
        location: 'Mandaue',
        price: 600,
        rating: 4.7,
        description: 'Cleanup, malware scans, storage checks, and basic software troubleshooting.'
    },
    {
        id: 'svc-auto-001',
        title: 'Motorcycle maintenance',
        provider_name: 'Benjie Auto Care',
        category: 'automotive',
        location: 'Lapu-Lapu',
        price: 700,
        rating: 4.6,
        description: 'Oil changes, brake checks, chain adjustment, and road-readiness inspection.'
    },
    {
        id: 'svc-clean-001',
        title: 'Apartment deep cleaning',
        provider_name: 'FreshStart Cleaning',
        category: 'cleaning',
        location: 'Cebu City',
        price: 1200,
        rating: 4.9,
        description: 'Kitchen, bath, floor, and window cleaning for condos and small apartments.'
    },
    {
        id: 'svc-beauty-001',
        title: 'Home-service haircut',
        provider_name: 'Luna Studio',
        category: 'beauty-wellness',
        location: 'Talisay',
        price: 450,
        rating: 4.5,
        description: 'Simple cuts, styling, and grooming appointments at your home.'
    },
    {
        id: 'svc-edu-001',
        title: 'Math tutor',
        provider_name: 'Teacher Nica',
        category: 'education',
        location: 'Cebu City',
        price: 500,
        rating: 4.9,
        description: 'One-on-one algebra and geometry tutoring for junior and senior high students.'
    },
    {
        id: 'svc-creative-001',
        title: 'Logo starter package',
        provider_name: 'Pixel North',
        category: 'creative',
        location: 'Remote',
        price: 1500,
        rating: 4.8,
        description: 'Three logo concepts, basic color palette, and export files for small brands.'
    },
    {
        id: 'svc-construction-001',
        title: 'Small masonry repair',
        provider_name: 'Dela Pena Builders',
        category: 'construction',
        location: 'Cebu City',
        price: 2500,
        rating: 4.4,
        description: 'Minor wall, tile, step, and concrete patch repairs for homes and shops.'
    },
    {
        id: 'svc-delivery-001',
        title: 'Van moving assist',
        provider_name: 'QuickMove Cebu',
        category: 'delivery-moving',
        location: 'Mandaue',
        price: 1800,
        rating: 4.7,
        description: 'Small home or office moves with driver, van, and loading support.'
    },
    {
        id: 'svc-pro-001',
        title: 'Business permit assistance',
        provider_name: 'PaperTrail Services',
        category: 'professional',
        location: 'Cebu City',
        price: 2200,
        rating: 4.6,
        description: 'Guidance and document preparation for small business registration tasks.'
    }
];

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

function mapService(row) {
    return {
        id: row.id,
        title: row.title,
        providerName: row.provider_name,
        category: row.category,
        location: row.location,
        price: Number(row.price),
        rating: Number(row.rating),
        description: row.description
    };
}

function mapHire(row, service) {
    return {
        id: row.id,
        userId: row.user_id,
        serviceId: row.service_id,
        status: row.status,
        createdAt: row.created_at,
        service: service ? mapService(service) : null
    };
}

async function ensureSeedServices() {
    const services = await supabaseFetch('/rest/v1/services?select=id&limit=1');

    if (services.length > 0) {
        return;
    }

    await supabaseFetch('/rest/v1/services', {
        method: 'POST',
        headers: {
            Prefer: 'return=minimal'
        },
        body: seedServices
    });
}

async function listServices() {
    await ensureSeedServices();
    const rows = await supabaseFetch('/rest/v1/services?select=*&order=title.asc');
    return rows.map(mapService);
}

async function getServiceById(serviceId) {
    const encodedId = encodeURIComponent(serviceId);
    const rows = await supabaseFetch(`/rest/v1/services?select=*&id=eq.${encodedId}&limit=1`);
    return rows[0] || null;
}

async function listHiresForUser(userId) {
    const encodedUserId = encodeURIComponent(userId);
    const rows = await supabaseFetch(`/rest/v1/hires?select=*&user_id=eq.${encodedUserId}&order=created_at.desc`);
    const services = await listServices();
    const servicesById = new Map(services.map((service) => [service.id, service]));

    return rows.map((hire) => ({
        id: hire.id,
        userId: hire.user_id,
        serviceId: hire.service_id,
        status: hire.status,
        createdAt: hire.created_at,
        service: servicesById.get(hire.service_id) || null
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
        `/rest/v1/hires?select=*&user_id=eq.${encodedUserId}&service_id=eq.${encodedServiceId}&status=eq.requested&limit=1`
    );

    if (existingRows.length > 0) {
        return mapHire(existingRows[0], {
            id: service.id,
            title: service.title,
            provider_name: service.providerName,
            category: service.category,
            location: service.location,
            price: service.price,
            rating: service.rating,
            description: service.description
        });
    }

    const insertedRows = await supabaseFetch('/rest/v1/hires', {
        method: 'POST',
        headers: {
            Prefer: 'return=representation'
        },
        body: {
            id: crypto.randomUUID(),
            user_id: userId,
            service_id: serviceId,
            status: 'requested'
        }
    });

    return {
        ...mapHire(insertedRows[0], null),
        service
    };
}

async function readData() {
    return {
        services: await listServices()
    };
}

module.exports = {
    anonKey,
    createHire,
    listHiresForUser,
    listServices,
    readData,
    supabaseFetch,
    supabaseUrl
};
