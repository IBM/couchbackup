#!/usr/bin/env node

// switch on debug messages
process.env.DEBUG = 'couchbackup';

var config = require('../includes/config.js'),
  debug = require('debug')('couchbackup'),
  couchbackup = require('../app.js');
  
// backup to stdout
couchbackup.backupStream(process.stdout, config, function() {
  
});


 
