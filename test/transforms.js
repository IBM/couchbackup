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

/* global beforeEach describe it */
'use strict';

const assert = require('node:assert');
const tp = require('node:timers/promises');
const { Readable, Writable, PassThrough } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { BatchingStream, DelegateWritable, FilterStream, MappingStream, SplittingStream, SideEffect, WritableWithPassThrough } = require('../includes/transforms.js');
const events = require('events');

describe('#unit should do transforms', function() {
  describe('BatchingStream', async function() {
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

  describe('DelegateWritable', function() {
    // Make tests for both the writable and stdout cases
    ['writable', 'stdout'].forEach((dest) => {
      describe(`to ${dest}`, function() {
        let postWriteCollector;
        // Functions optionally added to test
        const lastChunkFn = () => { return 'd'; }; // write a "d" as the last chunk
        const chunkMapFn = (chunk) => { const map = { a: 1, b: 2, c: 3 }; return map[chunk]; }; // map values to other values
        const postWriteFn = (chunk) => { postWriteCollector.push(chunk); }; // push the chunk after a write

        // Iterate through the available functions
        // [lastChunkFn, chunkMapFn, postWriteFn]
        // test none, each individually and all
        [[undefined, undefined, undefined], // none
          [lastChunkFn, undefined, undefined], // lastChunkFn
          [undefined, chunkMapFn, undefined], // chunkMapFn
          [undefined, undefined, postWriteFn], // postWriteFn
          [lastChunkFn, chunkMapFn, postWriteFn] // all
        ].forEach((params) => {
          let testName = 'write test';
          if (params[0]) {
            testName += ' with last chunk';
          }
          if (params[1]) {
            testName += ' with chunk mapping';
          }
          if (params[2]) {
            testName += ' with post write';
          }
          it(`${testName}`, async function() {
            const output = [];
            // clean postWriteCollector for each test
            postWriteCollector = [];
            const delegateWritable = new DelegateWritable(dest,
              (dest === 'stdout')
                ? process.stdout
                : new Writable({
                  objectMode: true,
                  write: (chunk, encoding, callback) => {
                    output.push(chunk);
                    callback();
                  }
                }),
              ...params
            );

            const input = ['a', 'b', 'c'];
            let originalStdoutWrite;
            // hijack process.stdout so we can assert the writes
            if (dest === 'stdout') {
              originalStdoutWrite = process.stdout.write;
              process.stdout.write = function(chunk, encoding, cb) {
                output.push(chunk);
                cb();
              };
            }
            try {
              await pipeline(input, delegateWritable);
              let expected = Array.from(input);
              // For the chunk mapping case, we expect the chunks to be mapped
              if (params[1]) {
                expected = expected.map(chunkMapFn);
              }
              // For the last chunk cases, we expect an additional chunk
              if (params[0]) {
                expected.push('d');
              }
              assert.deepStrictEqual(output, expected);
              // If we were doing postWrite we should assert the collector
              if (params[2]) {
                assert.deepStrictEqual(postWriteCollector, input);
              }
            } finally {
            // revert stdout to normal
              if (originalStdoutWrite) {
                process.stdout.write = originalStdoutWrite;
              }
            }
          });
        });
      });
    });
  });

  describe('FilterStream', async function() {
    it('should filter', async function() {
      const out = new PassThrough({ objectMode: true });
      await pipeline([1, 2, 3, 4, 5, 6], new FilterStream((i) => { return i % 2 === 0; }), out);
      const actual = await out.toArray();
      assert.deepStrictEqual(actual, [2, 4, 6]);
    });
  });

  describe('MappingStream', async function() {
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

  describe('SideEffect', async function() {
    // Test "streams"
    const singleElement = [{ id: '01' }];
    const multipleElements = [{ id: '01' }, { id: '02' }, { id: '03' }];

    // Eventing
    const ee = new events.EventEmitter();
    const eventType = 'changes';
    const emitterAsyncFn = async(chunk) => { ee.emit(eventType, chunk); };
    const emitterFn = (chunk) => { ee.emit(eventType, chunk); };
    // Before each test:
    // remove all listeners
    // reset the counter

    beforeEach('reset listeners', function() {
      ee.removeAllListeners();
    });

    // Run a test
    async function testSideEffect(elements, fn) {
      const actualElements = [];
      let eventsCounter = 0;
      ee.addListener(eventType, function() {
        eventsCounter++;
      });
      return pipeline(Readable.from(elements), new SideEffect(fn, { objectMode: true }),
        new Writable({
          objectMode: true,
          write(chunk, encoding, callback) {
            actualElements.push(chunk);
            callback();
          }
        })).then(() => {
        assert.deepStrictEqual(actualElements, elements);
        assert.strictEqual(eventsCounter, elements.length);
      });
    }

    describe('success cases', async function() {
      it('emit event in side effect, async', async function() {
        return testSideEffect(singleElement, emitterAsyncFn);
      });

      it('emit event in side effect', async function() {
        return testSideEffect(singleElement, emitterFn);
      });

      it('emit events in side effect, async', async function() {
        return testSideEffect(multipleElements, emitterAsyncFn);
      });

      it('emit events in side effect', async function() {
        return testSideEffect(multipleElements, emitterFn);
      });
    });

    describe('error cases', function() {
      const testError = new Error('Testing an error');
      let counter;
      beforeEach('reset counter', function() {
        counter = 0;
      });

      const rejectingFn = (target) => {
        return async function() {
          counter++;
          if (counter === target) {
            return Promise.reject(testError);
          } else {
            return Promise.resolve(counter);
          }
        };
      };
      const throwingFn = (target) => {
        return function() {
          counter++;
          if (counter === target) {
            throw testError;
          } else {
            return counter;
          }
        };
      };
      it('fails for an error, async', async function() {
        return assert.rejects(() => { return testSideEffect(singleElement, rejectingFn(1)); }, testError);
      });
      it('fails for an error', async function() {
        return assert.rejects(() => { return testSideEffect(singleElement, throwingFn(1)); }, testError);
      });
      it('stops after error, async', async function() {
        return assert.rejects(() => { return testSideEffect(multipleElements, rejectingFn(2)); }, testError).then(() => {
          // Check no extra events
          assert.strictEqual(counter, 2);
        });
      });
      it('stops after error', async function() {
        return assert.rejects(() => { return testSideEffect(multipleElements, throwingFn(2)); }, testError).then(() => {
          // Check no extra events
          assert.strictEqual(counter, 2);
        });
      });
    });
  });

  describe('SplittingStream', async function() {
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

  describe('WritableWithPassthrough', function() {
    [undefined, () => 8].forEach((lastChunk) => {
      it(`writes out and passes through${lastChunk ? ' with last chunk' : ''}`, async function() {
        const passedThrough = [];
        const passedThroughWritable = new Writable({
          objectMode: true,
          write: (chunk, encoding, callback) => {
            passedThrough.push(chunk);
            callback();
          }
        });
        const writtenOut = [];
        const writtenOutWritable = new Writable({
          objectMode: true,
          write: (chunk, encoding, callback) => {
            writtenOut.push(chunk);
            callback();
          }
        });
        const input = [1, 2, 3, 4, 5, 6, 7];
        const expected = Array.from(input);
        if (lastChunk) expected.push(8);
        await pipeline(input, new WritableWithPassThrough('write_out', writtenOutWritable, lastChunk), passedThroughWritable);
        assert.deepStrictEqual(passedThrough, input, 'The input should pass through.');
        assert.deepStrictEqual(writtenOut, expected, 'The expected content should be written out.');
      });
    });
  });
});
