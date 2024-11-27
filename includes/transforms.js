// Copyright © 2023, 2024 IBM Corp. All rights reserved.
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

const { Duplex, PassThrough, Writable, getDefaultHighWaterMark, setDefaultHighWaterMark } = require('node:stream');
const debug = require('debug');

/**
 * Input: stream of elements
 * Output: stream of arrays of batchSize elements each
 */
class BatchingStream extends Duplex {
  // The buffer of elements to batch
  elementsToBatch = [];
  // The current batch ID
  batchId = 0;
  // Flag whether the Readable side is currently draining
  isReadableDraining = true;
  // Flag whether the writable side is complete
  isWritableComplete = false;

  /**
   * Make a new BatchingStream with the given output batch
   * size and whether it is accepting arrays for rebatching
   * or single elements and buffering the set number of batches.
   *
   * @param {number} batchSize output batch (array) size
   * @param {boolean} rebatch true to accept arrays and resize them (defaults to false to accept single items)
   * @param {number} batchHighWaterMark the number of batches to buffer before applying upstream back-pressure
   */
  constructor(batchSize, rebatch = false, batchHighWaterMark = 1) {
    // This Duplex stream is always objectMode and doesn't use the stream
    // buffers. It does use an internal buffer of elements for batching, which
    // holds up to 1 batch in memory.
    // The Writable side of this Duplex is written to by the element supplier.
    // The Readable side of this Duplex is read by the batch consumer.
    super({ objectMode: true, readableHighWaterMark: 0, writableHighWaterMark: 0 });
    // Logging config
    this.log = debug((`couchbackup:transform:${rebatch ? 're' : ''}batch`));
    this.log(`Batching to size ${batchSize}`);
    this.batchSize = batchSize;
    this.rebatch = rebatch;
    this.elementHighWaterMark = batchHighWaterMark * this.batchSize;
  }

  /**
   * Check the available elementsToBatch and if the downstream consumer is
   * accepting make and push as many batches as possible.
   *
   * This will not push if the Readable is not draining (downstream back-pressure).
   * Batches will be pushed if:
   * 1. The Readable is draining and there are at least batch size elements
   * 2. The Readable is draining and there will be no new elements (the Writable is complete)
   *    and there are any elements available.
   * Condition 2 allows for a smaller sized partial final batch.
   */
  tryPushingBatches() {
    this.log('Try to push batches.',
     `Available elements:${this.elementsToBatch.length}`,
     `Readable draining:${this.isReadableDraining}`,
     `Writable complete:${this.isWritableComplete}`);
    while (this.isReadableDraining &&
      (this.elementsToBatch.length >= this.batchSize ||
        (this.isWritableComplete && this.elementsToBatch.length > 0))) {
      // Splice up to batchSize elements from the available elements
      const batch = this.elementsToBatch.splice(0, this.batchSize);
      this.log(`Writing batch ${this.batchId} with ${batch.length} elements.`);
      // Increment the batch ID ready for the next batch
      this.batchId++;
      // push the batch downstream
      if (!this.push(batch)) {
        // There was back-pressure from downstream.
        // Unset the draining flag and break the loop.
        this.isReadableDraining = false;
        break;
      }
    }
    if (this.elementsToBatch.length < this.batchSize) {
      // We've drained the buffer, release upstream.
      if (this.pendingCallback) {
        this.log('Unblocking after downstream reads.');
        this.pendingCallback();
        this.pendingCallback = null;
      }
    }
    if (this.elementsToBatch.length === 0 && this.isWritableComplete) {
      this.log('No further elements, signalling EOF.');
      this.push(null);
    }
  }

  /**
   * Implementation of _read.
   * The Duplex.read is called when downstream can accept more data.
   * That in turn calls this _read implementation.
   *
   * @param {number} size ignored for objectMode
   */
  _read(size) {
    // Downstream asked for data set the draining flag.
    this.isReadableDraining = true;
    // Push any available batches.
    this.tryPushingBatches();
  }

  /**
   * Implementation of _write that accepts elements and
   * adds them to an array of elementsToBatch.
   * If the size of elementsToBatch exceeds the configured
   * high water mark then the element supplier receives back-pressure
   * via a delayed callback.
   *
   * @param {*} element the element to add to a batch
   * @param {string} encoding ignored (objects are passed as-is)
   * @param {function} callback called back when elementsToBatch is not too full
   */
  _write(element, encoding, callback) {
    if (!this.rebatch) {
      // If we're not rebatching we're dealing with a single element
      // but the push is cleaner if we can spread, so wrap in an array.
      element = [element];
    }
    if (this.elementsToBatch.push(...element) >= this.elementHighWaterMark) {
      // Delay callback as we have more than 1 batch buffered
      // Downstream cannot accept more batches, delay the
      // callback to back-pressure our element supplier until
      // after the next downstream read.
      this.log(`Back pressure after batch ${this.batchId}`);
      this.pendingCallback = callback;
      // If there are enough elements we must try to push batches
      // to satisfy the Readable contract which will not call read
      // again until after a push in the event that no data was available.
      this.tryPushingBatches();
    } else {
      // Callback immediately if there are fewer elements
      callback();
    }
  }

  /**
   * Implementation of _final to ensure that any partial batches
   * remaining when the supplying stream ends are pushed downstream.
   *
   * @param {function} callback
   */
  _final(callback) {
    this.log('Flushing batch transform.');
    // Set the writable complete flag
    this.isWritableComplete = true;
    // Try to push batches
    this.tryPushingBatches();
    callback();
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

class DuplexMapper extends Duplex {
  constructor(fn, style, concurrency = 1) {
    const operatorOpts = { concurrency, highWaterMark: concurrency };
    const inputStream = new DuplexPassThrough();
    let outputStream;
    switch (style) {
      case 'map':
        outputStream = inputStream.map(fn, operatorOpts);
        break;
      case 'filter':
        outputStream = inputStream.filter(fn, operatorOpts);
        break;
      default:
        throw new Error('Invalid style.');
    }
    // Workaround the fact that Duplex.from doesn't allow customizing the HWM
    // Set a new objectMode default value while we create the stream, then reset it.
    const originalHWM = getDefaultHighWaterMark(true);
    // Use concurrency as the highWaterMark to allow one item on deck for each "thread"
    setDefaultHighWaterMark(true, concurrency);
    try {
      return Duplex.from({ readable: outputStream, writable: inputStream });
    } finally {
      setDefaultHighWaterMark(true, originalHWM);
    }
  }
}

/**
 * Input: stream of x
 * Output: stream of x with elements not passing the filter removed
 */
class FilterStream extends DuplexMapper {
  constructor(filterFunction) {
    super(filterFunction, 'filter');
  }
}

/**
 * Input: stream of x
 * Output: stream of mappingFunction(x)
 */
class MappingStream extends DuplexMapper {
  constructor(mappingFunction, concurrency = 1) {
    super(mappingFunction, 'map', concurrency);
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
  WritableWithPassThrough
};
