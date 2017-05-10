#!/usr/bin/env node
'use strict';

const config = require('../includes/config.js');
const error = require('../includes/error.js');
const couchbackup = require('../app.js');

// restore from stdin
couchbackup.restoreStream(process.stdin, config, error.terminationCallback);
