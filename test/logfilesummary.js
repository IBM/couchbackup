// Copyright © 2017, 2023 IBM Corp. All rights reserved.
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

const assert = require('assert');
const logFileSummary = require('../includes/logfilesummary.js');

describe('#unit Fetching summary from the log file', function() {
  it('should fetch a summary correctly', async function() {
    const summary = await logFileSummary('./test/fixtures/test.log');
    assert.ok(summary);
    assert.strictEqual(summary.changesComplete, true);
    assert.ok(summary.batches instanceof Map);
    assert.strictEqual(summary.batches.size, 2);
    assert.deepStrictEqual(summary.batches.get(1), true);
    assert.deepStrictEqual(summary.batches.get(4), true);
  });
});
