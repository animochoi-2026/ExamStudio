// Artificial files only. No production database rows or source payloads.
export function fixtures(run){
 const content=`BT /F1 12 Tf 30 80 Td (R2 synthetic ${run}) Tj ET`;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 480 120] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`];
 let pdf='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return [{name:'tiny.pdf',body:Buffer.from(pdf),type:'application/pdf'},{name:'tiny.svg',body:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="40"><rect width="480" height="40" fill="white"/><text x="4" y="24">R2 test ${run}</text></svg>`),type:'image/svg+xml'}];
}
