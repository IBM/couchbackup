// Copyright © 2017, 2021 IBM Corp. All rights reserved.
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

const fs = require('fs');
const stream = require('stream');
const liner = require('./liner.js');
const change = require('./change.js');
const error = require('./error.js');
const debug = require('debug')('couchbackup:spoolchanges');

// Class for streaming _changes error responses into
// In general the response is a small error/reason JSON object
// so it is OK to have this in memory.
class ResponseWriteable extends stream.Writable {
  constructor(options) {
    super(options);
    this.data = [];
  }

  _write(chunk, encoding, callback) {
    this.data.push(chunk);
    callback();
  }

  stringBody() {
    return Buffer.concat(this.data).toString();
  }
}

/**
 * Write log file for all changes from a database, ready for downloading
 * in batches.
 *
 * @param {string} dbUrl - URL of database
 * @param {string} log - path to log file to use
 * @param {number} bufferSize - the number of changes per batch/log line
 * @param {function(err)} callback - a callback to run on completion
 */
module.exports = function(db, log, bufferSize, ee, callback) {
  // list of document ids to process
  var buffer = [];
  var batch = 0;
  var lastSeq = null;
  var logStream = fs.createWriteStream(log);

  // send documents ids to the queue in batches of bufferSize + the last batch
  var processBuffer = function(lastOne) {
    if (buffer.length >= bufferSize || (lastOne && buffer.length > 0)) {
      debug('writing', buffer.length, 'changes to the backup file');
      var b = { docs: buffer.splice(0, bufferSize), batch: batch };
      logStream.write(':t batch' + batch + ' ' + JSON.stringify(b.docs) + '\n');
      ee.emit('changes', batch);
      batch++;
    }
  };

  // called once per received change
  var onChange = function(c) {
    if (c) {
      if (c.error) {
        ee.emit('error', new error.BackupError('InvalidChange', `Received invalid change: ${c}`));
      } else if (c.changes) {
        var obj = { id: c.id };
        buffer.push(obj);
        processBuffer(false);
      } else if (c.last_seq) {
        lastSeq = c.last_seq;
      }
    }
  };

  // stream the changes feed to disk
  db.service.postChangesAsStream({ db: db.db, seq_interval: 10000 }).then(response => {
    response.result.pipe(liner())
      .on('error', function(err) {
        callback(err);
      })
      .pipe(change(onChange))
      .on('error', function(err) {
        callback(err);
      })
      .on('finish', function() {
        processBuffer(true);
        if (!lastSeq) {
          logStream.end();
          debug('changes request terminated before last_seq was sent');
          callback(new error.BackupError('SpoolChangesError', 'Changes request terminated before last_seq was sent'));
        } else {
          debug('finished streaming database changes');
          logStream.end(':changes_complete ' + lastSeq + '\n', 'utf8', callback);
        }
      });
  }).catch(err => {
    if (err.status && err.status >= 400) {
      if (err.body) {
        const errorBody = new ResponseWriteable();
        err.body.pipe(errorBody).on('finish', () => {
          const changesResponseError = Object.assign({}, err);
          changesResponseError.body = errorBody.stringBody();
          callback(error.convertResponseError(changesResponseError));
        });
      } else {
        callback(error.convertResponseError(err));
      }
    } else {
      callback(new error.BackupError('SpoolChangesError', `Failed changes request - ${err.message}`));
    }
  });
};
