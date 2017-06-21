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
'use strict';

// fatal errors
const codes = {
  'Error': 1,
  'InvalidOption': 2,
  'RestoreDatabaseNotFound': 10,
  'Unauthorized': 11,
  'Forbidden': 12,
  'NoLogFileName': 20,
  'LogDoesNotExist': 21,
  'IncompleteChangesInLogFile': 22,
  'SpoolChangesError': 30,
  'HTTPFatalError': 40,
  'BulkGetError': 50
};

class BackupError extends Error {
  constructor(name, message) {
    super(message);
    this.name = name;
    this.isFatal = codes[name] !== undefined || false;
  }
}

class HTTPError extends BackupError {
  constructor(resp, name) {
    var errMsg = `${resp.statusCode} ${resp.statusMessage || ''}: ${resp.request.method} ${resp.request.uri.href}`;
    if (resp.body && resp.body.error && resp.body.reason) {
      errMsg += ` - Error: ${resp.body.error}, Reason: ${resp.body.reason}`;
    }
    // Special case some names for more useful error messages
    switch (resp.statusCode) {
      case 401:
        name = 'Unauthorized';
        break;
      case 403:
        name = 'Forbidden';
        break;
      default:
        name = name || 'HTTPError';
    }
    super(name, errMsg);
  }
}

class HTTPFatalError extends HTTPError {
  constructor(resp) {
    super(resp, 'HTTPFatalError');
  }
}

module.exports = {
  BackupError: BackupError,
  HTTPError: HTTPError,
  HTTPFatalError: HTTPFatalError,
  terminationCallback: function terminationCallback(err, data) {
    if (err) {
      process.on('uncaughtException', function(err) {
        console.error(err.message);
        process.exitCode = codes[err.name] || 1;
      });
      throw err;
    }
  }
};
