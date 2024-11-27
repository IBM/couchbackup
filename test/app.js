// Copyright © 2017, 2024 IBM Corp. All rights reserved.
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
const backup = require('../app.js').backup;
const fs = require('fs');
const nock = require('nock');
const util = require('util');
const backupPromise = util.promisify(backup);

const goodUrl = 'http://localhost:5984/db';
// The real validateArgs function of app.js isn't
// exported - so we call the exported backup method
// instead. We don't get as far as a real backup when
// testing error cases. For success cases we nock the
// goodUrl and
const validateArgs = async function(url, opts, errorValidationForAssertRejects) {
  const nullStream = fs.createWriteStream('/dev/null');
  if (url === goodUrl) {
    // Nock the goodUrl
    nock(goodUrl).head('').reply(404, { error: 'not_found', reason: 'missing' });
  }
  return assert.rejects(backupPromise(url, nullStream, opts), errorValidationForAssertRejects);
};

const validateStdErrWarning = async function(url, opts, msg) {
  captureStderr();
  // We pass assertNoValidationError because for these opts
  // we are expecting only a stderr warning
  return validateArgs(url, opts, assertNoValidationError()).then(() => {
    // Assert the warning message was in stderr
    assert.ok(capturedStderr, 'There should be captured stderr');
    assert.ok(capturedStderr.indexOf(msg) > -1, 'Log warning message was not present');
  }).finally(() => {
    releaseStderr();
  });
};

const stderrWriteFun = process.stderr.write;
let capturedStderr = '';

function captureStderr() {
  // Redefine the stderr write to capture
  process.stderr.write = function(string, encoding, fd) {
    capturedStderr += string;
  };
}

function releaseStderr() {
  process.stderr.write = stderrWriteFun;
  capturedStderr = null;
}

// Return a validation object for use with assert.rejects
function assertErrorMessage(msg) {
  return { name: 'InvalidOption', message: msg };
}

// For cases where validation should pass we reach a real backup that hits a 404
// mock for a DatabaseNotFound, so that it is the expected in the case assertNoValidationError
function assertNoValidationError() { return { name: 'DatabaseNotFound' }; }

