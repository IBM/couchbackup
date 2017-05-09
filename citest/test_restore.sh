#!/bin/bash

# database names
COUCH_DB=animaldb
COUCH_DB_RESTORE=animaldb_restore_${RANDOM}

# create new database
curl -XPUT ${COUCH_URL}/${COUCH_DB_RESTORE}

# restore backup
cat animaldb_expected.backup | ../bin/couchrestore.bin.js --db ${COUCH_DB_RESTORE}

# compare dbs
./${DBCOMPARE_NAME}-${DBCOMPARE_VERSION}/bin/${DBCOMPARE_NAME} ${COUCH_URL} ${COUCH_DB} ${COUCH_URL} ${COUCH_DB_RESTORE}

# drop restore database
curl -XDELETE ${COUCH_URL}/${COUCH_DB_RESTORE}
