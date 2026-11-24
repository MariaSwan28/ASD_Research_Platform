import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

test('admin manages accounts and existing children but cannot use parent workspace or create children', async () => {
 const temp=await fs.mkdtemp(path.resolve('.admin-scope-test-'))
 Object.assign(process.env,{DB_PATH:path.join(temp,'db.sqlite'),FILE_PATH:path.join(temp,'files'),DATASET_DIR:path.join(temp,'dataset'),JWT_ACCESS_SECRET:'admin-scope-access-test-secret-1234567890'})
 const {default:express}=await import('express'),{default:jwt}=await import('jsonwebtoken')
 const {default:db}=await import('../DB/database.js'),{default:User}=await import('../models/User.js'),{default:Child}=await import('../models/ChildProfile.js'),{default:File}=await import('../models/File.js')
 const app=express();app.use(express.json())
 for(const [route,name] of [['children','child'],['files','file'],['ml','ml'],['video','video'],['admin','admin'],['auth','auth']])app.use('/api/'+route,(await import(`../routes/${name}.routes.js`)).router)
 app.use((e,req,res,next)=>res.status(e.status||500).json({message:e.message}))
 await db.sync()
 const admin=await User.create({email:'admin@test.invalid',password:'unused',role:'admin'})
 const parent=await User.create({email:'parent@test.invalid',password:'unused',role:'parent'})
 const legacy=await Child.create({ownerId:admin._id,fullName:'Legacy owned child',name:'Legacy'})
 const file=await File.create({user:admin._id,name:'legacy.txt',type:'txt',childProfileId:legacy._id})
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r))
 const call=(route,user=admin,method='GET',data)=>fetch(`http://127.0.0.1:${server.address().port}`+route,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt.sign({id:user._id},process.env.JWT_ACCESS_SECRET)},body:data===undefined?undefined:JSON.stringify(data)})
 try {
  for(const [route,method='GET',data] of [
   ['/api/children'],[`/api/children/${legacy._id}`],['/api/children','POST',{fullName:'Blocked child'}],
   [`/api/children/${legacy._id}`,'PATCH',{fullName:'Blocked edit'}],[`/api/children/${legacy._id}`,'DELETE'],
   ['/api/admin/children','POST',{fullName:'Blocked administrative creation',ownerId:parent._id}],
   ['/api/files'],[`/api/files/download?id=${file._id}`],['/api/files/upload/init','POST',{fileName:'blocked.txt',fileSize:1,totalChunks:1}],
   ['/api/ml/capabilities'],['/api/ml/analyze','POST',{fileId:file._id,modelId:'parent-story-nb'}],
   [`/api/ml/analyses/${file._id}`],['/api/ml/analyses/run/artifacts/report'],
   [`/api/video/stream/${file._id}/${admin._id}`],[`/api/video/metadata/${file._id}`]
  ])assert.equal((await call(route,admin,method,data)).status,403,route)
  assert.equal(await Child.count(),1)
  assert.equal((await call('/api/children',parent,'POST',{fullName:'Parent creates child'})).status,201)
  assert.equal((await call('/api/admin/children')).status,200)
  assert.equal((await call(`/api/admin/children/${legacy._id}`,admin,'PATCH',{fullName:'Administrative edit'})).status,200)
  assert.equal((await call('/api/admin/users')).status,200)
  // Profile settings and avatar configuration are not a material workspace.
  assert.equal((await call('/api/auth/profile',admin,'PATCH',{fullName:'Администратор Платформы'})).status,200)
  assert.equal((await call('/api/files/avatar',admin,'POST',{})).status,400)
 } finally {await new Promise(r=>server.close(r));await db.close();await fs.rm(temp,{recursive:true,force:true})}
})
