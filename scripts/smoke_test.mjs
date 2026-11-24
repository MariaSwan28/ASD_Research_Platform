// Creates disposable materials; uses a demo account, never medical ground truth.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID, randomBytes } from 'node:crypto'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const base=(process.env.SMOKE_URL || 'http://127.0.0.1:3000').replace(/\/$/,'')
const env={}
if(fs.existsSync(path.join(root,'.env')))for(const line of fs.readFileSync(path.join(root,'.env'),'utf8').split('\n')){
 const index=line.indexOf('=');if(index>0&&!line.startsWith('#'))env[line.slice(0,index)]=line.slice(index+1)
}
let token,child
const files=[]
async function request(route,{method='GET',body}={}){
 const headers={};if(token)headers.Authorization='Bearer '+token
 if(body && !(body instanceof FormData))headers['Content-Type']='application/json'
 const response=await fetch(base+route,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined})
 const text=await response.text();let data;try{data=JSON.parse(text)}catch{throw Error(route+': non-JSON response '+response.status)}
 if(!response.ok)throw Error(route+': '+response.status+' '+(data.message||'Request failed'))
 return data
}
try{
 let login
 if(process.argv.includes('--register'))login=await request('/api/auth/registration',{method:'POST',body:{fullName:'Проверочный Родитель',email:'smoke-'+randomUUID()+'@example.invalid',password:randomBytes(12).toString('hex'),date:'1990-01-01',gender:'female'}})
 else login=await request('/api/auth/login',{method:'POST',body:{email:process.env.SMOKE_EMAIL||env.SUPERUSER_LOGIN,password:process.env.SMOKE_PASSWORD||env.SUPREUSER_PASS}})
 if(login.user?.role!=='parent')throw Error('Проверка материалов требует родителя: укажите SMOKE_EMAIL/SMOKE_PASSWORD или используйте --register при открытой регистрации')
 token=login.accessToken
 child=await request('/api/children',{method:'POST',body:{fullName:'Демонстрационный ребёнок',name:'Демо-проверка '+randomUUID().slice(0,8),birthDate:'2020-01-01',notes:'Техническая проверка'}})
 const form=new FormData();form.append('file',new Blob(['Ребенок активно играет с детьми. Он показывает игрушки маме.'],{type:'text/plain'}),'demo-'+randomUUID()+'.txt');form.append('childProfileId',child._id)
 const file=await request('/api/files/upload',{method:'POST',body:form});files.push(file._id)
 const result=await request('/api/ml/analyze',{method:'POST',body:{fileId:file._id,modelId:'parent-story-nb'}})
 if(result.status!=='completed'||!result.conclusion||!result.raw_output.sentences_analyzed)throw Error('Text analysis incomplete')
 const again=await request('/api/ml/analyses/'+file._id)
 if(!again.some(item=>item.id===result.analysis_id))throw Error('Saved history missing')
 const catalog=await request('/api/ml/capabilities')
 if(!catalog.models.some(model=>model.id==='audio-activity-v1'))throw Error('Third adapter missing')
 console.log(JSON.stringify({login:true,child:true,upload:true,text_analysis:true,history:true,third_adapter:true}))
}finally{
 for(const id of files)await request('/api/files?id='+encodeURIComponent(id),{method:'DELETE'}).catch(()=>{})
 if(child)await request('/api/children/'+child._id,{method:'DELETE'}).catch(()=>{})
}
