# CouchBackup Examples

This folder contains example Node.js scripts which use the `couchbackup` library.

These scripts are for inspiration and demonstration.
They are not a supported part of couchbackup and should not be considered production ready.

See README.md files in the appropriate SDK folders ([cos-s3/README.md](cos-s3/README.md), [cos-sdk/README.md](cos-sdk/README.md)).

## Current examples

### AWS S3 SDK

1. [cos-s3/s3-backup-file.js](cos-s3/s3-backup-file.js) -- backup a database (Cloudant or CouchDB) to an S3-API compatible store using a intermediate file on disk to store the backup before upload.
2. [cos-s3/s3-backup-stream.js](cos-s3/s3-backup-stream.js) -- backup a database (Cloudant or CouchDB) to an S3-API compatible store
    by streaming the backup data directly from CouchDB or Cloudant into an object.

### IBM Cloud Object Store SDK

3. [cos-sdk/cos-backup-file.js](cos-sdk/cos-backup-file.js) -- backup a database (Cloudant) to an IBM Cloud Object Store
    using a intermediate file on disk to store the backup before upload.
4. [cos-sdk/cos-backup-stream.js](cos-sdk/cos-backup-stream.js) -- backup a database (Cloudant) to an IBM Cloud Object Store
    by streaming the backup data directly from Cloudant into an object.