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
  'InvalidOption': 2,
  'RestoreDatabaseNotFound': 10,
  'Unauthorized': 11,
  'Forbidden': 12,
  'NoLogFileName': 20,
  'LogDoesNotExist': 21,
  'IncompleteChangesInLogFile': 22,
  'SpoolChangesError': 30
};

module.exports = {
  BackupError: class BackupError extends Error {
    constructor(name, message) {
      super(message);
      this.name = name;
    }
  },
  codes: function() { return Object.assign({}, codes); },
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
