const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]))
// Fail closed: build the parent's response from public summary fields, never remove
// a blacklist from a full report. Persisted reports always retain the full original.
export function visibleResult(result, user) {
  if (user.role === 'specialist') return result
  const metrics = (Array.isArray(result.metrics) ? result.metrics : [])
    .filter(item => item.value === null || ['number','string','boolean'].includes(typeof item.value))
    .map(item => pick(item, ['key','label','type','value','unit','description']))
  let conclusion = result.conclusion && pick(result.conclusion, ['code','title','explanation'])
  if (!conclusion) {
    const label = result.label
    conclusion = {code:'legacy_summary',title: label === 1 ? 'Рассказ отнесён к категории «РАС»' : label === 0 ? 'Рассказ отнесён к категории «без РАС»' : 'Результат сохранён',
      explanation: label === 0 ? 'Оценка относится к тексту рассказа и не исключает РАС у ребёнка.' : label === 1 ? 'В рассказе обнаружено сходство с текстами о детях с РАС.' : 'Краткий итог для этого сохранённого результата недоступен.'}
  }
  const model = pick(result.model || {id:result.model_id,version:result.model_version}, ['id','name','version','modality','operation'])
  const description = result.report?.schema?.blocks?.find(block => block.id === 'metrics' && block.type === 'table')?.description
  return {
    ...pick(result, ['analysis_id','analysisId','fileId','childProfileId','model_id','model_version']),
    ...(result.execution ? {execution:pick(result.execution,['started_at','finished_at','duration_ms'])} : {}),
    schema_version:'1.3', report_view:'brief', status:result.status || 'completed', model, conclusion, metrics,
    ...(result.error ? {error:pick(result.error,['code','message'])} : {error:null}),
    report:{schema:{version:'1.0',blocks:[
      {id:'conclusion',type:'text',title:'Итог анализа',required:true},
      {id:'metrics',type:'table',title:'Основные показатели',required:true,...(description ? {description} : {}),columns:[{key:'label',label:'Показатель'},{key:'value',label:'Значение'},{key:'unit',label:'Единица'}]}
    ]}, blocks:[{id:'conclusion',status:'ready',data:[conclusion.title,conclusion.explanation].filter(Boolean).join('\n')},
      {id:'metrics',status:'ready',data:metrics.map(item=>({label:item.label || item.key,value:item.value,unit:item.unit || ''}))}]}
  }
}
