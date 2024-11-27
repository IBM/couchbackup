// Copyright © 2017, 2024 IBM Corp. All rights reserved.
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

const { createWriteStream } = require('node:fs');
const { pipeline } = require('node:stream/promises');
const { Attachments } = require('./attachmentMappings.js');
const { Backup } = require('./backupMappings.js');
const { BackupError } = require('./error.js');
const logFileSummary = require('./logfilesummary.js');
const logFileGetBatches = require('./logfilegetbatches.js');
const spoolchanges = require('./spoolchanges.js');
const { MappingStream, WritableWithPassThrough, DelegateWritable } = require('./transforms.js');
const allDocsGenerator = require('./allDocsGenerator.js');

/**
 * Validate /_bulk_get support for a specified database.
 *
 * @param {object} dbClient - object for connection to source database containing name, service and url
 */
async function validateBulkGetSupport(dbClient) {
  try {
    await dbClient.service.postBulkGet({ db: dbClient.dbName, docs: [] });
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
 * @param {object} dbClient - object for connection to source database containing name, service and url
 * @param {number} options - backup configuration
 * @param {Writable} targetStream - destination for the backup contents
 * @param {EventEmitter} ee - user facing event emitter
 * @returns pipeline promise that resolves for a successful backup or rejects on failure
 */
module.exports = function(dbClient, options, targetStream, ee) {
  const start = new Date().getTime(); // backup start time
  let total = 0; // total documents backed up

  // Full backups use _bulk_get, validate it is available, shallow skips that check
  return (options.mode === 'full' ? validateBulkGetSupport(dbClient) : Promise.resolve())
  // Check if the backup is new or resuming and configure the source
    .then(async () => {
      if (options.mode === 'shallow') {
        // shallow backup, start from async _all_docs generator
        return [
          allDocsGenerator(dbClient, options)
        ];
      } else {
        // Full backup, we'll return a stream over a completed changes log file
        if (!options.resume) {
          // Not resuming, start spooling changes to create a log file
          await spoolchanges(dbClient, options.log, (backupBatch) => {
            ee.emit('changes', backupBatch.batch);
          }, options.bufferSize);
        }
        // At this point we should be changes complete because spooling has finished
        // or because we resumed a backup that had already completed spooling (and
        // potentially already downloaded some batches)
        // Get the log file summary to validate changes complete and obtain the
        // [remaining] batch numbers to backup
        const summary = await logFileSummary(options.log);
        if (!summary.changesComplete) {
          // We must only backup if changes finished spooling
          throw new BackupError('IncompleteChangesInLogFile',
            'WARNING: Changes did not finish spooling, a backup can only be resumed if changes finished spooling. Start a new backup.');
        }
        return logFileGetBatches(options.log, summary.batches);
      }
    })
    // Create a pipeline of the source streams and the backup mappings
    .then((srcStreams) => {
      const backup = new Backup(dbClient, options);
      const postWrite = (backupBatch) => {
        total += backupBatch.docs.length;
        const totalRunningTimeSec = (new Date().getTime() - start) / 1000;
        ee.emit('written', { total, time: totalRunningTimeSec, batch: backupBatch.batch });
      };

      const mappingStreams = [];
      const destinationStreams = [];
      if (options.mode === 'shallow') {
        // shallow mode writes only to backup file
        destinationStreams.push(
          new DelegateWritable(
            'backup', // Name for debug
            targetStream, // backup file
            null, // no last chunk to write
            backup.backupBatchToBackupFileLine, // map the backup batch to a string for the backup file
            postWrite // post write function emits the written event
          ) // DelegateWritable writes the log file done lines
        );
      } else {
        // full mode needs to fetch spooled changes and writes a backup file then finally a log file
        mappingStreams.push(...[
          new MappingStream(backup.pendingToFetched, options.parallelism) // fetch the batches at the configured concurrency
        ]);
        destinationStreams.push(...[
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
            backup.backupBatchToLogFileLine, // Map the backed up batch result to a log file "done" line
            postWrite // post write function emits the written event
          ) // DelegateWritable writes the log file done lines
        ]);
      }

      if (options.attachments) {
        mappingStreams.push(
          new MappingStream(new Attachments().encode, options.parallelism)
        );
      }

      return pipeline(
        ...srcStreams, // the source streams from the previous block (all docs async generator for shallow or for full either spool changes or resumed log)
        ...mappingStreams, // map from source to destination content
        ...destinationStreams // the appropriate destination streams for the mode
      );
    })
    .then(() => {
      return { total };
    });
};
