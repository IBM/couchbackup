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

const { Liner } = require('../includes/liner.js');
const { Restore } = require('../includes/restoreMappings.js');
const { BatchingStream, MappingStream, SplittingStream } = require('./transforms.js');
const { pipeline } = require('node:stream/promises');

module.exports = function(db, options, readstream, outputWritable) {
  const restore = new Restore(db);

  return pipeline(
    readstream, // the backup file
    new Liner(true), // line by line
    new MappingStream(restore.backupLineToDocsArray), // convert line to a docs array
    new SplittingStream(), // break down the arrays to elements
    new BatchingStream(options.bufferSize), // make new arrays of the correct buffer size
    new MappingStream(restore.docsToRestoreBatch), // make a restore batch
    new MappingStream(restore.pendingToRestored, options.parallelism), // do the restore at the desired level of concurrency
    outputWritable // any output
  );
};
