'use strict';
const fs=require('node:fs'),path=require('node:path');
// Ship only the interpreter, standard library and the four export dependencies.
// Never copy Scripts, user site-packages, credentials or the developer environment.
function bundlePython(source,target){
 source=fs.realpathSync(source);target=path.resolve(target);
 if(target===source||source.startsWith(target+path.sep))throw Error('Runtime destination must be separate.');
 if(fs.existsSync(target))throw Error('Runtime destination already exists.');
 for(const file of ['python.exe','python312.dll','Lib/encodings/__init__.py'])if(!fs.existsSync(path.join(source,file)))throw Error('Python 3.12 runtime missing: '+file);
 fs.mkdirSync(target,{recursive:true});
 const copy=(from,to)=>fs.cpSync(from,to,{recursive:true,filter:f=>!f.split(path.sep).some(n=>n==='__pycache__'||n==='test'||n==='tests')&&!/\.pyc$/i.test(f)});
 for(const name of fs.readdirSync(source))if(/^(python(?:w)?\.exe|python\d*\.dll|vcruntime[^/]*\.dll|LICENSE\.txt)$/.test(name))copy(path.join(source,name),path.join(target,name));
 copy(path.join(source,'DLLs'),path.join(target,'DLLs'));
 fs.mkdirSync(path.join(target,'Lib'));
 for(const name of fs.readdirSync(path.join(source,'Lib')))if(name!=='site-packages')copy(path.join(source,'Lib',name),path.join(target,'Lib',name));
 const site=path.join(source,'Lib','site-packages'),out=path.join(target,'Lib','site-packages');fs.mkdirSync(out);
 for(const name of fs.readdirSync(site))if(/^(docx|lxml|PIL|typing_extensions\.py|(?:python_docx|lxml|pillow|typing_extensions)-[^/]+\.dist-info)$/.test(name))copy(path.join(site,name),path.join(out,name));
 for(const name of ['docx','lxml','PIL','typing_extensions.py'])if(!fs.existsSync(path.join(out,name)))throw Error('Export dependency missing: '+name);
 // Isolate imports from PYTHONPATH and the recipient's user site-packages.
 fs.writeFileSync(path.join(target,'python312._pth'),'.\nDLLs\nLib\nLib/site-packages\n../../resources/app/scripts\nimport site\n');
 return target;
}
module.exports={bundlePython};
