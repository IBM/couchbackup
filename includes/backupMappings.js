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

const error = require('./error.js');
const debug = require('debug');

const mappingDebug = debug('couchbackup:mappings');

class LogMapper {
  logMetadataRegex = /^(:(?:[td]\s+batch\d+|changes_complete))\s*/;
  logCommandRegex = /^:([td]|changes_complete)/;
  logBatchRegex = /batch(\d+)/;

  /**
   * Function for splitting log file lines into summary and content sections.
   *
   * @param {string} logFileLine
   * @returns {string[]} a max 2 element array, first element metadata, second element content
   */
  splitLogFileLine(logFileLine) {
    if (logFileLine && logFileLine[0] === ':') {
      // Allow up to 3 parts:
      // 1. an empty string from the line start (will be discarded)
      // 2. the capturing group from the split (the command/batch metadata)
      // 3. any remaining content
      const splitLine = logFileLine.split(this.logMetadataRegex, 3);
      // First part of the split is an empty string because we split
      // at the start of the line, so throw that out.
      splitLine.shift();
      return splitLine;
    }
    mappingDebug('Ignoring log file line does not start with :.');
    return [];
  }

  /**
   * Function to extract the command from the start of a log file line.
   *
   * @param {string} logLineMetadata the start of a log file line
   * @returns command or null
   */
  getCommandFromMetadata(logLineMetadata) {
    // extract command type
    const commandMatches = logLineMetadata.match(this.logCommandRegex);
    if (commandMatches) {
      const command = commandMatches[1];
      return command;
    }
    mappingDebug('Log line had no command.');
    return null;
  }

  /**
   * Function to extract the batch number from the start of a log file line.
   *
   * @param {string} logLineMetadata the start of a log file line
   * @returns batch number or null
   */
  getBatchFromMetadata(logLineMetadata) {
    // extract batch number
    const batchMatches = logLineMetadata.match(this.logBatchRegex);
    if (batchMatches) {
      const batch = parseInt(batchMatches[1]);
      return batch;
    }
    mappingDebug('Log line had no batch number.');
    return null;
  }

  /**
   * Function to parse the start of a log file line string into
   * a backup batch object for the command and batch.
   *
   * @param {string} logLineMetadata
   * @returns object with command, command and batch, or null
   */
  parseLogMetadata(logLineMetadata) {
    const metadata = {};
    mappingDebug(`Parsing log metadata ${logLineMetadata}`);
    metadata.command = this.getCommandFromMetadata(logLineMetadata);
    if (metadata.command) {
      switch (metadata.command) {
        case 't':
        case 'd':
          metadata.batch = this.getBatchFromMetadata(logLineMetadata);
          if (metadata.batch === null) {
            // For t and d we should have a batch, if not the line is broken
            // reset the command
            metadata.command = null;
          } else {
            mappingDebug(`Log file line for batch ${metadata.batch} with command ${metadata.command}.`);
          }
          break;
        case 'changes_complete':
          mappingDebug(`Log file line for command ${metadata.command}.`);
          break;
        default:
          mappingDebug(`Unknown command ${metadata.command} in log file`);
          break;
      }
    }
    return metadata;
  }

  handleLogLine(logFileLine, metadataOnly = false) {
    mappingDebug(`Parsing line ${logFileLine}`);
    let metadata = {};
    const backupBatch = { command: null, batch: null, docs: [] };
    // Split the line into command/batch metadata and remaining contents
    const splitLogLine = this.splitLogFileLine(logFileLine);
    if (splitLogLine.length >= 1) {
      metadata = this.parseLogMetadata(splitLogLine[0]);
      // type 't' entries have doc IDs to parse
      if (!metadataOnly && metadata.command === 't' && splitLogLine.length === 2) {
        const logFileContentJson = splitLogLine[1];
        try {
          backupBatch.docs = JSON.parse(logFileContentJson);
          mappingDebug(`Parsed ${backupBatch.docs.length} from log file line for batch ${metadata.batch}.`);
        } catch (err) {
          mappingDebug(`Ignoring parsing error ${err}`);
          // Line is broken, discard metadata
          metadata = {};
        }
      }
    } else {
      mappingDebug('Ignoring empty or unknown line in log file.');
    }
    return { ...backupBatch, ...metadata };
  }

