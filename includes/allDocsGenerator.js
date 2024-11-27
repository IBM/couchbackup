// Copyright © 2023, 2024 IBM Corp. All rights reserved.
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

const debug = require('debug')('couchbackup:alldocsgenerator');
const { BackupError } = require('./error.js');

/**
 * Async generator function for paginating _all_docs for shallow backups.
 *
 * @param {object} dbClient - object for connection to source database containing name, service and url
 * @param {object} options - backup configuration
 * @yields {object} a "done" type backup batch {command: d, batch: #, docs: [{_id: id, ...}, ...]}
 */
module.exports = async function * (dbClient, options = {}) {
  let batch = 0;
  let lastPage = false;
  let startKey = null;
  const opts = { db: dbClient.dbName, limit: options.bufferSize, includeDocs: true };
  if (options.attachments === true) {
    opts.attachments = true;
  }
  do {
    if (startKey) opts.startKey = startKey;
    yield dbClient.service.postAllDocs(opts).then(response => {
      if (!(response.result && response.result.rows)) {
        throw new BackupError('AllDocsError', 'Invalid all docs response');
      }
      debug(`Got page from start key '${startKey}'`);
      const docs = response.result.rows;
      debug(`Received ${docs.length} docs`);
      lastPage = docs.length < opts.limit;
      if (docs.length > 0) {
        const lastKey = docs[docs.length - 1].id;
        debug(`Received up to key ${lastKey}`);
        // To avoid double fetching a document solely for the purposes of getting
        // the next ID to use as a startKey for the next page we instead use the
        // last ID of the current page and append the lowest unicode sort
        // character.
        startKey = `${lastKey}\0`;
      }
      return { command: 'd', batch: batch++, docs: docs.map(doc => { return doc.doc; }) };
    });
  } while (!lastPage);
};
