// Copyright © 2017, 2024 IBM Corp. All rights reserved.
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

delete require.cache[require.resolve('./citestutils.js')];
const u = require('./citestutils.js');
const client = require('./hooks.js').sharedClient;
const { Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const assert = require('node:assert');

[{ useApi: true }, { useApi: false }].forEach(function(params) {
  describe(u.scenario('End to end backup and restore', params), function() {
    it('should backup and restore animaldb', async function() {
      // Allow up to 60 s for backup and restore of animaldb
      u.setTimeout(this, 60);
      return u.testDirectBackupAndRestore(params, 'animaldb', this.dbName);
    });

    it('should backup and restore largedb1g #slow', async function() {
      // Allow up to 30 m for backup and restore of largedb1g
      // This is a long time but when many builds run in parallel it can take a
      // while to get this done.
      u.setTimeout(this, 30 * 60);
      return u.testDirectBackupAndRestore(params, 'largedb1g', this.dbName);
    });

    it('should restore and backup attachment', async function() {
      // Allow up to 60 s
      u.setTimeout(this, 60);
      const p = u.p(params, { opts: { attachments: true } });
      const expectedBackupFile = './test/fixtures/attachment.backup';
      const actualBackup = `./${this.fileName}`;
      const actualRestoredAttachmentChunks = [];
      return u.testRestoreFromFile(p, expectedBackupFile, this.dbName)
        .then(() => {
          return u.testBackupToFile(p, this.dbName, actualBackup);
        }).then(() => {
          return u.backupFileCompare(actualBackup, expectedBackupFile);
        }).then(() => {
          return client.getAttachment({
            db: this.dbName,
            docId: 'd1',
            attachmentName: 'att.txt'
          });
        }).then(response => {
          return pipeline(
            response.result, new Writable({
              write(chunk, encoding, callback) {
                actualRestoredAttachmentChunks.push(chunk);
                callback();
              }
            }));
        }).then(() => {
          const actualRestoredAttachment = Buffer.concat(actualRestoredAttachmentChunks).toString('utf8');
          assert.strictEqual(actualRestoredAttachment, 'My attachment data');
        });
    });
  });
});
