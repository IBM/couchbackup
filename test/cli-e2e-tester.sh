#!/bin/sh

# Copyright © 2018 IBM Corp. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Runs backup and restore for a series of databases called largedb${DB_SIZE}g.
# If DBCOMPARE tool is configured performs the comparison and adds it to the log.
# Intended use is for running a manual acceptance test.
RUN_DATE_STAMP=`date +%y%m%d%H%M%S`
for DB_SIZE in "$@"
do
  BACKUP_DB=largedb${DB_SIZE}g
  BACKUP_LOG_FILE=${DB_SIZE}g_${RUN_DATE_STAMP}.log
  BACKUP_FILE=${DB_SIZE}g_${RUN_DATE_STAMP}_backup.txt
  RESTORE_DB=restore_${DB_SIZE}g_${RUN_DATE_STAMP}
  REPORT_FILE=report${DB_SIZE}g_${RUN_DATE_STAMP}.log
  node ./bin/couchbackup.bin.js --log ${BACKUP_LOG_FILE} --db ${BACKUP_DB} > ${BACKUP_FILE} 2> ${REPORT_FILE}
  curl -X PUT ${COUCH_URL}/${RESTORE_DB} >> ${REPORT_FILE} 2>&1
  { time cat ${BACKUP_FILE} | node ./bin/couchrestore.bin.js --db ${RESTORE_DB}; } >> ${REPORT_FILE} 2>&1
  if [ -f ./${DBCOMPARE_NAME}-${DBCOMPARE_VERSION}/bin/${DBCOMPARE_NAME} ]
  then
    ./${DBCOMPARE_NAME}-${DBCOMPARE_VERSION}/bin/${DBCOMPARE_NAME} ${COUCH_URL} ${BACKUP_DB} ${COUCH_URL} ${RESTORE_DB} >> ${REPORT_FILE} 2>&1
  else
    echo "DB comparison NOT available, complete backup/restore cycle not validated." >> ${REPORT_FILE}
  fi
  curl -X DELETE ${COUCH_URL}/${RESTORE_DB} >> ${REPORT_FILE} 2>&1
done
