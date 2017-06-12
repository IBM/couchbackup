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
const fs = require('fs');
const liner = require('./liner.js');
const change = require('./change.js');
const error = require('./error.js');

/**
 * Write log file for all changes from a database, ready for downloading
 * in batches.
 *
 * @param {string} dbUrl - URL of database
 * @param {string} log - path to log file to use
 * @param {number} bufferSize - the number of changes per batch/log line
 * @param {function(err)} callback - a callback to run on completion
 */
module.exports = function(dbUrl, log, bufferSize, callback) {
  const client = request.client(dbUrl, 1);

  // list of document ids to process
  var buffer = [];
  var batch = 0;
  var lastSeq = null;
  var logStream = fs.createWriteStream(log);

  // send documents ids to the queue in batches of bufferSize + the last batch
  var processBuffer = function(lastOne) {
    if (buffer.length >= bufferSize || (lastOne && buffer.length > 0)) {
      var b = { docs: buffer.splice(0, bufferSize), batch: batch };
      logStream.write(':t batch' + batch + ' ' + JSON.stringify(b.docs) + '\n');
      process.stderr.write('\r batch ' + batch);
      batch++;
    }
  };

  // called once per received change
  var onChange = function(c) {
    if (c) {
      if (c.error) {
        console.error('error', c);
      } else if (c.changes) {
        var obj = {id: c.id};
        buffer.push(obj);
        processBuffer(false);
      } else if (c.last_seq) {
        lastSeq = c.last_seq;
      }
    }
  };

  // stream the changes feed to disk
  var r = {
    url: dbUrl + '/_changes',
    qs: { seq_interval: 10000 }
  };
  var c = client(r);
  c.end();

  c.on('response', function(resp) {
    if (resp.statusCode !== 200) {
      c.abort();
      callback(new error.BackupError('SpoolChangesError', `ERROR: Changes request failed with status code ${resp.statusCode}`));
    } else {
      console.error('Streaming changes to disk:');
    }
  }).pipe(liner())
    .pipe(change(onChange))
    .on('finish', function() {
      processBuffer(true);
      console.error('');
      if (!lastSeq) {
        logStream.end();
        callback(new error.BackupError('SpoolChangesError', `ERROR: Changes request terminated before last_seq was sent`));
      } else {
        logStream.write(':changes_complete ' + lastSeq + '\n');
        logStream.end();
        callback();
      }
    });
};
