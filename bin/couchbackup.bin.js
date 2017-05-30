#!/usr/bin/env node
// Copyright © 2017 IBM Corp. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
'use strict';

// switch on debug messages
process.env.DEBUG = 'couchbackup';

const config = require('../includes/config.js');
const error = require('../includes/error.js');
const fs = require('fs');
const cliutils = require('../includes/cliutils.js');
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

// copyIfDefined ensures we don't overwrite defaults for
// new methods with `undefined`.
var opts = {};
cliutils.copyIfDefined(config, 'COUCH_BUFFER_SIZE', opts, 'bufferSize');
cliutils.copyIfDefined(config, 'COUCH_PARALLELISM', opts, 'parallelism');
cliutils.copyIfDefined(config, 'COUCH_LOG', opts, 'log');
cliutils.copyIfDefined(config, 'COUCH_RESUME', opts, 'resume');
cliutils.copyIfDefined(config, 'COUCH_MODE', opts, 'mode');

return couchbackup.backup(
  cliutils.databaseUrl(config.COUCH_URL, config.COUCH_DATABASE),
  ws,
  opts,
  error.terminationCallback
);
