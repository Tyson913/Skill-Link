const { createId, readData, updateData } = require('./db');

async function listHiresForUser(userId) {
    const data = await readData();

    return data.hires
        .filter((hire) => hire.userId === userId)
        .map((hire) => {
            const service = data.services.find((candidate) => candidate.id === hire.serviceId);
            return {
                ...hire,
                service: service || null
            };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function createHire(userId, serviceId) {
    return updateData((data) => {
        const service = data.services.find((candidate) => candidate.id === serviceId);

        if (!service) {
            const error = new Error('Service was not found.');
            error.status = 404;
            throw error;
        }

        const existingHire = data.hires.find(
            (hire) => hire.userId === userId &&
                hire.serviceId === serviceId &&
                hire.status === 'requested'
        );

        if (existingHire) {
            return {
                ...existingHire,
                service
            };
        }

        const hire = {
            id: createId('hire'),
            userId,
            serviceId,
            status: 'requested',
            createdAt: new Date().toISOString()
        };

        data.hires.push(hire);

        return {
            ...hire,
            service
        };
    });
}

module.exports = {
    createHire,
    listHiresForUser
};
