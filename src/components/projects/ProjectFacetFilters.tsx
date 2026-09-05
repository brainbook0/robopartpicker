import { SlidersHorizontal, X } from "lucide-react";
import { useEffect } from "react";
import type { ProjectCatalogFacets } from "@/lib/projects";
import { ROBOT_CATEGORIES, ROBOT_CATEGORY_LABELS } from "@/shared/robotCategory";

type Props = {
  params: URLSearchParams;
  facets: ProjectCatalogFacets | null;
  activeCount: number;
  mobileOpen: boolean;
  setMobileOpen: (value: boolean) => void;
  setParam: (key: string, value: string | null) => void;
  resetDefault: () => void;
  browseAll: () => void;
};

export function ProjectFacetFilters(props: Props) {
  const { mobileOpen, setMobileOpen } = props;
  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobileOpen, setMobileOpen]);

  return <>
    <aside aria-label="Project filters" className="hidden lg:block"><FilterContent {...props} /></aside>
    {props.mobileOpen && <div className="fixed inset-0 z-50 bg-black/45 lg:hidden" onMouseDown={() => props.setMobileOpen(false)}>
      <aside role="dialog" aria-modal="true" aria-label="Filter projects" className="ml-auto h-full w-[min(92vw,390px)] overflow-y-auto bg-background p-4 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 font-semibold"><SlidersHorizontal className="h-4 w-4 text-primary" />Filters ({props.activeCount})</div><button type="button" className="btn-ghost btn-sm" aria-label="Close filters" onClick={() => props.setMobileOpen(false)}><X className="h-4 w-4" /></button></div>
        <FilterContent {...props} />
      </aside>
    </div>}
  </>;
}

function FilterContent({ params, facets, setParam, resetDefault, browseAll }: Props) {
  const count = (group: keyof ProjectCatalogFacets, key: string) => facets?.[group]?.[key];
  return <div className="surface-card divide-y divide-border overflow-hidden">
    <div className="flex gap-2 p-3"><button type="button" className="btn-primary btn-sm flex-1 justify-center" onClick={resetDefault}>Physical humanoids</button><button type="button" className="btn-ghost btn-sm flex-1 justify-center" onClick={browseAll}>Browse all</button></div>
    <FacetSection title="Source type">
      {[['open','Open source'],['commercial','Commercial'],['licensed','Licensed source'],['unclear','License unclear']].map(([value,label]) => <FacetButton key={value} active={params.get('source')===value} label={label} count={count('sources',value)} onClick={() => setParam('source',params.get('source')===value?null:value)} />)}
    </FacetSection>
    <FacetSection title="Robot category">
      {ROBOT_CATEGORIES.map((value) => <FacetButton key={value} active={params.get('category')===value} label={ROBOT_CATEGORY_LABELS[value]} count={count('categories',value)} onClick={() => setParam('category',params.get('category')===value?null:value)} />)}
    </FacetSection>
    <FacetSection title="Estimated build cost">
      <div className="grid grid-cols-2 gap-2"><MoneyInput label="Minimum" value={params.get('priceMin')??''} onCommit={(value)=>setParam('priceMin',value)} /><MoneyInput label="Maximum" value={params.get('priceMax')??''} onCommit={(value)=>setParam('priceMax',value)} /></div>
      <div className="mt-2 grid grid-cols-2 gap-1">{[['1000','Under $1k'],['5000','Under $5k'],['10000','Under $10k'],['25000','Under $25k']].map(([value,label])=><button type="button" key={value} className={`border px-2 py-1 text-left text-[10px] ${params.get('priceMax')===value?'border-primary bg-primary/10':'border-border'}`} onClick={()=>setParam('priceMax',params.get('priceMax')===value?null:value)}>{label}</button>)}</div>
    </FacetSection>
    <FacetSection title="BOM evidence">
      {[['verified','Verified BOM'],['partial','Partial BOM'],['unavailable','Not published'],['manufacturer_unavailable','Manufacturer unavailable'],['not_applicable','Not applicable']].map(([value,label]) => <FacetButton key={value} active={params.get('bomState')===value} label={label} count={count('bomStates',value)} onClick={()=>setParam('bomState',params.get('bomState')===value?null:value)} />)}
      <NumberInput label="Minimum BOM lines" value={params.get('bomLinesMin')??''} onCommit={(value)=>setParam('bomLinesMin',value)} />
    </FacetSection>
    <FacetSection title="Build evidence">
      <FacetButton active={params.get('build')==='started'} label="Build started" onClick={()=>setParam('build',params.get('build')==='started'?null:'started')} />
      <FacetButton active={params.get('build')==='verified'} label="Independently verified" onClick={()=>setParam('build',params.get('build')==='verified'?null:'verified')} />
    </FacetSection>
    <FacetSection title="Difficulty">
      {['beginner','intermediate','advanced','expert'].map((value)=><FacetButton key={value} active={params.get('difficulty')===value} label={capitalize(value)} count={count('difficulties',value)} onClick={()=>setParam('difficulty',params.get('difficulty')===value?null:value)} />)}
    </FacetSection>
    <FacetSection title="Software and artifacts">
      {[['ros','supported','ROS supported'],['hasMedia','true','Has project media'],['hasCad','true','Has CAD'],['hasAssembly','true','Has assembly guide'],['hasOfficialSource','true','Has official source']].map(([key,value,label])=><FacetButton key={key} active={params.get(key)===value} label={label} onClick={()=>setParam(key,params.get(key)===value?null:value)} />)}
    </FacetSection>
    <FacetSection title="Verification freshness">
      {[['30','Within 30 days'],['90','Within 90 days'],['365','Within one year']].map(([value,label])=><FacetButton key={value} active={params.get('verifiedWithinDays')===value} label={label} onClick={()=>setParam('verifiedWithinDays',params.get('verifiedWithinDays')===value?null:value)} />)}
    </FacetSection>
  </div>;
}

function FacetSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="p-3"><h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</h2><div className="space-y-1">{children}</div></section>; }
function FacetButton({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) { return <button type="button" aria-pressed={active} onClick={onClick} className={`flex w-full items-center justify-between gap-2 border px-2 py-1.5 text-left text-[11px] ${active?'border-primary bg-primary/10 text-foreground':'border-transparent hover:bg-muted'}`}><span>{label}</span>{count!=null&&<span className="font-mono text-[9px] text-muted-foreground">{count.toLocaleString()}</span>}</button>; }
function MoneyInput({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string|null)=>void }) { return <label className="text-[9px] uppercase text-muted-foreground">{label}<div className="mt-1 flex border border-input bg-background"><span className="px-2 py-1 text-xs">$</span><input key={value} defaultValue={value} inputMode="numeric" aria-label={`${label} price`} className="min-w-0 flex-1 bg-transparent px-1 text-xs outline-none" onBlur={(e)=>onCommit(cleanInt(e.target.value))} onKeyDown={(e)=>{if(e.key==='Enter')e.currentTarget.blur();}} /></div></label>; }
function NumberInput({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string|null)=>void }) { return <label className="mt-2 block text-[9px] uppercase text-muted-foreground">{label}<input key={value} defaultValue={value} inputMode="numeric" aria-label={label} className="mt-1 h-8 w-full border border-input bg-background px-2 text-xs outline-none" onBlur={(e)=>onCommit(cleanInt(e.target.value))} onKeyDown={(e)=>{if(e.key==='Enter')e.currentTarget.blur();}} /></label>; }
function cleanInt(value: string): string|null { const cleaned=value.replace(/[^0-9]/gu,'').replace(/^0+(?=\d)/u,''); return cleaned||null; }
function capitalize(value:string){return value.charAt(0).toUpperCase()+value.slice(1);}
