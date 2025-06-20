// Copyright © 2025 IBM Corp. All rights reserved.
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

// Small script which backs up a Cloudant database to an IBM Cloud Object Storage (COS)
// bucket, using an intermediary file on disk, using IAM authentication
//
// The script generates the backup object name by combining together the path
// part of the database URL and the current time.

const IBM_COS = require('ibm-cos-sdk');
const fs = require('fs');
const VError = require('verror');
const tmp = require('tmp');
const couchbackup = require('@cloudant/couchbackup');
const debug = require('debug')('couchbackup-cos');
const url = require('url');

/*
  Main function, run from base of file.
*/
function main() {
  const argv = require('yargs')
    .usage('Usage: $0 [options]')
    .example('$0 -s https://~replaceWithYourUniqueHost~.cloudantnosqldb.appdomain.cloud/sourcedb -b <bucket> --cos_url <url>', 'Backup db to bucket using IAM authentication')
    .options({
      source: { alias: 's', nargs: 1, demandOption: true, describe: 'Source database URL' },
      bucket: { alias: 'b', nargs: 1, demandOption: true, describe: 'Destination bucket' },
      prefix: { alias: 'p', nargs: 1, describe: 'Prefix for backup object key', default: 'couchbackup' },
      cos_url: { nargs: 1, demandOption: true, describe: 'IBM COS S3 endpoint URL' }, // An endpoint from 'endpoints' list in cos_credentials
      shallow: { describe: 'Backup the documents winning revisions only', type: 'boolean' }
    })
    .help('h').alias('h', 'help')
    .epilog('Copyright (C) IBM 2025')
    .argv;

  const sourceUrl = argv.source;
  const backupBucket = argv.bucket;
  const backupName = new url.URL(sourceUrl).pathname.split('/').filter(function(x) { return x; }).join('-');
  const backupKeyPrefix = `${argv.prefix}-${backupName}`;
  const backupKey = `${backupKeyPrefix}-${new Date().toISOString()}`;
  const cosEndpoint = argv.cos_url;
  const cloudantApiKey = process.env.CLOUDANT_IAM_API_KEY;
  const mode = argv.shallow ? 'shallow' : 'full';
  const backupTmpFile = tmp.fileSync();

  /*
  * Creds are from ~/.bluemix/cos_credentials, generated by ibmcloud CLI tool
  * See: https://cloud.ibm.com/docs/cloud-object-storage?topic=cloud-object-storage-service-credentials
  *
  * corresponding 'endpoint' can be found on IBM Cloud UI at the COS instance,
  * or under the 'endpoints' link provided in the generated file (~/.bluemix/cos_credentials)
  *  */
  const config = {
    endpoint: cosEndpoint,
    credentials: new IBM_COS.SharedJSONFileCredentials(),
  };
  const COS = new IBM_COS.S3(config);
  debug(`Creating a new backup of ${sourceUrl} at ${backupBucket}/${backupKey}...`);
  bucketAccessible(COS, backupBucket)
    .then(() => {
      return createBackupFile(sourceUrl, backupTmpFile.name, cloudantApiKey, mode);
    })
    .then(() => {
      return uploadNewBackup(COS, backupTmpFile.name, backupBucket, backupKey);
    })
    .then(() => {
      debug('Backup successful!');
    })
    .catch((reason) => {
      debug(`Error: ${reason}`);
      process.exit(1);
    });
}

/**
 * Return a promise that resolves if the bucket is available and
 * rejects if not.
 *
 * @param {IBM_COS.S3} s3 IBM COS S3 client object
 * @param {any} bucketName Bucket name
 * @returns Promise
 */
function bucketAccessible(s3, bucketName) {
  const params = {
    Bucket: bucketName
  };
  return s3.headBucket(params).promise()
    .then(() => { debug('Bucket is accessible'); })
    .catch((reason) => {
      console.error(reason);
      throw new VError(reason, 'Bucket is not accessible');
    });
}

/**
 * Use couchbackup to create a backup of the specified database to a file path.
 *
 * @param {any} sourceUrl Database URL
 * @param {any} backupTmpFilePath Path to write file
 * @returns Promise
 */
function createBackupFile(sourceUrl, backupTmpFilePath, cloudantApiKey, mode) {
  return new Promise((resolve, reject) => {
    debug(`Using couchbackup mode: ${mode}`);
    const params = {
      iamApiKey: cloudantApiKey,
      mode,
      ...(process.env.CLOUDANT_IAM_TOKEN_URL && { iamTokenUrl: process.env.CLOUDANT_IAM_TOKEN_URL }),
    };
    couchbackup.backup(
      sourceUrl,
      fs.createWriteStream(backupTmpFilePath),
      params,
      (err, done) => {
        if (err) {
          reject(new VError(err, 'CouchBackup process failed'));
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
      debug('Ready to upload to IBM COS');
    })
    .catch((err) => {
      throw new VError(err, 'CouchBackup process failed');
    });
}

/**
 * Upload a backup file to an IBM COS bucket.
 *
 * @param {IBM_COS.S3} cos Object store client
 * @param {any} backupTmpFilePath Path of backup file to write.
 * @param {any} bucket Object store bucket name
 * @param {any} key Object store key name
 * @returns Promise
 */
function uploadNewBackup(cos, backupTmpFilePath, bucket, key) {
  debug(`Uploading from ${backupTmpFilePath} to ${bucket}/${key}`);

  const inputStream = fs.createReadStream(backupTmpFilePath, { highWaterMark: 5 * 1024 * 1024 });
  const params = {
    Bucket: bucket,
    Key: key,
    Body: inputStream
  };
  const options = {
    partSize: 5 * 1024 * 1024, // max 5 MB part size (minimum size)
    queueSize: 5  // allow 5 parts at a time
  };

  const upload = cos.upload(params, options);
  upload.on('httpUploadProgress', (progress) => {
    debug(`IBM COS S3 upload progress: ${JSON.stringify(progress)}`);
  });

  return upload.promise()
    .then(() => {
      debug('Upload succeeded!');
    })
    .catch(err => {
      debug(err);
      throw new VError(err);
    });
}

main();
