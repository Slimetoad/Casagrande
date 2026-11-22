import test from 'node:test';
import assert from 'node:assert/strict';
import {programs} from '../src/catalog.js';
import {editorialSeeds} from '../src/editorial-seeds.js';
const normalize=s=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
test('cada programa tiene una propuesta original con estructura y fuente institucional',()=>{
 assert.equal(programs.length,34);
 assert.deepEqual(Object.keys(editorialSeeds).sort(),programs.map(p=>p.slug).sort());
 for(const p of programs){
  const s=editorialSeeds[p.slug];
  assert.ok(['programa','requisitos','inversion','comparacion','aplicacion'].includes(s.intent),p.slug);
  for(const field of ['cluster','title','searchQuestion','angle'])assert.ok(typeof s[field]==='string' && s[field].trim().length>=(field==='cluster'?4:12),`${p.slug}:${field}`);
  assert.ok(Array.isArray(s.points)&&s.points.length>=3&&s.points.length<=5,p.slug);
  for(const point of s.points)assert.ok(typeof point==='string'&&point.trim().length>=50,p.slug);
  const url=new URL(p.url);assert.equal(url.protocol,'https:');assert.ok(url.hostname==='casagrande.edu.ec'||url.hostname.endsWith('.casagrande.edu.ec'),p.slug);
 }
 for(const field of ['title','searchQuestion']){
  const items=Object.values(editorialSeeds).map(s=>normalize(s[field]));assert.equal(new Set(items).size,items.length,field);
 }
});
