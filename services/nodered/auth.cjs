const { equal } = require('../broker.cjs');
function authenticate(header, username, password) {
  if (typeof header !== 'string' || !header.startsWith('Basic ')) return false;
  const value = Buffer.from(header.slice(6), 'base64').toString();
  const colon = value.indexOf(':');
  return colon > 0 && equal(value.slice(0, colon), username) && equal(value.slice(colon + 1), password);
}
module.exports = { authenticate };
