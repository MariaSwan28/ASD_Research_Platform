import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import { validateAnalysisResult, failedAnalysisResult } from '../services/analysisResultContract.js'

const schema = { version:'1.0', blocks:[
 {id:'summary',type:'text',title:'Итог',required:true},
 {id:'table',type:'table',title:'Таблица',required:true,columns:[{key:'value',label:'Значение'}]},
 ...[1,2,3].map(i=>({id:'image-'+i,type:'image',title:'График '+i,required:true,media_types:['image/png']}))
] }
const model={id:'report-test',label:'Пример отчёта',version:'1',modality:'text',operation:'report-demo',extensions:['.txt'],status:'configured',result_schema_version:'1.3',report_schema:schema}
const expected=()=>({analysisId:randomUUID(),fileId:randomUUID(),model,startedAt:new Date().toISOString()})
function success(context){
 return {...failedAnalysisResult(context,'x','x'),status:'completed',error:null,summary:'Готово',raw_output:{future:[0,false,null]},
  artifacts:[1,2,3].map(i=>({id:'plot-'+i,label:'График '+i,media_type:'image/png'})),
  report:{schema:structuredClone(schema),blocks:[{id:'summary',status:'ready',data:'Текст отнесён к категории «без РАС»'}, {id:'table',status:'ready',data:[{value:0},{value:false},{value:null}]}, ...[1,2,3].map(i=>({id:'image-'+i,status:'ready',artifact_id:'plot-'+i}))]}}
}
test('1.3 validates snapshot, typed blocks, false/zero/null and rejects malformed reports',()=>{
 const context=expected();assert.equal(validateAnalysisResult(success(context),context).schema_version,'1.3')
 for(const mutate of [
  r=>{r.report.schema.blocks[0].title='Substituted layout'},r=>{r.report.blocks.reverse()},
  r=>{r.report.blocks[0].data=''},r=>{r.report.blocks[1].data=[{value:1,hidden:'x'}]},
  r=>{r.report.blocks[1].data=[{value:Infinity}]},r=>{r.raw_output.value=NaN},
  r=>{r.report.blocks[2].artifact_id='https://example.invalid/file.png'},
  r=>{r.artifacts[0].media_type='image/svg+xml'},r=>{r.report.blocks[0]={id:'summary',status:'unavailable',message:'Missing'}},
  r=>{r.artifacts.push(r.artifacts[0])}
 ]){const r=success(context);mutate(r);assert.throws(()=>validateAnalysisResult(r,context),/invalid_model_result/)}
 const partial=success(context);partial.status='partial';partial.error={code:'incomplete_report',message:'Missing'};partial.report.blocks[0]={id:'summary',status:'unavailable',message:'Missing'}
 assert.equal(validateAnalysisResult(partial,context).status,'partial')
 const failed=failedAnalysisResult(context,'test','Ошибка');assert.equal(validateAnalysisResult(failed,context).status,'failed')
})

test('HTTP + SQLite keeps report snapshot; files are tied to owner/run and missing required files become partial',async()=>{
 const temp=await fs.mkdtemp(path.resolve('.report-test-'))
 Object.assign(process.env,{DB_PATH:path.join(temp,'db.sqlite'),FILE_PATH:path.join(temp,'files'),DATASET_DIR:path.join(temp,'dataset'),JWT_ACCESS_SECRET:'report-test-access-secret-1234567890'})
 let mode='complete'
 const ml=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json')
  if(req.url==='/api/capabilities'){res.end(JSON.stringify({models:[model]}));return}
  let text='';for await(const part of req)text+=part;const payload=JSON.parse(text)
  const context={analysisId:payload.analysis_id,fileId:payload.file_id,model,startedAt:new Date().toISOString()}
  const result=success(context), directory=path.join(process.env.DATASET_DIR,payload.user_id,'runs',payload.analysis_id)
  await fs.mkdir(directory,{recursive:true});const manifest={}
  for(const i of [1,2,3]){manifest['plot-'+i]={path:i+'.png',media_type:'image/png'};if(mode==='complete'||i!==3)await fs.writeFile(path.join(directory,i+'.png'),Buffer.from('89504e470d0a1a0a','hex'))}
  await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest))
  res.end(JSON.stringify(result))
 });ml.listen(0,'127.0.0.1');await new Promise(r=>ml.once('listening',r));process.env.ML_API_URL=`http://127.0.0.1:${ml.address().port}`
 const {default:express}=await import('express'),{default:jwt}=await import('jsonwebtoken'),{default:db}=await import('../DB/database.js'),{default:User}=await import('../models/User.js'),{File}=await import('../models/index.js'),{default:Saved}=await import('../models/UnifiedAnalysisResult.js')
 const {router}=await import('../routes/ml.routes.js');await db.sync()
 const owner=await User.create({email:'owner@test.invalid',password:'unused'}),other=await User.create({email:'other@test.invalid',password:'unused',role:'specialist'})
 await fs.mkdir(path.join(process.env.FILE_PATH,owner._id),{recursive:true});await fs.writeFile(path.join(process.env.FILE_PATH,owner._id,'story.txt'),'Рассказ')
 const {default:Child}=await import('../models/ChildProfile.js'),{default:Link}=await import('../models/ChildSpecialist.js')
 const specialist=await User.create({email:'specialist@test.invalid',password:'unused',role:'specialist'}),child=await Child.create({ownerId:owner._id,name:'Ребёнок'})
 await Link.create({childId:child._id,specialistId:specialist._id,assignedBy:specialist._id})
 const file=await File.create({childProfileId:child._id,name:'story.txt',path:'story.txt',type:'txt',user:owner._id,size:14})
 const app=express();app.use(express.json());app.use('/api/ml',router);app.use((e,req,res,next)=>res.status(e.status||500).json({message:e.message}))
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`
 const call=(route,user=specialist,method='GET',data)=>fetch(base+route,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt.sign({id:user._id},process.env.JWT_ACCESS_SECRET)},body:data?JSON.stringify(data):undefined})
 try{
  const res=await call('/api/ml/analyze',specialist,'POST',{fileId:file._id,modelId:model.id});assert.equal(res.status,200);const result=await res.json();assert.equal(result.status,'completed')
  const saved=await Saved.findByPk(result.analysis_id);assert.deepEqual(JSON.parse(saved.resultJson).report.schema,schema)
  const url=`/api/ml/analyses/${result.analysis_id}/artifacts/plot-1`
  const image=await call(url);assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/image\/png/);assert.equal(image.headers.get('x-content-type-options'),'nosniff')
  assert.equal((await call(url,other)).status,404)
  const history=await (await call('/api/ml/analyses/'+file._id)).json();assert.deepEqual(history[0].result.report,result.report)
  mode='missing';const partial=await (await call('/api/ml/analyze',specialist,'POST',{fileId:file._id,modelId:model.id})).json()
  assert.equal(partial.status,'partial');assert.equal(partial.report.blocks[4].status,'unavailable');assert.equal(partial.error.code,'incomplete_report')
  assert.equal((await call(`/api/ml/analyses/${partial.analysis_id}/artifacts/plot-3`)).status,404)
  const directory=path.join(process.env.DATASET_DIR,owner._id,'runs',result.analysis_id)
  const outside=path.join(temp,'outside.png');await fs.writeFile(outside,'private');await fs.unlink(path.join(directory,'1.png'));await fs.symlink(outside,path.join(directory,'1.png'))
  assert.equal((await call(url)).status,404)
 }finally{await new Promise(r=>server.close(r));await new Promise(r=>ml.close(r));await db.close();await fs.rm(temp,{recursive:true,force:true})}
})
