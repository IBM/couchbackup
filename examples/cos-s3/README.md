# CouchBackup AWS S3 Examples

This folder contains example Node.js scripts which use the `couchbackup` library and the AWS S3 SDK.

These scripts are for inspiration and demonstration.
They are not a supported part of couchbackup and should not be considered production ready.


#### Prerequisites

##### Install the dependencies

Use `npm install` in this folder to install the script
dependencies.
Note: this uses the latest release of couchbackup, not the
checked out version.

##### AWS SDK configuration

The scripts expect AWS ini files:
* shared credentials file `~/.aws/credentials` or target file from `AWS_SHARED_CREDENTIALS_FILE` environment variable
* shared configuration file `~/.aws/config` or target file from `AWS_CONFIG_FILE` environment variable

###### IBM COS

When using IBM Cloud Object Storage create a service credential with the `Include HMAC Credential` option enabled.
The `access_key_id` and `secret_access_key` from the `cos_hmac_keys` entry in the generated credential are
the ones required to make an AWS credentials file e.g.
```ini
[default]
aws_access_key_id=paste access_key_id here
aws_secret_access_key=paste secret_access_key here
```

Run the scripts with the `--s3url` option pointing to your COS instance s3 endpoint.
The AWS SDK requires a region to initialize so ensure the config file has one named e.g.
```ini
[default]
region=eu-west-2
```

#### Usage

Run a script without arguments to receive help e.g.

`node s3-backup-file.js`

The source database and destination bucket are required options.
The minimum needed to run the scripts are thus:

`node s3-backup-stream.js -s 'https://dbser:dbpass@host.example/exampledb' -b 'examplebucket'`

The object created in the bucket for the backup file will be
named according to a prefix (default `couchbackup`), DB name and timestamp e.g.

`couchbackup-exampledb-2024-01-25T09:45:11.730Z`

#### Progress and debug

To see detailed progress of the backup and upload or additional debug information
use the `DEBUG` environment variable with label `s3-backup` e.g.

`DEBUG='s3-backup' node s3-backup-stream.js -s 'https://dbser:dbpass@host.example/exampledb' -b 'couchbackup' --s3url 'https://s3.eu-gb.cloud-object-storage.appdomain.cloud'`

```
  s3-backup Creating a new backup of https://host.example/exampledb at couchbackup/couchbackup-exampledb-2024-01-25T09:45:11.730Z... +0ms
  s3-backup Setting up S3 upload to couchbackup/couchbackup-exampledb-2024-01-25T09:45:11.730Z +686ms
  s3-backup Starting streaming data from https://host.example/exampledb +2ms
  s3-backup Couchbackup changes batch:  0 +136ms
  s3-backup Fetched batch: 0 Total document revisions written: 15 Time: 0.067 +34ms
  s3-backup couchbackup download from https://host.example/exampledb complete; backed up 15 +2ms
  s3-backup S3 upload progress: {"loaded":6879,"total":6879,"part":1,"Key":"couchbackup-exampledb-2024-01-25T09:45:11.730Z","Bucket":"couchbackup"} +623ms
  s3-backup S3 upload done +1ms
  s3-backup Upload succeeded +0ms
  s3-backup done. +0ms
```

#### Known issues

The S3 SDK does not appear to apply back-pressure to a Node `stream.Readable`. As such in environments
where the upload speed to S3 is significantly slower than either the speed of downloading from the database
or reading the backup file then the scripts may fail.
