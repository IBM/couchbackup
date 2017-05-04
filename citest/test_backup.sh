#!/bin/bash

# sort the backup array by _id and then _rev because the order isn't
# deterministic but array ordering matters for json comparisons

../bin/couchbackup.bin.js --db animaldb | jq 'sort_by(._id, ._rev)' > animaldb_actual.backup

# now we can compare the expected against the actual backup - exit
# code will be non-zero if the comparison fails (note we can't use the
# --exit-status flag because this requires a newer version of jq which
# is not available everywhere)

cat animaldb_expected.backup | jq 'sort_by(._id, ._rev)' > animaldb_expected_sorted.backup

jq --slurp '.[0] == .[1]' animaldb_expected_sorted.backup animaldb_actual.backup | grep true