describe('#unit Validate arguments', function() {
  it('returns error for invalid URL type', async function() {
    return validateArgs(true, {}, assertErrorMessage('Invalid URL, must be type string'));
  });
  it('returns no error for valid URL type', async function() {
    return validateArgs(goodUrl, {}, assertNoValidationError());
  });
  it('returns error for invalid (no host) URL', async function() {
    return validateArgs('http://', {}, assertErrorMessage('Invalid URL'));
  });
  it('returns error for invalid (no protocol) URL', async function() {
    return validateArgs('invalid', {}, assertErrorMessage('Invalid URL'));
  });
  it('returns error for invalid (wrong protocol) URL', async function() {
    return validateArgs('ftp://invalid.example.com', {}, assertErrorMessage('Invalid URL protocol.'));
  });
  it('returns error for invalid (no path) URL', async function() {
    return validateArgs('https://invalid.example.com', {}, assertErrorMessage('Invalid URL, missing path element (no database).'));
  });
  it('returns error for invalid (no protocol, no host) URL', async function() {
    return validateArgs('invalid', {}, assertErrorMessage('Invalid URL'));
  });
  it('returns error for invalid buffer size type', async function() {
    return validateArgs(goodUrl, { bufferSize: '123' }, assertErrorMessage('Invalid buffer size option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]'));
  });
  it('returns error for zero buffer size', async function() {
    return validateArgs(goodUrl, { bufferSize: 0 }, assertErrorMessage('Invalid buffer size option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]'));
  });
  it('returns error for float buffer size', async function() {
    return validateArgs(goodUrl, { bufferSize: 1.23 }, assertErrorMessage('Invalid buffer size option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]'));
  });
  it('returns no error for valid buffer size type', async function() {
    return validateArgs(goodUrl, { bufferSize: 123 }, assertNoValidationError());
  });
  it('returns error for invalid log type', async function() {
    return validateArgs(goodUrl, { log: true }, assertErrorMessage('Invalid log option, must be type string'));
  });
  it('returns no error for valid log type', async function() {
    return validateArgs(goodUrl, { log: './test/fixtures/test.log', resume: true }, assertNoValidationError());
  });
  it('returns error for invalid mode type', async function() {
    return validateArgs(goodUrl, { mode: true }, assertErrorMessage('Invalid mode option, must be either "full" or "shallow"'));
  });
  it('returns error for invalid mode string', async function() {
    return validateArgs(goodUrl, { mode: 'foobar' }, assertErrorMessage('Invalid mode option, must be either "full" or "shallow"'));
  });
  it('returns no error for valid mode type', async function() {
    return validateArgs(goodUrl, { mode: 'full' }, assertNoValidationError());
  });
  it('returns error for invalid output type', async function() {
    return validateArgs(goodUrl, { output: true }, assertErrorMessage('Invalid output option, must be type string'));
  });
  it('returns no error for valid output type', async function() {
    return validateArgs(goodUrl, { output: 'output.txt' }, assertNoValidationError());
  });
  it('returns error for invalid parallelism type', async function() {
    return validateArgs(goodUrl, { parallelism: '123' }, assertErrorMessage('Invalid parallelism option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]'));
  });
  it('returns error for zero parallelism', async function() {
    return validateArgs(goodUrl, { parallelism: 0 }, assertErrorMessage('Invalid parallelism option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]'));
  });
  it('returns error for float parallelism', async function() {
    return validateArgs(goodUrl, { parallelism: 1.23 }, assertErrorMessage('Invalid parallelism option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]'));
  });
  it('returns no error for valid parallelism type', async function() {
    return validateArgs(goodUrl, { parallelism: 123 }, assertNoValidationError());
  });
  it('returns error for invalid request timeout type', async function() {
    return validateArgs(goodUrl, { requestTimeout: '123' }, assertErrorMessage('Invalid request timeout option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]'));
  });
  it('returns error for zero request timeout', async function() {
    return validateArgs(goodUrl, { requestTimeout: 0 }, assertErrorMessage('Invalid request timeout option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]'));
  });
  it('returns error for float request timout', async function() {
    return validateArgs(goodUrl, { requestTimeout: 1.23 }, assertErrorMessage('Invalid request timeout option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]'));
  });
  it('returns no error for valid request timeout type', async function() {
    return validateArgs(goodUrl, { requestTimeout: 123 }, assertNoValidationError());
  });
  it('returns error for invalid resume type', async function() {
    return validateArgs(goodUrl, { resume: 'true' }, assertErrorMessage('Invalid resume option, must be type boolean'));
  });
  it('returns no error for valid resume type', async function() {
    return validateArgs(goodUrl, { resume: false }, assertNoValidationError());
  });
  it('returns error for invalid key type', async function() {
    return validateArgs(goodUrl, { iamApiKey: true }, assertErrorMessage('Invalid iamApiKey option, must be type string'));
  });
  it('returns error for key and URL credentials supplied', async function() {
    return validateArgs('https://a:b@example.com/db', { iamApiKey: 'abc123' }, assertErrorMessage('URL user information must not be supplied when using IAM API key.'));
  });
  it('returns error for existing log file without resume', async function() {
    return validateArgs(goodUrl, { log: './test/fixtures/test.log' }, {
      name: 'LogFileExists',
      message: 'The log file ./test/fixtures/test.log exists. Use the resume option if you want to resume a backup from an existing log file.'
    });
  });
  it('returns error for invalid quiet type', async function() {
    return validateArgs(goodUrl, { quiet: 'true' }, assertErrorMessage('Invalid quiet option, must be type boolean'));
  });
  it('returns no error for valid quiet type', async function() {
    return validateArgs(goodUrl, { quiet: true }, assertNoValidationError());
  });
  it('returns error for invalid attachments type', async function() {
    return validateArgs(goodUrl, { attachments: 'true' }, assertErrorMessage('Invalid attachments option, must be type boolean'));
  });
  it('returns no error for valid attachments type', async function() {
    return validateArgs(goodUrl, { attachments: true }, assertNoValidationError());
  });
  it('warns for log arg in shallow mode', async function() {
    return validateStdErrWarning(goodUrl, { mode: 'shallow', log: 'test' },
      'the options "log" and "resume" are invalid when using shallow mode.');
  });
  it('warns for resume arg in shallow mode', async function() {
    return validateStdErrWarning(goodUrl, { mode: 'shallow', log: 'test', resume: true },
      'the options "log" and "resume" are invalid when using shallow mode.');
  });
  it('warns for parallelism arg in shallow mode', async function() {
    return validateStdErrWarning(goodUrl, { mode: 'shallow', parallelism: 10 },
      'the option "parallelism" has no effect when using shallow mode.');
  });
  it('warns for buffer size arg when resuming', async function() {
    return validateStdErrWarning(goodUrl, { log: './test/fixtures/test.log', resume: true, bufferSize: 100 },
      'the original backup "bufferSize" applies when resuming a backup.');
  });
  it('warns for experimental attachments arg', async function() {
    return validateStdErrWarning(goodUrl, { attachments: true },
      'WARNING: The "attachments" option is provided as-is and is not supported. ' +
      'This option is for Apache CouchDB only and is experimental. ' +
      'Do not use this option with IBM Cloudant.');
  });
});
