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

/* global describe it */
'use strict';

const assert = require('node:assert');
const tp = require('node:timers/promises');
const { Readable, Writable, PassThrough } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { BatchingStream, MappingStream, SplittingStream } = require('../includes/transforms.js');

describe('#unit should do transforms', function() {
  describe('batching', async function() {
    async function testBatching(elements, batchSize) {
      let batchCounter = 0;
      let fullBatchCounter = 0;
      let partialBatchCounter = 0;
      let elementCounter = 0;
      let noOversizeBatches = true;
      return pipeline(Readable.from(Array(elements).keys()), new BatchingStream(batchSize), new Writable({
        objectMode: true,
        write(chunk, encoding, callback) {
          batchCounter++;
          const currentBatchSize = chunk.length;
          if (currentBatchSize < batchSize) {
            // partial batch
            partialBatchCounter++;
          } else if (currentBatchSize === batchSize) {
            // full batch
            fullBatchCounter++;
          } else {
            // oversize batch
            noOversizeBatches = false;
          }
          elementCounter += currentBatchSize;
          callback();
        }
      })).then(() => {
        const fullBatches = Math.floor(elements / batchSize);
        const remainder = elements % batchSize;
        const partialBatches = remainder > 0 ? 1 : 0;
        const totalBatches = fullBatches + partialBatches;
        assert.ok(noOversizeBatches, 'All batches should be less than or equal to batchSize.');
        assert.strictEqual(batchCounter, totalBatches, 'There should be the correct total number of batches.');
        assert.strictEqual(fullBatchCounter, fullBatches, 'There should be the correct number of full batches.');
        assert.strictEqual(partialBatchCounter, partialBatches, 'There should be the correct number of partial batches.');
        assert.strictEqual(elementCounter, elements, 'There should be the correct number of elements.');
      });
    }

    it('single full batch', async function() {
      return testBatching(5, 5);
    });
    it('multiple full batches', async function() {
      return testBatching(9, 3);
    });
    it('only a partial batch', async function() {
      return testBatching(1, 3);
    });
    it('remaining partial batch', async function() {
      return testBatching(25, 4);
    });
  });
  describe('splitting', async function() {
    async function testSplitting(elements, batchSize, concurrency) {
      let elementCounter = 0;
      return pipeline(Readable.from(Array(elements).keys()), new BatchingStream(batchSize), new SplittingStream(concurrency),
        new Writable({
          objectMode: true,
          write(chunk, encoding, callback) {
            elementCounter++;
            callback();
          }
        })).then(() => {
        assert.strictEqual(elementCounter, elements, 'There should be the correct number of elements.');
      });
    }

    it('single batch', async function() {
      return testSplitting(2, 2);
    });

    it('multiple batches, same size', async function() {
      return testSplitting(15, 3);
    });

    it('multiple batches, different size', async function() {
      return testSplitting(29, 8);
    });

    it('multiple batches, concurrency', async function() {
      return testSplitting(25, 5, 5);
    });

    it('multiple batches, different size, concurrency', async function() {
      return testSplitting(27, 5, 5);
    });
  });

  describe('mapping', async function() {
    async function testMapping(input, mapping, expected, concurrency) {
      const output = new PassThrough({ objectMode: true });
      return pipeline(input, new MappingStream(mapping, concurrency), output).then(() => {
        return output.toArray();
      }).then((outputArray) => {
        if (concurrency) {
          // Order may change if we're using concurrency so sort before comparing
          outputArray.sort();
        }
        assert.deepStrictEqual(expected, outputArray, 'The output should be mapped.');
      });
    }

    it('map function, same type', async function() {
      return testMapping(Readable.from(Array(3).keys()), (x) => { return 2 * x; }, [0, 2, 4]);
    });

    it('map function, different type', async function() {
      return testMapping(Readable.from(Array(2).keys()), (x) => { return { id: x }; }, [{ id: 0 }, { id: 1 }]);
    });

    it('map function, async', async function() {
      return testMapping(Readable.from(Array(2).keys()), async(x) => { return tp.setTimeout(50, { id: x }); }, [{ id: 0 }, { id: 1 }]);
    });

    it('map function, concurrency', function() {
      return testMapping(Readable.from(Array(5).keys()), (x) => { return x; }, [0, 1, 2, 3, 4], 5);
    });

    it('map function, async concurrency', async function() {
      return testMapping(Readable.from(Array(4).keys()), async(x) => { return tp.setTimeout(Math.round(Math.random() * 50), x); }, [0, 1, 2, 3], 2);
    });
  });
});