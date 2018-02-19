#!/usr/bin/env node
// Copyright © 2017, 2018 IBM Corp. All rights reserved.
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
const debug = require('debug')('couchbackup:restore');
debug.enabled = true;

var program = parser.parseRestoreArgs();
var databaseUrl = cliutils.databaseUrl(program.url, program.db);
var opts = {
  bufferSize: program.bufferSize,
  parallelism: program.parallelism,
  iamApiKey: program.iamApiKey
};

// log configuration to console
console.error('='.repeat(80));
console.error('Performing restore on ' + databaseUrl.replace(/\/\/.+@/g, '//****:****@') + ' using configuration:');
console.error(JSON.stringify(opts, null, 2).replace(/"iamApiKey": "[^"]+"/, '"iamApiKey": "****"'));
console.error('='.repeat(80));

return couchbackup.restore(
  process.stdin, // restore from stdin
  databaseUrl,
  opts,
  error.terminationCallback
).on('restored', function(obj) {
  debug('restored', obj.total);
}).on('error', function(e) {
  debug('ERROR', e);
}).on('finished', function(obj) {
  debug('finished', obj);
});
