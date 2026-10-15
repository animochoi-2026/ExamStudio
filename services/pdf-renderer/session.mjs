// Chromium can expire between connect and context creation. Recover only before
// rendering starts; never replay a render whose outcome is unknown.
export async function openRenderSession(puppeteer,binding,storage){
 const id=await storage.get('sessionId');let browser;
 if(id){
  try{browser=await puppeteer.connect(binding,id);return {browser,context:await browser.createBrowserContext()};}
  catch{await releaseRenderSession({browser},storage);await storage.delete('sessionId');}
 }
 browser=await puppeteer.launch(binding,{keep_alive:60000});
 try{const context=await browser.createBrowserContext();await storage.put('sessionId',browser.sessionId());return {browser,context};}
 catch(error){await releaseRenderSession({browser},storage);await storage.delete('sessionId');throw error;}
}

export async function releaseRenderSession({context,browser},storage){
 // Cleanup must neither turn a validated PDF into HTTP 500 nor mask the actual
 // render error. Discard a damaged session so the next request starts cleanly.
 let failed=false;
 try{await context?.close();}catch{failed=true;}
 try{await browser?.disconnect();}catch{failed=true;}
 if(failed)await storage.delete('sessionId').catch(()=>{});
}
