#!/usr/bin/env node
'use strict';

const debug = require('debug')('couchbackup');

// switch on debug messages
process.env.DEBUG = 'couchbackup';

const config = require('../includes/config.js');
const couchbackup = require('../app.js');

// restore from stdin
couchbackup.restoreStream(process.stdin, config, function(err, data) {
  if (err) {
    debug(`Error: ${err.message}`);
    var exitCode = {
      'RestoreDatabaseNotFound': 10
    }[err.name] || 1;
    process.exit(exitCode);
  }
});
