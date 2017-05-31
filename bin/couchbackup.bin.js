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

const error = require('../includes/error.js');
const fs = require('fs');
const cliutils = require('../includes/cliutils.js');
const couchbackup = require('../app.js');
const parser = require('../includes/parser.js');

var program = parser.parseBackupArgs();

var databaseUrl = cliutils.databaseUrl(program.url, program.db);
var opts = {
  bufferSize: program.bufferSize,
  log: program.log,
  mode: program.mode,
  parallelism: program.parallelism,
  resume: program.resume
};

// log configuration to console
console.error('='.repeat(80));
console.error('Performing backup on ' + databaseUrl.replace(/\/\/.+@/g, '//****:****@') + ' using configuration:');
console.error(JSON.stringify(opts, null, 2));
console.error('='.repeat(80));

var ws = process.stdout;

// open output file
if (program.output) {
  var flags = 'w';
  if (program.log && program.resume) {
    flags = 'a';
  }
  ws = fs.createWriteStream(program.output, { flags: flags });
}

return couchbackup.backup(
  databaseUrl,
  ws,
  opts,
  error.terminationCallback
);
