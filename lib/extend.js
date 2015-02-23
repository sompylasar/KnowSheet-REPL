'use strict';

// HACK: Use native Node.js extend to avoid adding a dependency on another module.
// @see https://coderwall.com/p/a6rnaw/native-object-copy-in-node-js
var extend = require('util')._extend;

module.exports = extend;
