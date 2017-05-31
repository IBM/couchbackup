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

const config = require('../includes/config.js');
const error = require('../includes/error.js');
const cliutils = require('../includes/cliutils.js');
const couchbackup = require('../app.js');

// copyIfDefined ensures we don't overwrite defaults for
// new methods with `undefined`.
var opts = {};
cliutils.copyIfDefined(config, 'COUCH_BUFFER_SIZE', opts, 'bufferSize');
cliutils.copyIfDefined(config, 'COUCH_PARALLELISM', opts, 'parallelism');

// Restore from stdin
return couchbackup.restore(
  process.stdin,
  cliutils.databaseUrl(config.COUCH_URL, config.COUCH_DATABASE),
  opts,
  error.terminationCallback
);
