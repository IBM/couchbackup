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

// Small script which backs up a Cloudant or CouchDB database to an S3
// bucket, using an intermediary file on disk.
//
// The script generates the backup object name by combining together the path
// part of the database URL and the current time.

const { createReadStream, createWriteStream, mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const url = require('node:url');

const { backup } = require('@cloudant/couchbackup');
const { fromIni } = require('@aws-sdk/credential-providers');
const { Upload } = require('@aws-sdk/lib-storage');
const { HeadBucketCommand, S3Client } = require('@aws-sdk/client-s3');
const debug = require('debug')('s3-backup');
const VError = require('verror').VError;

/*
  Main function, run from base of file.
*/
function main() {
  const argv = require('yargs')
    .usage('Usage: $0 [options]')
    .example('$0 -s https://user:pass@host/sourcedb -b <bucket>', 'Backup db to bucket')
    .options({
      source: { alias: 's', nargs: 1, demandOption: true, describe: 'Source database URL' },
      bucket: { alias: 'b', nargs: 1, demandOption: true, describe: 'Destination bucket' },
      prefix: { alias: 'p', nargs: 1, describe: 'Prefix for backup object key', default: 'couchbackup' },
      s3url: { nargs: 1, describe: 'S3 endpoint URL' },
      awsprofile: { nargs: 1, describe: 'The profile section to use in the ~/.aws/credentials file', default: 'default' }
    })
    .help('h').alias('h', 'help')
    .epilog('Copyright (C) IBM 2017, 2024')
    .argv;

  const sourceUrl = argv.source;
  const backupBucket = argv.bucket;
  const backupName = new url.URL(sourceUrl).pathname.split('/').filter(function(x) { return x; }).join('-');
  const backupKeyPrefix = `${argv.prefix}-${backupName}`;

  const backupDate = Date.now();
  const isoDate = new Date(backupDate).toISOString();
  const backupKey = `${backupKeyPrefix}-${isoDate}`;
  const backupTmpFile = join(mkdtempSync(join(tmpdir(), 'couchbackup-s3-backup-')), `${backupDate}`);

  const s3Endpoint = argv.s3url;
  const awsProfile = argv.awsprofile;

  // Creds are from ~/.aws/credentials, environment etc. (see S3 docs).
  const awsOpts = {
    signatureVersion: 'v4',
    credentials: fromIni({ profile: awsProfile })
  };
  if (typeof s3Endpoint !== 'undefined') {
    awsOpts.endpoint = s3Endpoint;
  }
  const s3 = new S3Client(awsOpts);

  debug(`Creating a new backup of ${s(sourceUrl)} at ${backupBucket}/${backupKey}...`);
  bucketAccessible(s3, backupBucket)
    .then(() => {
      return createBackupFile(sourceUrl, backupTmpFile);
    })
    .then(() => {
      return uploadNewBackup(s3, backupTmpFile, backupBucket, backupKey);
    })
    .then(() => {
      debug('Backup successful!');
    })
    .catch((reason) => {
      debug(`Error: ${reason}`);
    });
}

/**
 * Return a promise that resolves if the bucket is available and
 * rejects if not.
 *
 * @param {any} s3 S3 client object
 * @param {any} bucketName Bucket name
 * @returns Promise
 */
function bucketAccessible(s3, bucketName) {
  return s3.send(new HeadBucketCommand({
    Bucket: bucketName
  })).catch(e => { throw new VError(e, 'S3 bucket not accessible'); });
}

/**
 * Use couchbackup to create a backup of the specified database to a file path.
 *
 * @param {any} sourceUrl Database URL
 * @param {any} backupTmpFilePath Path to write file
 * @returns Promise
 */
function createBackupFile(sourceUrl, backupTmpFilePath) {
  return new Promise((resolve, reject) => {
    backup(
      sourceUrl,
      createWriteStream(backupTmpFilePath),
      (err, done) => {
        if (err) {
          reject(err);
        } else {
          resolve(done);
        }
      }
    )
      .on('changes', batch => debug('Couchbackup changes batch: ', batch))
      .on('written', progress => debug('Fetched batch:', progress.batch, 'Total document revisions written:', progress.total, 'Time:', progress.time));
  })
    .then((done) => {
      debug(`couchbackup to file done; backed up ${done.total}`);
      debug('Ready to upload to S3');
    })
    .catch((err) => {
      throw new VError(err, 'CouchBackup process failed');
    });
}

/**
 * Upload a backup file to an S3 bucket.
 *
 * @param {any} s3 Object store client
 * @param {any} backupTmpFilePath Path of backup file to write.
 * @param {any} bucket Object store bucket name
 * @param {any} key Object store key name
 * @returns Promise
 */
function uploadNewBackup(s3, backupTmpFilePath, bucket, key) {
  debug(`Uploading from ${backupTmpFilePath} to ${bucket}/${key}`);
  const inputStream = createReadStream(backupTmpFilePath);
  try {
    const upload = new Upload({
      client: s3,
      params: {
        Bucket: bucket,
        Key: key,
        Body: inputStream
      },
      queueSize: 5, // allow 5 parts at a time
      partSize: 1024 * 1024 * 64 // 64 MB part size
    });
    upload.on('httpUploadProgress', (progress) => {
      debug(`S3 upload progress: ${JSON.stringify(progress)}`);
    });
    // Return a promise for the completed or aborted upload
    return upload.done().finally(() => {
      debug('S3 upload done');
    })
      .then(() => {
        debug('Upload succeeded');
      })
      .catch(err => {
        debug(err);
        throw new VError(err, 'Upload failed');
      });
  } catch (err) {
    debug(err);
    return Promise.reject(new VError(err, 'Upload could not start'));
  }
}

/**
 * Remove creds from a URL, e.g., before logging
 *
 * @param {string} url URL to safen
 */
function s(originalUrl) {
  const parts = new url.URL(originalUrl);
  return url.format(parts, { auth: false });
}

main();
