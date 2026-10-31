"""Enrich the installed snapshot without changing its admitted GTIN set or images."""
import argparse
import hashlib
import json
import os
import shutil
from collections import Counter, defaultdict
from pathlib import Path
from catalog_normalization import canonical_records
from retail_metadata import source_metadata, enrich_candidate
from build_directory import conflicts


def read_rows(path):
    return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines()]


def write(path, data):
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')


def prepare(current, sources, output):
    if current.resolve()==output.resolve():
        raise ValueError('Prepare in staging first')
    output.mkdir(parents=True,exist_ok=True)
    metadata=source_metadata(sources)
    before=read_rows(current/'candidates.jsonl')
    candidates=[enrich_candidate(row,metadata) for row in before]
    groups=defaultdict(list)
    for row in candidates:
        if row['source']!='openbeauty':groups[row['gtin14']].append(row)
    for rows in groups.values():
        reason=conflicts(rows)
        if reason:
            for row in rows:row['review_reason']='; '.join(sorted(set(filter(None,[row.get('review_reason',''),reason]))))
    inventory=[enrich_candidate(row,metadata) for row in read_rows(current/'inventory.jsonl')]
    for filename,rows in [('candidates.jsonl',candidates),('inventory.jsonl',inventory)]:
        with (output/filename).open('w',encoding='utf-8') as stream:
            for row in rows:stream.write(json.dumps(row,ensure_ascii=False)+'\n')
    canonical=canonical_records(candidates)
    assert {(row['source']=='openbeauty',row['gtin14']) for row in before}=={(row['beauty'],row['gtin14']) for row in canonical}
    original=json.loads((current/'canonical.json').read_text(encoding='utf-8'))
    def completeness(rows):
        return {'records':len(rows),'with_brand':sum(bool(row['payload'].get('brand')) for row in rows),'with_source_category_path':sum(bool(row['payload'].get('category_path')) for row in rows),'with_source_subcategory':sum(len(row['payload'].get('category_path',[]))>1 for row in rows)}
    by_source={source:{'records':len(own),'with_brand':sum(bool(row.get('brand')) for row in own),'with_source_category_path':sum(bool(row.get('category_path')) for row in own),'with_category_alternatives':sum(bool(row.get('source_category_paths')) for row in own)} for source in sorted({row['source'] for row in candidates}) for own in [[row for row in candidates if row['source']==source]]}
    failures=[]
    status=sources/'farmacorp'/'metadata-status.json'
    if status.exists():failures.append(json.loads(status.read_text(encoding='utf-8')))
    farmar_rows=read_rows(sources/'farmar'/'metadata.jsonl') if (sources/'farmar'/'metadata.jsonl').exists() else []
    audit={'before':completeness(original),'after':completeness(canonical),'by_source':by_source,'farmar_page_status':dict(Counter(row['status'] for row in farmar_rows)),'remote_failures':failures,
      'gaps':[{'gtin14':row['gtin14'],'source':row['payload']['source'],'source_ref':row['payload'].get('source_ref'),'missing':[field for field in ['brand','category_path'] if not row['payload'].get(field)]} for row in canonical if not row['payload'].get('brand') or not row['payload'].get('category_path')]}
    write(output/'metadata-audit.json',audit)
    write(output/'canonical.json',canonical)
    report=json.loads((current/'report.json').read_text(encoding='utf-8'));report['metadata']={k:v for k,v in audit.items() if k!='gaps'};write(output/'report.json',report)
    manifest=json.loads((current/'manifest.json').read_text(encoding='utf-8'))
    manifest['metadata_audit_sha256']=hashlib.sha256((output/'metadata-audit.json').read_bytes()).hexdigest()
    manifest['metadata_source_snapshots']={str(path.relative_to(sources)):hashlib.sha256(path.read_bytes()).hexdigest() for path in sources.glob('*/*.json*') if path.name in ['catalogue.json','categories.json','memberships.json','metadata.jsonl','metadata-status.json']}
    write(output/'manifest.json',manifest)
    for filename in ['baseline-quarantine.jsonl','coverage-audit.json','image-report.json']:
        if (current/filename).exists():shutil.copy2(current/filename,output/filename)
    image=output/'images.jsonl'
    if not image.exists():os.link(current/'images.jsonl',image)
    print(json.dumps({k:v for k,v in audit.items() if k not in ['gaps','by_source']},ensure_ascii=True,indent=2),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--current',type=Path,required=True);parser.add_argument('--sources',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();prepare(args.current,args.sources,args.output)
