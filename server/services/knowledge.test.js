import test from 'node:test';
import assert from 'node:assert/strict';
import {chunkText} from './knowledge.js';
import {buildObjectKey} from '../storage/objectStorage.js';

test('knowledge chunking respects maximum chunk count',()=>{
  const text='Bearing lubrication interval and mounting guidance. '.repeat(500);
  const chunks=chunkText(text,{size:300,overlap:40,maxChunks:5,maxChars:50000});
  assert.equal(chunks.length,5);
  assert.equal(chunks[0].index,0);
  assert.ok(chunks.every(x=>x.text.length>0));
});

test('object key is deterministic for identical binary content',()=>{
  const file={originalname:'SKF Bearing Manual.pdf',buffer:Buffer.from('same document')};
  const meta={department_code:'3102_CH2',equipment:'WRM',document_type:'Manual'};
  const a=buildObjectKey(file,meta),b=buildObjectKey(file,meta);
  assert.equal(a,b);
  assert.match(a,/3102_CH2\/WRM\/Manual\/\d{4}-\d{2}-\d{2}\/[a-f0-9]{16}-SKF-Bearing-Manual\.pdf$/);
});
