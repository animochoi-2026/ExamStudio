'use strict';
// The deployed web renderer and desktop editor have distinct geometry adapters.
// Shared exam selection, layout and math contracts remain in app/ and scripts/.
const fs=require('node:fs'),path=require('node:path');
function plugin(root=path.resolve(__dirname,'..')){return{name:'web-platform-rendering',setup(build){
 build.onLoad({filter:/[\\/]app[\\/](geometry\.cjs|diagram-layout\.js)$/},args=>({contents:fs.readFileSync(path.join(root,'web-bank/rendering',path.basename(args.path)),'utf8'),loader:'js',resolveDir:path.dirname(args.path)}));
}};}
module.exports={plugin};
