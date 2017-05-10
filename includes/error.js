'use strict';

module.exports = {
  BackupError: class BackupError extends Error {
    constructor(name, message) {
      super(message);
      this.name = name;
    }
  },
  terminationCallback: function terminationCallback(err, data) {
    if (err) {
      process.on('uncaughtException', function(err) {
        var exitCode = {
          'RestoreDatabaseNotFound': 10,
          'NoLogFileName': 20,
          'LogDoesNotExist': 21
        }[err.name] || 1;
        console.error(err.message);
        process.exitCode = exitCode;
      });
      throw err;
    }
  }
};
