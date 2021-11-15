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

module.exports = function() {
  const liner = new stream.Transform({ objectMode: true });

  liner._transform = function(chunk, encoding, done) {
    let data = chunk.toString();
    if (this._lastLineData) {
      data = this._lastLineData + data;
    }

    const lines = data.split('\n');
    this._lastLineData = lines.splice(lines.length - 1, 1)[0];

    for (const i in lines) {
      this.push(lines[i]);
    }
    done();
  };

  liner._flush = function(done) {
    if (this._lastLineData) {
      this.push(this._lastLineData);
    }
    this._lastLineData = null;
    done();
  };

  return liner;
};
