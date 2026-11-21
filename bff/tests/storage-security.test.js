import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

test('storage validates chunks, quota, migration and private run artifacts', async () => {
 const temp=await fs.mkdtemp(path.resolve('.storage-test-'))
 process.env.DB_PATH=path.join(temp,'test.sqlite');process.env.FILE_PATH=path.join(temp,'files')
 process.env.DATASET_DIR=path.join(temp,'dataset');process.env.JWT_ACCESS_SECRET='test-secret'
 const {default:express}=await import('express'),{default:upload}=await import('express-fileupload'),{default:jwt}=await import('jsonwebtoken')
 const {default:db}=await import('../DB/database.js'),{default:User}=await import('../models/User.js')
 const {File}=await import('../models/index.js'),{default:Records}=await import('../models/UnifiedAnalysisResult.js')
 const {router}=await import('../routes/file.routes.js'),{router:ml}=await import('../routes/ml.routes.js')
 const {migrateStorage}=await import('../services/storageMigration.js')
 const app=express();app.use(express.json());app.use(upload());app.use('/api/files',router);app.use('/api/ml',ml)
 app.use((error,req,res,next)=>res.status(error.status||500).json({message:error.message}))
 await db.sync();const owner=await User.create({email:'owner@test.invalid',password:'unused'}),other=await User.create({email:'other@test.invalid',password:'unused'})
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve))
 const base=`http://127.0.0.1:${server.address().port}`
 const request=(route,body,user=owner._id)=>fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+jwt.sign({id:user},process.env.JWT_ACCESS_SECRET),...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined})
 const part=(id,index,size)=>{const form=new FormData();form.append('uploadId',id);form.append('chunkIndex',String(index));form.append('chunk',new Blob([Buffer.alloc(size,65)]),'part');return form}
 try{
  assert.equal((await request('/api/files/upload/init',{fileName:'../bad.txt',fileSize:3,totalChunks:1})).status,400)
  assert.equal((await request('/api/files/upload/init',{fileName:'bad.txt',fileSize:-1,totalChunks:1})).status,400)
  let response=await request('/api/files/upload/init',{fileName:'sample.txt',fileSize:524291,totalChunks:2,tags:['test']});assert.equal(response.status,200)
  const {uploadId}=await response.json()
  assert.equal((await request('/api/files/upload/chunk',part(uploadId,'../x',3))).status,400)
  assert.equal((await request('/api/files/upload/chunk',part(uploadId,0,524288),other._id)).status,404)
  assert.equal((await request('/api/files/upload/chunk',part(uploadId,2,3))).status,400)
  assert.equal((await request('/api/files/upload/chunk',part(uploadId,1,2))).status,400)
  assert.equal((await request('/api/files/upload/chunk',part(uploadId,0,524288))).status,200)
  response=await request('/api/files/upload/chunk',part(uploadId,0,524288));assert.equal((await response.json()).uploaded,1)
  assert.equal((await request('/api/files/upload/complete',{uploadId})).status,400)
  assert.equal((await request('/api/files/upload/chunk',part(uploadId,1,3))).status,200)
  response=await request('/api/files/upload/complete',{uploadId});assert.equal(response.status,200)
  const file=await response.json();assert.equal(file.size,524291);assert.equal(file.mimeType,'text/plain');assert.equal(file.materialCategory,'text')
  assert.equal((await fs.stat(path.join(process.env.FILE_PATH,owner._id,file.path))).size,524291)
  assert.equal((await (await File.findByPk(file._id)).getTags())[0].name,'test')
  await owner.reload();assert.equal(owner.usedSpace,524291)
  assert.equal((await request('/api/files/upload/complete',{uploadId})).status,404)
  response=await request('/api/files/upload/init',{fileName:'quota.txt',fileSize:3,totalChunks:1});const id=(await response.json()).uploadId
  await request('/api/files/upload/chunk',part(id,0,3));owner.diskSpace=owner.usedSpace;await owner.save()
  assert.equal((await request('/api/files/upload/complete',{uploadId:id})).status,400)
  await owner.reload();assert.equal(owner.usedSpace,524291)
  await db.getQueryInterface().removeColumn('Files','mimeType');await db.getQueryInterface().removeColumn('Files','materialCategory')
  await migrateStorage(db);const reloaded=await File.findByPk(file._id);assert.equal(reloaded.mimeType,'text/plain');assert.equal(reloaded.name,'sample.txt')
  const run=randomUUID(),directory=path.join(process.env.DATASET_DIR,owner._id,'runs',run)
  await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'report.json'),'{}')
  await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify({report:{path:'report.json',media_type:'application/json'}}))
  await Records.create({id:run,ownerId:owner._id,fileId:file._id,modelId:'test',modelVersion:'1',status:'completed',resultJson:JSON.stringify({artifacts:[{id:'report',label:'Report',media_type:'application/json'}]})})
  assert.equal((await request(`/api/ml/analyses/${run}/artifacts/report`)).status,200)
  assert.equal((await request(`/api/ml/analyses/${run}/artifacts/report`,undefined,other._id)).status,404)
  await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify({report:{path:'../../../../outside.json'}}))
  await fs.writeFile(path.join(temp,'outside.json'),'private')
  assert.equal((await request(`/api/ml/analyses/${run}/artifacts/report`)).status,404)
 }finally{await new Promise(resolve=>server.close(resolve));await db.close();await fs.rm(temp,{recursive:true,force:true})}
})
