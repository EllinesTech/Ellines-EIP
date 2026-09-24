'use client';

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  askEllineaApi, assignPlatformOrgPackage, clearSession, createPlatformOrg, createPlatformOrgUser,
  createPlatformPackage, deletePlatformPackage, fetchHealth, fetchPlatformOrgDateTimeSettings, updatePlatformPackage,
  fetchPlatformMetrics, fetchPlatformHealthSummary, fetchPlatformOrgPackage, fetchPlatformOrgStats, getSession, listPlatformAuditLogs, exportPlatformAuditLogs,
  listPlatformConnectorPacks, listPlatformFlags, listPlatformOrgUsers,
  listPlatformOrgs, listPlatformPackages, migratePlatformEncryption, refreshSessionFlags, updatePlatformFlag,
  updatePlatformOrgDateTimeSettings, updatePlatformOrgStatus, updatePlatformOrgUser,
  updatePlatformConnectorPack, publishPlatformConnectorPack, deprecatePlatformConnectorPack, deletePlatformConnectorPack,
  fetchPlatformOrgConnectors, fetchPlatformOrgApprovals, fetchPlatformOrgRules,
  fetchPlatformOrgReports, fetchPlatformOrgAgents, fetchPlatformOrgSnapshot,
  fetchPlatformOrgConnectorInstallations, createPlatformOrgConnector, updatePlatformOrgConnector,
  deletePlatformOrgConnector, testPlatformOrgConnector, syncPlatformOrgConnector,
  listPlatformOrgDocuments, uploadPlatformOrgDocument, deletePlatformOrgDocument,
  fetchPlatformOrgProfile, updatePlatformOrgProfile, parseOpenApi,
  listPlatformOrgIntegrationRequests, reviewPlatformOrgIntegrationRequest,
  type ConnectorPackDto, type FeatureFlag, type HealthDto, type OrgDateTimeSettingsDto, type PlatformHealthSummaryDto,
  type OrgMember, type PlatformAuditRow, type PlatformOrg, type PlatformPackage, type PlatformMetrics,
  type PlatformOrgConnectorDto, type PlatformOrgApprovalDto, type PlatformOrgRuleDto,
  type PlatformOrgReportDto, type PlatformOrgAgentDto, type PlatformOrgSnapshotDto,
  type ConnectorInstallationDto, type ConnectorInstallConfigDto, type OpenApiParseResult,
  type PlatformDocumentDto, type PlatformOrgProfileDto, type IntegrationRequestDto,
} from '@/lib/api';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  activePlatformSection,
  PLATFORM_LIVE_SECTIONS,
  PLATFORM_SECTION_META,
  type PlatformSectionId,
} from '@/lib/app-navigation';
import styles from './super-admin.module.css';

type Section = PlatformSectionId;

const SECTION_SET: Set<Section> = new Set(PLATFORM_LIVE_SECTIONS);
const SECTION_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(PLATFORM_SECTION_META).map((m) => [m.section, m.label]),
);
const roles = ['owner', 'admin', 'executive', 'manager', 'member', 'viewer'] as const;const statusClass = (s: string) =>
  s === 'active' || s === 'ok' || s === 'synced'
    ? styles.statusOk
    : s === 'suspended' || s === 'error'
    ? styles.statusBad
    : styles.statusNeutral;

