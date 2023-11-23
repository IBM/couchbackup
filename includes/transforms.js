// Copyright © 2023 IBM Corp. All rights reserved.
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

const { Duplex, PassThrough, Transform } = require('node:stream');
const debug = require('debug');

/**
 * Input: stream of elements
 * Output: stream of arrays of batchSize elements each
 */
class BatchingStream extends Transform {
  constructor(batchSize, highWaterMarkScale = 1) {
    super({ objectMode: true, readableHighWaterMark: highWaterMarkScale, writableHighWaterMark: highWaterMarkScale * batchSize });
    this.log = debug(('couchbackup:transform:batch'));
    this.log(`Batching to size ${batchSize} with scale ${highWaterMarkScale}`);
    this.batchSize = batchSize;
    this.batch = [];
    this.batchId = 0;
  }

  writeBatch(callback) {
    if (this.batch.length > 0) {
      this.log(`Writing batch ${this.batchId} with ${this.batch.length} elements.`);
      this.push(this.batch);
      this.batch = [];
      this.batchId++;
    }
    callback();
  }

  _transform(element, encoding, callback) {
    if (this.batch.push(element) === this.batchSize) {
      this.writeBatch(callback);
    } else {
      callback();
    }
  }

  _flush(callback) {
    this.log('Flushing batch transform.');
    // When flushing we always call to write a batch
    // to ensure any remaining elements that hadn't reached batchSize
    // are written out.
    this.writeBatch(callback);
  }
}

/**
 * Input: stream of x
 * Output: stream of mappingFunction(x)
 */
class FilterStream extends Duplex {
  constructor(filterFunction) {
    const inputStream = new PassThrough({ objectMode: true });
    return Duplex.from({ readable: inputStream.filter(filterFunction), writable: inputStream });
  }
}

/**
 * Input: stream of x
 * Output: stream of mappingFunction(x)
 */
class MappingStream extends Duplex {
  constructor(mappingFunction, concurrency = 1) {
    const inputStream = new PassThrough({ objectMode: true, highWaterMark: concurrency * 2 });
    return Duplex.from({ readable: inputStream.map(mappingFunction, { concurrency }), writable: inputStream });
  }
}

/**
 * PassThrough stream that calls another function
 * to perform a side effect.
 */
class SideEffect extends PassThrough {
  constructor(fn, options) {
    super(options);
    this.fn = fn;
  }

  async doSideEffect(chunk) {
    return await this.fn(chunk);
  }

  _transform(chunk, encoding, callback) {
    this.doSideEffect(chunk)
      .then(() => {
        super._transform(chunk, encoding, callback);
      }).catch((err) => {
        callback(err);
      });
  }
}

/**
 * Input: stream of arrays
 * Output: stream of elements
 */
class SplittingStream extends Duplex {
  constructor(concurrency = 1, outHighWaterMarkScale = 500, inHighWaterMarkScale = 1) {
    const inputStream = new PassThrough({ objectMode: true, readableHighWaterMark: concurrency * outHighWaterMarkScale, writableHighWaterMark: concurrency * inHighWaterMarkScale });
    return Duplex.from({
      objectMode: true,
      readable: inputStream.flatMap(
        (input) => {
          return input;
        }, { concurrency }),
      writable: inputStream
    });
  }
}

module.exports = {
  BatchingStream,
  FilterStream,
  MappingStream,
  SideEffect,
  SplittingStream
};
