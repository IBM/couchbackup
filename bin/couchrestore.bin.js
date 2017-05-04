#!/usr/bin/env node
const debug = require('debug')('couchbackup');

// switch on debug messages
process.env.DEBUG = "couchbackup";

var config = require('../includes/config.js'),
  couchbackup = require('../app.js');

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
