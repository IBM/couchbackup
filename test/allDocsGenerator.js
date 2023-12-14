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

/* global describe it beforeEach */
'use strict';

const asyncGenerator = require('../includes/allDocsGenerator.js');
const assert = require('assert');
const { newClient } = require('../includes/request.js');
const fs = require('fs');
const nock = require('nock');
const { Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

function allDocsGen(dbUrl, opts) {
  const db = newClient(dbUrl, opts);
  // Disable compression to make body assertions easier
  db.service.setEnableGzipCompression(false);
  return asyncGenerator(db, opts);
}

describe('#unit async all docs generator', function() {
  const dbUrl = 'http://localhost:5984/animaldb';

  beforeEach('Reset nocks', function() {
    nock.cleanAll();
  });

  it('should return expected items to writer', async function() {
    let actualTotal = 0;
    const output = [];
    // Query string keys are stringified by Nano
    const badgerKey = 'badger\0';
    const kookaburraKey = 'kookaburra\0';
    const snipeKey = 'snipe\0';
    let iter = 1;

    const couch = nock(dbUrl)
      // batch 1
      .post('/_all_docs', { limit: 3, include_docs: true })
      .replyWithFile(200, './test/fixtures/animaldb_all_docs_1.json', { 'Content-Type': 'application/json' })
      // batch 2
      .post('/_all_docs', { limit: 3, start_key: badgerKey, include_docs: true })
      .replyWithFile(200, './test/fixtures/animaldb_all_docs_2.json', { 'Content-Type': 'application/json' })
      // batch 3
      .post('/_all_docs', { limit: 3, start_key: kookaburraKey, include_docs: true })
      .replyWithFile(200, './test/fixtures/animaldb_all_docs_3.json', { 'Content-Type': 'application/json' })
      // batch 4
      .post('/_all_docs', { limit: 3, start_key: snipeKey, include_docs: true })
      .replyWithFile(200, './test/fixtures/animaldb_all_docs_4.json', { 'Content-Type': 'application/json' });

    await pipeline(
      allDocsGen(dbUrl, { parallelism: 1, bufferSize: 3 }),
      new Writable({
        objectMode: true,
        write: (chunk, encoding, callback) => {
          output.push(chunk);
          actualTotal += chunk.docs.length;
          callback();
        }
      })
    );

    for (const [, value] of Object.entries(output)) {
      for (const [key, actualDoc] of Object.entries(value.docs)) {
        const expectedDocs = JSON.parse(fs.readFileSync(`./test/fixtures/animaldb_all_docs_${iter}.json`, 'utf8'));
        assert.deepStrictEqual(actualDoc, expectedDocs.rows[key].doc);
      }
      assert.ok(Number.isInteger(value.batch));
      assert.strictEqual(value.command, 'd');
      if (value.batch === 3) {
        assert.strictEqual(value.docs.length, 2); // smaller last batch
      } else {
        assert.strictEqual(value.docs.length, 3);
      }
      iter++;
    }
    assert.strictEqual(actualTotal, 11);
    assert.ok(couch.isDone());
  });

  it('should return expected items with transient error', async function() {
    let actualTotal = 0;
    const output = [];
    // Query string keys are stringified by Nano
    const badgerKey = 'badger\0';
    const kookaburraKey = 'kookaburra\0';
    const snipeKey = 'snipe\0';
    let iter = 1;

    const couch = nock(dbUrl)
      // batch 1
      .post('/_all_docs', { limit: 3, include_docs: true })
      .replyWithFile(200, './test/fixtures/animaldb_all_docs_1.json', { 'Content-Type': 'application/json' })
      // batch 2
      .post('/_all_docs', { limit: 3, start_key: badgerKey, include_docs: true })
      .replyWithFile(200, './test/fixtures/animaldb_all_docs_2.json', { 'Content-Type': 'application/json' })
      // batch 3 - transient error
      .post('/_all_docs', { limit: 3, start_key: kookaburraKey, include_docs: true })
      .reply(500, { error: 'Internal Server Error' })
      // batch 3 - retry
      .post('/_all_docs', { limit: 3, start_key: kookaburraKey, include_docs: true })
      .replyWithFile(200, './test/fixtures/animaldb_all_docs_3.json', { 'Content-Type': 'application/json' })
      // batch 4
      .post('/_all_docs', { limit: 3, start_key: snipeKey, include_docs: true })
      .replyWithFile(200, './test/fixtures/animaldb_all_docs_4.json', { 'Content-Type': 'application/json' });

    await pipeline(
      allDocsGen(dbUrl, { parallelism: 1, bufferSize: 3 }),
      new Writable({
        objectMode: true,
        write: (chunk, encoding, callback) => {
          output.push(chunk);
          actualTotal += chunk.docs.length;
          callback();
        }
      })
    );

    for (const [, value] of Object.entries(output)) {
      for (const [key, actualDoc] of Object.entries(value.docs)) {
        const expectedDocs = JSON.parse(fs.readFileSync(`./test/fixtures/animaldb_all_docs_${iter}.json`, 'utf8'));
        assert.deepStrictEqual(actualDoc, expectedDocs.rows[key].doc);
      }
      assert.ok(Number.isInteger(value.batch));
      assert.strictEqual(value.command, 'd');
      if (value.batch === 3) {
        assert.strictEqual(value.docs.length, 2); // smaller last batch
      } else {
        assert.strictEqual(value.docs.length, 3);
      }
      iter++;
    }
    assert.strictEqual(actualTotal, 11);
    assert.ok(couch.isDone());
  });

  it('should return expected items with empty page', async function() {
    let actualTotal = 0;
    const mockDoc = {
      _id: 'doc1',
      _rev: '1-abc',
      foo: 'bar'
    };
    const expected = [{ command: 'd', batch: 0, docs: [mockDoc] }, { command: 'd', batch: 1, docs: [] }];
    const output = [];

    const couch = nock(dbUrl)
      // first batch (0)
      .post('/_all_docs', { limit: 1, include_docs: true })
      .reply(200, {
        total_rows: 1,
        offset: 0,
        rows: [
          {
            id: 'doc1',
            key: 'doc1',
            value: {
              rev: '1-abc'
            },
            doc: mockDoc
          }
        ]
      })
      // second batch (1) (empty)
      .post('/_all_docs', { limit: 1, start_key: 'doc1\0', include_docs: true })
      .reply(200, {
        total_rows: 1,
        offset: 0,
        rows: []
      });

    await pipeline(
      allDocsGen(dbUrl, { parallelism: 1, bufferSize: 1 }),
      new Writable({
        objectMode: true,
        write: (chunk, encoding, callback) => {
          output.push(chunk);
          actualTotal += chunk.docs.length;
          callback();
        }
      })
    );

    assert.strictEqual(actualTotal, 1);
    assert.deepStrictEqual(output, expected);
    assert.ok(couch.isDone());
  });
});
