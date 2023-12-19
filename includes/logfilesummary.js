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

const { createReadStream } = require('node:fs');
const { Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { Liner } = require('./liner.js');
const { LogMapper } = require('./backupMappings.js');
const { MappingStream } = require('./transforms.js');

/**
 * Generate a list of remaining batches from a download file.
 * Creates a summary containing a changesComplete boolean for
 * if the :changes_complete log file entry was found and a map
 * of pending batch numbers that have yet to be backed up
 * (i.e. the difference of :t and :d log file entries).
 *
 * @param {string} log - log file name
 * @returns a log summary object
 */
module.exports = async function(log) {
  const logMapper = new LogMapper();
  const state = { changesComplete: false, batches: new Map() };

  await pipeline(
    createReadStream(log), // read the log file
    new Liner(), // split it into lines
    new MappingStream(logMapper.logLineToMetadata), // parse line to metadata
    new Writable({
      objectMode: true,
      write: (metadata, encoding, callback) => {
        switch (metadata.command) {
          case 't':
            state.batches.set(metadata.batch, true);
            break;
          case 'd':
            state.batches.delete(metadata.batch);
            break;
          case 'changes_complete':
            state.changesComplete = true;
            break;
          default:
            break;
        }
        callback();
      }
    }) // Save the done batch number in an array
  );
  return state;
};
