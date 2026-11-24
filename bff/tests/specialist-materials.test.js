import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import {failedAnalysisResult} from '../services/analysisResultContract.js'

test('assigned specialist shares child storage, video-only tags, full reports and revocable access; parent receives summaries only',async()=>{
 const temp=await fs.mkdtemp(path.resolve('.specialist-test-'))
 Object.assign(process.env,{DB_PATH:path.join(temp,'db.sqlite'),FILE_PATH:path.join(temp,'files'),DATASET_DIR:path.join(temp,'dataset'),JWT_ACCESS_SECRET:'specialist-stage18-test-secret-1234567890'})
 const schema={version:'1.0',blocks:[{id:'conclusion',type:'text',title:'Итог',required:true},{id:'metrics',type:'table',title:'Показатели',required:true,columns:[{key:'value',label:'Значение'}]},{id:'private',type:'image',title:'Служебный график',required:true,media_types:['image/png']}]}
 const model={id:'test-summary',label:'Тестовая модель',version:'1',modality:'text',operation:'text-classification',extensions:['.txt'],status:'configured',result_schema_version:'1.3',report_schema:schema}
 let payload
 const ml=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json')
  if(req.url==='/api/capabilities')return res.end(JSON.stringify({models:[model]}))
  if(req.url.includes('status'))return res.end(JSON.stringify({is_analyzing:true,progress:40,current_user:payload?.user_id,current_file_id:payload?.file_id,result:{secret:'SECRET_RAW'}}))
  let body='';for await(const chunk of req)body+=chunk;payload=JSON.parse(body)
  const result={...failedAnalysisResult({analysisId:payload.analysis_id,fileId:payload.file_id,model,startedAt:new Date().toISOString()},'x','x'),status:'completed',error:null,
    conclusion:{code:'ok',title:'Итог модели',explanation:'Объяснение'},metrics:[{key:'count',label:'Количество',type:'integer',value:3,description:'Три участка'}],raw_output:{private:'SECRET_RAW'},
    parameters:[{key:'private',label:'Служебное',type:'string',value:'SECRET_RAW'}],
    artifacts:[{id:'plot',label:'Служебный график',media_type:'image/png'}],report:{schema,blocks:[{id:'conclusion',status:'ready',data:'Итог модели'},{id:'metrics',status:'ready',data:[{value:3}]},{id:'private',status:'ready',artifact_id:'plot'}]}}
  const dir=path.join(process.env.DATASET_DIR,payload.user_id,'runs',payload.analysis_id);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'plot.png'),'SECRET_IMAGE');await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({plot:{path:'plot.png',media_type:'image/png'}}))
  res.end(JSON.stringify(result))
 });ml.listen(0,'127.0.0.1');await new Promise(r=>ml.once('listening',r));process.env.ML_API_URL=`http://127.0.0.1:${ml.address().port}`
 const {default:express}=await import('express'),{default:upload}=await import('express-fileupload'),{default:jwt}=await import('jsonwebtoken')
 const {default:db}=await import('../DB/database.js'),{default:User}=await import('../models/User.js'),{default:Child}=await import('../models/ChildProfile.js'),{default:Link}=await import('../models/ChildSpecialist.js'),{File}=await import('../models/index.js'),{default:Saved}=await import('../models/UnifiedAnalysisResult.js'),{default:Old}=await import('../models/TextAnalysisResult.js')
 const app=express();app.use(express.json());app.use(upload())
 for(const name of ['file','ml','child','video']){const {router}=await import(`../routes/${name}.routes.js`);app.use('/api/'+({file:'files',child:'children'}[name]||name),router)}
 app.use((e,req,res,next)=>res.status(e.status||500).json({message:e.message}));await db.sync()
 const parent=await User.create({email:'parent@test.invalid',password:'unused'}),specialist=await User.create({email:'spec@test.invalid',password:'unused',role:'specialist'}),other=await User.create({email:'other@test.invalid',password:'unused',role:'specialist'})
 const child=await Child.create({ownerId:parent._id,name:'Миша',notes:'Заметка'}),sibling=await Child.create({ownerId:parent._id,name:'Другой ребёнок'})
 await Link.create({childId:child._id,specialistId:specialist._id,assignedBy:specialist._id})
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`
 const call=(route,user=parent,method='GET',data)=>fetch(base+route,{method,headers:{Authorization:'Bearer '+jwt.sign({id:user._id,role:'admin'},process.env.JWT_ACCESS_SECRET),...(data instanceof FormData?{}:{'Content-Type':'application/json'})},body:data instanceof FormData?data:data===undefined?undefined:JSON.stringify(data)})
 const form=(name,childId,tags)=>{const data=new FormData();data.append('file',new Blob(['Наблюдение']),'a'+name);if(childId)data.append('childProfileId',childId);for(const tag of tags||[])data.append('tags',tag);return data}
 const init=(name,childId,tags=[])=>({fileName:name,fileSize:3,totalChunks:1,childProfileId:childId,tags})
 try{
  assert.equal((await call('/api/files',specialist)).status,403)
  assert.equal((await call('/api/files/upload',parent,'POST',form('.txt',child._id,['Удары']))).status,403)
  assert.equal((await call('/api/files/upload',specialist,'POST',form('.txt',child._id,['Удары']))).status,403)
  assert.equal((await call('/api/files/upload',specialist,'POST',form('.mp4',sibling._id,['Удары']))).status,403)
  let res=await call('/api/files/upload',specialist,'POST',form('.txt',child._id));assert.equal(res.status,200);const file=await res.json();assert.equal(file.user,parent._id);assert.equal(file.childProfileId,child._id)
  const video=await (await call('/api/files/upload',specialist,'POST',form('.mp4',child._id,['Удары']))).json();assert.equal(video.user,parent._id);assert.equal((await (await File.findByPk(video._id)).getTags())[0].name,'Удары')
  assert.equal((await call('/api/files/upload/init',parent,'POST',init('tagged.mp4',child._id,['Удары']))).status,403)
  assert.equal((await call('/api/files/upload/init',specialist,'POST',init('tagged.wav',child._id,['Удары']))).status,403)
  assert.equal((await call('/api/files/upload/init',specialist,'POST',{...init('stolen.txt',sibling._id),fileId:file._id})).status,403)
  assert.equal((await call(`/api/files?childProfileId=${sibling._id}&fileId=${file._id}`,specialist)).status,403)
  for(const user of [parent,specialist]){const list=await (await call(`/api/files?childProfileId=${child._id}`,user)).json();assert.equal(list.length,2)}
  assert.equal((await call('/api/files/download?id='+file._id,specialist)).status,200);assert.equal((await call('/api/files/download?id='+file._id,other)).status,404)
  const hidden=await File.create({user:parent._id,name:'a-hidden.txt',type:'txt',childProfileId:sibling._id})
  const search=await (await call(`/api/files/search?childProfileId=${child._id}&search=a`,specialist)).json();assert.equal(search.length,2);assert.ok(search.every(f=>f.childProfileId===child._id))
  assert.equal((await call('/api/ml/analyses/'+hidden._id,specialist)).status,404)
  res=await call('/api/ml/analyze',specialist,'POST',{fileId:file._id,modelId:model.id});assert.equal(res.status,200);const full=await res.json();assert.equal(full.raw_output.private,'SECRET_RAW');assert.equal(payload.user_id,parent._id)
  const record=await Saved.findByPk(full.analysis_id);assert.equal(record.ownerId,parent._id);assert.equal(JSON.parse(record.resultJson).report.blocks.length,3)
  const artifact=`/api/ml/analyses/${full.analysis_id}/artifacts/plot`;assert.equal((await call(artifact,specialist)).status,200);assert.equal((await call(artifact,parent)).status,403);assert.equal((await call(artifact,other)).status,404)
  const brief=(await (await call('/api/ml/analyses/'+file._id,parent)).json())[0].result;assert.equal(brief.report_view,'brief');assert.equal(brief.conclusion.title,'Итог модели');assert.equal(brief.metrics[0].value,3);assert.equal(brief.report.blocks.length,2)
  assert.ok(!JSON.stringify(brief).includes('SECRET'));for(const field of ['raw_output','parameters','artifacts','limitations','warnings'])assert.equal(field in brief,false)
  const direct=await (await call('/api/ml/analyze',parent,'POST',{fileId:file._id,modelId:model.id})).json();assert.equal(direct.report_view,'brief');assert.equal('raw_output' in direct,false)
  const history=await (await call('/api/ml/analyses/'+file._id,specialist)).json();assert.equal(history.length,2);assert.ok(history.every(r=>r.result.raw_output.private==='SECRET_RAW'))
  await Old.create({ownerId:parent._id,fileId:file._id,modelId:'parent-story-nb',modelVersion:'old',resultJson:JSON.stringify({label:0,secret:'SECRET_RAW'})})
  assert.ok(!JSON.stringify(await (await call('/api/ml/text/history/'+file._id,parent)).json()).includes('SECRET'))
  assert.equal((await call('/api/ml/feature?id='+file._id,parent)).status,403);assert.equal((await call(`/api/video/stream/${file._id}/${parent._id}`,parent)).status,403)
  const status=await (await call('/api/ml/status-analyze',parent)).json();assert.equal('result' in status,false)
  // Chunk uploads are bound to both uploader and assignment; revocation invalidates an active session.
  const session=await (await call('/api/files/upload/init',specialist,'POST',init('chunk.mp4',child._id,['Вскрики']))).json()
  const chunk=new FormData();chunk.append('uploadId',session.uploadId);chunk.append('chunkIndex','0');chunk.append('chunk',new Blob(['abc']),'chunk')
  assert.equal((await call('/api/files/upload/chunk',other,'POST',chunk)).status,404)
  assert.equal((await call('/api/files/upload/chunk',specialist,'POST',chunk)).status,200)
  const active=await (await call('/api/files/upload/init',specialist,'POST',init('revoked.mp4',child._id))).json()
  const completed=await (await call('/api/files/upload/complete',specialist,'POST',session)).json();assert.equal(completed.user,parent._id);assert.equal((await (await File.findByPk(completed._id)).getTags())[0].name,'Вскрики')
  await Link.destroy({where:{childId:child._id,specialistId:specialist._id}})
  assert.equal((await call('/api/files/upload/complete',specialist,'POST',active)).status,404)
  assert.equal((await call('/api/files/download?id='+file._id,specialist)).status,404);assert.equal((await call('/api/ml/analyses/'+file._id,specialist)).status,404);assert.equal((await call(artifact,specialist)).status,404)
  await parent.reload();await specialist.reload();assert.ok(parent.usedSpace>0);assert.equal(specialist.usedSpace,0)
 }finally{await new Promise(r=>server.close(r));await new Promise(r=>ml.close(r));await db.close();await fs.rm(temp,{recursive:true,force:true})}
})
