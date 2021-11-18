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

const assert = require('assert');
const logfilegetbatches = require('../includes/logfilegetbatches.js');

describe('#unit Fetching batches from a log file', function() {
  it('should fetch multiple batches correctly', function(done) {
    logfilegetbatches('./test/fixtures/test.log', [1, 4], function(err, data) {
      assert.ok(!err);
      assert.ok(data);
      assert.strictEqual(typeof data, 'object');
      assert.strictEqual(Object.keys(data).length, 2);
      assert.deepStrictEqual(data['1'].docs, [{ id: '6' }, { id: '7' }, { id: '8' }, { id: '9' }, { id: '10' }]);
      assert.strictEqual(data['1'].batch, 1);
      assert.deepStrictEqual(data['4'].docs, [{ id: '21' }, { id: '22' }]);
      assert.strictEqual(data['4'].batch, 4);
      done();
    });
  });
});
