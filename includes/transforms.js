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

const { Duplex, PassThrough, Transform, Writable } = require('node:stream');
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

class DelegateWritable extends Writable {
  constructor(name, targetWritable, lastChunkFunction) {
    super({ objectMode: true });
    this.name = name;
    this.targetWritable = targetWritable;
    this.lastChunkFunction = lastChunkFunction;
    this.log = debug((`couchbackup:transform:delegate:${name}`));
  }

  _write(chunk, encoding, callback) {
    this.targetWritable.write(chunk, encoding, (err) => {
      if (!err) {
        this.log('completed target chunk write');
      }
      callback(err);
    });
  }

  _final(callback) {
    this.log('Finalizing');
    const lastChunk = (this.lastChunkFunction && this.lastChunkFunction()) || null;
    // We can't 'end' stdout, so use a final write instead for that case
    if (this.targetWritable === process.stdout) {
      // we can't 'write' null, so don't do anything if there is no last chunk
      if (lastChunk) {
        this.targetWritable.write(lastChunk, 'utf-8', (err) => {
          if (!err) {
            this.log('wrote last chunk to stdout');
          } else {
            this.log('error writing last chunk to stdout');
          }
          callback(err);
        });
      } else {
        this.log('no last chunk to write to stdout');
        callback();
      }
    } else {
      this.targetWritable.end(lastChunk, 'utf-8', (err) => {
        if (!err) {
          this.log('wrote last chunk and ended target writable');
        } else {
          this.log('error ending target writable');
        }
        callback(err);
      });
    }
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
    this.log = debug(('couchbackup:transform:sideeffect'));
  }

  async doSideEffect(chunk, encoding) {
    return await this.fn(chunk, encoding);
  }

  _transform(chunk, encoding, callback) {
    this.log('Performing side effect');
    this.doSideEffect(chunk, encoding)
      .then(() => {
        this.log('Passing through');
        super._transform(chunk, encoding, callback);
      }).catch((err) => {
        this.log(`Caught error ${err}`);
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

class WritableWithPassThrough extends SideEffect {
  constructor(name, targetWritable, lastChunkFunction) {
    super(null, { objectMode: true });
    this.log = debug(`couchbackup:transform:writablepassthrough:${name}`);
    this.delegateWritable = new DelegateWritable(name, targetWritable, lastChunkFunction);
    this.fn = (chunk, encoding) => {
      return new Promise((resolve, reject) => {
        this.delegateWritable.write(chunk, encoding, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    };
  }

  _flush(callback) {
    this.log('Flushing writable passthrough');
    this.delegateWritable.end(callback);
  }
}

module.exports = {
  BatchingStream,
  DelegateWritable,
  FilterStream,
  MappingStream,
  SideEffect,
  SplittingStream,
  WritableWithPassThrough
};
