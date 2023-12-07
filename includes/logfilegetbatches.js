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

const fs = require('node:fs');
const { LogMapper } = require('./backupMappings.js');
const { Liner } = require('./liner.js');
const { FilterStream, MappingStream } = require('./transforms.js');

/**
 * Return an array of streams that when pipelined will produce
 * pending backup batches from a log file.
 *
 * @param {string} log - log file name
 * @param {Map} batches - a log summary batches Map of pending batch numbers
 * @returns a log summary object
 */
module.exports = function(log, batches) {
  const logMapper = new LogMapper();
  return [
    fs.createReadStream(log), // log file
    new Liner(true), // split it into lines
    new MappingStream(logMapper.logLineToBackupBatch), // parse line to a backup batch
    new FilterStream((metadata) => {
      // delete returns true if the key exists, false otherwise
      return batches.delete(metadata.batch);
    }) // filter out already done batches
  ];
};
