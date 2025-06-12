# CouchBackup IBM COS Examples

This folder contains example Node.js scripts which use the `couchbackup` library and the IBM COS SDK.

These scripts are for inspiration and demonstration.
They are not a supported part of couchbackup and should not be considered production ready.

## Prerequisites

### Install the dependencies

Use `npm install` in this folder to install the script
dependencies.
Note: this uses the latest release of couchbackup, not the
checked out version.

### IBM COS SDK configuration

The scripts expect the following values:
* shared credentials file `~/.bluemix/cos_credentials` or target file from `COS_CREDENTIALS_FILE` environment variable
* `CLOUDANT_IAM_API_KEY` environment variable set to API key with permission to the Cloudant instance
* (optional) `CLOUDANT_IAM_TOKEN_URL` environment variable set to the URL of token endpoint (defaults to `https://iam.cloud.ibm.com`)

#### IBM COS

When using IBM Cloud Object Storage create a service credential with __disabled__ `Include HMAC Credential` option.

Copy the credentials into `~/.bluemix/cos_credentials` or generate it using the `ibmcloud` CLI tool:
```bash
ibmcloud resource service-key-create <credentials-name> --instance-name <cos-instance-name>

ibmcloud resource service-key <credentials-name> --output JSON | jq '.[].credentials' > ~/.bluemix/cos_credentials
```
More info on generating the credentials:
https://cloud.ibm.com/docs/cloud-object-storage?topic=cloud-object-storage-service-credentials

#### Service Credentials file structure:
```json
{
    "apikey": "<API_KEY>",
    "endpoints": "https://control.cloud-object-storage.cloud.ibm.com/v2/endpoints",
    "iam_apikey_description": "Auto-generated for key crn:v1:...f9d5b",
    "iam_apikey_id": "ApiKey-6f...b1",
    "iam_apikey_name": "<NAME>",
    "iam_role_crn": "...Writer",
    "iam_serviceid_crn": "crn:v1:...",
    "resource_instance_id": "crn:v1:..."
}
```

#### IBM COS

Run the scripts with the `--cos_url` option pointing to your COS instance S3 endpoint.

Corresponding endpoint URLs can be found under the link found in the Service Credentials file or on the IBM Cloud UI (`endpoints` field).

## Usage

### Backup Scripts

Run a backup script without arguments to receive help e.g.

```bash 
node cos-backup-file.js
```

The source database and destination bucket are required options.
The minimum needed to run the backup scripts are thus:

```bash
node cos-backup-file.js -s 'https://~replaceWithYourUniqueHost~.cloudantnosqldb.appdomain.cloud/exampledb' -b 'examplebucket' --cos_url 's3.eu-de.cloud-object-storage.appdomain.cloud'
```

The object created in the bucket for the backup file will be
named according to a prefix (default `couchbackup`), DB name and timestamp e.g.

`couchbackup-exampledb-2024-01-25T09:45:11.730Z`

### Restore Scripts

Run a restore script without arguments to receive help e.g.

```bash
node cos-restore-file.js
```

The target database URL, source bucket, and backup object name are required options.
The minimum needed to run the restore scripts are thus:

```bash
node cos-restore-file.js -t 'https://~replaceWithYourUniqueHost~.cloudantnosqldb.appdomain.cloud/newdb' -b 'examplebucket' -o 'couchbackup-exampledb-2024-01-25T09:45:11.730Z' --cos_url 's3.eu-de.cloud-object-storage.appdomain.cloud'
```

## Progress and debug

To see detailed progress of the backup/restore and upload/download or additional debug information
use the `DEBUG` environment variable with label `couchbackup-cos` e.g.

```bash
DEBUG='couchbackup-cos' node cos-backup-file.js -s 'https://~replaceWithYourUniqueHost~.cloudantnosqldb.appdomain.cloud/exampledb' -b 'couchbackup-example' --cos_url "s3.eu-de.cloud-object-storage.appdomain.cloud"
```

```
  couchbackup-cos Creating a new backup of https://~replaceWithYourUniqueHost~.cloudantnosqldb.appdomain.cloud/exampledb at couchbackup-example/couchbackup-exampledb-2025-05-27T13:04:51.321Z... +0ms
  couchbackup-cos couchbackup to file done; uploading to IBM COS S3 +2s
  couchbackup-cos Uploading from /var/folders/lf/0mhmct8912qbgxq_hyv8nr9m0000gn/T/tmp-6623-dC9cBol6Y2Qj to couchbackup-example/couchbackup-exampledb-2025-05-27T13:04:51.321Z +0ms
  couchbackup-cos IBM COS S3 upload done +611ms
  couchbackup-cos Upload succeeded +0ms
  couchbackup-cos {
  couchbackup-cos   ETag: '"937f4ad657897f7cf883bdad0a6dfb76"',
  couchbackup-cos   Location: 'https://couchbackup-example.s3.eu-de.cloud-object-storage.appdomain.cloud/couchbackup-exampledb-2025-05-27T13%3A04%3A51.321Z',
  couchbackup-cos   key: 'couchbackup-exampledb-2025-05-27T13:04:51.321Z',
  couchbackup-cos   Key: 'couchbackup-exampledb-2025-05-27T13:04:51.321Z',
  couchbackup-cos   Bucket: 'couchbackup-example'
  couchbackup-cos } +0ms
  couchbackup-cos Backup successful! +2ms
  couchbackup-cos done. +1ms
```