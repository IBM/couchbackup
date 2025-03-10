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

const debug = require('debug')('couchbackup:restore');
const { Attachments } = require('./attachmentMappings.js');
const { Liner } = require('./liner.js');
const { Restore } = require('./restoreMappings.js');
const { BatchingStream, MappingStream } = require('./transforms.js');
const { Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

/**
 * Function for performing a restore.
 *
 * @param {object} dbClient - object for connection to source database containing name, service and url
 * @param {object} options - restore configuration
 * @param {Readable} readstream - the backup file content
 * @param {EventEmitter} ee - the user facing EventEmitter
 * @returns a promise that resolves when the restore is complete or rejects if it errors
 */
module.exports = function(dbClient, options, readstream, ee) {
  const restore = new Restore(dbClient, options);
  const start = new Date().getTime(); // restore start time
  let total = 0; // the total restored

  const output = new Writable({
    objectMode: true,
    write: (restoreBatch, encoding, cb) => {
      debug(' restored ', restoreBatch.documents);
      total += restoreBatch.documents;
      const totalRunningTimeSec = (new Date().getTime() - start) / 1000;
      try {
        ee.emit('restored', { ...restoreBatch, total, time: totalRunningTimeSec });
      } finally {
        cb();
      }
    }
  });

  const batchPreparationStreams = [
    readstream, // the backup file
    new Liner(), // line by line
    new MappingStream(restore.backupLineToDocsArray), // convert line to a docs array
    new BatchingStream(options.bufferSize, true), // make new arrays of the correct buffer size
    new MappingStream(restore.docsToRestoreBatch) // make a restore batch
  ];
  const mappingStreams = [];
  const restoreStreams = [
    new MappingStream(restore.pendingToRestored, options.parallelism), // do the restore at the desired level of concurrency
    output // emit restored events
  ];

  if (options.attachments) {
    mappingStreams.push(
      new MappingStream(new Attachments().decode, options.parallelism)
    );
  }

  return pipeline(
    ...batchPreparationStreams,
    ...mappingStreams,
    ...restoreStreams
  ).then(() => {
    return { total };
  });
};
