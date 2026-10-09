'use strict';
const fs=require('node:fs');
// libvips' filename writer rejects some Windows paths beyond MAX_PATH.
// Encode in memory, then use Node's Unicode/long-path capable filesystem API.
async function writePng(image,target){await fs.promises.writeFile(target,await image.png().toBuffer());}
module.exports={writePng};
