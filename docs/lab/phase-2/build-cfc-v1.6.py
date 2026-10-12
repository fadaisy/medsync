import json, re, sys
SP=sys.argv[1]
R=json.load(open('docs/lab/catalogue-research/lab-catalogue-research.v1.json'))
LIVEA=json.load(open(SP+'/live-answers.json'))
rc={c['id']:c for c in R['concepts']}
UCUM={'copies/mL':'{copies}/mL','mL/min/1.73m2':'mL/min/{1.73_m2}','count':'{count}','log10 copies/mL':'{log_copies}/mL','{INR}':'{ratio}','1':'{ratio}'}
u=lambda x: UCUM.get(x,x) if x else None
EXISTING_MATCH={'obs.eosinophils_abs','obs.bicarbonate','obs.aptt'}
DEFER={'obs.blood_culture_gram_stain','obs.blood_culture_organism'}  # F-4
GROUP=[('obs.(cd4|hiv|crag|rpr|treponemal|dual_rdt|tb_|sputum|malaria)', 'infection'),
       ('obs.(troponin)','cardiac'),('obs.(d_dimer|aptt)','coagulation'),('obs.(ft3)','endocrine'),
       ('obs.urine_','urinalysis'),('obs.(glucose)','glycaemia'),('obs.(chol)','lipids'),('obs.(ggt)','liver'),
       ('obs.(egfr|bicarbonate)','renal'),('obs.(blood_culture)','microbiology'),('obs.','haematology')]
def group(cid):
  for pat,g in GROUP:
    if re.match(pat,cid): return g
RESTRICTED=re.compile(r'obs\.(cd4|hiv|crag|rpr|treponemal|dual_rdt|tb_|sputum_afb)')
def concept(c, override=None):
  lo=c.get('loinc') or {}
  o=dict(id=c['id'],display=c['display'],kind='observation',group=group(c['id']),
    valueType=c['valueType'],canonicalUnit=u(c.get('canonicalUnit')),acceptedUnits=[],
    contextRequired=[],codes=([{'system':'LOINC','code':lo['code'],'status':'verified'}] if lo.get('status')=='verified' and lo.get('code') else []),
    lanes=[],sensitivity='restricted' if RESTRICTED.match(c['id']) else 'standard',phase='v1.6',symptomCode=None)
  if c.get('answers'): o['answers']=[a['code'] for a in c['answers']]
  o.update(override or {})
  return o
new=[rc[i] for i in rc if not rc[i]['existing'] and i not in EXISTING_MATCH and i not in DEFER]
concepts=[concept(c) for c in new]
bg=rc['obs.blood_group']; xp=rc['obs.tb_xpert']; hv=rc['obs.hiv_test']
concepts.append(concept({**bg,'id':'obs.abo_group','display':'ABO blood group','loinc':None}))
concepts.append(concept({**xp,'id':'obs.tb_xpert_mtb','display':'Xpert MTB/RIF Ultra: MTB result','loinc':None}))
concepts.append(concept({**hv,'id':'obs.hiv_algorithm_outcome','display':'HIV status (national testing algorithm)','loinc':None},
  {'answers':['negative','positive','inconclusive','inconclusive_refer','discrepant']}))
concepts.sort(key=lambda c:c['id'])
ext={'obs.urine_blood_dipstick':['trace_haemolysed','trace_nonhaemolysed'],'obs.crag':['invalid'],
     'obs.syphilis_test':['invalid'],'obs.pregnancy_test':['invalid'],'obs.hbsag':['invalid'],'obs.hcv_ab':['invalid'],
     'obs.tb_lam':['equivocal','invalid']}
LIVE={'neg':'negative','pos':'positive','1plus':'plus1','2plus':'plus2','3plus':'plus3','4plus':'plus4',
      'reactive':'positive','detected':'positive','parasites_seen':'positive'}
abnormal={}
for cid,c in rc.items():
  if not c.get('answers') or cid in DEFER: continue
  target={'obs.blood_group':'obs.abo_group','obs.tb_xpert':'obs.tb_xpert_mtb','obs.hiv_test':None}.get(cid,cid)
  la=LIVEA.get(target) if target else None  # a new concept keeps the research's codes
  codes=[]
  for a in c['answers']:
    if not a.get('abnormal'): continue
    code=a['code']
    if la is not None and code not in la: code=LIVE.get(code,code)
    if la is not None and code not in la and code not in ext.get(cid,[]): continue
    codes.append(code)
  if target=='obs.abo_group': continue
  if target and codes: abnormal[target]=sorted(set(codes))
# LD-11: a dipstick "trace" is never abnormal; brand wording maps onto the live plus grades (CD-09).
for cid in ['obs.ketones_urine','obs.glucose_urine','obs.urine_protein_dipstick','obs.urine_leukocytes_dipstick','obs.urine_blood_dipstick']:
  abnormal[cid]=[a for a in LIVEA[cid] if a.startswith('plus')]
