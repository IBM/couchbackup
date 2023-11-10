// Copyright © 2017, 2023 IBM Corp. All rights reserved.
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
const error = require('./error.js');
const { BatchingStream, MappingStream } = require('./transforms.js');
const debug = require('debug')('couchbackup:spoolchanges');
const { ChangesFollower } = require('@ibm-cloud/cloudant');
const { Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

/**
 * Write log file for all changes from a database, ready for downloading
 * in batches.
 *
 * @param {string} db - object representation of db connection
 * @param {string} log - path to log file to use
 * @param {number} bufferSize - the number of changes per batch/log line
 * @param {number} tolerance - changes follower error tolerance
 */
module.exports = async function(db, log, bufferSize, tolerance = 600000) {
  let lastSeq;
  let batch = 0;
  let totalBuffer = 0;

  class LogWriter extends Writable {
    constructor(log) {
      super({ objectMode: true });
      this.logStream = fs.createWriteStream(log);
    }

    _write(logLine, encoding, callback) {
      this.logStream.write(logLine, encoding, () => {
        debug('completed log line write');
        callback();
      });
    }

    _destroy(err, callback) {
      let finalLine = null;
      if (err) {
        debug('error streaming database changes, closing log file');
      } else {
        debug('finished streaming database changes');
        finalLine = ':changes_complete ' + lastSeq + '\n';
      }
      this.logStream.end(finalLine, 'utf-8', () => {
        debug('closed log file');
        callback();
      });
    }
  }

  // send documents ids to the queue in batches of bufferSize + the last batch
  const mapBatchToLogLine = function(changesBatch) {
    totalBuffer += changesBatch.length;
    debug('writing', changesBatch.length, 'changes to the backup file with total of', totalBuffer);
    const logLine = ':t batch' + batch + ' ' + JSON.stringify(changesBatch) + '\n';
    batch++;
    return logLine;
  };

  // Map a batch of changes to document IDs, checking for errors
  const mapChangesToIds = function(changesBatch) {
    return changesBatch.map((changeResultItem) => {
      if (changeResultItem.changes && changeResultItem.changes.length > 0) {
        if (changeResultItem.seq) {
          lastSeq = changeResultItem.seq;
        }
        // Extract the document ID from the change
        return { id: changeResultItem.id };
      } else {
        throw new error.BackupError('InvalidChange', `Received invalid change: ${changeResultItem}`);
      }
    });
  };

  const changesParams = {
    db: db.db,
    seqInterval: 10000
  };

  const changesFollower = new ChangesFollower(db.service, changesParams, tolerance);
  return pipeline(changesFollower.startOneOff(), // stream of changes from the DB
    new BatchingStream(bufferSize), // group changes into bufferSize batches for mapping
    new MappingStream(mapChangesToIds), // map a batch of ChangesResultItem to doc IDs
    new MappingStream(mapBatchToLogLine), // convert the batch into a string to write to the log file
    new LogWriter(log)) // file writer
    .catch((err) => {
      if (err.status && err.status >= 400) {
        return Promise.reject(error.convertResponseError(err));
      } else if (err.name !== 'SpoolChangesError') {
        return Promise.reject(new error.BackupError('SpoolChangesError', `Failed changes request - ${err.message}`));
      }
    });
};
