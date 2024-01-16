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
  /**
   * A Writable that delegates to another writable wrapping it in some
   * helpful operations and handling "ending" of special streams like
   * process.stdout.
   *
   * @param {string} name - the name of this DelegateWritable for logging
   * @param {Writable} targetWritable - the Writable stream to write to
   * @param {function} lastChunkFn - a no-args function to call to get a final chunk to write
   * @param {function} chunkMapFn - a function(chunk) that can transform/map a chunk before writing
   * @param {function} postWriteFn - a function(chunk) that can perform an action after a write completes
   */
  constructor(name, targetWritable, lastChunkFn, chunkMapFn, postWriteFn) {
    super({ objectMode: true });
    this.name = name;
    this.targetWritable = targetWritable;
    this.lastChunkFn = lastChunkFn;
    this.chunkMapFn = chunkMapFn;
    this.postWriteFn = postWriteFn;
    this.log = debug((`couchbackup:transform:delegate:${name}`));
  }

  _write(chunk, encoding, callback) {
    const toWrite = (this.chunkMapFn) ? this.chunkMapFn(chunk) : chunk;
    this.targetWritable.write(toWrite, encoding, (err) => {
      if (!err) {
        this.log('completed target chunk write');
        if (this.postWriteFn) {
          this.postWriteFn(chunk);
        }
      }
      callback(err);
    });
  }

  _final(callback) {
    this.log('Finalizing');
    const lastChunk = (this.lastChunkFn && this.lastChunkFn()) || null;
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
 * A helper PassThrough class that is used in our custom
 * Duplex streams.
 */
class DuplexPassThrough extends PassThrough {
  constructor(opts) {
    super({ objectMode: true, readableHighWaterMark: 0, writableHighWaterMark: 0, ...opts });
  }

  // The destroy call on this PassThrough stream
  // gets ahead of real errors reaching the
  // callback/promise at the end of the pipeline.
  // This allows an AbortError to get propagated
  // from the micro-task queue instead because the
  // real error is blocked behind a callback somewhere.
  // That in turn masks the real cause of the failure,
  // so we defer the _destroy in a setImmediate.
  _destroy(err, cb) {
    setImmediate(() => {
      cb(err);
    });
  }
}

/**
 * Input: stream of x
 * Output: stream of x with elements not passing the filter removed
 */
class FilterStream extends Duplex {
  constructor(filterFunction) {
    const inputStream = new DuplexPassThrough();
    return Duplex.from({ readable: inputStream.filter(filterFunction, { concurrency: 1, highWaterMark: 0 }), writable: inputStream });
  }
}

/**
 * Input: stream of x
 * Output: stream of mappingFunction(x)
 */
class MappingStream extends Duplex {
  constructor(mappingFunction, concurrency = 1, highWaterMark = 0) {
    const inputStream = new DuplexPassThrough();
    return Duplex.from({ readable: inputStream.map(mappingFunction, { concurrency, highWaterMark: 0 }), writable: inputStream });
  }
}

/**
 * PassThrough stream that calls another function
 * to perform a side effect.
 */
class SideEffect extends DuplexPassThrough {
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
    const inputStream = new DuplexPassThrough({ objectMode: true, readableHighWaterMark: concurrency * outHighWaterMarkScale, writableHighWaterMark: concurrency * inHighWaterMarkScale });
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
  /**
   * A Writable that passes through the original chunk.
   * The chunk is also passed to a SideEffect which behaves as DelegateWritable does.
   *
   * @param {string} name - the name of the DelegateWritable for logging
   * @param {Writable} targetWritable - the Writable stream to write to
   * @param {function} lastChunkFn - a no-args function to call to get a final chunk to write
   * @param {function} chunkMapFn - a function(chunk) that can transform/map a chunk before writing
   * @param {function} postWriteFn - a function(chunk) that can perform an action after a write completes
   */
  constructor(name, targetWritable, lastChunkFn, chunkMapFn, postWriteFn) {
    // Initialize super without a side effect fn because we need to set some
    // properties before we can define it.
    super(null, { objectMode: true });
    this.log = debug(`couchbackup:transform:writablepassthrough:${name}`);
    this.delegateWritable = new DelegateWritable(name, targetWritable, lastChunkFn, chunkMapFn, postWriteFn);
    // Now set the side effect fn we omitted earlier
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
