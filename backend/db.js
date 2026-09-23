const fs = require('fs/promises');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'skilllink.json');

const seedServices = [
    {
        id: 'svc-home-001',
        title: 'Pipe leak repair',
        providerName: 'Miguel Santos',
        category: 'home-repair',
        location: 'Cebu City',
        price: 850,
        rating: 4.8,
        description: 'Same-day plumbing help for leaks, clogged drains, and fixture replacements.'
    },
    {
        id: 'svc-tech-001',
        title: 'Laptop tune-up',
        providerName: 'Ari Cruz',
        category: 'technology',
        location: 'Mandaue',
        price: 600,
        rating: 4.7,
        description: 'Cleanup, malware scans, storage checks, and basic software troubleshooting.'
    },
    {
        id: 'svc-auto-001',
        title: 'Motorcycle maintenance',
        providerName: 'Benjie Auto Care',
        category: 'automotive',
        location: 'Lapu-Lapu',
        price: 700,
        rating: 4.6,
        description: 'Oil changes, brake checks, chain adjustment, and road-readiness inspection.'
    },
    {
        id: 'svc-clean-001',
        title: 'Apartment deep cleaning',
        providerName: 'FreshStart Cleaning',
        category: 'cleaning',
        location: 'Cebu City',
        price: 1200,
        rating: 4.9,
        description: 'Kitchen, bath, floor, and window cleaning for condos and small apartments.'
    },
    {
        id: 'svc-beauty-001',
        title: 'Home-service haircut',
        providerName: 'Luna Studio',
        category: 'beauty-wellness',
        location: 'Talisay',
        price: 450,
        rating: 4.5,
        description: 'Simple cuts, styling, and grooming appointments at your home.'
    },
    {
        id: 'svc-edu-001',
        title: 'Math tutor',
        providerName: 'Teacher Nica',
        category: 'education',
        location: 'Cebu City',
        price: 500,
        rating: 4.9,
        description: 'One-on-one algebra and geometry tutoring for junior and senior high students.'
    },
    {
        id: 'svc-creative-001',
        title: 'Logo starter package',
        providerName: 'Pixel North',
        category: 'creative',
        location: 'Remote',
        price: 1500,
        rating: 4.8,
        description: 'Three logo concepts, basic color palette, and export files for small brands.'
    },
    {
        id: 'svc-construction-001',
        title: 'Small masonry repair',
        providerName: 'Dela Pena Builders',
        category: 'construction',
        location: 'Cebu City',
        price: 2500,
        rating: 4.4,
        description: 'Minor wall, tile, step, and concrete patch repairs for homes and shops.'
    },
    {
        id: 'svc-delivery-001',
        title: 'Van moving assist',
        providerName: 'QuickMove Cebu',
        category: 'delivery-moving',
        location: 'Mandaue',
        price: 1800,
        rating: 4.7,
        description: 'Small home or office moves with driver, van, and loading support.'
    },
    {
        id: 'svc-pro-001',
        title: 'Business permit assistance',
        providerName: 'PaperTrail Services',
        category: 'professional',
        location: 'Cebu City',
        price: 2200,
        rating: 4.6,
        description: 'Guidance and document preparation for small business registration tasks.'
    }
];

async function ensureStore() {
    await fs.mkdir(dataDir, { recursive: true });

    try {
        await fs.access(dataFile);
    } catch {
        await writeData({
            users: [],
            sessions: [],
            services: seedServices,
            hires: []
        });
    }
}

async function readData() {
    await ensureStore();
    const raw = await fs.readFile(dataFile, 'utf8');
    const data = JSON.parse(raw);

    if (!Array.isArray(data.services) || data.services.length === 0) {
        data.services = seedServices;
        await writeData(data);
    }

    return data;
}

async function writeData(data) {
    await fs.mkdir(dataDir, { recursive: true });
    const tempFile = `${dataFile}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(data, null, 2));
    await fs.rename(tempFile, dataFile);
}

async function updateData(mutator) {
    const data = await readData();
    const result = await mutator(data);
    await writeData(data);
    return result;
}

function createId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

module.exports = {
    createId,
    readData,
    updateData
};