  /**
   *
   * This is used to create a batch completeness log without
   * needing to parse all the document ID information.
   *
   */
  logLineToMetadata = (logFileLine) => {
    return this.handleLogLine(logFileLine, true);
  };

  /**
   * Mapper for converting log file lines to batch objects.
   *
   * @param {string} logFileLine
   * @returns {object} a batch object {command: t|d|changes_complete, batch: #, docs: [{id: id, ...}]}
   */
  logLineToBackupBatch = (logFileLine) => {
    return this.handleLogLine(logFileLine);
  };
}

class Backup {
  constructor(db) {
    this.db = db;
  }

  /**
 * Mapper for converting a backup batch to a backup file line
 *
 * @param {object} backupBatch a backup batch object {command: d, batch: #, docs: [{_id: id, ...}, ...]}
 * @returns {string} JSON string for the backup file
 */
  backupBatchToBackupFileLine = (backupBatch) => {
    mappingDebug(`Stringifying batch ${backupBatch.batch} with ${backupBatch.docs.length} docs.`);
    return JSON.stringify(backupBatch.docs) + '\n';
  };

  /**
 * Mapper for converting a backup batch to a log file line
 *
 * @param {object} backupBatch a backup batch object {command: d, batch: #, docs: [{_id: id, ...}, ...]}
 * @returns {string} log file batch done line
 */
  backupBatchToLogFileLine = (backupBatch) => {
    mappingDebug(`Preparing log batch completion line for batch ${backupBatch.batch}.`);
    return `:d batch${backupBatch.batch}\n`;
  };

  /**
   * Mapper for converting a type t "to do" backup batch object (docs IDs to fetch)
   * to a type d "done" backup batch object with the retrieved docs.
   *
   * @param {object} backupBatch  {command: t, batch: #, docs: [{id: id}, ...]}
   * @returns {object} a backup batch object {command: d, batch: #, docs: [{_id: id, ...}, ...]}
   */
  pendingToFetched = async(backupBatch) => {
    mappingDebug(`Fetching batch ${backupBatch.batch}.`);
    try {
      const response = await this.db.service.postBulkGet({
        db: this.db.db,
        revs: true,
        docs: backupBatch.docs
      });

      mappingDebug(`Good server response for batch ${backupBatch.batch}.`);
      // create an output array with the docs returned
      // Bulk get response "results" array is of objects {id: "id", docs: [...]}
      // Since "docs" is an array too we use a flatMap
      const documentRevisions = response.result.results.flatMap(entry => {
        // for each entry in "results" we map the "docs" array
        if (entry.docs) {
          // Map the "docs" array entries to the document revision inside the "ok" property
          return entry.docs.map((doc) => {
            if (doc.ok) {
              // This is the fetched document revision
              return doc.ok;
            }
            if (doc.error) {
              // This type of error was ignored previously so just debug for now.
              mappingDebug(`Error ${doc.error.error} for ${doc.error.id} in batch ${backupBatch.batch}.`);
            }
            return null;
          }).filter((doc) => {
            // Filter out any entries that didn't have a document revision
            return doc || false;
          });
        }
        // Fallback to an empty array that will add nothing to the fetched docs array
        return [];
      });

      mappingDebug(`Server returned ${documentRevisions.length} document revisions for batch ${backupBatch.batch}.`);

      return {
        command: 'd',
        batch: backupBatch.batch,
        docs: documentRevisions
      };
    } catch (err) {
      mappingDebug(`Error response from server for batch ${backupBatch.batch}.`);
      throw error.convertResponseError(err);
    }
  };
}

module.exports = {
  Backup,
  LogMapper
};
