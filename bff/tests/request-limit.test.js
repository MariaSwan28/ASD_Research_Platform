import {test} from 'node:test'
import assert from 'node:assert/strict'
import {requestLimit} from '../middleware/requestLimit.js'
test('auth request limit rejects repeated attempts and isolates IP buckets',()=>{
 const limit=requestLimit({max:2,windowMs:60000});let next=0,code=null,retry=null
 const res={setHeader:(key,value)=>{retry=value},status:n=>{code=n;return res},json:()=>{}}
 for(let i=0;i<3;i++)limit({ip:'one'},res,()=>next++)
 assert.equal(next,2);assert.equal(code,429);assert.ok(retry>0)
 limit({ip:'two'},res,()=>next++);assert.equal(next,3)
})
