'use strict';
function assertLiveTransportAllowed(){
 if(process.env.EXAMSTUDIO_OFFLINE_TEST==='1'||process.env.NODE_TEST_CONTEXT||process.argv.some(x=>/\.test\.[cm]?js$/.test(x)))
  throw Object.assign(Error('Real difficulty transport is disabled in tests; inject a mock runtime.'),{
   code:'ERR_TEST_EXTERNAL_IO_BLOCKED',testIsolation:true});
}
module.exports={assertLiveTransportAllowed};
