// Copyright © 2023 IBM Corp. All rights reserved.
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

/* global beforeEach describe it */
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const { pipeline } = require('node:stream/promises');
const { Liner } = require('../includes/liner.js');
const { Writable } = require('node:stream');

describe('#unit liner', function() {
  // Use a liner to make the line objects
  let liner;
  let destination;
  let output;

  beforeEach('set up liner and sink', function() {
    liner = new Liner();
    output = [];
    destination = new Writable({
      objectMode: true,
      write: (chunk, encoding, callback) => {
        output.push(chunk);
        callback();
      }
    });
  });

  it('should split to the correct number of lines', async function() {
    await pipeline(fs.createReadStream('./test/fixtures/test.log'), liner, destination);
    assert.strictEqual(output.length, 10);
  });

  it('should count lines correctly', async function() {
    await pipeline(fs.createReadStream('./test/fixtures/test.log'), liner, destination);
    assert.strictEqual(liner.lineNumber, 10);
  });
});
