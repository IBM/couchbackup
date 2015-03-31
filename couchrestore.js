var config = require('./includes/config.js');
  rs = process.stdin,
  liner = require('./includes/liner.js'),
  writer = require('./includes/writer.js');

   
// pipe the input to the output, via transformation functions
rs.pipe(liner)        // transform the input stream into per-line 
  .pipe(writer) // transform the data
