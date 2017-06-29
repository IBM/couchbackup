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
const rewire = require('rewire');
const app = rewire('../app.js');

const validateArgs = app.__get__('validateArgs');

describe('#unit Validate arguments', function() {
  const goodUrl = 'http://localhost:5984/db';

  it('returns error for invalid URL type', function() {
    validateArgs(true, {}, (err, data) => assert.equal(err.message, 'Invalid URL, must be type string'));
  });
  it('returns no error for valid URL type', function() {
    validateArgs(goodUrl, {}, (err, data) => assert.fail('Unexpected error: ' + err.message));
  });
  it('returns error for invalid buffer size type', function() {
    validateArgs(goodUrl, {bufferSize: '123'}, (err, data) => assert.equal(err.message, 'Invalid buffer size option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]'));
  });
  it('returns error for zero buffer size', function() {
    validateArgs(goodUrl, {bufferSize: 0}, (err, data) => assert.equal(err.message, 'Invalid buffer size option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]'));
  });
  it('returns error for float buffer size', function() {
    validateArgs(goodUrl, {bufferSize: 1.23}, (err, data) => assert.equal(err.message, 'Invalid buffer size option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]'));
  });
  it('returns no error for valid buffer size type', function() {
    validateArgs(goodUrl, {bufferSize: 123}, (err, data) => assert.fail('Unexpected error: ' + err.message));
  });
  it('returns error for invalid log type', function() {
    validateArgs(goodUrl, {log: true}, (err, data) => assert.equal(err.message, 'Invalid log option, must be type string'));
  });
  it('returns no error for valid log type', function() {
    validateArgs(goodUrl, {log: 'log.txt'}, (err, data) => assert.fail('Unexpected error: ' + err.message));
  });
  it('returns error for invalid mode type', function() {
    validateArgs(goodUrl, {mode: true}, (err, data) => assert.equal(err.message, 'Invalid mode option, must be either "full" or "shallow"'));
  });
  it('returns error for invalid mode string', function() {
    validateArgs(goodUrl, {mode: 'foobar'}, (err, data) => assert.equal(err.message, 'Invalid mode option, must be either "full" or "shallow"'));
  });
  it('returns no error for valid mode type', function() {
    validateArgs(goodUrl, {mode: 'full'}, (err, data) => assert.fail('Unexpected error: ' + err.message));
  });
  it('returns error for invalid output type', function() {
    validateArgs(goodUrl, {output: true}, (err, data) => assert.equal(err.message, 'Invalid output option, must be type string'));
  });
  it('returns no error for valid output type', function() {
    validateArgs(goodUrl, {output: 'output.txt'}, (err, data) => assert.fail('Unexpected error: ' + err.message));
  });
  it('returns error for invalid parallelism type', function() {
    validateArgs(goodUrl, {parallelism: '123'}, (err, data) => assert.equal(err.message, 'Invalid parallelism option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]'));
  });
  it('returns error for zero parallelism', function() {
    validateArgs(goodUrl, {parallelism: 0}, (err, data) => assert.equal(err.message, 'Invalid parallelism option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]'));
  });
  it('returns error for float parallelism', function() {
    validateArgs(goodUrl, {parallelism: 1.23}, (err, data) => assert.equal(err.message, 'Invalid parallelism option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]'));
  });
  it('returns no error for valid parallelism type', function() {
    validateArgs(goodUrl, {parallelism: 123}, (err, data) => assert.fail('Unexpected error: ' + err.message));
  });
  it('returns error for invalid resume type', function() {
    validateArgs(goodUrl, {resume: 'true'}, (err, data) => assert.equal(err.message, 'Invalid resume option, must be type boolean'));
  });
  it('returns no error for valid resume type', function() {
    validateArgs(goodUrl, {resume: false}, (err, data) => assert.fail('Unexpected error: ' + err.message));
  });
});
