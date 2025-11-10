// Copyright © 2017, 2025 IBM Corp. All rights reserved.
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

const { createInterface } = require('node:readline');
const { Duplex, PassThrough, Transform } = require('node:stream');
const debug = require('debug');

/**
 * A Duplex stream that converts the input stream to a stream
 * of line objects using the built-in readline interface.
 *
 * The new stream line objects have the form
 * {lineNumber: #, line: content}
 *
 * Note that it uses the `line` event and not `for await...of`
 * for performance reasons. See Node Readline module docs for
 * details.
 */
class Liner extends Duplex {
  // Configure logging
  log = debug(('couchbackup:liner'));
  // Flag for whether the readline interface is running
  isRunning = true;
  // Flag for whether the readline interface is closed
  isClosed = false;
  // Line number state
  lineNumber = 0;
  // Buffer of processed lines
  lines = [];

  constructor(sanitize = false) {
    // Configuration of this Duplex:
    // objectMode: false on the writable input (file chunks), true on the readable output (line objects)
    // The readableHighWaterMark controls the number of lines buffered after this implementation calls
    // "push". Backup lines are potentially large (default 500 documents - i.e. potentially MBs). Since
    // there is additional buffering downstream and file processing is faster than the network ops
    // we don't bottleneck here even without a large buffer.
    super({ readableObjectMode: true, readableHighWaterMark: 0, writableObjectMode: false });
    // Set up the stream of bytes that will be processed to lines.
    if (sanitize) {
      // Handle unescaped unicode "newlines" by escaping them before passing to readline
      this.inStream = new Transform({
        objectMode: false,
        transform(chunk, encoding, callback) {
          try {
            this.push(chunk.toString('utf-8').replace(/\u2028/, '\\u2028').replace(/\u2029/, '\\u2029'));
            callback();
          } catch (e) {
            callback(e);
          }
        }
      });
    } else {
      this.inStream = new PassThrough({ objectMode: false });
    }
    // if there is an error destroy this Duplex with it
    this.inStream.on('error', e => this.destroy(e));
    // Built-in readline interface over the inStream
    this.readlineInterface = createInterface({
      input: this.inStream, // the writable side of Liner, passed through
      terminal: false, // expect to read from files
      crlfDelay: Infinity // couchbackup files should only use "/n" EOL, but allow for all "/r/n" to be single EOL
    }).on('line', (line) => {
      // Wrap the line in the object format and store it an array waiting to be pushed
      // when downstream is ready to receive.
      const bufferedLines = this.lines.push(this.wrapLine(line));
      this.log(`Liner processed line ${this.lineNumber}. Buffered lines available: ${bufferedLines}.`);
      this.pushAvailable();
    }).once('close', () => {
      this.isClosed = true;
      this.log('Liner readline interface closed.');
      // Push null onto our lines buffer to signal EOF to downstream consumers.
      this.lines.push(null);
      this.pushAvailable();
    });
  }

  /**
   * Helper function to wrap a line in the object format that Liner
   * pushes to downstream consumers.
   *
   * @param {string} line
   * @returns {object} {"lineNumber: #, line"}
   */
  wrapLine(line) {
    // For each line wrapped, increment the line number
    return { lineNumber: ++this.lineNumber, line };
  }

  /**
   * Function that pushes any available lines downstream.
   */
  pushAvailable() {
    // Check readline is running flag and whether there is content to push.
    while (this.isRunning && this.lines.length > 0) {
      if (!this.push(this.lines.shift())) {
        this.log(`Back-pressure from push. Buffered lines available: ${this.lines.length}.`);
        // Push returned false, this indicates downstream back-pressure.
        // Pause the readline interface to stop pushing more lines downstream.
        // Resumption is triggered by downstream calling _read which happens
        // when it is ready for more data.
        this.isRunning = false;
        if (!this.isClosed) {
          this.log('Liner pausing.');
          this.readlineInterface.pause();
        }
        break;
      } else {
        this.log(`Liner pushed. Buffered lines available: ${this.lines.length}.`);
      }
    }
  }

  /**
   * Implementation of the Readable side of the Duplex.
   *
   *
   * @param {number} size - ignored as the Readable side is objectMode: true
   */
  _read(size) {
    // As per the Readable contract if read has been called it won't be called
    // again until after there has been a call to push.
    // As part of flow control if we are not running we must resume when read
    // is called to ensure that pushes are able to happen (and thereby trigger)
    // subsequent reads.
    if (!this.isRunning) {
      this.isRunning = true;
      if (!this.isClosed) {
        this.log('Liner resuming after read.');
        this.readlineInterface.resume();
      }
    }
    this.pushAvailable();
  }

  /**
   * Implementation for the Writable side of the Duplex.
   * Delegates to the inStream PassThrough.
   *
   * @param {*} chunk
   * @param {string} encoding
   * @param {function} callback
   */
  _write(chunk, encoding, callback) {
    // Note that the passed callback function controls flow from upstream.
    // When the readable side is paused by downstream the inStream buffer
    // will fill and then the callback will be delayed until that buffer
    // is drained by the readline interface starting up again.
    this.inStream.write(chunk, encoding, callback);
  }

  /**
   * Cleanup after the last write to the Duplex.
   *
   * @param {function} callback
   */
  _final(callback) {
    this.log('Finalizing liner.');
    // Nothing more will be written, end our inStream which will
    // cause the readLineInterface to emit 'close' and signal EOF
    // to our readers after the line buffer is emptied.
    this.inStream.end(callback);
  }
}

module.exports = {
  Liner
};
