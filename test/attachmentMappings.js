// Copyright © 2024 IBM Corp. All rights reserved.
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
const { Attachments } = require('../includes/attachmentMappings.js');

describe('#unit attachment mappings', function() {
  // Test data
  const stringData = 'My attachment data';
  const bufferData = Buffer.from(stringData);
  const b64Data = bufferData.toString('base64');
  const docTempate = {
    _attachments: {
      'att.txt': {
        contentType: 'text/plain',
        revpos: 2
      }
    },
    _id: 'd1',
    _rev: '2-1c7820dce2c9543d9417323a047e2896',
    _revisions: { ids: ['1c7820dce2c9543d9417323a047e2896', '967a00dff5e02add41819138abb3284d'], start: 2 }
  };

  describe('encode', function() {
    it('should correctly convert a Buffer to Base64', function() {
      const docWithBufferAttachment = { ...docTempate, ...{ _attachments: { 'att.txt': { data: bufferData } } } };
      const docWithBase64Attachment = { ...docTempate, ...{ _attachments: { 'att.txt': { data: b64Data } } } };
      const bufferBatch = { docs: [docWithBufferAttachment] };
      const b64Batch = { docs: [docWithBase64Attachment] };
      const actualOutput = new Attachments().encode(bufferBatch);
      assert.deepStrictEqual(actualOutput, b64Batch);
    });
  });

  describe('decode', function() {
    it('should correctly convert Base64 to a Buffer', function() {
      const docWithBufferAttachment = { ...docTempate, ...{ _attachments: { 'att.txt': { data: bufferData } } } };
      const docWithBase64Attachment = { ...docTempate, ...{ _attachments: { 'att.txt': { data: b64Data } } } };
      const bufferBatch = { docs: [docWithBufferAttachment] };
      const b64Batch = { docs: [docWithBase64Attachment] };
      const actualOutput = new Attachments().decode(b64Batch);
      assert.deepStrictEqual(actualOutput, bufferBatch);
    });
  });
});
