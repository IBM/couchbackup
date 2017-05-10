/* global describe it */
'use strict';

const assert = require('assert');
const spawnSync = require('child_process').spawnSync;

describe('backup', function() {
  this.timeout(60 * 1000);
  describe('restore', function() {
    it('should restore animaldb from a backup correctly', function() {
      const backup = spawnSync('./test_backup.sh');
      // returns 0 for success
      if (backup.status !== 0) {
        console.log('stdout was: ' + backup.stdout);
        console.log('stderr was: ' + backup.stderr);
      }
      assert.equal(0, backup.status);
    });
    it('should backup animaldb to a database correctly', function() {
      const restore = spawnSync('./test_restore.sh');
      // returns 0 for success
      if (restore.status !== 0) {
        console.log('stdout was: ' + restore.stdout);
        console.log('stderr was: ' + restore.stderr);
      }
      assert.equal(0, restore.status);
    });
  });
});
