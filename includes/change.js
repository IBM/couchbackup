// Copyright © 2017 IBM Corp. All rights reserved.
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

// stolen from http://strongloop.com/strongblog/practical-examples-of-the-new-node-js-streams-api/
const stream = require('stream');

module.exports = function(onChange) {
  const change = new stream.Transform({ objectMode: true });

  change._transform = function(line, encoding, done) {
    let obj = null;

    // one change per line - remove the trailing comma
    line = line.trim().replace(/,$/, '');

    // extract thee last_seq at the end of the changes feed
    if (line.match(/^"last_seq":/)) {
      line = '{' + line;
    }
    try {
      obj = JSON.parse(line);
    } catch (e) {
    }
    onChange(obj);
    done();
  };

  return change;
};
