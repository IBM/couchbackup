#!/usr/bin/env node
'use strict';

const config = require('../includes/config.js');
const error = require('../includes/error.js');
const cliutils = require('../includes/cliutils.js');
const couchbackup = require('../app.js');

// copyIfDefined ensures we don't overwrite defaults for
// new methods with `undefined`.
var opts = {};
cliutils.copyIfDefined(config, 'COUCH_BUFFER_SIZE', opts, 'bufferSize');
cliutils.copyIfDefined(config, 'COUCH_PARALLELISM', opts, 'parallelism');

// Restore from stdin
return couchbackup.restore(
  process.stdin,
  cliutils.databaseUrl(config.COUCH_URL, config.COUCH_DATABASE),
  opts,
  error.terminationCallback
);
