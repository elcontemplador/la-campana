// Personajes originales y mapa Natural Earth: recursos locales, sin peticiones remotas.
import {MAP_POSITIONS} from './geography.mjs';
export const PARTY_COLORS = Object.freeze({P1:'#2563B8',P2:'#C33B48',P3:'#D97314',P4:'#E3BC20',R1:'#8541AA',R2:'#287D49'});
export const PARTY_SHORT = Object.freeze({P1:'AZ',P2:'RO',P3:'NA',P4:'AM',R1:'MO',R2:'VE'});
function colorLuminance(color){
  const hex=/^#[0-9a-f]{6}$/i.test(color||'')?color:'#666666';
  const values=[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return values[0]*.2126+values[1]*.7152+values[2]*.0722;
}
export function colorInk(color){
  const luminance=colorLuminance(color),dark=colorLuminance('#1E1E20');
  return (luminance+.05)/(dark+.05)>1.05/(luminance+.05)?'#1E1E20':'#FFFFFF';
}
export function readableColor(color){
  return 1.05/(colorLuminance(color)+.05)>=4.5?color:'#1E1E20';
}
function xmlText(value){
  return String(value||'').replace(/[<>&"']/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[char]));
}
const faces = [
  {skin:'#c48b61',hair:'#382c29',shirt:'#315b70',style:0},
  {skin:'#e8b591',hair:'#443631',shirt:'#943c61',style:1},
  {skin:'#926546',hair:'#24292c',shirt:'#237163',style:2},
  {skin:'#e3c2a5',hair:'#7a5d47',shirt:'#8a681c',style:3},
  {skin:'#b98362',hair:'#352c34',shirt:'#70539c',style:4},
  {skin:'#efc6a5',hair:'#6f4937',shirt:'#ad492d',style:5}
];
export function portrait(id='portrait-1', variant='candidate', mood='confident', partyColor=null,partyMark='') {
  const n = variant==='staff' ? ({S1:3,S2:0,S3:1,S4:4}[id] ?? 0) : Math.max(0,Math.min(5,Number(String(id).split('-').pop())-1 || 0));
  const f=faces[n];
  const expression={
    confident:{brows:'M42 54Q47 50 52 53M67 53Q73 50 77 54',mouth:'M47 75Q59 88 72 74'},
    focused:{brows:'M42 54L52 54M67 54L77 54',mouth:'M50 78Q60 81 70 78'},
    determined:{brows:'M42 51L52 55M67 55L77 51',mouth:'M50 79L70 77'},
    thinking:{brows:'M42 54L51 52M67 49Q73 46 78 50',mouth:'M50 79Q58 75 69 79'},
    strained:{brows:'M42 51L52 54M67 54L77 51',mouth:'M50 81Q60 74 70 80'},
    delighted:{brows:'M42 52Q47 48 52 52M67 52Q73 48 77 52',mouth:'M46 74Q59 93 73 73Z'},
    concerned:{brows:'M42 52L52 49M67 49L77 52',mouth:'M49 82Q59 76 71 82'},
  }[mood]||{brows:'M43 55L50 54M68 54L75 55',mouth:'M49 77Q59 83 70 75'};
  const hair=[
    '<path d="M29 60Q25 22 58 24Q91 25 88 59L79 43Q48 53 35 43Z"/>',
    '<path d="M27 77V52Q25 21 58 21Q92 23 91 56L94 83L81 86V48Q57 49 38 36L36 85Z"/>',
    '<path d="M28 55Q24 24 58 22Q90 21 90 54L79 42Q65 37 57 42Q47 35 35 48Z"/>',
    '<path d="M30 50Q27 21 58 22Q87 21 87 48L77 37Q51 42 34 38Z"/>',
    '<path d="M27 76Q14 54 29 28Q52 9 75 26Q99 33 90 76L82 74V48Q57 54 34 38V75Z"/>',
    '<path d="M29 57Q23 20 57 21Q91 18 88 54L77 38Q60 45 35 38Z"/>'
  ][f.style];
  return `<svg viewBox="0 0 120 130" fill="none" aria-hidden="true" focusable="false"><rect width="120" height="130" rx="24" fill="#e8e2d4"/><circle cx="89" cy="30" r="21" fill="#f7f3eb"/><path d="M11 130V116Q18 93 46 93H72Q101 95 109 117V130Z" fill="${partyColor||f.shirt}"/><path d="M48 80H72V98L60 110L48 98Z" fill="${f.skin}"/><path d="M48 85Q61 96 72 84V92Q60 101 48 92Z" fill="#282626" opacity=".12"/><g fill="${f.hair}">${hair}</g><ellipse cx="32" cy="62" rx="6" ry="9" fill="${f.skin}"/><ellipse cx="85" cy="62" rx="6" ry="9" fill="${f.skin}"/><path d="M33 45Q59 24 84 46V67Q81 88 59 91Q36 85 33 65Z" fill="${f.skin}"/><g stroke="#3a302e" stroke-width="2" stroke-linecap="round"><path d="${expression.brows}"/><path d="M59 58L57 68L61 69" opacity=".4"/><path d="${expression.mouth}"/></g><g fill="#332b28"><circle cx="47" cy="60" r="2.4"/><circle cx="72" cy="60" r="2.4"/></g>${f.style===3?'<g stroke="#5a534c" stroke-width="2"><rect x="36" y="53" width="21" height="15" rx="6"/><rect x="64" y="53" width="21" height="15" rx="6"/><path d="M57 59H64"/></g>':''}<path d="M43 95L58 110L49 115L35 100M77 95L61 110L70 115L85 100" fill="#fff" opacity=".83"/>${partyColor?`<circle cx="91" cy="114" r="10" fill="${partyColor}" stroke="#FFFFFF" stroke-width="2.5"/><text x="91" y="117" text-anchor="middle" fill="${colorInk(partyColor)}" font-family="system-ui,sans-serif" font-size="8.5" font-weight="800">${xmlText(partyMark)}</text>`:''}</svg>`;
}
export function campaignIllustration(palette=PARTY_COLORS) {
  const face=(id,mood,color,width)=>portrait(id,'candidate',mood,color).replace('<svg ',`<svg width="${width}" height="${Math.round(width*130/120)}" `);
  const paletteColors={...PARTY_COLORS,...palette};
  const {P1:blue,P2:red,P3:purple,P4:green,R1:orange,R2:yellow}=paletteColors;
  const tiles=[['68','99',yellow],['137','86',blue],['206','81',red],['275','94',green],['344','119',purple],['99','166',blue],['169','154',orange],['239','158',green],['309','180',red],['380','190',blue],['130','234',purple],['202','230',blue],['274','246',yellow],['347','263',green]];
  return `<svg viewBox="0 0 610 470" fill="none" aria-hidden="true" focusable="false"><ellipse cx="320" cy="419" rx="263" ry="30" fill="#243c4520"/><path d="M36 189L362 74L590 224L302 415L36 283Z" fill="#4f6970"/><path d="M36 171L358 61L590 210L302 396L36 266Z" fill="#dce4dc" stroke="#647f7b" stroke-width="2"/><path d="M40 265L303 396L590 210" stroke="#fbfff5" stroke-width="3"/><g transform="translate(18 61) rotate(-5 230 180)">${tiles.map(([x,y,color],index)=>`<g transform="translate(${x} ${y})"><path d="M0 0H57L63 7V55L56 62H0L-6 55V7Z" fill="${color}" stroke="#f6f8e9" stroke-width="2"/><path d="M-6 55L0 62H56L63 55V62L56 69H0L-6 62Z" fill="#1e404954"/><circle cx="28" cy="29" r="${index%3===0?9:6}" fill="#fff" opacity=".82"/></g>`).join('')}</g><path d="M105 173C150 161 178 170 217 220S302 297 377 239" stroke="#f7f3d8" stroke-width="5" stroke-dasharray="8 9" stroke-linecap="round"/><g transform="translate(19 37) rotate(-6 60 65)"><rect x="-5" y="-5" width="130" height="140" rx="28" fill="#1e384522"/>${face('portrait-4','thinking',yellow,120)}<path d="M55 132L67 148L79 132" fill="${yellow}"/></g><g transform="translate(389 27) rotate(6 85 92)"><rect x="-7" y="-7" width="182" height="196" rx="29" fill="#2c4853"/>${face('portrait-1','confident',blue,168)}<path d="M66 184L85 210L104 184" fill="${blue}"/></g><g transform="translate(287 277) rotate(-5 64 68)"><rect x="-5" y="-5" width="130" height="140" rx="28" fill="#1e384522"/>${face('portrait-3','determined',green,120)}<path d="M48 132L61 149L75 132" fill="${green}"/></g><g transform="translate(91 354) rotate(-8)"><rect width="126" height="40" rx="13" fill="#fcfaf4" stroke="#b8b9a9"/><path d="M16 14V27H23V14M28 18V27H35V18M40 10V27H47V10" stroke="#315b70" stroke-width="3"/><text x="65" y="25" fill="#315b70" font-family="system-ui,sans-serif" font-size="14" font-weight="700">+1 escaño</text></g><g transform="translate(351 2)"><rect width="103" height="34" rx="17" fill="#fcfaf4"/><text x="51" y="22" text-anchor="middle" fill="#315b70" font-family="system-ui,sans-serif" font-size="12" font-weight="700">TU CAMPAÑA</text></g></svg>`;
}
export function actionIcon(id){
  const shapes={
    visit:'<path d="M12 22s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
    interview:'<rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
    rehearse:'<path d="M4 4h16v12H9l-5 4V4Z"/><path d="M8 8h8M8 12h5"/>',
    rest:'<path d="M21 14.5A9.5 9.5 0 0 1 9.5 3 9.5 9.5 0 1 0 21 14.5Z"/>',
    fundraise:'<circle cx="12" cy="12" r="9"/><path d="M15 7h-4a2.5 2.5 0 0 0 0 5h2a2.5 2.5 0 0 1 0 5H9M12 5v14"/>',
    contrast:'<path d="M3 3h8v8H6l-3 3V3ZM13 11h8v10l-3-3h-5v-7ZM14 3l7 5M3 18l7 4"/>',
    organize:'<path d="M3 10 12 3l9 7M5 9v12h14V9M9 21v-7h6v7"/><path d="M14 3v6l5-2V3h-5Z"/>',
    research:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 12V9M10 12V7M13 12V5"/>',
    outreach:'<circle cx="8" cy="7" r="3"/><circle cx="18" cy="8" r="2"/><path d="M2 21v-4a6 6 0 0 1 12 0v4M16 14h1a5 5 0 0 1 5 5v2"/>',
    prepare:'<path d="M8 4H5v18h14V4h-3"/><rect x="8" y="2" width="8" height="5" rx="2"/><path d="m8 14 3 3 5-6"/>',
    mediate:'<path d="M2 9h8v6H2ZM14 9h8v6h-8ZM10 12h4M6 9V5h12v4M6 15v4h12v-4"/>',
    wait:'<path d="M4 9h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9ZM17 10h2a3 3 0 0 1 0 6h-2M7 2v3M12 2v3"/>',
    advertise:'<path d="M3 9h5l12-5v16L8 15H3V9ZM8 15l2 7H6l-2-7M8 9v6"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes[id]||shapes.rehearse}</svg>`;
}
export function boardBackdrop(){
  return '<img class="board-backdrop" src="assets/spain-map.svg" alt="" aria-hidden="true" draggable="false">';
}
// A static campaign vignette: action props make the move recognisable without a sequence.
export function actionScene({actionId='visit',face='',color='#315b70',mark='',rivalFace='',rivalColor='#C33B48'}={}) {
  const safeColor=/^#[0-9a-f]{6}$/i.test(color)?color:'#315b70';
  const safeRival=/^#[0-9a-f]{6}$/i.test(rivalColor)?rivalColor:'#C33B48';
  const actor=face.replace('<svg ','<svg x="0" y="0" width="150" height="162" ');
  const props={
    visit:`<path d="M128 129h105M145 102h65l-7 35h-51Z" fill="${safeColor}"/><path d="M146 102v-4h64v4M177 97V80l12-8" stroke="#244a5b" stroke-width="3"/><circle cx="223" cy="72" r="10" fill="#e2ae87"/><path d="M208 113V97q15-13 30 0v16" fill="#e2b749"/><circle cx="131" cy="79" r="9" fill="#9b694c"/><path d="M117 115v-20q14-11 28 0v20" fill="#538176"/><path d="M232 44V18l22 6-22 7" fill="${safeColor}" stroke="${safeColor}" stroke-width="3"/><circle cx="177" cy="120" r="10" fill="#fff"/><text x="177" y="123" text-anchor="middle" fill="${colorInk('#ffffff')}" font-family="system-ui,sans-serif" font-size="8" font-weight="800">${xmlText(mark)}</text>`,
    interview:'<rect x="133" y="28" width="81" height="53" rx="7" fill="#344f5e"/><circle cx="174" cy="54" r="18" fill="#83c2c7"/><circle cx="174" cy="54" r="9" fill="#224755"/><path d="m214 40 25-9v46l-25-10M174 82v33m-19 19 19-19 19 19" stroke="#344f5e" stroke-width="6" fill="#344f5e"/><rect x="111" y="109" width="105" height="10" rx="4" fill="#b2936f"/><path d="M128 109V92" stroke="#344f5e" stroke-width="3"/><rect x="122" y="77" width="12" height="19" rx="6" fill="#344f5e"/><circle cx="231" cy="17" r="6" fill="#bc3c47"/>',
    fundraise:`<rect x="134" y="82" width="90" height="52" rx="8" fill="${safeColor}"/><path d="M146 92h65" stroke="#f5e7b9" stroke-width="4"/><g fill="#e1ba48" stroke="#967333" stroke-width="2"><ellipse cx="166" cy="64" rx="17" ry="7"/><path d="M149 53v11m34-11v11"/><ellipse cx="166" cy="53" rx="17" ry="7"/><ellipse cx="202" cy="41" rx="13" ry="13"/></g><path d="M221 45q23 20-8 28m0-9v9h10" stroke="#47766d" stroke-width="4" fill="none"/><text x="177" y="118" text-anchor="middle" fill="${colorInk(safeColor)}" font-family="system-ui,sans-serif" font-size="23" font-weight="700">+</text>`,
    rest:'<path d="M136 78v35h75V78M133 113h82M148 113v21m51-21v21" stroke="#597666" stroke-width="9"/><rect x="216" y="105" width="40" height="9" rx="4" fill="#b09571"/><path d="M222 77h20v20h-20Z" fill="#f4ead7" stroke="#567975" stroke-width="2"/><path d="M242 80h6a7 7 0 0 1 0 13h-6M227 69v-9m9 9v-9" stroke="#567975" stroke-width="2" fill="none"/><path d="M154 45h20l-20 19h20" stroke="#567975" stroke-width="3" fill="none"/>',
    rehearse:'<rect x="135" y="27" width="93" height="91" rx="7" fill="#f5edda" stroke="#738883" stroke-width="2"/><path d="M153 47h54m-54 16h45m-45 16h30m-30 16h50" stroke="#708d89" stroke-width="4"/><path d="m208 113 21-23 8 8-23 23-12 3Z" fill="#c29343"/>',
  };
  const rival=rivalFace?rivalFace.replace('<svg ','<svg x="161" y="27" width="80" height="87" '):'';
  const contrast=`${rival}<path d="M106 32h42v25h-22l-10 10v-10h-10Z" fill="${safeColor}"/><path d="M132 87h33v23h-19l-7 9v-9h-7Z" fill="${safeRival}"/><path d="m124 39 6 12 7-12" stroke="#fff" stroke-width="2" fill="none"/>`;
  return `<svg class="action-scene" viewBox="0 0 270 150" fill="none" aria-hidden="true" focusable="false"><rect width="270" height="150" rx="18" fill="#eee9dc"/><circle cx="228" cy="23" r="48" fill="#f8f4e8"/><ellipse cx="130" cy="135" rx="112" ry="8" fill="#314d5b14"/>${actor}${actionId==='contrast'?contrast:props[actionId]||props.rehearse}</svg>`;
}

export function hemicycle(seats, ids=['P1','P2','P3','P4','R1','R2'],palette=PARTY_COLORS,{votes=null,totals=null,actual=false}={}) {
  const places=ids.flatMap(id=>Array.from({length:Math.max(0,Math.min(350,Number(seats[id]||0)))},()=>({color:palette[id]||'#777777',vote:votes?.[id]})));
  let index=0;
  const rows=[42,47,54,61,69,77];
  const dots=rows.flatMap((count,row)=>Array.from({length:count},(_,i)=>{
    const a=Math.PI-(Math.PI*i/(count-1));const r=120+row*26;
    const x=(310+r*Math.cos(a)).toFixed(2),y=(270-r*Math.sin(a)).toFixed(2);
    const place=places[index++],color=place?.color||'#d3d0c6';
    const ring=({yes:'#276149',no:'#993c43',abstain:'#75786b'})[place?.vote];
    return `${ring?`<circle cx="${x}" cy="${y}" r="5.3" fill="none" stroke="${ring}" stroke-width="1.25" ${place.vote==='abstain'?'stroke-dasharray="2 2"':''}/>`:''}<circle cx="${x}" cy="${y}" r="3.5" fill="${color}" stroke="${1.05/(colorLuminance(color)+.05)<3?'#626262':color}" stroke-width=".55"/>`;
  })).join('');
  return `<svg class="hemicycle ${votes?'vote-hemicycle':''}" viewBox="0 0 620 294" aria-hidden="true" focusable="false">${dots}<text x="310" y="236" text-anchor="middle" fill="#272a27" font-family="Georgia,serif" font-size="${votes?'31':'44'}">${votes?xmlText((totals?.yes??0)+' síes'):'350'}</text><text x="310" y="264" text-anchor="middle" fill="#676b61" font-family="system-ui,sans-serif" font-size="14">${votes?actual?'votos registrados':'voto previsto de cada escaño':'escaños en juego'}</text></svg>`;
}
export const TILE_POSITIONS=MAP_POSITIONS;
export const TILE_NAMES=Object.freeze({'01':'Álava','02':'Albac.','03':'Alicant.','04':'Almería','05':'Ávila','06':'Badajoz','07':'Balears','08':'Barna.','09':'Burgos','10':'Cáceres','11':'Cádiz','12':'Castell.','13':'C. Real','14':'Córdoba','15':'Coruña','16':'Cuenca','17':'Girona','18':'Granada','19':'Guadal.','20':'Gipuzk.','21':'Huelva','22':'Huesca','23':'Jaén','24':'León','25':'Lleida','26':'Rioja','27':'Lugo','28':'Madrid','29':'Málaga','30':'Murcia','31':'Navarra','32':'Ourense','33':'Asturias','34':'Palencia','35':'L. Palmas','36':'Pontev.','37':'Salam.','38':'Tenerife','39':'Cantab.','40':'Segovia','41':'Sevilla','42':'Soria','43':'Tarrag.','44':'Teruel','45':'Toledo','46':'Valencia','47':'Vallad.','48':'Bizkaia','49':'Zamora','50':'Zarago.','51':'Ceuta','52':'Melilla'});
