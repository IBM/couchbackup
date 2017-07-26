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

const request = require('./request.js');
const error = require('./error.js');

module.exports = function(dbUrl, buffersize, parallelism, readstream, ee, callback) {
  var db = request.client(dbUrl, parallelism);

  exists(db, function(err) {
    if (err) {
      callback(err);
      return;
    }

    var liner = require('../includes/liner.js')();
    var writer = require('../includes/writer.js')(db, buffersize, parallelism, ee);

    var errHandler = function(err) {
      if (!err.isTransient) {
        readstream.destroy();
      }
    };

    // pipe the input to the output, via transformation functions
    readstream
      .pipe(liner) // transform the input stream into per-line
      .on('error', errHandler)
      .pipe(writer) // transform the data
      .on('error', errHandler);

    callback(null, writer);
  });
};

/*
  Check couchDbUrl is a valid database URL.
  @param {string} couchDbUrl - Database URL
  @param {function(err, exists)} callback - exists is true if database exists
*/
function exists(db, callback) {
  db.head('', function(err) {
    err = error.convertResponseError(err, function(err) {
      if (err && err.statusCode === 404) {
        // Override the error type and mesasge for the DB not found case
        var noDBErr = new Error(`Database ${db.config.url}/${db.config.db} does not exist. ` +
          'Create the target database before restoring.');
        noDBErr.name = 'RestoreDatabaseNotFound';
        return noDBErr;
      } else {
        // Delegate to the fatal error factory if it wasn't a 404
        return error.convertResponseErrorToFatal(err);
      }
    });
    // Callback with or without (i.e. undefined) error
    callback(err);
  });
}
