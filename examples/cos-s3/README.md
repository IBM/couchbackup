# CouchBackup AWS S3 Examples

This folder contains example Node.js scripts which use the `couchbackup` library and the AWS S3 SDK.

These scripts are for inspiration and demonstration.
They are not a supported part of couchbackup and should not be considered production ready.

## Prerequisites

### Install the dependencies

Use `npm install` in this folder to install the script
dependencies.
Note: this uses the latest release of couchbackup, not the
checked out version.

### AWS SDK configuration

The scripts expect AWS ini files:
* shared credentials file `~/.aws/credentials` or target file from `AWS_SHARED_CREDENTIALS_FILE` environment variable
* shared configuration file `~/.aws/config` or target file from `AWS_CONFIG_FILE` environment variable
* `CLOUDANT_IAM_API_KEY` environment variable set to API key with permission to the Cloudant instance
* (optional) `CLOUDANT_IAM_TOKEN_URL` environment variable set to the URL of token endpoint (defaults to `https://iam.cloud.ibm.com`)

#### IBM COS

When using IBM Cloud Object Storage create a service credential with the `Include HMAC Credential` option enabled.

The `access_key_id` and `secret_access_key` from the `cos_hmac_keys` entry in the generated credential are
the ones required to make an AWS credentials file e.g.
```ini
[default]
aws_access_key_id=paste access_key_id here
aws_secret_access_key=paste secret_access_key here
```

#### AWS Configuration

The AWS SDK requires a region to initialize so ensure the config file has one named e.g.
```ini
[default]
region=eu-west-2
```

#### AWS S3

Run the scripts with the `--s3url` option pointing to your S3 instance endpoint.

For IBM COS, corresponding endpoint URLs can be found under the link found in the Service Credentials file or on the IBM Cloud UI.

## Usage

### Backup Scripts

Run a backup script without arguments to receive help e.g.

```bash
node s3-backup-file.js
```

The source database and destination bucket are required options.
The minimum needed to run the backup scripts are thus:

```bash
node s3-backup-stream.js -s 'https://~replaceWithYourUniqueHost~.cloudantnosqldb.appdomain.cloud/sourcedb' -b 'examplebucket'
```

The object created in the bucket for the backup file will be
named according to a prefix (default `couchbackup`), DB name and timestamp e.g.

`couchbackup-sourcedb-2024-01-25T09:45:11.730Z`

### Restore Scripts

Run a restore script without arguments to receive help e.g.

```bash
node s3-restore-stream.js
```

The target database URL, source bucket, and backup object name are required options.
The minimum needed to run the restore scripts are thus:

```bash
node s3-restore-stream.js -t 'https://~replaceWithYourUniqueHost~.cloudantnosqldb.appdomain.cloud/targetdb' -b 'examplebucket' -o 'couchbackup-sourcedb-2024-01-25T09:45:11.730Z' --s3url 's3.eu-de.cloud-object-storage.appdomain.cloud'
```

## Progress and debug

To see detailed progress of the backup/restore and upload/download or additional debug information
use the `DEBUG` environment variable with label `couchbackup-s3` e.g.

```bash
DEBUG='couchbackup-s3' node s3-backup-stream.js -s 'https://~replaceWithYourUniqueHost~.cloudantnosqldb.appdomain.cloud/sourcedb' -b 'couchbackup-example' --s3url "s3.eu-de.cloud-object-storage.appdomain.cloud"
```

```
  couchbackup-s3 Creating a new backup of https://~replaceWithYourUniqueHost~.cloudantnosqldb.appdomain.cloud/sourcedb at couchbackup-example/couchbackup-sourcedb-2025-05-27T13:04:51.321Z... +0ms
  couchbackup-s3 Setting up S3 upload to couchbackup-example/couchbackup-sourcedb-2025-05-27T13:04:51.321Z +686ms
  couchbackup-s3 Starting streaming data from https://~replaceWithYourUniqueHost~.cloudantnosqldb.appdomain.cloud/sourcedb +2ms
  couchbackup-s3 Couchbackup changes batch: 0 +136ms
  couchbackup-s3 Fetched batch: 0 Total document revisions written: 15 Time: 0.067 +34ms
  couchbackup-s3 couchbackup download from https://~replaceWithYourUniqueHost~.cloudantnosqldb.appdomain.cloud/sourcedb complete; backed up 15 +2ms
  couchbackup-s3 S3 upload progress: {"loaded":6879,"total":6879,"part":1,"Key":"couchbackup-sourcedb-2025-05-27T13:04:51.321Z","Bucket":"couchbackup-example"} +623ms
  couchbackup-s3 S3 upload done +1ms
  couchbackup-s3 Upload succeeded +0ms
  couchbackup-s3 done. +0ms
```

For restore operations:

```bash
DEBUG='couchbackup-s3' node s3-restore-stream.js -t 'https://~replaceWithYourUniqueHost~.cloudantnosqldb.appdomain.cloud/targetdb' -b 'couchbackup-example' -o 'couchbackup-sourcedb-2025-05-27T13:04:51.321Z' --s3url "s3.eu-de.cloud-object-storage.appdomain.cloud"
```

```
  couchbackup-s3 Restoring from couchbackup-example/couchbackup-sourcedb-2025-05-27T13:04:51.321Z to https://~replaceWithYourUniqueHost~.cloudantnosqldb.appdomain.cloud/targetdb +0ms
  couchbackup-s3 Object 'couchbackup-sourcedb-2025-05-27T13:04:51.321Z' is accessible +245ms
  couchbackup-s3 Starting direct stream restore from couchbackup-example/couchbackup-sourcedb-2025-05-27T13:04:51.321Z to https://~replaceWithYourUniqueHost~.cloudantnosqldb.appdomain.cloud/targetdb +1ms
  couchbackup-s3 Restored batch: 0 Total document revisions written: 15 Time: 0.089 +156ms
  couchbackup-s3 Couchbackup restore to https://~replaceWithYourUniqueHost~.cloudantnosqldb.appdomain.cloud/targetdb complete; restored 15 documents +2ms
  couchbackup-s3 Restore completed successfully +0ms
```

## Known issues

The S3 SDK does not appear to apply back-pressure to a Node `stream.Readable`. As such in environments
where the upload speed to S3 is significantly slower than either the speed of downloading from the database
or reading the backup file then the scripts may fail.