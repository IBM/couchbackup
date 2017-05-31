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

/**
 * Write log file for all changes from a database, ready for downloading
 * in batches.
 *
 * @param {string} dbUrl - URL of database
 * @param {string} log - path to log file to use
 * @param {number} blocksize - the number of changes per batch/log line
 * @param {function} callback - called when log is completed. Signature is
 *  (err, {batches: batch, docs: doccount}), where batches is the total number
 *  of batches and doccount is total number of changes found.
 */
module.exports = function(dbUrl, log, blocksize, callback) {
  const client = request.client(dbUrl, 1);

  // list of document ids to process
  var buffer = [];
  var batch = 0;
  var doccount = 0;
  var lastSeq = null;
  var logStream = fs.createWriteStream(log);
  console.error('Streaming changes to disk:');

  // send documents ids to the queue in batches of 500 + the last batch
  var processBuffer = function(lastOne) {
    if (buffer.length >= blocksize || lastOne) {
      var b = { docs: buffer.splice(0, blocksize), batch: batch };
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
        doccount++;
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
  client(r)
    .pipe(liner())
    .pipe(change(onChange))
    .on('finish', function() {
      processBuffer(true);
      logStream.write(':changes_complete ' + lastSeq + '\n');
      logStream.end();
      console.error('');
      if (doccount === 0) {
        callback(new Error('zero documents found - nothing to do'), null);
      } else {
        callback(null, {batches: batch, docs: doccount});
      }
    });
};
