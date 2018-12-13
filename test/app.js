// Copyright © 2017, 2018 IBM Corp. All rights reserved.
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

const stderrWriteFun = process.stderr.write;
var capturedStderr;

function captureStderr() {
  process.stderr.write = function(string, encoding, fd) {
    capturedStderr += string;
  };
}

function releaseStderr() {
  process.stderr.write = stderrWriteFun;
  capturedStderr = null;
}

function assertErrorMessage(msg, done) {
  return function(err, data) {
    try {
      assert(err.message, 'There should be an error message');
      assert(err.message.indexOf(msg) >= 0);
      assert(data === null || data === undefined, 'There should only be an error.');
      done();
    } catch (e) {
      done(e);
    }
  };
}

function assertNoError(done) {
  return function(err, data) {
    try {
      assert(err === null, 'There should be no error message.');
      done();
    } catch (e) {
      done(e);
    }
  };
}

describe('#unit Validate arguments', function() {
  const goodUrl = 'http://localhost:5984/db';

  // Note that the validateArgs function returns undefined when it fails and
  // true when it passes. The callback is only called in failure cases because
  // in real usage it is the main callback so calling back when validateArgs
  // completed would terminate the program early. So for testing we assert the
  // callback for error cases and assert no callback and a return of true for
  // success cases.
  it('returns error for invalid URL type', function(done) {
    validateArgs(true, {}, assertErrorMessage('Invalid URL, must be type string', done));
  });
  it('returns no error for valid URL type', function(done) {
    assert(validateArgs(goodUrl, {}, assertNoError(done)), 'validateArgs should return true');
    done();
  });
  it('returns error for invalid (no host) URL', function(done) {
    validateArgs('http://', {}, assertErrorMessage('Invalid URL', done));
  });
  it('returns error for invalid (no protocol) URL', function(done) {
    validateArgs('invalid', {}, assertErrorMessage('Invalid URL', done));
  });
  it('returns error for invalid (wrong protocol) URL', function(done) {
    validateArgs('ftp://invalid.example.com', {}, assertErrorMessage('Invalid URL protocol.', done));
  });
  it('returns error for invalid (no path) URL', function(done) {
    validateArgs('https://invalid.example.com', {}, assertErrorMessage('Invalid URL, missing path element (no database).', done));
  });
  it('returns error for invalid (no protocol, no host) URL', function(done) {
    validateArgs('invalid', {}, assertErrorMessage('Invalid URL', done));
  });
  it('returns error for invalid buffer size type', function(done) {
    validateArgs(goodUrl, { bufferSize: '123' }, assertErrorMessage('Invalid buffer size option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]', done));
  });
  it('returns error for zero buffer size', function(done) {
    validateArgs(goodUrl, { bufferSize: 0 }, assertErrorMessage('Invalid buffer size option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]', done));
  });
  it('returns error for float buffer size', function(done) {
    validateArgs(goodUrl, { bufferSize: 1.23 }, assertErrorMessage('Invalid buffer size option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]', done));
  });
  it('returns no error for valid buffer size type', function(done) {
    assert(validateArgs(goodUrl, { bufferSize: 123 }, assertNoError(done)), 'validateArgs should return true');
    done();
  });
  it('returns error for invalid log type', function(done) {
    validateArgs(goodUrl, { log: true }, assertErrorMessage('Invalid log option, must be type string', done));
  });
  it('returns no error for valid log type', function(done) {
    assert(validateArgs(goodUrl, { log: 'log.txt' }, assertNoError(done)), 'validateArgs should return true');
    done();
  });
  it('returns error for invalid mode type', function(done) {
    validateArgs(goodUrl, { mode: true }, assertErrorMessage('Invalid mode option, must be either "full" or "shallow"', done));
  });
  it('returns error for invalid mode string', function(done) {
    validateArgs(goodUrl, { mode: 'foobar' }, assertErrorMessage('Invalid mode option, must be either "full" or "shallow"', done));
  });
  it('returns no error for valid mode type', function(done) {
    assert(validateArgs(goodUrl, { mode: 'full' }, assertNoError(done)), 'validateArgs should return true');
    done();
  });
  it('returns error for invalid output type', function(done) {
    validateArgs(goodUrl, { output: true }, assertErrorMessage('Invalid output option, must be type string', done));
  });
  it('returns no error for valid output type', function(done) {
    assert(validateArgs(goodUrl, { output: 'output.txt' }, assertNoError(done)), 'validateArgs should return true');
    done();
  });
  it('returns error for invalid parallelism type', function(done) {
    validateArgs(goodUrl, { parallelism: '123' }, assertErrorMessage('Invalid parallelism option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]', done));
  });
  it('returns error for zero parallelism', function(done) {
    validateArgs(goodUrl, { parallelism: 0 }, assertErrorMessage('Invalid parallelism option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]', done));
  });
  it('returns error for float parallelism', function(done) {
    validateArgs(goodUrl, { parallelism: 1.23 }, assertErrorMessage('Invalid parallelism option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]', done));
  });
  it('returns no error for valid parallelism type', function(done) {
    assert(validateArgs(goodUrl, { parallelism: 123 }, assertNoError(done)), 'validateArgs should return true');
    done();
  });
  it('returns error for invalid request timeout type', function(done) {
    validateArgs(goodUrl, { requestTimeout: '123' }, assertErrorMessage('Invalid request timeout option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]', done));
  });
  it('returns error for zero request timeout', function(done) {
    validateArgs(goodUrl, { requestTimeout: 0 }, assertErrorMessage('Invalid request timeout option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]', done));
  });
  it('returns error for float request timout', function(done) {
    validateArgs(goodUrl, { requestTimeout: 1.23 }, assertErrorMessage('Invalid request timeout option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]', done));
  });
  it('returns no error for valid request timeout type', function(done) {
    assert(validateArgs(goodUrl, { requestTimeout: 123 }, assertNoError(done)), 'validateArgs should return true');
    done();
  });
  it('returns error for invalid resume type', function(done) {
    validateArgs(goodUrl, { resume: 'true' }, assertErrorMessage('Invalid resume option, must be type boolean', done));
  });
  it('returns no error for valid resume type', function(done) {
    assert(validateArgs(goodUrl, { resume: false }, assertNoError(done)), 'validateArgs should return true');
    done();
  });
  it('returns error for invalid key type', function(done) {
    validateArgs(goodUrl, { iamApiKey: true }, assertErrorMessage('Invalid iamApiKey option, must be type string', done));
  });
  it('returns error for key and URL credentials supplied', function(done) {
    validateArgs('https://a:b@example.com/db', { iamApiKey: 'abc123' }, assertErrorMessage('URL user information must not be supplied when using IAM API key.', done));
  });
  it('warns for log arg in shallow mode', function(done) {
    captureStderr();
    try {
      assert(validateArgs(goodUrl, { mode: 'shallow', log: 'test' }, function(err, data) {
        assert(capturedStderr.indexOf('The options "log" and "resume" are invalid when using shallow mode.') > -1, 'Log warning message was not present');
      }), 'validateArgs should return true');
      done();
    } catch (e) {
      done(e);
    } finally {
      releaseStderr();
    }
  });
  it('warns for resume arg in shallow mode', function(done) {
    captureStderr();
    try {
      assert(validateArgs(goodUrl, { mode: 'shallow', log: 'test', resume: true }, function(err, data) {
        assert(capturedStderr.indexOf('The options "log" and "resume" are invalid when using shallow mode.') > -1, 'Log warning message was not present');
      }), 'validateArgs should return true');
      done();
    } catch (e) {
      done(e);
    } finally {
      releaseStderr();
    }
  });
  it('warns for parallism arg in shallow mode', function(done) {
    captureStderr();
    try {
      assert(validateArgs(goodUrl, { mode: 'shallow', parallelsim: 10 }, function(err, data) {
        assert(capturedStderr.indexOf('The option "parallelism" has no effect when using shallow mode.') > -1, 'Log warning message was not present');
      }), 'validateArgs should return true');
      done();
    } catch (e) {
      done(e);
    } finally {
      releaseStderr();
    }
  });
});
