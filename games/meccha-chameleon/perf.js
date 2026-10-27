/* Pure, testable performance policy shared by browser and desktop builds. */
(function(root){
 'use strict';
 function chooseQuality(gpu,cores){
  if(/swiftshader|llvmpipe|software|uhd|hd graphics|iris|adreno|mali|powervr|apple gpu/i.test(gpu||'')||(cores&&cores<=4))return 'low';
  if(/geforce|radeon rx|intel.*arc/i.test(gpu||''))return 'high';
  return 'medium';
 }
 const originals=new WeakMap(),fast=new WeakMap();
 function fastMaterial(THREE,m){
  if(!m?.isMeshStandardMaterial)return m;
  let lite=fast.get(m);
  if(!lite){
   lite=new THREE.MeshLambertMaterial({color:m.color,map:m.map,emissive:m.emissive,emissiveMap:m.emissiveMap,
    emissiveIntensity:m.emissiveIntensity,transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest,
    side:m.side,vertexColors:m.vertexColors,depthWrite:m.depthWrite,depthTest:m.depthTest,fog:m.fog});
   lite.name=m.name;fast.set(m,lite);
  }
  return lite;
 }
 function applyMapQuality(THREE,group,level){
  let lamps=0;const budget=level==='low'?3:level==='medium'?8:Infinity;
  group.traverse(o=>{
   if(o.isPointLight)o.visible=++lamps<=budget;
   if(!o.isMesh)return;
   if(!originals.has(o))originals.set(o,o.material);
   const original=originals.get(o);
   o.material=level==='low'?(Array.isArray(original)?original.map(m=>fastMaterial(THREE,m)):fastMaterial(THREE,original)):original;
  });
 }
 function releaseMesh(o){
  const original=originals.get(o);if(!original)return;
  // Shared model prototypes retain their cached fast variants across map changes.
  if(!o.userData?.shared)for(const m of Array.isArray(original)?original:[original]){const lite=fast.get(m);if(lite){lite.dispose();fast.delete(m);}}
  o.material=original;originals.delete(o);
 }
 function splitVision(pair,w,h,a,b){
  const row=w*4;
  for(let y=0;y<h;y++) { const offset=y*row*2; a.set(pair.subarray(offset,offset+row),y*row); b.set(pair.subarray(offset+row,offset+row*2),y*row); }
 }
 const api={chooseQuality,applyMapQuality,releaseMesh,splitVision};
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.PeperPerf=api;
})(typeof globalThis!=='undefined'?globalThis:this);