function PlatformSuperAdminPage(){
  const router = useRouter();
  const searchParams = useSearchParams();
  // Read URL params synchronously — no useEffect round-trip, no 2-cycle delay.
  const sectionParam = searchParams?.get('section') ?? '';
  const clientOrgId = searchParams?.get('id') ?? '';
  const section = sectionParam as Section;
  const activeSection = activePlatformSection(section);
  const navigate = (s: Section, id?: string) =>
    router.replace(
      s === 'overview'
        ? '/app/platform'
        : id
        ? `/app/platform?section=${s}&id=${encodeURIComponent(id)}`
        : `/app/platform?section=${s}`,
      { scroll: false },
    );

  const [allowed,setAllowed]=useState<boolean|null>(null);
 const [orgs,setOrgs]=useState<PlatformOrg[]>([]),[packages,setPackages]=useState<PlatformPackage[]>([]),[flags,setFlags]=useState<FeatureFlag[]>([]),[packs,setPacks]=useState<ConnectorPackDto[]>([]);
 const [health,setHealth]=useState<HealthDto|null>(null),[healthSummary,setHealthSummary]=useState<PlatformHealthSummaryDto|null>(null),[audit,setAudit]=useState<PlatformAuditRow[]>([]),[auditTotal,setAuditTotal]=useState(0),[auditPageIndex,setAuditPageIndex]=useState(0),[selected,setSelected]=useState<PlatformOrg|null>(null);
 const [metrics,setMetrics]=useState<PlatformMetrics|null>(null);
 const [users,setUsers]=useState<OrgMember[]>([]),[stats,setStats]=useState<any>(null),[tier,setTier]=useState<any>(null),[settings,setSettings]=useState<OrgDateTimeSettingsDto>({timeFormat:'24h',dateStyle:'medium'});
 const [query,setQuery]=useState(''),[auditQuery,setAuditQuery]=useState(''),[auditOrg,setAuditOrg]=useState(''),[auditFrom,setAuditFrom]=useState(''),[auditTo,setAuditTo]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 // ── Client workspace state (loaded when entering ?section=client&id=ORG_ID) ──
 const [wsOrg,setWsOrg]=useState<PlatformOrg|null>(null);
 const [wsUsers,setWsUsers]=useState<OrgMember[]>([]);
 const [wsStats,setWsStats]=useState<any>(null);
 const [wsTier,setWsTier]=useState<any>(null);
 const [wsSettings,setWsSettings]=useState<OrgDateTimeSettingsDto>({timeFormat:'24h',dateStyle:'medium'});
 const [wsAudit,setWsAudit]=useState<PlatformAuditRow[]>([]);
 const [wsAuditTotal,setWsAuditTotal]=useState(0);
 const [wsConnectors,setWsConnectors]=useState<PlatformOrgConnectorDto[]>([]);
 const [wsApprovals,setWsApprovals]=useState<PlatformOrgApprovalDto[]>([]);
 const [wsRules,setWsRules]=useState<PlatformOrgRuleDto[]>([]);
 const [wsReports,setWsReports]=useState<PlatformOrgReportDto[]>([]);
 const [wsAgents,setWsAgents]=useState<PlatformOrgAgentDto[]>([]);
 const [wsSnapshot,setWsSnapshot]=useState<PlatformOrgSnapshotDto>(null);
 // Full connector installations (writable — for wizard)
 const [wsInstallations,setWsInstallations]=useState<ConnectorInstallationDto[]>([]);
 const [wsIntegrationRequests,setWsIntegrationRequests]=useState<IntegrationRequestDto[]>([]);
 const [wsDocuments,setWsDocuments]=useState<PlatformDocumentDto[]>([]);
 const [wsOrgProfile,setWsOrgProfile]=useState<PlatformOrgProfileDto|null>(null);
 const [wsTab,setWsTab]=useState<'overview'|'glance'|'timeline'|'notifications'|'approvals'|'fleet'|'people'|'inbox'|'connectors'|'rules'|'reports'|'agents'|'documents'|'users'|'audit'|'settings'|'lifecycle'>('overview');
 const [wsUser,setWsUser]=useState({email:'',fullName:'',password:'',role:'member'});
 const [wsLoading,setWsLoading]=useState(false); const [business,setBusiness]=useState({name:'',slug:'',ownerEmail:'',ownerFullName:'',ownerPassword:''});
 const [user,setUser]=useState({email:'',fullName:'',password:'',role:'member'});
const [pkg,setPkg]=useState({name:'',displayName:'',maxUsers:25,maxConnectors:5,requestsPerDay:10000,monthlyPrice:0,enableSso:false,enableCustomRoles:false,enableAgents:false,enableAdvancedBi:false,enableWebhooks:false});
 const [pkgDialog,setPkgDialog]=useState(false);
  const [aiQ,setAiQ]=useState(''),[aiA,setAiA]=useState(''),[aiBusy,setAiBusy]=useState(false);
  const [selectedPkg,setSelectedPkg]=useState<PlatformPackage|null>(null);
  const [selectedPack,setSelectedPack]=useState<ConnectorPackDto|null>(null);

  const [pkgEdit,setPkgEdit]=useState<{displayName:string;maxUsers:number;maxConnectors:number;requestsPerDay:number;monthlyPrice:number}|null>(null);
  const [packEdit,setPackEdit]=useState<{name:string;description:string}|null>(null);
  const [safeguardOp,setSafeguardOp]=useState<string|null>(null);

  function pickPackage(id:string){const p=packages.find(x=>x.id===id)||null;setSelectedPkg(p);setPkgEdit(p?{displayName:p.display_name,maxUsers:p.max_users??0,maxConnectors:p.max_connectors??0,requestsPerDay:p.requests_per_day,monthlyPrice:p.monthly_price}:null)}
  function pickPack(id:string){const p=packs.find(x=>x.id===id)||null;setSelectedPack(p);setPackEdit(p?{name:p.name,description:p.description||''}:null)}

  async function runSafeguarded(reason:string,op:string){setBusy(true);try{
    if(op==='platform.package.update'){if(!selectedPkg)return;await updatePlatformPackage(selectedPkg.id,{...(pkgEdit||{}),reason});setNotice('Package updated.')}
    else if(op==='platform.package.delete'){if(!selectedPkg)return;await deletePlatformPackage(selectedPkg.id,reason);setSelectedPkg(null);setPkgEdit(null);setNotice('Package deleted.')}
    else if(op==='platform.connector_pack.update'){if(!selectedPack)return;await updatePlatformConnectorPack(selectedPack.id,{...(packEdit||{}),reason});setNotice('Connector pack updated.')}
    else if(op==='platform.connector_pack.publish'){if(!selectedPack)return;await publishPlatformConnectorPack(selectedPack.id,reason);setNotice('Connector pack published.')}
    else if(op==='platform.connector_pack.deprecate'){if(!selectedPack)return;await deprecatePlatformConnectorPack(selectedPack.id,reason);setNotice('Connector pack deprecated.')}
    else if(op==='platform.connector_pack.delete'){if(!selectedPack)return;await deletePlatformConnectorPack(selectedPack.id,reason);setSelectedPack(null);setPackEdit(null);setNotice('Connector pack deleted.')}
    await load();
  }catch(e){setError(e instanceof Error?e.message:'Operation failed')}finally{setSafeguardOp(null);setBusy(false)}}

 const load=useCallback(async()=>{try{
    // Verify session token exists before making API calls
    const session = getSession();
    if (!session?.accessToken) {
      setError('Session expired. Please log in again.');
      setAllowed(false);
      router.push('/login');
      return;
    }
    
    const[o,p,f,h,cp,m,hs]=await Promise.all([listPlatformOrgs(),listPlatformPackages(),listPlatformFlags(),fetchHealth(),listPlatformConnectorPacks(),fetchPlatformMetrics(),fetchPlatformHealthSummary()]);
    // Filter out the platform operator's own org — it is Ellines itself, not a client.
    const ownOrgId = getSession()?.user?.organizationId;
    setOrgs(ownOrgId ? o.filter(x => x.id !== ownOrgId) : o);
    setPackages(p);setFlags(f);setHealth(h);setPacks(cp);setMetrics(m);setHealthSummary(hs)}catch(e){
      const errMsg = e instanceof Error ? e.message : 'Failed to load platform data';
      setError(errMsg);
      // If unauthorized, redirect to login
      if (errMsg.includes('Unauthorized') || errMsg.includes('401')) {
        clearSession();
        setAllowed(false);
        router.push('/login?redirect=/app/platform');
      }
    }},[router]);
  useEffect(()=>{
    let live=true;
    const decide=(s:ReturnType<typeof getSession>)=>{
      if(!live)return;
      if (!s) {
        setAllowed(false);
        setError('No active session. Please log in.');
        router.push('/login?redirect=/app/platform');
        return;
      }
      setAllowed(Boolean(s?.isPlatformAdmin));
      if(s?.isPlatformAdmin)void load()
    };
    const cached=getSession();
    if(cached?.isPlatformAdmin){
      decide(cached);
      return()=>{live=false}
    }
    void refreshSessionFlags().then(decide).catch(()=>{
      const fallback = getSession();
      if (!fallback) {
        setAllowed(false);
        setError('Session refresh failed. Please log in again.');
        router.push('/login?redirect=/app/platform');
      } else {
        decide(fallback);
      }
    });
    return()=>{live=false}
  },[load, router]);

  // Load client workspace data when navigating to ?section=client&id=ORG_ID
  useEffect(() => {
    if (activeSection !== 'client' || !clientOrgId) return;
    const org = orgs.find(o => o.id === clientOrgId) ?? null;
    setWsOrg(org);
    setWsTab('overview');
    setWsLoading(true);
    Promise.all([
      fetchPlatformOrgStats(clientOrgId),
      listPlatformOrgUsers(clientOrgId),
      fetchPlatformOrgPackage(clientOrgId),
      fetchPlatformOrgDateTimeSettings(clientOrgId),
      fetchPlatformOrgConnectors(clientOrgId),
      fetchPlatformOrgApprovals(clientOrgId),
      fetchPlatformOrgRules(clientOrgId),
      fetchPlatformOrgReports(clientOrgId),
      fetchPlatformOrgAgents(clientOrgId),
      fetchPlatformOrgSnapshot(clientOrgId),
      fetchPlatformOrgConnectorInstallations(clientOrgId),
      listPlatformOrgDocuments(clientOrgId),
      fetchPlatformOrgProfile(clientOrgId),
      listPlatformOrgIntegrationRequests(clientOrgId).catch(()=>[] as IntegrationRequestDto[]),
    ]).then(([s,u,t,d,conn,appr,rules,reports,agents,snap,inst,docs,profile,intReqs])=>{
      setWsStats(s);setWsUsers(u);setWsTier(t);setWsSettings(d);
      setWsConnectors(conn);setWsApprovals(appr);setWsRules(rules);
      setWsReports(reports);setWsAgents(agents);setWsSnapshot(snap);
      setWsInstallations(inst);setWsDocuments(docs);setWsOrgProfile(profile);
      setWsIntegrationRequests(intReqs as IntegrationRequestDto[]);
    }).catch(e=>{
      const errMsg = e instanceof Error ? e.message : 'Failed to load client workspace';
      setError(errMsg);
      if (errMsg.includes('Unauthorized') || errMsg.includes('401')) {
        clearSession();
        setAllowed(false);
        router.push('/login?redirect=/app/platform');
      }
    }).finally(()=>setWsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientOrgId, activeSection, router]);
 useEffect(()=>{if(!allowed)return;const t=setInterval(()=>{void fetchHealth().then(setHealth);void fetchPlatformMetrics().then(setMetrics);void fetchPlatformHealthSummary().then(setHealthSummary)},30000);return()=>clearInterval(t)},[allowed]);

 async function open(o:PlatformOrg){setSelected(o);setError('');try{const[s,u,p,d]=await Promise.all([fetchPlatformOrgStats(o.id),listPlatformOrgUsers(o.id),fetchPlatformOrgPackage(o.id),fetchPlatformOrgDateTimeSettings(o.id)]);setStats(s);setUsers(u);setTier(p);setSettings(d)}catch(e){setError(e instanceof Error?e.message:'Failed to load business control data')}} async function toggle(o:PlatformOrg){const next=o.status==='suspended'?'active':'suspended';if(!window.confirm(next==='suspended'?'Disconnect / suspend “'+o.name+'”? This blocks tenant access.':'Reconnect “'+o.name+'”?'))return;setBusy(true);try{const u=await updatePlatformOrgStatus(o.id,next);setOrgs(x=>x.map(v=>v.id===u.id?u:v));if(selected?.id===o.id)setSelected(u);setNotice(next==='suspended'?o.name+' disconnected.':o.name+' reconnected.')}catch(e){setError(e instanceof Error?e.message:'Status update failed')}finally{setBusy(false)}}
 async function register(e:React.FormEvent){e.preventDefault();setBusy(true);try{const r=await createPlatformOrg({name:business.name,slug:business.slug||undefined,ownerEmail:business.ownerEmail||undefined,ownerFullName:business.ownerFullName||undefined,ownerPassword:business.ownerPassword||undefined});setNotice('Business “'+r.name+'” registered.');setBusiness({name:'',slug:'',ownerEmail:'',ownerFullName:'',ownerPassword:''});await load();navigate('businesses')}catch(e){setError(e instanceof Error?e.message:'Registration failed')}finally{setBusy(false)}}
  async function createPackage(reason:string){setBusy(true);try{await createPlatformPackage({...pkg,reason});setNotice('Package “'+pkg.displayName+'” created.');setPkg({name:'',displayName:'',maxUsers:25,maxConnectors:5,requestsPerDay:10000,monthlyPrice:0,enableSso:false,enableCustomRoles:false,enableAgents:false,enableAdvancedBi:false,enableWebhooks:false});await load();setPkgDialog(false)}catch(e){setError(e instanceof Error?e.message:'Package creation failed');setPkgDialog(false)}finally{setBusy(false)}}
 async function addUser(e:React.FormEvent){e.preventDefault();if(!selected)return;setBusy(true);try{const u=await createPlatformOrgUser(selected.id,user);setUsers(x=>[u,...x]);setUser({email:'',fullName:'',password:'',role:'member'});setNotice('User created.')}catch(e){setError(e instanceof Error?e.message:'User creation failed')}finally{setBusy(false)}}
 async function toggleUser(u:OrgMember){if(!selected)return;setBusy(true);try{const x=await updatePlatformOrgUser(selected.id,u.id,{isActive:!u.isActive});setUsers(v=>v.map(z=>z.id===x.id?x:z))}catch(e){setError(e instanceof Error?e.message:'User update failed')}finally{setBusy(false)}}
 async function saveDate(){if(!selected)return;setBusy(true);try{await updatePlatformOrgDateTimeSettings(selected.id,settings);setNotice('Tenant settings saved.')}catch(e){setError(e instanceof Error?e.message:'Settings update failed')}finally{setBusy(false)}}
 async function loadAudit(page = auditPageIndex){try{const r=await listPlatformAuditLogs({action:auditQuery||undefined,orgId:auditOrg||undefined,from:auditFrom||undefined,to:auditTo||undefined,limit:50,offset:page*50});setAudit(r.rows);setAuditTotal(r.total);setAuditPageIndex(page)}catch(e){setError(e instanceof Error?e.message:'Audit load failed')}}
 async function exportAudit(){try{const blob=await exportPlatformAuditLogs({action:auditQuery||undefined,orgId:auditOrg||undefined,from:auditFrom||undefined,to:auditTo||undefined});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='eip-platform-audit.csv';a.click();URL.revokeObjectURL(url)}catch(e){setError(e instanceof Error?e.message:'Audit export failed')}} async function migrateEncryption(dryRun:boolean){setBusy(true);try{const r=await migratePlatformEncryption(dryRun,selected?.id);setNotice((dryRun?'Dry run: ':'')+'scanned '+r.scanned+', migrated '+r.migrated+', current '+r.alreadyCurrent+', failed '+r.failed+'.')}catch(e){setError(e instanceof Error?e.message:'Encryption migration failed')}finally{setBusy(false)}}
 async function askAI(e:React.FormEvent){e.preventDefault();if(!aiQ.trim())return;setAiBusy(true);try{const r=await askEllineaApi({question:aiQ,summary:null,memory:[],templateAnswer:'Use only live platform evidence; state when evidence is unavailable.',role:'platform_super_admin',organizationName:'Ellines EIP Platform'});setAiA(r.answer)}catch(e){setAiA(e instanceof Error?e.message:'AI request failed')}finally{setAiBusy(false)}}

 const shown=useMemo(()=>{const q=query.toLowerCase().trim();return q?orgs.filter(o=>[o.name,o.slug,o.status].some(v=>v.toLowerCase().includes(q))):orgs},[orgs,query]);
 const active=orgs.filter(o=>o.status==='active').length,suspended=orgs.length-active,totalUsers=orgs.reduce((n,o)=>n+o.userCount,0);
 if(allowed===null)return <main className={styles.main}>Checking platform access…</main>;
 if(!allowed){
   const session = getSession();
   return <main className={styles.main}><div className={styles.card}><h2>Platform access denied</h2><p className={styles.cardHint}>Ellines platform operator access is required.</p>{session && <div style={{marginTop:16,padding:12,background:'#f5f5f5',borderRadius:4,fontSize:11,fontFamily:'monospace'}}><strong>Current session:</strong><br/>Email: {session.user?.email || 'N/A'}<br/>Role: {session.user?.role || 'N/A'}<br/>Org: {session.organization?.name || 'N/A'}<br/>Platform Admin: {session.isPlatformAdmin ? 'Yes' : 'No'}<br/><br/><em>Only email "{process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS || 'ellines.tech@gmail.com'}" can access this control plane.</em></div>}{!session && <p style={{marginTop:16,color:'#666'}}>No active session found. <a href="/login?redirect=/app/platform" style={{color:'#2563EB'}}>Log in</a></p>}</div></main>;
 }

 const businessTable=(items:PlatformOrg[]) => <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Business</th><th>Status</th><th>Users</th><th>Created</th><th>Control</th></tr></thead><tbody>{items.map(o=><tr key={o.id}><td><strong>{o.name}</strong><br/><span className={styles.muted}>{o.slug}</span></td><td><span className={styles.status+' '+statusClass(o.status)}>{o.status}</span></td><td>{o.userCount}</td><td>{new Date(o.createdAt).toLocaleDateString()}</td><td><button className={styles.button+' '+styles.primary} onClick={()=>navigate('client',o.id)}>Open workspace</button>{' '}<button className={styles.button+' '+(o.status==='active'?styles.danger:styles.success)} disabled={busy} onClick={()=>void toggle(o)}>{o.status==='active'?'Disconnect':'Reconnect'}</button></td></tr>)}{!items.length&&<tr><td colSpan={5}>No client organizations found.</td></tr>}</tbody></table></div>;

 const overview=<><div className={styles.hero}><h2>Ellines EIP Control Plane</h2><p>This is the platform operating system — not a customer dashboard. Operate EIP itself, onboard businesses, assign services, troubleshoot tenants, control access, inspect security activity and configure the platform. Customer connectors are business services, not EIP infrastructure.</p><div className={styles.quick}><button className={styles.button+' '+styles.primary} onClick={()=>navigate('onboarding')}>+ Register client</button><button className={styles.button} onClick={()=>navigate('businesses')}>Client portfolio</button><button className={styles.button} onClick={()=>navigate('packages')}>Service packages</button><button className={styles.button} onClick={()=>navigate('health')}>Diagnostics</button></div></div>
 <div className={styles.grid4}><Kpi label="Businesses onboarded" value={metrics?.platform?.businesses ?? orgs.length} hint="tenant accounts"/><Kpi label="Active tenant users" value={metrics?.platform?.activeUsers ?? totalUsers} hint="currently active" cls={styles.ok}/><Kpi label="Disconnected" value={suspended} hint="access blocked" cls={suspended?styles.warn:styles.ok}/><Kpi label="API requests / 24h" value={metrics?.platform?.apiRequests24h ?? '—'} hint="real platform usage"/></div>
 <div className={styles.grid4+' '+styles.section}><Kpi label="Audit events / 24h" value={metrics?.platform?.auditEvents24h ?? '—'} hint="operator/system activity"/><Kpi label="Rate-limit violations" value={metrics?.platform?.rateLimitViolations24h ?? '—'} hint="last 24 hours" cls={metrics?.platform?.rateLimitViolations24h?styles.warn:styles.ok}/><Kpi label="Customer integrations" value={metrics?.businessServices?.connectorInstallations ?? '—'} hint="business service layer"/><Kpi label="Failed integrations" value={metrics?.businessServices?.failedConnectorInstallations ?? '—'} hint="customer troubleshooting" cls={metrics?.businessServices?.failedConnectorInstallations?styles.warn:styles.ok}/></div>
 <div className={styles.grid2+' '+styles.section}><div className={styles.card}><CardTitle title="Core EIP health" hint="System performance of EIP itself."/><div className={styles.grid2}><Service title="API" text={health?.status||'unknown'}/><Service title="Version" text={health?.version||'—'}/><Service title="Email" text={health?.email?.live?'Live · '+health.email.provider:'Not configured'}/><Service title="Feature controls" text={flags.filter(f=>f.enabled).length+'/'+flags.length+' enabled'}/></div></div><div className={styles.card}><CardTitle title="Operator attention" hint="Issues visible from current telemetry."/><Service title={suspended?suspended+' disconnected business'+(suspended===1?'':'es'):'No disconnected businesses'} text={suspended?'Review and reconnect where appropriate.':'Tenant lifecycle is clear.'}/><Service title={health?.status==='ok'?'Platform healthy':'Platform health requires attention'} text={health?.status==='ok'?'Health endpoint reports OK.':'Open diagnostics for investigation.'}/></div></div>
 <div className={styles.card+' '+styles.section}><CardTitle title="Recent businesses" hint="Fast tenant control."/><button className={styles.button} onClick={()=>navigate('businesses')}>Open all</button>{businessTable(orgs.slice(0,8))}</div></>;

 const businesses=<div className={styles.card}><CardTitle title="Business control" hint="Suspend/disconnect, inspect users, assign packages and troubleshoot every onboarded business."/><div style={{display:'flex',gap:8,marginBottom:12}}><input className={styles.input} placeholder="Search business, slug or status…" value={query} onChange={e=>setQuery(e.target.value)}/><button className={styles.button+' '+styles.primary} onClick={()=>navigate('onboarding')}>+ Register</button></div>{businessTable(shown)}</div>;

 const onboarding=<div className={styles.grid2}><form className={styles.card} onSubmit={register}><CardTitle title="Register business" hint="Create a tenant and optionally its first owner."/><div className={styles.form}><Field label="Business name" value={business.name} set={v=>setBusiness({...business,name:v})} placeholder="Acme Holdings Ltd"/><Field label="Slug" value={business.slug} set={v=>setBusiness({...business,slug:v})} placeholder="acme-holdings"/><Field label="Owner name" value={business.ownerFullName} set={v=>setBusiness({...business,ownerFullName:v})}/><Field label="Owner email" value={business.ownerEmail} set={v=>setBusiness({...business,ownerEmail:v})} type="email"/><Field label="Owner password" value={business.ownerPassword} set={v=>setBusiness({...business,ownerPassword:v})} type="password"/><div className={styles.full}><button className={styles.button+' '+styles.primary} disabled={busy||!business.name}>Register business</button></div></div></form><div className={styles.card}><CardTitle title="Onboarding sequence" hint="Keep customer-specific integrations separate from the EIP platform."/><Service title="01 · Tenant" text="Business identity, owner and lifecycle state."/><Service title="02 · Package" text="Assign the commercial capability envelope."/><Service title="03 · Integrations" text="Configure business connectors only when the customer requires them."/><Service title="04 · Verify" text="Check users, health and audit history before handoff."/></div></div>;

 const packagesPage=<><div className={styles.grid2}><div className={styles.card}><CardTitle title="Service packages" hint="Commercial capability bundles. These are not connector infrastructure."/><div className={styles.grid2}>{packages.map(p=><Service key={p.id} title={p.display_name} text={p.name+' · '+(p.monthly_price?'KES '+(p.monthly_price/100).toLocaleString()+'/month':'Custom pricing')} tags={[p.max_users?p.max_users+' users':'∞ users',p.max_connectors?p.max_connectors+' integrations':'∞ integrations',p.enable_sso?'SSO':'',p.enable_agents?'Agents':'',p.enable_advanced_bi?'Advanced BI':''].filter(Boolean)}/>)}</div></div><div className={styles.card}><CardTitle title="Create package" hint="Build a service tier for onboarding."/><div className={styles.form}><Field label="Internal name" value={pkg.name} set={v=>setPkg({...pkg,name:v})}/><Field label="Display name" value={pkg.displayName} set={v=>setPkg({...pkg,displayName:v})}/><Field label="Max users" value={String(pkg.maxUsers)} set={v=>setPkg({...pkg,maxUsers:Number(v)})} type="number"/><Field label="Max integrations" value={String(pkg.maxConnectors)} set={v=>setPkg({...pkg,maxConnectors:Number(v)})} type="number"/><Field label="Requests/day" value={String(pkg.requestsPerDay)} set={v=>setPkg({...pkg,requestsPerDay:Number(v)})} type="number"/><Field label="Monthly price (cents)" value={String(pkg.monthlyPrice)} set={v=>setPkg({...pkg,monthlyPrice:Number(v)})} type="number"/><div className={styles.full}>{(['enableSso','enableCustomRoles','enableAgents','enableAdvancedBi','enableWebhooks'] as const).map(k=><label key={k} style={{display:'block',fontSize:11,margin:'6px 0'}}><input type="checkbox" checked={pkg[k]} onChange={e=>setPkg({...pkg,[k]:e.target.checked})}/> {k.replace('enable','')}</label>)}</div><div className={styles.full}><button className={styles.button+' '+styles.primary} disabled={busy||!pkg.name||!pkg.displayName} onClick={()=>setPkgDialog(true)}>Create package</button></div></div></div></div><div className={styles.card+' '+styles.section}><CardTitle title="Business integration catalog" hint="Connector packs live here because they are customer services, not platform health dependencies."/><div className={styles.grid3}>{packs.map(p=><Service key={p.id} title={p.name} text={p.description||'Integration template'} tags={[p.catalogId,p.published?'Published':'Draft']}/>)}</div></div><div className={styles.grid2}><div className={styles.card}><CardTitle title="Manage package" hint="Edit or delete a package. Every privileged change requires a recorded reason."/><select className={styles.select} value={selectedPkg?.id||''} onChange={e=>pickPackage(e.target.value)}><option value="">Select package</option>{packages.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select>{selectedPkg&&pkgEdit&&<div className={styles.form} style={{marginTop:12}}><Field label="Display name" value={pkgEdit.displayName} set={v=>setPkgEdit({...pkgEdit,displayName:v})}/><Field label="Max users" type="number" value={String(pkgEdit.maxUsers)} set={v=>setPkgEdit({...pkgEdit,maxUsers:Number(v)})}/><Field label="Max integrations" type="number" value={String(pkgEdit.maxConnectors)} set={v=>setPkgEdit({...pkgEdit,maxConnectors:Number(v)})}/><Field label="Requests/day" type="number" value={String(pkgEdit.requestsPerDay)} set={v=>setPkgEdit({...pkgEdit,requestsPerDay:Number(v)})}/><Field label="Monthly price (cents)" type="number" value={String(pkgEdit.monthlyPrice)} set={v=>setPkgEdit({...pkgEdit,monthlyPrice:Number(v)})}/><div className={styles.full}><button className={styles.button+' '+styles.primary} disabled={busy} onClick={()=>setSafeguardOp('platform.package.update')}>Save changes</button><button className={styles.button+' '+styles.danger} disabled={busy} onClick={()=>setSafeguardOp('platform.package.delete')}>Delete package</button></div></div>}</div><div className={styles.card}><CardTitle title="Manage connector pack" hint="Edit, publish, deprecate or delete a pack. Every privileged change requires a recorded reason."/><select className={styles.select} value={selectedPack?.id||''} onChange={e=>pickPack(e.target.value)}><option value="">Select pack</option>{packs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>{selectedPack&&packEdit&&<div className={styles.form} style={{marginTop:12}}><Field label="Name" value={packEdit.name} set={v=>setPackEdit({...packEdit,name:v})}/><Field label="Description" value={packEdit.description} set={v=>setPackEdit({...packEdit,description:v})}/><div className={styles.full}><button className={styles.button+' '+styles.primary} disabled={busy} onClick={()=>setSafeguardOp('platform.connector_pack.update')}>Save changes</button><button className={styles.button} disabled={busy} onClick={()=>setSafeguardOp(selectedPack.published?'platform.connector_pack.deprecate':'platform.connector_pack.publish')}>{selectedPack.published?'Deprecate':'Publish'}</button><button className={styles.button+' '+styles.danger} disabled={busy} onClick={()=>setSafeguardOp('platform.connector_pack.delete')}>Delete pack</button></div></div>}</div></div></>;

 const access=<div className={styles.grid2}><div className={styles.card}><CardTitle title="Tenant access" hint="Select a business to manage its users."/><select className={styles.select} value={selected?.id||''} onChange={e=>{const o=orgs.find(x=>x.id===e.target.value);if(o)void open(o)}}><option value="">Select business</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select>{selected&&<form className={styles.form} style={{marginTop:12}} onSubmit={addUser}><Field label="Full name" value={user.fullName} set={v=>setUser({...user,fullName:v})}/><Field label="Email" value={user.email} set={v=>setUser({...user,email:v})}/><Field label="Password" value={user.password} set={v=>setUser({...user,password:v})} type="password"/><label className={styles.field}><span>Role</span><select className={styles.select} value={user.role} onChange={e=>setUser({...user,role:e.target.value})}>{roles.map(r=><option key={r}>{r}</option>)}</select></label><div className={styles.full}><button className={styles.button+' '+styles.primary} disabled={busy}>Add user</button></div></form>}</div><div className={styles.card}><CardTitle title={selected?selected.name:'Users'} hint={users.length+' loaded'}/>{users.map(u=><div className={styles.service} key={u.id} style={{marginBottom:8}}><strong>{u.fullName}</strong><p>{u.email} · {u.role}</p><button className={styles.button+' '+(u.isActive?styles.danger:styles.success)} onClick={()=>void toggleUser(u)}>{u.isActive?'Deactivate':'Activate'}</button></div>)}</div></div>;

 const healthPage=<><div className={styles.grid4}><Kpi label="Platform" value={healthSummary?.status||health?.status||'unknown'} hint="probed control plane" cls={healthSummary?.status==='ok'?styles.ok:styles.warn}/><Kpi label="Database" value={healthSummary?.dependencies.find(d=>d.name==='database')?.status||'unknown'} hint="live dependency probe"/><Kpi label="Email" value={healthSummary?.dependencies.find(d=>d.name==='email')?.status||'unknown'} hint={healthSummary?.dependencies.find(d=>d.name==='email')?.provider||'provider'}/><Kpi label="Checked" value={healthSummary?.checkedAt?new Date(healthSummary.checkedAt).toLocaleTimeString():'—'} hint="latest probe"/></div><div className={styles.card+' '+styles.section}><CardTitle title="Tenant diagnostics" hint="Business integration health is inspected here; it is not EIP core infrastructure."/>{businessTable(orgs)}</div></>;

 const auditPage=<div className={styles.card}><CardTitle title="Security & audit center" hint="Cross-business operator activity for investigation and accountability."/><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8,marginBottom:12}}><input className={styles.input} placeholder="Action prefix e.g. platform." value={auditQuery} onChange={e=>setAuditQuery(e.target.value)}/><select className={styles.select} value={auditOrg} onChange={e=>setAuditOrg(e.target.value)}><option value="">All businesses</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select><input className={styles.input} type="date" value={auditFrom} onChange={e=>setAuditFrom(e.target.value)}/><input className={styles.input} type="date" value={auditTo} onChange={e=>setAuditTo(e.target.value)}/></div><div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}><button className={styles.button+' '+styles.primary} onClick={()=>void loadAudit(0)}>Search</button><button className={styles.button} onClick={()=>void exportAudit()}>Export CSV</button><span className={styles.muted}>{auditTotal} matching events</span><button className={styles.button} disabled={busy} onClick={()=>void migrateEncryption(true)}>Dry-run credential migration</button><button className={styles.button+' '+styles.danger} disabled={busy} onClick={()=>{if(window.confirm('Migrate all legacy database credentials to the current master-key encryption format?'))void migrateEncryption(false)}}>Run encryption migration</button></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Time</th><th>Business</th><th>Actor</th><th>Action</th><th>Resource</th></tr></thead><tbody>{audit.map(a=><tr key={a.id}><td>{new Date(a.createdAt).toLocaleString()}</td><td>{a.organizationName||a.organizationId}</td><td>{a.userEmail||'system'}</td><td>{a.action}</td><td>{a.resource}</td></tr>)}{!audit.length&&<tr><td colSpan={5}>No rows loaded.</td></tr>}</tbody></table></div><div style={{display:'flex',gap:8,marginTop:12}}><button className={styles.button} disabled={auditPageIndex===0} onClick={()=>void loadAudit(auditPageIndex-1)}>Previous</button><button className={styles.button} disabled={(auditPageIndex+1)*50>=auditTotal} onClick={()=>void loadAudit(auditPageIndex+1)}>Next</button></div></div>;

 const aiPage=<div className={styles.grid2}><div className={styles.card}><CardTitle title="Ellinea AI — platform operator" hint="Evidence-backed investigation and summaries; authorization remains with the operator."/><form onSubmit={askAI}><textarea className={styles.input} style={{minHeight:130,resize:'vertical'}} placeholder="Ask about platform operations or a business…" value={aiQ} onChange={e=>setAiQ(e.target.value)}/><button className={styles.button+' '+styles.primary} disabled={aiBusy||!aiQ.trim()}>{aiBusy?'Thinking…':'Ask Ellinea'}</button></form></div><div className={styles.card}><CardTitle title="AI response" hint="No answer is treated as an authorization."/><p className={styles.cardHint}>{aiA||'No response yet.'}</p></div></div>;

 const config=<div className={styles.grid2}><div className={styles.card}><CardTitle title="Global feature controls" hint="Platform-wide switches." />{flags.map(f=><div className={styles.service} key={f.key} style={{marginBottom:8}}><strong>{f.label}</strong><p>{f.note}</p><button className={styles.button+' '+(f.enabled?styles.success:'')} onClick={async()=>{try{const r=await updatePlatformFlag(f.key,!f.enabled);setFlags(r.data);setNotice(f.label+' updated.')}catch(e){setError(e instanceof Error?e.message:'Flag update failed')}}}>{f.enabled?'Enabled':'Disabled'}</button></div>)}</div><div className={styles.card}><CardTitle title="Tenant date & time" hint="Platform operator controls presentation for an onboarded business."/><select className={styles.select} value={selected?.id||''} onChange={e=>{const o=orgs.find(x=>x.id===e.target.value);if(o)void open(o)}}><option value="">Select business</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select>{selected&&<div className={styles.form} style={{marginTop:12}}><label className={styles.field}><span>Time format</span><select className={styles.select} value={settings.timeFormat} onChange={e=>setSettings({...settings,timeFormat:e.target.value as '12h'|'24h'})}><option value="12h">12-hour</option><option value="24h">24-hour</option></select></label><label className={styles.field}><span>Date style</span><select className={styles.select} value={settings.dateStyle} onChange={e=>setSettings({...settings,dateStyle:e.target.value as OrgDateTimeSettingsDto['dateStyle']})}><option value="short">Short</option><option value="medium">Medium</option><option value="log">Log</option></select></label><div className={styles.full}><button className={styles.button+' '+styles.primary} onClick={()=>void saveDate()}>Save</button></div></div>}</div></div>;

  // ── section resolver ────────────────────────────────────────────────────────
  // Every live section maps to a JSX variable. Reserved sections (available:false
  // in app-navigation.ts) render an honest "Planned" state — no fake data.
  const meta = PLATFORM_SECTION_META[activeSection];
  const isReserved = meta ? !meta.available : false;

  const clientHealthPage = (
    <div className={styles.grid2}>
      <div className={styles.card}>
        <CardTitle title="Client health overview" hint="Cross-tenant integration health visible from the platform layer." />
        {businessTable(orgs)}
      </div>
      <div className={styles.card}>
        <CardTitle title="Platform health" hint="EIP control-plane status." />
        <div className={styles.grid2}>
          <Service title="API" text={health?.status || 'unknown'} />
          <Service title="Version" text={health?.version || '—'} />
          <Service title="Email" text={health?.email?.live ? `Live · ${health.email.provider}` : 'Not configured'} />
          <Service title="DB" text={healthSummary?.dependencies.find(d => d.name === 'database')?.status || 'unknown'} />
        </div>
      </div>
    </div>
  );

  const clientConfigurationPage = (
    <div className={styles.grid2}>
      <div className={styles.card}>
        <CardTitle title="Tenant date & time" hint="Override presentation settings for a specific business." />
        <select className={styles.select} value={selected?.id || ''} onChange={e => { const o = orgs.find(x => x.id === e.target.value); if (o) void open(o); }}>
          <option value="">Select client organization</option>
          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {selected && (
          <div className={styles.form} style={{ marginTop: 12 }}>
            <label className={styles.field}>
              <span>Time format</span>
              <select className={styles.select} value={settings.timeFormat} onChange={e => setSettings({ ...settings, timeFormat: e.target.value as '12h' | '24h' })}>
                <option value="12h">12-hour</option>
                <option value="24h">24-hour</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Date style</span>
              <select className={styles.select} value={settings.dateStyle} onChange={e => setSettings({ ...settings, dateStyle: e.target.value as OrgDateTimeSettingsDto['dateStyle'] })}>
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="log">Log</option>
              </select>
            </label>
            <div className={styles.full}>
              <button className={`${styles.button} ${styles.primary}`} onClick={() => void saveDate()}>Save</button>
            </div>
          </div>
        )}
      </div>
      <div className={styles.card}>
        <CardTitle title="Package assignment" hint="Assign a service package to any client organization." />
        <select className={styles.select} value={selected?.id || ''} onChange={e => { const o = orgs.find(x => x.id === e.target.value); if (o) void open(o); }}>
          <option value="">Select client organization</option>
          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {selected && (
          <div style={{ marginTop: 12 }}>
            <select className={styles.select} value={tier?.rate_limit_tiers?.id || ''} onChange={async e => { try { await assignPlatformOrgPackage(selected.id, { tierId: e.target.value }); setNotice('Package assigned.'); await open(selected); } catch (err) { setError(err instanceof Error ? err.message : 'Assignment failed'); } }}>
              <option value="">No package</option>
              {packages.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
          </div>
        )}
      </div>
    </div>
  );

  const clientAuditPage = (
    <div className={styles.card}>
      <CardTitle title="Client audit log" hint="Activity across all client organizations visible from the platform layer." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8, marginBottom: 12 }}>
        <input className={styles.input} placeholder="Action prefix e.g. org." value={auditQuery} onChange={e => setAuditQuery(e.target.value)} />
        <select className={styles.select} value={auditOrg} onChange={e => setAuditOrg(e.target.value)}>
          <option value="">All client organizations</option>
          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <input className={styles.input} type="date" value={auditFrom} onChange={e => setAuditFrom(e.target.value)} />
        <input className={styles.input} type="date" value={auditTo} onChange={e => setAuditTo(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className={`${styles.button} ${styles.primary}`} onClick={() => void loadAudit(0)}>Search</button>
        <button className={styles.button} onClick={() => void exportAudit()}>Export CSV</button>
        <span className={styles.muted}>{auditTotal} matching events</span>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Time</th><th>Client org</th><th>Actor</th><th>Action</th><th>Resource</th></tr></thead>
          <tbody>
            {audit.map(a => (
              <tr key={a.id}>
                <td>{new Date(a.createdAt).toLocaleString()}</td>
                <td>{a.organizationName || a.organizationId}</td>
                <td>{a.userEmail || 'system'}</td>
                <td>{a.action}</td>
                <td>{a.resource}</td>
              </tr>
            ))}
            {!audit.length && <tr><td colSpan={5}>No rows loaded. Run a search above.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className={styles.button} disabled={auditPageIndex === 0} onClick={() => void loadAudit(auditPageIndex - 1)}>Previous</button>
        <button className={styles.button} disabled={(auditPageIndex + 1) * 50 >= auditTotal} onClick={() => void loadAudit(auditPageIndex + 1)}>Next</button>
      </div>
    </div>
  );

  const Planned = ({ title, note }: { title: string; note?: string }) => (
    <div className={styles.planned}>
      <h3>{title}</h3>
      <p>{note || 'This capability is in the build queue. The navigation architecture is reserved for it. No fake routes or data are created here.'}</p>
    </div>
  );

  // ── TASK-13: Services & Entitlements ──────────────────────────────────────
  const clientServicesPage = (
    <div>
      <div className={styles.card} style={{marginBottom:12}}>
        <CardTitle title="Client services & entitlements" hint="Package assignments and entitlement usage across all client organisations."/>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Client</th><th>Package</th><th>Users</th><th>Integrations</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {orgs.map(o => (
                <tr key={o.id}>
                  <td><strong>{o.name}</strong><br/><span className={styles.muted}>{o.slug}</span></td>
                  <td><span className={styles.muted}>—</span></td>
                  <td>{o.userCount}</td>
                  <td>—</td>
                  <td><span className={`${styles.status} ${o.status==='active'?styles.statusOk:styles.statusBad}`}>{o.status}</span></td>
                  <td><button className={`${styles.button} ${styles.primary}`} style={{fontSize:11}} onClick={()=>navigate('client',o.id)}>Open workspace</button></td>
                </tr>
              ))}
              {!orgs.length && <tr><td colSpan={6}>No client organisations found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className={styles.card}>
        <CardTitle title="How to manage packages" hint="Package assignment changes a client's entitlement envelope."/>
        <Service title="1. Open workspace" text="Click 'Open workspace' on any client row above."/>
        <Service title="2. Go to Settings tab" text="The Settings tab in the client workspace shows the current package and allows reassignment."/>
        <Service title="3. Assign package" text="Select a package from the dropdown. Changes take effect immediately."/>
      </div>
    </div>
  );

  // ── TASK-14: Activity & Usage ──────────────────────────────────────────────
  const clientActivityPage = (
    <div className={styles.card}>
      <CardTitle title="Activity & usage" hint="Cross-client audit activity. Filter by client, action or date range."/>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8,marginBottom:12}}>
        <input className={styles.input} placeholder="Action prefix e.g. connector." value={auditQuery} onChange={e=>setAuditQuery(e.target.value)}/>
        <select className={styles.select} value={auditOrg} onChange={e=>setAuditOrg(e.target.value)}>
          <option value="">All client organisations</option>
          {orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <input className={styles.input} type="date" value={auditFrom} onChange={e=>setAuditFrom(e.target.value)}/>
        <input className={styles.input} type="date" value={auditTo} onChange={e=>setAuditTo(e.target.value)}/>
      </div>
      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
        <button className={`${styles.button} ${styles.primary}`} onClick={()=>void loadAudit(0)}>Search</button>
        <button className={styles.button} onClick={()=>void exportAudit()}>Export CSV</button>
        <span className={styles.muted}>{auditTotal} matching events</span>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Time</th><th>Client</th><th>Actor</th><th>Action</th><th>Resource</th></tr></thead>
          <tbody>
            {audit.map(a=>(
              <tr key={a.id}>
                <td style={{fontSize:11}}>{new Date(a.createdAt).toLocaleString()}</td>
                <td>{a.organizationName||a.organizationId}</td>
                <td style={{fontSize:11}}>{a.userEmail||'system'}</td>
                <td style={{fontSize:11}}>{a.action}</td>
                <td style={{fontSize:11}}>{a.resource}</td>
              </tr>
            ))}
            {!audit.length&&<tr><td colSpan={5}>Run a search above to load activity.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{display:'flex',gap:8,marginTop:12}}>
        <button className={styles.button} disabled={auditPageIndex===0} onClick={()=>void loadAudit(auditPageIndex-1)}>Previous</button>
        <button className={styles.button} disabled={(auditPageIndex+1)*50>=auditTotal} onClick={()=>void loadAudit(auditPageIndex+1)}>Next</button>
      </div>
    </div>
  );

  // ── TASK-15: Alerts & Issues ──────────────────────────────────────────────
  const clientAlertsPage = (
    <div>
      <div className={styles.grid4} style={{marginBottom:12}}>
        <Kpi label="Suspended clients" value={orgs.filter(o=>o.status==='suspended').length} hint="access blocked" cls={orgs.filter(o=>o.status==='suspended').length?styles.warn:styles.ok}/>
        <Kpi label="Total clients" value={orgs.length} hint="onboarded"/>
        <Kpi label="Failed integrations" value={metrics?.businessServices?.failedConnectorInstallations??'—'} hint="connector errors" cls={metrics?.businessServices?.failedConnectorInstallations?styles.warn:styles.ok}/>
        <Kpi label="Total integrations" value={metrics?.businessServices?.connectorInstallations??'—'} hint="installed"/>
      </div>
      <div className={styles.card} style={{marginBottom:12}}>
        <CardTitle title="Connector errors across all clients" hint="Installations currently in error state. Click a client to open its workspace."/>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Client</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {orgs.filter(o=>o.status!=='active').map(o=>(
                <tr key={o.id}>
                  <td><strong>{o.name}</strong><br/><span className={styles.muted}>{o.slug}</span></td>
                  <td><span className={`${styles.status} ${styles.statusBad}`}>{o.status}</span></td>
                  <td><button className={`${styles.button} ${styles.primary}`} style={{fontSize:11}} onClick={()=>navigate('client',o.id)}>Open workspace</button></td>
                </tr>
              ))}
              {!orgs.filter(o=>o.status!=='active').length&&(
                <tr><td colSpan={3} style={{color:'#34d399',fontWeight:600}}>✓ No suspended or disconnected clients</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className={styles.card}>
        <CardTitle title="How to triage an alert" hint="Step-by-step connector error resolution."/>
        <Service title="1. Open client workspace" text="Click the client in the table above → Connectors tab."/>
        <Service title="2. Identify the failed connector" text="Status = error. Check the last message column for the error detail."/>
        <Service title="3. Edit credentials" text="Click Edit on the connector, update credentials, then Test connection."/>
        <Service title="4. Sync" text="Once the test passes, click Sync now to restore the live data feed."/>
      </div>
    </div>
  );

  function resolveContent() {
    if (isReserved) return <Planned title={meta?.label ?? 'Planned'} note={meta?.note} />;
    switch (activeSection) {
      case 'overview':         return overview;
      case 'businesses':       return businesses;
      case 'onboarding':       return onboarding;
      case 'packages':         return packagesPage;
      case 'access':           return access;
      case 'health':           return healthPage;
      case 'client-health':    return clientHealthPage;
      case 'client-configuration': return clientConfigurationPage;
      case 'client-audit':     return clientAuditPage;
      case 'services':         return clientServicesPage;
      case 'activity':         return clientActivityPage;
      case 'alerts':           return clientAlertsPage;
      case 'audit':            return auditPage;
      case 'configuration':    return config;
      case 'ai':               return aiPage;
      case 'client':           return <ClientWorkspace
          org={wsOrg}
          orgId={clientOrgId}
          users={wsUsers}
          stats={wsStats}
          tier={wsTier}
          settings={wsSettings}
          audit={wsAudit}
          auditTotal={wsAuditTotal}
          connectors={wsConnectors}
          approvals={wsApprovals}
          rules={wsRules}
          reports={wsReports}
          agents={wsAgents}
          snapshot={wsSnapshot}
          installations={wsInstallations}
          documents={wsDocuments}
          orgProfile={wsOrgProfile}
          availablePacks={packs}
          packages={packages}
          loading={wsLoading}
          busy={busy}
          tab={wsTab}
          setTab={setWsTab}
          wsUser={wsUser}
          setWsUser={setWsUser}
          error={error}
          notice={notice}
          onBack={() => navigate('businesses')}
          onToggle={(o) => void toggle(o)}
          onAddUser={async (e) => {
            e.preventDefault();
            if (!clientOrgId) return;
            setBusy(true);
            try {
              const u = await createPlatformOrgUser(clientOrgId, wsUser);
              setWsUsers(v => [u, ...v]);
              setWsUser({ email: '', fullName: '', password: '', role: 'member' });
              setNotice('User created.');
            } catch (err) { setError(err instanceof Error ? err.message : 'User creation failed'); }
            finally { setBusy(false); }
          }}
          onToggleUser={async (u) => {
            if (!clientOrgId) return;
            setBusy(true);
            try {
              const x = await updatePlatformOrgUser(clientOrgId, u.id, { isActive: !u.isActive });
              setWsUsers(v => v.map(z => z.id === x.id ? x : z));
            } catch (err) { setError(err instanceof Error ? err.message : 'User update failed'); }
            finally { setBusy(false); }
          }}
          onAssignPackage={async (tierId) => {
            if (!clientOrgId) return;
            try {
              await assignPlatformOrgPackage(clientOrgId, { tierId });
              setNotice('Package assigned.');
              const t = await fetchPlatformOrgPackage(clientOrgId);
              setWsTier(t);
            } catch (err) { setError(err instanceof Error ? err.message : 'Assignment failed'); }
          }}
          onSaveSettings={async () => {
            if (!clientOrgId) return;
            setBusy(true);
            try {
              await updatePlatformOrgDateTimeSettings(clientOrgId, wsSettings);
              setNotice('Settings saved.');
            } catch (err) { setError(err instanceof Error ? err.message : 'Save failed'); }
            finally { setBusy(false); }
          }}
          onSettingsChange={setWsSettings}
          onSaveOrgName={async (name) => {
            if (!clientOrgId) return;
            setBusy(true);
            try {
              const p = await updatePlatformOrgProfile(clientOrgId, name);
              setWsOrgProfile(p);
              setNotice('Organization name saved.');
            } catch (err) { setError(err instanceof Error ? err.message : 'Save failed'); }
            finally { setBusy(false); }
          }}
          onInstallConnector={async (body) => {
            if (!clientOrgId) return null;
            const inst = await createPlatformOrgConnector(clientOrgId, body);
            setWsInstallations(v => [inst, ...v]);
            return inst;
          }}
          onUpdateConnector={async (connId, body) => {
            if (!clientOrgId) return null;
            const inst = await updatePlatformOrgConnector(clientOrgId, connId, body);
            setWsInstallations(v => v.map(x => x.id === inst.id ? inst : x));
            return inst;
          }}
          onDeleteConnector={async (connId) => {
            if (!clientOrgId) return;
            await deletePlatformOrgConnector(clientOrgId, connId);
            setWsInstallations(v => v.filter(x => x.id !== connId));
          }}
          onTestConnector={async (connId) => {
            if (!clientOrgId) return { ok: false, message: 'No org' };
            return testPlatformOrgConnector(clientOrgId, connId);
          }}
          onSyncConnector={async (connId) => {
            if (!clientOrgId) return;
            const summary = await syncPlatformOrgConnector(clientOrgId, connId);
            // Refresh installations after sync
            const updated = await fetchPlatformOrgConnectorInstallations(clientOrgId);
            setWsInstallations(updated);
            return summary;
          }}
          onUploadDocument={async (body) => {
            if (!clientOrgId) return;
            const doc = await uploadPlatformOrgDocument(clientOrgId, body);
            setWsDocuments(v => [doc, ...v]);
          }}
          onDeleteDocument={async (docId) => {
            if (!clientOrgId) return;
            await deletePlatformOrgDocument(clientOrgId, docId);
            setWsDocuments(v => v.filter(d => d.id !== docId));
          }}
          onLoadAudit={async () => {
            try {
              const r = await listPlatformAuditLogs({ orgId: clientOrgId, limit: 50, offset: 0 });
              setWsAudit(r.rows);
              setWsAuditTotal(r.total);
            } catch (err) { setError(err instanceof Error ? err.message : 'Audit load failed'); }
          }}
          integrationRequests={wsIntegrationRequests}
          onReviewIntegrationRequest={async (reqId, payload) => {
            if (!clientOrgId) return;
            const updated = await reviewPlatformOrgIntegrationRequest(clientOrgId, reqId, payload);
            setWsIntegrationRequests(v => v.map(r => r.id === updated.id ? updated : r));
          }}
        />;
      default:                 return overview;
    }
  }

  const content = resolveContent();
  const activeLabel = activeSection === 'client'
    ? (wsOrg?.name ?? 'Client Workspace')
    : (SECTION_LABEL[activeSection] ?? meta?.label ?? 'Platform');
  return <><main className={styles.main}><div className={styles.topbar}><div><div className={styles.eyebrow}>Platform Control Plane</div><h1 className={styles.title}>{activeLabel}</h1><p className={styles.sub}>{activeSection === 'client' ? (wsOrg ? `${wsOrg.slug} · ${wsOrg.status}` : 'Loading…') : 'Ellines EIP control-plane operations'}</p></div><div className={styles.topActions}><span className={styles.pill}>● {health?.status||'unknown'}</span><span className={styles.pill}>{orgs.length} clients</span></div></div>{error&&<div className={styles.alert}>{error}</div>}{notice&&<div className={styles.notice}>{notice}</div>}{content}</main>
  <ConfirmDialog operationId="platform.package.create" open={pkgDialog} onConfirm={createPackage} onCancel={()=>setPkgDialog(false)} context={pkg.displayName||pkg.name}/>
  <ConfirmDialog operationId={safeguardOp||'platform.package.delete'} open={Boolean(safeguardOp)} onConfirm={reason=>runSafeguarded(reason,safeguardOp||'platform.package.delete')} onCancel={()=>setSafeguardOp(null)} context={safeguardOp&&safeguardOp.indexOf('package')>=0?(selectedPkg?.display_name||''):(selectedPack?.name||'')}/>
  </>;
}

function Kpi({label,value,hint,cls}:{label:string;value:string|number;hint:string;cls?:string}){return <div className={styles.kpi}><span>{label}</span><strong className={cls}>{value}</strong><small>{hint}</small></div>}
function CardTitle({title,hint}:{title:string;hint:string}){return <div className={styles.cardHeader}><div><h3 className={styles.cardTitle}>{title}</h3><p className={styles.cardHint}>{hint}</p></div></div>}
function Service({title,text,tags=[]}:{title:string;text:string;tags?:string[]}){return <div className={styles.service}><h4>{title}</h4><p>{text}</p>{tags.map(t=><span className={styles.tag} key={t}>{t}</span>)}</div>}
function Field({label,value,set,placeholder,type='text'}:{label:string;value:string;set:(v:string)=>void;placeholder?:string;type?:string}){return <label className={styles.field}><span>{label}</span><input className={styles.input} value={value} onChange={e=>set(e.target.value)} placeholder={placeholder} type={type}/></label>}

// ── Full-page Client Workspace ───────────────────────────────────────────────
// Opened when the operator clicks "Open workspace" on any client org.
// Full Work Console view per client: every section the client's own users see,
// but scoped to their org and read via platform cross-org APIs.

type WsTab = 'overview'|'glance'|'timeline'|'notifications'|'approvals'|'fleet'|'people'|'inbox'|'connectors'|'rules'|'reports'|'agents'|'documents'|'users'|'audit'|'settings'|'lifecycle';

const CONNECTOR_TYPES = [
  { id:'openapi',    title:'OpenAPI / Swagger',  tag:'Best when docs exist',       blurb:'Upload vendor OpenAPI JSON. EIP maps capabilities automatically.' },
  { id:'rest-api',   title:'REST / HTTP API',     tag:'When API exists',            blurb:'Point at any JSON HTTPS URL IT can reach.' },
  { id:'postgres',   title:'PostgreSQL',          tag:'No API needed',              blurb:'Read-only connection to a reporting DB or replica.' },
  { id:'sqlserver',  title:'SQL Server',          tag:'No API needed',              blurb:'T-SQL reporting DB for on-prem ERPs and HIS backends.' },
  { id:'mysql',      title:'MySQL',               tag:'No API needed',              blurb:'MySQL reporting DB when vendor has no API.' },
  { id:'csv-file',   title:'CSV / File export',   tag:'No API needed',              blurb:'Paste a nightly CSV/Excel dump the business already produces.' },
  { id:'email-imap', title:'Email (IMAP)',        tag:'Legacy reports',             blurb:'Ingest mailed reports and alerts from the prime system.' },
  { id:'sftp',       title:'SFTP / folder drop',  tag:'Healthcare / supply chain',  blurb:'Pull CSV dumps from an SFTP inbox the HIS or ERP already fills.' },
  { id:'demo-json',  title:'Demo JSON seed',      tag:'Smoke test only',            blurb:'Built-in sample data — not for production.' },
] as const;

const DEFAULT_CSV = 'metric,value\nhealthScore,81\nconnectedSystems,4\nopenAlerts,1\nopenDecisions,3\nbriefHighlight,"CSV export from nightly ERP dump."';
const DEFAULT_SQL = 'SELECT 72 AS "healthScore", 1 AS "connectedSystems", 2 AS "openAlerts", 1 AS "openDecisions", \'Read-only SQL.\' AS "briefHighlight"';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const r = reader.result as string; resolve(r.split(',')[1]); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1048576).toFixed(1)} MB`;
}

function mimeIcon(mime: string): string {
  if (mime.includes('pdf')) return '📄';
  if (mime.includes('word')||mime.includes('document')) return '📝';
  if (mime.includes('sheet')||mime.includes('excel')||mime.includes('csv')) return '📊';
  if (mime.includes('image')) return '🖼️';
  if (mime.includes('text')) return '📃';
  return '📁';
}

function ClientWorkspace({
  org, orgId, users, stats, tier, settings, audit, auditTotal,
  connectors, approvals, rules, reports, agents, snapshot,
  installations, documents, orgProfile, availablePacks,
  packages, loading, busy, tab, setTab, wsUser, setWsUser,
  error: _e, notice: _n,
  onBack, onToggle, onAddUser, onToggleUser, onAssignPackage,
  onSaveSettings, onSettingsChange, onSaveOrgName,
  onInstallConnector, onUpdateConnector, onDeleteConnector, onTestConnector, onSyncConnector,
  onUploadDocument, onDeleteDocument, onLoadAudit,
  integrationRequests, onReviewIntegrationRequest,
}: {
  org: import('@/lib/api').PlatformOrg | null;
  orgId: string;
  users: import('@/lib/api').OrgMember[];
  stats: any; tier: any;
  settings: import('@/lib/api').OrgDateTimeSettingsDto;
  audit: import('@/lib/api').PlatformAuditRow[];
  auditTotal: number;
  connectors: import('@/lib/api').PlatformOrgConnectorDto[];
  approvals: import('@/lib/api').PlatformOrgApprovalDto[];
  rules: import('@/lib/api').PlatformOrgRuleDto[];
  reports: import('@/lib/api').PlatformOrgReportDto[];
  agents: import('@/lib/api').PlatformOrgAgentDto[];
  snapshot: import('@/lib/api').PlatformOrgSnapshotDto;
  installations: import('@/lib/api').ConnectorInstallationDto[];
  documents: import('@/lib/api').PlatformDocumentDto[];
  orgProfile: import('@/lib/api').PlatformOrgProfileDto | null;
  availablePacks: import('@/lib/api').ConnectorPackDto[];
  packages: import('@/lib/api').PlatformPackage[];
  loading: boolean; busy: boolean;
  tab: WsTab; setTab: (t: WsTab) => void;
  wsUser: {email:string;fullName:string;password:string;role:string};
  setWsUser: (u: {email:string;fullName:string;password:string;role:string}) => void;
  error: string; notice: string;
  onBack: () => void;
  onToggle: (o: import('@/lib/api').PlatformOrg) => void;
  onAddUser: (e: React.FormEvent) => Promise<void>;
  onToggleUser: (u: import('@/lib/api').OrgMember) => Promise<void>;
  onAssignPackage: (tierId: string) => Promise<void>;
  onSaveSettings: () => Promise<void>;
  onSettingsChange: (s: import('@/lib/api').OrgDateTimeSettingsDto) => void;
  onSaveOrgName: (name: string) => Promise<void>;
  onInstallConnector: (body: {catalogId:string;displayName:string;config?:import('@/lib/api').ConnectorInstallConfigDto;packId?:string}) => Promise<import('@/lib/api').ConnectorInstallationDto|null>;
  onUpdateConnector: (connId:string, body:{displayName?:string;config?:import('@/lib/api').ConnectorInstallConfigDto}) => Promise<import('@/lib/api').ConnectorInstallationDto|null>;
  onDeleteConnector: (connId:string) => Promise<void>;
  onTestConnector: (connId:string) => Promise<{ok:boolean;message?:string;installation?:import('@/lib/api').ConnectorInstallationDto}>;
  onSyncConnector: (connId:string) => Promise<unknown>;
  onUploadDocument: (body:{name:string;mimeType:string;content:string;tags?:string[];branch?:string;summary?:string}) => Promise<void>;
  onDeleteDocument: (docId:string) => Promise<void>;
  onLoadAudit: () => Promise<void>;
  integrationRequests: import('@/lib/api').IntegrationRequestDto[];
  onReviewIntegrationRequest: (reqId:string, payload:{status:'approved'|'rejected';reviewNote?:string}) => Promise<void>;
}) {
  // ── Internal wizard state for Connectors tab ──
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizStep, setWizStep] = useState<1|2|3|4>(1);
  const [wizCatalogId, setWizCatalogId] = useState('openapi');
  const [wizDisplayName, setWizDisplayName] = useState('');
  const [wizEditingId, setWizEditingId] = useState<string|null>(null);
  const [wizPackId, setWizPackId] = useState('');
  const [wizEndpoint, setWizEndpoint] = useState('');
  const [wizAuthType, setWizAuthType] = useState<import('@/lib/api').ConnectorInstallConfigDto['authType']>('none');
  const [wizApiKey, setWizApiKey] = useState('');
  const [wizBearer, setWizBearer] = useState('');
  const [wizBasicUser, setWizBasicUser] = useState('');
  const [wizBasicPass, setWizBasicPass] = useState('');
  const [wizCsv, setWizCsv] = useState(DEFAULT_CSV);
  const [wizConnStr, setWizConnStr] = useState('');
  const [wizSql, setWizSql] = useState(DEFAULT_SQL);
  const [wizOpenApiText, setWizOpenApiText] = useState('');
  const [wizOpenApiBaseUrl, setWizOpenApiBaseUrl] = useState('');
  const [wizParsed, setWizParsed] = useState<import('@/lib/api').OpenApiParseResult|null>(null);
  const [wizSelectedPaths, setWizSelectedPaths] = useState<string[]>([]);
  const [wizImapHost, setWizImapHost] = useState('');
  const [wizImapPort, setWizImapPort] = useState('993');
  const [wizImapUser, setWizImapUser] = useState('');
  const [wizImapPass, setWizImapPass] = useState('');
  const [wizImapMailbox, setWizImapMailbox] = useState('INBOX');
  const [wizSftpHost, setWizSftpHost] = useState('');
  const [wizSftpPort, setWizSftpPort] = useState('22');
  const [wizSftpUser, setWizSftpUser] = useState('');
  const [wizSftpPass, setWizSftpPass] = useState('');
  const [wizSftpPath, setWizSftpPath] = useState('');
  const [wizSyncMins, setWizSyncMins] = useState(0);
  const [wizTestOk, setWizTestOk] = useState<boolean|null>(null);
  const [wizBusy, setWizBusy] = useState(false);
  const [wizError, setWizError] = useState('');
  const [wizNotice, setWizNotice] = useState('');
  // Document upload state
  const [docUploadOpen, setDocUploadOpen] = useState(false);
  const [docFile, setDocFile] = useState<File|null>(null);
  const [docName, setDocName] = useState('');
  const [docTags, setDocTags] = useState('');
  const [docBranch, setDocBranch] = useState('');
  const [docSummary, setDocSummary] = useState('');
  const [docBusy, setDocBusy] = useState(false);
  const [docError, setDocError] = useState('');
  // Settings: org name edit
  const [editOrgName, setEditOrgName] = useState('');
  const [orgNameBusy, setOrgNameBusy] = useState(false);

  useEffect(() => { if (orgProfile) setEditOrgName(orgProfile.name); }, [orgProfile]);

  function resetWizard() {
    setWizStep(1); setWizCatalogId('openapi'); setWizDisplayName(''); setWizEditingId(null); setWizPackId('');
    setWizEndpoint(''); setWizAuthType('none'); setWizApiKey(''); setWizBearer(''); setWizBasicUser(''); setWizBasicPass('');
    setWizCsv(DEFAULT_CSV); setWizConnStr(''); setWizSql(DEFAULT_SQL); setWizOpenApiText(''); setWizOpenApiBaseUrl('');
    setWizParsed(null); setWizSelectedPaths([]); setWizImapHost(''); setWizImapPort('993'); setWizImapUser(''); setWizImapPass(''); setWizImapMailbox('INBOX');
    setWizSftpHost(''); setWizSftpPort('22'); setWizSftpUser(''); setWizSftpPass(''); setWizSftpPath('');
    setWizSyncMins(0); setWizTestOk(null); setWizError(''); setWizNotice('');
  }

  function buildWizConfig(): import('@/lib/api').ConnectorInstallConfigDto {
    const c: import('@/lib/api').ConnectorInstallConfigDto = { authType: wizAuthType, systemName: wizDisplayName||undefined };
    if (wizAuthType==='apiKey'&&wizApiKey&&wizApiKey!=='***') c.apiKey=wizApiKey;
    if (wizAuthType==='bearer'&&wizBearer&&wizBearer!=='***') c.bearerToken=wizBearer;
    if (wizAuthType==='basic') { if (wizBasicUser) c.basicUser=wizBasicUser; if (wizBasicPass&&wizBasicPass!=='***') c.basicPass=wizBasicPass; }
    if (wizCatalogId==='rest-api') c.endpoint=wizEndpoint.trim();
    if (wizCatalogId==='csv-file') c.csvText=wizCsv;
    if (['postgres','sqlserver','mysql'].includes(wizCatalogId)) { if (wizConnStr&&wizConnStr!=='***') c.connectionString=wizConnStr; c.sql=wizSql; }
    if (wizCatalogId==='email-imap') { c.imapHost=wizImapHost; c.imapPort=Number(wizImapPort)||993; c.imapUser=wizImapUser; if (wizImapPass&&wizImapPass!=='***') c.imapPassword=wizImapPass; c.imapMailbox=wizImapMailbox||'INBOX'; c.imapSecure=true; }
    if (wizCatalogId==='sftp') { c.sftpHost=wizSftpHost; c.sftpPort=Number(wizSftpPort)||22; c.sftpUsername=wizSftpUser; if (wizSftpPass&&wizSftpPass!=='***') c.sftpPassword=wizSftpPass; c.sftpRemotePath=wizSftpPath; }
    if (wizCatalogId==='openapi') {
      if (wizOpenApiText.trim()) { try { c.openApiDocument=JSON.parse(wizOpenApiText); } catch { /* handled below */ } }
      c.openApiBaseUrl=wizOpenApiBaseUrl.trim()||wizParsed?.baseUrl||'';
      c.selectedRoutes=(wizParsed?.endpoints||[]).filter(e=>wizSelectedPaths.includes(`${e.method} ${e.path}`)).map(e=>({method:e.method,path:e.path,capability:e.capability}));
    }
    c.syncIntervalMinutes=wizSyncMins;
    return c;
  }

  async function wizSaveDraft(): Promise<string> {
    const config = buildWizConfig();
    const name = wizDisplayName.trim()||CONNECTOR_TYPES.find(t=>t.id===wizCatalogId)?.title||wizCatalogId;
    if (wizEditingId) { await onUpdateConnector(wizEditingId,{displayName:name,config}); return wizEditingId; }
    const inst = await onInstallConnector({catalogId:wizCatalogId,displayName:name,config,packId:wizPackId||undefined});
    if (inst) { setWizEditingId(inst.id); return inst.id; }
    throw new Error('Installation failed');
  }

  async function wizTest() {
    setWizBusy(true); setWizError(''); setWizNotice(''); setWizTestOk(null);
    try {
      const id = await wizSaveDraft();
      const res = await onTestConnector(id);
      setWizTestOk(res.ok); setWizNotice(res.message||(res.ok?'Connection test OK':'Test failed'));
      if (res.ok) setWizStep(4);
    } catch(e) { setWizTestOk(false); setWizError(e instanceof Error?e.message:'Test failed'); }
    finally { setWizBusy(false); }
  }

  async function wizSync() {
    setWizBusy(true); setWizError(''); setWizNotice('');
    try {
      const id = await wizSaveDraft();
      await onSyncConnector(id);
      setWizNotice('Synced successfully.'); setWizardOpen(false); resetWizard();
    } catch(e) { setWizError(e instanceof Error?e.message:'Sync failed'); }
    finally { setWizBusy(false); }
  }

  function editInstallation(inst: import('@/lib/api').ConnectorInstallationDto) {
    resetWizard();
    setWizEditingId(inst.id); setWizCatalogId(inst.catalogId); setWizDisplayName(inst.displayName); setWizPackId(inst.packId||'');
    const c=inst.config||{};
    if (c.endpoint) setWizEndpoint(String(c.endpoint)); if (c.authType) setWizAuthType(c.authType); if (c.apiKey) setWizApiKey(String(c.apiKey));
    if (c.bearerToken) setWizBearer(String(c.bearerToken)); if (c.basicUser) setWizBasicUser(String(c.basicUser)); if (c.basicPass) setWizBasicPass(String(c.basicPass));
    if (c.csvText) setWizCsv(String(c.csvText)); if (c.connectionString) setWizConnStr(String(c.connectionString)); if (c.sql) setWizSql(String(c.sql));
    if (c.openApiBaseUrl) setWizOpenApiBaseUrl(String(c.openApiBaseUrl)); if (c.selectedRoutes?.length) setWizSelectedPaths(c.selectedRoutes.map(r=>`${r.method} ${r.path}`));
    setWizSyncMins(Number(c.syncIntervalMinutes)||0); setWizStep(2); setWizardOpen(true);
  }

  const WC_TABS: {id: WsTab; label: string}[] = [
    {id:'overview',      label:'Overview'},
    {id:'glance',        label:'Glance'},
    {id:'timeline',      label:'Timeline'},
    {id:'notifications', label:'Notifications'},
    {id:'approvals',     label:'Approvals'},
    {id:'fleet',         label:'Fleet'},
    {id:'people',        label:'People'},
    {id:'inbox',         label:'Inbox'},
    {id:'connectors',    label:'Connectors'},
    {id:'rules',         label:'Rules'},
    {id:'reports',       label:'Reports'},
    {id:'agents',        label:'Automation'},
    {id:'documents',     label:'Documents'},
  ];
  // ── Operator-only control tabs ──
  const OP_TABS: {id: WsTab; label: string}[] = [
    {id:'users',     label:'Users & Access'},
    {id:'audit',     label:'Audit Log'},
    {id:'settings',  label:'Settings'},
    {id:'lifecycle', label:'Lifecycle'},
  ];

  if (!orgId) return (
    <div className={styles.card}>
      <p className={styles.cardHint}>No client selected.</p>
      <button className={styles.button} onClick={onBack}>← Back to portfolio</button>
    </div>
  );

  const roles = ['owner','admin','executive','manager','member','viewer'] as const;

  const tabBtn = (t: WsTab) => ({
    className: styles.button,
    onClick: () => setTab(t),
    style: tab === t
      ? {background:'linear-gradient(135deg,#7c3aed,#2563eb)', border:'none', color:'#fff'}
      : undefined,
  } as React.ButtonHTMLAttributes<HTMLButtonElement>);

  return (
    <div>
      {/* ── Client identity banner — always visible ── */}
      <div style={{
        background:'linear-gradient(135deg,rgba(124,58,237,.18),rgba(37,99,235,.1))',
        border:'1px solid rgba(124,58,237,.25)',
        borderRadius:14,
        padding:'14px 18px',
        marginBottom:16,
        display:'flex',
        alignItems:'center',
        gap:14,
        flexWrap:'wrap',
      }}>
        <button className={styles.button} onClick={onBack} style={{fontSize:11,flexShrink:0}}>← Portfolio</button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:11,textTransform:'uppercase',letterSpacing:'.12em',color:'#8b9bb0',fontWeight:800,marginBottom:2}}>
            Client Workspace
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <strong style={{fontSize:20,color:'#fff',letterSpacing:'-.02em'}}>{org?.name ?? '…'}</strong>
            {org && <span className={`${styles.status} ${org.status==='active'?styles.statusOk:styles.statusBad}`}>{org.status}</span>}
            {org && <span style={{fontSize:11,color:'#8795aa'}}>{org.slug}</span>}
            {org && <span style={{fontSize:11,color:'#8795aa'}}>{org.userCount} users</span>}
          </div>
        </div>
      </div>

      {/* ── Work Console tabs (mirrors client's own nav) ── */}
      <div style={{marginBottom:4}}>
        <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'.1em',color:'#5f6d83',fontWeight:800,marginBottom:6,paddingLeft:2}}>Work Console</div>
        <div style={{display:'flex',gap:4,flexWrap:'wrap',paddingBottom:10,borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          {WC_TABS.map(t => <button key={t.id} {...tabBtn(t.id)}>{t.label}</button>)}
        </div>
      </div>

      {/* ── Operator control tabs ── */}
      <div style={{marginBottom:18}}>
        <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'.1em',color:'#5f6d83',fontWeight:800,marginBottom:6,paddingLeft:2,marginTop:10}}>Operator Controls</div>
        <div style={{display:'flex',gap:4,flexWrap:'wrap',paddingBottom:12,borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
          {OP_TABS.map(t => <button key={t.id} {...tabBtn(t.id)}>{t.label}</button>)}
        </div>
      </div>

      {loading && <div style={{padding:'32px 0',color:'#8795aa',textAlign:'center'}}>Loading {org?.name ?? 'client'} workspace…</div>}

      {/* ── OVERVIEW ── */}
      {!loading && tab==='overview' && (
        <div>
          <div className={styles.grid4} style={{marginBottom:12}}>
            <Kpi label="Users" value={tier?.rate_limit_tiers?.max_users!=null?`${stats?.stats?.totalUsers??'—'} / ${tier.rate_limit_tiers.max_users}`:(stats?.stats?.totalUsers??'—')} hint="used / allowed"/>
            <Kpi label="Active users" value={stats?.stats?.activeUsers??'—'} hint="currently active" cls={styles.ok}/>
            <Kpi label="Integrations" value={tier?.rate_limit_tiers?.max_connectors!=null?`${installations.length} / ${tier.rate_limit_tiers.max_connectors}`:(installations.length??'—')} hint="used / allowed"/>
            <Kpi label="Connector errors" value={installations.filter(c=>c.status==='error').length} hint="need attention" cls={installations.filter(c=>c.status==='error').length?styles.warn:styles.ok}/>
          </div>
          <div className={styles.grid4} style={{marginBottom:12}}>
            <Kpi label="Pending approvals" value={approvals.filter(a=>a.status==='pending').length} hint="awaiting decision" cls={approvals.filter(a=>a.status==='pending').length?styles.warn:styles.ok}/>
            <Kpi label="Active agents" value={agents.filter(a=>a.isActive&&!a.isPaused).length} hint="automation running"/>
            <Kpi label="Active rules" value={rules.filter(r=>r.enabled).length} hint="business rules on"/>
            <Kpi label="Reports" value={reports.filter(r=>r.enabled).length} hint="scheduled active"/>
          </div>
          {stats?.lastActivityAt && (
            <div style={{marginBottom:8,fontSize:11,color:'#8795aa'}}>
              Last activity: <span style={{color:'#c8d2e0'}}>{new Date(stats.lastActivityAt).toLocaleString()}</span>
            </div>
          )}
          <div className={styles.grid2} style={{marginBottom:12}}>
            <div className={styles.card}>
              <CardTitle title="Ellinea Glance" hint="Latest enterprise snapshot for this client."/>
              {snapshot ? (
                <>
                  <div className={styles.grid2} style={{marginTop:8}}>
                    <Kpi label="Health score" value={(snapshot?.healthScore??0)+'/100'} hint="enterprise health" cls={(snapshot?.healthScore??0)>=70?styles.ok:(snapshot?.healthScore??0)>=40?styles.warn:styles.bad}/>
                    <Kpi label="Connected systems" value={snapshot?.connectedSystems??0} hint="active integrations"/>
                    <Kpi label="Open alerts" value={snapshot?.openAlerts??0} hint="need attention" cls={snapshot?.openAlerts?styles.warn:styles.ok}/>
                    <Kpi label="Open decisions" value={snapshot?.openDecisions??0} hint="pending" cls={snapshot?.openDecisions?styles.warn:styles.ok}/>
                  </div>
                  <div className={styles.service} style={{marginTop:10}}>
                    <h4>Brief highlight</h4>
                    <p>{snapshot.briefHighlight||'No brief available.'}</p>
                  </div>
                  <p style={{fontSize:10,color:'#64738a',marginTop:8}}>Synced {snapshot.syncedAt ? new Date(snapshot.syncedAt).toLocaleString() : '—'}</p>
                </>
              ) : <p className={styles.cardHint}>No snapshot yet. Client needs at least one synced connector.</p>}
            </div>
            <div className={styles.card}>
              <CardTitle title="Role breakdown" hint="User distribution across roles."/>
              {stats?.stats?.roleBreakdown
                ? Object.entries(stats.stats.roleBreakdown as Record<string,number>).map(([role,count])=>(
                    <div key={role} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid rgba(255,255,255,0.05)',fontSize:11}}>
                      <span style={{textTransform:'capitalize',color:'#c8d2e0'}}>{role}</span>
                      <strong>{count as number}</strong>
                    </div>
                  ))
                : <p className={styles.cardHint}>No data loaded.</p>}
              <div style={{marginTop:12,display:'flex',flexDirection:'column',gap:6}}>
                <button className={`${styles.button} ${styles.primary}`} onClick={()=>setTab('connectors')}>Manage connectors</button>
                <button className={styles.button} onClick={()=>setTab('approvals')}>Review approvals</button>
                <button className={styles.button} onClick={()=>setTab('users')}>Manage users</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── GLANCE (Enterprise Snapshot) ── */}
      {!loading && tab==='glance' && (
        <div>
          {snapshot ? (
            <>
              <div className={styles.grid4} style={{marginBottom:12}}>
                <Kpi label="Health score" value={(snapshot.healthScore??0)+'/100'} hint="enterprise health" cls={(snapshot.healthScore??0)>=70?styles.ok:(snapshot.healthScore??0)>=40?styles.warn:styles.bad}/>
                <Kpi label="Connected systems" value={snapshot.connectedSystems??0} hint="active integrations"/>
                <Kpi label="Open alerts" value={snapshot.openAlerts??0} hint="need attention" cls={snapshot.openAlerts?styles.warn:styles.ok}/>
                <Kpi label="Open decisions" value={snapshot.openDecisions??0} hint="pending decisions" cls={snapshot.openDecisions?styles.warn:styles.ok}/>
              </div>
              <div className={styles.card} style={{marginBottom:12}}>
                <CardTitle title="Brief highlight" hint={`Last synced ${snapshot.syncedAt ? new Date(snapshot.syncedAt).toLocaleString() : '—'}`}/>
                <p style={{fontSize:13,lineHeight:1.6,color:'#c8d2e0',marginTop:4}}>{snapshot.briefHighlight||'No brief available.'}</p>
              </div>
              <div className={styles.card}>
                <CardTitle title="Timeline" hint="Recent activity from the enterprise snapshot."/>
                {Array.isArray(snapshot.timeline) && (snapshot.timeline as {title:string;detail:string}[]).length > 0
                  ? (snapshot.timeline as {title:string;detail:string}[]).map((t,i)=>(
                      <div key={i} className={styles.service} style={{marginBottom:6}}>
                        <h4>{t.title}</h4>
                        <p>{t.detail}</p>
                      </div>
                    ))
                  : <p className={styles.cardHint}>No timeline entries available.</p>}
              </div>
            </>
          ) : (
            <div className={styles.planned}>
              <h3>No enterprise snapshot</h3>
              <p>This client has no synced enterprise snapshot yet. They need to install and sync at least one connector from their Work Console for Glance data to appear here.</p>
            </div>
          )}
        </div>
      )}

      {/* ── TIMELINE ── */}
      {!loading && tab==='timeline' && (
        <div>
          <div className={styles.card} style={{marginBottom:12}}>
            <CardTitle title="Activity timeline" hint={`Recent events and activity for ${org?.name ?? 'this client'}.`}/>
            {snapshot && Array.isArray(snapshot.timeline) && (snapshot.timeline as {title:string;detail:string}[]).length > 0
              ? (snapshot.timeline as {title:string;detail:string}[]).map((t,i)=>(
                  <div key={i} className={styles.service} style={{marginBottom:8,display:'flex',gap:12,alignItems:'flex-start'}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:'#7c3aed',flexShrink:0,marginTop:3}}/>
                    <div><h4 style={{margin:0,fontSize:12}}>{t.title}</h4><p style={{margin:'3px 0 0'}}>{t.detail}</p></div>
                  </div>
                ))
              : <p className={styles.cardHint}>No timeline events. Client needs at least one synced connector to populate the enterprise timeline.</p>}
          </div>
          <div className={styles.card}>
            <CardTitle title="Recent audit events" hint="Platform-level activity log for this client."/>
            <div style={{display:'flex',gap:8,marginBottom:10}}>
              <button className={`${styles.button} ${styles.primary}`} onClick={()=>void onLoadAudit()}>Load events</button>
              <span className={styles.muted}>{auditTotal} total</span>
            </div>
            {audit.slice(0,10).map(a=>(
              <div key={a.id} style={{display:'flex',gap:12,alignItems:'flex-start',padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,.05)'}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:'#2563eb',flexShrink:0,marginTop:4}}/>
                <div style={{fontSize:11}}>
                  <span style={{color:'#c8d2e0'}}>{a.action}</span>
                  <span style={{color:'#8795aa',marginLeft:8}}>{a.userEmail??'system'}</span>
                  <span style={{color:'#5f6d83',marginLeft:8}}>{new Date(a.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
            {!audit.length && <p className={styles.cardHint}>Click "Load events" to fetch the audit log.</p>}
          </div>
        </div>
      )}

      {/* ── NOTIFICATIONS ── */}
      {!loading && tab==='notifications' && (
        <div>
          <div className={styles.grid4} style={{marginBottom:12}}>
            <Kpi label="Pending approvals" value={approvals.filter(a=>a.status==='pending').length} hint="require attention" cls={approvals.filter(a=>a.status==='pending').length?styles.warn:styles.ok}/>
            <Kpi label="Open alerts" value={snapshot?.openAlerts??'—'} hint="from snapshot" cls={snapshot?.openAlerts?styles.warn:styles.ok}/>
            <Kpi label="Open decisions" value={snapshot?.openDecisions??'—'} hint="pending" cls={snapshot?.openDecisions?styles.warn:styles.ok}/>
            <Kpi label="Connector errors" value={connectors.filter(c=>c.errorCount>0).length} hint="need attention" cls={connectors.filter(c=>c.errorCount>0).length?styles.warn:styles.ok}/>
          </div>
          <div className={styles.card}>
            <CardTitle title="Pending approvals" hint="Items awaiting decision in this client organization."/>
            {approvals.filter(a=>a.status==='pending').length > 0
              ? approvals.filter(a=>a.status==='pending').map(a=>(
                  <div key={a.id} className={styles.service} style={{marginBottom:8}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                      <div>
                        <strong style={{fontSize:12}}>{a.title}</strong>
                        <p style={{margin:'3px 0 0',fontSize:10}}>{a.requester} · {a.source}</p>
                      </div>
                      <span className={`${styles.status} ${styles.statusNeutral}`}>pending</span>
                    </div>
                  </div>
                ))
              : <p className={styles.cardHint}>No pending approvals.</p>}
          </div>
        </div>
      )}

      {/* ── FLEET ── */}
      {!loading && tab==='fleet' && (
        <div>
          <div className={styles.grid4} style={{marginBottom:12}}>
            <Kpi label="Connected systems" value={snapshot?.connectedSystems??'—'} hint="from enterprise snapshot"/>
            <Kpi label="Health score" value={snapshot?((snapshot.healthScore??0)+'/100'):'—'} hint="enterprise health" cls={snapshot?.healthScore!=null&&snapshot.healthScore>=70?styles.ok:snapshot?.healthScore!=null&&snapshot.healthScore>=40?styles.warn:styles.bad}/>
            <Kpi label="Connectors" value={connectors.length} hint="installed"/>
            <Kpi label="Synced" value={connectors.filter(c=>c.status==='synced').length} hint="ok"/>
          </div>
          {snapshot ? (
            <div className={styles.card}>
              <CardTitle title="Fleet overview" hint="Systems and assets visible from the enterprise snapshot."/>
              <Service title="Enterprise health" text={`Score: ${snapshot.healthScore}/100 · ${snapshot.connectedSystems} connected systems`}/>
              <Service title="Brief" text={snapshot.briefHighlight||'No brief available.'}/>
              <p style={{marginTop:12,fontSize:11,color:'#5f6d83'}}>
                Full fleet detail (individual assets, vehicles, equipment) requires the client to have their fleet management system connected as a connector. The data shown here is aggregated from the enterprise snapshot.
              </p>
            </div>
          ) : <div className={styles.planned}><h3>No fleet data</h3><p>Fleet data appears once this client syncs a connector that provides fleet/asset information.</p></div>}
        </div>
      )}

      {/* ── PEOPLE ── */}
      {!loading && tab==='people' && (
        <div>
          <div className={styles.grid4} style={{marginBottom:12}}>
            <Kpi label="EIP users" value={stats?.stats?.totalUsers??'—'} hint="registered accounts"/>
            <Kpi label="Active" value={stats?.stats?.activeUsers??'—'} hint="currently active" cls={styles.ok}/>
            <Kpi label="Roles" value={Object.keys(stats?.stats?.roleBreakdown??{}).length} hint="role types"/>
            <Kpi label="Connected people" value={snapshot?.connectedSystems??'—'} hint="from enterprise snapshot"/>
          </div>
          <div className={styles.grid2}>
            <div className={styles.card}>
              <CardTitle title="EIP user directory" hint="Accounts registered in this client organization."/>
              {users.slice(0,15).map(u=>(
                <div key={u.id} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,.05)',fontSize:11}}>
                  <div>
                    <span style={{color:'#c8d2e0',fontWeight:600}}>{u.fullName}</span>
                    <span style={{color:'#8795aa',marginLeft:8}}>{u.email}</span>
                  </div>
                  <span style={{textTransform:'capitalize',color:'#a5b4fc'}}>{u.role}</span>
                </div>
              ))}
              {users.length > 15 && <p className={styles.cardHint} style={{marginTop:8}}>+{users.length-15} more — go to Users & Access for full management.</p>}
              {!users.length && <p className={styles.cardHint}>No users loaded.</p>}
            </div>
            <div className={styles.card}>
              <CardTitle title="Role breakdown" hint="How people are distributed across roles."/>
              {stats?.stats?.roleBreakdown
                ? Object.entries(stats.stats.roleBreakdown as Record<string,number>).map(([role,count])=>(
                    <div key={role} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,0.05)',fontSize:11}}>
                      <span style={{textTransform:'capitalize',color:'#c8d2e0'}}>{role}</span>
                      <strong>{count as number}</strong>
                    </div>
                  ))
                : <p className={styles.cardHint}>No data.</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── INBOX ── */}
      {!loading && tab==='inbox' && (
        <div className={styles.card}>
          <CardTitle title="Inbox" hint="Email and message activity for this client (requires email connector)."/>
          <div className={styles.planned}>
            <h3>Inbox — operator view</h3>
            <p>The client&apos;s inbox is populated by their own email connector syncs. As a platform operator you can see connector sync status in the Connectors tab. The client&apos;s users access their own inbox from their Work Console.</p>
          </div>
          <div style={{marginTop:14}}>
            <Service title="Connector sync status" text={connectors.length?`${connectors.filter(c=>c.status==='synced').length} of ${connectors.length} connectors synced`:'No connectors installed.'}/>
            <Service title="Last sync" text={connectors.filter(c=>c.lastSyncedAt).sort((a,b)=>new Date(b.lastSyncedAt!).getTime()-new Date(a.lastSyncedAt!).getTime())[0]?.lastSyncedAt ? new Date(connectors.filter(c=>c.lastSyncedAt)[0].lastSyncedAt!).toLocaleString() : 'Never'}/>
          </div>
        </div>
      )}

      {/* ── DOCUMENTS ── */}
      {!loading && tab==='documents' && (
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
            <div><strong style={{fontSize:14}}>{documents.length} document{documents.length!==1?'s':''}</strong><span className={styles.muted} style={{marginLeft:8,fontSize:11}}>{documents.reduce((n,d)=>n+d.sizeBytes,0)/1024<1024?`${(documents.reduce((n,d)=>n+d.sizeBytes,0)/1024).toFixed(1)} KB`:`${(documents.reduce((n,d)=>n+d.sizeBytes,0)/1048576).toFixed(1)} MB`} total</span></div>
            <button className={`${styles.button} ${styles.primary}`} onClick={()=>setDocUploadOpen(v=>!v)}>{docUploadOpen?'Cancel':'+ Upload document'}</button>
          </div>
          {docUploadOpen&&(<div className={styles.card} style={{marginBottom:12,border:'1px solid rgba(124,58,237,.25)'}}><CardTitle title="Upload document" hint="Max 500 KB. Ellinea can reference documents added with a summary."/>{docError&&<div className={styles.alert}>{docError}</div>}<div className={styles.form} style={{marginTop:8}}><label className={styles.field}><span>File (max 500 KB)</span><input type="file" accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.json,.png,.jpg" onChange={e=>{const f=e.target.files?.[0]??null;setDocFile(f);if(f&&!docName)setDocName(f.name);}} required/></label><Field label="Display name" value={docName} set={setDocName}/><Field label="Tags (comma-separated)" value={docTags} set={setDocTags} placeholder="finance, Q3, Nairobi"/><Field label="Branch / site" value={docBranch} set={setDocBranch} placeholder="Nairobi HQ"/><label className={styles.field} style={{gridColumn:'1/-1'}}><span>Summary (for Ellinea)</span><textarea className={styles.input} value={docSummary} onChange={e=>setDocSummary(e.target.value)} rows={2} placeholder="Brief description for AI context…"/></label><div className={styles.full}><button className={`${styles.button} ${styles.primary}`} disabled={docBusy||!docFile} onClick={async()=>{if(!docFile)return;if(docFile.size>500*1024){setDocError('File exceeds 500 KB');return;}setDocBusy(true);setDocError('');try{const content=await fileToBase64(docFile);await onUploadDocument({name:docName||docFile.name,mimeType:docFile.type||'application/octet-stream',content,tags:docTags?docTags.split(',').map(t=>t.trim()).filter(Boolean):[],branch:docBranch||undefined,summary:docSummary||undefined});setDocUploadOpen(false);setDocFile(null);setDocName('');setDocTags('');setDocBranch('');setDocSummary('');}catch(e){setDocError(e instanceof Error?e.message:'Upload failed');}finally{setDocBusy(false);}}}>{docBusy?'Uploading…':'Upload'}</button>{docFile&&<span className={styles.muted} style={{marginLeft:8,fontSize:11}}>{docFile.name} ({formatBytes(docFile.size)}){docFile.size>500*1024?' — ⚠️ Too large':''}</span>}</div></div></div>)}
          {documents.length>0?(<div style={{display:'flex',flexDirection:'column',gap:8}}>{documents.map(doc=>(<div key={doc.id} className={styles.card} style={{padding:'10px 14px'}}><div style={{display:'flex',gap:10,alignItems:'flex-start'}}><span style={{fontSize:'1.3rem',lineHeight:1}}>{mimeIcon(doc.mimeType)}</span><div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:12,marginBottom:3}}>{doc.name}</div><div style={{fontSize:10,color:'#8795aa'}}>{formatBytes(doc.sizeBytes)} · {doc.mimeType} · {doc.uploadedBy} · {new Date(doc.uploadedAt).toLocaleDateString()}{doc.branch?` · ${doc.branch}`:''}</div>{doc.summary&&<p style={{fontSize:10,color:'#8795aa',margin:'4px 0 0'}}>{doc.summary}</p>}{doc.tags.length>0&&<div style={{marginTop:4}}>{doc.tags.map(t=><span key={t} className={styles.tag}>{t}</span>)}</div>}</div><button className={`${styles.button} ${styles.danger}`} style={{fontSize:10,padding:'4px 7px',flexShrink:0}} disabled={busy} onClick={async()=>{if(confirm(`Delete "${doc.name}"?`))await onDeleteDocument(doc.id);}}>Delete</button></div></div>))}</div>):(!docUploadOpen&&<div className={styles.planned}><h3>No documents</h3><p>Upload the first document for this client org using the button above.</p></div>)}
        </div>
      )}
      {/* ── CONNECTORS ── */}
      {!loading && tab==='connectors' && (
        <div>
          {/* Entitlement header: used / allowed from package tier */}
          {tier?.rate_limit_tiers && (
            <div style={{marginBottom:10,padding:'8px 14px',borderRadius:10,background:'rgba(124,58,237,.10)',border:'1px solid rgba(124,58,237,.2)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <span style={{fontSize:12,color:'#c4b5fd',fontWeight:700}}>
                {installations.filter(c=>c.status!=='deleted').length}
                {' / '}
                {tier.rate_limit_tiers.max_connectors ?? '∞'}
                {' integrations purchased'}
              </span>
              {tier.rate_limit_tiers.max_connectors !== null &&
               installations.filter(c=>c.status!=='deleted').length >= tier.rate_limit_tiers.max_connectors && (
                <span style={{fontSize:11,color:'#fb7185',fontWeight:700}}>⚠ Limit reached — upgrade package to add more</span>
              )}
            </div>
          )}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
            <div className={styles.grid4} style={{gap:8}}>
              <Kpi label="Total" value={installations.length} hint="installed"/>
              <Kpi label="Synced" value={installations.filter(c=>c.status==='synced').length} hint="ok" cls={styles.ok}/>
              <Kpi label="Errors" value={installations.filter(c=>c.status==='error').length} hint="needs attention" cls={installations.filter(c=>c.status==='error').length?styles.warn:styles.ok}/>
              <Kpi label="Draft" value={installations.filter(c=>c.status==='draft').length} hint="not active"/>
            </div>
            <button className={`${styles.button} ${styles.primary}`} onClick={()=>{resetWizard();setWizardOpen(true);}}>+ Install connector</button>
          </div>
          {availablePacks.length>0&&(<div className={styles.card} style={{marginBottom:12}}><CardTitle title="Platform packs" hint="Pre-configured connectors — enter credentials only."/><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>{availablePacks.map(p=>(<button key={p.id} className={styles.button} onClick={()=>{resetWizard();setWizCatalogId(p.catalogId);setWizDisplayName(p.name);setWizPackId(p.id);const c=p.templateConfig||{};if(c.endpoint)setWizEndpoint(String(c.endpoint));if(c.sql)setWizSql(String(c.sql));if(c.openApiBaseUrl)setWizOpenApiBaseUrl(String(c.openApiBaseUrl));setWizStep(2);setWizardOpen(true);setWizNotice(`Pack "${p.name}" — enter credentials, then Test & Sync.`);}}>📦 {p.name}</button>))}</div></div>)}
          {wizardOpen&&(<div className={styles.card} style={{marginBottom:12,border:'1px solid rgba(124,58,237,.35)'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}><strong style={{fontSize:13}}>Install wizard · Step {wizStep} of 4{wizEditingId?' · editing':''}</strong><button className={styles.button} onClick={()=>{setWizardOpen(false);resetWizard();}}>Close</button></div><div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>{['Type','Credentials','Capabilities','Test & sync'].map((l,i)=>(<span key={l} style={{fontSize:10,padding:'3px 8px',borderRadius:99,background:wizStep===i+1?'rgba(124,58,237,.35)':'rgba(255,255,255,.05)',color:wizStep===i+1?'#c4b5fd':'#8795aa',fontWeight:700}}>{i+1}. {l}</span>))}</div>{wizError&&<div className={styles.alert}>{wizError}</div>}{wizNotice&&<div className={styles.notice}>{wizNotice}</div>}{wizStep===1&&(<div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:8,marginBottom:12}}>{CONNECTOR_TYPES.map(t=>(<button key={t.id} className={styles.button} onClick={()=>{setWizCatalogId(t.id);if(!wizDisplayName)setWizDisplayName(t.title);}} style={{textAlign:'left',padding:10,background:wizCatalogId===t.id?'rgba(124,58,237,.25)':undefined,border:wizCatalogId===t.id?'1px solid rgba(124,58,237,.55)':undefined}}><span style={{fontSize:9,fontWeight:800,color:'#8b9bb0',textTransform:'uppercase',display:'block',marginBottom:3}}>{t.tag}</span><strong style={{fontSize:12,display:'block'}}>{t.title}</strong><span style={{fontSize:10,color:'#8795aa'}}>{t.blurb}</span></button>))}</div><div className={styles.form} style={{marginBottom:10}}><Field label="Display name" value={wizDisplayName} set={setWizDisplayName} placeholder="e.g. Clinical HIS production"/></div><button className={`${styles.button} ${styles.primary}`} onClick={()=>setWizStep(2)}>Continue →</button></div>)}{wizStep===2&&(<div><div className={styles.form} style={{marginBottom:10}}>{(wizCatalogId==='rest-api'||wizCatalogId==='openapi')&&(<><label className={styles.field}><span>Auth</span><select className={styles.select} value={wizAuthType||'none'} onChange={e=>setWizAuthType(e.target.value as import('@/lib/api').ConnectorInstallConfigDto['authType'])}><option value="none">None</option><option value="apiKey">API key</option><option value="bearer">Bearer token</option><option value="basic">Basic</option></select></label>{wizAuthType==='apiKey'&&<Field label="API key" value={wizApiKey} set={setWizApiKey}/>}{wizAuthType==='bearer'&&<Field label="Bearer token" value={wizBearer} set={setWizBearer}/>}{wizAuthType==='basic'&&<><Field label="Username" value={wizBasicUser} set={setWizBasicUser}/><Field label="Password" value={wizBasicPass} set={setWizBasicPass} type="password"/></>}</>)}{wizCatalogId==='rest-api'&&<Field label="Endpoint URL" value={wizEndpoint} set={setWizEndpoint} placeholder="https://vendor.example/api"/>}{wizCatalogId==='openapi'&&(<><label className={styles.field} style={{gridColumn:'1/-1'}}><span>OpenAPI JSON</span><textarea className={styles.input} value={wizOpenApiText} onChange={e=>setWizOpenApiText(e.target.value)} rows={6} placeholder="Paste openapi.json here"/></label><Field label="Base URL" value={wizOpenApiBaseUrl} set={setWizOpenApiBaseUrl} placeholder="https://vendor.example/api"/><div className={styles.full}><button className={styles.button} disabled={wizBusy||!wizOpenApiText.trim()} onClick={async()=>{setWizBusy(true);setWizError('');try{const doc=JSON.parse(wizOpenApiText);const r=await parseOpenApi(doc);setWizParsed(r);if(!wizOpenApiBaseUrl&&r.baseUrl)setWizOpenApiBaseUrl(r.baseUrl);if(!wizDisplayName)setWizDisplayName(r.title);setWizSelectedPaths(r.endpoints.filter(e=>e.selectable).slice(0,5).map(e=>`${e.method} ${e.path}`));setWizNotice(`Parsed ${r.endpoints.length} operations.`);}catch(e){setWizError(e instanceof Error?e.message:'Parse failed');}finally{setWizBusy(false);}}}>Parse capabilities</button></div></>)}{wizCatalogId==='csv-file'&&<label className={styles.field} style={{gridColumn:'1/-1'}}><span>CSV content</span><textarea className={styles.input} value={wizCsv} onChange={e=>setWizCsv(e.target.value)} rows={6}/></label>}{['postgres','sqlserver','mysql'].includes(wizCatalogId)&&(<><Field label="Connection string (read-only)" value={wizConnStr} set={setWizConnStr} placeholder="postgresql://reader:…@host:5432/dbname"/><label className={styles.field} style={{gridColumn:'1/-1'}}><span>SELECT query</span><textarea className={styles.input} value={wizSql} onChange={e=>setWizSql(e.target.value)} rows={5}/></label></>)}{wizCatalogId==='email-imap'&&(<><Field label="IMAP host" value={wizImapHost} set={setWizImapHost}/><Field label="Port" value={wizImapPort} set={setWizImapPort}/><Field label="Username" value={wizImapUser} set={setWizImapUser}/><Field label="Password" value={wizImapPass} set={setWizImapPass} type="password"/><Field label="Mailbox" value={wizImapMailbox} set={setWizImapMailbox}/></>)}{wizCatalogId==='sftp'&&(<><Field label="SFTP host" value={wizSftpHost} set={setWizSftpHost}/><Field label="Port" value={wizSftpPort} set={setWizSftpPort}/><Field label="Username" value={wizSftpUser} set={setWizSftpUser}/><Field label="Password" value={wizSftpPass} set={setWizSftpPass} type="password"/><Field label="Remote path" value={wizSftpPath} set={setWizSftpPath}/></>)}{wizCatalogId==='demo-json'&&<p className={styles.cardHint} style={{gridColumn:'1/-1'}}>Demo seed — no credentials needed.</p>}</div><div style={{display:'flex',gap:8}}><button className={styles.button} onClick={()=>setWizStep(1)}>← Back</button><button className={`${styles.button} ${styles.primary}`} onClick={()=>setWizStep(wizCatalogId==='openapi'&&wizParsed?3:4)}>Continue →</button></div></div>)}{wizStep===3&&wizParsed&&(<div><p className={styles.cardHint} style={{marginBottom:10}}>Select capabilities to expose.</p><div style={{maxHeight:260,overflowY:'auto',border:'1px solid rgba(255,255,255,.08)',borderRadius:10,padding:10,marginBottom:12}}>{wizParsed.endpoints.map(e=>{const key=`${e.method} ${e.path}`;return(<label key={key} style={{display:'flex',gap:10,alignItems:'flex-start',padding:'4px 0',borderBottom:'1px solid rgba(255,255,255,.04)',fontSize:11,cursor:e.selectable?'pointer':'default',opacity:e.selectable?1:.45}}><input type="checkbox" disabled={!e.selectable} checked={wizSelectedPaths.includes(key)} onChange={ev=>setWizSelectedPaths(prev=>ev.target.checked?[...prev,key]:prev.filter(p=>p!==key))} style={{marginTop:2}}/><span><code style={{color:'#a5b4fc'}}>{e.method}</code> <span style={{color:'#c8d2e0'}}>{e.path}</span><br/><span style={{color:'#8795aa'}}>{e.summary}</span></span></label>);})}</div><div style={{display:'flex',gap:8}}><button className={styles.button} onClick={()=>setWizStep(2)}>← Back</button><button className={`${styles.button} ${styles.primary}`} onClick={()=>setWizStep(4)}>Continue →</button></div></div>)}{wizStep===4&&(<div><div className={styles.form} style={{marginBottom:12}}><label className={styles.field}><span>Sync schedule</span><select className={styles.select} value={String(wizSyncMins)} onChange={e=>setWizSyncMins(Number(e.target.value))}><option value="0">Manual only</option><option value="15">Every 15 min</option><option value="60">Every hour</option><option value="360">Every 6 hrs</option><option value="1440">Daily</option></select></label>{wizTestOk!==null&&<div className={styles.full}><span style={{color:wizTestOk?'#34d399':'#fb7185',fontWeight:700}}>{wizTestOk?'✓ Test passed':'✗ Test failed'}</span></div>}</div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className={styles.button} onClick={()=>setWizStep(wizCatalogId==='openapi'&&wizParsed?3:2)}>← Back</button><button className={styles.button} disabled={wizBusy} onClick={()=>void wizTest()}>Test connection</button><button className={`${styles.button} ${styles.primary}`} disabled={wizBusy} onClick={()=>void wizSync()}>Sync now</button></div></div>)}</div>)}
          {installations.length>0?(<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Last synced</th><th>Schedule</th><th>Actions</th></tr></thead><tbody>{installations.map(inst=>(<tr key={inst.id}><td><strong>{inst.displayName}</strong>{inst.lastMessage&&<><br/><span className={styles.muted} style={{fontSize:10}}>{inst.lastMessage}</span></>}</td><td><span className={styles.muted}>{inst.catalogId}</span></td><td><span className={`${styles.status} ${inst.status==='synced'?styles.statusOk:inst.status==='error'?styles.statusBad:styles.statusNeutral}`}>{inst.status}</span></td><td style={{fontSize:11}}>{inst.lastSyncedAt?new Date(inst.lastSyncedAt).toLocaleString():'Never'}</td><td style={{fontSize:11}}>{inst.config?.syncIntervalMinutes?`${inst.config.syncIntervalMinutes} min`:'Manual'}</td><td style={{display:'flex',gap:4,flexWrap:'wrap'}}><button className={styles.button} style={{fontSize:10,padding:'4px 7px'}} onClick={()=>editInstallation(inst)}>Edit</button><button className={styles.button} style={{fontSize:10,padding:'4px 7px'}} disabled={busy} onClick={async()=>{try{await onSyncConnector(inst.id);}catch(e){console.error(e);}}}>Sync</button><button className={`${styles.button} ${styles.danger}`} style={{fontSize:10,padding:'4px 7px'}} disabled={busy} onClick={async()=>{if(confirm(`Remove "${inst.displayName}"?`))await onDeleteConnector(inst.id);}}>Remove</button></td></tr>))}</tbody></table></div>):(!wizardOpen&&<div className={styles.planned}><h3>No connectors yet</h3><p>Click &quot;+ Install connector&quot; above to connect this client&apos;s first system.</p></div>)}

          {/* ── Integration Requests (TASK-09) ── */}
          <div className={styles.card} style={{marginTop:20}}>
            <CardTitle title="Integration requests" hint="Requests submitted by client IT for new integrations. Approve to install, reject with a note."/>
            {integrationRequests.length===0
              ? <p className={styles.cardHint}>No integration requests from this client yet.</p>
              : (<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>System</th><th>Purpose</th><th>Requested</th><th>Status</th><th>Review</th></tr></thead><tbody>
                  {integrationRequests.map(req=>(
                    <tr key={req.id}>
                      <td><strong>{req.systemName}</strong>{req.catalogId&&<><br/><span className={styles.muted} style={{fontSize:10}}>{req.catalogId}</span></>}</td>
                      <td style={{fontSize:11,maxWidth:200}}>{req.purpose||'—'}</td>
                      <td style={{fontSize:11}}>{new Date(req.createdAt).toLocaleDateString()}</td>
                      <td><span className={`${styles.status} ${req.status==='approved'?styles.statusOk:req.status==='rejected'?styles.statusBad:styles.statusNeutral}`}>{req.status}</span>{req.reviewNote&&<><br/><span className={styles.muted} style={{fontSize:10}}>{req.reviewNote}</span></>}</td>
                      <td>{req.status==='pending'&&<div style={{display:'flex',gap:4}}>
                        <button className={`${styles.button} ${styles.success}`} style={{fontSize:10,padding:'4px 8px'}} disabled={busy} onClick={async()=>{const note=window.prompt('Approval note (optional):');await onReviewIntegrationRequest(req.id,{status:'approved',reviewNote:note||undefined});}}>Approve</button>
                        <button className={`${styles.button} ${styles.danger}`} style={{fontSize:10,padding:'4px 8px'}} disabled={busy} onClick={async()=>{const note=window.prompt('Rejection reason:');if(!note)return;await onReviewIntegrationRequest(req.id,{status:'rejected',reviewNote:note});}}>Reject</button>
                      </div>}</td>
                    </tr>
                  ))}
                </tbody></table></div>)
            }
          </div>
        </div>
      )}
      {/* ── APPROVALS ── */}
      {!loading && tab==='approvals' && (
        <div>
          <div className={styles.grid4} style={{marginBottom:12}}>
            <Kpi label="Total" value={approvals.length} hint="all time"/>
            <Kpi label="Pending" value={approvals.filter(a=>a.status==='pending').length} hint="awaiting decision" cls={approvals.filter(a=>a.status==='pending').length?styles.warn:styles.ok}/>
            <Kpi label="Approved" value={approvals.filter(a=>a.status==='approved').length} hint="resolved" cls={styles.ok}/>
            <Kpi label="Rejected" value={approvals.filter(a=>a.status==='rejected').length} hint="declined"/>
          </div>
          {approvals.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Title</th><th>Requester</th><th>Status</th><th>Source</th><th>Created</th><th>Decided</th></tr></thead>
                <tbody>
                  {approvals.map(a=>(
                    <tr key={a.id}>
                      <td><strong>{a.title}</strong><br/><span className={styles.muted} style={{fontSize:10}}>{a.detail}</span></td>
                      <td>{a.requester}</td>
                      <td><span className={`${styles.status} ${a.status==='approved'?styles.statusOk:a.status==='pending'?styles.statusNeutral:styles.statusBad}`}>{a.status}</span></td>
                      <td><span className={styles.muted}>{a.source}</span></td>
                      <td>{new Date(a.createdAt).toLocaleDateString()}</td>
                      <td>{a.decidedAt?new Date(a.decidedAt).toLocaleDateString():'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className={styles.planned}><h3>No approvals yet</h3><p>This client has no approval requests. Approvals are created via their Work Console or triggered by business rules.</p></div>}
        </div>
      )}

      {/* ── USERS & ACCESS ── */}
      {!loading && tab==='users' && (
        <div className={styles.grid2}>
          <div className={styles.card}>
            <CardTitle title="Add user" hint="Create a new account in this client organization."/>
            <form onSubmit={onAddUser}>
              <div className={styles.form} style={{marginTop:8}}>
                <Field label="Full name" value={wsUser.fullName} set={v=>setWsUser({...wsUser,fullName:v})}/>
                <Field label="Email" value={wsUser.email} set={v=>setWsUser({...wsUser,email:v})} type="email"/>
                <Field label="Password" value={wsUser.password} set={v=>setWsUser({...wsUser,password:v})} type="password"/>
                <label className={styles.field}>
                  <span>Role</span>
                  <select className={styles.select} value={wsUser.role} onChange={e=>setWsUser({...wsUser,role:e.target.value})}>
                    {roles.map(r=><option key={r}>{r}</option>)}
                  </select>
                </label>
                <div className={styles.full}>
                  <button className={`${styles.button} ${styles.primary}`} disabled={busy||!wsUser.email||!wsUser.fullName||!wsUser.password}>Add user</button>
                </div>
              </div>
            </form>
          </div>
          <div className={styles.card}>
            <CardTitle title="Users" hint={`${users.length} accounts in this organization`}/>
            <div style={{maxHeight:500,overflowY:'auto'}}>
              {users.map(u=>(
                <div key={u.id} className={styles.service} style={{marginBottom:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                    <div>
                      <strong style={{fontSize:12}}>{u.fullName}</strong>
                      <p style={{margin:'3px 0 0',fontSize:10,color:'#8795aa'}}>{u.email} · <span style={{textTransform:'capitalize'}}>{u.role}</span></p>
                    </div>
                    <button className={`${styles.button} ${u.isActive?styles.danger:styles.success}`} style={{fontSize:10,padding:'5px 8px'}} disabled={busy} onClick={()=>void onToggleUser(u)}>
                      {u.isActive?'Deactivate':'Activate'}
                    </button>
                  </div>
                  <span className={`${styles.status} ${u.isActive?styles.statusOk:styles.statusBad}`}>{u.isActive?'active':'inactive'}</span>
                </div>
              ))}
              {!users.length && <p className={styles.cardHint}>No users loaded.</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── RULES ── */}
      {!loading && tab==='rules' && (
        <div>
          <div className={styles.grid4} style={{marginBottom:12}}>
            <Kpi label="Total rules" value={rules.length} hint="defined"/>
            <Kpi label="Active" value={rules.filter(r=>r.enabled).length} hint="currently on" cls={styles.ok}/>
            <Kpi label="Inactive" value={rules.filter(r=>!r.enabled).length} hint="turned off"/>
            <Kpi label="Connectors" value={connectors.length} hint="data sources"/>
          </div>
          {rules.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Rule name</th><th>When</th><th>Threshold</th><th>Then</th><th>Status</th><th>Created</th></tr></thead>
                <tbody>
                  {rules.map(r=>(
                    <tr key={r.id}>
                      <td><strong>{r.name}</strong></td>
                      <td><span className={styles.muted}>{r.when}</span></td>
                      <td>{r.threshold}</td>
                      <td><span className={styles.muted}>{r.then}</span></td>
                      <td><span className={`${styles.status} ${r.enabled?styles.statusOk:styles.statusNeutral}`}>{r.enabled?'Active':'Off'}</span></td>
                      <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className={styles.planned}><h3>No business rules</h3><p>This client has not created any business rules yet. Rules are configured from their Work Console → Rules page.</p></div>}
        </div>
      )}

      {/* ── REPORTS ── */}
      {!loading && tab==='reports' && (
        <div>
          <div className={styles.grid4} style={{marginBottom:12}}>
            <Kpi label="Total" value={reports.length} hint="defined"/>
            <Kpi label="Active" value={reports.filter(r=>r.enabled).length} hint="scheduled" cls={styles.ok}/>
            <Kpi label="Paused" value={reports.filter(r=>!r.enabled).length} hint="disabled"/>
            <Kpi label="Last run" value={reports.filter(r=>r.lastRunAt).length} hint="have run at least once"/>
          </div>
          {reports.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Report title</th><th>Cadence</th><th>Status</th><th>Last run</th><th>Created</th></tr></thead>
                <tbody>
                  {reports.map(r=>(
                    <tr key={r.id}>
                      <td><strong>{r.title}</strong></td>
                      <td><span className={styles.muted}>{r.cadence}</span></td>
                      <td><span className={`${styles.status} ${r.enabled?styles.statusOk:styles.statusNeutral}`}>{r.enabled?'Active':'Paused'}</span></td>
                      <td>{r.lastRunAt?new Date(r.lastRunAt).toLocaleString():'Never'}</td>
                      <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className={styles.planned}><h3>No scheduled reports</h3><p>This client has not set up any reports yet. Reports are configured from their Work Console → Reports page.</p></div>}
        </div>
      )}

      {/* ── AUTOMATION / AGENTS ── */}
      {!loading && tab==='agents' && (
        <div>
          <div className={styles.grid4} style={{marginBottom:12}}>
            <Kpi label="Total agents" value={agents.length} hint="defined"/>
            <Kpi label="Active" value={agents.filter(a=>a.isActive&&!a.isPaused).length} hint="running" cls={styles.ok}/>
            <Kpi label="Paused" value={agents.filter(a=>a.isPaused).length} hint="temporarily off"/>
            <Kpi label="Executions" value={agents.reduce((n,a)=>n+a.executionCount,0)} hint="all time"/>
          </div>
          {agents.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Agent name</th><th>Trigger</th><th>Status</th><th>Executions</th><th>Success</th><th>Last run</th></tr></thead>
                <tbody>
                  {agents.map(a=>(
                    <tr key={a.id}>
                      <td>
                        <strong>{a.name}</strong>
                        {a.description&&<><br/><span className={styles.muted} style={{fontSize:10}}>{a.description}</span></>}
                      </td>
                      <td><span className={styles.muted}>{a.trigger}</span></td>
                      <td>
                        <span className={`${styles.status} ${a.isActive&&!a.isPaused?styles.statusOk:a.isPaused?styles.statusNeutral:styles.statusBad}`}>
                          {a.isPaused?'Paused':a.isActive?'Active':'Inactive'}
                        </span>
                      </td>
                      <td>{a.executionCount}</td>
                      <td className={a.successCount<a.executionCount?styles.warn:''}>{a.successCount}</td>
                      <td>{a.lastExecutedAt?new Date(a.lastExecutedAt).toLocaleString():'Never'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className={styles.planned}><h3>No automation agents</h3><p>This client has not created any Ellinea Agents yet. Agents are configured from their Work Console → Automation page.</p></div>}
        </div>
      )}

      {/* ── AUDIT ── */}
      {!loading && tab==='audit' && (
        <div className={styles.card}>
          <CardTitle title="Client audit log" hint={`Activity log for ${org?.name??'this client'}.`}/>
          <div style={{display:'flex',gap:8,marginBottom:12}}>
            <button className={`${styles.button} ${styles.primary}`} onClick={()=>void onLoadAudit()}>Load audit log</button>
            <span className={styles.muted}>{auditTotal} events total</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th></tr></thead>
              <tbody>
                {audit.map(a=>(
                  <tr key={a.id}>
                    <td>{new Date(a.createdAt).toLocaleString()}</td>
                    <td>{a.userEmail??'system'}</td>
                    <td>{a.action}</td>
                    <td>{a.resource}</td>
                  </tr>
                ))}
                {!audit.length&&<tr><td colSpan={4} style={{color:'#718096'}}>Click &quot;Load audit log&quot; to fetch events.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SETTINGS ── */}
      {!loading && tab==='settings' && (
        <div>
          <div className={styles.grid2} style={{marginBottom:14}}>
            <div className={styles.card}>
              <CardTitle title="Organization profile" hint="Edit this client organization's display name."/>
              <div className={styles.form} style={{marginTop:8}}>
                <Field label="Organization name" value={editOrgName} set={setEditOrgName} placeholder="Acme Holdings Ltd"/>
                <label className={styles.field}><span>Slug (read-only)</span><input className={styles.input} value={orgProfile?.slug??org?.slug??'—'} disabled/></label>
                <div className={styles.full}><button className={`${styles.button} ${styles.primary}`} disabled={orgNameBusy||!editOrgName.trim()} onClick={async()=>{setOrgNameBusy(true);try{await onSaveOrgName(editOrgName);}catch(e){console.error(e);}finally{setOrgNameBusy(false);}}}>{orgNameBusy?'Saving…':'Save name'}</button></div>
              </div>
            </div>
            <div className={styles.card}>
              <CardTitle title="Service package" hint="Assign a commercial capability tier to this client."/>
              <select className={styles.select} value={tier?.rate_limit_tiers?.id??''} onChange={e=>void onAssignPackage(e.target.value)}>
                <option value="">No package</option>
                {packages.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}
              </select>
              {tier?.rate_limit_tiers&&<div style={{marginTop:10}}><Service title={packages.find(p=>p.id===tier.rate_limit_tiers?.id)?.display_name??'Current package'} text={`${packages.find(p=>p.id===tier.rate_limit_tiers?.id)?.requests_per_day?.toLocaleString()??'—'} req/day`}/></div>}
            </div>
          </div>
          <div className={styles.grid2}>
            <div className={styles.card}>
              <CardTitle title="Date & time preferences" hint="Controls how dates and times display in this client's Work Console."/>
              <div className={styles.form} style={{marginTop:8}}>
                <label className={styles.field}><span>Time format</span><select className={styles.select} value={settings.timeFormat} onChange={e=>onSettingsChange({...settings,timeFormat:e.target.value as '12h'|'24h'})}><option value="12h">12-hour (3:45 PM)</option><option value="24h">24-hour (15:45)</option></select></label>
                <label className={styles.field}><span>Date style</span><select className={styles.select} value={settings.dateStyle} onChange={e=>onSettingsChange({...settings,dateStyle:e.target.value as import('@/lib/api').OrgDateTimeSettingsDto['dateStyle']})}><option value="short">Short (9/21/2026)</option><option value="medium">Medium (Sep 21, 2026)</option><option value="log">Log (2026-09-21)</option></select></label>
                <div className={styles.full}><button className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={()=>void onSaveSettings()}>Save date & time</button></div>
              </div>
            </div>
            <div className={styles.card}>
              <CardTitle title="Organization stats" hint="Current usage for this client org."/>
              <Service title="Registered" text={org?new Date(org.createdAt).toLocaleDateString():'—'}/>
              <Service title="Users" text={`${stats?.stats?.totalUsers??0} total, ${stats?.stats?.activeUsers??0} active`}/>
              <Service title="Connectors" text={`${installations.length} installed, ${installations.filter(c=>c.status==='synced').length} synced`}/>
              <Service title="Documents" text={`${documents.length} uploaded`}/>
              <Service title="Rules" text={`${rules.length} defined, ${rules.filter(r=>r.enabled).length} active`}/>
              <Service title="Agents" text={`${agents.length} agents, ${agents.filter(a=>a.isActive&&!a.isPaused).length} running`}/>
            </div>
          </div>
        </div>
      )}
      {!loading && tab==='lifecycle' && org && (
        <div className={styles.grid2}>
          <div className={styles.card}>
            <CardTitle title="Tenant lifecycle" hint="Control this client organization's access to EIP services."/>
            <Service title="Current status" text={org.status}/>
            <Service title="Registered" text={new Date(org.createdAt).toLocaleDateString()}/>
            <Service title="Total users" text={String(org.userCount)}/>
            <Service title="Service package" text={packages.find(p=>p.id===tier?.rate_limit_tiers?.id)?.display_name??'None assigned'}/>
            <div style={{marginTop:16,display:'flex',gap:8,flexWrap:'wrap'}}>
              <button className={`${styles.button} ${org.status==='active'?styles.danger:styles.success}`} disabled={busy} onClick={()=>onToggle(org)}>
                {org.status==='active'?'Disconnect / Suspend':'Reconnect'}
              </button>
            </div>
            <p className={styles.cardHint} style={{marginTop:10}}>Disconnect is reversible. Data is preserved. Reconnect restores access immediately.</p>
          </div>
          <div className={styles.card}>
            <CardTitle title="Status notes" hint="What each state means for this client."/>
            <Service title="Active" text="Client has full access to their EIP Work Console and all configured connectors."/>
            <Service title="Disconnected" text="Client login is blocked. Data is preserved. No integrations run. Reconnect at any time."/>
            <Service title="Hard delete" text="Not available from this interface. Contact a platform engineer for irreversible removal."/>
          </div>
        </div>
      )}
    </div>
  );
}

// useSearchParams() requires a Suspense boundary in the Next.js App Router.
export default function PlatformPage() {
  return (
    <Suspense fallback={<div style={{padding:24,color:'#8795aa'}}>Loading platform…</div>}>
      <PlatformSuperAdminPage />
    </Suspense>
  );
}
