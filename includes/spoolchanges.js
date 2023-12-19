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
const { BatchingStream, MappingStream, WritableWithPassThrough } = require('./transforms.js');
const debug = require('debug')('couchbackup:spoolchanges');
const { ChangesFollower } = require('@ibm-cloud/cloudant');

/**
 * Write log file for all changes from a database, ready for downloading
 * in batches.
 *
 * @param {object} dbClient - object for connection to source database containing name, service and url
 * @param {string} log - path to log file to use
 * @param {number} bufferSize - the number of changes per batch/log line
 * @param {number} tolerance - changes follower error tolerance
 */
module.exports = function(dbClient, log, bufferSize = 500, tolerance = 600000) {
  let lastSeq;
  let batch = 0;
  let totalBuffer = 0;

  class LogWriter extends WritableWithPassThrough {
    constructor(log) {
      super('logFileChangesWriter', // name for debug
        fs.createWriteStream(log, { flags: 'a' }), // log file write stream (append mode)
        () => {
          debug('finished streaming database changes');
          return ':changes_complete ' + lastSeq + '\n';
        }, // Function to write complete last chunk
        mapBackupBatchToPendingLogLine // map the changes batch to a log line
      );
    }
  }

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
        throw new error.BackupError('SpoolChangesError', `Received invalid change: ${JSON.stringify(changeResultItem)}`);
      }
    });
  };

  const mapChangesBatchToBackupBatch = function(changesBatch) {
    return { command: 't', batch: batch++, docs: mapChangesToIds(changesBatch) };
  };

  const mapBackupBatchToPendingLogLine = function(backupBatch) {
    totalBuffer += backupBatch.docs.length;
    debug('writing', backupBatch.docs.length, 'changes to the backup log file with total of', totalBuffer);
    return `:t batch${backupBatch.batch} ${JSON.stringify(backupBatch.docs)}\n`;
  };

  const changesParams = {
    db: dbClient.dbName,
    seqInterval: bufferSize
  };

  const changesFollower = new ChangesFollower(dbClient.service, changesParams, tolerance);
  return [
    changesFollower.startOneOff(), // stream of changes from the DB
    new BatchingStream(bufferSize), // group changes into bufferSize batches for mapping
    new MappingStream(mapChangesBatchToBackupBatch), // map a batch of ChangesResultItem to doc IDs
    new LogWriter(log)
  ];
};
