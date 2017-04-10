module.exports = function(url, dbname, buffersize, parallelism, readstream) {
  liner = require('../includes/liner.js'),
  writer = require('../includes/writer.js')(url, dbname, buffersize, parallelism);
   
  // pipe the input to the output, via transformation functions
  readstream.pipe(liner())        // transform the input stream into per-line 
    .pipe(writer) // transform the data
 
  return writer;
};