abnormal['obs.sputum_afb']=[a for a in LIVEA['obs.sputum_afb'] if a.startswith('plus')]
abnormal.pop('obs.blood_culture',None)  # F-4: microbiology phase
abnormal['obs.hiv_algorithm_outcome']=['inconclusive','inconclusive_refer','discrepant','positive']
rt={t['id']:t for t in R['tests']}
v2={tid:[x for x in rt[tid]['components'] if x not in DEFER] for tid in rt}
v2['test.blood_group']=['obs.abo_group','obs.rhd_type']
v2['test.tb_xpert']=['obs.tb_xpert_mtb','obs.tb_xpert_rif']
v2['test.hiv_rapid']=['obs.hiv_rdt_t1','obs.hiv_rdt_t2','obs.hiv_rdt_t3','obs.hiv_algorithm_outcome']
# CC-7: the syphilis split; each test orders only its own components.
v2['test.syphilis']=['obs.syphilis_test']
v2['test.rpr']=['obs.rpr_result','obs.rpr_titre']
v2['test.tpha']=['obs.treponemal_lab_result']
v2['test.dual_hiv_syphilis_rdt']=['obs.dual_rdt_hiv_line','obs.dual_rdt_syphilis_line']
if 'obs.d_dimer_ddu' not in v2['test.d_dimer']: v2['test.d_dimer'].append('obs.d_dimer_ddu')
if 'obs.chol_ldl_direct' not in v2['test.lipid_panel']: v2['test.lipid_panel'].append('obs.chol_ldl_direct')
def newtest(tid, display, spec, cont):
  return dict(id=tid,display=display,kind='lab',panelComponents=v2.pop(tid),specimenType=spec,container=cont,
    fasting_required=False,defaultUnits={},capability_id=None,turnaround_target_minutes=None,in_house=True,active=False)
testsAdd=[newtest('test.coag_screen','Coagulation screen (PT, INR, APTT)','venous_plasma','unknown'),
  newtest('test.dual_hiv_syphilis_rdt','Dual HIV/syphilis rapid test','capillary_whole_blood','capillary_direct'),
  newtest('test.rpr','RPR (syphilis, non-treponemal)','venous_serum','serum_plain'),
  newtest('test.tpha','TPHA (syphilis, treponemal)','venous_serum','serum_plain')]
otherUnits={}
for c in R['concepts']:
  ok=[{'unit':o['unit'],'multiplyBy':o['multiplyBy']} for o in (c.get('otherUnits') or []) if isinstance(o,dict) and o.get('multiplyBy')]
  if ok: otherUnits[c['id']]=ok
out={
 'catalogue':'MS-EMR-CFC','version':'1.6.0','extends':'1.5.0','status':'draft','signedBy':None,'signedAt':None,
 'signature':"In the product: the laboratory lead and the CSO sign the addendum (CC-1; lab_signed_configs kind 'addendum', key 'cfc-1.6.0', payload the SHA-256 of this file).",
 'source':'docs/lab/catalogue-research/lab-catalogue-research.v1.json (12 Oct 2026), reconciled by docs/lab/phase-2/STOP-REPORTS.md STOP 0 and gate-a-proposal.md: the 3 concepts that already exist dropped (obs.eosinophils_abs, obs.bicarbonate, obs.aptt); the 2 free-text blood-culture concepts held for microbiology (F-4); units in valid UCUM (F-1); live answer codes kept and only answers new in meaning added (A1); obs.abo_group, obs.tb_xpert_mtb and obs.hiv_algorithm_outcome added so obs.blood_group, obs.tb_xpert and obs.hiv_test keep their meaning (A2).',
 'note':"No clinical number: units, codes and answer sets only. New tests arrive inactive and are orderable once the addendum is signed. The v2 component lists apply only where labCatalogueV2 is on and the addendum is signed; with the flag off, Phase 1's lists stand.",
 'answerExtensions':ext,'canonicalUnitChanges':{'obs.d_dimer':'mg/L{FEU}'},
 'retired':{'obs.troponin':'split into obs.troponin_i_hs and obs.troponin_t_hs (CD-03); old results keep it'},
 'legacy':{'obs.blood_group':'obs.abo_group + obs.rhd_type','obs.tb_xpert':'obs.tb_xpert_mtb + obs.tb_xpert_rif','obs.hiv_test':'obs.hiv_rdt_t1..t3 + obs.hiv_algorithm_outcome'},
 'concepts':concepts,'abnormalAnswers':dict(sorted(abnormal.items())),'otherUnits':otherUnits,
 'testsAdd':testsAdd,'testsV2':dict(sorted(v2.items())),
 'counts':{'concepts':len(concepts),'restricted':sum(c['sensitivity']=='restricted' for c in concepts),'testsAdd':len(testsAdd),'testsV2':len(v2)},
}
json.dump(out,open('data/emr/clinical-fact-concepts.v1.6.json','w'),indent=1,ensure_ascii=False)
print(out['counts'])
print([c['id'] for c in concepts if c['valueType'] not in ('quantity','coded','ordinal')])
print({c['id']:c['canonicalUnit'] for c in concepts if c['valueType']=='quantity'})
print(abnormal)
