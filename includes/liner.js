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

const { once } = require('node:events');
const { createInterface } = require('node:readline');
const { PassThrough, Transform } = require('node:stream');

/**
 * A transform stream that transforms a stream to a stream
 * of line objects using the built-in readLineInterface.
 * The new stream line objects have the form
 * {lineNumber: #, line: content}
 *
 * Note that it uses the `line` event and not `for await...of`
 * for performance reasons. See Node Readline module docs for
 * details.
 */
class Liner extends Transform {
  constructor() {
    super({ objectMode: true });
    this.lineNumber = 0;
    this.inStream = new PassThrough({ objectMode: true });
    this.readlineInterface = createInterface({
      input: this.inStream,
      terminal: false
    }).on('line', (line) => {
      this.lineNumber++;
      this.push(this.wrapLine(line));
    });
    this.readlineInterfaceClosePromise = once(this.readlineInterface, 'close');
  }

  wrapLine(line) {
    return { lineNumber: this.lineNumber, line };
  }

  _transform(chunk, encoding, callback) {
    this.inStream.write(chunk, encoding, callback);
  }

  _flush(callback) {
    this.inStream.end();
    this.readlineInterfaceClosePromise.then(() => { callback(); });
  }
}

module.exports = {
  Liner
};
