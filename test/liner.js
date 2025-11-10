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

const assert = require('node:assert');
const fs = require('node:fs');
const { versions } = require('node:process');
const { Readable, Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { Liner } = require('../includes/liner.js');

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

  it('should stream line numbers correctly', async function() {
    const input = Array.from({ length: 10000 }, (_, i) => `A test line with a number ${i}`);
    const inputLines = input.map(e => `${e}\n`);
    const expected = input.map((e, i) => { return { lineNumber: i + 1, line: e }; });
    await pipeline(inputLines, liner, destination);
    assert.deepStrictEqual(output, expected);
  });

  it('should split on unicode separators if not sanitizing', async function() {
    // This test will only split on /u2028 and /u2029 in Node.js >=24
    const nodeMajorVersion = parseInt(versions.node.split('.', 2)[0]);
    const expectedLines = nodeMajorVersion >= 24 ? ['foo', 'bar', 'foo', 'bar', 'foo'] : ['foo', 'bar', 'foo\u2028bar\u2029foo'];
    const input = 'foo\nbar\nfoo\u2028bar\u2029foo';
    const expected = expectedLines.map((e, i) => { return { lineNumber: i + 1, line: e }; });
    await pipeline(Readable.from(input), liner, destination);
    assert.deepStrictEqual(output, expected);
  });

  it('should sanitize unicode separators when enabled', async function() {
    const expected = ['foo', 'bar', 'foo\\u2028bar\\u2029foo'].map((e, i) => { return { lineNumber: i + 1, line: e }; });
    const input = 'foo\nbar\nfoo\u2028bar\u2029foo';
    await pipeline(Readable.from(input), new Liner(true), destination);
    assert.deepStrictEqual(output, expected);
  });
});
