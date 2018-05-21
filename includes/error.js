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
'use strict';

// fatal errors
const codes = {
  'Error': 1,
  'InvalidOption': 2,
  'DatabaseNotFound': 10,
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
  }
}

class HTTPError extends BackupError {
  constructor(responseError, name) {
    var errMsg = `${responseError.statusCode} ${responseError.statusMessage || ''}: ` +
     `${responseError.request.method} ${(typeof responseError.request.uri === 'object') ? responseError.request.uri.href : responseError.request.uri}`;
    if (responseError.error && responseError.reason) {
      errMsg += ` - Error: ${responseError.error}, Reason: ${responseError.reason}`;
    }
    // Special case some names for more useful error messages
    switch (responseError.statusCode) {
      case 401:
        name = 'Unauthorized';
        break;
      case 403:
        name = 'Forbidden';
        break;
      default:
        name = name || 'HTTPFatalError';
    }
    super(name, errMsg);
  }
}

// Default function to return an error for HTTP status codes
// < 400 -> OK
// 4XX (except 429) -> Fatal
// 429 & >=500 -> Transient
function checkResponse(err) {
  if (err) {
    // Construct an HTTPError if there is request information on the error
    // Codes < 400 are considered OK
    if (err.statusCode >= 400) {
      return new HTTPError(err);
    } else {
      // Send it back again if there was no status code, e.g. a cxn error
      return augmentMessage(err);
    }
  }
}

function convertResponseError(responseError, errorFactory) {
  if (!errorFactory) {
    errorFactory = checkResponse;
  }
  return errorFactory(responseError);
}

function augmentMessage(err) {
  // For errors that don't have a status code, we are likely looking at a cxn
  // error.
  // Try to augment the message with more detail
  // TODO add this extra message detail to nano?
  if (err && err.code) {
    err.message = `${err.message} ${err.code}`;
  }
  if (err && err.description) {
    err.message = `${err.message} ${err.description}`;
  }
  return err;
}

module.exports = {
  BackupError: BackupError,
  HTTPError: HTTPError,
  convertResponseError: convertResponseError,
  terminationCallback: function terminationCallback(err, data) {
    if (err) {
      process.on('uncaughtException', function(err) {
        console.error(`ERROR: ${err.message}`);
        process.exitCode = codes[err.name] || 1;
      });
      throw err;
    }
  }
};
