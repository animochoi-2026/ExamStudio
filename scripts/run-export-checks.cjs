'use strict';
try {const result=require('./export-engine.cjs').releaseGate();console.log('Export contract passed:',result.engineId);}
catch(error){console.error(error.message);process.exitCode=1;}
