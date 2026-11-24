import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

test('migration, assignment, revocation and all protected material routes', async () => {
 const temp = await fs.mkdtemp(path.resolve('.roles-test-'))
 Object.assign(process.env, { DB_PATH:path.join(temp,'test.sqlite'), FILE_PATH:path.join(temp,'files'), DATASET_DIR:path.join(temp,'dataset'), JWT_ACCESS_SECRET:'roles-test-access-secret-1234567890', JWT_REFRESH_SECRET:'roles-test-refresh-secret-1234567890' })
 const {default:express}=await import('express'), {default:jwt}=await import('jsonwebtoken')
 const {default:db}=await import('../DB/database.js'), {default:User}=await import('../models/User.js')
 const {default:Child}=await import('../models/ChildProfile.js'), {default:Link}=await import('../models/ChildSpecialist.js'), {default:File}=await import('../models/File.js')
 const {migrateRoles}=await import('../services/roleMigration.js')
 const app=express();app.use(express.json())
 for (const name of ['admin','child','file','ml','video','auth']) {
  const {router}=await import(`../routes/${name}.routes.js`)
  app.use('/api/'+({child:'children',file:'files'}[name]||name),router)
 }
 app.use((e,req,res,next)=>res.status(e.status||500).json({message:e.message}))
 await db.sync()
 const owner=await User.create({email:'owner@test.invalid',password:'existing-hash'})
 const child=await Child.create({ownerId:owner._id,name:'Миша',birthDate:'2021-05-04',notes:'Private notes'})
 const file=await File.create({user:owner._id,name:'private.txt',type:'txt',childProfileId:child._id})
 // Emulate the old schema; run additive migration twice to check restarts.
 await db.query('PRAGMA foreign_keys = OFF')
 await db.getQueryInterface().removeColumn('Users','role')
 await db.query('PRAGMA foreign_keys = ON')
 await migrateRoles(db);await migrateRoles(db);await owner.reload()
 assert.equal(owner.role,'parent');assert.equal(owner.password,'existing-hash')
 assert.equal((await Child.findByPk(child._id)).notes,'Private notes');assert.ok(await File.findByPk(file._id))
 const admin=await User.create({email:'admin@test.invalid',password:'unused',role:'admin'})
 const other=await User.create({email:'other@test.invalid',password:'unused'})
 const stranger=await Child.create({ownerId:other._id,name:'Other child',notes:'secret'})
 const second=await User.create({email:'second@test.invalid',password:'unused',role:'specialist'})
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve))
 const base=`http://127.0.0.1:${server.address().port}`
 // A forged role claim is never trusted; role is read from the database.
 const token=u=>jwt.sign({id:u._id,role:'admin'},process.env.JWT_ACCESS_SECRET)
 const request=(route,u=owner,method='GET',data,bearer)=>fetch(base+route,{method,headers:{'Content-Type':'application/json',...(u?{Authorization:'Bearer '+(bearer||token(u))}:{})},body:data===undefined?undefined:JSON.stringify(data)})
 const assign=(u,c=child)=>request(`/api/admin/children/${c._id}/specialists`,admin,'PUT',{specialistId:u._id})
 try {
  assert.equal((await request('/api/admin/users',null)).status,401)
  for (const u of [owner,second]) assert.equal((await request('/api/admin/users',u)).status,403)
  assert.equal((await request('/api/auth/registration',null,'POST',{fullName:'Проверочный Пользователь',email:'attack@test.invalid',password:'password123',role:'admin'})).status,403)
  let response=await request('/api/admin/users',admin,'POST',{fullName:'Иванов Иван Иванович',email:'spec@test.invalid',password:'password123',role:'specialist'})
  assert.equal(response.status,201);const created=await response.json();assert.equal('password' in created,false)
  const specialist=await User.findByPk(created.id), session=token(specialist)
  response=await request('/api/auth/login',null,'POST',{email:specialist.email,password:'password123'})
  const login=await response.json();assert.equal(login.user.role,'specialist');assert.ok(login.accessToken)
  for (const [data,status] of [
   [{email:'x@test.invalid',password:'password123',role:'admin'},400],
   [{email:'bad',password:'short',role:'specialist'},400],
   [{fullName:'Иванов Иван Иванович',email:specialist.email,password:'password123',role:'specialist'},409]
  ]) assert.equal((await request('/api/admin/users',admin,'POST',data)).status,status)
  assert.deepEqual(await (await request('/api/children',specialist)).json(),[])
  assert.equal((await request(`/api/children/${child._id}`,specialist)).status,404)
  assert.equal((await request(`/api/admin/children/${child._id}/specialists`,owner,'PUT',{specialistId:specialist._id})).status,403)
  assert.equal((await assign(owner)).status,400)
  assert.equal((await assign(specialist)).status,200);assert.equal((await assign(specialist)).status,200);assert.equal(await Link.count(),1)
  const list=await (await request('/api/children',specialist)).json()
  assert.equal(list.length,1);assert.equal(list[0]._id,child._id);assert.equal(list[0].notes,'Private notes')
  assert.deepEqual(await (await request(`/api/children/${child._id}`,specialist)).json(),list[0])
  assert.equal((await request(`/api/children/${stranger._id}`,specialist)).status,404)
  assert.deepEqual(await (await request('/api/children',second)).json(),[])
  for (const [route,method='GET',data] of [
   ['/api/children','POST',{name:'Forbidden'}], ['/api/files'], ['/api/files/search?search=private'],
   ['/api/files/upload/init','POST',{fileName:'x.txt',fileSize:1,totalChunks:1}]
  ]) assert.equal((await request(route,specialist,method,data)).status,403,route)
  assert.equal((await request(`/api/files?childProfileId=${child._id}`,specialist)).status,200)
  assert.equal((await request(`/api/ml/analyses/${file._id}`,specialist)).status,200)
  assert.equal((await request(`/api/children/${child._id}`,specialist,'PATCH',{fullName:'Миша',notes:'Private notes',birthDate:'2021-05-04'})).status,200)
  assert.equal((await request(`/api/children/${child._id}`,specialist,'DELETE')).status,409)
  assert.equal((await request(`/api/children/${child._id}`,other,'PATCH',{name:'Steal'})).status,404)
  const own=await (await request('/api/children',owner)).json();assert.equal(own[0].notes,'Private notes')
  assert.deepEqual(own[0].specialists,[{id:specialist._id,email:specialist.email,fullName:'Иванов Иван Иванович'}])
  const children=await (await request('/api/admin/children',admin)).json();assert.equal('notes' in children[0],false)
  const role=(u,r)=>request(`/api/admin/users/${u._id}/role`,admin,'PATCH',{role:r})
  assert.equal((await role(admin,'parent')).status,403);assert.equal((await role(owner,'specialist')).status,409)
  assert.equal((await role(specialist,'parent')).status,409)
  assert.equal((await request(`/api/admin/children/${child._id}/specialists/${specialist._id}`,admin,'DELETE')).status,200)
  assert.equal((await request(`/api/children/${child._id}`,specialist,'GET',undefined,session)).status,404)
  assert.equal((await role(specialist,'parent')).status,200)
  assert.equal((await request('/api/files',specialist,'GET',undefined,session)).status,200)
  assert.equal((await role(specialist,'specialist')).status,200)
  assert.equal((await request('/api/files',specialist,'GET',undefined,session)).status,403)
  await assign(specialist,stranger)
  assert.equal((await request(`/api/children/${stranger._id}`,other,'DELETE')).status,200)
  assert.equal(await Link.count({where:{childId:stranger._id}}),0)
  const users=await (await request('/api/admin/users',admin)).json();assert.ok(users.every(u=>!('password' in u)&&!('activationLink' in u)))
  const deleted=await User.create({email:'deleted@test.invalid',password:'unused'});const old=token(deleted);await deleted.destroy()
  assert.equal((await request('/api/children',deleted,'GET',undefined,old)).status,401)
 } finally {await new Promise(resolve=>server.close(resolve));await db.close();await fs.rm(temp,{recursive:true,force:true})}
})
