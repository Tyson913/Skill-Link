'use strict';

const { createApp } = require('../backend/server');

let app;
let initialization;

module.exports = async function handler(req, res) {
  try {
    if (!app) {
      const created = createApp();
      app = created.app;
      initialization = created.init();
    }
    await initialization;
    return app(req, res);
  } catch (error) {
    console.error('SkillLink serverless initialization failed:', error.message || error);
    return res.status(503).json({ error: { code: 'unavailable', message: 'The service is not configured yet.' } });
  }
};
