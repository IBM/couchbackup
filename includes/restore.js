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

const request = require('./request.js');
const error = require('./error.js');

module.exports = function(dbUrl, options, readstream, ee, callback) {
  var db = request.client(dbUrl, options);

  exists(db, function(err) {
    if (err) {
      callback(err);
      return;
    }

    var liner = require('../includes/liner.js')();
    var writer = require('../includes/writer.js')(db, options.bufferSize, options.parallelism, ee);

    // pipe the input to the output, via transformation functions
    readstream
      .pipe(liner) // transform the input stream into per-line
      .on('error', function(err) {
        // Forward the error to the writer event emitter where we already have
        // listeners on for handling errors
        writer.emit('error', err);
      })
      .pipe(writer); // transform the data

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
        // Delegate to the default error factory if it wasn't a 404
        return error.convertResponseError(err);
      }
    });
    // Callback with or without (i.e. undefined) error
    callback(err);
  });
}
