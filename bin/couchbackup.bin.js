#!/usr/bin/env node
// Copyright © 2017, 2021 IBM Corp. All rights reserved.
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

const error = require('../includes/error.js');
const fs = require('fs');
const cliutils = require('../includes/cliutils.js');
const couchbackup = require('../app.js');
const parser = require('../includes/parser.js');
const debug = require('debug');
const backupDebug = debug('couchbackup:backup');
const backupBatchDebug = debug('couchbackup:backup:batch');

backupDebug.enabled = true;

const program = parser.parseBackupArgs();

const databaseUrl = cliutils.databaseUrl(program.url, program.db);
const opts = {
  bufferSize: program.bufferSize,
  log: program.log,
  mode: program.mode,
  parallelism: program.parallelism,
  requestTimeout: program.requestTimeout,
  resume: program.resume,
  iamApiKey: program.iamApiKey,
  iamTokenUrl: program.iamTokenUrl
};

// log configuration to console
console.error('='.repeat(80));
console.error('Performing backup on ' + databaseUrl.replace(/\/\/.+@/g, '//****:****@') + ' using configuration:');
console.error(JSON.stringify(opts, null, 2).replace(/"iamApiKey": "[^"]+"/, '"iamApiKey": "****"'));
console.error('='.repeat(80));

backupBatchDebug.enabled = !program.quiet;

let ws = process.stdout;

// open output file
if (program.output) {
  let flags = 'w';
  if (program.log && program.resume) {
    flags = 'a';
  }
  const fd = fs.openSync(program.output, flags);
  ws = fs.createWriteStream(null, { fd: fd });
}

backupDebug('Fetching all database changes...');

return couchbackup.backup(
  databaseUrl,
  ws,
  opts,
  error.terminationCallback
).on('changes', function(batch) {
  backupBatchDebug('Total batches received:', batch + 1);
}).on('written', function(obj) {
  backupBatchDebug('Written batch ID:', obj.batch, 'Total document revisions written:', obj.total, 'Time:', obj.time);
}).on('error', function(e) {
  backupDebug('ERROR', e);
}).on('finished', function(obj) {
  backupDebug('Finished - Total document revisions written:', obj.total);
});
