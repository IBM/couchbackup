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

class Restore {
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
    if (backupLine && backupLine.line !== '') {
      // see if it parses as JSON
      let arr;
      try {
        arr = JSON.parse(backupLine.line);
      } catch (err) {
        // If the line can't be parsed as JSON it is most likely an incomplete write.
        // If the backup was resumed we can ignore the error because the line will be repeated.
        const parseError = new BackupError('BackupFileJsonError', `Error on line ${backupLine.lineNumber} of backup file - cannot parse as JSON`);
        // If the backup wasn't resumed then it is invalid and we should error, but we have no way to detect this atm.
        mappingDebug(`${parseError}`);
        // Return an empty array if there was an ignorable line
        return [];
      }
      // if it's an array
      if (arr && Array.isArray(arr)) {
        return arr;
      } else {
        throw new BackupError('BackupFileJsonError', `Error on line ${backupLine.lineNumber} of backup file - not an array`);
      }
    }
    // Return an empty array if there was a blank line
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
  Restore
};
