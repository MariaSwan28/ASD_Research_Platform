"""Declarative report layout and values; no model-specific rendering rules."""
import copy
import math
import re
from core.result_contract import ContractError

ID = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$')
MEDIA = {
    'image': {'image/png', 'image/jpeg', 'image/webp'},
    'audio': {'audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/flac', 'audio/aac', 'audio/webm'},
    'video': {'video/mp4', 'video/webm', 'video/quicktime'},
}
TYPES = {'text', 'table', 'image', 'audio', 'video', 'file'}

def need(condition, message):
    if not condition: raise ContractError(message)

def text(value): return isinstance(value, str) and bool(value.strip())
def scalar(value): return value is None or isinstance(value, (str, bool, int)) or isinstance(value, float) and math.isfinite(value)

def validate_schema(schema):
    need(isinstance(schema, dict) and set(schema) == {'version', 'blocks'} and schema['version'] == '1.0', 'invalid_report_schema')
    need(isinstance(schema['blocks'], list) and 0 < len(schema['blocks']) <= 100, 'invalid_report_layout')
    ids = []
    for block in schema['blocks']:
        need(isinstance(block, dict) and set(block).issubset({'id','type','title','required','description','columns','media_types'}), 'invalid_report_definition')
        need(isinstance(block.get('id'), str) and ID.fullmatch(block['id']), 'invalid_report_block_id')
        need(block.get('type') in TYPES and text(block.get('title')) and type(block.get('required')) is bool, 'invalid_report_block_definition')
        need('description' not in block or isinstance(block['description'], str), 'invalid_report_description')
        if block['type'] == 'table':
            columns = block.get('columns')
            need(isinstance(columns, list) and 0 < len(columns) <= 50, 'report_table_columns_required')
            keys = []
            for column in columns:
                need(isinstance(column, dict) and set(column).issubset({'key','label','unit'}) and isinstance(column.get('key'), str) and ID.fullmatch(column['key']) and text(column.get('label')), 'invalid_report_column')
                need('unit' not in column or isinstance(column['unit'], str), 'invalid_report_column_unit')
                keys.append(column['key'])
            need(len(keys) == len(set(keys)), 'duplicate_report_column')
        else: need('columns' not in block, 'columns_only_for_table')
        if 'media_types' in block:
            need(block['type'] in MEDIA or block['type'] == 'file', 'media_types_only_for_files')
            need(isinstance(block['media_types'], list) and bool(block['media_types']) and all(text(x) for x in block['media_types']), 'invalid_report_media_types')
            if block['type'] in MEDIA: need(set(block['media_types']).issubset(MEDIA[block['type']]), 'unsafe_report_media_type')
        ids.append(block['id'])
    need(len(ids) == len(set(ids)), 'duplicate_report_block')
    return schema

def text_block(identifier, value): return {'id': identifier, 'data': value}
def table_block(identifier, rows): return {'id': identifier, 'data': rows}
def file_block(identifier, artifact_id): return {'id': identifier, 'artifact_id': artifact_id}
def unavailable_block(identifier, message): return {'id': identifier, 'status': 'unavailable', 'message': message}
def metric_rows(metrics): return [{'metric': item['label'], 'value': item['value'], 'unit': item.get('unit','')} for item in metrics]
METRIC_COLUMNS = [{'key':'metric','label':'Показатель'}, {'key':'value','label':'Значение'}, {'key':'unit','label':'Единица'}]

def validate_report(report, artifacts, expected_schema=None):
    need(isinstance(report, dict) and set(report) == {'schema','blocks'}, 'invalid_report')
    schema = validate_schema(report['schema'])
    if expected_schema is not None: need(schema == expected_schema, 'report_schema_mismatch')
    values = report['blocks']
    need(isinstance(values, list) and len(values) == len(schema['blocks']), 'incomplete_report_slots')
    need([x.get('id') if isinstance(x, dict) else None for x in values] == [x['id'] for x in schema['blocks']], 'report_block_order_or_identity')
    by_id = {item['id']: item for item in artifacts}
    need(len(by_id) == len(artifacts), 'duplicate_report_artifact')
    missing = []
    for definition, value in zip(schema['blocks'], values):
        need(set(value).issubset({'id','status','data','artifact_id','message'}) and value.get('status') in ('ready','unavailable'), 'invalid_report_value')
        if value['status'] == 'unavailable':
            need(text(value.get('message')) and 'data' not in value and 'artifact_id' not in value, 'invalid_unavailable_block')
            if definition['required']: missing.append(definition['id'])
            continue
        need('message' not in value, 'ready_block_message')
        kind = definition['type']
        if kind in ('text','table'):
            need('data' in value and 'artifact_id' not in value, 'report_data_required')
            if kind == 'text': need(text(value['data']), 'report_text_required')
            else:
                columns = {x['key'] for x in definition['columns']}
                need(isinstance(value['data'], list) and all(isinstance(row, dict) and set(row).issubset(columns) and all(scalar(cell) for cell in row.values()) for row in value['data']), 'invalid_report_table_rows')
        else:
            identifier = value.get('artifact_id')
            need('data' not in value and isinstance(identifier, str) and ID.fullmatch(identifier) and identifier in by_id, 'invalid_report_artifact_reference')
            mime = by_id[identifier]['media_type']
            if kind in MEDIA: need(mime in MEDIA[kind], 'report_artifact_type_mismatch')
            if 'media_types' in definition: need(mime in definition['media_types'], 'report_artifact_mime_mismatch')
    return missing

def build_report(schema, blocks, artifacts, verify_file=None, failure_message=None):
    validate_schema(schema)
    need(isinstance(blocks, list), 'report_blocks_required')
    ids = [x.get('id') if isinstance(x, dict) else None for x in blocks]
    need(all(isinstance(x, str) for x in ids) and len(ids) == len(set(ids)) and all(x in {b['id'] for b in schema['blocks']} for x in ids), 'unknown_or_duplicate_report_block')
    values = {x['id']: copy.deepcopy(x) for x in blocks}
    ordered = []
    for definition in schema['blocks']:
        value = values.get(definition['id'])
        if value is None:
            value = unavailable_block(definition['id'], failure_message or ('Результат для этого блока отсутствует' if definition['required'] else 'Этот блок не сформирован'))
        value.setdefault('status', 'ready')
        ordered.append(value)
    report = {'schema': copy.deepcopy(schema), 'blocks': ordered}
    # Validate references before any filesystem lookup.
    validate_report(report, artifacts)
    if verify_file is not None:
        for value in ordered:
            if value['status'] == 'ready' and 'artifact_id' in value and not verify_file(value['artifact_id']):
                identifier = value['id']
                value.clear(); value.update(unavailable_block(identifier, 'Файл результата недоступен'))
    validate_report(report, artifacts)
    return report
