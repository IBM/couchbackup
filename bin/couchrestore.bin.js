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
const cliutils = require('../includes/cliutils.js');
const couchbackup = require('../app.js');
const parser = require('../includes/parser.js');
const debug = require('debug');
const restoreDebug = debug('couchbackup:restore');
const restoreBatchDebug = debug('couchbackup:restore:batch');

restoreDebug.enabled = true;

const program = parser.parseRestoreArgs();
const databaseUrl = cliutils.databaseUrl(program.url, program.db);
const opts = {
  bufferSize: program.bufferSize,
  parallelism: program.parallelism,
  requestTimeout: program.requestTimeout,
  iamApiKey: program.iamApiKey,
  iamTokenUrl: program.iamTokenUrl
};

// log configuration to console
console.error('='.repeat(80));
console.error('Performing restore on ' + databaseUrl.replace(/\/\/.+@/g, '//****:****@') + ' using configuration:');
console.error(JSON.stringify(opts, null, 2).replace(/"iamApiKey": "[^"]+"/, '"iamApiKey": "****"'));
console.error('='.repeat(80));

restoreBatchDebug.enabled = !program.quiet;

return couchbackup.restore(
  process.stdin, // restore from stdin
  databaseUrl,
  opts,
  error.terminationCallback
).on('restored', function(obj) {
  restoreBatchDebug('restored', obj.total);
}).on('error', function(e) {
  restoreDebug('ERROR', e);
}).on('finished', function(obj) {
  restoreDebug('finished', obj);
});
