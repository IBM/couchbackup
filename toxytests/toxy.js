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

/* global after before describe */
'use strict';

// Import the common hooks
require('../test/hooks.js');

const poisons = [
  'normal',
  'bandwidth-limit',
  'latency',
  'slow-read',
  'rate-limit'
];

poisons.forEach(function(poison) {
  describe('unreliable network tests (using poison ' + poison + ')', function() {
    before('start server', function() {

      // **************************
      // Currently these tests do nothing
      // pending resolution of https://github.com/IBM/couchbackup/issues/360
      // to add a new toxic server
      // **************************
    });

    after('stop server', function() {
    });

    delete require.cache[require.resolve('../test/ci_e2e.js')];
    require('../test/ci_e2e.js');
  });
});
