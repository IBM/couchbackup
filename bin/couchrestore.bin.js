#!/usr/bin/env node

// switch on debug messages
process.env.DEBUG = "couchimport";

var config = require('../includes/config.js'),
  couchbackup = require('../app.js');

// restore from stdin
couchbackup.restoreStream(process.stdin, config, function() {
  
});