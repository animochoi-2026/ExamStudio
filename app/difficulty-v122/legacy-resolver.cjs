'use strict';
const version='legacy-reference-resolver-v1';
const nfc=s=>String(s).normalize('NFC');
const space=s=>nfc(s).replace(/\s+/g,' ').trim();
// Lexical notation equivalence only. No word substitution, similarity, Sol,
// selected score, or synthetic completion of truncated mathematical expressions.
const notation=s=>nfc(s)
 .replace(/\\\\(?=[A-Za-z])/g,'\\').replace(/\$\$?|\u201c|\u201d/g,'')
 .replace(/\\[()[\]]/g,'').replace(/\\(?:left|right)(?=[()[\]{}|])/g,'')
 .replace(/\\(?:,|;|!|quad|qquad| )/g,'')
 .replace(/\\angle\b/g,'∠').replace(/\\triangle\b/g,'△')
 .replace(/\\(?:cong|equiv)\b/g,'≅').replace(/≡/g,'≅')
 .replace(/\\perp\b/g,'⊥').replace(/\\parallel\b/g,'∥')
 .replace(/\\times\b/g,'×').replace(/\\circ\b/g,'°')
 .replace(/\^\{°\}|\^°/g,'°').replace(/\s+/g,'').trim();
function resolve(quote,entries,{label}={}){
 if(typeof quote!=='string'||!quote.trim())return {status:'legacy_reference_unresolved',mapping_method:'empty',candidate_count:0,matched_id:null};
 for(const [name,fn]of [['NFC',nfc],['whitespace',space],['latex_notation',notation]]){
  const candidates=entries.filter(e=>fn(e.text)===fn(quote));
  if(candidates.length)return finish(name,candidates);
 }
 const q=notation(quote);
 const candidates=q.length>=2?entries.filter(e=>notation(e.text).includes(q)):[];
 if(candidates.length)return finish('unique_containment',candidates);
 // The label must already occur in the quote, and the full labeled target
 // must be lexically equal. A label alone never licenses a paraphrase.
 if(label){
  const candidates=entries.filter(e=>e.label===label&&notation(e.text).replace(notation(label),'')===q.replace(notation(label),''));
  if(candidates.length)return finish('unique_label_and_span',candidates);
 }
 return finish('no_unique_lexical_span',[]);
}
function finish(method,entries){return {status:entries.length===1?'resolved':'legacy_reference_unresolved',mapping_method:method,candidate_count:entries.length,matched_id:entries.length===1?entries[0].id:null,candidate_ids:entries.map(e=>e.id)};}
module.exports={version,nfc,space,notation,resolve};
