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

var tmp = require('tmp');

var get = function() {
  var tmpfile = tmp.fileSync();
  var defaults = {
    parallelism: 5,
    bufferSize: 500,
    log: tmpfile.name,
    resume: false,
    mode: 'full'
  };

  return defaults;
};

var legacyDefaults = function() {
  var defaults = {
    COUCH_URL: 'http://localhost:5984',
    COUCH_DATABASE: 'test'
  };

  return defaults;
};

module.exports = {
  legacyDefaults: legacyDefaults,
  get: get
};
