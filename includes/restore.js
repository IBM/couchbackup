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

module.exports = function(dbUrl, buffersize, parallelism, readstream, callback) {
  exists(dbUrl, function(err, exists) {
    if (err) {
      callback(err, null);
    } else if (!exists) {
      var e = new Error(`Database ${dbUrl} does not exist. ` +
        'Create the target database before restoring.');
      e.name = 'RestoreDatabaseNotFound';
      callback(e, null);
    }

    var liner = require('../includes/liner.js');
    var writer = require('../includes/writer.js')(dbUrl, buffersize, parallelism);

    // pipe the input to the output, via transformation functions
    readstream.pipe(liner())        // transform the input stream into per-line
      .pipe(writer); // transform the data

    callback(null, writer);
  });
};

/*
  Check couchDbUrl is a valid database URL.
  @param {string} couchDbUrl - Database URL
  @param {function(err, exists)} callback - exists is true if database exists
*/
function exists(dbUrl, callback) {
  var r = {
    url: dbUrl,
    method: 'HEAD'
  };
  const client = request.client(dbUrl, 1);
  client(r, function(err, res) {
    if (err) {
      callback(err, false);
      return;
    }
    if (res) {
      if (res.statusCode === 200) {
        callback(null, true);
      } else if (res.statusCode === 404) {
        callback(null, false);
      } else {
        // generic error code (for now, maybe map HTTP status codes to explanations?)
        var e = new Error(`HEAD ${dbUrl} returned error code ${res.statusCode}`);
        callback(e, false);
      }
    }
  });
}
