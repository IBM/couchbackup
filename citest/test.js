/* global describe it */
'use strict';

const fs = require('fs');
const u = require('./citestutils.js');

[{useApi: true}, {useApi: false}].forEach(function(params) {
  describe(u.scenario('Basic backup and restore', params), function() {
    it('should backup animaldb to a file correctly', function(done) {
      // Allow up to 40 s to backup and compare (it should be much faster)!
      u.timeoutFilter(this, 40);
      const actualBackup = `./${this.fileName}`;
      // Create a file and backup to it
      const output = fs.createWriteStream(actualBackup);
      output.on('open', function() {
        u.testBackup(params, 'animaldb', output, function(err) {
          if (err) {
            done(err);
          } else {
            u.readSortAndDeepEqual(actualBackup, './animaldb_expected.json', done);
          }
        });
      });
    });

    it('should restore animaldb to a database correctly', function(done) {
      // Allow up to 60 s to restore and compare (again it should be faster)!
      u.timeoutFilter(this, 60);
      const input = fs.createReadStream('animaldb_expected.json');
      const dbName = this.dbName;
      input.on('open', function() {
        u.testRestore(params, input, dbName, function(err) {
          if (err) {
            done(err);
          } else {
            u.dbCompare('animaldb', dbName, done);
          }
        });
      });
    });

    it('should execute a shallow mode backup successfully', function(done) {
      // Allow 30 s
      u.timeoutFilter(this, 30);
      const actualBackup = `./${this.fileName}`;
      const output = fs.createWriteStream(actualBackup);
      // Add the shallow mode option
      const p = u.p(params, {opts: {mode: 'shallow'}});
      output.on('open', function() {
        u.testBackup(p, 'animaldb', output, function(err) {
          if (err) {
            done(err);
          } else {
            u.readSortAndDeepEqual(actualBackup, './animaldb_expected_shallow.json', done);
          }
        });
      });
    });
  });

  describe(u.scenario('End to end backup and restore', params), function() {
    it('should backup and restore animaldb', function(done) {
      // Allow up to 60 s for backup and restore of animaldb
      u.timeoutFilter(this, 60);
      u.testDirectBackupAndRestore(params, 'animaldb', this.dbName, done);
    });
    it('should backup and restore largedb1g', function(done) {
      // Allow up to 10 m for backup and restore of largedb1g
      u.timeoutFilter(this, 10 * 60);
      u.testDirectBackupAndRestore(params, 'largedb1g', this.dbName, done);
    });
  });
});
