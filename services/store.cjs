'use strict';
const fs = require('node:fs');
const path = require('node:path');
function emptyState() { return { version: 1, current: {}, alarms: {}, events: {}, outbox: {}, lastSeen: 0 }; }
class Store {
  constructor(filename) {
    this.filename = filename;
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.state = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : emptyState();
    if (this.state.version !== 1) throw new Error('Unsupported state format');
  }
  commit(operation) {
    const next = structuredClone(this.state);
    const result = operation(next);
    fs.writeFileSync(this.filename + '.tmp', JSON.stringify(next), { mode: 0o600 });
    fs.renameSync(this.filename + '.tmp', this.filename);
    this.state = next;
    return result;
  }
}
module.exports = { Store, emptyState };
