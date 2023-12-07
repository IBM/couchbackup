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

const { createWriteStream } = require('node:fs');
const { pipeline } = require('node:stream/promises');
const { Backup } = require('./backupMappings.js');
const { BackupError, convertResponseError } = require('./error.js');
const logFileSummary = require('./logfilesummary.js');
const logFileGetBatches = require('./logfilegetbatches.js');
const spoolchanges = require('./spoolchanges.js');
const { MappingStream, WritableWithPassThrough, DelegateWritable } = require('./transforms.js');

/**
 * Validate /_bulk_get support for a specified database.
 *
 * @param {object} db - object for connection to source database containing name, service and url
 */
async function validateBulkGetSupport(db) {
  try {
    await db.service.postBulkGet({ db: db.db, docs: [] });
  } catch (err) {
    // if _bulk_get isn't available throw a special error
    if (err.status === 404) {
      throw new BackupError('BulkGetError', 'Database does not support /_bulk_get endpoint');
    } else {
      throw err;
    }
  }
}

/**
 * Read documents from a database to be backed up.
 *
 * @param {object} db - object for connection to source database containing name, service and url
 * @param {number} options - backup configuration
 * @param {Writable} targetStream - destination for the backup contents
 * @param {EventEmitter} ee - user facing event emitter
 * @returns pipeline promise that resolves for a successful backup or rejects on failure
 */
module.exports = function(db, options, targetStream) {
  // Full backups use _bulk_get, validate it is available
  return validateBulkGetSupport(db)
  // Check if the backup is new or resuming and configure the source
    .then(async() => {
      if (options.resume) {
      // Resuming a backup, get the log file summary
      // (changes complete and remaining batch numbers to backup)
        const summary = await logFileSummary(options.log);
        if (!summary.changesComplete) {
        // We can only resume if changes had finished spooling
          throw new BackupError('IncompleteChangesInLogFile',
            'WARNING: Changes did not finish spooling, a backup can only be resumed if changes finished spooling. Start a new backup.');
        }
        return logFileGetBatches(options.log, summary.batches);
      } else {
      // Not resuming, start from spooling changes
        return spoolchanges(db, options.log, options.bufferSize);
      }
    })
  // Create a pipeline of the source streams and the backup mappings
    .then((srcStreams) => {
      const backup = new Backup(db);
      return pipeline(
        ...srcStreams, // the source streams from the previous block (spool changes or resumed log)
        new MappingStream(backup.pendingToFetched, options.parallelism), // fetch the batches at the configured concurrency
        new WritableWithPassThrough(
          'backup', // name for logging
          targetStream, // backup file
          null, // no need to write a last chunk
          backup.backupBatchToBackupFileLine // map the backup batch to a string for the backup file
        ), // WritableWithPassThrough writes the fetched docs to the backup file and passes on the result metadata
        new DelegateWritable(
          'logFileDoneWriter', // Name for debug
          createWriteStream(options.log, { flags: 'a' }), // log file for appending
          null, // no last chunk to write
          backup.backupBatchToLogFileLine // Map the backed up batch result to a log file "done" line
        ) // DelegateWritable writes the log file done lines
      );
    })
    .catch((e) => { throw convertResponseError(e); });
};
