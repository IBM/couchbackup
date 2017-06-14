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

/* global describe it */
'use strict';

var assert = require('assert');
var logfilesummary = require('../includes/logfilesummary.js');

describe('#unit Fetching summary from the log file', function() {
  it('should fetch a summary correctly', function(done) {
    logfilesummary('./test/test.log', function(err, data) {
      assert.equal(data.changesComplete, true);
      assert.equal(typeof data.batches, 'object');
      assert.equal(Object.keys(data.batches).length, 2);
      assert.deepEqual(data.batches['1'], true);
      assert.deepEqual(data.batches['4'], true);
      done();
    });
  });
});
