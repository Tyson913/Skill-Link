const fs = require('fs');
const path = require('path');

const providerEmail = 'skilllink-provider@example.com';

const seedCategories = [
    { id: 1, name: 'Home & Repair', slug: 'home-repair' },
    { id: 2, name: 'Technology', slug: 'technology' },
    { id: 3, name: 'Automotive', slug: 'automotive' },
    { id: 4, name: 'Cleaning', slug: 'cleaning' },
    { id: 5, name: 'Beauty & Wellness', slug: 'beauty-wellness' },
    { id: 6, name: 'Education', slug: 'education' },
    { id: 7, name: 'Creative', slug: 'creative' },
    { id: 8, name: 'Construction', slug: 'construction' },
    { id: 9, name: 'Delivery & Moving', slug: 'delivery-moving' },
    { id: 10, name: 'Professional Services', slug: 'professional' }
];

const seedServices = [
    {
        id: 1,
        user_id: null,
        category_id: 1,
        service_name: 'Pipe leak repair',
        description: 'Same-day plumbing help for leaks, clogged drains, and fixture replacements.',
        price: 850
    },
    {
        id: 2,
        user_id: null,
        category_id: 2,
        service_name: 'Laptop tune-up',
        description: 'Cleanup, malware scans, storage checks, and basic software troubleshooting.',
        price: 600
    },
    {
        id: 3,
        user_id: null,
        category_id: 3,
        service_name: 'Motorcycle maintenance',
        description: 'Oil changes, brake checks, chain adjustment, and road-readiness inspection.',
        price: 700
    },
    {
        id: 4,
        user_id: null,
        category_id: 4,
        service_name: 'Apartment deep cleaning',
        description: 'Kitchen, bath, floor, and window cleaning for condos and small apartments.',
        price: 1200
    },
    {
        id: 5,
        user_id: null,
        category_id: 5,
        service_name: 'Home-service haircut',
        description: 'Simple cuts, styling, and grooming appointments at your home.',
        price: 450
    },
    {
        id: 6,
        user_id: null,
        category_id: 6,
        service_name: 'Math tutor',
        description: 'One-on-one algebra and geometry tutoring for junior and senior high students.',
        price: 500
    },
    {
        id: 7,
        user_id: null,
        category_id: 7,
        service_name: 'Logo starter package',
        description: 'Three logo concepts, basic color palette, and export files for small brands.',
        price: 1500
    },
    {
        id: 8,
        user_id: null,
        category_id: 8,
        service_name: 'Small masonry repair',
        description: 'Minor wall, tile, step, and concrete patch repairs for homes and shops.',
        price: 2500
    },
    {
        id: 9,
        user_id: null,
        category_id: 9,
        service_name: 'Van moving assist',
        description: 'Small home or office moves with driver, van, and loading support.',
        price: 1800
    },
    {
        id: 10,
        user_id: null,
        category_id: 10,
        service_name: 'Business permit assistance',
        description: 'Guidance and document preparation for small business registration tasks.',
        price: 2200
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

function categorySlug(name) {
    const match = seedCategories.find((category) => category.name.toLowerCase() === String(name).toLowerCase());
    return match ? match.slug : String(name || '').toLowerCase().replace(/&/g, '').replace(/\s+/g, '-');
}

function mapService(row, categoriesById, profilesById) {
    const category = categoriesById.get(Number(row.category_id));
    const profile = profilesById.get(row.user_id);

    return {
        id: String(row.id),
        title: row.service_name,
        providerName: profile ? profile.username : 'SkillLink Provider',
        category: category ? categorySlug(category.name) : 'professional',
        location: profile && profile.location ? profile.location : 'Cebu City',
        price: Number(row.price || 0),
        rating: 4.8,
        description: row.description || ''
    };
}

async function findProviderUser() {
    const payload = await supabaseFetch('/auth/v1/admin/users?page=1&per_page=100');
    const users = payload.users || [];
    return users.find((user) => user.email === providerEmail) || null;
}

async function createProviderUser() {
    const payload = await supabaseFetch('/auth/v1/admin/users', {
        method: 'POST',
        body: {
            email: providerEmail,
            password: `SkillLink-${Date.now()}`,
            email_confirm: true,
            user_metadata: {
                name: 'SkillLink Provider',
                full_name: 'SkillLink Provider'
            }
        }
    });

    return payload.user || payload;
}

async function ensureSeedProfile() {
    const providerUser = await findProviderUser() || await createProviderUser();

    await supabaseFetch('/rest/v1/profiles?on_conflict=id', {
        method: 'POST',
        headers: {
            Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: {
            id: providerUser.id,
            username: 'SkillLink Provider',
            location: 'Cebu City',
            status: 'active'
        }
    });

    return providerUser.id;
}

async function ensureSeedCategories() {
    const categories = await supabaseFetch('/rest/v1/categories?select=id&limit=1');

    if (categories.length > 0) {
        return;
    }

    await supabaseFetch('/rest/v1/categories', {
        method: 'POST',
        headers: {
            Prefer: 'return=minimal'
        },
        body: seedCategories.map(({ id, name }) => ({ id, name }))
    });
}

async function ensureSeedServices() {
    const services = await supabaseFetch('/rest/v1/services?select=id&limit=1');

    if (services.length > 0) {
        return;
    }

    const providerProfileId = await ensureSeedProfile();
    await ensureSeedCategories();
    await supabaseFetch('/rest/v1/services', {
        method: 'POST',
        headers: {
            Prefer: 'return=minimal'
        },
        body: seedServices.map((service) => ({
            ...service,
            user_id: providerProfileId
        }))
    });
}

async function listCategories() {
    await ensureSeedCategories();
    return supabaseFetch('/rest/v1/categories?select=*&order=id.asc');
}

async function listProfiles() {
    return supabaseFetch('/rest/v1/profiles?select=*');
}

async function listServices() {
    await ensureSeedServices();

    const [rows, categories, profiles] = await Promise.all([
        supabaseFetch('/rest/v1/services?select=*&order=service_name.asc'),
        listCategories(),
        listProfiles()
    ]);
    const categoriesById = new Map(categories.map((category) => [Number(category.id), category]));
    const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));

    return rows.map((row) => mapService(row, categoriesById, profilesById));
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
