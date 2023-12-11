// Copyright © 2017, 2018 IBM Corp. All rights reserved.
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

const debug = require('debug')('couchbackup:restore');
const { Liner } = require('../includes/liner.js');
const { Restore } = require('../includes/restoreMappings.js');
const { BatchingStream, MappingStream, SplittingStream } = require('./transforms.js');
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
  const restore = new Restore(dbClient);
  let total = 0; // the total restored

  const output = new Writable({
    objectMode: true,
    write: (restoreBatch, encoding, cb) => {
      debug(' restored ', restoreBatch.documents);
      total += restoreBatch.documents;
      try {
        ee.emit('restored', { ...restoreBatch, total });
      } finally {
        cb();
      }
    }
  });

  return pipeline(
    readstream, // the backup file
    new Liner(true), // line by line
    new MappingStream(restore.backupLineToDocsArray), // convert line to a docs array
    new SplittingStream(), // break down the arrays to elements
    new BatchingStream(options.bufferSize), // make new arrays of the correct buffer size
    new MappingStream(restore.docsToRestoreBatch), // make a restore batch
    new MappingStream(restore.pendingToRestored, options.parallelism), // do the restore at the desired level of concurrency
    output // emit restored events
  ).then(() => {
    return { total };
  });
};
