'use strict';
const http = require('node:http');
const express = require('express');
const RED = require('node-red');
const bcrypt = require('bcryptjs');
const fs = require('node:fs');
const path = require('node:path');
const { flows } = require('./flows.cjs');
const { authenticate } = require('./auth.cjs');
const mode = process.argv[2];
if (!['viewer','caregiver'].includes(mode)) throw new Error('Chọn viewer hoặc caregiver');
const password = process.env[`NODERED_${mode.toUpperCase()}_PASSWORD`];
if (!password || !process.env.NODERED_ADMIN_PASSWORD) throw new Error('Chạy npm run setup:local trước');
const userDir = process.env.PILLBOX_NODERED_USER_DIR || path.join(__dirname, '../data/nodered-' + mode);
fs.mkdirSync(userDir, { recursive: true });
const flowFile = path.join(userDir, 'flows.json');
if (!fs.existsSync(flowFile)) fs.writeFileSync(flowFile, JSON.stringify(flows(mode)));
// Strip the caregiver credential from the viewer process before evaluating flows.
if (mode === 'viewer') delete process.env.CAREGIVER_API_TOKEN;
const app = express();
const server = http.createServer(app);
const port = mode === 'viewer' ? 1880 : 1881;
RED.init(server, { userDir, flowFile, httpAdminRoot: '/editor', httpNodeRoot: '/',
  dashboard: {
    middleware(req, res, next) {
      if (authenticate(req.headers.authorization, mode, password)) return next();
      res.set('WWW-Authenticate', 'Basic realm="Pillbox"'); res.status(401).end('Authentication required');
    },
    ioMiddleware(socket, next) {
      next(authenticate(socket.handshake.headers.authorization, mode, password) ? undefined : new Error('Authentication required'));
    }
  },
  credentialSecret: process.env.NODERED_ADMIN_PASSWORD, uiPort: port, uiHost: '127.0.0.1',
  adminAuth: { type: 'credentials', users: [{ username: 'admin', password: bcrypt.hashSync(process.env.NODERED_ADMIN_PASSWORD, 10), permissions: '*' }] },
  httpNodeAuth: { user: mode, pass: bcrypt.hashSync(password, 10) },
  functionExternalModules: false, logging: { console: { level: 'warn', metrics: false, audit: false } }
});
app.use('/editor', RED.httpAdmin);
app.use('/', RED.httpNode);
server.listen(port, '127.0.0.1', () => RED.start().then(() => console.log(`Node-RED ${mode}: http://127.0.0.1:${port}/dashboard/pillbox`)));
process.on('SIGINT', () => RED.stop().then(() => server.close()));
