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
'use strict';

const assert = require('assert');
const { Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const logFileGetBatches = require('../includes/logfilegetbatches.js');

describe('#unit Fetching batches from a log file', function() {
  it('should fetch multiple batches correctly', async function() {
    const output = [];
    // Test to get batches 1 and 4
    const summaryBatches = new Map().set(1, true).set(4, true);
    // Make a pipeline from the logFileGetBatches source
    await pipeline(...logFileGetBatches('./test/fixtures/test.log', summaryBatches), new Writable({
      objectMode: true,
      write: (chunk, encoding, callback) => {
        output.push(chunk);
        callback();
      }
    }));

    // Output array should contain 2 backup batch objects
    // one for batch 1 and one for batch 4
    const expected = [
      { command: 't', batch: 1, docs: [{ id: '6' }, { id: '7' }, { id: '8' }, { id: '9' }, { id: '10' }] },
      { command: 't', batch: 4, docs: [{ id: '21' }, { id: '22' }] }
    ];
    assert.deepStrictEqual(output, expected);
  });
});
