#!/usr/bin/env node
'use strict';

// switch on debug messages
process.env.DEBUG = 'couchbackup';

const config = require('../includes/config.js');
const error = require('../includes/error.js');
const fs = require('fs');
const couchbackup = require('../app.js');
var ws = process.stdout;

if (config.COUCH_RESUME) {
  if (!config.COUCH_LOG) {
    error.terminationCallback(new error.BackupError('NoLogFileName', 'ERROR: You must supply a log file name to resume a backup'));
  }

  if (!fs.existsSync(config.COUCH_LOG)) {
    error.terminationCallback(new error.BackupError('LogDoesNotExist', 'ERROR: To resume a backup, the log file must exist'));
  }
}

// open output file
if (config.COUCH_OUTPUT) {
  var flags = 'w';
  if (config.COUCH_LOG && config.COUCH_RESUME) {
    flags = 'a';
  }
  ws = fs.createWriteStream(config.COUCH_OUTPUT, { flags: flags });
}

// backup to stdout or supplied file
couchbackup.backupStream(ws, config, error.terminationCallback);
