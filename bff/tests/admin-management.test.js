import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

test('admin CRUD, separate business accounts, deletion revokes access and preserves material history', async () => {
 const temp=await fs.mkdtemp(path.resolve('.admin-test-'))
 Object.assign(process.env,{DB_PATH:path.join(temp,'db.sqlite'),FILE_PATH:path.join(temp,'files'),DATASET_DIR:path.join(temp,'dataset'),JWT_ACCESS_SECRET:'admin-test-access-secret-1234567890',JWT_REFRESH_SECRET:'admin-test-refresh-secret-1234567890'})
 await fs.mkdir(process.env.FILE_PATH,{recursive:true})
 const {default:express}=await import('express'),{default:jwt}=await import('jsonwebtoken'),{default:cookieParser}=await import('cookie-parser')
 const {default:db}=await import('../DB/database.js'),{default:User}=await import('../models/User.js'),{default:Child}=await import('../models/ChildProfile.js'),{default:Links}=await import('../models/ChildSpecialist.js'),{default:File}=await import('../models/File.js')
 const {Token}=await import('../models/Token.js'),{default:Records}=await import('../models/AnalysisRecord.js'),{default:Unified}=await import('../models/UnifiedAnalysisResult.js'),{default:Text}=await import('../models/TextAnalysisResult.js')
 const {migrateAdministration}=await import('../services/adminMigration.js')
 const {router:admin}=await import('../routes/admin.routes.js'),{router:children}=await import('../routes/child.routes.js'),{router:auth}=await import('../routes/auth.routes.js')
 await db.sync()
 const original=await User.create({email:'existing@test.invalid',password:'existing-hash',role:'parent',fullName:'Существующий Родитель'})
 await db.query('PRAGMA foreign_keys = OFF');await db.getQueryInterface().removeColumn('Users','deletedAt');await db.query('PRAGMA foreign_keys = ON')
 await migrateAdministration(db);await migrateAdministration(db);await original.reload()
 assert.equal(original.deletedAt,null);assert.equal(original.password,'existing-hash');assert.equal(original.fullName,'Существующий Родитель')
 const administrator=await User.create({email:'admin@test.invalid',password:'unused',role:'admin'})
 const app=express();app.use(express.json());app.use(cookieParser());app.use('/api/admin',admin);app.use('/api/children',children);app.use('/api/auth',auth)
 app.use((e,req,res,next)=>res.status(e.status||500).json({message:e.message}))
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r))
 const base=`http://127.0.0.1:${server.address().port}`
 const token=u=>jwt.sign({id:u._id},process.env.JWT_ACCESS_SECRET)
 const call=(url,user=administrator,method='GET',data,headers={})=>fetch(base+url,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+token(user)}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data)})
 const json=async(url,user,method,data,status=200)=>{const r=await call(url,user,method,data);const body=await r.json();assert.equal(r.status,status,JSON.stringify({url,body}));return body}
 try {
  const parentData=await json('/api/admin/users',administrator,'POST',{fullName:'Петрова Анна Сергеевна',email:'parent@test.invalid',password:'password123',role:'parent'},201)
  const specialistData=await json('/api/admin/users',administrator,'POST',{fullName:'Иванов Иван Иванович',email:'spec@test.invalid',password:'password123',role:'specialist'},201)
  const parent=await User.findByPk(parentData.id),specialist=await User.findByPk(specialistData.id)
  let users=await json('/api/admin/users',administrator)
  assert.ok(users.every(user=>user.role!=='admin'&&!('password' in user)))
  assert.ok(users.some(user=>user.role==='parent'));assert.ok(users.some(user=>user.role==='specialist'))
  for (const u of [parent,specialist]) for (const [url,method,data] of [
   ['/api/admin/users','POST',{fullName:'Запрещено',email:'x@test.invalid',password:'password123',role:'specialist'}],
   [`/api/admin/users/${original._id}`,'PATCH',{fullName:'Чужое'}], [`/api/admin/users/${original._id}`,'DELETE'],
   ['/api/admin/children','POST',{fullName:'Чужой Ребёнок',ownerId:parent._id}],
   ['/api/admin/children/missing','PATCH',{fullName:'Чужой Ребёнок'}], ['/api/admin/children/missing','DELETE']
  ]) assert.equal((await call(url,u,method,data)).status,403)
  const login=await json('/api/auth/login',null,'POST',{email:specialist.email,password:'password123'})
  const password=specialist.password
  const edited=await json(`/api/admin/users/${specialist._id}`,administrator,'PATCH',{fullName:'Иванов Иван Петрович',email:'new-spec@test.invalid',role:'admin',password:'ignored-password'})
  assert.equal(edited.fullName,'Иванов Иван Петрович');assert.equal(edited.role,'specialist')
  await specialist.reload();assert.equal(specialist.password,password)
  assert.equal((await call('/api/auth/login',null,'POST',{email:'spec@test.invalid',password:'password123'})).status,400)
  assert.equal((await call(`/api/admin/users/${specialist._id}`,administrator,'PATCH',{fullName:'Изменённое ФИО',email:parent.email})).status,409)
  assert.equal((await call(`/api/admin/users/${administrator._id}`,administrator,'PATCH',{fullName:'Не изменять'})).status,403)
  const child=await json('/api/children',parent,'POST',{fullName:'Петров Михаил Сергеевич',birthDate:'2021-05-04'},201)
  await (await Child.findByPk(child._id)).update({notes:'Private parent note'})
  assert.equal((await call('/api/admin/children',administrator,'POST',{fullName:'Не родитель',ownerId:specialist._id})).status,403)
  assert.equal((await call(`/api/admin/children/${child._id}`,administrator,'PATCH',{fullName:'Неверная дата',birthDate:'2021-02-31'})).status,400)
  const changed=await json(`/api/admin/children/${child._id}`,administrator,'PATCH',{fullName:'Петров Михаил Петрович',birthDate:'2021-05-05',notes:'Must not overwrite'})
  assert.equal(changed.fullName,'Петров Михаил Петрович');assert.equal('notes' in changed,false)
  assert.equal((await Child.findByPk(child._id)).notes,'Private parent note')
  assert.equal((await call(`/api/admin/children/${child._id}`,administrator,'PATCH',{fullName:'Transfer forbidden',ownerId:original._id})).status,409)
  await json(`/api/admin/children/${child._id}/specialists`,administrator,'PUT',{specialistId:specialist._id})
  assert.equal((await json('/api/children',specialist)).length,1)
  const file=await File.create({user:parent._id,name:'saved.txt',type:'txt',childProfileId:child._id})
  const saved=path.join(temp,'saved.txt');await fs.writeFile(saved,'Keep original bytes')
  await Records.create({ownerId:parent._id,childProfileId:child._id,fileId:file._id})
  const unified=await Unified.create({ownerId:parent._id,childProfileId:child._id,fileId:file._id,modelId:'test',modelVersion:'1',status:'completed',resultJson:'{}'})
  const text=await Text.create({ownerId:parent._id,childProfileId:child._id,fileId:file._id,modelId:'test',modelVersion:'1',resultJson:'{}'})
  await json(`/api/admin/children/${child._id}`,administrator,'DELETE')
  assert.equal(await Child.findByPk(child._id),null);assert.equal(await Links.count({where:{childId:child._id}}),0)
  assert.equal((await File.findByPk(file._id)).childProfileId,null)
  assert.equal((await Unified.findByPk(unified.id)).childProfileId,null);assert.equal((await Text.findByPk(text.id)).childProfileId,null)
  assert.equal((await Records.findOne({where:{fileId:file._id}})).childProfileId,null)
  assert.equal(await fs.readFile(saved,'utf8'),'Keep original bytes')
  // Archive a parent: retain profiles/data but revoke linked specialist access.
  const remaining=await json('/api/children',parent,'POST',{fullName:'Петрова Мария Сергеевна'},201)
  await json(`/api/admin/children/${remaining._id}/specialists`,administrator,'PUT',{specialistId:specialist._id})
  await json(`/api/admin/users/${parent._id}`,administrator,'DELETE')
  assert.equal((await call('/api/children',parent)).status,401)
  assert.ok((await User.findByPk(parent._id)).deletedAt);assert.ok(await Child.findByPk(remaining._id));assert.ok(await File.findByPk(file._id))
  assert.deepEqual(await json('/api/children',specialist),[])
  assert.ok(!(await json('/api/admin/children',administrator)).some(c=>c.ownerId===parent._id))
  assert.equal((await call(`/api/admin/children/${remaining._id}/specialists`,administrator,'PUT',{specialistId:specialist._id})).status,404)
  assert.equal((await call('/api/admin/children',administrator,'POST',{fullName:'Hidden parent',ownerId:parent._id})).status,403)
  await json(`/api/admin/users/${specialist._id}`,administrator,'DELETE')
  assert.equal(await Token.count({where:{userId:specialist._id}}),0)
  assert.equal((await call('/api/children',null,'GET',undefined,{Authorization:'Bearer '+login.accessToken})).status,401)
  assert.equal((await call('/api/auth/login',null,'POST',{email:'new-spec@test.invalid',password:'password123'})).status,400)
  assert.equal((await call('/api/auth/refresh',null,'GET',undefined,{Cookie:`refreshToken=${login.refreshToken}`})).status,401)
  users=await json('/api/admin/users',administrator);assert.ok(!users.some(u=>u.id===parent._id||u.id===specialist._id))
  assert.equal((await call(`/api/admin/users/${administrator._id}`,administrator,'DELETE')).status,403)
  assert.equal((await call(`/api/admin/users/${specialist._id}`,administrator,'DELETE')).status,404)
 } finally {await new Promise(r=>server.close(r));await db.close();await fs.rm(temp,{recursive:true,force:true})}
})
