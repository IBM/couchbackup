#!/usr/bin/env node

// switch on debug messages
process.env.DEBUG = "couchbackup";

var config = require('../includes/config.js'),
  couchbackup = require('../app.js');

// restore from stdin
couchbackup.restoreStream(process.stdin, config, function() {
  
});