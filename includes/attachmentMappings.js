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
'use strict';

const debug = require('debug');
const mappingDebug = debug('couchbackup:mappings');

/**
 * The cloudant-node-sdk helpfully automatically converts the base64 encoded
 * inline attachments into Buffer so the binary data can be used by consuming
 * applicaitons without the need to decode b64.
 * However, in the case of couchbackup we actually want the b64 data so that
 * we can write it in the inline attachment format to the backup file.
 * This class provides the mappings between Buffer and Base64 binary data.
 */
class Attachments {
  encode(backupBatch) {
    backupBatch.docs.map(doc => {
      if (doc._attachments) {
        Object.entries(doc._attachments).forEach(([k, attachment]) => {
          mappingDebug(`Preparing attachment ${k} for backup.`);
          // Attachment data is a Buffer
          // Base64 encode the attachment data for the backup file
          attachment.data = attachment.data.toString('base64');
          return [k, attachment];
        });
      }
      return doc;
    });
    return backupBatch;
  }

  decode(restoreBatch) {
    restoreBatch.docs.map(doc => {
      if (doc._attachments) {
        Object.entries(doc._attachments).forEach(([k, attachment]) => {
          mappingDebug(`Preparing attachment ${k} for restore.`);
          // Attachment data is a Base64 string
          // Base64 decode the attachment data into a Buffer
          attachment.data = Buffer.from(attachment.data, 'base64');
          return [k, attachment];
        });
      }
      return doc;
    });
    return restoreBatch;
  }
}

module.exports = {
  Attachments
};
