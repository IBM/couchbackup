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

const { BackupError } = require('./error.js');
const debug = require('debug');

const mappingDebug = debug('couchbackup:mappings');
const marker = '@cloudant/couchbackup:resume';
const RESUME_COMMENT = `${JSON.stringify({ marker })}`; // Special marker for resumes

class Restore {
  // For compatibility with old versions ignore all broken JSON by default.
  // (Old versions did not have a distinguishable resume marker).
  // If we are restoring a backup file from a newer version we'll read the metadata
  // and change the flag.
  suppressAllBrokenJSONErrors = true;
  backupMode;

  constructor(dbClient) {
    this.dbClient = dbClient;
    this.batchCounter = 0;
  }

  /**
   * Mapper for converting a backup file line to an array of documents pending restoration.
   *
   * @param {object} backupLine object representation of a backup file line {lineNumber: #, line: '...'}
   * @returns {array} array of documents parsed from the line or an empty array for invalid lines
   */
  backupLineToDocsArray = (backupLine) => {
    if (backupLine && backupLine.line !== '' && backupLine.line !== RESUME_COMMENT) {
      // see if it parses as JSON
      let lineAsJson;
      try {
        lineAsJson = JSON.parse(backupLine.line);
      } catch (err) {
        mappingDebug(`Invalid JSON on line ${backupLine.lineNumber} of backup file.`);
        if (this.suppressAllBrokenJSONErrors) {
          // The backup file comes from an older version of couchbackup that predates RESUME_COMMENT.
          // For compatibility ignore the broken JSON line assuming it was part of a resume.
          mappingDebug(`Ignoring invalid JSON on line ${backupLine.lineNumber} of backup file as it was written by couchbackup version < 2.10.0 and could be a valid resume point.`);
          return [];
        } else if (this.backupMode === 'full' && backupLine.line.slice(-RESUME_COMMENT.length) === RESUME_COMMENT) {
          mappingDebug(`Ignoring invalid JSON on line ${backupLine.lineNumber} of full mode backup file as it was resumed.`);
          return [];
        } else {
          // If the backup wasn't resumed and we aren't ignoring errors then it is invalid and we should error
          throw new BackupError('BackupFileJsonError', `Error on line ${backupLine.lineNumber} of backup file - cannot parse as JSON`);
        }
      }
      // if it's an array
      if (lineAsJson && Array.isArray(lineAsJson)) {
        return lineAsJson;
      } else if (backupLine.lineNumber === 1 && lineAsJson.name && lineAsJson.version && lineAsJson.mode) {
        // First line is metadata.
        mappingDebug(`Parsed backup file metadata ${lineAsJson.name} ${lineAsJson.version} ${lineAsJson.mode}.`);
        // This identifies a version of 2.10.0 or newer that wrote the backup file.
        // Set the mode that was used for the backup file.
        this.backupMode = lineAsJson.mode;
        // For newer versions we don't need to ignore all broken JSON, only ones that
        // were associated wiht a resume, so unset the ignore flag.
        this.suppressAllBrokenJSONErrors = false;
        // Later we may add other version/feature specific toggles here.
      } else if (lineAsJson.marker && lineAsJson.marker === marker) {
        mappingDebug(`Resume marker on line  ${backupLine.lineNumber} of backup file.`);
      } else {
        throw new BackupError('BackupFileJsonError', `Error on line ${backupLine.lineNumber} of backup file - not an array or expected metadata`);
      }
    }
    // Return an empty array if there was a blank line (including a line of only the resume marker)
    return [];
  };

  /**
   * Mapper to wrap an array of docs in batch metadata
   * @param {array} docs an array of documents to be restored
   * @returns {object} a pending restore batch {batch: #, docs: [...]}
   */
  docsToRestoreBatch = (docs) => {
    return { batch: this.batchCounter++, docs };
  };

  /**
   * Mapper for converting a pending restore batch to a _bulk_docs request
   * and awaiting the response and finally returing a "restored" object
   * with the batch number and number of restored docs.
   *
   * @param {object} restoreBatch a pending restore batch {batch: #, docs: [{_id: id, ...}, ...]}
   * @returns {object} a restored batch object { batch: #, documents: #}
   */
  pendingToRestored = async(restoreBatch) => {
    // Save the batch number
    const batch = restoreBatch.batch;
    mappingDebug(`Preparing to restore ${batch}`);
    // Remove it from the restoreBatch since we'll use that as our payload
    delete restoreBatch.batch;
    if (!restoreBatch.docs || restoreBatch.docs.length === 0) {
      mappingDebug(`Nothing to restore in batch ${batch}.`);
      return { batch, documents: 0 };
    }
    mappingDebug(`Restoring batch ${batch} with ${restoreBatch.docs.length} docs.`);
    // if we are restoring known revisions, we need to supply new_edits=false
    if (restoreBatch.docs[0] && restoreBatch.docs[0]._rev) {
      restoreBatch.new_edits = false;
      mappingDebug('Using new_edits false mode.');
    }
    try {
      const response = await this.dbClient.service.postBulkDocs({
        db: this.dbClient.dbName,
        bulkDocs: restoreBatch
      });
      if (!response.result || (restoreBatch.new_edits === false && response.result.length > 0)) {
        mappingDebug(`Some errors restoring batch ${batch}.`);
        throw new Error(`Error writing batch ${batch} with new_edits:${restoreBatch.new_edits !== false}` +
          ` and ${response.result ? response.result.length : 'unavailable'} items`);
      }
      mappingDebug(`Successfully restored batch ${batch}.`);
      return { batch, documents: restoreBatch.docs.length };
    } catch (err) {
      mappingDebug(`Error writing docs when restoring batch ${batch}`);
      throw err;
    }
  };
}

module.exports = {
  Restore,
  RESUME_COMMENT
};
