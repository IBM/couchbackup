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

module.exports = function(db, options, readstream, ee, callback) {
  const liner = require('../includes/liner.js')();
  const writer = require('../includes/writer.js')(db, options.bufferSize, options.parallelism, ee);

  // pipe the input to the output, via transformation functions
  readstream
    .pipe(liner) // transform the input stream into per-line
    .on('error', function(err) {
      // Forward the error to the writer event emitter where we already have
      // listeners on for handling errors
      writer.emit('error', err);
    })
    .pipe(writer); // transform the data

  callback(null, writer);
};
