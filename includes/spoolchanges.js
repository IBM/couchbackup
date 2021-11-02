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
const liner = require('./liner.js');
const change = require('./change.js');
const error = require('./error.js');
const debug = require('debug')('couchbackup:spoolchanges');

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
  const buffer = [];
  let batch = 0;
  let lastSeq = null;
  const logStream = fs.createWriteStream(log);
  let pending = 0;
  // The number of changes to fetch per request
  const limit = 100000;

  // send documents ids to the queue in batches of bufferSize + the last batch
  const processBuffer = function(lastOne) {
    if (buffer.length >= bufferSize || (lastOne && buffer.length > 0)) {
      debug('writing', buffer.length, 'changes to the backup file');
      const b = { docs: buffer.splice(0, bufferSize), batch: batch };
      logStream.write(':t batch' + batch + ' ' + JSON.stringify(b.docs) + '\n');
      ee.emit('changes', batch);
      batch++;
    }
  };

  // called once per received change
  const onChange = function(c) {
    if (c) {
      if (c.error) {
        ee.emit('error', new error.BackupError('InvalidChange', `Received invalid change: ${c}`));
      } else if (c.changes) {
        const obj = { id: c.id };
        buffer.push(obj);
        processBuffer(false);
      } else if (c.last_seq) {
        lastSeq = c.last_seq;
        pending = c.pending;
      }
    }
  };

  function getChanges(since = 0) {
    debug('making changes request since ' + since);
    return db.service.postChangesAsStream({ db: db.db, since: since, limit: limit, seq_interval: limit })
      .then(response => {
        response.result.pipe(liner())
          .on('error', function(err) {
            logStream.end();
            callback(err);
          })
          .pipe(change(onChange))
          .on('error', function(err) {
            logStream.end();
            callback(err);
          })
          .on('finish', function() {
            processBuffer(true);
            if (!lastSeq) {
              logStream.end();
              debug('changes request terminated before last_seq was sent');
              callback(new error.BackupError('SpoolChangesError', 'Changes request terminated before last_seq was sent'));
            } else {
              debug(`changes request completed with last_seq: ${lastSeq} and ${pending} changes pending.`);
              if (pending > 0) {
                // Return the next promise
                return getChanges(lastSeq);
              } else {
                debug('finished streaming database changes');
                logStream.end(':changes_complete ' + lastSeq + '\n', 'utf8', callback);
              }
            }
          });
      })
      .catch(err => {
        logStream.end();
        if (err.status && err.status >= 400) {
          callback(error.convertResponseError(err));
        } else if (err.name !== 'SpoolChangesError') {
          callback(new error.BackupError('SpoolChangesError', `Failed changes request - ${err.message}`));
        }
      });
  }

  getChanges();
};
