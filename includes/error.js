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
'use strict';

// fatal errors
const codes = {
  Error: 1,
  InvalidOption: 2,
  DatabaseNotFound: 10,
  Unauthorized: 11,
  Forbidden: 12,
  DatabaseNotEmpty: 13,
  NoLogFileName: 20,
  LogDoesNotExist: 21,
  IncompleteChangesInLogFile: 22,
  LogFileExists: 23,
  SpoolChangesError: 30,
  HTTPFatalError: 40,
  BulkGetError: 50,
  AttachmentsNotEnabledError: 60,
  AttachmentsMetadataAbsent: 61
};

class BackupError extends Error {
  constructor(name, message) {
    super(message);
    this.name = name;
  }
}

class OptionError extends BackupError {
  constructor(message) {
    super('InvalidOption', message);
  }
}

class HTTPError extends BackupError {
  constructor(responseError, name) {
    // Special case some names for more useful error messages
    switch (responseError.status) {
      case 401:
        name = 'Unauthorized';
        break;
      case 403:
        name = 'Forbidden';
        break;
      default:
        name = name || 'HTTPFatalError';
    }
    super(name, responseError.message);
  }
}

/**
 * A function for converting between error types and improving error messages.
 *
 * Cases:
 * - BackupError - return as is.
 * - response "like" errors - convert to HTTPError.
 * - ERR_INVALID_URL - convert to OptionError.
 * - Error (general case) - augment with additional statusText
 *   or description if available.
 *
 * @param {Error} e
 * @returns {Error} the modified error
 */
function convertError(e) {
  if (e instanceof BackupError) {
    // If it's already a BackupError just pass it on
    return e;
  } else if (e && e.status && e.status >= 400) {
    return new HTTPError(e);
  } else if (e.code === 'ERR_INVALID_URL') {
    // Wrap ERR_INVALID_URL in our own InvalidOption
    return new OptionError(e.message);
  } else {
    // For errors that don't have a status code, we are likely looking at a cxn
    // error.
    // Try to augment the message with more detail (core puts the code in statusText)
    if (e && e.statusText) {
      e.message = `${e.message} ${e.statusText}`;
    }
    if (e && e.description) {
      e.message = `${e.message} ${e.description}`;
    }
    return e;
  }
}

module.exports = {
  BackupError,
  OptionError,
  HTTPError,
  convertError,
  terminationCallback: function terminationCallback(err, data) {
    if (err) {
      console.error(`ERROR: ${err.message}`);
      process.exitCode = codes[err.name] || 1;
      process.exit();
    }
  }
};
